import {
  executeBittensorChatWorkflow,
  type BittensorChatExecutionInput,
  type BittensorChatExecutionResult,
} from "./bittensor.js";
import {
  executeHyperliquidChatWorkflow,
  type HyperliquidChatExecutionInput,
  type HyperliquidChatExecutionResult,
  type HyperliquidProvider,
} from "./hyperliquid.js";
import {
  executePolymarketChatWorkflow,
  type PolymarketChatExecutionInput,
  type PolymarketChatExecutionResult,
  type PolymarketProvider,
} from "./polymarket.js";

export type UnifiedCryptoVenue = "auto" | "bittensor" | "hyperliquid" | "polymarket";
export type RoutedCryptoVenue = Exclude<UnifiedCryptoVenue, "auto">;
export type UnifiedCryptoExecution =
  | "answered"
  | "clarification_required"
  | "read_only"
  | "unsigned_preview"
  | "blocked_by_compliance"
  | "unsupported";

export interface UnifiedCryptoChatInput {
  venue?: UnifiedCryptoVenue | null;
  message: string;
  address?: string | null;
  ss58Address?: string | null;
  marketId?: string | null;
  outcome?: string | null;
  asset?: string | null;
  side?: string | null;
  size?: number | string | null;
  price?: number | string | null;
  amountUsdc?: number | string | null;
  amountTao?: number | string | null;
  netuid?: number | string | null;
  validatorHotkey?: string | null;
  coldkey?: string | null;
  recipient?: string | null;
  destination?: string | null;
  contextId?: string | null;
  context?: Partial<BittensorChatExecutionInput["context"]> | null;
  limit?: number | string | null;
  strategy?: string | null;
  slippageTolerance?: number | string | null;
  rateTolerance?: number | string | null;
  reduceOnly?: boolean | null;
}

export interface UnifiedCryptoRoutePlan {
  requestedVenue: UnifiedCryptoVenue;
  routedVenue: RoutedCryptoVenue | null;
  confidence: number;
  reason: string;
  candidates: Record<RoutedCryptoVenue, number>;
  requiresClarification: boolean;
  clarificationQuestion: string | null;
}

export type UnifiedCryptoSharedCardKind =
  | "clarification"
  | "discovery"
  | "account_snapshot"
  | "market_context"
  | "orderbook_context"
  | "action_preview"
  | "compliance_block"
  | "external_signer_handoff"
  | "receipt_status"
  | "watch_alert"
  | "generic";

export type UnifiedCryptoSharedCardStatus = "info" | "success" | "warning" | "danger";

export const UNIFIED_CRYPTO_SHARED_CARD_VERSION = "matterhorn.crypto.shared-card.v1" as const;

export const UNIFIED_CRYPTO_SHARED_CARD_KINDS = [
  "clarification",
  "discovery",
  "account_snapshot",
  "market_context",
  "orderbook_context",
  "action_preview",
  "compliance_block",
  "external_signer_handoff",
  "receipt_status",
  "watch_alert",
  "generic",
] as const satisfies readonly UnifiedCryptoSharedCardKind[];

export const UNIFIED_CRYPTO_SHARED_CARD_STATUSES = [
  "info",
  "success",
  "warning",
  "danger",
] as const satisfies readonly UnifiedCryptoSharedCardStatus[];

export interface UnifiedCryptoSharedCard {
  version: typeof UNIFIED_CRYPTO_SHARED_CARD_VERSION;
  kind: UnifiedCryptoSharedCardKind;
  venue: RoutedCryptoVenue | "auto";
  title: string;
  summary: string;
  status: UnifiedCryptoSharedCardStatus;
  originalKind: string | null;
  source: unknown | null;
  warnings: string[];
  data: unknown;
  safety: {
    nonCustodial: true;
    liveSubmissionEnabled: false;
    canSubmit: false;
  };
}

export interface UnifiedCryptoChatResult {
  venue: RoutedCryptoVenue | "auto";
  requestedVenue: UnifiedCryptoVenue;
  intent: string;
  execution: UnifiedCryptoExecution;
  responseText: string;
  cards: unknown[];
  sharedCards: UnifiedCryptoSharedCard[];
  data: Record<string, unknown>;
  preview?: unknown;
  compliance?: unknown;
  warnings: string[];
  requiresClarification: boolean;
  clarificationQuestion: string | null;
  route: UnifiedCryptoRoutePlan;
}

export interface UnifiedCryptoChatOptions {
  hyperliquidProvider?: HyperliquidProvider;
  polymarketProvider?: PolymarketProvider;
  bittensorExecutor?: (input: BittensorChatExecutionInput) => Promise<BittensorChatExecutionResult>;
}

const FORBIDDEN_CREDENTIAL_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;
const FORBIDDEN_CREDENTIAL_VALUE_RE =
  /\b(seed phrase|mnemonic|private key|api secret|raw signature|signed payload|wallet export)\b\s*(?:is|=|:|=>|to sign|for signing)?\s*["'`<]?[A-Za-z0-9_+=/@:.-]{8,}/i;
const FORBIDDEN_CREDENTIAL_COMMAND_RE =
  /\b(?:use|sign with|submit with|authenticate with|broadcast with)\b.{0,80}\b(seed phrase|mnemonic|private key|api secret|raw signature|signed payload|wallet export)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function findForbiddenUnifiedCryptoCredentialInput(value: unknown, path: string[] = [], depth = 0): string | null {
  if (depth > 50) return [...path, "too-deep"].join(".");
  if (typeof value === "string") {
    const sample = value.length > 4096 ? value.slice(0, 4096) : value;
    if (FORBIDDEN_CREDENTIAL_VALUE_RE.test(sample) || FORBIDDEN_CREDENTIAL_COMMAND_RE.test(sample)) {
      return path.length ? path.join(".") : "input";
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenUnifiedCryptoCredentialInput(value[index], [...path, String(index)], depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_CREDENTIAL_KEY_RE.test(key)) return [...path, key].join(".");
    const found = findForbiddenUnifiedCryptoCredentialInput(child, [...path, key], depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizeVenue(value: unknown): UnifiedCryptoVenue {
  return value === "bittensor" || value === "hyperliquid" || value === "polymarket" || value === "auto"
    ? value
    : "auto";
}

function textIncludes(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function cardRecord(card: unknown): Record<string, unknown> | null {
  return isRecord(card) ? card : null;
}

function cardKind(card: unknown): string | null {
  const record = cardRecord(card);
  return typeof record?.kind === "string" ? record.kind : null;
}

function cardTitle(card: unknown, fallback: string): string {
  const record = cardRecord(card);
  return typeof record?.title === "string" && record.title.trim() ? record.title : fallback;
}

function cardWarnings(card: unknown): string[] {
  const record = cardRecord(card);
  return Array.isArray(record?.warnings)
    ? record.warnings.filter((item): item is string => typeof item === "string")
    : [];
}

function extractSource(card: unknown): unknown | null {
  const record = cardRecord(card);
  if (!record) return null;
  if (isRecord(record.source)) return record.source;
  if (typeof record.source === "string") return { source: record.source };
  for (const value of Object.values(record)) {
    if (isRecord(value) && isRecord(value.source)) return value.source;
    if (isRecord(value) && typeof value.source === "string") return { source: value.source };
  }
  return null;
}

function sharedKindFor(originalKind: string | null): UnifiedCryptoSharedCardKind {
  switch (originalKind) {
    case "crypto_chat_clarification":
    case "hyperliquid_clarification":
    case "polymarket_clarification":
      return "clarification";
    case "subnet_comparison":
    case "adapter_marketplace":
    case "adapter_roadmap":
    case "hyperliquid_market_list":
    case "polymarket_market_list":
    case "polymarket_event_list":
      return "discovery";
    case "wallet_snapshot":
    case "hyperliquid_account_snapshot":
    case "hyperliquid_position_risk":
      return "account_snapshot";
    case "validator_selection":
    case "subnet_result":
    case "intelligence_report":
    case "hyperliquid_funding":
    case "polymarket_market_detail":
      return "market_context";
    case "hyperliquid_orderbook":
    case "polymarket_orderbook":
      return "orderbook_context";
    case "staking_quote":
    case "signed_action_review":
    case "hyperliquid_order_preview":
    case "polymarket_order_preview":
    case "adapter_canary_packet":
    case "adapter_operator_handoff":
      return "action_preview";
    case "polymarket_compliance":
      return "compliance_block";
    case "signing_handoff":
      return "external_signer_handoff";
    case "signed_result":
    case "signing_receipt":
      return "receipt_status";
    case "watchlist":
    case "polymarket_watch":
      return "watch_alert";
    default:
      return "generic";
  }
}

function sharedStatusFor(kind: UnifiedCryptoSharedCardKind, execution: UnifiedCryptoExecution, warnings: string[]): UnifiedCryptoSharedCardStatus {
  if (execution === "blocked_by_compliance" || kind === "compliance_block") return "danger";
  if (execution === "unsupported") return "warning";
  if (warnings.length > 0 || execution === "clarification_required") return "warning";
  if (execution === "answered" || execution === "read_only" || execution === "unsigned_preview") return "success";
  return "info";
}

function isMarketActionPreview(venue: RoutedCryptoVenue | "auto", kind: UnifiedCryptoSharedCardKind, originalKind: string | null): boolean {
  return kind === "action_preview"
    && (venue === "hyperliquid" || venue === "polymarket")
    && Boolean(originalKind && /order_preview/i.test(originalKind));
}

function previewOnlyTitle(venue: RoutedCryptoVenue | "auto", kind: UnifiedCryptoSharedCardKind, originalKind: string | null, title: string): string {
  if (!isMarketActionPreview(venue, kind, originalKind)) return title;
  return /preview only/i.test(title) ? title : `Preview Only: ${title}`;
}

function sharedSummaryFor(kind: UnifiedCryptoSharedCardKind, venue: RoutedCryptoVenue | "auto", title: string, originalKind: string | null = null): string {
  switch (kind) {
    case "clarification":
      return "More context is needed before Matterhorn can continue safely.";
    case "discovery":
      return `Discovery result from ${venue}: ${title}.`;
    case "account_snapshot":
      return `Read-only account or wallet context from ${venue}.`;
    case "market_context":
      return `Read-only market, validator, subnet, or odds context from ${venue}.`;
    case "orderbook_context":
      return `Read-only orderbook/depth context from ${venue}.`;
    case "action_preview":
      if (isMarketActionPreview(venue, kind, originalKind)) {
        return `Preview only from ${venue}; Matterhorn prepares safe previews, while your wallet/client decides whether anything is signed externally.`;
      }
      return `Non-custodial preview from ${venue}; Matterhorn does not sign or submit.`;
    case "compliance_block":
      return `Compliance status from ${venue}; blocked previews must not contain executable order terms.`;
    case "external_signer_handoff":
      return `External signer handoff from ${venue}; signing stays outside Matterhorn.`;
    case "receipt_status":
      return `Public receipt/status evidence from ${venue}.`;
    case "watch_alert":
      return `Monitoring or alert context from ${venue}.`;
    default:
      return `Crypto chat card from ${venue}: ${title}.`;
  }
}

export function buildUnifiedCryptoSharedCards(
  venue: RoutedCryptoVenue | "auto",
  execution: UnifiedCryptoExecution,
  cards: unknown[],
  inheritedWarnings: string[] = [],
): UnifiedCryptoSharedCard[] {
  return cards.map((card) => {
    const originalKind = cardKind(card);
    const kind = sharedKindFor(originalKind);
    const warnings = Array.from(new Set([...inheritedWarnings, ...cardWarnings(card)]));
    const title = previewOnlyTitle(venue, kind, originalKind, cardTitle(card, kind.replace(/_/g, " ")));
    return {
      version: UNIFIED_CRYPTO_SHARED_CARD_VERSION,
      kind,
      venue,
      title,
      summary: sharedSummaryFor(kind, venue, title, originalKind),
      status: sharedStatusFor(kind, execution, warnings),
      originalKind,
      source: extractSource(card),
      warnings,
      data: card,
      safety: {
        nonCustodial: true,
        liveSubmissionEnabled: false,
        canSubmit: false,
      },
    };
  });
}

export function validateUnifiedCryptoSharedCardContract(card: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(card)) return ["shared card must be an object"];
  if (card.version !== UNIFIED_CRYPTO_SHARED_CARD_VERSION) errors.push(`version must be ${UNIFIED_CRYPTO_SHARED_CARD_VERSION}`);
  if (!UNIFIED_CRYPTO_SHARED_CARD_KINDS.includes(card.kind as UnifiedCryptoSharedCardKind)) errors.push("kind must be a known shared-card kind");
  if (!["auto", "bittensor", "hyperliquid", "polymarket"].includes(String(card.venue))) errors.push("venue must be auto, bittensor, hyperliquid, or polymarket");
  if (typeof card.title !== "string" || !card.title.trim()) errors.push("title must be a non-empty string");
  if (typeof card.summary !== "string" || !card.summary.trim()) errors.push("summary must be a non-empty string");
  if (!UNIFIED_CRYPTO_SHARED_CARD_STATUSES.includes(card.status as UnifiedCryptoSharedCardStatus)) errors.push("status must be info, success, warning, or danger");
  if (card.originalKind !== null && typeof card.originalKind !== "string") errors.push("originalKind must be a string or null");
  if (!Array.isArray(card.warnings) || !card.warnings.every((warning) => typeof warning === "string")) errors.push("warnings must be an array of strings");
  if (!("data" in card)) errors.push("data is required");
  const safety = isRecord(card.safety) ? card.safety : null;
  if (!safety) {
    errors.push("safety must be present");
  } else {
    if (safety.nonCustodial !== true) errors.push("safety.nonCustodial must be true");
    if (safety.liveSubmissionEnabled !== false) errors.push("safety.liveSubmissionEnabled must be false");
    if (safety.canSubmit !== false) errors.push("safety.canSubmit must be false");
  }
  return errors;
}

function routeScores(input: UnifiedCryptoChatInput): Record<RoutedCryptoVenue, number> {
  const text = input.message.toLowerCase();
  let bittensor = 0;
  let hyperliquid = 0;
  let polymarket = 0;

  if (textIncludes(text, /\b(bittensor|tao|subnet|netuid|coldkey|hotkey|validator|validators|miner|miners|alpha|dtao|dynamic tao|stake|staking|unstake)\b/i)) bittensor += 3;
  if (input.ss58Address || input.netuid !== undefined || input.validatorHotkey || input.coldkey || input.amountTao !== undefined) bittensor += 3;

  if (textIncludes(text, /\b(hyperliquid|perp|perps|perpetual|funding|liquidation|leverage|margin|position|positions)\b/i)) hyperliquid += 3;
  if (textIncludes(text, /\b(orderbook|order book)\b/i)) hyperliquid += 1;
  if (input.address || input.asset) hyperliquid += 2;

  if (textIncludes(text, /\b(polymarket|prediction market|prediction markets|bet|betting|odds|outcome|outcomes|geoblock|geoblocked|compliance|event|events)\b/i)) polymarket += 3;
  if (textIncludes(text, /\b(yes|no)\b/i) && textIncludes(text, /\b(order|market|shares|outcome)\b/i)) polymarket += 2;
  if (input.marketId || input.outcome || input.amountUsdc !== undefined) polymarket += 3;

  return { bittensor, hyperliquid, polymarket };
}

export function planUnifiedCryptoChat(input: UnifiedCryptoChatInput): UnifiedCryptoRoutePlan {
  const requestedVenue = normalizeVenue(input.venue);
  if (requestedVenue !== "auto") {
    return {
      requestedVenue,
      routedVenue: requestedVenue,
      confidence: 1,
      reason: `User explicitly selected ${requestedVenue}.`,
      candidates: routeScores(input),
      requiresClarification: false,
      clarificationQuestion: null,
    };
  }

  const candidates = routeScores(input);
  const ranked = (Object.entries(candidates) as Array<[RoutedCryptoVenue, number]>)
    .sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (!first || first[1] <= 0) {
    return {
      requestedVenue,
      routedVenue: null,
      confidence: 0,
      reason: "No venue-specific terms were found.",
      candidates,
      requiresClarification: true,
      clarificationQuestion: "Which crypto surface should I use: Bittensor, Hyperliquid, or Polymarket?",
    };
  }
  if (second && second[1] === first[1]) {
    return {
      requestedVenue,
      routedVenue: null,
      confidence: 0.45,
      reason: "The prompt matched multiple crypto venues equally.",
      candidates,
      requiresClarification: true,
      clarificationQuestion: "This could fit more than one venue. Should I use Bittensor, Hyperliquid, or Polymarket?",
    };
  }
  return {
    requestedVenue,
    routedVenue: first[0],
    confidence: Math.min(0.95, 0.55 + first[1] * 0.1),
    reason: `Auto-routed to ${first[0]} from venue-specific prompt/context terms.`,
    candidates,
    requiresClarification: false,
    clarificationQuestion: null,
  };
}

function clarificationResult(input: UnifiedCryptoChatInput, route: UnifiedCryptoRoutePlan, question: string, warnings: string[] = []): UnifiedCryptoChatResult {
  const cards = [{
    kind: "crypto_chat_clarification",
    title: "Choose a crypto surface",
    question,
    warnings,
  }];
  return {
    venue: "auto",
    requestedVenue: normalizeVenue(input.venue),
    intent: "clarify_venue",
    execution: "clarification_required",
    responseText: question,
    cards,
    sharedCards: buildUnifiedCryptoSharedCards("auto", "clarification_required", cards, warnings),
    data: {},
    warnings,
    requiresClarification: true,
    clarificationQuestion: question,
    route,
  };
}

function fromBittensor(input: UnifiedCryptoChatInput, route: UnifiedCryptoRoutePlan, result: BittensorChatExecutionResult): UnifiedCryptoChatResult {
  return {
    venue: "bittensor",
    requestedVenue: normalizeVenue(input.venue),
    intent: result.plan.intent,
    execution: result.execution,
    responseText: result.responseText,
    cards: result.cards,
    sharedCards: buildUnifiedCryptoSharedCards("bittensor", result.execution, result.cards, result.warnings),
    data: { ...result.data, context: result.context ?? null },
    warnings: result.warnings,
    requiresClarification: result.requiresClarification,
    clarificationQuestion: result.clarificationQuestion,
    route,
  };
}

function fromHyperliquid(input: UnifiedCryptoChatInput, route: UnifiedCryptoRoutePlan, result: HyperliquidChatExecutionResult): UnifiedCryptoChatResult {
  return {
    venue: "hyperliquid",
    requestedVenue: normalizeVenue(input.venue),
    intent: result.intent,
    execution: result.execution,
    responseText: result.responseText,
    cards: result.cards,
    sharedCards: buildUnifiedCryptoSharedCards("hyperliquid", result.execution, result.cards, result.warnings),
    data: result.data ?? {},
    preview: result.preview,
    warnings: result.warnings,
    requiresClarification: Boolean(result.requiresClarification),
    clarificationQuestion: result.clarificationQuestion ?? null,
    route,
  };
}

function fromPolymarket(input: UnifiedCryptoChatInput, route: UnifiedCryptoRoutePlan, result: PolymarketChatExecutionResult): UnifiedCryptoChatResult {
  const sharedCards = buildUnifiedCryptoSharedCards("polymarket", result.execution, result.cards, result.warnings);
  if (result.preview && !sharedCards.some((card) => card.kind === "action_preview")) {
    sharedCards.push(...buildUnifiedCryptoSharedCards(
      "polymarket",
      result.execution,
      [{
        kind: "polymarket_order_preview",
        title: result.execution === "blocked_by_compliance" ? "Polymarket blocked preview" : "Polymarket order preview",
        preview: result.preview,
        warnings: result.preview.warnings,
      }],
      result.warnings,
    ));
  }
  return {
    venue: "polymarket",
    requestedVenue: normalizeVenue(input.venue),
    intent: result.intent,
    execution: result.execution,
    responseText: result.responseText,
    cards: result.cards,
    sharedCards,
    data: result.data ?? {},
    preview: result.preview,
    compliance: result.compliance,
    warnings: result.warnings,
    requiresClarification: Boolean(result.requiresClarification),
    clarificationQuestion: result.clarificationQuestion ?? null,
    route,
  };
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function executeUnifiedCryptoChatWorkflow(
  input: UnifiedCryptoChatInput,
  options: UnifiedCryptoChatOptions = {},
): Promise<UnifiedCryptoChatResult> {
  const message = input.message.trim();
  const initialRoute = planUnifiedCryptoChat({ ...input, message });
  if (!message) {
    return clarificationResult(input, initialRoute, "What would you like to do with Bittensor, Hyperliquid, or Polymarket?");
  }
  const forbidden = findForbiddenUnifiedCryptoCredentialInput(input);
  if (forbidden) {
    const cards = [{
      kind: "crypto_chat_secret_rejected",
      title: "Secret-shaped input rejected",
      summary: "Remove signing or credential material before continuing.",
      warnings: [`Rejected credential-shaped field: ${forbidden}`],
    }];
    return {
      venue: "auto",
      requestedVenue: normalizeVenue(input.venue),
      intent: "secret_rejected",
      execution: "unsupported",
      responseText: "For safety, remove private keys, seed phrases, API secrets, raw signatures, signed payloads, or wallet exports. Matterhorn only accepts public addresses, public market ids, and preview parameters.",
      cards,
      sharedCards: buildUnifiedCryptoSharedCards("auto", "unsupported", cards, [`Rejected credential-shaped field: ${forbidden}`]),
      data: { rejectedField: forbidden },
      warnings: [`Rejected credential-shaped field: ${forbidden}`],
      requiresClarification: false,
      clarificationQuestion: null,
      route: initialRoute,
    };
  }

  const route = planUnifiedCryptoChat({ ...input, message });
  if (route.requiresClarification || !route.routedVenue) {
    return clarificationResult(input, route, route.clarificationQuestion ?? "Which crypto surface should I use?");
  }

  if (route.routedVenue === "bittensor") {
    const execute = options.bittensorExecutor ?? executeBittensorChatWorkflow;
    const strategy = input.strategy === "yield" || input.strategy === "safety" || input.strategy === "balanced" ? input.strategy : null;
    const result = await execute({
      message,
      contextId: input.contextId ?? null,
      context: input.context ?? null,
      ss58Address: input.ss58Address ?? null,
      netuid: numberOrNull(input.netuid),
      amountTao: input.amountTao ?? null,
      validatorHotkey: input.validatorHotkey ?? null,
      coldkey: input.coldkey ?? null,
      recipient: input.recipient ?? null,
      destination: input.destination ?? null,
      limit: numberOrNull(input.limit),
      strategy,
      rateTolerance: numberOrNull(input.rateTolerance),
    });
    return fromBittensor(input, route, result);
  }

  if (route.routedVenue === "hyperliquid") {
    const result = await executeHyperliquidChatWorkflow({
      message,
      address: input.address ?? null,
      asset: input.asset ?? null,
      side: input.side as HyperliquidChatExecutionInput["side"],
      size: input.size ?? null,
      price: input.price ?? null,
      limit: input.limit ?? null,
      slippageTolerance: input.slippageTolerance ?? null,
      reduceOnly: input.reduceOnly ?? null,
    }, { provider: options.hyperliquidProvider });
    return fromHyperliquid(input, route, result);
  }

  const result = await executePolymarketChatWorkflow({
    message,
    marketId: input.marketId ?? null,
    outcome: input.outcome ?? null,
    side: input.side as PolymarketChatExecutionInput["side"],
    amountUsdc: input.amountUsdc ?? null,
    slippageTolerance: input.slippageTolerance ?? null,
    limit: input.limit ?? null,
  }, { provider: options.polymarketProvider });
  return fromPolymarket(input, route, result);
}
