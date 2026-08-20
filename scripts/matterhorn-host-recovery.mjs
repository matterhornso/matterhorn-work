#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import process from "node:process";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const requireFromServer = createRequire(new URL("../apps/server/package.json", import.meta.url));
const Database = requireFromServer("better-sqlite3");
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const VERSION = "matterhorn.host-recovery.v1";
const REQUIRED_DATABASES = Object.freeze([
  ["auth/accounts.db", "auth/accounts.db"],
  ["usage/model-usage.db", "usage/model-usage.db"],
  ["auth/rate-limits.db", "auth/rate-limits.db"],
  ["guarded-runtime/state.db", "guarded-runtime/state.db"],
]);

function parseArgs(argv) {
  const config = {
    mode: "backup",
    dataRoot: "",
    opencodeDb: "",
    output: "",
    archive: "",
    restoreTo: "",
    confirmRestoreTo: "",
    upload: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--backup") config.mode = "backup";
    else if (arg === "--restore") config.mode = "restore";
    else if (arg === "--data-root") config.dataRoot = next();
    else if (arg === "--opencode-db") config.opencodeDb = next();
    else if (arg === "--output") config.output = next();
    else if (arg === "--archive") config.archive = next();
    else if (arg === "--restore-to") config.restoreTo = next();
    else if (arg === "--confirm-restore-to") config.confirmRestoreTo = next();
    else if (arg === "--upload") config.upload = true;
    else if (arg === "--json") config.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return config;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeDestination(root, relativePath) {
  if (!/^[a-zA-Z0-9._/-]+$/.test(relativePath) || relativePath.includes("..")) {
    throw new Error("Host recovery manifest contains an unsafe path.");
  }
  const target = resolve(root, relativePath);
  const resolvedRoot = resolve(root);
  if (target === resolvedRoot || !target.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error("Host recovery path escapes the restore root.");
  }
  return target;
}

function verifyDatabase(path) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma("quick_check", { simple: true }) !== "ok") {
      throw new Error(`SQLite quick_check failed for ${path}.`);
    }
  } finally {
    database.close();
  }
}

async function snapshotDatabase(source, destination) {
  const database = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await database.backup(destination);
  } finally {
    database.close();
  }
  verifyDatabase(destination);
}

async function createBundle(config) {
  if (!config.dataRoot || !config.opencodeDb || !config.output) {
    throw new Error("Backup requires --data-root, --opencode-db, and --output.");
  }
  const temporary = await mkdtemp(join(tmpdir(), "matterhorn-host-recovery-"));
  try {
    const sources = [
      ...REQUIRED_DATABASES.map(([archivePath, sourcePath]) => [archivePath, join(resolve(config.dataRoot), sourcePath)]),
      ["opencode/opencode.db", resolve(config.opencodeDb)],
    ];
    const files = [];
    for (const [archivePath, sourcePath] of sources) {
      const snapshot = join(temporary, archivePath.replaceAll("/", "-"));
      await snapshotDatabase(sourcePath, snapshot);
      const bytes = await readFile(snapshot);
      files.push({ path: archivePath, sha256: sha256(bytes), bytes: bytes.toString("base64") });
    }
    const manifest = {
      version: VERSION,
      capturedAt: new Date().toISOString(),
      buildCommit: process.env.MATTERHORN_BUILD_COMMIT?.trim() || null,
      encryption: { target: "s3", required: "SSE-KMS", bucketKeyEnabled: true },
      files,
    };
    const compressed = await gzipAsync(Buffer.from(JSON.stringify(manifest)), { level: 9 });
    const output = resolve(config.output);
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await writeFile(output, compressed, { mode: 0o600 });
    await chmod(output, 0o600);
    return { output, compressed, manifest };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function uploadBundle(bundle) {
  const bucket = process.env.MATTERHORN_BACKUP_S3_BUCKET?.trim() || "";
  const kmsKeyId = process.env.MATTERHORN_BACKUP_KMS_KEY_ID?.trim() || "";
  const region = process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || "";
  const accessKeyId = process.env.MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY?.trim() || "";
  const sessionToken = process.env.MATTERHORN_BACKUP_AWS_SESSION_TOKEN?.trim() || undefined;
  if (!bucket || !kmsKeyId || !region || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 host recovery requires its bucket, KMS key, region, and dedicated backup AWS credentials.");
  }
  const date = bundle.manifest.capturedAt.slice(0, 10);
  const key = `host-recovery/${date}/${bundle.manifest.capturedAt.replaceAll(":", "-")}.json.gz`;
  const checksum = createHash("sha256").update(bundle.compressed).digest("base64");
  const client = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) },
  });
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: bundle.compressed,
    ContentType: "application/gzip",
    ChecksumSHA256: checksum,
    ServerSideEncryption: "aws:kms",
    SSEKMSKeyId: kmsKeyId,
    BucketKeyEnabled: true,
    Metadata: {
      "matterhorn-version": VERSION,
      "matterhorn-build": bundle.manifest.buildCommit ?? "unknown",
    },
  }));
  const freshnessPath = join(resolve(process.env.MATTERHORN_WORK_DATA_DIR || "."), "backups", "last-success.json");
  await mkdir(dirname(freshnessPath), { recursive: true, mode: 0o700 });
  await writeFile(freshnessPath, `${JSON.stringify({
    version: VERSION,
    capturedAt: bundle.manifest.capturedAt,
    bucket,
    key,
    sha256: sha256(bundle.compressed),
  })}\n`, { mode: 0o600 });
  return { bucket, key };
}

async function restoreBundle(config) {
  if (!config.archive || !config.restoreTo || resolve(config.restoreTo) !== resolve(config.confirmRestoreTo)) {
    throw new Error("Restore requires --archive, --restore-to, and an exact --confirm-restore-to.");
  }
  const targetRoot = resolve(config.restoreTo);
  const existingEntries = await readdir(targetRoot).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  if (existingEntries.length) throw new Error("Host recovery requires a clean, empty restore root.");
  const decoded = JSON.parse((await gunzipAsync(await readFile(config.archive))).toString("utf8"));
  if (decoded.version !== VERSION || !Array.isArray(decoded.files)) throw new Error("Host recovery archive version is invalid.");
  const expectedPaths = new Set([...REQUIRED_DATABASES.map(([path]) => path), "opencode/opencode.db"]);
  if (decoded.files.length !== expectedPaths.size) throw new Error("Host recovery archive coverage is incomplete.");
  for (const file of decoded.files) {
    if (!expectedPaths.delete(file.path)) throw new Error("Host recovery archive contains an unexpected database.");
    const bytes = Buffer.from(file.bytes, "base64");
    if (sha256(bytes) !== file.sha256) throw new Error(`Host recovery digest failed for ${file.path}.`);
    const target = safeDestination(targetRoot, file.path);
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { mode: 0o600 });
    verifyDatabase(target);
  }
  if (expectedPaths.size) throw new Error("Host recovery archive is missing required databases.");
  return { targetRoot, capturedAt: decoded.capturedAt };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.mode === "restore") {
    const restored = await restoreBundle(config);
    process.stdout.write(`${JSON.stringify({ version: VERSION, operation: "restore", ready: true, ...restored }, null, config.json ? 2 : 0)}\n`);
    return;
  }
  const bundle = await createBundle(config);
  const uploaded = config.upload ? await uploadBundle(bundle) : null;
  process.stdout.write(`${JSON.stringify({
    version: VERSION,
    operation: "backup",
    ready: true,
    capturedAt: bundle.manifest.capturedAt,
    archiveSha256: sha256(bundle.compressed),
    files: bundle.manifest.files.map((file) => ({ path: file.path, sha256: file.sha256 })),
    uploaded,
  }, null, config.json ? 2 : 0)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
