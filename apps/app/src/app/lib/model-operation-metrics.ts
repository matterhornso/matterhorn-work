import { recordDevLog } from "./dev-log";

export type ModelOperationContext = {
  id: number;
  startedAt: number;
  workspaceId: string;
  sessionId: string;
  providerId: string;
  modelId: string;
  reasoningLevel: string;
  source: "chat" | "desk";
};

export type ModelOperationTokens = {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  total?: number;
};

export type ModelOperationMetric = {
  id: number;
  at: string;
  event:
    | "started"
    | "accepted"
    | "completed"
    | "cancelled"
    | "provider_error"
    | "reasoning_level_selected";
  workspaceId?: string;
  sessionId?: string;
  providerId?: string;
  modelId?: string;
  reasoningLevel?: string;
  source?: "chat" | "desk" | "current_app" | "workspace";
  operationId?: number;
  latencyMs?: number;
  tokens?: ModelOperationTokens;
  errorName?: string;
  errorCode?: string;
  statusCode?: number;
};

type ModelMetricsRoot = typeof globalThis & {
  __matterhornModelMetricSeq?: number;
  __matterhornModelMetrics?: ModelOperationMetric[];
  __matterhornPendingModelOperations?: Record<string, ModelOperationContext[]>;
};

const METRIC_LIMIT = 300;
const SAFE_ID_MAX_LENGTH = 180;

function safeIdentifier(value: string, fallback = "unknown") {
  const normalized = value.trim().replace(/[\r\n\t]/g, " ").slice(0, SAFE_ID_MAX_LENGTH);
  return normalized || fallback;
}

function finiteCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : 0;
}

function nextId(root: ModelMetricsRoot) {
  const id = (root.__matterhornModelMetricSeq ?? 0) + 1;
  root.__matterhornModelMetricSeq = id;
  return id;
}

function appendMetric(metric: Omit<ModelOperationMetric, "id" | "at">) {
  const root = globalThis as ModelMetricsRoot;
  const record: ModelOperationMetric = {
    id: nextId(root),
    at: new Date().toISOString(),
    ...metric,
  };
  const records = root.__matterhornModelMetrics ?? [];
  records.push(record);
  if (records.length > METRIC_LIMIT) {
    records.splice(0, records.length - METRIC_LIMIT);
  }
  root.__matterhornModelMetrics = records;
  recordDevLog(true, {
    level: "perf",
    source: "model.operation",
    label: record.event,
    payload: record,
  });
  return record;
}

function pendingOperations(root: ModelMetricsRoot) {
  return root.__matterhornPendingModelOperations ?? (root.__matterhornPendingModelOperations = {});
}

function removePendingOperation(operation: ModelOperationContext) {
  const root = globalThis as ModelMetricsRoot;
  const pending = pendingOperations(root);
  const remaining = (pending[operation.sessionId] ?? []).filter((item) => item.id !== operation.id);
  if (remaining.length > 0) {
    pending[operation.sessionId] = remaining;
  } else {
    delete pending[operation.sessionId];
  }
}

export function beginModelOperation(input: {
  workspaceId: string;
  sessionId: string;
  providerId?: string | null;
  modelId?: string | null;
  reasoningLevel?: string | null;
  source: "chat" | "desk";
}): ModelOperationContext {
  const root = globalThis as ModelMetricsRoot;
  const operation: ModelOperationContext = {
    id: nextId(root),
    startedAt: Date.now(),
    workspaceId: safeIdentifier(input.workspaceId),
    sessionId: safeIdentifier(input.sessionId),
    providerId: safeIdentifier(input.providerId ?? "engine_default"),
    modelId: safeIdentifier(input.modelId ?? "engine_default"),
    reasoningLevel: safeIdentifier(input.reasoningLevel ?? "provider_default"),
    source: input.source,
  };
  const pending = pendingOperations(root);
  pending[operation.sessionId] = [...(pending[operation.sessionId] ?? []), operation];
  appendMetric({
    event: "started",
    workspaceId: operation.workspaceId,
    sessionId: operation.sessionId,
    providerId: operation.providerId,
    modelId: operation.modelId,
    reasoningLevel: operation.reasoningLevel,
    source: operation.source,
    operationId: operation.id,
  });
  return operation;
}

export function pendingModelOperation(sessionId: string) {
  const root = globalThis as ModelMetricsRoot;
  return pendingOperations(root)[safeIdentifier(sessionId)]?.[0] ?? null;
}

export function recordModelOperationAccepted(operation: ModelOperationContext) {
  appendMetric({
    event: "accepted",
    workspaceId: operation.workspaceId,
    sessionId: operation.sessionId,
    providerId: operation.providerId,
    modelId: operation.modelId,
    reasoningLevel: operation.reasoningLevel,
    source: operation.source,
    operationId: operation.id,
    latencyMs: Math.max(0, Date.now() - operation.startedAt),
  });
}

export function recordModelOperationCompleted(
  operation: ModelOperationContext,
  input: {
    completedAt?: number;
    tokens: {
      input?: number;
      output?: number;
      reasoning?: number;
      cache?: { read?: number; write?: number };
      total?: number;
    };
  },
) {
  const completedAt = typeof input.completedAt === "number" && Number.isFinite(input.completedAt)
    ? input.completedAt
    : Date.now();
  const total = input.tokens.total;
  appendMetric({
    event: "completed",
    workspaceId: operation.workspaceId,
    sessionId: operation.sessionId,
    providerId: operation.providerId,
    modelId: operation.modelId,
    reasoningLevel: operation.reasoningLevel,
    source: operation.source,
    operationId: operation.id,
    latencyMs: Math.max(0, Math.round(completedAt - operation.startedAt)),
    tokens: {
      input: finiteCount(input.tokens.input),
      output: finiteCount(input.tokens.output),
      reasoning: finiteCount(input.tokens.reasoning),
      cacheRead: finiteCount(input.tokens.cache?.read),
      cacheWrite: finiteCount(input.tokens.cache?.write),
      ...(typeof total === "number" && Number.isFinite(total) ? { total: finiteCount(total) } : {}),
    },
  });
  removePendingOperation(operation);
}

export function recordModelOperationCancelled(operation: ModelOperationContext) {
  appendMetric({
    event: "cancelled",
    workspaceId: operation.workspaceId,
    sessionId: operation.sessionId,
    providerId: operation.providerId,
    modelId: operation.modelId,
    reasoningLevel: operation.reasoningLevel,
    source: operation.source,
    operationId: operation.id,
    latencyMs: Math.max(0, Date.now() - operation.startedAt),
  });
  removePendingOperation(operation);
}

function safeErrorField(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, 80);
  return /^[a-z0-9_.:/-]+$/i.test(normalized) ? normalized : undefined;
}

export function recordModelOperationProviderError(operation: ModelOperationContext, error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : null;
  const statusValue = record?.statusCode ?? record?.status;
  const statusCode = typeof statusValue === "number" && Number.isFinite(statusValue)
    ? Math.round(statusValue)
    : undefined;
  appendMetric({
    event: "provider_error",
    workspaceId: operation.workspaceId,
    sessionId: operation.sessionId,
    providerId: operation.providerId,
    modelId: operation.modelId,
    reasoningLevel: operation.reasoningLevel,
    source: operation.source,
    operationId: operation.id,
    latencyMs: Math.max(0, Date.now() - operation.startedAt),
    errorName: safeErrorField(error instanceof Error ? error.name : record?.name) ?? "Error",
    ...(safeErrorField(record?.code ?? record?.errorCode) ? {
      errorCode: safeErrorField(record?.code ?? record?.errorCode),
    } : {}),
    ...(statusCode ? { statusCode } : {}),
  });
  removePendingOperation(operation);
}

export function recordModelReasoningLevelSelection(input: {
  workspaceId?: string | null;
  sessionId?: string | null;
  providerId?: string | null;
  modelId?: string | null;
  reasoningLevel?: string | null;
  source: "current_app" | "workspace";
}) {
  appendMetric({
    event: "reasoning_level_selected",
    ...(input.workspaceId ? { workspaceId: safeIdentifier(input.workspaceId) } : {}),
    ...(input.sessionId ? { sessionId: safeIdentifier(input.sessionId) } : {}),
    ...(input.providerId ? { providerId: safeIdentifier(input.providerId) } : {}),
    ...(input.modelId ? { modelId: safeIdentifier(input.modelId) } : {}),
    reasoningLevel: safeIdentifier(input.reasoningLevel ?? "provider_default"),
    source: input.source,
  });
}

export function readModelOperationMetrics(limit = 100) {
  const records = (globalThis as ModelMetricsRoot).__matterhornModelMetrics ?? [];
  if (limit <= 0) return [];
  return records.slice(-limit);
}

export function clearModelOperationMetrics() {
  const root = globalThis as ModelMetricsRoot;
  root.__matterhornModelMetricSeq = 0;
  root.__matterhornModelMetrics = [];
  root.__matterhornPendingModelOperations = {};
}
