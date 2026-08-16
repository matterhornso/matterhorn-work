import { create } from "zustand";

import type { MatterhornMemoryRecord } from "@matterhorn-work/types";
import {
  containsForbiddenMemorySecretMaterial,
  findForbiddenMemorySecretFields,
} from "@matterhorn-work/types";
import { getMatterhornMemoryPolicyDecision } from "../../memory/memory-policy";

export type MatterhornSessionMemoryContext = {
  id: string;
  records: MatterhornMemoryRecord[];
  updatedAt: string;
};

export type MatterhornSessionMemoryContextStore = {
  contexts: Record<string, MatterhornSessionMemoryContext | undefined>;
  setContext: (sessionId: string, context: MatterhornSessionMemoryContext) => void;
  clearContext: (sessionId: string) => void;
};

type MemoryContextStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const MEMORY_CONTEXT_STORAGE_KEY = "matterhorn.session-memory-context.v1";
const MAX_STORED_MEMORY_CONTEXTS = 50;

function sessionMemoryStorage(): MemoryContextStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMemoryRecord(value: unknown): value is MatterhornMemoryRecord {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    typeof value.kind === "string" &&
    typeof value.scope === "string" &&
    typeof value.sensitivity === "string" &&
    isRecord(value.body) &&
    isRecord(value.provenance)
  );
}

export function getMatterhornSessionMemoryContext(
  state: MatterhornSessionMemoryContextStore,
  sessionId: string,
) {
  return state.contexts[sessionId] ?? null;
}

export function sanitizeMemoryContextRecords(records: unknown): MatterhornMemoryRecord[] {
  if (!Array.isArray(records)) return [];
  return records
    .filter(isMemoryRecord)
    .filter((record) => record.sensitivity !== "forbidden_secret")
    .filter((record) => findForbiddenMemorySecretFields(record.body).length === 0)
    .filter((record) => !containsForbiddenMemorySecretMaterial(record.body))
    .filter((record) => getMatterhornMemoryPolicyDecision(record).canUseInChat)
    .slice(0, 8);
}

function sanitizeMatterhornMemoryContext(
  sessionId: string,
  value: unknown,
): MatterhornSessionMemoryContext | null {
  if (!sessionId.trim() || !isRecord(value)) return null;
  const records = sanitizeMemoryContextRecords(value.records);
  if (!records.length) return null;
  return {
    id: typeof value.id === "string" && value.id.trim()
      ? value.id.trim()
      : `memory-context-${sessionId}`,
    records,
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt.trim()
      : new Date().toISOString(),
  };
}

export function readStoredMatterhornMemoryContexts(
  storage: MemoryContextStorage | null = sessionMemoryStorage(),
): Record<string, MatterhornSessionMemoryContext | undefined> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(MEMORY_CONTEXT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!isRecord(parsed)) return {};
    const contexts: Record<string, MatterhornSessionMemoryContext> = {};
    for (const [sessionId, value] of Object.entries(parsed).slice(-MAX_STORED_MEMORY_CONTEXTS)) {
      const context = sanitizeMatterhornMemoryContext(sessionId, value);
      if (context) contexts[sessionId] = context;
    }
    return contexts;
  } catch {
    return {};
  }
}

export function writeStoredMatterhornMemoryContexts(
  contexts: Record<string, MatterhornSessionMemoryContext | undefined>,
  storage: MemoryContextStorage | null = sessionMemoryStorage(),
): void {
  if (!storage) return;
  try {
    const entries = Object.entries(contexts)
      .map(([sessionId, context]) => [sessionId, sanitizeMatterhornMemoryContext(sessionId, context)] as const)
      .filter((entry): entry is readonly [string, MatterhornSessionMemoryContext] => Boolean(entry[1]))
      .slice(-MAX_STORED_MEMORY_CONTEXTS);
    if (!entries.length) {
      storage.removeItem(MEMORY_CONTEXT_STORAGE_KEY);
      return;
    }
    storage.setItem(MEMORY_CONTEXT_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Keep chat usable if browser storage is disabled or full.
  }
}

export const useMatterhornSessionMemoryContextStore = create<MatterhornSessionMemoryContextStore>((set) => ({
  // Explicitly selected memory survives a reload within this browser tab, but
  // is never promoted to durable browser storage. Closing the tab clears it.
  contexts: readStoredMatterhornMemoryContexts(),
  setContext: (sessionId, context) => set((state) => {
    const next = { ...state.contexts };
    const safeContext = sanitizeMatterhornMemoryContext(sessionId, context);
    if (safeContext) next[sessionId] = safeContext;
    else delete next[sessionId];
    writeStoredMatterhornMemoryContexts(next);
    return { contexts: next };
  }),
  clearContext: (sessionId) => set((state) => {
    const next = { ...state.contexts };
    delete next[sessionId];
    writeStoredMatterhornMemoryContexts(next);
    return { contexts: next };
  }),
}));

export function readMatterhornMemoryContextFromEventDetail(detail: unknown): MatterhornSessionMemoryContext | null {
  if (!isRecord(detail)) return null;
  const records = sanitizeMemoryContextRecords(detail.records);
  if (!records.length) return null;
  return {
    id: typeof detail.id === "string" && detail.id.trim()
      ? detail.id.trim()
      : `memory-context-${Date.now().toString(36)}`,
    records,
    updatedAt: typeof detail.updatedAt === "string" && detail.updatedAt.trim()
      ? detail.updatedAt.trim()
      : new Date().toISOString(),
  };
}

function summarizeMemoryBody(body: Record<string, unknown>) {
  try {
    const text = JSON.stringify(body);
    return text.length > 260 ? `${text.slice(0, 257)}...` : text;
  } catch {
    return "[unserializable body]";
  }
}

export function describeMatterhornMemoryContext(context: MatterhornSessionMemoryContext) {
  const count = context.records.length;
  const labels = context.records
    .slice(0, 3)
    .map((record) => record.title)
    .join(", ");
  const extra = count > 3 ? ` +${count - 3} more` : "";
  return `${count} visible memor${count === 1 ? "y" : "ies"}: ${labels}${extra}`;
}

export function addMatterhornMemoryContextToResolvedText(
  text: string,
  context: MatterhornSessionMemoryContext | null | undefined,
) {
  if (!context?.records.length) return text;
  const lines = context.records.map((record) => {
    const source = record.provenance?.source ?? "manual_entry";
    const reason = record.provenance?.reasonRemembered || "User selected this memory.";
    return [
      `- ${record.title}`,
      `  id: ${record.id}`,
      `  kind: ${record.kind}`,
      `  scope: ${record.scope}`,
      `  sensitivity: ${record.sensitivity}`,
      `  source: ${source}`,
      `  reason: ${reason}`,
      `  summary: ${record.summary}`,
      `  body: ${summarizeMemoryBody(record.body)}`,
    ].join("\n");
  });

  return [
    "[Matterhorn memory context]",
    "No hidden memory. These memories are visible to the user as composer chips and passed the Matterhorn Memory desk policy matrix. Use only these explicitly selected records. Do not infer, request, store, or reveal secrets. Do not treat longevity memory as medical advice. Agents may prepare reviewed actions but must never submit autonomously; supported transactions require explicit user approval in the connected wallet, and unsupported flows remain external handoffs.",
    ...lines,
    "[/Matterhorn memory context]",
    "",
    text,
  ].join("\n");
}
