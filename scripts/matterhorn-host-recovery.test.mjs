#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { closeSync, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const requireFromServer = createRequire(new URL("../apps/server/package.json", import.meta.url));
const Database = requireFromServer("better-sqlite3");
const root = mkdtempSync(join(tmpdir(), "matterhorn-host-recovery-test-"));
const dataRoot = join(root, "data");
const opencodeDb = join(root, "opencode.db");
const archive = join(root, "host-recovery.json.gz");
const restored = join(root, "restored");
const scriptSource = readFileSync("scripts/matterhorn-host-recovery.mjs", "utf8");
const erasureSecret = "host-recovery-erasure-ledger-test-secret-32-bytes";

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

function hmac(value) {
  return createHmac("sha256", erasureSecret).update(value).digest("hex");
}

function materialTag(materialKind, wrappedKey, keyContext) {
  return hmac(canonicalJson({
    domain: "matterhorn:recovery-erasure-material:v1",
    materialKind,
    wrappedKey,
    keyContext,
  }));
}

function createErasureLedger(path) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.exec(`
    CREATE TABLE recovery_erasures (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL,
      material_kind TEXT NOT NULL,
      material_tag TEXT NOT NULL UNIQUE,
      destroyed_at INTEGER NOT NULL,
      previous_hash TEXT,
      record_hash TEXT NOT NULL UNIQUE,
      signature TEXT NOT NULL
    )
  `);
  database.close();
}

function appendErasure(path, materialKind, wrappedKey, keyContext, destroyedAt) {
  const database = new Database(path);
  const previous = database.prepare("SELECT sequence, record_hash FROM recovery_erasures ORDER BY sequence DESC LIMIT 1").get();
  const unsigned = {
    version: "matterhorn.recovery-erasure-ledger.v1",
    sequence: (previous?.sequence ?? 0) + 1,
    materialKind,
    materialTag: materialTag(materialKind, wrappedKey, keyContext),
    destroyedAt: destroyedAt.toISOString(),
    previousHash: previous?.record_hash ?? null,
  };
  const recordHash = createHash("sha256").update(canonicalJson({
    domain: "matterhorn:recovery-erasure-record:v1",
    ...unsigned,
  })).digest("hex");
  const signature = hmac(canonicalJson({
    domain: "matterhorn:recovery-erasure-signature:v1",
    recordHash,
  }));
  database.prepare(`
    INSERT INTO recovery_erasures(
      sequence, version, material_kind, material_tag, destroyed_at,
      previous_hash, record_hash, signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    unsigned.sequence,
    unsigned.version,
    unsigned.materialKind,
    unsigned.materialTag,
    destroyedAt.getTime(),
    unsigned.previousHash,
    recordHash,
    signature,
  );
  database.close();
}

function createGuardedDatabase(path) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.exec(`
    CREATE TABLE guarded_state (
      kind TEXT NOT NULL,
      state_key TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      session_id TEXT,
      payload_json TEXT NOT NULL,
      expires_at INTEGER,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (kind, state_key)
    )
  `);
  const insert = database.prepare(`
    INSERT INTO guarded_state(kind, state_key, workspace_id, session_id, payload_json, expires_at, updated_at)
    VALUES (?, ?, ?, NULL, ?, NULL, ?)
  `);
  insert.run("crypto_evidence_record", "evidence_stale", "ws_alpha", JSON.stringify({
    id: "evidence_stale",
    workspaceId: "ws_alpha",
    ownerId: "owner_alpha",
    runId: "run_alpha",
    coworkerId: "risk_monitor",
    revision: 1,
    state: "sealed",
    envelope: { ciphertext: "encrypted" },
    key: {
      keyReference: "kms-key",
      keyReferenceHash: "a".repeat(64),
      wrappedKey: "wrapped-evidence-stale",
      keyContext: "context-evidence-stale",
      recipientKeyIds: ["recipient"],
    },
    updatedAt: "2026-09-01T00:00:00.000Z",
  }), Date.now());
  insert.run("agent_file_record", "agent_file_stale", "ws_alpha", JSON.stringify({
    id: "agent_file_stale",
    workspaceId: "ws_alpha",
    ownerId: "owner_alpha",
    revision: 1,
    key: {
      keyReference: "kms-key",
      wrappedKey: "wrapped-agent-file-stale",
      keyContext: "context-agent-file-stale",
    },
  }), Date.now());
  insert.run("agent_file_renewal_intent", "agent_file_stale", "ws_alpha", JSON.stringify({ pending: true }), Date.now());
  insert.run("crypto_evidence_record", "evidence_current", "ws_beta", JSON.stringify({
    id: "evidence_current",
    workspaceId: "ws_beta",
    ownerId: "owner_beta",
    runId: "run_beta",
    coworkerId: "risk_monitor",
    revision: 1,
    state: "sealed",
    envelope: { ciphertext: "encrypted" },
    key: {
      keyReference: "kms-key",
      keyReferenceHash: "b".repeat(64),
      wrappedKey: "wrapped-evidence-current",
      keyContext: "context-evidence-current",
      recipientKeyIds: ["recipient"],
    },
    updatedAt: "2026-09-01T00:00:00.000Z",
  }), Date.now());
  database.close();
}

function createDatabase(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.exec("CREATE TABLE state (value TEXT NOT NULL)");
  database.prepare("INSERT INTO state(value) VALUES (?)").run(value);
  database.close();
}

function run(args) {
  return spawnSync("node", ["scripts/matterhorn-host-recovery.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      MATTERHORN_BUILD_COMMIT: "host-recovery-test",
      MATTERHORN_ERASURE_LEDGER_SIGNING_SECRET: erasureSecret,
    },
  });
}

try {
  assert.match(scriptSource, /MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID/);
  assert.match(scriptSource, /MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY/);
  assert.doesNotMatch(scriptSource, /process\.env\.AWS_ACCESS_KEY_ID/);
  const databases = [
    [join(dataRoot, "auth", "accounts.db"), "identity"],
    [join(dataRoot, "usage", "model-usage.db"), "usage"],
    [join(dataRoot, "auth", "rate-limits.db"), "rate-limit"],
    [join(dataRoot, "guarded-runtime", "state.db"), "guarded"],
    [opencodeDb, "opencode"],
  ];
  for (const [path, value] of databases) createDatabase(path, value);

  const backup = run([
    "--data-root", dataRoot,
    "--opencode-db", opencodeDb,
    "--output", archive,
    "--json",
  ]);
  assert.equal(backup.status, 0, backup.stderr);
  const report = JSON.parse(backup.stdout);
  assert.equal(report.ready, true);
  assert.deepEqual(report.files.map((file) => file.path).sort(), [
    "auth/accounts.db",
    "auth/rate-limits.db",
    "guarded-runtime/state.db",
    "opencode/opencode.db",
    "usage/model-usage.db",
  ]);
  const archiveFd = openSync(archive, "r");
  try {
    assert.equal(fstatSync(archiveFd).mode & 0o777, 0o600);
    assert.equal(readFileSync(archiveFd).includes(Buffer.from("identity")), false);
  } finally {
    closeSync(archiveFd);
  }

  const restore = run([
    "--restore",
    "--archive", archive,
    "--restore-to", restored,
    "--confirm-restore-to", restored,
    "--json",
  ]);
  assert.equal(restore.status, 0, restore.stderr);
  for (const [source, value] of databases) {
    const relative = source === opencodeDb
      ? "opencode/opencode.db"
      : source.slice(dataRoot.length + 1);
    const restoredDb = new Database(join(restored, relative), { readonly: true });
    assert.equal(restoredDb.prepare("SELECT value FROM state").get().value, value);
    restoredDb.close();
  }

  const erasureDataRoot = join(root, "erasure-data");
  const erasureOpencodeDb = join(root, "erasure-opencode.db");
  const erasureArchive = join(root, "erasure-host-recovery.json.gz");
  const erasureLedger = join(root, "outside-rollback", "ledger.db");
  createDatabase(join(erasureDataRoot, "auth", "accounts.db"), "identity");
  createDatabase(join(erasureDataRoot, "usage", "model-usage.db"), "usage");
  createDatabase(join(erasureDataRoot, "auth", "rate-limits.db"), "rate-limit");
  createGuardedDatabase(join(erasureDataRoot, "guarded-runtime", "state.db"));
  createDatabase(erasureOpencodeDb, "opencode");
  createErasureLedger(erasureLedger);

  const erasureBackup = run([
    "--data-root", erasureDataRoot,
    "--opencode-db", erasureOpencodeDb,
    "--erasure-ledger", erasureLedger,
    "--output", erasureArchive,
    "--json",
  ]);
  assert.equal(erasureBackup.status, 0, erasureBackup.stderr);
  const erasureBackupReport = JSON.parse(erasureBackup.stdout);
  assert.deepEqual(erasureBackupReport.erasureLedger, {
    required: true,
    excludedFromArchive: true,
    checkpoint: {
      version: "matterhorn.recovery-erasure-ledger.v1",
      count: 0,
      headHash: null,
      lastDestroyedAt: null,
    },
    checkpointSignature: erasureBackupReport.erasureLedger.checkpointSignature,
  });
  assert.match(erasureBackupReport.erasureLedger.checkpointSignature, /^[a-f0-9]{64}$/);

  const destroyedAt = new Date("2026-09-06T00:00:00.000Z");
  appendErasure(
    erasureLedger,
    "crypto_evidence",
    "wrapped-evidence-stale",
    "context-evidence-stale",
    destroyedAt,
  );
  appendErasure(
    erasureLedger,
    "agent_file",
    "wrapped-agent-file-stale",
    "context-agent-file-stale",
    destroyedAt,
  );

  const missingLedgerRoot = join(root, "missing-ledger-restore");
  const missingLedger = run([
    "--restore",
    "--archive", erasureArchive,
    "--restore-to", missingLedgerRoot,
    "--confirm-restore-to", missingLedgerRoot,
  ]);
  assert.notEqual(missingLedger.status, 0);
  assert.match(missingLedger.stderr, /requires --erasure-ledger/);

  const erasureRestored = join(root, "erasure-restored");
  const erasureRestore = run([
    "--restore",
    "--archive", erasureArchive,
    "--erasure-ledger", erasureLedger,
    "--restore-to", erasureRestored,
    "--confirm-restore-to", erasureRestored,
    "--json",
  ]);
  assert.equal(erasureRestore.status, 0, erasureRestore.stderr);
  assert.deepEqual(JSON.parse(erasureRestore.stdout).erasureReconciliation, {
    required: true,
    checked: 3,
    evidenceKeysDestroyed: 1,
    agentFilesDeleted: 1,
  });
  const reconciled = new Database(join(erasureRestored, "guarded-runtime", "state.db"), { readonly: true });
  const staleEvidence = JSON.parse(reconciled.prepare(`
    SELECT payload_json FROM guarded_state
    WHERE kind = 'crypto_evidence_record' AND state_key = 'evidence_stale'
  `).get().payload_json);
  assert.equal(staleEvidence.state, "key_destroyed");
  assert.equal(staleEvidence.envelope, null);
  assert.deepEqual(staleEvidence.key, {
    keyReference: null,
    keyReferenceHash: "a".repeat(64),
    wrappedKey: null,
    keyContext: null,
    recipientKeyIds: [],
  });
  assert.equal(reconciled.prepare(`
    SELECT COUNT(*) AS count FROM guarded_state
    WHERE kind IN ('agent_file_record', 'agent_file_renewal_intent') AND state_key = 'agent_file_stale'
  `).get().count, 0);
  assert.equal(reconciled.prepare(`
    SELECT COUNT(*) AS count FROM guarded_state
    WHERE kind = 'crypto_evidence_record' AND state_key = 'evidence_current'
  `).get().count, 1);
  reconciled.close();
  const copiedLedger = new Database(join(erasureRestored, "erasure-ledger", "ledger.db"), { readonly: true });
  assert.equal(copiedLedger.prepare("SELECT COUNT(*) AS count FROM recovery_erasures").get().count, 2);
  copiedLedger.close();

  const nonempty = join(root, "nonempty");
  mkdirSync(nonempty, { recursive: true });
  createDatabase(join(nonempty, "existing.db"), "do-not-overwrite");
  const refused = run([
    "--restore",
    "--archive", archive,
    "--restore-to", nonempty,
    "--confirm-restore-to", nonempty,
  ]);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /clean, empty restore root/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("SSE-KMS host recovery snapshot and restore contract passed.");
