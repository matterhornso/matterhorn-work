#!/usr/bin/env node
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  appendFile,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const requireFromServer = createRequire(new URL("../apps/server/package.json", import.meta.url));
const Database = requireFromServer("better-sqlite3");

const ARCHIVE_VERSION = "matterhorn.user-data-backup.v1";
const REPORT_VERSION = "matterhorn.user-data-recovery-report.v1";
const MAGIC = Buffer.from("MHDBK01\n", "ascii");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const DEFAULT_PASSPHRASE_ENV = "MATTERHORN_BACKUP_PASSPHRASE";
const COMPLETE_COVERAGE = Object.freeze({
  notes: true,
  memory: true,
  outputs: true,
  taskAndEvidenceState: true,
  chatHistory: true,
});

function parseArgs(argv) {
  const config = {
    mode: "backup",
    workspaceRoot: "",
    opencodeDb: "",
    output: "",
    archive: "",
    restoreTo: "",
    confirmRestoreTo: "",
    passphraseEnv: DEFAULT_PASSPHRASE_ENV,
    jsonOutput: "",
    json: false,
    force: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--backup") config.mode = "backup";
    else if (arg === "--restore") config.mode = "restore";
    else if (arg === "--workspace-root") config.workspaceRoot = next();
    else if (arg === "--opencode-db") config.opencodeDb = next();
    else if (arg === "--output") config.output = next();
    else if (arg === "--archive") config.archive = next();
    else if (arg === "--restore-to") config.restoreTo = next();
    else if (arg === "--confirm-restore-to") config.confirmRestoreTo = next();
    else if (arg === "--passphrase-env") config.passphraseEnv = next();
    else if (arg === "--json-output") config.jsonOutput = next();
    else if (arg === "--json") config.json = true;
    else if (arg === "--force") config.force = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else if (arg === "--passphrase") throw new Error("Passphrases must be supplied through an environment variable, never a command-line argument.");
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return config;
}

function help() {
  return [
    "Matterhorn encrypted user-data backup and recovery",
    "",
    "Backs up workspace Notes, Memory, Outputs, task/evidence state, and an online-consistent OpenCode chat database snapshot.",
    "The passphrase is read only from MATTERHORN_BACKUP_PASSPHRASE (or --passphrase-env) and is never written to the archive or report.",
    "",
    "Backup:",
    "  MATTERHORN_BACKUP_PASSPHRASE='...' pnpm backup:workspace-user-data -- --workspace-root /project --opencode-db /data/opencode.db --output /backups/project.mhdb --json-output report.json",
    "",
    "Restore drill into a new, separate directory:",
    "  MATTERHORN_BACKUP_PASSPHRASE='...' pnpm backup:workspace-user-data -- --restore --workspace-root /project --archive /backups/project.mhdb --restore-to /tmp/project-restore --confirm-restore-to /tmp/project-restore --json-output restore.json",
    "",
    "Safety:",
    "  Restore refuses an existing target, requires exact target confirmation, rejects symlinks and traversal paths, verifies every SHA-256 digest, and only publishes the target after full verification.",
  ].join("\n");
}

function passphrase(config) {
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(config.passphraseEnv)) {
    throw new Error("--passphrase-env must name an uppercase environment variable.");
  }
  const value = process.env[config.passphraseEnv] ?? "";
  if (value.length < 16) {
    throw new Error(`${config.passphraseEnv} must contain at least 16 characters.`);
  }
  return value;
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function ensureSafeRelativePath(value) {
  if (
    !value
    || isAbsolute(value)
    || value.includes("\\")
    || value.includes("\0")
    || posix.normalize(value) !== value
    || value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Unsafe archive path: ${value || "<empty>"}`);
  }
  return value;
}

function ensureWithinRoot(root, target) {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${sep}`)) {
    throw new Error(`Path escapes the recovery root: ${target}`);
  }
  return targetPath;
}

function pathsOverlap(left, right) {
  const leftPath = resolve(left);
  const rightPath = resolve(right);
  return (
    leftPath === rightPath
    || leftPath.startsWith(`${rightPath}${sep}`)
    || rightPath.startsWith(`${leftPath}${sep}`)
  );
}

async function canonicalFuturePath(target) {
  const suffix = [];
  let existingAncestor = resolve(target);
  while (!(await pathExists(existingAncestor))) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) {
      throw new Error(`Could not resolve an existing parent for restore target: ${target}`);
    }
    suffix.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }
  return resolve(await realpath(existingAncestor), ...suffix);
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function collectFiles(sourceRoot, sourcePath, archivePrefix, kind, output, options = {}) {
  if (!(await pathExists(sourcePath))) return;
  const sourceStat = await lstat(sourcePath);
  if (sourceStat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in backups: ${sourcePath}`);
  if (!sourceStat.isDirectory()) throw new Error(`Backup source must be a directory: ${sourcePath}`);

  const entries = await readdir(sourcePath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const child = join(sourcePath, entry.name);
    const childRelative = relative(sourceRoot, child).split(sep).join("/");
    if (options.exclude?.(childRelative, entry)) continue;
    const archivePath = ensureSafeRelativePath(`${archivePrefix}/${childRelative}`);
    const childStat = await lstat(child);
    if (childStat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in backups: ${child}`);
    if (childStat.isDirectory()) {
      await collectFiles(sourceRoot, child, archivePrefix, kind, output, options);
      continue;
    }
    if (!childStat.isFile()) throw new Error(`Unsupported backup entry: ${child}`);
    output.push({
      sourcePath: child,
      path: archivePath,
      kind,
      size: childStat.size,
      sha256: await sha256File(child),
    });
  }
}

async function snapshotOpencodeDatabase(sourcePath, tempDir) {
  const resolved = resolve(sourcePath);
  if (!(await pathExists(resolved))) throw new Error(`OpenCode database was not found: ${resolved}`);
  const sourceStat = await lstat(resolved);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error("--opencode-db must point to a regular SQLite database file.");
  }
  const snapshotPath = join(tempDir, "opencode-snapshot.db");
  const source = new Database(resolved, { readonly: true, fileMustExist: true });
  try {
    await source.backup(snapshotPath);
  } finally {
    source.close();
  }
  verifySqlite(snapshotPath);
  return snapshotPath;
}

function verifySqlite(path) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const result = database.pragma("quick_check", { simple: true });
    if (result !== "ok") throw new Error(`SQLite quick_check failed: ${String(result)}`);
  } finally {
    database.close();
  }
}

async function archiveEntries(config, tempDir) {
  const workspaceRoot = resolve(config.workspaceRoot);
  if (!(await pathExists(workspaceRoot))) throw new Error(`Workspace root was not found: ${workspaceRoot}`);
  if (!(await lstat(workspaceRoot)).isDirectory()) throw new Error("--workspace-root must point to a directory.");

  const files = [];
  const notesRoot = join(workspaceRoot, "notes");
  const outputsRoot = join(workspaceRoot, "outputs");
  const matterhornRoot = join(workspaceRoot, ".matterhorn-work");
  await collectFiles(notesRoot, notesRoot, "workspace/notes", "notes", files);
  await collectFiles(outputsRoot, outputsRoot, "workspace/outputs", "outputs", files);
  await collectFiles(
    matterhornRoot,
    matterhornRoot,
    "workspace/.matterhorn-work",
    "matterhorn_state",
    files,
    {
      // Restore drills live under .matterhorn-work so they remain scoped to the
      // workspace, but they are QA scratch rather than customer state. They can
      // contain dependency symlinks and must never be copied into user backups.
      exclude: (relativePath) => /^qa-restore-target(?:-|$)/.test(relativePath.split("/")[0] ?? ""),
    },
  );
  const databaseSnapshot = await snapshotOpencodeDatabase(config.opencodeDb, tempDir);
  const databaseStat = await stat(databaseSnapshot);
  files.push({
    sourcePath: databaseSnapshot,
    path: "runtime/opencode.db",
    kind: "chat_history",
    size: databaseStat.size,
    sha256: await sha256File(databaseSnapshot),
  });
  files.sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

async function* bundleChunks(manifest, files) {
  const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error("Backup manifest is too large.");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(manifestBytes.length);
  yield length;
  yield manifestBytes;
  for (const file of files) {
    for await (const chunk of createReadStream(file.sourcePath)) yield chunk;
  }
}

async function writeEncryptedArchive(outputPath, manifest, files, secret, force) {
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  if ((await pathExists(target)) && !force) throw new Error(`Archive already exists: ${target}. Use --force to replace it.`);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = scryptSync(secret, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  try {
    await writeFile(temporary, Buffer.concat([MAGIC, salt, iv]), { mode: 0o600 });
    await pipeline(
      Readable.from(bundleChunks(manifest, files)),
      cipher,
      createWriteStream(temporary, { flags: "a", mode: 0o600 }),
    );
    await appendFile(temporary, cipher.getAuthTag());
    await chmod(temporary, 0o600);
    if (await pathExists(target)) await rm(target, { force: true });
    await rename(temporary, target);
    return target;
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function readArchiveEnvelope(archivePath) {
  const archive = resolve(archivePath);
  const archiveStat = await stat(archive);
  const headerBytes = MAGIC.length + SALT_BYTES + IV_BYTES;
  if (archiveStat.size <= headerBytes + TAG_BYTES + 4) throw new Error("Backup archive is truncated.");
  const handle = await open(archive, "r");
  try {
    const header = Buffer.alloc(headerBytes);
    const tag = Buffer.alloc(TAG_BYTES);
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, archiveStat.size - TAG_BYTES);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Backup archive format is not recognized.");
    return {
      archive,
      size: archiveStat.size,
      salt: header.subarray(MAGIC.length, MAGIC.length + SALT_BYTES),
      iv: header.subarray(MAGIC.length + SALT_BYTES),
      tag,
      ciphertextStart: headerBytes,
      ciphertextEnd: archiveStat.size - TAG_BYTES - 1,
    };
  } finally {
    await handle.close();
  }
}

async function decryptArchive(archivePath, secret, outputPath) {
  const envelope = await readArchiveEnvelope(archivePath);
  const key = scryptSync(secret, envelope.salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, envelope.iv);
  decipher.setAuthTag(envelope.tag);
  try {
    await pipeline(
      createReadStream(envelope.archive, { start: envelope.ciphertextStart, end: envelope.ciphertextEnd }),
      decipher,
      createWriteStream(outputPath, { mode: 0o600 }),
    );
    await chmod(outputPath, 0o600);
  } catch {
    await rm(outputPath, { force: true });
    throw new Error("Backup authentication failed. The passphrase is wrong or the archive was modified.");
  }
}

async function readManifest(bundlePath) {
  const handle = await open(bundlePath, "r");
  try {
    const length = Buffer.alloc(4);
    const lengthRead = await handle.read(length, 0, 4, 0);
    if (lengthRead.bytesRead !== 4) throw new Error("Backup manifest length is missing.");
    const manifestLength = length.readUInt32BE(0);
    if (manifestLength <= 0 || manifestLength > MAX_MANIFEST_BYTES) throw new Error("Backup manifest length is invalid.");
    const manifestBytes = Buffer.alloc(manifestLength);
    const manifestRead = await handle.read(manifestBytes, 0, manifestLength, 4);
    if (manifestRead.bytesRead !== manifestLength) throw new Error("Backup manifest is truncated.");
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    if (manifest.version !== ARCHIVE_VERSION || !Array.isArray(manifest.files)) {
      throw new Error(`Backup manifest must use ${ARCHIVE_VERSION}.`);
    }
    assertCompleteCoverage(manifest.coverage);
    const seen = new Set();
    let payloadBytes = 0;
    let chatDatabaseCount = 0;
    for (const file of manifest.files) {
      ensureSafeRelativePath(file.path);
      if (seen.has(file.path)) throw new Error(`Duplicate archive path: ${file.path}`);
      seen.add(file.path);
      if (!file.path.startsWith("workspace/") && file.path !== "runtime/opencode.db") {
        throw new Error(`Unsupported archive destination: ${file.path}`);
      }
      if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error(`Invalid size for ${file.path}`);
      if (!/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error(`Invalid SHA-256 for ${file.path}`);
      if (!["notes", "outputs", "matterhorn_state", "chat_history"].includes(file.kind)) {
        throw new Error(`Invalid data kind for ${file.path}`);
      }
      if (file.kind === "chat_history") {
        if (file.path !== "runtime/opencode.db") throw new Error("Chat history must restore to runtime/opencode.db.");
        chatDatabaseCount += 1;
      }
      payloadBytes += file.size;
      if (!Number.isSafeInteger(payloadBytes)) throw new Error("Backup payload is too large.");
    }
    if (chatDatabaseCount !== 1) throw new Error("Backup must contain exactly one OpenCode chat database.");
    const bundleStat = await stat(bundlePath);
    if (4 + manifestLength + payloadBytes !== bundleStat.size) {
      throw new Error("Backup payload length does not match its manifest.");
    }
    return { manifest, payloadOffset: 4 + manifestLength };
  } finally {
    await handle.close();
  }
}

async function restoreBundle(bundlePath, targetPath) {
  const { manifest, payloadOffset } = await readManifest(bundlePath);
  const target = resolve(targetPath);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  if (await pathExists(target)) throw new Error(`Restore target already exists: ${target}`);
  const temporary = await mkdtemp(join(parent, `.${basename(target)}.restore-`));
  let offset = payloadOffset;
  try {
    for (const file of manifest.files) {
      const destination = ensureWithinRoot(temporary, join(temporary, ...file.path.split("/")));
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      if (file.size === 0) {
        await writeFile(destination, "", { mode: 0o600 });
      } else {
        await pipeline(
          createReadStream(bundlePath, { start: offset, end: offset + file.size - 1 }),
          createWriteStream(destination, { mode: 0o600 }),
        );
      }
      await chmod(destination, 0o600);
      const digest = await sha256File(destination);
      if (digest !== file.sha256) throw new Error(`Restored file failed verification: ${file.path}`);
      offset += file.size;
    }
    verifySqlite(join(temporary, "runtime", "opencode.db"));
    await rename(temporary, target);
    return { target, manifest };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

function assertCompleteCoverage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Backup user-data coverage is missing.");
  }
  const missing = Object.entries(value).filter(([, included]) => !included).map(([name]) => name);
  for (const name of Object.keys(COMPLETE_COVERAGE)) {
    if (value[name] !== true && !missing.includes(name)) missing.push(name);
  }
  if (missing.length) throw new Error(`Backup is missing required user-data coverage: ${missing.join(", ")}`);
}

async function writeReport(config, report, fallbackPath) {
  const reportPath = resolve(config.jsonOutput || fallbackPath);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return reportPath;
}

async function backup(config) {
  if (!config.workspaceRoot) throw new Error("--workspace-root is required for backup.");
  if (!config.opencodeDb) throw new Error("--opencode-db is required so chat history is recoverable.");
  if (!config.output) throw new Error("--output is required for backup.");
  const secret = passphrase(config);
  const startedAt = Date.now();
  const tempDir = await mkdtemp(join(tmpdir(), "matterhorn-user-data-backup-"));
  try {
    const files = await archiveEntries(config, tempDir);
    const included = { ...COMPLETE_COVERAGE };
    assertCompleteCoverage(included);
    const manifest = {
      version: ARCHIVE_VERSION,
      capturedAt: new Date().toISOString(),
      encryptionRequired: true,
      coverage: included,
      files: files.map(({ path, kind, size, sha256 }) => ({ path, kind, size, sha256 })),
    };
    const archivePath = await writeEncryptedArchive(config.output, manifest, files, secret, config.force);
    const archiveSha256 = await sha256File(archivePath);
    const report = {
      version: REPORT_VERSION,
      operation: "backup",
      status: "pass",
      ready: true,
      capturedAt: new Date().toISOString(),
      archive: {
        file: basename(archivePath),
        sha256: archiveSha256,
        bytes: (await stat(archivePath)).size,
      },
      encryption: {
        algorithm: "AES-256-GCM",
        keyDerivation: "scrypt",
        passphraseStored: false,
      },
      coverage: included,
      fileCount: files.length,
      payloadBytes: files.reduce((sum, file) => sum + file.size, 0),
      sqliteIntegrityVerified: true,
      durationMs: Date.now() - startedAt,
    };
    const reportPath = await writeReport(config, report, `${archivePath}.report.json`);
    return { report, reportPath };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function restore(config) {
  if (!config.archive) throw new Error("--archive is required for restore.");
  if (!config.workspaceRoot) {
    throw new Error("--workspace-root is required for restore so the active workspace is protected.");
  }
  if (!config.restoreTo) throw new Error("--restore-to is required for restore.");
  if (resolve(config.confirmRestoreTo) !== resolve(config.restoreTo)) {
    throw new Error("--confirm-restore-to must exactly match --restore-to.");
  }
  const workspaceRoot = resolve(config.workspaceRoot);
  if (!(await pathExists(workspaceRoot)) || !(await lstat(workspaceRoot)).isDirectory()) {
    throw new Error("--workspace-root must point to the active workspace directory.");
  }
  const canonicalWorkspaceRoot = await realpath(workspaceRoot);
  const canonicalRestoreTarget = await canonicalFuturePath(config.restoreTo);
  if (pathsOverlap(canonicalRestoreTarget, canonicalWorkspaceRoot)) {
    throw new Error("Restore target must be separate from the active workspace and cannot be nested inside it.");
  }
  const secret = passphrase(config);
  const startedAt = Date.now();
  const temporaryBundle = join(tmpdir(), `matterhorn-user-data-restore-${process.pid}-${Date.now()}.bundle`);
  try {
    await decryptArchive(config.archive, secret, temporaryBundle);
    const result = await restoreBundle(temporaryBundle, config.restoreTo);
    const included = result.manifest.coverage;
    assertCompleteCoverage(included);
    const report = {
      version: REPORT_VERSION,
      operation: "restore",
      status: "pass",
      ready: true,
      capturedAt: new Date().toISOString(),
      archive: {
        file: basename(config.archive),
        sha256: await sha256File(config.archive),
      },
      restore: {
        target: basename(result.target),
        publishedAtomically: true,
        existingTargetOverwritten: false,
        fileDigestsVerified: true,
        sqliteIntegrityVerified: true,
      },
      coverage: included,
      fileCount: result.manifest.files.length,
      durationMs: Date.now() - startedAt,
    };
    const reportPath = await writeReport(config, report, `${result.target}.restore-report.json`);
    return { report, reportPath };
  } finally {
    await rm(temporaryBundle, { force: true });
  }
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const result = config.mode === "restore" ? await restore(config) : await backup(config);
  if (config.json) process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  else process.stdout.write(`Workspace user-data ${result.report.operation}: PASS\nReport: ${result.reportPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
