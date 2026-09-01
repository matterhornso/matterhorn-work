import { randomUUID } from "node:crypto";
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

export type MatterhornCryptoAppOperationalOutcome = "success" | "error" | "timeout";

export type MatterhornCryptoAppOperationalPolicy = {
  reserve(input: {
    workspaceId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    actionId: string;
    runId: string;
    callId: string;
  }): { reservationId: string; reservedCostMicros: number };
  reconcile(input: {
    reservationId: string;
    outcome: MatterhornCryptoAppOperationalOutcome;
    actualCostMicros: number;
  }): { reservedCostMicros: number; overCallLimit: boolean };
  circuitOpen(input: { workspaceId: string; circuitKey: string }): boolean;
  recordFailure(input: { workspaceId: string; circuitKey: string }): void;
  recordSuccess(input: { workspaceId: string; circuitKey: string }): void;
};

export type MatterhornCryptoAppOperationalPolicyOptions = {
  dailyWorkspaceLimitMicros?: number;
  maxCallCostMicros?: number;
  reservationTtlMs?: number;
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
  now?: () => Date;
  id?: () => string;
};

type UsageRow = {
  reserved_cost_micros: number;
  actual_cost_micros: number | null;
  state: string;
};

type CircuitRow = {
  consecutive_failures: number;
  open_until_ms: number;
};

const require = createRequire(import.meta.url);
const DEFAULT_DAILY_WORKSPACE_LIMIT_MICROS = 10_000_000;
const DEFAULT_MAX_CALL_COST_MICROS = 1_000_000;
const DEFAULT_RESERVATION_TTL_MS = 60_000;
const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 3;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 30_000;

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

function positiveSafeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new MatterhornCryptoAppOperationalPolicyError(code);
  return value;
}

function nonNegativeSafeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new MatterhornCryptoAppOperationalPolicyError(code);
  return value;
}

function utcDay(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_clock_invalid");
  return now.toISOString().slice(0, 10);
}

function stateOutcome(value: string): MatterhornCryptoAppOperationalOutcome {
  if (value === "success" || value === "error" || value === "timeout") return value;
  throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
}

export class MatterhornCryptoAppOperationalPolicyError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "MatterhornCryptoAppOperationalPolicyError";
  }
}

export function cryptoAppOperationalPolicyPath(): string {
  const explicit = process.env.MATTERHORN_CRYPTO_APP_OPERATIONAL_DB?.trim();
  if (explicit) return explicit;
  const root = process.env.MATTERHORN_WORK_DATA_DIR?.trim()
    || process.env.OPENWORK_DATA_DIR?.trim()
    || join(homedir(), ".openwork", "openwork-server");
  return join(root, "crypto-apps", "operational.db");
}

/**
 * Durable adapter quota and circuit state. This store contains identifiers,
 * counters and outcomes only; it never stores prompts, tool arguments,
 * credentials, wallet data or adapter output.
 */
export class MatterhornCryptoAppOperationalPolicyStore implements MatterhornCryptoAppOperationalPolicy {
  readonly #db: SqliteDatabase;
  readonly #dailyWorkspaceLimitMicros: number;
  readonly #maxCallCostMicros: number;
  readonly #reservationTtlMs: number;
  readonly #circuitFailureThreshold: number;
  readonly #circuitCooldownMs: number;
  readonly #now: () => Date;
  readonly #id: () => string;

  constructor(
    readonly path = cryptoAppOperationalPolicyPath(),
    options: MatterhornCryptoAppOperationalPolicyOptions = {},
  ) {
    this.#dailyWorkspaceLimitMicros = positiveSafeInteger(
      options.dailyWorkspaceLimitMicros ?? DEFAULT_DAILY_WORKSPACE_LIMIT_MICROS,
      "crypto_app_daily_limit_invalid",
    );
    this.#maxCallCostMicros = positiveSafeInteger(
      options.maxCallCostMicros ?? DEFAULT_MAX_CALL_COST_MICROS,
      "crypto_app_call_limit_invalid",
    );
    this.#reservationTtlMs = positiveSafeInteger(
      options.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS,
      "crypto_app_reservation_ttl_invalid",
    );
    this.#circuitFailureThreshold = positiveSafeInteger(
      options.circuitFailureThreshold ?? DEFAULT_CIRCUIT_FAILURE_THRESHOLD,
      "crypto_app_circuit_threshold_invalid",
    );
    this.#circuitCooldownMs = positiveSafeInteger(
      options.circuitCooldownMs ?? DEFAULT_CIRCUIT_COOLDOWN_MS,
      "crypto_app_circuit_cooldown_invalid",
    );
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => `caop_${randomUUID()}`);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.#db = openSqliteDatabase(path);
    this.#db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;");
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS crypto_app_usage_reservations (
        reservation_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        app_id TEXT NOT NULL,
        manifest_revision TEXT NOT NULL,
        action_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        call_id TEXT NOT NULL,
        day_bucket TEXT NOT NULL,
        reserved_cost_micros INTEGER NOT NULL,
        actual_cost_micros INTEGER,
        state TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        reconciled_at_ms INTEGER,
        UNIQUE(workspace_id, run_id, call_id, action_id)
      );
      CREATE INDEX IF NOT EXISTS crypto_app_usage_workspace_day_idx
        ON crypto_app_usage_reservations(workspace_id, day_bucket, state);
      CREATE INDEX IF NOT EXISTS crypto_app_usage_expiry_idx
        ON crypto_app_usage_reservations(state, expires_at_ms);
      CREATE TABLE IF NOT EXISTS crypto_app_circuits (
        circuit_key TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        consecutive_failures INTEGER NOT NULL,
        open_until_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(workspace_id, circuit_key)
      );
      CREATE INDEX IF NOT EXISTS crypto_app_circuit_workspace_idx
        ON crypto_app_circuits(workspace_id, updated_at_ms);
    `);
    chmodSync(path, 0o600);
  }

  reserve(input: {
    workspaceId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    actionId: string;
    runId: string;
    callId: string;
  }): { reservationId: string; reservedCostMicros: number } {
    const now = this.#now();
    const nowMs = now.getTime();
    const dayBucket = utcDay(now);
    const reservationId = this.#id();
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      statement(this.#db, `
        UPDATE crypto_app_usage_reservations
        SET state = 'expired', actual_cost_micros = 0, reconciled_at_ms = ?
        WHERE state = 'pending' AND expires_at_ms <= ?
      `).run(nowMs, nowMs);
      const duplicate = statement(this.#db, `
        SELECT reservation_id FROM crypto_app_usage_reservations
        WHERE workspace_id = ? AND run_id = ? AND call_id = ? AND action_id = ?
        LIMIT 1
      `).get(input.workspaceId, input.runId, input.callId, input.actionId);
      if (duplicate) throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_operational_replay");
      const row = statement(this.#db, `
        SELECT COALESCE(SUM(
          CASE WHEN state = 'pending' THEN reserved_cost_micros ELSE COALESCE(actual_cost_micros, 0) END
        ), 0) AS usage_micros
        FROM crypto_app_usage_reservations
        WHERE workspace_id = ? AND day_bucket = ? AND state != 'expired'
      `).get(input.workspaceId, dayBucket) as { usage_micros?: number } | undefined;
      const usageMicros = nonNegativeSafeInteger(
        Number(row?.usage_micros ?? 0),
        "crypto_app_policy_state_corrupt",
      );
      if (usageMicros + this.#maxCallCostMicros > this.#dailyWorkspaceLimitMicros) {
        throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_daily_quota_exceeded");
      }
      statement(this.#db, `
        INSERT INTO crypto_app_usage_reservations(
          reservation_id, workspace_id, connection_id, app_id, manifest_revision,
          action_id, run_id, call_id, day_bucket, reserved_cost_micros,
          actual_cost_micros, state, created_at_ms, expires_at_ms, reconciled_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, NULL)
      `).run(
        reservationId,
        input.workspaceId,
        input.connectionId,
        input.appId,
        input.manifestRevision,
        input.actionId,
        input.runId,
        input.callId,
        dayBucket,
        this.#maxCallCostMicros,
        nowMs,
        nowMs + this.#reservationTtlMs,
      );
      this.#db.exec("COMMIT;");
      return { reservationId, reservedCostMicros: this.#maxCallCostMicros };
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  reconcile(input: {
    reservationId: string;
    outcome: MatterhornCryptoAppOperationalOutcome;
    actualCostMicros: number;
  }): { reservedCostMicros: number; overCallLimit: boolean } {
    const actualCostMicros = nonNegativeSafeInteger(input.actualCostMicros, "crypto_app_actual_cost_invalid");
    const outcome = stateOutcome(input.outcome);
    const row = statement(this.#db, `
      UPDATE crypto_app_usage_reservations
      SET actual_cost_micros = ?, state = ?, reconciled_at_ms = ?
      WHERE reservation_id = ? AND state = 'pending'
      RETURNING reserved_cost_micros
    `).get(
      actualCostMicros,
      outcome,
      this.#now().getTime(),
      input.reservationId,
    ) as { reserved_cost_micros: number } | undefined;
    if (!row) throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_operational_reservation_unavailable");
    const reservedCostMicros = positiveSafeInteger(
      Number(row.reserved_cost_micros),
      "crypto_app_policy_state_corrupt",
    );
    return { reservedCostMicros, overCallLimit: actualCostMicros > reservedCostMicros };
  }

  usage(workspaceId: string, day = utcDay(this.#now())): {
    actualCostMicros: number;
    pendingReservedCostMicros: number;
  } {
    const rows = statement(this.#db, `
      SELECT reserved_cost_micros, actual_cost_micros, state
      FROM crypto_app_usage_reservations
      WHERE workspace_id = ? AND day_bucket = ? AND state != 'expired'
    `).all(workspaceId, day) as UsageRow[];
    let actualCostMicros = 0;
    let pendingReservedCostMicros = 0;
    for (const row of rows) {
      if (row.state === "pending") pendingReservedCostMicros += row.reserved_cost_micros;
      else actualCostMicros += row.actual_cost_micros ?? 0;
    }
    return { actualCostMicros, pendingReservedCostMicros };
  }

  circuitOpen(input: { workspaceId: string; circuitKey: string }): boolean {
    const row = statement(this.#db, `
      SELECT consecutive_failures, open_until_ms FROM crypto_app_circuits
      WHERE circuit_key = ? AND workspace_id = ? LIMIT 1
    `).get(input.circuitKey, input.workspaceId) as CircuitRow | undefined;
    if (!row) return false;
    const nowMs = this.#now().getTime();
    if (row.open_until_ms > nowMs) return true;
    if (row.open_until_ms > 0) {
      statement(this.#db, "DELETE FROM crypto_app_circuits WHERE circuit_key = ? AND workspace_id = ?")
        .run(input.circuitKey, input.workspaceId);
    }
    return false;
  }

  recordFailure(input: { workspaceId: string; circuitKey: string }): void {
    const nowMs = this.#now().getTime();
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = statement(this.#db, `
        SELECT consecutive_failures, open_until_ms FROM crypto_app_circuits
        WHERE circuit_key = ? AND workspace_id = ? LIMIT 1
      `).get(input.circuitKey, input.workspaceId) as CircuitRow | undefined;
      const consecutiveFailures = (existing?.consecutive_failures ?? 0) + 1;
      const openUntilMs = consecutiveFailures >= this.#circuitFailureThreshold
        ? nowMs + this.#circuitCooldownMs
        : 0;
      statement(this.#db, `
        INSERT INTO crypto_app_circuits(circuit_key, workspace_id, consecutive_failures, open_until_ms, updated_at_ms)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, circuit_key) DO UPDATE SET
          consecutive_failures = excluded.consecutive_failures,
          open_until_ms = excluded.open_until_ms,
          updated_at_ms = excluded.updated_at_ms
      `).run(input.circuitKey, input.workspaceId, consecutiveFailures, openUntilMs, nowMs);
      this.#db.exec("COMMIT;");
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  recordSuccess(input: { workspaceId: string; circuitKey: string }): void {
    statement(this.#db, "DELETE FROM crypto_app_circuits WHERE circuit_key = ? AND workspace_id = ?")
      .run(input.circuitKey, input.workspaceId);
  }

  purgeWorkspace(workspaceId: string): { usage: number; circuits: number } {
    const usage = statement(this.#db, "DELETE FROM crypto_app_usage_reservations WHERE workspace_id = ?")
      .run(workspaceId).changes ?? 0;
    const circuits = statement(this.#db, "DELETE FROM crypto_app_circuits WHERE workspace_id = ?")
      .run(workspaceId).changes ?? 0;
    return { usage, circuits };
  }

  close(): void {
    this.#db.close();
  }
}
