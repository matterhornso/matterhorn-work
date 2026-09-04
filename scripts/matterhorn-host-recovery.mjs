#!/usr/bin/env node
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
const ERASURE_LEDGER_VERSION = "matterhorn.recovery-erasure-ledger.v1";
const ERASURE_SECRET_ENV = "MATTERHORN_ERASURE_LEDGER_SIGNING_SECRET";
const SECURITY_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
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
    erasureLedger: "",
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
    else if (arg === "--erasure-ledger") config.erasureLedger = next();
    else if (arg === "--upload") config.upload = true;
    else if (arg === "--json") config.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return config;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return String(value);
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function erasureSecret() {
  const value = process.env[ERASURE_SECRET_ENV]?.trim() || "";
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${ERASURE_SECRET_ENV} must contain at least 32 bytes.`);
  }
  return Buffer.from(value, "utf8");
}

function hmac(secret, value) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function signErasureCheckpoint(checkpoint) {
  const secret = erasureSecret();
  try {
    return hmac(secret, canonicalJson({
      domain: "matterhorn:host-recovery-erasure-checkpoint:v1",
      checkpoint,
    }));
  } finally {
    secret.fill(0);
  }
}

function equalHex(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  const equal = timingSafeEqual(leftBytes, rightBytes);
  leftBytes.fill(0);
  rightBytes.fill(0);
  return equal;
}

function tableExists(database, name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(name));
}

function guardedRecoveryMaterialCount(path) {
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (!tableExists(database, "guarded_state")) return 0;
    return database.prepare(`
      SELECT COUNT(*) AS count FROM guarded_state
      WHERE kind IN ('crypto_evidence_record', 'agent_file_record')
    `).get().count;
  } finally {
    database.close();
  }
}

function verifyErasureLedger(path) {
  const secret = erasureSecret();
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma("quick_check", { simple: true }) !== "ok" || !tableExists(database, "recovery_erasures")) {
      throw new Error("Recovery erasure ledger is invalid.");
    }
    const rows = database.prepare(`
      SELECT sequence, version, material_kind, material_tag, destroyed_at,
             previous_hash, record_hash, signature
      FROM recovery_erasures ORDER BY sequence ASC
    `).all();
    let previousHash = null;
    const eventByTag = new Map();
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const destroyedAt = new Date(row.destroyed_at).toISOString();
      const unsigned = {
        version: ERASURE_LEDGER_VERSION,
        sequence: row.sequence,
        materialKind: row.material_kind,
        materialTag: row.material_tag,
        destroyedAt,
        previousHash: row.previous_hash,
      };
      const recordHash = sha256(Buffer.from(canonicalJson({
        domain: "matterhorn:recovery-erasure-record:v1",
        ...unsigned,
      })));
      const signature = hmac(secret, canonicalJson({
        domain: "matterhorn:recovery-erasure-signature:v1",
        recordHash,
      }));
      if (row.version !== ERASURE_LEDGER_VERSION
        || row.sequence !== index + 1
        || !["crypto_evidence", "agent_file"].includes(row.material_kind)
        || !/^[a-f0-9]{64}$/.test(row.material_tag)
        || row.previous_hash !== previousHash
        || !equalHex(row.record_hash, recordHash)
        || !equalHex(row.signature, signature)) {
        throw new Error("Recovery erasure ledger authentication failed.");
      }
      previousHash = row.record_hash;
      eventByTag.set(row.material_tag, { materialKind: row.material_kind, destroyedAt: row.destroyed_at });
    }
    return {
      checkpoint: {
        version: ERASURE_LEDGER_VERSION,
        count: rows.length,
        headHash: previousHash,
        lastDestroyedAt: rows.length ? new Date(rows.at(-1).destroyed_at).toISOString() : null,
      },
      eventByTag,
      hashAtSequence(sequence) {
        if (sequence === 0) return null;
        return rows[sequence - 1]?.record_hash ?? null;
      },
    };
  } finally {
    secret.fill(0);
    database.close();
  }
}

function recoveryMaterialTag(secret, materialKind, wrappedKey, keyContext) {
  if (typeof wrappedKey !== "string" || !wrappedKey.trim()
    || typeof keyContext !== "string" || !keyContext.trim()) {
    throw new Error("Restored recovery material is malformed.");
  }
  return hmac(secret, canonicalJson({
    domain: "matterhorn:recovery-erasure-material:v1",
    materialKind,
    wrappedKey,
    keyContext,
  }));
}

function reconcileGuardedState(path, ledger) {
  const secret = erasureSecret();
  const database = new Database(path, { fileMustExist: true });
  let evidenceKeysDestroyed = 0;
  let agentFilesDeleted = 0;
  try {
    const rows = database.prepare(`
      SELECT kind, state_key, workspace_id, payload_json
      FROM guarded_state
      WHERE kind IN ('crypto_evidence_record', 'agent_file_record')
      ORDER BY kind, state_key
    `).all();
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) {
        let record;
        try {
          record = JSON.parse(row.payload_json);
        } catch {
          throw new Error("Restored guarded-runtime recovery material is corrupt.");
        }
        if (!record || typeof record !== "object"
          || record.id !== row.state_key
          || record.workspaceId !== row.workspace_id
          || typeof record.ownerId !== "string"
          || !record.ownerId
          || !Number.isSafeInteger(record.revision)
          || record.revision < 1
          || (row.kind === "crypto_evidence_record"
            && (typeof record.runId !== "string" || !record.runId
              || typeof record.coworkerId !== "string" || !record.coworkerId))) {
          throw new Error("Restored guarded-runtime recovery material is corrupt.");
        }
        if (row.kind === "crypto_evidence_record" && record.state === "key_destroyed") continue;
        const materialKind = row.kind === "crypto_evidence_record" ? "crypto_evidence" : "agent_file";
        const materialTag = recoveryMaterialTag(secret, materialKind, record.key?.wrappedKey, record.key?.keyContext);
        const event = ledger.eventByTag.get(materialTag);
        if (!event || event.materialKind !== materialKind) continue;
        if (!Number.isSafeInteger(event.destroyedAt) || event.destroyedAt < 0) {
          throw new Error("Recovery erasure ledger contains an invalid destruction time.");
        }
        if (row.kind === "agent_file_record") {
          database.prepare("DELETE FROM guarded_state WHERE kind = 'agent_file_renewal_intent' AND state_key = ?").run(row.state_key);
          database.prepare("DELETE FROM guarded_state WHERE kind = 'agent_file_record' AND state_key = ?").run(row.state_key);
          agentFilesDeleted += 1;
          continue;
        }
        const destroyedAt = Number(event.destroyedAt);
        record.revision += 1;
        record.state = "key_destroyed";
        record.envelope = null;
        record.key = {
          ...record.key,
          keyReference: null,
          wrappedKey: null,
          keyContext: null,
          recipientKeyIds: [],
        };
        record.updatedAt = new Date(destroyedAt).toISOString();
        database.prepare(`
          UPDATE guarded_state
          SET payload_json = ?, expires_at = ?, updated_at = ?
          WHERE kind = 'crypto_evidence_record' AND state_key = ?
        `).run(JSON.stringify(record), destroyedAt + SECURITY_RETENTION_MS, destroyedAt, row.state_key);
        const runIndexKey = sha256(Buffer.from(canonicalJson({
          domain: "matterhorn:crypto-evidence-run-index:v1",
          workspaceId: record.workspaceId,
          ownerId: record.ownerId,
          coworkerId: record.coworkerId,
          runId: record.runId,
        })));
        database.prepare(`
          UPDATE guarded_state
          SET expires_at = ?, updated_at = ?
          WHERE kind = 'crypto_evidence_run_index' AND state_key = ?
        `).run(destroyedAt + SECURITY_RETENTION_MS, destroyedAt, runIndexKey);
        evidenceKeysDestroyed += 1;
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    database.pragma("wal_checkpoint(TRUNCATE)");
    if (database.pragma("quick_check", { simple: true }) !== "ok") {
      throw new Error("Reconciled guarded-runtime database failed SQLite quick_check.");
    }
    return { checked: rows.length, evidenceKeysDestroyed, agentFilesDeleted };
  } finally {
    secret.fill(0);
    database.close();
  }
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
    const guardedSnapshot = join(temporary, "guarded-runtime-state.db");
    const recoveryMaterialCount = guardedRecoveryMaterialCount(guardedSnapshot);
    const ledgerPath = resolve(config.erasureLedger || join(resolve(config.dataRoot), "erasure-ledger", "ledger.db"));
    let erasureLedger = null;
    if (recoveryMaterialCount > 0) {
      const verified = verifyErasureLedger(ledgerPath);
      erasureLedger = {
        required: true,
        excludedFromArchive: true,
        checkpoint: verified.checkpoint,
        checkpointSignature: signErasureCheckpoint(verified.checkpoint),
      };
    }
    const manifest = {
      version: VERSION,
      capturedAt: new Date().toISOString(),
      buildCommit: process.env.MATTERHORN_BUILD_COMMIT?.trim() || null,
      encryption: { target: "s3", required: "SSE-KMS", bucketKeyEnabled: true },
      erasureLedger,
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
  const guardedStatePath = join(targetRoot, "guarded-runtime", "state.db");
  const recoveryMaterialCount = guardedRecoveryMaterialCount(guardedStatePath);
  let erasureReconciliation = {
    required: false,
    checked: 0,
    evidenceKeysDestroyed: 0,
    agentFilesDeleted: 0,
  };
  if (recoveryMaterialCount > 0) {
    if (!decoded.erasureLedger?.required
      || decoded.erasureLedger.excludedFromArchive !== true
      || decoded.erasureLedger.checkpoint?.version !== ERASURE_LEDGER_VERSION) {
      throw new Error("Host recovery archive predates required erasure-ledger reconciliation.");
    }
    if (!config.erasureLedger) {
      throw new Error("Restore contains recovery material and requires --erasure-ledger from outside the host archive.");
    }
    const ledgerPath = resolve(config.erasureLedger);
    const verified = verifyErasureLedger(ledgerPath);
    const archivedCheckpoint = decoded.erasureLedger.checkpoint;
    const expectedCheckpointSignature = signErasureCheckpoint(archivedCheckpoint);
    if (!Number.isSafeInteger(archivedCheckpoint.count)
      || archivedCheckpoint.count < 0
      || !equalHex(decoded.erasureLedger.checkpointSignature, expectedCheckpointSignature)
      || verified.checkpoint.count < archivedCheckpoint.count
      || verified.hashAtSequence(archivedCheckpoint.count) !== archivedCheckpoint.headHash) {
      throw new Error("Recovery erasure ledger is older than or diverges from the backup checkpoint.");
    }
    erasureReconciliation = {
      required: true,
      ...reconcileGuardedState(guardedStatePath, verified),
    };
    const restoredLedger = safeDestination(targetRoot, "erasure-ledger/ledger.db");
    await mkdir(dirname(restoredLedger), { recursive: true, mode: 0o700 });
    await copyFile(ledgerPath, restoredLedger);
    await chmod(restoredLedger, 0o600);
    verifyErasureLedger(restoredLedger);
  }
  return { targetRoot, capturedAt: decoded.capturedAt, erasureReconciliation };
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
    erasureLedger: bundle.manifest.erasureLedger,
    uploaded,
  }, null, config.json ? 2 : 0)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
