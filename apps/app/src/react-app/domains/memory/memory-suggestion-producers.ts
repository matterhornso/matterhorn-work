import {
  MATTERHORN_MEMORY_SUGGESTION_VERSION,
  containsForbiddenMemorySecretMaterial,
  sanitizeMemorySuggestionForDisplay,
  validateMemorySuggestionAgainstDeskPolicy,
  type MatterhornMemoryDesk,
  type MatterhornMemoryRecord,
  type MatterhornMemorySource,
  type MatterhornMemorySuggestion,
} from "@matterhorn-work/types";

type MemoryProducerDesk = Extract<MatterhornMemoryDesk, "bittensor" | "hyperliquid" | "polymarket" | "sui" | "wellness">;

export type MatterhornMemorySuggestionProducerInput = {
  desk?: MatterhornMemoryDesk | string;
  prompt?: string;
  source?: MatterhornMemorySource;
  sourceId?: string;
  workspaceId?: string | null;
  sessionId?: string | null;
  ss58Address?: string | null;
  netuid?: number | null;
  validatorHotkey?: string | null;
  templateId?: string | null;
};

const SS58_RE = /\b5[1-9A-HJ-NP-Za-km-z]{20,63}\b/;
const SUI_ADDRESS_RE = /\b0x[0-9a-fA-F]{40,64}\b/;
const NETUID_RE = /\b(?:netuid|subnet)\s*#?:?\s*(\d{1,4})\b/i;
const HYPERLIQUID_ASSET_RE = /\b(BTC|ETH|SOL|HYPE|ARB|DOGE|XRP|AVAX|BNB|LINK|SUI|TON|WIF|PUMP)\b/i;
const SECRET_TOKEN_RE = /\bsk-[a-zA-Z0-9]{20,}\b|\b[A-Za-z0-9_]+_(API_KEY|SECRET)\s*=/;
const SECRET_CAPTURE_INTENT_RE = /\b(remember|store|save|capture|use|paste|enter|send|include|my|here is|here's)\b.{0,80}\b(seed phrase|private key|mnemonic|api secret|raw signature|signed payload|signed order|wallet export|bearer token|exchange secret)\b/i;
const POLYMARKET_TOPIC_BRAND_RE = /\bpolymarket\b[:\s-]*/i;

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
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8)
    : `${Date.now()}`;
  return `${prefix}_${suffix || "memory"}_${random}`;
}

function compactSuggestionReason(reason: string) {
  const normalized = reason.replace(/\s+/g, " ").trim();
  if (normalized.length <= 200) return normalized;
  return `${normalized.slice(0, 197).trimEnd()}...`;
}

function truncatedPublicAddress(address: string) {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function inferDesk(input: MatterhornMemorySuggestionProducerInput): MemoryProducerDesk | null {
  const raw = `${input.desk ?? ""} ${input.prompt ?? ""}`.toLowerCase();
  if (raw.includes("bittensor") || raw.includes("tao") || raw.includes("ss58") || raw.includes("subnet")) {
    return "bittensor";
  }
  if (raw.includes("hyperliquid") || raw.includes("perp") || raw.includes("funding") || raw.includes("orderbook")) {
    return "hyperliquid";
  }
  if (raw.includes("polymarket") || raw.includes("prediction market") || raw.includes("outcome") || raw.includes("odds")) {
    return "polymarket";
  }
  if (raw.includes("sui") || raw.includes("transaction digest") || raw.includes("sui wallet")) {
    return "sui";
  }
  if (raw.includes("wellness") || raw.includes("trainer") || raw.includes("dietician") || raw.includes("yoga")) {
    return "wellness";
  }
  return null;
}

function extractSs58(input: MatterhornMemorySuggestionProducerInput): string | null {
  const direct = input.ss58Address?.trim();
  if (direct && SS58_RE.test(direct)) return direct.match(SS58_RE)?.[0] ?? null;
  return input.prompt?.match(SS58_RE)?.[0] ?? null;
}

function extractSuiAddress(input: MatterhornMemorySuggestionProducerInput): string | null {
  return input.prompt?.match(SUI_ADDRESS_RE)?.[0] ?? null;
}

function extractNetuid(input: MatterhornMemorySuggestionProducerInput): number | null {
  if (typeof input.netuid === "number" && Number.isInteger(input.netuid) && input.netuid >= 0) {
    return input.netuid;
  }
  const matched = input.prompt?.match(NETUID_RE)?.[1];
  if (!matched) return null;
  const netuid = Number(matched);
  return Number.isInteger(netuid) && netuid >= 0 ? netuid : null;
}

function extractHyperliquidAsset(input: MatterhornMemorySuggestionProducerInput): string | null {
  const matched = input.prompt?.match(HYPERLIQUID_ASSET_RE)?.[1];
  return matched ? matched.toUpperCase() : null;
}

function extractPolymarketTopic(input: MatterhornMemorySuggestionProducerInput): string {
  const text = (input.prompt ?? "")
    .replace(POLYMARKET_TOPIC_BRAND_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Polymarket market research";
  return text.slice(0, 120);
}

function hasForbiddenSuggestionInput(input: MatterhornMemorySuggestionProducerInput): boolean {
  const { prompt, ...nonPromptFields } = input;
  if (containsForbiddenMemorySecretMaterial(nonPromptFields)) return true;
  const text = `${prompt ?? ""}`;
  return SECRET_TOKEN_RE.test(text) || SECRET_CAPTURE_INTENT_RE.test(text);
}

function baseRecord(
  input: MatterhornMemorySuggestionProducerInput,
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

function suggestion(
  input: MatterhornMemorySuggestionProducerInput,
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
      "Suggested only. Matterhorn will not save this unless you explicitly choose Remember.",
    ],
  };
  const validation = validateMemorySuggestionAgainstDeskPolicy(candidate);
  if (!validation.ok) return null;
  return sanitizeMemorySuggestionForDisplay({
    ...candidate,
    reason: compactSuggestionReason(candidate.reason),
  });
}

function buildBittensorSuggestions(input: MatterhornMemorySuggestionProducerInput): MatterhornMemorySuggestion[] {
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
    const walletSuggestion = suggestion(
      input,
      "bittensor",
      record,
      "bittensor_wallet_label",
      `You mentioned public SS58 ${truncatedPublicAddress(ss58Address)} in visible chat. I can use it for future TAO and subnet reads after you confirm.`,
      0.84,
    );
    if (walletSuggestion) suggestions.push(walletSuggestion);
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
    const subnetSuggestion = suggestion(
      input,
      "bittensor",
      record,
      "bittensor_subnet_watch_preference",
      `Subnet ${netuid} appeared in this Bittensor workflow. I can reuse it for future subnet or validator follow-ups after you confirm.`,
      0.72,
    );
    if (subnetSuggestion) suggestions.push(subnetSuggestion);
  }

  return suggestions;
}

function buildHyperliquidSuggestions(input: MatterhornMemorySuggestionProducerInput): MatterhornMemorySuggestion[] {
  const asset = extractHyperliquidAsset(input);
  const record = baseRecord(input, {
    id: safeId("mem_hyperliquid_watch", [asset ?? "market"]),
    kind: "watchlist",
    scope: "workspace",
    title: asset ? `Hyperliquid ${asset} market watch` : "Hyperliquid market watch",
    summary: asset
      ? `Remember ${asset} as a Hyperliquid market the user may want to read, preview, or watch.`
      : "Remember Hyperliquid as a market desk the user may want to read, preview, or watch.",
    body: {
      venue: "hyperliquid",
      ...(asset ? { asset } : { query: "general_hyperliquid_market_context" }),
      readOnly: true,
      previewOnly: true,
      externalSignerRequired: true,
    },
    tags: ["hyperliquid", "market", "watchlist", "preview-only", "memory-suggestion"],
    sensitivity: "public",
    canUseInChat: true,
    canExport: false,
  });
  const marketSuggestion = suggestion(
    input,
    "hyperliquid",
    record,
    "hyperliquid_watched_market",
    asset
      ? `${asset} appeared in this Hyperliquid preview. I can reuse it for read-only orderbook and funding follow-ups after you confirm.`
      : "A Hyperliquid preview appeared in visible chat. I can reuse it for read-only market follow-ups after you confirm.",
    asset ? 0.76 : 0.66,
  );
  return marketSuggestion ? [marketSuggestion] : [];
}

function buildPolymarketSuggestions(input: MatterhornMemorySuggestionProducerInput): MatterhornMemorySuggestion[] {
  const topic = extractPolymarketTopic(input);
  const record = baseRecord(input, {
    id: safeId("mem_polymarket_watch", [topic]),
    kind: "watchlist",
    scope: "workspace",
    title: "Polymarket research watch",
    summary: "Remember this public Polymarket topic for future market, outcome, liquidity, and compliance reads.",
    body: {
      venue: "polymarket",
      topic,
      readOnly: true,
      previewOnly: true,
      externalSignerRequired: true,
    },
    tags: ["polymarket", "prediction-market", "watchlist", "preview-only", "memory-suggestion"],
    sensitivity: "public",
    canUseInChat: true,
    canExport: false,
  });
  const marketSuggestion = suggestion(
    input,
    "polymarket",
    record,
    "polymarket_watched_market",
    "This Polymarket topic appeared in a read-only research prompt. I can reuse it for market, outcome, and liquidity follow-ups after you confirm.",
    0.72,
  );
  return marketSuggestion ? [marketSuggestion] : [];
}

function buildSuiSuggestions(input: MatterhornMemorySuggestionProducerInput): MatterhornMemorySuggestion[] {
  const suggestions: MatterhornMemorySuggestion[] = [];
  const address = extractSuiAddress(input);
  if (address) {
    const record = baseRecord(input, {
      id: safeId("mem_sui_wallet", [address.slice(0, 10)]),
      kind: "protocol_address",
      scope: "workspace",
      title: "Sui public wallet",
      summary: "Public Sui address for future account, balance, preview, and receipt workflows.",
      body: { suiAddress: address },
      tags: ["sui", "wallet", "protocol-address", "memory-suggestion"],
      sensitivity: "public",
      canUseInChat: true,
      canExport: true,
    });
    const walletSuggestion = suggestion(
      input,
      "sui",
      record,
      "sui_wallet_label",
      `You mentioned public Sui address ${truncatedPublicAddress(address)} in visible chat. I can use it for future Sui account and preview workflows after you confirm.`,
      0.8,
    );
    if (walletSuggestion) suggestions.push(walletSuggestion);
  }

  if (/transaction digest|receipt/i.test(input.prompt ?? "")) {
    const record = baseRecord(input, {
      id: safeId("mem_sui_receipt_context", [input.sessionId ?? input.sourceId ?? "receipt"]),
      kind: "receipt",
      scope: "workspace",
      title: "Sui receipt context",
      summary: "Public Sui receipt context for future project evidence review.",
      body: {
        venue: "sui",
        publicReceiptOnly: true,
        sourceId: input.sourceId ?? null,
      },
      tags: ["sui", "receipt", "public-metadata", "memory-suggestion"],
      sensitivity: "public",
      canUseInChat: true,
      canExport: true,
    });
    const receiptSuggestion = suggestion(
      input,
      "sui",
      record,
      "sui_receipt_context",
      "A Sui receipt workflow appeared in visible chat. I can reuse this public receipt context for future project evidence review after you confirm.",
      0.64,
    );
    if (receiptSuggestion) suggestions.push(receiptSuggestion);
  }

  return suggestions;
}

function buildWellnessSuggestions(input: MatterhornMemorySuggestionProducerInput): MatterhornMemorySuggestion[] {
  const prompt = input.prompt?.trim() ?? "";
  const templateId = input.templateId?.trim();
  if (!prompt && !templateId) return [];
  const record = baseRecord(input, {
    id: safeId("mem_wellness_preference", [templateId ?? "workflow"]),
    kind: "client_profile",
    scope: "user",
    title: "Longevity workflow preference",
    summary: "Opt-in preference for safe, educational longevity creator workflows.",
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
  const wellnessSuggestion = suggestion(
    input,
    "wellness",
    record,
    "wellness_client_preference",
    "This longevity workflow preference appeared in visible chat. If you confirm, it stays restricted, educational, and never clinical.",
    0.7,
  );
  return wellnessSuggestion ? [wellnessSuggestion] : [];
}

export function buildMatterhornMemorySuggestions(
  input: MatterhornMemorySuggestionProducerInput,
): MatterhornMemorySuggestion[] {
  if (hasForbiddenSuggestionInput(input)) {
    return [];
  }
  const desk = inferDesk(input);
  if (desk === "bittensor") return buildBittensorSuggestions(input);
  if (desk === "hyperliquid") return buildHyperliquidSuggestions(input);
  if (desk === "polymarket") return buildPolymarketSuggestions(input);
  if (desk === "sui") return buildSuiSuggestions(input);
  if (desk === "wellness") return buildWellnessSuggestions(input);
  return [];
}

export function dispatchMatterhornMemorySuggestions(
  input: MatterhornMemorySuggestionProducerInput,
): MatterhornMemorySuggestion[] {
  const suggestions = buildMatterhornMemorySuggestions(input);
  if (suggestions.length === 0 || typeof window === "undefined") return suggestions;
  window.dispatchEvent(new CustomEvent("matterhorn:memory-suggestions-updated", {
    detail: {
      suggestions,
      input,
      source: input.sourceId ?? "memory-suggestion-producer",
    },
  }));
  return suggestions;
}
