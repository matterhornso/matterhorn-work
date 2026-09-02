import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

export type GuardedRuntimeStateKind =
  | "privacy_challenge"
  | "privacy_consent"
  | "run_grant"
  | "staged_capability"
  | "rollout_bypass"
  | "active_agent_run"
  | "agent_run_scope"
  | "user_message_binding"
  | "assistant_message_binding"
  | "crypto_app_reservation"
  | "crypto_pending_intent"
  | "crypto_evidence_record"
  | "crypto_evidence_run_index"
  | "crypto_evidence_finalization"
  | "crypto_evidence_audit"
  | "agent_file_record"
  | "receipt_index";

type StateRow = {
  kind: GuardedRuntimeStateKind;
  state_key: string;
  workspace_id: string;
  session_id: string | null;
  payload_json: string;
  expires_at: number | null;
  updated_at: number;
};

const require = createRequire(import.meta.url);

function openSqliteDatabase(path: string): SqliteDatabase {
  if (process.versions.bun) {
    const bunSqlite = require("bun:sqlite") as { Database: new (path: string) => SqliteDatabase };
    return new bunSqlite.Database(path);
  }
  const betterSqlite = require("better-sqlite3") as { default?: SqliteConstructor } | SqliteConstructor;
  const DatabaseCtor = (typeof betterSqlite === "function" ? betterSqlite : betterSqlite.default) as SqliteConstructor;
  return new DatabaseCtor(path);
}

function statement(db: SqliteDatabase, sql: string): SqliteStatement {
  if (db.prepare) return db.prepare(sql);
  if (db.query) return db.query(sql);
  throw new Error("SQLite database does not support prepare/query.");
}

export function guardedRuntimeStatePath(): string {
  const explicit = process.env.MATTERHORN_GUARDED_RUNTIME_DB?.trim();
  if (explicit) return explicit;
  const root = process.env.MATTERHORN_WORK_DATA_DIR?.trim()
    || process.env.OPENWORK_DATA_DIR?.trim()
    || join(homedir(), ".openwork", "openwork-server");
  return join(root, "guarded-runtime", "state.db");
}

export function guardedRuntimeSingleInstanceReady(): boolean {
  const parsed = Number(process.env.MATTERHORN_GUARDED_RUNTIME_INSTANCE_COUNT ?? "1");
  return Number.isInteger(parsed) && parsed === 1;
}

export class MatterhornGuardedRuntimeStateStore {
  private readonly db: SqliteDatabase;

  constructor(readonly path = guardedRuntimeStatePath()) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = openSqliteDatabase(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA secure_delete = ON; PRAGMA busy_timeout = 5000;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS guarded_state (
        kind TEXT NOT NULL,
        state_key TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        session_id TEXT,
        payload_json TEXT NOT NULL,
        expires_at INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (kind, state_key)
      );
      CREATE INDEX IF NOT EXISTS guarded_state_workspace_idx
        ON guarded_state(workspace_id, kind, updated_at);
      CREATE INDEX IF NOT EXISTS guarded_state_expiry_idx
        ON guarded_state(expires_at);
      CREATE TABLE IF NOT EXISTS consumed_capabilities (
        jti TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        call_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        claims_json TEXT NOT NULL,
        consumed_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS consumed_capabilities_workspace_idx
        ON consumed_capabilities(workspace_id, expires_at);
    `);
    chmodSync(path, 0o600);
  }

  /**
   * Runs a synchronous group of state mutations under one immediate SQLite
   * transaction. Callers use this for security records that must never become
   * partially visible (for example, one Walrus Quilt proof attached to several
   * encrypted evidence records).
   */
  transaction<T>(callback: () => T): T {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = callback();
      if (result !== null
        && typeof result === "object"
        && typeof (result as { then?: unknown }).then === "function") {
        throw new Error("guarded_runtime_async_transaction_forbidden");
      }
      this.db.exec("COMMIT;");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK;");
      } catch {
        // Preserve the original failure. A failed rollback leaves this store
        // unusable, and the next database operation will fail closed.
      }
      throw error;
    }
  }

  put(input: {
    kind: GuardedRuntimeStateKind;
    key: string;
    workspaceId: string;
    sessionId?: string | null;
    value: unknown;
    expiresAtMs?: number | null;
    nowMs?: number;
  }): void {
    statement(this.db, `
      INSERT INTO guarded_state(kind, state_key, workspace_id, session_id, payload_json, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(kind, state_key) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        session_id = excluded.session_id,
        payload_json = excluded.payload_json,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `).run(
      input.kind,
      input.key,
      input.workspaceId,
      input.sessionId ?? null,
      JSON.stringify(input.value),
      input.expiresAtMs ?? null,
      input.nowMs ?? Date.now(),
    );
  }

  get<T>(kind: GuardedRuntimeStateKind, key: string, nowMs = Date.now()): T | null {
    const row = statement(this.db, `
      SELECT kind, state_key, workspace_id, session_id, payload_json, expires_at, updated_at
      FROM guarded_state
      WHERE kind = ? AND state_key = ? AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1
    `).get(kind, key, nowMs) as StateRow | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.payload_json) as T;
    } catch {
      throw new Error("guarded_runtime_state_corrupt");
    }
  }

  /**
   * Atomically removes and returns one unexpired state record. This is used
   * for single-use privacy challenges and consent tokens so a second process
   * cannot confirm or consume the same record after the first process wins.
   */
  take<T>(kind: GuardedRuntimeStateKind, key: string, nowMs = Date.now()): T | null {
    const row = statement(this.db, `
      DELETE FROM guarded_state
      WHERE kind = ? AND state_key = ? AND (expires_at IS NULL OR expires_at > ?)
      RETURNING payload_json
    `).get(kind, key, nowMs) as { payload_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.payload_json) as T;
    } catch {
      throw new Error("guarded_runtime_state_corrupt");
    }
  }

  list<T>(kind: GuardedRuntimeStateKind, input: { workspaceId?: string; nowMs?: number } = {}): T[] {
    const nowMs = input.nowMs ?? Date.now();
    const rows = input.workspaceId
      ? statement(this.db, `
          SELECT payload_json FROM guarded_state
          WHERE kind = ? AND workspace_id = ? AND (expires_at IS NULL OR expires_at > ?)
          ORDER BY updated_at ASC
        `).all(kind, input.workspaceId, nowMs)
      : statement(this.db, `
          SELECT payload_json FROM guarded_state
          WHERE kind = ? AND (expires_at IS NULL OR expires_at > ?)
          ORDER BY updated_at ASC
        `).all(kind, nowMs);
    return rows.map((row) => {
      try {
        return JSON.parse((row as { payload_json: string }).payload_json) as T;
      } catch {
        throw new Error("guarded_runtime_state_corrupt");
      }
    });
  }

  delete(kind: GuardedRuntimeStateKind, key: string): boolean {
    return (statement(this.db, "DELETE FROM guarded_state WHERE kind = ? AND state_key = ?").run(kind, key).changes ?? 0) > 0;
  }

  consumeCapability(input: {
    jti: string;
    runId: string;
    callId: string;
    workspaceId: string;
    sessionId: string;
    claims: unknown;
    consumedAtMs: number;
    expiresAtMs: number;
  }): boolean {
    const result = statement(this.db, `
      INSERT OR IGNORE INTO consumed_capabilities(
        jti, run_id, call_id, workspace_id, session_id, claims_json, consumed_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.jti,
      input.runId,
      input.callId,
      input.workspaceId,
      input.sessionId,
      JSON.stringify(input.claims),
      input.consumedAtMs,
      input.expiresAtMs,
    );
    return (result.changes ?? 0) === 1;
  }

  listConsumedCapabilities<T>(nowMs = Date.now()): T[] {
    const rows = statement(this.db, `
      SELECT claims_json FROM consumed_capabilities
      WHERE expires_at > ?
      ORDER BY consumed_at ASC
    `).all(nowMs);
    return rows.map((row) => JSON.parse((row as { claims_json: string }).claims_json) as T);
  }

  purgeWorkspace(
    workspaceId: string,
    kinds?: GuardedRuntimeStateKind[],
    options: { includeConsumedCapabilities?: boolean } = {},
  ): { states: number; capabilities: number } {
    let states = 0;
    if (kinds?.length) {
      for (const kind of kinds) {
        states += statement(this.db, "DELETE FROM guarded_state WHERE workspace_id = ? AND kind = ?").run(workspaceId, kind).changes ?? 0;
      }
    } else {
      states = statement(this.db, "DELETE FROM guarded_state WHERE workspace_id = ?").run(workspaceId).changes ?? 0;
    }
    const capabilities = options.includeConsumedCapabilities === false
      ? 0
      : statement(this.db, "DELETE FROM consumed_capabilities WHERE workspace_id = ?").run(workspaceId).changes ?? 0;
    return { states, capabilities };
  }

  deleteExpired(nowMs = Date.now()): { states: number; capabilities: number } {
    const states = statement(this.db, "DELETE FROM guarded_state WHERE expires_at IS NOT NULL AND expires_at <= ?").run(nowMs).changes ?? 0;
    const capabilities = statement(this.db, "DELETE FROM consumed_capabilities WHERE expires_at <= ?").run(nowMs).changes ?? 0;
    return { states, capabilities };
  }

  /** Removes stale WAL pages after deleting wrapped encryption keys. */
  secureCheckpoint(): void {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  }

  close(): void {
    this.db.close();
  }
}
