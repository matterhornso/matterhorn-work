import { randomUUID } from "node:crypto";

import {
  MATTERHORN_MEMORY_SUGGESTION_VERSION,
  containsForbiddenMemorySecretMaterial,
  sanitizeMemorySuggestionForDisplay,
  validateMemorySuggestionAgainstDeskPolicy,
  type MatterhornMemoryDesk,
  type MatterhornMemoryRecord,
  type MatterhornMemorySource,
  type MatterhornMemorySuggestion,
} from "@matterhorn-work/types/memory";

type MemoryProducerDesk = Extract<MatterhornMemoryDesk, "bittensor" | "wellness">;

export type MatterhornMemorySuggestionPlanInput = {
  desk?: MatterhornMemoryDesk | string;
  prompt?: string;
  message?: string;
  source?: MatterhornMemorySource;
  sourceId?: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  ss58Address?: string | null;
  netuid?: number | null;
  validatorHotkey?: string | null;
  templateId?: string | null;
};

export type MatterhornMemorySuggestionPlan = {
  suggestions: MatterhornMemorySuggestion[];
  count: number;
  writesMemory: false;
  safety: {
    captureMode: "user_confirmed_only";
    canAutoCapture: false;
    requiresExplicitConsent: true;
    rejectedSecretInput: boolean;
  };
  warnings: string[];
};

const SS58_RE = /\b5[1-9A-HJ-NP-Za-km-z]{20,63}\b/;
const NETUID_RE = /\b(?:netuid|subnet)\s*#?:?\s*(\d{1,4})\b/i;
const SECRET_TOKEN_RE = /\bsk-[a-zA-Z0-9]{20,}\b|\b[A-Za-z0-9_]+_(API_KEY|SECRET)\s*=|\b0x[0-9a-fA-F]{64}\b/;
const SECRET_CAPTURE_INTENT_RE = /\b(remember|store|save|capture|use|paste|enter|send|include|my|here is|here's)\b.{0,80}\b(seed phrase|private key|mnemonic|api secret|raw signature|signed payload|signed order|wallet export|bearer token|exchange secret)\b/i;

export function hasForbiddenMatterhornMemorySuggestionInput(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return containsForbiddenMemorySecretMaterial(value);
  }
  const input = value as MatterhornMemorySuggestionPlanInput;
  const { prompt, message, ...nonPromptFields } = input;
  if (containsForbiddenMemorySecretMaterial(nonPromptFields)) return true;
  const text = `${prompt ?? ""} ${message ?? ""}`;
  return SECRET_TOKEN_RE.test(text) || SECRET_CAPTURE_INTENT_RE.test(text);
}

function promptText(input: MatterhornMemorySuggestionPlanInput): string {
  return input.prompt?.trim() || input.message?.trim() || "";
}

function nowIso() {
  return new Date().toISOString();
}

function safeId(prefix: string, parts: Array<string | number | null | undefined>) {
  const suffix = parts
    .filter((part) => part !== null && part !== undefined && String(part).trim())
    .map((part) => String(part).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean)
    .join("_")
    .slice(0, 80);
  return `${prefix}_${suffix || "memory"}_${randomUUID().slice(0, 8)}`;
}

function inferDesk(input: MatterhornMemorySuggestionPlanInput): MemoryProducerDesk | null {
  const raw = `${input.desk ?? ""} ${promptText(input)}`.toLowerCase();
  if (raw.includes("bittensor") || raw.includes("tao") || raw.includes("ss58") || raw.includes("subnet")) {
    return "bittensor";
  }
  if (raw.includes("wellness") || raw.includes("trainer") || raw.includes("dietician") || raw.includes("yoga")) {
    return "wellness";
  }
  return null;
}

function extractSs58(input: MatterhornMemorySuggestionPlanInput): string | null {
  const direct = input.ss58Address?.trim();
  if (direct && SS58_RE.test(direct)) return direct.match(SS58_RE)?.[0] ?? null;
  return promptText(input).match(SS58_RE)?.[0] ?? null;
}

function extractNetuid(input: MatterhornMemorySuggestionPlanInput): number | null {
  if (typeof input.netuid === "number" && Number.isInteger(input.netuid) && input.netuid >= 0) {
    return input.netuid;
  }
  const matched = promptText(input).match(NETUID_RE)?.[1];
  if (!matched) return null;
  const netuid = Number(matched);
  return Number.isInteger(netuid) && netuid >= 0 ? netuid : null;
}

function baseRecord(
  input: MatterhornMemorySuggestionPlanInput,
  fields: Pick<MatterhornMemoryRecord, "id" | "kind" | "scope" | "title" | "summary" | "body" | "tags" | "sensitivity" | "canUseInChat" | "canExport">,
): MatterhornMemoryRecord {
  const capturedAt = nowIso();
  return {
    ...fields,
    links: [],
    provenance: {
      source: input.source ?? "chat_capture",
      sourceId: input.sourceId ?? input.sessionId ?? input.workspaceId ?? input.templateId ?? undefined,
      capturedAt,
      capturedBy: "agent",
      confidence: 0.76,
      reasonRemembered: "Matterhorn suggested this only because it appeared in an active, user-visible workflow. Nothing is saved unless the user confirms.",
    },
    createdAt: capturedAt,
    updatedAt: capturedAt,
    canDelete: true,
  };
}

function buildSuggestion(
  input: MatterhornMemorySuggestionPlanInput,
  desk: MemoryProducerDesk,
  proposedRecord: MatterhornMemoryRecord,
  useCase: MatterhornMemorySuggestion["useCase"],
  reason: string,
  confidence = 0.76,
): MatterhornMemorySuggestion | null {
  const candidate: MatterhornMemorySuggestion = {
    version: MATTERHORN_MEMORY_SUGGESTION_VERSION,
    id: safeId("suggestion", [desk, useCase, proposedRecord.id]),
    proposedRecord,
    reason,
    source: input.source ?? "chat_capture",
    confidence,
    desk,
    useCase,
    userAction: "dismiss",
    captureMode: "user_confirmed_only",
    canAutoCapture: false,
    requiresExplicitConsent: true,
    forbiddenIfSecretDetected: true,
    policyDecision: "review",
    policyWarnings: [
      "Suggested only. Matterhorn will not save this unless the user explicitly confirms.",
    ],
  };
  const validation = validateMemorySuggestionAgainstDeskPolicy(candidate);
  if (!validation.ok) return null;
  return sanitizeMemorySuggestionForDisplay(candidate);
}

function buildBittensorSuggestions(input: MatterhornMemorySuggestionPlanInput): MatterhornMemorySuggestion[] {
  const suggestions: MatterhornMemorySuggestion[] = [];
  const ss58Address = extractSs58(input);
  if (ss58Address) {
    const record = baseRecord(input, {
      id: safeId("mem_bittensor_wallet", [ss58Address.slice(0, 10)]),
      kind: "protocol_address",
      scope: "workspace",
      title: "Bittensor public wallet",
      summary: "Public SS58 address for future TAO balance, subnet, and validator read workflows.",
      body: { ss58Address },
      tags: ["bittensor", "tao", "wallet", "ss58", "memory-suggestion"],
      sensitivity: "public",
      canUseInChat: true,
      canExport: true,
    });
    const candidate = buildSuggestion(
      input,
      "bittensor",
      record,
      "bittensor_wallet_label",
      "This public SS58 address can be remembered for future Bittensor reads after explicit confirmation.",
      0.84,
    );
    if (candidate) suggestions.push(candidate);
  }

  const netuid = extractNetuid(input);
  if (netuid !== null) {
    const record = baseRecord(input, {
      id: safeId("mem_bittensor_subnet_watch", [netuid]),
      kind: "watchlist",
      scope: "workspace",
      title: `Bittensor subnet ${netuid} watch preference`,
      summary: `Remember subnet ${netuid} as a Bittensor subnet the user may want to inspect or watch.`,
      body: {
        netuid,
        ...(input.validatorHotkey?.trim() ? { validatorHotkey: input.validatorHotkey.trim() } : {}),
      },
      tags: ["bittensor", "subnet", "watchlist", "memory-suggestion"],
      sensitivity: "public",
      canUseInChat: true,
      canExport: true,
    });
    const candidate = buildSuggestion(
      input,
      "bittensor",
      record,
      "bittensor_subnet_watch_preference",
      `Subnet ${netuid} appeared in this workflow. Remembering it can make future Bittensor follow-ups simpler after confirmation.`,
      0.72,
    );
    if (candidate) suggestions.push(candidate);
  }

  return suggestions;
}

function buildWellnessSuggestions(input: MatterhornMemorySuggestionPlanInput): MatterhornMemorySuggestion[] {
  const text = promptText(input);
  const templateId = input.templateId?.trim();
  if (!text && !templateId) return [];
  const record = baseRecord(input, {
    id: safeId("mem_wellness_preference", [templateId ?? "workflow"]),
    kind: "client_profile",
    scope: "user",
    title: "Wellness workflow preference",
    summary: "Opt-in preference for safe, educational wellness creator workflows.",
    body: {
      workflow: templateId ?? "wellness_creator_workflow",
      educationalOnly: true,
      restrictedByDefault: true,
      paymentsEmailHostingLive: false,
    },
    tags: ["wellness", "opt-in", "educational", "memory-suggestion"],
    sensitivity: "restricted",
    canUseInChat: true,
    canExport: false,
  });
  const candidate = buildSuggestion(
    input,
    "wellness",
    record,
    "wellness_client_preference",
    "This wellness workflow preference can be remembered only after explicit confirmation. It remains restricted and educational.",
    0.7,
  );
  return candidate ? [candidate] : [];
}

export function planMatterhornMemorySuggestions(
  input: MatterhornMemorySuggestionPlanInput,
): MatterhornMemorySuggestionPlan {
  if (hasForbiddenMatterhornMemorySuggestionInput(input)) {
    return {
      suggestions: [],
      count: 0,
      writesMemory: false,
      safety: {
        captureMode: "user_confirmed_only",
        canAutoCapture: false,
        requiresExplicitConsent: true,
        rejectedSecretInput: true,
      },
      warnings: ["Memory suggestion input contains forbidden secret-shaped material and was rejected."],
    };
  }
  const desk = inferDesk(input);
  const suggestions = desk === "bittensor"
    ? buildBittensorSuggestions(input)
    : desk === "wellness"
      ? buildWellnessSuggestions(input)
      : [];
  return {
    suggestions,
    count: suggestions.length,
    writesMemory: false,
    safety: {
      captureMode: "user_confirmed_only",
      canAutoCapture: false,
      requiresExplicitConsent: true,
      rejectedSecretInput: false,
    },
    warnings: suggestions.length ? [] : ["No safe memory suggestion could be produced for this prompt."],
  };
}
