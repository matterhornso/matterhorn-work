import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { canonicalJson } from "./guarded-runtime-crypto.js";

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

export type MatterhornCryptoAppDeveloperUsageBucket = {
  day: string;
  actionId: string;
  calls: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  pending: number;
  abandoned: number;
  actualCostMicros: number;
  pendingReservedCostMicros: number;
  averageLatencyMs: number | null;
  maximumLatencyMs: number | null;
};

export type MatterhornCryptoAppDeveloperUsageReport = {
  version: "matterhorn.crypto-app-developer-usage.v1";
  appId: string;
  manifestRevision: string;
  costUnit: "micro_usd";
  windowDays: number;
  fromDay: string;
  throughDay: string;
  generatedAt: string;
  budgetPolicy: {
    scope: "per_workspace";
    dailyToolCostLimitMicros: number;
    perCallToolCostLimitMicros: number;
    walletTransactionLimitsIncluded: false;
  };
  totals: Omit<MatterhornCryptoAppDeveloperUsageBucket, "day" | "actionId">;
  byDay: Array<Omit<MatterhornCryptoAppDeveloperUsageBucket, "actionId">>;
  byAction: Array<Omit<MatterhornCryptoAppDeveloperUsageBucket, "day">>;
  privacy: {
    aggregateOnly: true;
    tenantIdentifiersIncluded: false;
    requestContentIncluded: false;
    walletDataIncluded: false;
  };
};

export type MatterhornCryptoAppOperationalPolicy = {
  reserve(input: {
    workspaceId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    actionId: string;
    runId: string;
    callId: string;
    reservationClass?: "upstream" | "public_block_cache";
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
  integritySecret?: string;
};

type UsageRow = {
  reservation_id: string;
  workspace_id: string;
  connection_id: string;
  app_id: string;
  manifest_revision: string;
  action_id: string;
  run_id: string;
  call_id: string;
  day_bucket: string;
  reserved_cost_micros: number;
  actual_cost_micros: number | null;
  state: string;
  created_at_ms: number;
  expires_at_ms: number;
  reconciled_at_ms: number | null;
  authority_seal: string | null;
};

type DeveloperUsageRow = {
  day_bucket: string;
  action_id: string;
  calls: number;
  succeeded: number;
  failed: number;
  timed_out: number;
  pending: number;
  abandoned: number;
  actual_cost_micros: number;
  pending_reserved_cost_micros: number;
  completed_calls: number;
  duration_sum_ms: number;
  maximum_latency_ms: number | null;
};

type CircuitRow = {
  circuit_key: string;
  workspace_id: string;
  consecutive_failures: number;
  open_until_ms: number;
  updated_at_ms: number;
  authority_seal: string | null;
};

const require = createRequire(import.meta.url);
const DEFAULT_DAILY_WORKSPACE_LIMIT_MICROS = 10_000_000;
const DEFAULT_MAX_CALL_COST_MICROS = 1_000_000;
const DEFAULT_RESERVATION_TTL_MS = 60_000;
const DEFAULT_CIRCUIT_FAILURE_THRESHOLD = 3;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 30_000;
const OPERATIONAL_AUTHORITY_KEY_SALT = "matterhorn:crypto-app-operational-authority-key:v1";
const RESERVATION_AUTHORITY_AAD_DOMAIN = "matterhorn:crypto-app-usage-reservation-authority:v1";
const CIRCUIT_AUTHORITY_AAD_DOMAIN = "matterhorn:crypto-app-circuit-authority:v1";
const OPERATIONAL_AUTHORITY_SECRET_MINIMUM_BYTES = 32;
const OPERATIONAL_AUTHORITY_SEAL_PATTERN = /^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}$/;

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

function aggregateDeveloperUsage(
  rows: MatterhornCryptoAppDeveloperUsageBucket[],
): Omit<MatterhornCryptoAppDeveloperUsageBucket, "day" | "actionId"> {
  const aggregate = {
    calls: 0,
    succeeded: 0,
    failed: 0,
    timedOut: 0,
    pending: 0,
    abandoned: 0,
    actualCostMicros: 0,
    pendingReservedCostMicros: 0,
    averageLatencyMs: null as number | null,
    maximumLatencyMs: null as number | null,
  };
  let completedCalls = 0;
  let durationSumMs = 0;
  for (const row of rows) {
    aggregate.calls += row.calls;
    aggregate.succeeded += row.succeeded;
    aggregate.failed += row.failed;
    aggregate.timedOut += row.timedOut;
    aggregate.pending += row.pending;
    aggregate.abandoned += row.abandoned;
    aggregate.actualCostMicros += row.actualCostMicros;
    aggregate.pendingReservedCostMicros += row.pendingReservedCostMicros;
    const completed = row.succeeded + row.failed + row.timedOut;
    if (row.averageLatencyMs !== null && completed > 0) {
      completedCalls += completed;
      durationSumMs += row.averageLatencyMs * completed;
    }
    if (row.maximumLatencyMs !== null) {
      aggregate.maximumLatencyMs = Math.max(aggregate.maximumLatencyMs ?? 0, row.maximumLatencyMs);
    }
  }
  aggregate.averageLatencyMs = completedCalls > 0 ? Math.round(durationSumMs / completedCalls) : null;
  return aggregate;
}

function stateOutcome(value: string): MatterhornCryptoAppOperationalOutcome {
  if (value === "success" || value === "error" || value === "timeout") return value;
  throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
}

type UsageAuthorityRecord = {
  reservationId: string;
  workspaceId: string;
  connectionId: string;
  appId: string;
  manifestRevision: string;
  actionId: string;
  runId: string;
  callId: string;
  dayBucket: string;
  reservedCostMicros: number;
  actualCostMicros: number | null;
  state: "pending" | "success" | "error" | "timeout" | "expired";
  createdAtMs: number;
  expiresAtMs: number;
  reconciledAtMs: number | null;
};

type CircuitAuthorityRecord = {
  circuitKey: string;
  workspaceId: string;
  consecutiveFailures: number;
  openUntilMs: number;
  updatedAtMs: number;
};

function boundedText(value: unknown, maximumBytes = 320): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
    && Buffer.byteLength(value, "utf8") <= maximumBytes;
}

function exactDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function safeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function operationalAuthorityKey(secret: string): Buffer {
  const input = Buffer.from(secret, "utf8");
  if (input.byteLength < OPERATIONAL_AUTHORITY_SECRET_MINIMUM_BYTES) {
    input.fill(0);
    throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_operational_integrity_secret_invalid");
  }
  const key = Buffer.from(hkdfSync(
    "sha256",
    input,
    OPERATIONAL_AUTHORITY_KEY_SALT,
    RESERVATION_AUTHORITY_AAD_DOMAIN,
    32,
  ));
  input.fill(0);
  return key;
}

function authorityAad(domain: string, value: unknown): Buffer {
  return Buffer.from(canonicalJson({ domain, value }), "utf8");
}

function sealAuthority(domain: string, value: unknown, key: Buffer): string {
  const aad = authorityAad(domain, value);
  const nonce = randomBytes(12);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad);
    cipher.final();
    const tag = cipher.getAuthTag();
    try {
      return `${nonce.toString("base64url")}.${tag.toString("base64url")}`;
    } finally {
      tag.fill(0);
    }
  } finally {
    aad.fill(0);
    nonce.fill(0);
  }
}

function authoritySealValid(domain: string, value: unknown, seal: string | null, key: Buffer): boolean {
  if (!seal || !OPERATIONAL_AUTHORITY_SEAL_PATTERN.test(seal)) return false;
  const [encodedNonce, encodedTag] = seal.split(".");
  const aad = authorityAad(domain, value);
  const nonce = Buffer.from(encodedNonce!, "base64url");
  const tag = Buffer.from(encodedTag!, "base64url");
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    decipher.final();
    return true;
  } catch {
    return false;
  } finally {
    aad.fill(0);
    nonce.fill(0);
    tag.fill(0);
  }
}

function usageAuthorityValue(row: UsageRow): UsageAuthorityRecord {
  const state = row.state;
  if (state !== "pending" && state !== "success" && state !== "error" && state !== "timeout" && state !== "expired") {
    throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
  }
  const identifiers = [
    row.reservation_id,
    row.workspace_id,
    row.connection_id,
    row.app_id,
    row.manifest_revision,
    row.action_id,
    row.run_id,
    row.call_id,
  ];
  if (!identifiers.every((value) => boundedText(value))
    || !exactDay(row.day_bucket)
    || !safeTimestamp(row.created_at_ms)
    || !safeTimestamp(row.expires_at_ms)
    || row.expires_at_ms < row.created_at_ms
    || !Number.isSafeInteger(row.reserved_cost_micros)
    || row.reserved_cost_micros < 0
    || (row.actual_cost_micros !== null && (!Number.isSafeInteger(row.actual_cost_micros) || row.actual_cost_micros < 0))
    || (row.reconciled_at_ms !== null && (!safeTimestamp(row.reconciled_at_ms) || row.reconciled_at_ms < row.created_at_ms))
    || (state === "pending" && (row.actual_cost_micros !== null || row.reconciled_at_ms !== null))
    || (state !== "pending" && (row.actual_cost_micros === null || row.reconciled_at_ms === null))
    || (state === "expired" && row.actual_cost_micros !== 0)) {
    throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
  }
  return {
    reservationId: row.reservation_id,
    workspaceId: row.workspace_id,
    connectionId: row.connection_id,
    appId: row.app_id,
    manifestRevision: row.manifest_revision,
    actionId: row.action_id,
    runId: row.run_id,
    callId: row.call_id,
    dayBucket: row.day_bucket,
    reservedCostMicros: row.reserved_cost_micros,
    actualCostMicros: row.actual_cost_micros,
    state,
    createdAtMs: row.created_at_ms,
    expiresAtMs: row.expires_at_ms,
    reconciledAtMs: row.reconciled_at_ms,
  };
}

function circuitAuthorityValue(row: CircuitRow): CircuitAuthorityRecord {
  if (!boundedText(row.workspace_id)
    || !boundedText(row.circuit_key, 2_048)
    || !Number.isSafeInteger(row.consecutive_failures)
    || row.consecutive_failures < 1
    || !safeTimestamp(row.open_until_ms)
    || !safeTimestamp(row.updated_at_ms)
    || (row.open_until_ms > 0 && row.open_until_ms < row.updated_at_ms)) {
    throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
  }
  return {
    circuitKey: row.circuit_key,
    workspaceId: row.workspace_id,
    consecutiveFailures: row.consecutive_failures,
    openUntilMs: row.open_until_ms,
    updatedAtMs: row.updated_at_ms,
  };
}

function verifiedUsage(row: UsageRow, key: Buffer): UsageAuthorityRecord {
  const value = usageAuthorityValue(row);
  if (!authoritySealValid(RESERVATION_AUTHORITY_AAD_DOMAIN, value, row.authority_seal, key)) {
    throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
  }
  return value;
}

function verifiedCircuit(row: CircuitRow, key: Buffer): CircuitAuthorityRecord {
  const value = circuitAuthorityValue(row);
  if (!authoritySealValid(CIRCUIT_AUTHORITY_AAD_DOMAIN, value, row.authority_seal, key)) {
    throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
  }
  return value;
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
  readonly #authorityKey: Buffer;
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
    this.#authorityKey = operationalAuthorityKey(
      options.integritySecret ?? process.env.MATTERHORN_CRYPTO_APP_OPERATIONAL_INTEGRITY_SECRET ?? "",
    );
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
    try {
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
        authority_seal TEXT NOT NULL,
        UNIQUE(workspace_id, run_id, call_id, action_id)
      );
      CREATE INDEX IF NOT EXISTS crypto_app_usage_workspace_day_idx
        ON crypto_app_usage_reservations(workspace_id, day_bucket, state);
      CREATE INDEX IF NOT EXISTS crypto_app_usage_expiry_idx
        ON crypto_app_usage_reservations(state, expires_at_ms);
      CREATE INDEX IF NOT EXISTS crypto_app_usage_developer_report_idx
        ON crypto_app_usage_reservations(app_id, manifest_revision, day_bucket, action_id, state);
      CREATE TABLE IF NOT EXISTS crypto_app_circuits (
        circuit_key TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        consecutive_failures INTEGER NOT NULL,
        open_until_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        authority_seal TEXT NOT NULL,
        PRIMARY KEY(workspace_id, circuit_key)
      );
      CREATE INDEX IF NOT EXISTS crypto_app_circuit_workspace_idx
        ON crypto_app_circuits(workspace_id, updated_at_ms);
      `);
      const usageColumns = statement(this.#db, "PRAGMA table_info(crypto_app_usage_reservations)")
        .all() as Array<{ name?: unknown }>;
      if (!usageColumns.some((column) => column.name === "authority_seal")) {
        this.#db.exec("ALTER TABLE crypto_app_usage_reservations ADD COLUMN authority_seal TEXT;");
        this.#backfillUsageAuthoritySeals();
      }
      const circuitColumns = statement(this.#db, "PRAGMA table_info(crypto_app_circuits)")
        .all() as Array<{ name?: unknown }>;
      if (!circuitColumns.some((column) => column.name === "authority_seal")) {
        this.#db.exec("ALTER TABLE crypto_app_circuits ADD COLUMN authority_seal TEXT;");
        this.#backfillCircuitAuthoritySeals();
      }
      for (const row of statement(this.#db, "SELECT * FROM crypto_app_usage_reservations").all() as UsageRow[]) {
        verifiedUsage(row, this.#authorityKey);
      }
      for (const row of statement(this.#db, "SELECT * FROM crypto_app_circuits").all() as CircuitRow[]) {
        verifiedCircuit(row, this.#authorityKey);
      }
      this.#db.exec(`
        CREATE TRIGGER IF NOT EXISTS crypto_app_usage_authority_seal_insert
        BEFORE INSERT ON crypto_app_usage_reservations
        WHEN NEW.authority_seal IS NULL
          OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN
          SELECT RAISE(ABORT, 'crypto_app_policy_state_corrupt');
        END;
        CREATE TRIGGER IF NOT EXISTS crypto_app_usage_authority_seal_update
        BEFORE UPDATE OF authority_seal ON crypto_app_usage_reservations
        WHEN NEW.authority_seal IS NULL
          OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN
          SELECT RAISE(ABORT, 'crypto_app_policy_state_corrupt');
        END;
        CREATE TRIGGER IF NOT EXISTS crypto_app_circuit_authority_seal_insert
        BEFORE INSERT ON crypto_app_circuits
        WHEN NEW.authority_seal IS NULL
          OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN
          SELECT RAISE(ABORT, 'crypto_app_policy_state_corrupt');
        END;
        CREATE TRIGGER IF NOT EXISTS crypto_app_circuit_authority_seal_update
        BEFORE UPDATE OF authority_seal ON crypto_app_circuits
        WHEN NEW.authority_seal IS NULL
          OR length(NEW.authority_seal) <> 39
          OR NEW.authority_seal NOT GLOB '[A-Za-z0-9_-]*.[A-Za-z0-9_-]*'
        BEGIN
          SELECT RAISE(ABORT, 'crypto_app_policy_state_corrupt');
        END;
      `);
      chmodSync(path, 0o600);
    } catch (error) {
      this.#db.close();
      this.#authorityKey.fill(0);
      throw error;
    }
  }

  reserve(input: {
    workspaceId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    actionId: string;
    runId: string;
    callId: string;
    reservationClass?: "upstream" | "public_block_cache";
  }): { reservationId: string; reservedCostMicros: number } {
    if (![input.workspaceId, input.connectionId, input.appId, input.manifestRevision, input.actionId, input.runId, input.callId]
      .every((value) => boundedText(value))) {
      throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_input_invalid");
    }
    const now = this.#now();
    const nowMs = now.getTime();
    const dayBucket = utcDay(now);
    const reservationId = this.#id();
    const reservedCostMicros = input.reservationClass === "public_block_cache"
      ? 0
      : this.#maxCallCostMicros;
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const expiredRows = statement(this.#db, `
        SELECT * FROM crypto_app_usage_reservations
        WHERE state = 'pending' AND expires_at_ms <= ?
      `).all(nowMs) as UsageRow[];
      for (const row of expiredRows) {
        const current = verifiedUsage(row, this.#authorityKey);
        const expired: UsageAuthorityRecord = {
          ...current,
          actualCostMicros: 0,
          state: "expired",
          reconciledAtMs: nowMs,
        };
        const changed = statement(this.#db, `
          UPDATE crypto_app_usage_reservations
          SET state = 'expired', actual_cost_micros = 0, reconciled_at_ms = ?, authority_seal = ?
          WHERE reservation_id = ? AND state = 'pending' AND authority_seal = ?
        `).run(
          nowMs,
          sealAuthority(RESERVATION_AUTHORITY_AAD_DOMAIN, expired, this.#authorityKey),
          current.reservationId,
          row.authority_seal,
        ).changes ?? 0;
        if (changed !== 1) throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
      }
      const duplicate = statement(this.#db, `
        SELECT * FROM crypto_app_usage_reservations
        WHERE workspace_id = ? AND run_id = ? AND call_id = ? AND action_id = ?
        LIMIT 1
      `).get(input.workspaceId, input.runId, input.callId, input.actionId) as UsageRow | undefined;
      if (duplicate) {
        verifiedUsage(duplicate, this.#authorityKey);
        throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_operational_replay");
      }
      const rows = statement(this.#db, `
        SELECT *
        FROM crypto_app_usage_reservations
        WHERE workspace_id = ? AND day_bucket = ? AND state != 'expired'
      `).all(input.workspaceId, dayBucket) as UsageRow[];
      const usageMicros = rows.reduce((total, row) => {
        const current = verifiedUsage(row, this.#authorityKey);
        return total + (current.state === "pending"
          ? current.reservedCostMicros
          : current.actualCostMicros ?? 0);
      }, 0);
      nonNegativeSafeInteger(usageMicros, "crypto_app_policy_state_corrupt");
      if (usageMicros + reservedCostMicros > this.#dailyWorkspaceLimitMicros) {
        throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_daily_quota_exceeded");
      }
      const reservation: UsageAuthorityRecord = {
        reservationId,
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        appId: input.appId,
        manifestRevision: input.manifestRevision,
        actionId: input.actionId,
        runId: input.runId,
        callId: input.callId,
        dayBucket,
        reservedCostMicros,
        actualCostMicros: null,
        state: "pending",
        createdAtMs: nowMs,
        expiresAtMs: nowMs + this.#reservationTtlMs,
        reconciledAtMs: null,
      };
      statement(this.#db, `
        INSERT INTO crypto_app_usage_reservations(
          reservation_id, workspace_id, connection_id, app_id, manifest_revision,
          action_id, run_id, call_id, day_bucket, reserved_cost_micros,
          actual_cost_micros, state, created_at_ms, expires_at_ms, reconciled_at_ms,
          authority_seal
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, ?, NULL, ?)
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
        reservedCostMicros,
        nowMs,
        nowMs + this.#reservationTtlMs,
        sealAuthority(RESERVATION_AUTHORITY_AAD_DOMAIN, reservation, this.#authorityKey),
      );
      this.#db.exec("COMMIT;");
      return { reservationId, reservedCostMicros };
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
    const nowMs = this.#now().getTime();
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const row = statement(this.#db, `
        SELECT * FROM crypto_app_usage_reservations
        WHERE reservation_id = ? AND state = 'pending' LIMIT 1
      `).get(input.reservationId) as UsageRow | undefined;
      if (!row) throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_operational_reservation_unavailable");
      const current = verifiedUsage(row, this.#authorityKey);
      const reconciled: UsageAuthorityRecord = {
        ...current,
        actualCostMicros,
        state: outcome,
        reconciledAtMs: nowMs,
      };
      const changed = statement(this.#db, `
      UPDATE crypto_app_usage_reservations
      SET actual_cost_micros = ?, state = ?, reconciled_at_ms = ?, authority_seal = ?
      WHERE reservation_id = ? AND state = 'pending' AND authority_seal = ?
    `).run(
        actualCostMicros,
        outcome,
        nowMs,
        sealAuthority(RESERVATION_AUTHORITY_AAD_DOMAIN, reconciled, this.#authorityKey),
        input.reservationId,
        row.authority_seal,
      ).changes ?? 0;
      if (changed !== 1) {
        throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_operational_reservation_unavailable");
      }
      this.#db.exec("COMMIT;");
      return {
        reservedCostMicros: current.reservedCostMicros,
        overCallLimit: actualCostMicros > current.reservedCostMicros,
      };
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  usage(workspaceId: string, day = utcDay(this.#now())): {
    actualCostMicros: number;
    pendingReservedCostMicros: number;
  } {
    const rows = statement(this.#db, `
      SELECT *
      FROM crypto_app_usage_reservations
      WHERE workspace_id = ? AND day_bucket = ? AND state != 'expired'
    `).all(workspaceId, day) as UsageRow[];
    let actualCostMicros = 0;
    let pendingReservedCostMicros = 0;
    for (const row of rows) {
      const current = verifiedUsage(row, this.#authorityKey);
      if (current.state === "pending") pendingReservedCostMicros += current.reservedCostMicros;
      else actualCostMicros += current.actualCostMicros ?? 0;
    }
    return { actualCostMicros, pendingReservedCostMicros };
  }

  /**
   * App-revision aggregate for the owning developer portal. The query never
   * selects workspace, connection, run, call or reservation identifiers and
   * therefore cannot become a tenant-enumeration surface.
   */
  developerUsage(input: {
    appId: string;
    manifestRevision: string;
    windowDays?: number;
  }): MatterhornCryptoAppDeveloperUsageReport {
    const windowDays = positiveSafeInteger(
      input.windowDays ?? 7,
      "crypto_app_usage_window_invalid",
    );
    if (windowDays > 30) {
      throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_usage_window_invalid");
    }
    const now = this.#now();
    const throughDay = utcDay(now);
    const from = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (windowDays - 1),
    ));
    const fromDay = utcDay(from);
    const nowMs = now.getTime();
    const authorityRows = statement(this.#db, `
      SELECT * FROM crypto_app_usage_reservations
      WHERE app_id = ? AND manifest_revision = ? AND day_bucket BETWEEN ? AND ?
    `).all(input.appId, input.manifestRevision, fromDay, throughDay) as UsageRow[];
    for (const row of authorityRows) verifiedUsage(row, this.#authorityKey);
    const rawRows = statement(this.#db, `
      SELECT
        day_bucket,
        action_id,
        COUNT(*) AS calls,
        SUM(CASE WHEN state = 'success' THEN 1 ELSE 0 END) AS succeeded,
        SUM(CASE WHEN state = 'error' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN state = 'timeout' THEN 1 ELSE 0 END) AS timed_out,
        SUM(CASE WHEN state = 'pending' AND expires_at_ms > ? THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN state = 'expired' OR (state = 'pending' AND expires_at_ms <= ?) THEN 1 ELSE 0 END) AS abandoned,
        SUM(CASE
          WHEN state IN ('success', 'error', 'timeout') THEN COALESCE(actual_cost_micros, 0)
          ELSE 0
        END) AS actual_cost_micros,
        SUM(CASE
          WHEN state = 'pending' AND expires_at_ms > ? THEN reserved_cost_micros
          ELSE 0
        END) AS pending_reserved_cost_micros,
        SUM(CASE WHEN state IN ('success', 'error', 'timeout') THEN 1 ELSE 0 END) AS completed_calls,
        SUM(CASE
          WHEN state IN ('success', 'error', 'timeout') AND reconciled_at_ms IS NOT NULL
            THEN MAX(reconciled_at_ms - created_at_ms, 0)
          ELSE 0
        END) AS duration_sum_ms,
        MAX(CASE
          WHEN state IN ('success', 'error', 'timeout') AND reconciled_at_ms IS NOT NULL
            THEN MAX(reconciled_at_ms - created_at_ms, 0)
          ELSE NULL
        END) AS maximum_latency_ms
      FROM crypto_app_usage_reservations
      WHERE app_id = ? AND manifest_revision = ? AND day_bucket BETWEEN ? AND ?
      GROUP BY day_bucket, action_id
      ORDER BY day_bucket ASC, action_id ASC
    `).all(
      nowMs,
      nowMs,
      nowMs,
      input.appId,
      input.manifestRevision,
      fromDay,
      throughDay,
    ) as DeveloperUsageRow[];
    const rows = rawRows.map((row): MatterhornCryptoAppDeveloperUsageBucket => {
      const numeric = [
        row.calls,
        row.succeeded,
        row.failed,
        row.timed_out,
        row.pending,
        row.abandoned,
        row.actual_cost_micros,
        row.pending_reserved_cost_micros,
        row.completed_calls,
        row.duration_sum_ms,
      ].map(Number);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day_bucket)
        || typeof row.action_id !== "string"
        || row.action_id.length < 1
        || row.action_id.length > 160
        || numeric.some((value) => !Number.isSafeInteger(value) || value < 0)
        || numeric[0] !== numeric[1]! + numeric[2]! + numeric[3]! + numeric[4]! + numeric[5]!) {
        throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
      }
      const maximumLatencyMs = row.maximum_latency_ms === null ? null : Number(row.maximum_latency_ms);
      if (maximumLatencyMs !== null && (!Number.isSafeInteger(maximumLatencyMs) || maximumLatencyMs < 0)) {
        throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
      }
      const completedCalls = numeric[8]!;
      return {
        day: row.day_bucket,
        actionId: row.action_id,
        calls: numeric[0]!,
        succeeded: numeric[1]!,
        failed: numeric[2]!,
        timedOut: numeric[3]!,
        pending: numeric[4]!,
        abandoned: numeric[5]!,
        actualCostMicros: numeric[6]!,
        pendingReservedCostMicros: numeric[7]!,
        averageLatencyMs: completedCalls > 0 ? Math.round(numeric[9]! / completedCalls) : null,
        maximumLatencyMs,
      };
    });
    const byDay = [...new Set(rows.map((row) => row.day))].map((day) => ({
      day,
      ...aggregateDeveloperUsage(rows.filter((row) => row.day === day)),
    }));
    const byAction = [...new Set(rows.map((row) => row.actionId))].map((actionId) => ({
      actionId,
      ...aggregateDeveloperUsage(rows.filter((row) => row.actionId === actionId)),
    }));
    return {
      version: "matterhorn.crypto-app-developer-usage.v1",
      appId: input.appId,
      manifestRevision: input.manifestRevision,
      costUnit: "micro_usd",
      windowDays,
      fromDay,
      throughDay,
      generatedAt: now.toISOString(),
      budgetPolicy: {
        scope: "per_workspace",
        dailyToolCostLimitMicros: this.#dailyWorkspaceLimitMicros,
        perCallToolCostLimitMicros: this.#maxCallCostMicros,
        walletTransactionLimitsIncluded: false,
      },
      totals: aggregateDeveloperUsage(rows),
      byDay,
      byAction,
      privacy: {
        aggregateOnly: true,
        tenantIdentifiersIncluded: false,
        requestContentIncluded: false,
        walletDataIncluded: false,
      },
    };
  }

  circuitOpen(input: { workspaceId: string; circuitKey: string }): boolean {
    if (!boundedText(input.workspaceId) || !boundedText(input.circuitKey, 2_048)) {
      throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_input_invalid");
    }
    const row = statement(this.#db, `
      SELECT * FROM crypto_app_circuits
      WHERE circuit_key = ? AND workspace_id = ? LIMIT 1
    `).get(input.circuitKey, input.workspaceId) as CircuitRow | undefined;
    if (!row) return false;
    const current = verifiedCircuit(row, this.#authorityKey);
    const nowMs = this.#now().getTime();
    if (current.openUntilMs > nowMs) return true;
    if (current.openUntilMs > 0) {
      const changed = statement(this.#db, `
        DELETE FROM crypto_app_circuits
        WHERE circuit_key = ? AND workspace_id = ? AND authority_seal = ?
      `).run(input.circuitKey, input.workspaceId, row.authority_seal).changes ?? 0;
      if (changed !== 1) throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
    }
    return false;
  }

  recordFailure(input: { workspaceId: string; circuitKey: string }): void {
    if (!boundedText(input.workspaceId) || !boundedText(input.circuitKey, 2_048)) {
      throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_input_invalid");
    }
    const nowMs = this.#now().getTime();
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      const existing = statement(this.#db, `
        SELECT * FROM crypto_app_circuits
        WHERE circuit_key = ? AND workspace_id = ? LIMIT 1
      `).get(input.circuitKey, input.workspaceId) as CircuitRow | undefined;
      const current = existing ? verifiedCircuit(existing, this.#authorityKey) : null;
      const consecutiveFailures = (current?.consecutiveFailures ?? 0) + 1;
      const openUntilMs = consecutiveFailures >= this.#circuitFailureThreshold
        ? nowMs + this.#circuitCooldownMs
        : 0;
      const next: CircuitAuthorityRecord = {
        circuitKey: input.circuitKey,
        workspaceId: input.workspaceId,
        consecutiveFailures,
        openUntilMs,
        updatedAtMs: nowMs,
      };
      statement(this.#db, `
        INSERT INTO crypto_app_circuits(
          circuit_key, workspace_id, consecutive_failures, open_until_ms, updated_at_ms, authority_seal
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, circuit_key) DO UPDATE SET
          consecutive_failures = excluded.consecutive_failures,
          open_until_ms = excluded.open_until_ms,
          updated_at_ms = excluded.updated_at_ms,
          authority_seal = excluded.authority_seal
      `).run(
        input.circuitKey,
        input.workspaceId,
        consecutiveFailures,
        openUntilMs,
        nowMs,
        sealAuthority(CIRCUIT_AUTHORITY_AAD_DOMAIN, next, this.#authorityKey),
      );
      this.#db.exec("COMMIT;");
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  recordSuccess(input: { workspaceId: string; circuitKey: string }): void {
    if (!boundedText(input.workspaceId) || !boundedText(input.circuitKey, 2_048)) {
      throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_input_invalid");
    }
    const row = statement(this.#db, `
      SELECT * FROM crypto_app_circuits
      WHERE circuit_key = ? AND workspace_id = ? LIMIT 1
    `).get(input.circuitKey, input.workspaceId) as CircuitRow | undefined;
    if (!row) return;
    verifiedCircuit(row, this.#authorityKey);
    const changed = statement(this.#db, `
      DELETE FROM crypto_app_circuits
      WHERE circuit_key = ? AND workspace_id = ? AND authority_seal = ?
    `).run(input.circuitKey, input.workspaceId, row.authority_seal).changes ?? 0;
    if (changed !== 1) throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
  }

  purgeWorkspace(workspaceId: string): { usage: number; circuits: number } {
    if (!boundedText(workspaceId)) {
      throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_input_invalid");
    }
    const usage = statement(this.#db, "DELETE FROM crypto_app_usage_reservations WHERE workspace_id = ?")
      .run(workspaceId).changes ?? 0;
    const circuits = statement(this.#db, "DELETE FROM crypto_app_circuits WHERE workspace_id = ?")
      .run(workspaceId).changes ?? 0;
    return { usage, circuits };
  }

  close(): void {
    this.#db.close();
    this.#authorityKey.fill(0);
  }

  #backfillUsageAuthoritySeals(): void {
    const rows = statement(this.#db, `
      SELECT * FROM crypto_app_usage_reservations WHERE authority_seal IS NULL
    `).all() as UsageRow[];
    if (rows.length === 0) return;
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      for (const row of rows) {
        const value = usageAuthorityValue(row);
        const changed = statement(this.#db, `
          UPDATE crypto_app_usage_reservations SET authority_seal = ?
          WHERE reservation_id = ? AND authority_seal IS NULL
        `).run(
          sealAuthority(RESERVATION_AUTHORITY_AAD_DOMAIN, value, this.#authorityKey),
          value.reservationId,
        ).changes ?? 0;
        if (changed !== 1) throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
      }
      this.#db.exec("COMMIT;");
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }

  #backfillCircuitAuthoritySeals(): void {
    const rows = statement(this.#db, `
      SELECT * FROM crypto_app_circuits WHERE authority_seal IS NULL
    `).all() as CircuitRow[];
    if (rows.length === 0) return;
    this.#db.exec("BEGIN IMMEDIATE;");
    try {
      for (const row of rows) {
        const value = circuitAuthorityValue(row);
        const changed = statement(this.#db, `
          UPDATE crypto_app_circuits SET authority_seal = ?
          WHERE workspace_id = ? AND circuit_key = ? AND authority_seal IS NULL
        `).run(
          sealAuthority(CIRCUIT_AUTHORITY_AAD_DOMAIN, value, this.#authorityKey),
          value.workspaceId,
          value.circuitKey,
        ).changes ?? 0;
        if (changed !== 1) throw new MatterhornCryptoAppOperationalPolicyError("crypto_app_policy_state_corrupt");
      }
      this.#db.exec("COMMIT;");
    } catch (error) {
      this.#db.exec("ROLLBACK;");
      throw error;
    }
  }
}
