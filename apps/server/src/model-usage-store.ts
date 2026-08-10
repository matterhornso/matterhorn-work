import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type {
  MatterhornModelUsageBreakdown,
  MatterhornModelUsageEnforcement,
  MatterhornModelUsagePeriod,
  MatterhornModelUsageStatus,
} from "@matterhorn-work/types/model-usage";
import { MATTERHORN_MODEL_USAGE_VERSION } from "@matterhorn-work/types/model-usage";
import { resolveMatterhornDataRoot } from "./auth-store.js";

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
  transaction?: <T extends (...args: never[]) => unknown>(fn: T) => T;
};
type SqliteConstructor = new (path: string) => SqliteDatabase;

export type MatterhornModelUsageConfig = {
  enforcement: MatterhornModelUsageEnforcement;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  globalDailyLimit: number | null;
  globalMonthlyLimit: number | null;
  reservationTokens: number;
  modelWeights: Record<string, number>;
};

export type ModelUsageSubject = {
  id: string;
};

export type ModelUsageReservation = {
  allowed: true;
  reservationId: string | null;
  status: MatterhornModelUsageStatus;
} | {
  allowed: false;
  reservationId: null;
  status: MatterhornModelUsageStatus;
};

export type ModelUsageAssistantMessage = {
  id: string;
  createdAt: number;
  completedAt: number;
  providerId: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  rawTokens: number;
  providerCostUsd: number;
};

type UsageTotalRow = {
  used_tokens?: number | null;
  reserved_tokens?: number | null;
  charged_tokens?: number | null;
  pending_requests?: number | null;
};

type PendingOperationRow = {
  id: string;
  provider_id: string;
  model_id: string;
  weight_milli: number;
  created_at: number;
};

type ModelBreakdownRow = {
  provider_id: string;
  model_id: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  raw_tokens: number;
  charged_tokens: number;
  provider_cost_micros: number;
};

const require = createRequire(import.meta.url);
const DEFAULT_DAILY_LIMIT = 250_000;
const DEFAULT_MONTHLY_LIMIT = 2_000_000;
const DEFAULT_GLOBAL_DAILY_LIMIT = 5_000_000;
const DEFAULT_GLOBAL_MONTHLY_LIMIT = 50_000_000;
const DEFAULT_RESERVATION_TOKENS = 32_000;

function openSqliteDatabase(path: string): SqliteDatabase {
  if (process.versions.bun) {
    const bunSqlite = require("bun:sqlite") as {
      Database: new (path: string) => SqliteDatabase;
    };
    return new bunSqlite.Database(path);
  }
  const betterSqlite = require("better-sqlite3") as
    | { default?: SqliteConstructor }
    | SqliteConstructor;
  const DatabaseCtor = (
    typeof betterSqlite === "function" ? betterSqlite : betterSqlite.default
  ) as SqliteConstructor;
  return new DatabaseCtor(path);
}

function statement(db: SqliteDatabase, sql: string): SqliteStatement {
  if (db.prepare) return db.prepare(sql);
  if (db.query) return db.query(sql);
  throw new Error("SQLite database does not support prepare/query.");
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalPositiveInteger(value: string | undefined, fallback: number): number | null {
  if (value?.trim() === "unlimited") return null;
  return positiveInteger(value, fallback);
}

function modelWeights(value: string | undefined): Record<string, number> {
  if (!value?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const weights: Record<string, number> = {};
    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0.1 || entry > 100) continue;
      const normalized = key.trim().toLowerCase();
      if (normalized) weights[normalized] = entry;
    }
    return weights;
  } catch {
    return {};
  }
}

export function resolveMatterhornModelUsageConfig(
  env: NodeJS.ProcessEnv = process.env,
): MatterhornModelUsageConfig {
  const requested = env.MATTERHORN_MODEL_USAGE_ENFORCEMENT?.trim().toLowerCase();
  const enforcement: MatterhornModelUsageEnforcement =
    requested === "hard" || requested === "monitor" || requested === "off"
      ? requested
      : "off";
  return {
    enforcement,
    dailyLimit: optionalPositiveInteger(env.MATTERHORN_MODEL_USAGE_DAILY_LIMIT, DEFAULT_DAILY_LIMIT),
    monthlyLimit: optionalPositiveInteger(env.MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT, DEFAULT_MONTHLY_LIMIT),
    globalDailyLimit: optionalPositiveInteger(
      env.MATTERHORN_MODEL_USAGE_GLOBAL_DAILY_LIMIT,
      DEFAULT_GLOBAL_DAILY_LIMIT,
    ),
    globalMonthlyLimit: optionalPositiveInteger(
      env.MATTERHORN_MODEL_USAGE_GLOBAL_MONTHLY_LIMIT,
      DEFAULT_GLOBAL_MONTHLY_LIMIT,
    ),
    reservationTokens: positiveInteger(
      env.MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS,
      DEFAULT_RESERVATION_TOKENS,
    ),
    modelWeights: modelWeights(env.MATTERHORN_MODEL_USAGE_WEIGHTS_JSON),
  };
}

export function resolveMatterhornModelUsageDatabasePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.MATTERHORN_MODEL_USAGE_DB?.trim();
  if (override) return resolve(override);
  return join(resolveMatterhornDataRoot(), "usage", "model-usage.db");
}

function utcPeriods(now: Date) {
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return { dayStart, dayEnd, monthStart, monthEnd };
}

function finiteInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function modelUsageAssistantMessages(value: unknown): ModelUsageAssistantMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ModelUsageAssistantMessage[] = [];
  for (const entry of value) {
    const message = recordValue(entry);
    const info = recordValue(message?.info);
    const time = recordValue(info?.time);
    const tokens = recordValue(info?.tokens);
    const cache = recordValue(tokens?.cache);
    if (info?.role !== "assistant") continue;
    const id = typeof info.id === "string" ? info.id.trim() : "";
    const createdAt = finiteInteger(time?.created);
    const completedAt = finiteInteger(time?.completed);
    if (!id || !createdAt || !completedAt || !tokens) continue;
    const inputTokens = finiteInteger(tokens.input);
    const outputTokens = finiteInteger(tokens.output);
    const reasoningTokens = finiteInteger(tokens.reasoning);
    const cacheReadTokens = finiteInteger(cache?.read);
    const cacheWriteTokens = finiteInteger(cache?.write);
    const reportedTotal = finiteInteger(tokens.total);
    messages.push({
      id,
      createdAt,
      completedAt,
      providerId: typeof info.providerID === "string" ? info.providerID.trim() : "unknown",
      modelId: typeof info.modelID === "string" ? info.modelID.trim() : "unknown",
      inputTokens,
      outputTokens,
      reasoningTokens,
      cacheReadTokens,
      cacheWriteTokens,
      rawTokens: reportedTotal || inputTokens + outputTokens + reasoningTokens,
      providerCostUsd: finiteNumber(info.cost),
    });
  }
  return messages.sort((left, right) => left.createdAt - right.createdAt);
}

function periodSnapshot(
  total: UsageTotalRow,
  limit: number | null,
  resetsAt: number,
): MatterhornModelUsagePeriod {
  const chargedTokens = finiteInteger(total.charged_tokens);
  return {
    usedTokens: finiteInteger(total.used_tokens),
    reservedTokens: finiteInteger(total.reserved_tokens),
    chargedTokens,
    limit,
    remainingTokens: limit === null ? null : Math.max(0, limit - chargedTokens),
    resetsAt: new Date(resetsAt).toISOString(),
  };
}

function weightFor(config: MatterhornModelUsageConfig, providerId: string, modelId: string): number {
  const providerModel = `${providerId}/${modelId}`.toLowerCase();
  return config.modelWeights[providerModel] ?? config.modelWeights[modelId.toLowerCase()] ?? 1;
}

export class MatterhornModelUsageStore {
  private readonly db: SqliteDatabase;
  private closed = false;
  readonly config: MatterhornModelUsageConfig;

  constructor(options: {
    path?: string;
    config?: MatterhornModelUsageConfig;
  } = {}) {
    const path = options.path ?? resolveMatterhornModelUsageDatabasePath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = openSqliteDatabase(path);
    this.config = options.config ?? resolveMatterhornModelUsageConfig();
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_usage_operations (
        id TEXT PRIMARY KEY,
        subject_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        weight_milli INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled')),
        reserved_tokens INTEGER NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        raw_tokens INTEGER NOT NULL DEFAULT 0,
        charged_tokens INTEGER NOT NULL,
        provider_cost_micros INTEGER NOT NULL DEFAULT 0,
        assistant_message_id TEXT UNIQUE,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS model_usage_subject_created_idx
        ON model_usage_operations(subject_id, created_at);
      CREATE INDEX IF NOT EXISTS model_usage_session_pending_idx
        ON model_usage_operations(subject_id, workspace_id, session_id, status, created_at);
      CREATE INDEX IF NOT EXISTS model_usage_global_created_idx
        ON model_usage_operations(created_at);
    `);
  }

  close(): void {
    this.closed = true;
    this.db.close();
  }

  get isClosed(): boolean {
    return this.closed;
  }

  reserve(input: {
    subject: ModelUsageSubject;
    workspaceId: string;
    sessionId: string;
    providerId: string;
    modelId: string;
    now?: Date;
  }): ModelUsageReservation {
    return this.withImmediateTransaction(() => this.reserveUnlocked(input));
  }

  private reserveUnlocked(input: {
    subject: ModelUsageSubject;
    workspaceId: string;
    sessionId: string;
    providerId: string;
    modelId: string;
    now?: Date;
  }): ModelUsageReservation {
    const now = input.now ?? new Date();
    const current = this.status(input.subject, now);
    const weight = weightFor(this.config, input.providerId, input.modelId);
    const chargedTokens = Math.ceil(this.config.reservationTokens * weight);
    if (this.config.enforcement === "off") {
      return { allowed: true, reservationId: null, status: current };
    }
    const weightedBlockReason =
      current.daily.remainingTokens !== null && current.daily.remainingTokens < chargedTokens ? "daily_limit" :
      current.monthly.remainingTokens !== null && current.monthly.remainingTokens < chargedTokens ? "monthly_limit" :
      this.belowGlobalLimit(now, "daily", chargedTokens) ? "global_daily_limit" :
      this.belowGlobalLimit(now, "monthly", chargedTokens) ? "global_monthly_limit" :
      null;
    if (this.config.enforcement === "hard" && weightedBlockReason) {
      return {
        allowed: false,
        reservationId: null,
        status: { ...current, canStartRequest: false, blockReason: weightedBlockReason },
      };
    }

    const id = randomUUID();
    statement(this.db, `
      INSERT INTO model_usage_operations (
        id, subject_id, workspace_id, session_id, provider_id, model_id,
        weight_milli, status, reserved_tokens, charged_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      id,
      input.subject.id,
      input.workspaceId,
      input.sessionId,
      input.providerId,
      input.modelId,
      Math.round(weight * 1000),
      this.config.reservationTokens,
      chargedTokens,
      now.getTime(),
    );
    return { allowed: true, reservationId: id, status: this.status(input.subject, now) };
  }

  cancel(reservationId: string | null): void {
    if (!reservationId) return;
    statement(this.db, `
      UPDATE model_usage_operations
      SET status = 'cancelled', charged_tokens = 0, completed_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(Date.now(), reservationId);
  }

  reconcile(input: {
    subject: ModelUsageSubject;
    workspaceId: string;
    sessionId: string;
    messages: unknown;
  }): number {
    const pending = statement(this.db, `
      SELECT id, provider_id, model_id, weight_milli, created_at
      FROM model_usage_operations
      WHERE subject_id = ? AND workspace_id = ? AND session_id = ? AND status = 'pending'
      ORDER BY created_at ASC
    `).all(input.subject.id, input.workspaceId, input.sessionId) as PendingOperationRow[];
    if (!pending.length) return 0;

    const usedMessageIds = new Set(
      statement(this.db, `
        SELECT assistant_message_id
        FROM model_usage_operations
        WHERE assistant_message_id IS NOT NULL
      `).all().map((row) => {
        const value = recordValue(row)?.assistant_message_id;
        return typeof value === "string" ? value : "";
      }).filter(Boolean),
    );
    const messages = modelUsageAssistantMessages(input.messages)
      .filter((message) => !usedMessageIds.has(message.id));
    let reconciled = 0;

    for (const operation of pending) {
      const messageIndex = messages.findIndex((message) => (
        message.createdAt >= operation.created_at - 5_000 &&
        (operation.provider_id === "unknown" || message.providerId === operation.provider_id) &&
        (operation.model_id === "unknown" || message.modelId === operation.model_id)
      ));
      if (messageIndex < 0) continue;
      const [message] = messages.splice(messageIndex, 1);
      const weight = operation.weight_milli / 1000;
      statement(this.db, `
        UPDATE model_usage_operations
        SET status = 'completed', input_tokens = ?, output_tokens = ?, reasoning_tokens = ?,
            cache_read_tokens = ?, cache_write_tokens = ?, raw_tokens = ?, charged_tokens = ?,
            provider_cost_micros = ?, assistant_message_id = ?, completed_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(
        message.inputTokens,
        message.outputTokens,
        message.reasoningTokens,
        message.cacheReadTokens,
        message.cacheWriteTokens,
        message.rawTokens,
        Math.ceil(message.rawTokens * weight),
        Math.round(message.providerCostUsd * 1_000_000),
        message.id,
        message.completedAt,
        operation.id,
      );
      reconciled += 1;
    }
    return reconciled;
  }

  pendingSessions(subject: ModelUsageSubject): Array<{ workspaceId: string; sessionId: string }> {
    return statement(this.db, `
      SELECT DISTINCT workspace_id, session_id
      FROM model_usage_operations
      WHERE subject_id = ? AND status = 'pending'
      ORDER BY created_at ASC
      LIMIT 50
    `).all(subject.id).map((row) => {
      const record = recordValue(row);
      return {
        workspaceId: typeof record?.workspace_id === "string" ? record.workspace_id : "",
        sessionId: typeof record?.session_id === "string" ? record.session_id : "",
      };
    }).filter((entry) => entry.workspaceId && entry.sessionId);
  }

  status(subject: ModelUsageSubject, now = new Date()): MatterhornModelUsageStatus {
    const periods = utcPeriods(now);
    const subjectDaily = this.total(periods.dayStart, subject.id);
    const subjectMonthly = this.total(periods.monthStart, subject.id);
    const globalDaily = this.total(periods.dayStart);
    const globalMonthly = this.total(periods.monthStart);
    const daily = periodSnapshot(subjectDaily, this.config.dailyLimit, periods.dayEnd);
    const monthly = periodSnapshot(subjectMonthly, this.config.monthlyLimit, periods.monthEnd);
    const allDaily = periodSnapshot(globalDaily, this.config.globalDailyLimit, periods.dayEnd);
    const allMonthly = periodSnapshot(globalMonthly, this.config.globalMonthlyLimit, periods.monthEnd);
    const reserve = this.config.reservationTokens;
    const blockReason =
      daily.remainingTokens !== null && daily.remainingTokens < reserve ? "daily_limit" :
      monthly.remainingTokens !== null && monthly.remainingTokens < reserve ? "monthly_limit" :
      allDaily.remainingTokens !== null && allDaily.remainingTokens < reserve ? "global_daily_limit" :
      allMonthly.remainingTokens !== null && allMonthly.remainingTokens < reserve ? "global_monthly_limit" :
      null;

    const models = statement(this.db, `
      SELECT provider_id, model_id, COUNT(*) AS requests,
        SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
        SUM(reasoning_tokens) AS reasoning_tokens, SUM(cache_read_tokens) AS cache_read_tokens,
        SUM(cache_write_tokens) AS cache_write_tokens, SUM(raw_tokens) AS raw_tokens,
        SUM(charged_tokens) AS charged_tokens, SUM(provider_cost_micros) AS provider_cost_micros
      FROM model_usage_operations
      WHERE subject_id = ? AND status = 'completed' AND created_at >= ?
      GROUP BY provider_id, model_id
      ORDER BY charged_tokens DESC, provider_id ASC, model_id ASC
    `).all(subject.id, periods.monthStart) as ModelBreakdownRow[];

    return {
      version: MATTERHORN_MODEL_USAGE_VERSION,
      enforcement: this.config.enforcement,
      enabled: this.config.enforcement !== "off",
      canStartRequest: this.config.enforcement !== "hard" || blockReason === null,
      blockReason,
      reservationTokens: reserve,
      daily,
      monthly,
      platformAvailable:
        (allDaily.remainingTokens === null || allDaily.remainingTokens >= reserve) &&
        (allMonthly.remainingTokens === null || allMonthly.remainingTokens >= reserve),
      pendingRequests: finiteInteger(subjectMonthly.pending_requests),
      models: models.map((row): MatterhornModelUsageBreakdown => ({
        providerId: row.provider_id,
        modelId: row.model_id,
        requests: finiteInteger(row.requests),
        inputTokens: finiteInteger(row.input_tokens),
        outputTokens: finiteInteger(row.output_tokens),
        reasoningTokens: finiteInteger(row.reasoning_tokens),
        cacheReadTokens: finiteInteger(row.cache_read_tokens),
        cacheWriteTokens: finiteInteger(row.cache_write_tokens),
        rawTokens: finiteInteger(row.raw_tokens),
        chargedTokens: finiteInteger(row.charged_tokens),
        providerCostUsd: finiteInteger(row.provider_cost_micros) / 1_000_000,
      })),
      updatedAt: now.toISOString(),
    };
  }

  private total(startAt: number, subjectId?: string): UsageTotalRow {
    const sql = `
      SELECT
        SUM(CASE WHEN status = 'completed' THEN raw_tokens ELSE 0 END) AS used_tokens,
        SUM(CASE WHEN status = 'pending' THEN reserved_tokens ELSE 0 END) AS reserved_tokens,
        SUM(CASE WHEN status IN ('pending', 'completed') THEN charged_tokens ELSE 0 END) AS charged_tokens,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_requests
      FROM model_usage_operations
      WHERE created_at >= ?${subjectId ? " AND subject_id = ?" : ""}
    `;
    const row = subjectId
      ? statement(this.db, sql).get(startAt, subjectId)
      : statement(this.db, sql).get(startAt);
    return recordValue(row) ?? {};
  }

  private remainingGlobalTokens(now: Date, period: "daily" | "monthly"): number | null {
    const periods = utcPeriods(now);
    const startAt = period === "daily" ? periods.dayStart : periods.monthStart;
    const limit = period === "daily" ? this.config.globalDailyLimit : this.config.globalMonthlyLimit;
    if (limit === null) return null;
    return Math.max(0, limit - finiteInteger(this.total(startAt).charged_tokens));
  }

  private belowGlobalLimit(now: Date, period: "daily" | "monthly", requiredTokens: number): boolean {
    const remaining = this.remainingGlobalTokens(now, period);
    return remaining !== null && remaining < requiredTokens;
  }

  private withImmediateTransaction<T>(callback: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}
