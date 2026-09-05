import { createHmac, timingSafeEqual } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { MatterhornAgentFileRecord } from "./agent-file-store.js";
import {
  matterhornCryptoEvidenceRunIndexExpiry,
  matterhornCryptoEvidenceRunIndexKey,
  matterhornCryptoEvidenceRunIndexValue,
  type MatterhornCryptoEvidenceRecord,
} from "./crypto-evidence-store.js";
import { MatterhornDurableAuthorizedState } from "./durable-authorized-state.js";
import type { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import type { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

export const MATTERHORN_RECOVERY_ERASURE_LEDGER_VERSION = "matterhorn.recovery-erasure-ledger.v1" as const;
const SECURITY_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
const SIGNING_SECRET_MINIMUM_BYTES = 32;
const MATERIAL_TAG_PATTERN = /^[a-f0-9]{64}$/;
const require = createRequire(import.meta.url);

type SqliteRunResult = { changes?: number };
type SqliteStatement = {
  all: (...params: unknown[]) => unknown[];
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => SqliteRunResult;
};
type SqliteDatabase = {
  exec: (sql: string) => unknown;
  close: () => unknown;
  prepare?: (sql: string) => SqliteStatement;
  query?: (sql: string) => SqliteStatement;
};
type SqliteConstructor = new (path: string) => SqliteDatabase;

function openSqliteDatabase(path: string): SqliteDatabase {
  if (process.versions.bun) {
    const bunSqlite = require("bun:sqlite") as { Database: SqliteConstructor };
    return new bunSqlite.Database(path);
  }
  const betterSqlite = require("better-sqlite3") as { default?: SqliteConstructor } | SqliteConstructor;
  const DatabaseCtor = (typeof betterSqlite === "function" ? betterSqlite : betterSqlite.default) as SqliteConstructor;
  return new DatabaseCtor(path);
}

function statement(database: SqliteDatabase, sql: string): SqliteStatement {
  if (database.prepare) return database.prepare(sql);
  if (database.query) return database.query(sql);
  throw new Error("SQLite database does not support prepare/query.");
}

export type MatterhornRecoveryErasureKind = "crypto_evidence" | "agent_file";

type ErasureRow = {
  sequence: number;
  version: string;
  material_kind: MatterhornRecoveryErasureKind;
  material_tag: string;
  destroyed_at: number;
  previous_hash: string | null;
  record_hash: string;
  signature: string;
};

export type MatterhornRecoveryErasureEvent = {
  version: typeof MATTERHORN_RECOVERY_ERASURE_LEDGER_VERSION;
  sequence: number;
  materialKind: MatterhornRecoveryErasureKind;
  materialTag: string;
  destroyedAt: string;
  previousHash: string | null;
  recordHash: string;
  signature: string;
};

export type MatterhornRecoveryErasureCheckpoint = {
  version: typeof MATTERHORN_RECOVERY_ERASURE_LEDGER_VERSION;
  count: number;
  headHash: string | null;
  lastDestroyedAt: string | null;
};

export type MatterhornRecoveryErasureReconciliation = {
  checkedEvidence: number;
  checkedAgentFiles: number;
  evidenceKeysDestroyed: number;
  agentFilesDeleted: number;
  ledger: MatterhornRecoveryErasureCheckpoint;
};

function signingSecret(value: string): Buffer {
  const secret = Buffer.from(value, "utf8");
  if (secret.byteLength < SIGNING_SECRET_MINIMUM_BYTES) {
    secret.fill(0);
    throw new Error("recovery_erasure_ledger_signing_secret_invalid");
  }
  return secret;
}

function exactRecoveryMaterial(input: { wrappedKey: string; keyContext: string }): void {
  if (!input.wrappedKey.trim() || !input.keyContext.trim()) {
    throw new Error("recovery_erasure_material_invalid");
  }
}

function unsignedEvent(input: {
  sequence: number;
  materialKind: MatterhornRecoveryErasureKind;
  materialTag: string;
  destroyedAt: string;
  previousHash: string | null;
}) {
  return {
    version: MATTERHORN_RECOVERY_ERASURE_LEDGER_VERSION,
    sequence: input.sequence,
    materialKind: input.materialKind,
    materialTag: input.materialTag,
    destroyedAt: input.destroyedAt,
    previousHash: input.previousHash,
  } as const;
}

function rowEvent(row: ErasureRow): MatterhornRecoveryErasureEvent {
  return {
    version: MATTERHORN_RECOVERY_ERASURE_LEDGER_VERSION,
    sequence: row.sequence,
    materialKind: row.material_kind,
    materialTag: row.material_tag,
    destroyedAt: new Date(row.destroyed_at).toISOString(),
    previousHash: row.previous_hash,
    recordHash: row.record_hash,
    signature: row.signature,
  };
}

export function recoveryErasureLedgerPath(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.MATTERHORN_ERASURE_LEDGER_DB?.trim();
  if (explicit) return explicit;
  const root = env.MATTERHORN_WORK_DATA_DIR?.trim()
    || env.OPENWORK_DATA_DIR?.trim()
    || join(homedir(), ".openwork", "openwork-server");
  return join(root, "erasure-ledger", "ledger.db");
}

/**
 * Append-only, identifier-free record of recovery material that must remain
 * erased even if an older guarded-runtime database is restored. This database
 * intentionally lives outside the ordinary host snapshot rollback domain.
 */
export class MatterhornRecoveryErasureLedger {
  readonly path: string;
  readonly #db: SqliteDatabase;
  readonly #secret: Buffer;

  constructor(input: { path: string; signingSecret: string }) {
    this.path = input.path;
    this.#secret = signingSecret(input.signingSecret);
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    this.#db = openSqliteDatabase(this.path);
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA secure_delete = ON; PRAGMA busy_timeout = 5000;");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS recovery_erasures (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL,
        material_kind TEXT NOT NULL CHECK (material_kind IN ('crypto_evidence', 'agent_file')),
        material_tag TEXT NOT NULL UNIQUE,
        destroyed_at INTEGER NOT NULL,
        previous_hash TEXT,
        record_hash TEXT NOT NULL UNIQUE,
        signature TEXT NOT NULL
      );
    `);
    chmodSync(this.path, 0o600);
    this.verify();
  }

  #materialTag(input: {
    materialKind: MatterhornRecoveryErasureKind;
    wrappedKey: string;
    keyContext: string;
  }): string {
    exactRecoveryMaterial(input);
    return createHmac("sha256", this.#secret)
      .update(canonicalJson({
        domain: "matterhorn:recovery-erasure-material:v1",
        materialKind: input.materialKind,
        wrappedKey: input.wrappedKey,
        keyContext: input.keyContext,
      }))
      .digest("hex");
  }

  #signature(recordHash: string): string {
    return createHmac("sha256", this.#secret)
      .update(canonicalJson({ domain: "matterhorn:recovery-erasure-signature:v1", recordHash }))
      .digest("hex");
  }

  #events(): MatterhornRecoveryErasureEvent[] {
    const rows = statement(this.#db, `
      SELECT sequence, version, material_kind, material_tag, destroyed_at,
             previous_hash, record_hash, signature
      FROM recovery_erasures
      ORDER BY sequence ASC
    `).all() as ErasureRow[];
    return rows.map((row) => {
      if (row.version !== MATTERHORN_RECOVERY_ERASURE_LEDGER_VERSION
        || !Number.isSafeInteger(row.sequence)
        || row.sequence < 1
        || (row.material_kind !== "crypto_evidence" && row.material_kind !== "agent_file")
        || !Number.isSafeInteger(row.destroyed_at)
        || row.destroyed_at < 0
        || !MATERIAL_TAG_PATTERN.test(row.material_tag)
        || !MATERIAL_TAG_PATTERN.test(row.record_hash)
        || !MATERIAL_TAG_PATTERN.test(row.signature)) {
        throw new Error("recovery_erasure_ledger_corrupt");
      }
      return rowEvent(row);
    });
  }

  verify(): MatterhornRecoveryErasureCheckpoint {
    const events = this.#events();
    let previousHash: string | null = null;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const expectedUnsigned = unsignedEvent(event);
      const expectedHash = sha256({ domain: "matterhorn:recovery-erasure-record:v1", ...expectedUnsigned });
      const expectedSignature = this.#signature(expectedHash);
      const actualSignature = Buffer.from(event.signature, "hex");
      const signature = Buffer.from(expectedSignature, "hex");
      const signatureMatches = actualSignature.byteLength === signature.byteLength
        && timingSafeEqual(actualSignature, signature);
      actualSignature.fill(0);
      signature.fill(0);
      if (event.sequence !== index + 1
        || event.previousHash !== previousHash
        || event.recordHash !== expectedHash
        || !signatureMatches) {
        throw new Error("recovery_erasure_ledger_corrupt");
      }
      previousHash = event.recordHash;
    }
    return {
      version: MATTERHORN_RECOVERY_ERASURE_LEDGER_VERSION,
      count: events.length,
      headHash: previousHash,
      lastDestroyedAt: events.at(-1)?.destroyedAt ?? null,
    };
  }

  record(input: {
    materialKind: MatterhornRecoveryErasureKind;
    wrappedKey: string;
    keyContext: string;
    now?: Date;
  }): { event: MatterhornRecoveryErasureEvent; created: boolean } {
    const now = input.now ?? new Date();
    if (!Number.isFinite(now.getTime())) throw new Error("recovery_erasure_time_invalid");
    const materialTag = this.#materialTag(input);
    this.verify();
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = statement(this.#db, `
        SELECT sequence, version, material_kind, material_tag, destroyed_at,
               previous_hash, record_hash, signature
        FROM recovery_erasures WHERE material_tag = ?
      `).get(materialTag) as ErasureRow | undefined;
      if (existing) {
        this.#db.exec("COMMIT;");
        return { event: rowEvent(existing), created: false };
      }
      const previous = statement(this.#db, `
        SELECT sequence, record_hash FROM recovery_erasures ORDER BY sequence DESC LIMIT 1
      `).get() as { sequence: number; record_hash: string } | undefined;
      const eventUnsigned = unsignedEvent({
        sequence: (previous?.sequence ?? 0) + 1,
        materialKind: input.materialKind,
        materialTag,
        destroyedAt: now.toISOString(),
        previousHash: previous?.record_hash ?? null,
      });
      const recordHash = sha256({ domain: "matterhorn:recovery-erasure-record:v1", ...eventUnsigned });
      const signature = this.#signature(recordHash);
      statement(this.#db, `
        INSERT INTO recovery_erasures(
          sequence, version, material_kind, material_tag, destroyed_at,
          previous_hash, record_hash, signature
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        eventUnsigned.sequence,
        eventUnsigned.version,
        eventUnsigned.materialKind,
        eventUnsigned.materialTag,
        now.getTime(),
        eventUnsigned.previousHash,
        recordHash,
        signature,
      );
      const result = {
        event: { ...eventUnsigned, recordHash, signature },
        created: true,
      };
      this.#db.exec("COMMIT;");
      this.#db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
      return result;
    } catch (error) {
      try {
        this.#db.exec("ROLLBACK;");
      } catch {
        // Preserve the original error and fail closed.
      }
      throw error;
    }
  }

  eventFor(input: {
    materialKind: MatterhornRecoveryErasureKind;
    wrappedKey: string;
    keyContext: string;
  }): MatterhornRecoveryErasureEvent | null {
    const materialTag = this.#materialTag(input);
    const row = statement(this.#db, `
      SELECT sequence, version, material_kind, material_tag, destroyed_at,
             previous_hash, record_hash, signature
      FROM recovery_erasures WHERE material_tag = ?
    `).get(materialTag) as ErasureRow | undefined;
    if (!row) return null;
    this.verify();
    return rowEvent(row);
  }

  reconcile(
    stateStore: MatterhornGuardedRuntimeStateStore,
    authority: MatterhornDurableStateAuthority,
  ): MatterhornRecoveryErasureReconciliation {
    const ledger = this.verify();
    const evidenceRunIndexes = new MatterhornDurableAuthorizedState(
      stateStore,
      authority,
      "crypto_evidence_run_index",
      "recovery_erasure_state_corrupt",
    );
    const evidence = stateStore.listRecords("crypto_evidence_record").map((state) => {
      const record = authority.open<MatterhornCryptoEvidenceRecord>(
        state,
        "recovery_erasure_state_corrupt",
      );
      if (!record
        || state.key !== record.id
        || state.workspaceId !== record.workspaceId
        || state.sessionId !== null
        || state.updatedAtMs !== Date.parse(record.updatedAt)) {
        throw new Error("recovery_erasure_state_corrupt");
      }
      return record;
    });
    const agentFiles = stateStore.listRecords("agent_file_record").map((state) => {
      const record = authority.open<MatterhornAgentFileRecord>(
        state,
        "recovery_erasure_state_corrupt",
      );
      if (!record
        || state.key !== record.id
        || state.workspaceId !== record.workspaceId
        || state.sessionId !== null
        || state.expiresAtMs !== null
        || state.updatedAtMs !== Date.parse(record.updatedAt)) {
        throw new Error("recovery_erasure_state_corrupt");
      }
      return record;
    });
    let evidenceKeysDestroyed = 0;
    let agentFilesDeleted = 0;
    stateStore.transaction(() => {
      for (const record of evidence) {
        if (record.state === "key_destroyed") continue;
        if (!record.id || !record.workspaceId || !record.ownerId || !record.runId || !record.coworkerId
          || !Number.isSafeInteger(record.revision) || record.revision < 1
          || !record.key?.wrappedKey || !record.key.keyContext) {
          throw new Error("recovery_erasure_state_corrupt");
        }
        const event = this.eventFor({
          materialKind: "crypto_evidence",
          wrappedKey: record.key.wrappedKey,
          keyContext: record.key.keyContext,
        });
        if (!event) continue;
        const destroyedAtMs = Date.parse(event.destroyedAt);
        const next: MatterhornCryptoEvidenceRecord = {
          ...record,
          revision: record.revision + 1,
          state: "key_destroyed",
          envelope: null,
          key: {
            ...record.key,
            keyReference: null,
            wrappedKey: null,
            keyContext: null,
            recipientKeyIds: [],
          },
          updatedAt: event.destroyedAt,
        };
        const expiresAtMs = destroyedAtMs + SECURITY_RETENTION_MS;
        stateStore.put({
          kind: "crypto_evidence_record",
          key: next.id,
          workspaceId: next.workspaceId,
          value: authority.seal({
            kind: "crypto_evidence_record",
            key: next.id,
            workspaceId: next.workspaceId,
            sessionId: null,
            expiresAtMs,
            updatedAtMs: destroyedAtMs,
            value: next,
          }),
          expiresAtMs,
          nowMs: destroyedAtMs,
        });
        evidenceRunIndexes.put({
          key: matterhornCryptoEvidenceRunIndexKey(next),
          workspaceId: next.workspaceId,
          value: matterhornCryptoEvidenceRunIndexValue(next, destroyedAtMs),
          expiresAtMs: matterhornCryptoEvidenceRunIndexExpiry(next),
          nowMs: destroyedAtMs,
        });
        stateStore.delete("crypto_evidence_renewal_intent", next.id);
        stateStore.delete("crypto_evidence_deletion_intent", next.id);
        evidenceKeysDestroyed += 1;
      }
      for (const record of agentFiles) {
        if (!record.id || !record.workspaceId || !record.ownerId
          || !Number.isSafeInteger(record.revision) || record.revision < 1
          || !record.key?.wrappedKey || !record.key.keyContext) {
          throw new Error("recovery_erasure_state_corrupt");
        }
        const event = this.eventFor({
          materialKind: "agent_file",
          wrappedKey: record.key.wrappedKey,
          keyContext: record.key.keyContext,
        });
        if (!event) continue;
        stateStore.delete("agent_file_renewal_intent", record.id);
        stateStore.delete("agent_file_record", record.id);
        agentFilesDeleted += 1;
      }
    });
    if (evidenceKeysDestroyed > 0 || agentFilesDeleted > 0) stateStore.secureCheckpoint();
    return {
      checkedEvidence: evidence.length,
      checkedAgentFiles: agentFiles.length,
      evidenceKeysDestroyed,
      agentFilesDeleted,
      ledger,
    };
  }

  close(): void {
    this.#secret.fill(0);
    this.#db.close();
  }
}

export function recoveryErasureLedgerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MatterhornRecoveryErasureLedger | null {
  const secret = env.MATTERHORN_ERASURE_LEDGER_SIGNING_SECRET?.trim() ?? "";
  const explicitPath = env.MATTERHORN_ERASURE_LEDGER_DB?.trim() ?? "";
  if (!secret && !explicitPath) return null;
  if (!secret) throw new Error("recovery_erasure_ledger_signing_secret_required");
  return new MatterhornRecoveryErasureLedger({
    path: recoveryErasureLedgerPath(env),
    signingSecret: secret,
  });
}
