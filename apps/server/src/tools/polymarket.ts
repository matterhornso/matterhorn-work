/**
 * Polymarket discovery, compliance, and preview-only tools.
 *
 * Scope (see docs/parallel-agent-market-roadmap.md, Phase 4):
 *  - Gamma market/event discovery + market detail reads.
 *  - CLOB orderbook reads + public price/spread/midpoint shaping.
 *  - Geoblock/compliance check before any order preview.
 *  - Chat planner/executor for discover / explain / orderbook / order-preview.
 *  - Order PREVIEW ONLY. There is intentionally no order submission, signing,
 *    API-key, or private-key path in this module.
 *
 * This module mirrors the shared market safety vocabulary from
 * packages/types/src/markets.ts (venue ids, signer policies, execution states,
 * preview version, forbidden-credential key pattern). The mirror is kept
 * Polymarket-local so this stream stays independent of Codex's shared files;
 * scripts/polymarket-live-qa.test.mjs asserts the mirror stays aligned with the
 * canonical contract.
 */

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Shared market safety vocabulary (mirror of packages/types/src/markets.ts).
// ---------------------------------------------------------------------------

export const POLYMARKET_VENUE = "polymarket" as const;
export const POLYMARKET_PREVIEW_VERSION = "matterhorn.market.action-preview.v1" as const;

/**
 * Mirror of MARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN. Any payload key matching
 * this (case-insensitive) is rejected before it can reach a provider or preview.
 */
export const POLYMARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN =
  "(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)";

export type PolymarketSignerPolicy = "read_only" | "api_wallet_required" | "blocked_by_compliance";

export type PolymarketExecutionState =
  | "answered"
  | "clarification_required"
  | "read_only"
  | "unsigned_preview"
  | "blocked_by_compliance"
  | "unsupported";

export type PolymarketChatIntent = "learn" | "discover" | "orderbook" | "order_preview" | "compliance";

export type PolymarketOrderSide = "yes" | "no";

// ---------------------------------------------------------------------------
// Public shapes.
// ---------------------------------------------------------------------------

export interface PolymarketComplianceStatus {
  status: "allowed" | "blocked" | "unknown";
  reason: string | null;
  jurisdiction: string | null;
  checkedAt: string | null;
  source: string;
}

export interface PolymarketSourceFreshness {
  source: string;
  fetchedAt: string;
  freshness: "live" | "recent" | "stale" | "fallback" | "unknown";
  warnings: string[];
}

export interface PolymarketMarketSummary {
  id: string;
  question: string;
  slug: string | null;
  eventId: string | null;
  eventTitle: string | null;
  description: string | null;
  outcomes: string[];
  /** outcome label -> mid price (probability, 0..1) */
  outcomePrices: Record<string, number>;
  /** outcome label -> CLOB token id used for orderbook reads */
  tokenIds: Record<string, string>;
  volume: number | null;
  liquidity: number | null;
  endDate: string | null;
  active: boolean;
  closed: boolean;
}

export interface PolymarketEventDetail {
  id: string;
  title: string;
  description: string | null;
  endDate: string | null;
  volume: number | null;
  liquidity: number | null;
  markets: PolymarketMarketSummary[];
}

export interface PolymarketOrderbookLevel {
  price: number;
  size: number;
}

export interface PolymarketOrderbookSnapshot {
  marketId: string | null;
  tokenId: string;
  outcome: string | null;
  bids: PolymarketOrderbookLevel[];
  asks: PolymarketOrderbookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  spread: number | null;
  source: PolymarketSourceFreshness;
}

export interface PolymarketActionFee {
  label: string;
  amount: number | null;
  asset: string | null;
}

/**
 * Preview-only order shape. Aligned with MarketActionPreview from the shared
 * contract. `canSubmit` is the literal `false`; there is no code path that
 * flips it true.
 */
export interface PolymarketOrderPreview {
  version: typeof POLYMARKET_PREVIEW_VERSION;
  venue: typeof POLYMARKET_VENUE;
  intent: "order_preview";
  signerPolicy: PolymarketSignerPolicy;
  execution: "unsigned_preview" | "blocked_by_compliance";
  action: string;
  marketId: string | null;
  marketLabel: string | null;
  outcome: string | null;
  side: PolymarketOrderSide | null;
  /** USDC notional the user intends to spend */
  size: number | null;
  sizeAsset: "USDC";
  /** expected average fill price as a probability (0..1) */
  price: number | null;
  priceAsset: "probability";
  estimatedShares: number | null;
  slippageTolerance: number | null;
  expiresAt: string | null;
  fees: PolymarketActionFee[];
  consequence: string;
  confirmationText: string;
  previewSha256: string;
  source: PolymarketSourceFreshness;
  compliance: PolymarketComplianceStatus;
  warnings: string[];
  canSubmit: false;
}

export interface PolymarketChatResult {
  venue: typeof POLYMARKET_VENUE;
  intent: PolymarketChatIntent;
  execution: PolymarketExecutionState;
  responseText: string;
  cards: unknown[];
  data: Record<string, unknown>;
  preview?: PolymarketOrderPreview;
  compliance?: PolymarketComplianceStatus;
  warnings: string[];
  requiresClarification?: boolean;
  clarificationQuestion?: string;
}

export interface PolymarketChatInput {
  message: string;
  marketId?: string;
  outcome?: string;
  side?: PolymarketOrderSide;
  /** USDC notional for an order preview */
  amountUsdc?: number;
  slippageTolerance?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Secret-field rejection.
// ---------------------------------------------------------------------------

const FORBIDDEN_KEY_RE = new RegExp(POLYMARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN, "i");

/** Hex private key (32 bytes) or a 65-byte raw ECDSA signature. */
const HEX_PRIVATE_KEY_RE = /\b0x[0-9a-fA-F]{64}\b/;
const HEX_RAW_SIGNATURE_RE = /\b0x[0-9a-fA-F]{130}\b/;
const PEM_PRIVATE_KEY_RE = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i;
const PGP_PRIVATE_KEY_RE = /-----BEGIN PGP PRIVATE KEY BLOCK-----/i;
/** A run of >= 12 lowercase alphabetic words: a likely BIP39 mnemonic. */
const MNEMONIC_RE = /\b(?:[a-z]{3,8}\s+){11,}[a-z]{3,8}\b/;

/**
 * Thrown when a payload carries forbidden signing material. The message names
 * only the field/category; it never echoes the offending value.
 */
export class PolymarketSecretRejectedError extends Error {
  readonly code = "secret_field_rejected";
  readonly field: string;
  readonly category: string;
  constructor(field: string, category: string) {
    super(`Rejected payload: '${field}' looks like ${category}. Matterhorn never accepts signing material.`);
    this.name = "PolymarketSecretRejectedError";
    this.field = field;
    this.category = category;
  }
}

function classifyForbiddenValue(value: string): string | null {
  if (PEM_PRIVATE_KEY_RE.test(value)) return "a private key";
  if (PGP_PRIVATE_KEY_RE.test(value)) return "a private key";
  if (HEX_RAW_SIGNATURE_RE.test(value)) return "a raw signature";
  if (HEX_PRIVATE_KEY_RE.test(value)) return "a private key";
  if (MNEMONIC_RE.test(value)) return "a seed phrase / mnemonic";
  return null;
}

/**
 * Deep-scan an arbitrary payload for forbidden credential keys and for values
 * that look like signing material. Throws PolymarketSecretRejectedError on the
 * first hit. Never returns or logs the offending value.
 */
export function assertNoForbiddenSecrets(payload: unknown, path = "payload"): void {
  if (typeof payload === "string") {
    const category = classifyForbiddenValue(payload);
    if (category) throw new PolymarketSecretRejectedError(path, category);
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item, index) => assertNoForbiddenSecrets(item, `${path}[${index}]`));
    return;
  }
  if (typeof payload === "object" && payload !== null) {
    for (const [key, value] of Object.entries(payload)) {
      if (FORBIDDEN_KEY_RE.test(key)) {
        throw new PolymarketSecretRejectedError(`${path}.${key}`, "a forbidden credential field");
      }
      assertNoForbiddenSecrets(value, `${path}.${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal parsing helpers (no `any`, no value casts).
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

/** Gamma encodes outcomes / prices / token ids as JSON strings or arrays. */
function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === "string" ? item : String(item)));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function parseNumberArray(value: unknown): number[] {
  const strings = parseStringArray(value);
  if (strings.length > 0) return strings.map((item) => Number(item)).filter((n) => Number.isFinite(n));
  if (Array.isArray(value)) {
    return value.map((item) => asNumber(item)).filter((n): n is number => n !== null);
  }
  return [];
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapMarketRecord(record: Record<string, unknown>): PolymarketMarketSummary {
  const outcomes = parseStringArray(record.outcomes);
  const prices = parseNumberArray(record.outcomePrices);
  const tokenIds = parseStringArray(record.clobTokenIds);

  const outcomePrices: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  outcomes.forEach((outcome, index) => {
    if (index < prices.length) outcomePrices[outcome] = prices[index];
    if (index < tokenIds.length) tokens[outcome] = tokenIds[index];
  });

  const eventBlock = Array.isArray(record.events) && isRecord(record.events[0]) ? record.events[0] : null;

  return {
    id: asString(record.id) ?? asString(record.conditionId) ?? "",
    question: asString(record.question) ?? asString(record.title) ?? "",
    slug: asString(record.slug),
    eventId: eventBlock ? asString(eventBlock.id) : asString(record.eventId),
    eventTitle: eventBlock ? asString(eventBlock.title) : null,
    description: asString(record.description),
    outcomes,
    outcomePrices,
    tokenIds: tokens,
    volume: asNumber(record.volume),
    liquidity: asNumber(record.liquidity),
    endDate: asString(record.endDate),
    active: asBoolean(record.active, true),
    closed: asBoolean(record.closed, false),
  };
}

function matchesQuery(market: PolymarketMarketSummary, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = `${market.question} ${market.description ?? ""} ${market.eventTitle ?? ""}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

// ---------------------------------------------------------------------------
// Provider (read-only).
// ---------------------------------------------------------------------------

export interface PolymarketProviderOptions {
  gammaBaseUrl?: string;
  clobBaseUrl?: string;
  /** Polymarket geoblock endpoint; returns `{ blocked: boolean }`. */
  geoblockUrl?: string;
  /** Injectable fetch for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const DEFAULT_CLOB_BASE_URL = "https://clob.polymarket.com";
const DEFAULT_GEOBLOCK_URL = "https://polymarket.com/api/geoblock";

/**
 * Read-only Polymarket provider. Every method issues an HTTP GET only. There is
 * no POST / submit / sign method on this class by design.
 */
export class PolymarketProvider {
  private readonly gammaBaseUrl: string;
  private readonly clobBaseUrl: string;
  private readonly geoblockUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: PolymarketProviderOptions = {}) {
    this.gammaBaseUrl = (options.gammaBaseUrl ?? DEFAULT_GAMMA_BASE_URL).replace(/\/$/, "");
    this.clobBaseUrl = (options.clobBaseUrl ?? DEFAULT_CLOB_BASE_URL).replace(/\/$/, "");
    this.geoblockUrl = options.geoblockUrl ?? DEFAULT_GEOBLOCK_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  private async getJson(url: string, params?: Record<string, string | number>): Promise<unknown> {
    const target = new URL(url);
    if (params) {
      for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(target.toString(), { method: "GET", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Discover markets by keyword via the Gamma API. */
  async searchMarkets(query: string, limit = 10): Promise<PolymarketMarketSummary[]> {
    const data = await this.getJson(`${this.gammaBaseUrl}/markets`, {
      active: "true",
      closed: "false",
      limit: String(Math.max(limit * 3, limit)),
      order: "volume",
      ascending: "false",
    });
    const rawList = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.markets) ? data.markets : [];
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const markets = rawList.filter(isRecord).map(mapMarketRecord).filter((m) => m.id !== "");
    return markets.filter((market) => matchesQuery(market, terms)).slice(0, limit);
  }

  /** Read full market detail. */
  async getMarket(marketId: string): Promise<PolymarketMarketSummary> {
    const data = await this.getJson(`${this.gammaBaseUrl}/markets/${encodeURIComponent(marketId)}`);
    if (!isRecord(data)) throw new Error(`Polymarket market ${marketId} not found`);
    return mapMarketRecord(data);
  }

  /** Read an event and its markets. */
  async getEvent(eventId: string): Promise<PolymarketEventDetail> {
    const data = await this.getJson(`${this.gammaBaseUrl}/events/${encodeURIComponent(eventId)}`);
    if (!isRecord(data)) throw new Error(`Polymarket event ${eventId} not found`);
    const rawMarkets = Array.isArray(data.markets) ? data.markets.filter(isRecord) : [];
    return {
      id: asString(data.id) ?? eventId,
      title: asString(data.title) ?? "",
      description: asString(data.description),
      endDate: asString(data.endDate),
      volume: asNumber(data.volume),
      liquidity: asNumber(data.liquidity),
      markets: rawMarkets.map(mapMarketRecord),
    };
  }

  /** Read a CLOB orderbook and shape public price / spread / midpoint. */
  async getOrderbook(tokenId: string, opts: { marketId?: string; outcome?: string } = {}): Promise<PolymarketOrderbookSnapshot> {
    const data = await this.getJson(`${this.clobBaseUrl}/book`, { token_id: tokenId });
    const book = isRecord(data) ? data : {};
    const bids = this.parseLevels(book.bids);
    const asks = this.parseLevels(book.asks);
    return shapeOrderbook(tokenId, bids, asks, {
      marketId: opts.marketId ?? (isRecord(book) ? asString(book.market) : null),
      outcome: opts.outcome ?? null,
      source: `${this.clobBaseUrl}/book`,
    });
  }

  private parseLevels(value: unknown): PolymarketOrderbookLevel[] {
    if (!Array.isArray(value)) return [];
    const levels: PolymarketOrderbookLevel[] = [];
    for (const entry of value) {
      if (!isRecord(entry)) continue;
      const price = asNumber(entry.price);
      const size = asNumber(entry.size);
      if (price === null || size === null) continue;
      levels.push({ price, size });
    }
    return levels;
  }

  /** Compliance / geoblock check. Read-only; never blocks research flows. */
  async checkGeoblock(): Promise<PolymarketComplianceStatus> {
    try {
      const data = await this.getJson(this.geoblockUrl);
      const blocked = isRecord(data) ? asBoolean(data.blocked, false) : false;
      const jurisdiction = isRecord(data) ? asString(data.country) ?? asString(data.region) : null;
      return {
        status: blocked ? "blocked" : "allowed",
        reason: blocked ? "Polymarket geoblock reports this region is restricted from trading." : null,
        jurisdiction,
        checkedAt: nowIso(),
        source: this.geoblockUrl,
      };
    } catch (error) {
      return {
        status: "unknown",
        reason: `Geoblock check failed: ${error instanceof Error ? error.message : "unknown error"}`,
        jurisdiction: null,
        checkedAt: nowIso(),
        source: this.geoblockUrl,
      };
    }
  }
}

/** Shape best bid/ask, midpoint, and spread from raw levels. Pure + exported for tests. */
export function shapeOrderbook(
  tokenId: string,
  bids: PolymarketOrderbookLevel[],
  asks: PolymarketOrderbookLevel[],
  meta: { marketId: string | null; outcome: string | null; source: string },
): PolymarketOrderbookSnapshot {
  const sortedBids = [...bids].sort((a, b) => b.price - a.price);
  const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
  const bestBid = sortedBids.length > 0 ? sortedBids[0].price : null;
  const bestAsk = sortedAsks.length > 0 ? sortedAsks[0].price : null;
  const midpoint = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const warnings: string[] = [];
  if (sortedBids.length === 0 || sortedAsks.length === 0) warnings.push("Thin or one-sided orderbook.");
  return {
    marketId: meta.marketId,
    tokenId,
    outcome: meta.outcome,
    bids: sortedBids,
    asks: sortedAsks,
    bestBid,
    bestAsk,
    midpoint,
    spread,
    source: { source: meta.source, fetchedAt: nowIso(), freshness: "live", warnings },
  };
}

// ---------------------------------------------------------------------------
// Order preview (preview-only).
// ---------------------------------------------------------------------------

/** Walk asks to estimate the average fill probability and shares for a USDC buy. */
export function estimateBuyFill(
  asks: PolymarketOrderbookLevel[],
  targetUsdc: number,
): { avgPrice: number | null; shares: number; filledUsdc: number; fullyFilled: boolean } {
  const sorted = [...asks].sort((a, b) => a.price - b.price);
  let remaining = targetUsdc;
  let shares = 0;
  let spent = 0;
  for (const level of sorted) {
    if (remaining <= 0) break;
    const levelUsdc = level.price * level.size;
    const takeUsdc = Math.min(levelUsdc, remaining);
    const takeShares = level.price > 0 ? takeUsdc / level.price : 0;
    shares += takeShares;
    spent += takeUsdc;
    remaining -= takeUsdc;
  }
  const avgPrice = shares > 0 ? spent / shares : null;
  return { avgPrice, shares, filledUsdc: spent, fullyFilled: remaining <= 1e-9 };
}

function previewHash(fields: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

const PREVIEW_CONSEQUENCE =
  "Preview only. Matterhorn does not submit, sign, or custody Polymarket orders. To trade, the user must act in their own Polymarket account.";

export interface BuildOrderPreviewArgs {
  market: PolymarketMarketSummary;
  outcome: string;
  side: PolymarketOrderSide;
  amountUsdc: number;
  orderbook: PolymarketOrderbookSnapshot;
  compliance: PolymarketComplianceStatus;
  slippageTolerance?: number;
}

/** Build a blocked, non-executable preview when compliance blocks the user. */
export function buildBlockedOrderPreview(args: {
  market: PolymarketMarketSummary | null;
  outcome: string | null;
  side: PolymarketOrderSide | null;
  amountUsdc: number | null;
  compliance: PolymarketComplianceStatus;
}): PolymarketOrderPreview {
  const warnings = [
    "Order preview blocked by Polymarket compliance / geoblock.",
    "No executable order parameters were generated.",
  ];
  return {
    version: POLYMARKET_PREVIEW_VERSION,
    venue: POLYMARKET_VENUE,
    intent: "order_preview",
    signerPolicy: "blocked_by_compliance",
    execution: "blocked_by_compliance",
    action: "buy_shares",
    marketId: args.market?.id ?? null,
    marketLabel: args.market?.question ?? null,
    outcome: args.outcome,
    side: args.side,
    // Deliberately null: a blocked preview must not carry executable price/size.
    size: null,
    sizeAsset: "USDC",
    price: null,
    priceAsset: "probability",
    estimatedShares: null,
    slippageTolerance: null,
    expiresAt: null,
    fees: [],
    consequence: args.compliance.reason ?? "Blocked by compliance.",
    confirmationText: "This region is geoblocked. No order can be previewed or placed through Matterhorn.",
    previewSha256: previewHash({ blocked: true, marketId: args.market?.id ?? null, outcome: args.outcome }),
    source: { source: args.compliance.source, fetchedAt: nowIso(), freshness: "live", warnings },
    compliance: args.compliance,
    warnings,
    canSubmit: false,
  };
}

/** Build an unsigned, non-submittable order preview. */
export function buildOrderPreview(args: BuildOrderPreviewArgs): PolymarketOrderPreview {
  const fill = estimateBuyFill(args.orderbook.asks, args.amountUsdc);
  const warnings: string[] = [];
  if (!fill.fullyFilled) warnings.push("Orderbook liquidity is insufficient to fully fill this size at preview time.");
  if (fill.avgPrice === null) warnings.push("No ask-side liquidity available; price could not be estimated.");
  if (args.orderbook.spread !== null && args.orderbook.spread > 0.05) warnings.push("Wide spread — fill price is uncertain.");
  warnings.push("Prediction-market shares are risk-bearing information instruments, not investment or betting advice.");

  const price = fill.avgPrice;
  const shares = price !== null ? fill.shares : null;
  const fields = {
    version: POLYMARKET_PREVIEW_VERSION,
    venue: POLYMARKET_VENUE,
    marketId: args.market.id,
    outcome: args.outcome,
    side: args.side,
    size: args.amountUsdc,
    price,
    shares,
    slippageTolerance: args.slippageTolerance ?? null,
  };

  return {
    version: POLYMARKET_PREVIEW_VERSION,
    venue: POLYMARKET_VENUE,
    intent: "order_preview",
    // Polymarket order execution would require an API wallet Matterhorn does not provide.
    signerPolicy: "api_wallet_required",
    execution: "unsigned_preview",
    action: "buy_shares",
    marketId: args.market.id,
    marketLabel: args.market.question,
    outcome: args.outcome,
    side: args.side,
    size: args.amountUsdc,
    sizeAsset: "USDC",
    price,
    priceAsset: "probability",
    estimatedShares: shares,
    slippageTolerance: args.slippageTolerance ?? null,
    expiresAt: null,
    fees: [{ label: "Polymarket trading fee", amount: null, asset: "USDC" }],
    consequence: PREVIEW_CONSEQUENCE,
    confirmationText:
      `Preview a ${args.side.toUpperCase()} '${args.outcome}' buy of $${args.amountUsdc.toFixed(2)} USDC on "${args.market.question}". ` +
      "Matterhorn will NOT place this order; review and trade in your own Polymarket account.",
    previewSha256: previewHash(fields),
    source: args.orderbook.source,
    compliance: args.compliance,
    warnings,
    canSubmit: false,
  };
}

// ---------------------------------------------------------------------------
// Chat planner / executor.
// ---------------------------------------------------------------------------

export interface PolymarketPlan {
  intent: PolymarketChatIntent;
  side?: PolymarketOrderSide;
  amountUsdc?: number;
  query?: string;
}

/** Classify a natural-language message into a Polymarket chat intent. */
export function planPolymarketIntent(message: string): PolymarketPlan {
  const text = message.toLowerCase();

  const amountMatch = text.match(/\$\s?(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:usdc|dollars?)\b/);
  const amountUsdc = amountMatch ? Number(amountMatch[1] ?? amountMatch[2]) : undefined;
  const side: PolymarketOrderSide | undefined = /\byes\b/.test(text)
    ? "yes"
    : /\bno\b/.test(text)
      ? "no"
      : undefined;

  const isOrder = /\b(prepare|preview|place|buy|sell|order|bet|wager|stake)\b/.test(text);
  if (isOrder && (amountUsdc !== undefined || side !== undefined)) {
    return { intent: "order_preview", side, amountUsdc };
  }
  if (/\b(geoblock|compliance|allowed|blocked|restricted|jurisdiction)\b/.test(text)) {
    return { intent: "compliance" };
  }
  if (/\b(orderbook|order book|book|bids?|asks?|spread|midpoint|depth)\b/.test(text)) {
    return { intent: "orderbook" };
  }
  if (/\b(explain|what is|tell me about|describe|odds|resolve|resolution)\b/.test(text)) {
    return { intent: "learn" };
  }
  // "find markets about X" / "search ... for X"
  const findMatch = text.match(/\b(?:find|search|show|discover|list).*?\b(?:about|on|for|markets?)\b\s*(.*)$/);
  const query = findMatch ? findMatch[1].trim() : message.trim();
  return { intent: "discover", query: query.length > 0 ? query : message.trim() };
}

const RISK_DISCLAIMER =
  "Prediction markets price the crowd's probability for an outcome; treat prices as risk-bearing information, not betting or investment advice.";

function chooseOutcome(market: PolymarketMarketSummary, requested: string | undefined, side: PolymarketOrderSide | undefined): string | null {
  if (requested && market.outcomes.includes(requested)) return requested;
  if (side) {
    const target = side === "yes" ? "yes" : "no";
    const match = market.outcomes.find((o) => o.toLowerCase() === target);
    if (match) return match;
  }
  return market.outcomes.length > 0 ? market.outcomes[0] : null;
}

export interface PolymarketChatDeps {
  provider?: PolymarketProvider;
}

/**
 * Plan + execute a Polymarket chat turn. Read/research/orderbook flows work
 * regardless of compliance; order previews run a geoblock check first and
 * return `blocked_by_compliance` (with no executable preview) when blocked.
 */
export async function executePolymarketChat(
  input: PolymarketChatInput,
  deps: PolymarketChatDeps = {},
): Promise<PolymarketChatResult> {
  // Every inbound payload is scanned for signing material before anything runs.
  assertNoForbiddenSecrets(input, "input");

  const provider = deps.provider ?? new PolymarketProvider();
  const plan = planPolymarketIntent(input.message);
  const warnings: string[] = [];

  if (plan.intent === "discover") {
    const query = plan.query ?? input.message;
    const markets = await provider.searchMarkets(query, input.limit ?? 8);
    return {
      venue: POLYMARKET_VENUE,
      intent: "discover",
      execution: "read_only",
      responseText:
        markets.length > 0
          ? `Found ${markets.length} active Polymarket market(s) matching "${query}". ${RISK_DISCLAIMER}`
          : `No active Polymarket markets matched "${query}".`,
      cards: markets.map((market) => ({ type: "polymarket.market", market })),
      data: { query, markets },
      warnings,
    };
  }

  if (plan.intent === "learn") {
    if (!input.marketId) {
      return clarify("learn", "Which market should I explain? Share a Polymarket market id or search first.");
    }
    const market = await provider.getMarket(input.marketId);
    const lines = market.outcomes.map((o) => `- ${o}: ${formatProbability(market.outcomePrices[o])}`);
    return {
      venue: POLYMARKET_VENUE,
      intent: "learn",
      execution: "read_only",
      responseText:
        `"${market.question}"\n${market.description ? `${market.description}\n` : ""}` +
        `Current implied probabilities:\n${lines.join("\n")}\n${RISK_DISCLAIMER}`,
      cards: [{ type: "polymarket.market", market }],
      data: { market },
      warnings,
    };
  }

  if (plan.intent === "orderbook") {
    if (!input.marketId) {
      return clarify("orderbook", "Which market's orderbook? Share a Polymarket market id.");
    }
    const market = await provider.getMarket(input.marketId);
    const outcome = chooseOutcome(market, input.outcome, input.side);
    const tokenId = outcome ? market.tokenIds[outcome] : undefined;
    if (!outcome || !tokenId) {
      return clarify("orderbook", `Which outcome? Options: ${market.outcomes.join(", ") || "unknown"}.`);
    }
    const orderbook = await provider.getOrderbook(tokenId, { marketId: market.id, outcome });
    return {
      venue: POLYMARKET_VENUE,
      intent: "orderbook",
      execution: "read_only",
      responseText:
        `Orderbook for "${market.question}" (${outcome}): ` +
        `best bid ${formatProbability(orderbook.bestBid)}, best ask ${formatProbability(orderbook.bestAsk)}, ` +
        `mid ${formatProbability(orderbook.midpoint)}, spread ${orderbook.spread !== null ? orderbook.spread.toFixed(3) : "n/a"}.`,
      cards: [{ type: "polymarket.orderbook", orderbook }],
      data: { market, outcome, orderbook },
      warnings: [...warnings, ...orderbook.source.warnings],
    };
  }

  if (plan.intent === "compliance") {
    const compliance = await provider.checkGeoblock();
    return {
      venue: POLYMARKET_VENUE,
      intent: "compliance",
      execution: compliance.status === "blocked" ? "blocked_by_compliance" : "read_only",
      responseText:
        compliance.status === "blocked"
          ? `Polymarket trading is geoblocked for this region. ${compliance.reason ?? ""}`.trim()
          : compliance.status === "allowed"
            ? "Polymarket geoblock check: trading previews are allowed for this region."
            : `Polymarket geoblock status is unknown. ${compliance.reason ?? ""}`.trim(),
      cards: [{ type: "polymarket.compliance", compliance }],
      data: { compliance },
      compliance,
      warnings,
    };
  }

  // order_preview
  if (!input.marketId) {
    return clarify("order_preview", "Which market? Share a Polymarket market id, then I can prepare a preview.");
  }
  const amountUsdc = input.amountUsdc ?? plan.amountUsdc;
  if (amountUsdc === undefined || !(amountUsdc > 0)) {
    return clarify("order_preview", "How much USDC should the preview use? For example, $10.");
  }

  const market = await provider.getMarket(input.marketId);
  const side: PolymarketOrderSide = input.side ?? plan.side ?? "yes";
  const outcome = chooseOutcome(market, input.outcome, side);

  // Compliance gate runs BEFORE any executable preview is generated.
  const compliance = await provider.checkGeoblock();
  if (compliance.status === "blocked") {
    const preview = buildBlockedOrderPreview({ market, outcome, side, amountUsdc, compliance });
    return {
      venue: POLYMARKET_VENUE,
      intent: "order_preview",
      execution: "blocked_by_compliance",
      responseText: `Order preview blocked: this region is geoblocked by Polymarket. ${compliance.reason ?? ""}`.trim(),
      cards: [{ type: "polymarket.compliance", compliance }],
      data: { market, compliance },
      preview,
      compliance,
      warnings: [...warnings, ...preview.warnings],
    };
  }

  if (!outcome || !market.tokenIds[outcome]) {
    return clarify("order_preview", `Which outcome should the order target? Options: ${market.outcomes.join(", ") || "unknown"}.`);
  }
  const orderbook = await provider.getOrderbook(market.tokenIds[outcome], { marketId: market.id, outcome });
  const preview = buildOrderPreview({
    market,
    outcome,
    side,
    amountUsdc,
    orderbook,
    compliance,
    slippageTolerance: input.slippageTolerance,
  });
  return {
    venue: POLYMARKET_VENUE,
    intent: "order_preview",
    execution: "unsigned_preview",
    responseText:
      `Prepared a preview to ${side.toUpperCase()} "${outcome}" for $${amountUsdc.toFixed(2)} USDC on "${market.question}" ` +
      `(~${preview.estimatedShares !== null ? preview.estimatedShares.toFixed(2) : "?"} shares at ${formatProbability(preview.price)}). ` +
      "Matterhorn will not place it. " +
      RISK_DISCLAIMER,
    cards: [{ type: "polymarket.order-preview", preview }],
    data: { market, outcome, orderbook, preview },
    preview,
    compliance,
    warnings: [...warnings, ...preview.warnings],
  };
}

function clarify(intent: PolymarketChatIntent, question: string): PolymarketChatResult {
  return {
    venue: POLYMARKET_VENUE,
    intent,
    execution: "clarification_required",
    responseText: question,
    cards: [],
    data: {},
    warnings: [],
    requiresClarification: true,
    clarificationQuestion: question,
  };
}

function formatProbability(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Thin convenience wrappers (default provider, still injectable for tests).
// ---------------------------------------------------------------------------

export function polymarketSearchMarkets(query: string, limit?: number, provider?: PolymarketProvider): Promise<PolymarketMarketSummary[]> {
  return (provider ?? new PolymarketProvider()).searchMarkets(query, limit);
}

export function polymarketGetMarket(marketId: string, provider?: PolymarketProvider): Promise<PolymarketMarketSummary> {
  return (provider ?? new PolymarketProvider()).getMarket(marketId);
}

export function polymarketGetOrderbook(tokenId: string, opts?: { marketId?: string; outcome?: string }, provider?: PolymarketProvider): Promise<PolymarketOrderbookSnapshot> {
  return (provider ?? new PolymarketProvider()).getOrderbook(tokenId, opts);
}

export function polymarketCheckGeoblock(provider?: PolymarketProvider): Promise<PolymarketComplianceStatus> {
  return (provider ?? new PolymarketProvider()).checkGeoblock();
}
