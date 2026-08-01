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

export const useMatterhornSessionMemoryContextStore = create<MatterhornSessionMemoryContextStore>((set) => ({
  contexts: {},
  setContext: (sessionId, context) => set((state) => ({
    contexts: { ...state.contexts, [sessionId]: context },
  })),
  clearContext: (sessionId) => set((state) => {
    const next = { ...state.contexts };
    delete next[sessionId];
    return { contexts: next };
  }),
}));

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
