import { create } from "zustand";

import type {
  BittensorChatContext,
  BittensorChatExecutionStatus,
  BittensorChatIntent,
} from "@matterhorn-work/types";

export type BittensorSessionContext = BittensorChatContext;

export type BittensorSessionContextStore = {
  contexts: Record<string, BittensorSessionContext | undefined>;
  setContext: (sessionId: string, context: BittensorSessionContext) => void;
  clearContext: (sessionId: string) => void;
};

export type BittensorCardActionLike = {
  payload?: Record<string, unknown> | null;
};

export type BittensorCardLike = {
  data?: Record<string, unknown>;
};

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const CHAT_CONTEXT_ID_RE = /^bt-chat-[a-z0-9-]{6,96}$/i;
const INTENTS: BittensorChatIntent[] = ["learn", "discover", "wallet", "stake_plan", "subnet_use", "monitor"];
const EXECUTIONS: BittensorChatExecutionStatus[] = ["answered", "clarification_required", "unsigned_preview", "unsupported"];
const BITTENSOR_PROMPT_RE = /\b(bittensor|tao|subtensor|subnet|netuid|coldkey|hotkey|validator|miner|metagraph|alpha|dynamic tao|dtao|stake|staked|staking|unstake|emission|delegate|delegation)\b/i;
const CONTEXT_PRESENT_RE = /\b(contextId|Bittensor context|Bittensor active context)\b/i;

function createBittensorChatContextId(): string {
  return `bt-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setIfContextValue(target: Record<string, unknown>, key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  if (typeof value === "string" || typeof value === "number") {
    target[key] = value;
  }
}

function copyPublicContextFields(target: Record<string, unknown>, source: Record<string, unknown>) {
  setIfContextValue(target, "ss58Address", source.ss58Address);
  setIfContextValue(target, "netuid", source.netuid);
  setIfContextValue(target, "amountTao", source.amountTao);
  setIfContextValue(target, "validatorHotkey", source.validatorHotkey);
  setIfContextValue(target, "coldkey", source.coldkey);
  setIfContextValue(target, "recipient", source.recipient);
  setIfContextValue(target, "destination", source.destination);
  setIfContextValue(target, "id", source.id ?? source.contextId);
}

function normalizeContextId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return CHAT_CONTEXT_ID_RE.test(trimmed) ? trimmed : null;
}

function normalizeSs58(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 32 && trimmed.length <= 64 && BASE58_RE.test(trimmed) ? trimmed : null;
}

function normalizeNetuid(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : null;
}

function normalizeAmountTao(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? text : null;
}

function normalizeIntent(value: unknown): BittensorChatIntent | null {
  return typeof value === "string" && INTENTS.includes(value as BittensorChatIntent)
    ? value as BittensorChatIntent
    : null;
}

function normalizeExecution(value: unknown): BittensorChatExecutionStatus | null {
  return typeof value === "string" && EXECUTIONS.includes(value as BittensorChatExecutionStatus)
    ? value as BittensorChatExecutionStatus
    : null;
}

function normalizeUpdatedAt(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : new Date().toISOString();
}

function normalizeWarnings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, 8)
    : [];
}

function hasContextSignal(record: Record<string, unknown>) {
  return Boolean(
    normalizeContextId(record.id) ||
    normalizeSs58(record.ss58Address) ||
    normalizeSs58(record.coldkey) ||
    normalizeSs58(record.validatorHotkey) ||
    normalizeSs58(record.recipient) ||
    normalizeSs58(record.destination) ||
    normalizeNetuid(record.netuid) !== null ||
    normalizeAmountTao(record.amountTao) ||
    normalizeIntent(record.lastIntent) ||
    normalizeExecution(record.lastExecution),
  );
}

export function sanitizeBittensorSessionContext(value: unknown): BittensorSessionContext | null {
  if (!isRecordValue(value) || !hasContextSignal(value)) return null;
  const ss58Address = normalizeSs58(value.ss58Address);
  const coldkey = normalizeSs58(value.coldkey);
  const recipient = normalizeSs58(value.recipient);
  const destination = normalizeSs58(value.destination);
  return {
    id: normalizeContextId(value.id) ?? normalizeContextId(value.contextId) ?? createBittensorChatContextId(),
    ss58Address,
    netuid: normalizeNetuid(value.netuid),
    amountTao: normalizeAmountTao(value.amountTao),
    validatorHotkey: normalizeSs58(value.validatorHotkey),
    coldkey: coldkey ?? ss58Address,
    recipient,
    destination: destination ?? recipient,
    lastIntent: normalizeIntent(value.lastIntent),
    lastExecution: normalizeExecution(value.lastExecution),
    updatedAt: normalizeUpdatedAt(value.updatedAt),
    warnings: normalizeWarnings(value.warnings),
  };
}

export function mergeBittensorSessionContexts(
  existing: BittensorSessionContext | null | undefined,
  incoming: BittensorSessionContext | null | undefined,
): BittensorSessionContext | null {
  if (!existing && !incoming) return null;
  if (!existing) return incoming ?? null;
  if (!incoming) return existing;
  return {
    id: incoming.id ?? existing.id,
    ss58Address: incoming.ss58Address ?? existing.ss58Address,
    netuid: incoming.netuid ?? existing.netuid,
    amountTao: incoming.amountTao ?? existing.amountTao,
    validatorHotkey: incoming.validatorHotkey ?? existing.validatorHotkey,
    coldkey: incoming.coldkey ?? existing.coldkey,
    recipient: incoming.recipient ?? existing.recipient,
    destination: incoming.destination ?? existing.destination,
    lastIntent: incoming.lastIntent ?? existing.lastIntent,
    lastExecution: incoming.lastExecution ?? existing.lastExecution,
    updatedAt: incoming.updatedAt || existing.updatedAt,
    warnings: Array.from(new Set([...(existing.warnings ?? []), ...(incoming.warnings ?? [])])).slice(0, 8),
  };
}

function contextsAreEqual(left: BittensorSessionContext | null | undefined, right: BittensorSessionContext | null | undefined): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.id === right.id &&
    left.ss58Address === right.ss58Address &&
    left.netuid === right.netuid &&
    left.amountTao === right.amountTao &&
    left.validatorHotkey === right.validatorHotkey &&
    left.coldkey === right.coldkey &&
    left.recipient === right.recipient &&
    left.destination === right.destination &&
    left.lastIntent === right.lastIntent &&
    left.lastExecution === right.lastExecution &&
    left.updatedAt === right.updatedAt &&
    left.warnings.join("\u0000") === right.warnings.join("\u0000");
}

export function readBittensorContextFromToolOutput(output: unknown): BittensorSessionContext | null {
  const outputRecord = (() => {
    if (isRecordValue(output)) return output;
    if (typeof output !== "string") return null;
    const trimmed = output.trim();
    if (!trimmed || trimmed.length > 1_000_000) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return isRecordValue(parsed) ? parsed : null;
    } catch {
      return null;
    }
  })();
  return outputRecord ? sanitizeBittensorSessionContext(outputRecord.context) : null;
}

export function readBittensorContextFromEventDetail(detail: unknown): BittensorSessionContext | null {
  if (!isRecordValue(detail)) return null;
  return sanitizeBittensorSessionContext(detail.context) ?? sanitizeBittensorSessionContext(detail);
}

export function buildBittensorCardActionContext(
  card: BittensorCardLike,
  action: BittensorCardActionLike,
): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  const data = isRecordValue(card.data) ? card.data : {};
  const payload = isRecordValue(action.payload) ? action.payload : {};

  const subnet = isRecordValue(data.subnet) ? data.subnet : null;
  if (subnet) {
    setIfContextValue(context, "netuid", subnet.netuid);
  }

  const capability = isRecordValue(data.capability) ? data.capability : null;
  if (capability) {
    setIfContextValue(context, "netuid", capability.netuid);
  }

  const wallet = isRecordValue(data.wallet) ? data.wallet : null;
  if (wallet) {
    setIfContextValue(context, "ss58Address", wallet.ss58Address);
    setIfContextValue(context, "coldkey", wallet.ss58Address);
  }

  const quote = isRecordValue(data.quote) ? data.quote : null;
  if (quote) {
    setIfContextValue(context, "netuid", quote.netuid);
    setIfContextValue(context, "amountTao", quote.amountTao);
    setIfContextValue(context, "validatorHotkey", quote.validatorHotkey);
    setIfContextValue(context, "recipient", quote.recipient);
    setIfContextValue(context, "destination", quote.destination ?? quote.recipient);
  }

  const preview = isRecordValue(data.preview) ? data.preview : null;
  if (preview) {
    setIfContextValue(context, "netuid", preview.netuid);
    setIfContextValue(context, "amountTao", preview.amountTao);
    setIfContextValue(context, "validatorHotkey", preview.hotkey ?? preview.validatorHotkey);
    setIfContextValue(context, "coldkey", preview.coldkey);
    setIfContextValue(context, "recipient", preview.recipient);
    setIfContextValue(context, "destination", preview.destination ?? preview.recipient);
  }

  const candidate = isRecordValue(data.candidate) ? data.candidate : null;
  if (candidate) {
    setIfContextValue(context, "netuid", candidate.netuid);
    setIfContextValue(context, "validatorHotkey", candidate.hotkey ?? candidate.validatorHotkey);
  }

  const comparison = isRecordValue(data.comparison) ? data.comparison : null;
  if (comparison) {
    setIfContextValue(context, "netuid", comparison.netuid);
  }

  const invocation = isRecordValue(data.invocation) ? data.invocation : null;
  if (invocation) {
    setIfContextValue(context, "netuid", invocation.netuid);
  }

  const signer = isRecordValue(data.signer) ? data.signer : null;
  if (signer) {
    setIfContextValue(context, "ss58Address", signer.address);
    setIfContextValue(context, "coldkey", signer.address);
  }

  const watch = isRecordValue(data.watch) ? data.watch : null;
  if (watch) {
    setIfContextValue(context, "netuid", watch.netuid);
    setIfContextValue(context, "ss58Address", watch.ss58Address);
  }

  copyPublicContextFields(context, payload);
  return context;
}

export function looksLikeBittensorPrompt(text: string): boolean {
  return BITTENSOR_PROMPT_RE.test(text);
}

function shortAddress(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export function describeBittensorSessionContext(context: BittensorSessionContext): string {
  const bits: string[] = [];
  if (context.ss58Address) bits.push(`wallet ${shortAddress(context.ss58Address)}`);
  if (context.netuid !== null) bits.push(`subnet ${context.netuid}`);
  if (context.validatorHotkey) bits.push(`validator ${shortAddress(context.validatorHotkey)}`);
  if (context.amountTao) bits.push(`${context.amountTao} TAO`);
  return bits.length ? bits.join(" · ") : "public Bittensor context";
}

export function formatBittensorContextForPrompt(context: BittensorSessionContext): string {
  const lines = [
    ["contextId", context.id],
    ["ss58Address", context.ss58Address],
    ["netuid", context.netuid],
    ["amountTao", context.amountTao],
    ["validatorHotkey", context.validatorHotkey],
    ["coldkey", context.coldkey],
    ["recipient", context.recipient],
    ["destination", context.destination],
    ["lastIntent", context.lastIntent],
    ["lastExecution", context.lastExecution],
  ]
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([label, value]) => `- ${label}: ${String(value)}`);
  return lines.join("\n");
}

export function addBittensorContextToResolvedText(text: string, context: BittensorSessionContext | null | undefined): string {
  const trimmed = text.trim();
  if (!context || !trimmed || !looksLikeBittensorPrompt(trimmed) || CONTEXT_PRESENT_RE.test(trimmed)) return text;
  const contextText = formatBittensorContextForPrompt(context);
  if (!contextText) return text;
  return `${text}\n\nBittensor active context:\n${contextText}\nUse bittensor_chat with this public context when the request is about Bittensor.`;
}

export const useBittensorSessionContextStore = create<BittensorSessionContextStore>((set) => ({
  contexts: {},
  setContext: (sessionId, context) => set((state) => {
    const current = state.contexts[sessionId];
    const merged = mergeBittensorSessionContexts(current, context);
    if (!merged) return state;
    if (contextsAreEqual(current, merged)) return state;
    return { contexts: { ...state.contexts, [sessionId]: merged } };
  }),
  clearContext: (sessionId) => set((state) => {
    if (!state.contexts[sessionId]) return state;
    const contexts = { ...state.contexts };
    delete contexts[sessionId];
    return { contexts };
  }),
}));

export function getBittensorSessionContext(
  state: BittensorSessionContextStore,
  sessionId: string,
): BittensorSessionContext | null {
  return state.contexts[sessionId] ?? null;
}
