import type { MatterhornAgentRunReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

/** Content-free identity persisted before dispatch. This is not execution authority. */
export type AgentRunCompletionBinding = {
  runId: string;
  workspaceId: string;
  sessionId: string;
  providerId: string;
  modelId: string;
  messageId: string | null;
  acceptedAtMs: number;
};

type Usage = Omit<MatterhornAgentRunReceipt["usage"], "toolCallBudget">;
type Completion = { status: Exclude<MatterhornAgentRunReceipt["status"], "pending">; usage: Usage };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

export function isAgentRunCompletionBinding(value: unknown): value is AgentRunCompletionBinding {
  return record(value) && Object.keys(value).sort().join(",")
    === "acceptedAtMs,messageId,modelId,providerId,runId,sessionId,workspaceId"
    && identifier(value.runId) && /^agent_run(?:_off)?_[0-9a-f-]{36}$/.test(value.runId)
    && identifier(value.workspaceId) && identifier(value.sessionId)
    && identifier(value.providerId) && identifier(value.modelId)
    && (value.messageId === null || identifier(value.messageId))
    && typeof value.acceptedAtMs === "number" && Number.isSafeInteger(value.acceptedAtMs)
    && value.acceptedAtMs > 0;
}

function tokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Only call with the complete history fetched by the server from its configured
 * native engine, never a client-supplied transcript or billing reconciliation.
 * Missing, ambiguous, still-running or malformed evidence does not close a run.
 */
export function nativeRunCompletion(binding: AgentRunCompletionBinding, messages: unknown, nowMs = Date.now()): Completion | null {
  if (!binding.messageId || !Array.isArray(messages) || messages.length > 10_000) return null;
  const ids = new Set<string>();
  const steps: Record<string, unknown>[] = [];
  let parentFound = false;
  let parentCreated = binding.acceptedAtMs;
  for (const message of messages) {
    if (!record(message) || !record(message.info) || !Array.isArray(message.parts)) return null;
    const info = message.info;
    if (!identifier(info.id) || ids.has(info.id) || info.sessionID !== binding.sessionId) return null;
    ids.add(info.id);
    if (info.id === binding.messageId) {
      if (info.role !== "user" || !record(info.model) || info.model.providerID !== binding.providerId
        || info.model.modelID !== binding.modelId || !record(info.time)
        || typeof info.time.created !== "number" || !Number.isSafeInteger(info.time.created)
        || info.time.created < binding.acceptedAtMs || info.time.created > nowMs) return null;
      parentFound = true;
      parentCreated = info.time.created;
    }
    if (info.role !== "assistant" || info.parentID !== binding.messageId) continue;
    if (!parentFound || info.providerID !== binding.providerId || info.modelID !== binding.modelId) return null;
    for (const part of message.parts) {
      if (!record(part) || part.messageID !== info.id || part.sessionID !== binding.sessionId) return null;
      if (part.type === "tool" && (!record(part.state) || !["completed", "error"].includes(String(part.state.status)))) return null;
    }
    steps.push(info);
  }
  if (!parentFound || !steps.length) return null;
  const usage: Usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0 };
  let previousCompleted = parentCreated;
  let status: Completion["status"] | null = null;
  for (const [index, info] of steps.entries()) {
    if (!record(info.time) || !record(info.tokens) || !record(info.tokens.cache)) return null;
    const { created, completed } = info.time;
    if (typeof created !== "number" || typeof completed !== "number"
      || !Number.isSafeInteger(created) || !Number.isSafeInteger(completed)
      || created < previousCompleted || completed < created || completed > nowMs) return null;
    previousCompleted = completed;
    const counts = [info.tokens.input, info.tokens.output, info.tokens.reasoning, info.tokens.cache.read, info.tokens.cache.write];
    if (!counts.every(tokenCount) || typeof info.cost !== "number" || !Number.isFinite(info.cost) || info.cost < 0) return null;
    const [input, output, reasoning, read, write] = counts;
    usage.inputTokens += input;
    usage.outputTokens += output;
    usage.reasoningTokens += reasoning;
    usage.cacheReadTokens += read;
    usage.cacheWriteTokens += write;
    usage.estimatedCostUsd += info.cost;
    if (![usage.inputTokens, usage.outputTokens, usage.reasoningTokens, usage.cacheReadTokens, usage.cacheWriteTokens].every(tokenCount)
      || !Number.isFinite(usage.estimatedCostUsd)) return null;
    if (index < steps.length - 1) {
      if (info.finish !== "tool-calls" || info.error !== undefined) return null;
      continue;
    }
    if (info.error !== undefined) {
      if (!record(info.error) || !identifier(info.error.name)) return null;
      status = info.error.name === "MessageAbortedError" ? "cancelled" : "error";
    } else if (info.finish === "stop") status = "success";
    else if (info.finish === "length" || info.finish === "content-filter") status = "partial";
  }
  return status ? { status, usage } : null;
}
