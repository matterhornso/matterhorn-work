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

export interface UnifiedCryptoChatResult {
  venue: RoutedCryptoVenue | "auto";
  requestedVenue: UnifiedCryptoVenue;
  intent: string;
  execution: UnifiedCryptoExecution;
  responseText: string;
  cards: unknown[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function findForbiddenUnifiedCryptoCredentialInput(value: unknown, path: string[] = [], depth = 0): string | null {
  if (depth > 50) return [...path, "too-deep"].join(".");
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
  return {
    venue: "auto",
    requestedVenue: normalizeVenue(input.venue),
    intent: "clarify_venue",
    execution: "clarification_required",
    responseText: question,
    cards: [{
      kind: "crypto_chat_clarification",
      title: "Choose a crypto surface",
      question,
      warnings,
    }],
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
    data: result.data ?? {},
    preview: result.preview,
    warnings: result.warnings,
    requiresClarification: Boolean(result.requiresClarification),
    clarificationQuestion: result.clarificationQuestion ?? null,
    route,
  };
}

function fromPolymarket(input: UnifiedCryptoChatInput, route: UnifiedCryptoRoutePlan, result: PolymarketChatExecutionResult): UnifiedCryptoChatResult {
  return {
    venue: "polymarket",
    requestedVenue: normalizeVenue(input.venue),
    intent: result.intent,
    execution: result.execution,
    responseText: result.responseText,
    cards: result.cards,
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
    return {
      venue: "auto",
      requestedVenue: normalizeVenue(input.venue),
      intent: "secret_rejected",
      execution: "unsupported",
      responseText: "For safety, remove private keys, seed phrases, API secrets, raw signatures, signed payloads, or wallet exports. Matterhorn only accepts public addresses, public market ids, and preview parameters.",
      cards: [{
        kind: "crypto_chat_secret_rejected",
        title: "Secret-shaped input rejected",
        summary: "Remove signing or credential material before continuing.",
        warnings: [`Rejected credential-shaped field: ${forbidden}`],
      }],
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
