/**
 * Polymarket read and preview tools.
 *
 * This Matterhorn Polymarket slice is intentionally read-only plus
 * preview-only, mirroring the Hyperliquid read/preview pattern. It never
 * accepts API secrets, private keys, signatures, or signed payloads, and it
 * never submits an order to Polymarket. Prediction-market prices are treated as
 * risk-bearing information, never as betting or investment advice.
 *
 * Compliance: a geoblock check runs before any order preview. When the user's
 * region is blocked, the preview is returned as `blocked_by_compliance` with no
 * executable price/size. Research and orderbook reads work regardless.
 */

import { createHash } from "node:crypto";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const CLOB_BASE_URL = "https://clob.polymarket.com";
const GEOBLOCK_URL = "https://polymarket.com/api/geoblock";
const POLYMARKET_CACHE_MS = 15_000;
const THIN_LIQUIDITY_USD = 5_000;
const LARGE_GAP_PCT = 10;

// Mirrors MARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN in packages/types/src/markets.ts.
// Kept Polymarket-local so this stream stays independent of shared files.
const FORBIDDEN_CREDENTIAL_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;

export type PolymarketIntent = "learn" | "discover" | "events" | "market" | "odds" | "orderbook" | "compliance" | "monitor" | "order_preview";
export type PolymarketExecution =
  | "answered"
  | "clarification_required"
  | "read_only"
  | "unsigned_preview"
  | "blocked_by_compliance"
  | "unsupported";
export type PolymarketSide = "yes" | "no";

export interface PolymarketSource {
  source: string;
  fetchedAt: string;
  freshness: "live" | "recent" | "stale" | "fallback" | "unknown";
  warnings: string[];
}

export interface PolymarketComplianceStatus {
  status: "allowed" | "blocked" | "unknown";
  reason: string | null;
  jurisdiction: string | null;
  checkedAt: string;
  source: string;
}

export interface PolymarketMarketSummary {
  id: string;
  question: string;
  slug: string | null;
  eventId: string | null;
  eventTitle: string | null;
  description: string | null;
  outcomes: string[];
  /** outcome label -> implied probability (0..1) */
  outcomePrices: Record<string, number>;
  /** outcome label -> CLOB token id for orderbook reads */
  tokenIds: Record<string, string>;
  volume: number | null;
  liquidity: number | null;
  endDate: string | null;
  active: boolean;
  closed: boolean;
  source: PolymarketSource;
}

/** A Polymarket event groups related markets (e.g. an election with many sub-markets). */
export interface PolymarketEventSummary {
  id: string;
  title: string;
  description: string | null;
  endDate: string | null;
  volume: number | null;
  liquidity: number | null;
  marketCount: number;
  markets: PolymarketMarketSummary[];
  source: PolymarketSource;
}

export interface PolymarketBookLevel {
  price: number;
  size: number;
  raw: unknown;
}

export interface PolymarketOrderbook {
  marketId: string | null;
  tokenId: string;
  outcome: string | null;
  bids: PolymarketBookLevel[];
  asks: PolymarketBookLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  spread: number | null;
  source: PolymarketSource;
  warnings: string[];
}

export interface PolymarketMarketabilityEstimate {
  referencePrice: number | null;
  estimatedFillPrice: number | null;
  estimatedSlippagePct: number | null;
  estimatedShares: number | null;
  depthSufficient: boolean | null;
  note: string;
}

/** Prediction-market payoff framing for a buy preview. Each share pays $1 if the outcome resolves true. */
export interface PolymarketRiskContext {
  costUsdc: number;
  payoutIfWinUsdc: number | null;
  maxProfitUsdc: number | null;
  maxLossUsdc: number;
  breakevenProbability: number | null;
  note: string;
}

export interface PolymarketResolutionContext {
  endDate: string | null;
  resolvesInDays: number | null;
  note: string;
}

/** Headline (Gamma) implied probability vs the live orderbook. */
export interface PolymarketPriceContext {
  impliedProbability: number | null;
  estimatedFillProbability: number | null;
  bookMidpoint: number | null;
  gapVsImpliedPct: number | null;
  note: string;
}

export interface PolymarketLiquidityContext {
  liquidityUsd: number | null;
  volumeUsd: number | null;
  note: string;
}

export interface PolymarketOrderPreviewInput {
  marketId?: string | null;
  outcome?: string | null;
  side?: PolymarketSide | null;
  /** USDC notional the user intends to spend */
  amountUsdc?: number | string | null;
  /** optional slippage tolerance in percent */
  slippageTolerance?: number | string | null;
  address?: string | null;
  message?: string | null;
}

export interface PolymarketActionPreview {
  version: "matterhorn.market.action-preview.v1";
  venue: "polymarket";
  intent: "order_preview";
  signerPolicy: "api_wallet_required" | "blocked_by_compliance";
  execution: "unsigned_preview" | "blocked_by_compliance";
  action: "buy_shares";
  marketId: string | null;
  marketLabel: string | null;
  outcome: string | null;
  side: PolymarketSide | null;
  /** USDC notional */
  size: number | null;
  sizeAsset: "USDC";
  /** expected average fill price as a probability (0..1) */
  price: number | null;
  priceAsset: "probability";
  estimatedShares: number | null;
  marketability: PolymarketMarketabilityEstimate | null;
  risk: PolymarketRiskContext | null;
  resolution: PolymarketResolutionContext | null;
  priceContext: PolymarketPriceContext | null;
  liquidity: PolymarketLiquidityContext | null;
  expiresAt: string;
  fees: Array<{ label: string; amount: number | null; asset: string | null }>;
  consequence: string;
  confirmationText: string;
  previewSha256: string;
  source: PolymarketSource;
  compliance: PolymarketComplianceStatus;
  warnings: string[];
  canSubmit: false;
}

/**
 * External-signer handoff. Matterhorn turns an unsigned preview into a packet
 * the user signs and submits with THEIR OWN wallet. Matterhorn never signs,
 * never submits, never holds keys, and never accepts the resulting signature
 * back. `canSubmit` stays false and `externalSignerOnly` is true.
 */
export interface PolymarketSigningHandoff {
  version: "matterhorn.polymarket.signing-handoff.v1";
  venue: "polymarket";
  signerPolicy: "external_signer_required";
  action: "buy_shares";
  marketId: string;
  marketLabel: string;
  outcome: string;
  side: PolymarketSide;
  /** USDC notional the user intends to spend */
  sizeUsdc: number;
  /** expected average fill probability (0..1) */
  price: number | null;
  estimatedShares: number | null;
  /** Public economic terms of the order to be signed externally. No secrets. */
  order: {
    tokenId: string | null;
    makerAmountUsdc: number;
    expectedShares: number | null;
    side: PolymarketSide;
  };
  /** How the user must sign — Matterhorn does not produce the signature itself. */
  signingScheme: {
    standard: "eip712";
    chainId: number;
    venue: "polymarket-clob";
    instructions: string;
  };
  /** Binds to the preview this handoff was built from. */
  previewSha256: string;
  /** Hash of the handoff packet itself, for receipt matching. */
  handoffSha256: string;
  expiresAt: string;
  compliance: PolymarketComplianceStatus;
  warnings: string[];
  canSubmit: false;
  externalSignerOnly: true;
}

/** A returned public receipt to validate. Must contain only public status — no signing material. */
export interface PolymarketReceiptInput {
  previewSha256?: string | null;
  handoffSha256?: string | null;
  orderId?: string | null;
  txHash?: string | null;
  status?: string | null;
  marketId?: string | null;
  outcome?: string | null;
  side?: PolymarketSide | null;
  submittedAt?: string | null;
}

/** Aligned with the shared MarketReceipt vocabulary (public status only). */
export interface PolymarketReceipt {
  version: "matterhorn.market.receipt.v1";
  venue: "polymarket";
  status: "received" | "pending" | "filled" | "cancelled" | "rejected" | "failed" | "unknown";
  action: "buy_shares";
  previewSha256: string | null;
  handoffSha256: string | null;
  orderId: string | null;
  txHash: string | null;
  marketId: string | null;
  outcome: string | null;
  side: PolymarketSide | null;
  submittedAt: string | null;
  warnings: string[];
}

export interface PolymarketReceiptVerification {
  ok: boolean;
  receipt: PolymarketReceipt | null;
  matchesHandoff: boolean;
  errors: string[];
  warnings: string[];
}

export interface PolymarketChatExecutionInput {
  message: string;
  marketId?: string | null;
  outcome?: string | null;
  side?: PolymarketSide | null;
  amountUsdc?: number | string | null;
  slippageTolerance?: number | string | null;
  limit?: number | string | null;
}

export interface PolymarketChatExecutionResult {
  venue: "polymarket";
  intent: PolymarketIntent;
  execution: PolymarketExecution;
  responseText: string;
  cards: PolymarketChatCard[];
  data?: Record<string, unknown>;
  preview?: PolymarketActionPreview;
  compliance?: PolymarketComplianceStatus;
  warnings: string[];
  requiresClarification?: boolean;
  clarificationQuestion?: string;
}

/** A read-only watch suggestion for a market outcome. No alerts are scheduled or auto-executed. */
export interface PolymarketWatchCondition {
  outcome: string;
  currentProbability: number | null;
  upperThreshold: number | null;
  lowerThreshold: number | null;
  note: string;
}

export interface PolymarketWatchDescriptor {
  version: "matterhorn.polymarket.watch.v1";
  marketId: string;
  marketLabel: string;
  endDate: string | null;
  resolvesInDays: number | null;
  conditions: PolymarketWatchCondition[];
  createdAt: string;
  source: PolymarketSource;
  warnings: string[];
  note: string;
}

export type PolymarketChatCard =
  | { kind: "polymarket_market_list"; title: string; markets: PolymarketMarketSummary[]; warnings: string[] }
  | { kind: "polymarket_event_list"; title: string; events: PolymarketEventSummary[]; warnings: string[] }
  | { kind: "polymarket_market_detail"; title: string; market: PolymarketMarketSummary; warnings: string[] }
  | { kind: "polymarket_orderbook"; title: string; orderbook: PolymarketOrderbook; warnings: string[] }
  | { kind: "polymarket_compliance"; title: string; compliance: PolymarketComplianceStatus; warnings: string[] }
  | { kind: "polymarket_watch"; title: string; watch: PolymarketWatchDescriptor; warnings: string[] }
  | { kind: "polymarket_order_preview"; title: string; preview: PolymarketActionPreview; warnings: string[] }
  | { kind: "polymarket_clarification"; title: string; question: string; warnings: string[] };

export interface PolymarketProvider {
  searchMarkets(query: string, limit?: number | null): Promise<PolymarketMarketSummary[]>;
  searchEvents(query: string, limit?: number | null): Promise<PolymarketEventSummary[]>;
  getMarket(marketId: string): Promise<PolymarketMarketSummary>;
  getOrderbook(tokenId: string, context?: { marketId?: string | null; outcome?: string | null }): Promise<PolymarketOrderbook>;
  checkCompliance(): Promise<PolymarketComplianceStatus>;
}

type Fetcher = (url: string) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const RISK_DISCLAIMER =
  "Prediction-market prices reflect the crowd's probability for an outcome; treat them as risk-bearing information, not betting or investment advice.";

// ---------------------------------------------------------------------------
// Parsing helpers (no `any`, no value casts).
// ---------------------------------------------------------------------------

function nowSource(source: string, warnings: string[] = []): PolymarketSource {
  return { source, fetchedAt: new Date().toISOString(), freshness: "live", warnings };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

/** Gamma encodes outcomes / prices / token ids as JSON strings or arrays. */
function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item : String(item)));
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((item) => (typeof item === "string" ? item : String(item))) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseNumberArray(value: unknown): number[] {
  const strings = parseStringArray(value);
  if (strings.length > 0) return strings.map((item) => Number(item)).filter((n) => Number.isFinite(n));
  if (Array.isArray(value)) return value.map((item) => numberOrNull(item)).filter((n): n is number => n !== null);
  return [];
}

function mapMarketRecord(record: Record<string, unknown>, source: PolymarketSource): PolymarketMarketSummary {
  const outcomes = parseStringArray(record.outcomes);
  const prices = parseNumberArray(record.outcomePrices);
  const tokenIds = parseStringArray(record.clobTokenIds);
  const outcomePrices: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  outcomes.forEach((outcome, index) => {
    // Untrusted labels are used as keys; skip prototype-mutating names.
    if (outcome === "__proto__" || outcome === "constructor" || outcome === "prototype") return;
    if (index < prices.length) outcomePrices[outcome] = prices[index];
    if (index < tokenIds.length) tokens[outcome] = tokenIds[index];
  });
  const eventBlock = Array.isArray(record.events) && isRecord(record.events[0]) ? record.events[0] : null;
  return {
    id: stringOrNull(record.id) ?? stringOrNull(record.conditionId) ?? "",
    question: stringOrNull(record.question) ?? stringOrNull(record.title) ?? "",
    slug: stringOrNull(record.slug),
    eventId: eventBlock ? stringOrNull(eventBlock.id) : stringOrNull(record.eventId),
    eventTitle: eventBlock ? stringOrNull(eventBlock.title) : null,
    description: stringOrNull(record.description),
    outcomes,
    outcomePrices,
    tokenIds: tokens,
    volume: numberOrNull(record.volume),
    liquidity: numberOrNull(record.liquidity),
    endDate: stringOrNull(record.endDate),
    active: booleanOr(record.active, true),
    closed: booleanOr(record.closed, false),
    source,
  };
}

function mapEventRecord(record: Record<string, unknown>, source: PolymarketSource): PolymarketEventSummary {
  const rawMarkets = Array.isArray(record.markets) ? record.markets.filter(isRecord) : [];
  const markets = rawMarkets.map((market) => mapMarketRecord(market, source)).filter((market) => market.id !== "");
  return {
    id: stringOrNull(record.id) ?? "",
    title: stringOrNull(record.title) ?? stringOrNull(record.question) ?? "",
    description: stringOrNull(record.description),
    endDate: stringOrNull(record.endDate),
    volume: numberOrNull(record.volume),
    liquidity: numberOrNull(record.liquidity),
    marketCount: markets.length,
    markets,
    source,
  };
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function formatProbability(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return (value * 100).toFixed(1) + "%";
}

// ---------------------------------------------------------------------------
// Secret rejection.
// ---------------------------------------------------------------------------

/**
 * Find the first credential-shaped field in a payload. Iterative + bounded so a
 * hostile deep/oversized payload fails closed rather than overflowing the stack.
 * Never returns the offending value, only its path.
 */
export function findForbiddenPolymarketCredentialInput(value: unknown, rootPath: string[] = []): string | null {
  const MAX_NODES = 100_000;
  const MAX_DEPTH = 256;
  const stack: Array<{ value: unknown; path: string[]; depth: number }> = [{ value, path: rootPath, depth: 0 }];
  let visited = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (++visited > MAX_NODES) return [...node.path, "<oversized>"].join(".");
    if (node.depth > MAX_DEPTH) return [...node.path, "<too-deep>"].join(".");
    const current = node.value;
    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        stack.push({ value: current[index], path: [...node.path, String(index)], depth: node.depth + 1 });
      }
      continue;
    }
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_CREDENTIAL_KEY_RE.test(key)) return [...node.path, key].join(".");
      stack.push({ value: child, path: [...node.path, key], depth: node.depth + 1 });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Provider (read-only).
// ---------------------------------------------------------------------------

export class PolymarketInfoProvider implements PolymarketProvider {
  private readonly gammaBaseUrl: string;
  private readonly clobBaseUrl: string;
  private readonly geoblockUrl: string;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: { gammaBaseUrl?: string; clobBaseUrl?: string; geoblockUrl?: string; fetcher?: Fetcher; timeoutMs?: number } = {}) {
    this.gammaBaseUrl = (options.gammaBaseUrl ?? process.env.POLYMARKET_GAMMA_URL ?? GAMMA_BASE_URL).replace(/\/+$/, "");
    this.clobBaseUrl = (options.clobBaseUrl ?? process.env.POLYMARKET_CLOB_URL ?? CLOB_BASE_URL).replace(/\/+$/, "");
    this.geoblockUrl = options.geoblockUrl ?? process.env.POLYMARKET_GEOBLOCK_URL ?? GEOBLOCK_URL;
    this.fetcher = options.fetcher ?? defaultFetcher;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async searchMarkets(query: string, limit: number | null = 10): Promise<PolymarketMarketSummary[]> {
    const capped = Number.isFinite(limit) && limit !== null ? Math.max(1, Math.min(100, Math.trunc(limit))) : 10;
    const url = `${this.gammaBaseUrl}/markets?active=true&closed=false&order=volume&ascending=false&limit=${capped * 3}`;
    const data = await this.getJsonCached("search", url);
    const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.markets) ? data.markets : [];
    const source = nowSource(this.gammaBaseUrl + "/markets");
    const markets = list.filter(isRecord).map((record) => mapMarketRecord(record, source)).filter((market) => market.id !== "");
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);
    const matched = markets.filter((market) => {
      if (terms.length === 0) return true;
      const haystack = (market.question + " " + (market.description ?? "") + " " + (market.eventTitle ?? "")).toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return (matched.length > 0 ? matched : markets).slice(0, capped);
  }

  async searchEvents(query: string, limit: number | null = 8): Promise<PolymarketEventSummary[]> {
    const capped = Number.isFinite(limit) && limit !== null ? Math.max(1, Math.min(50, Math.trunc(limit))) : 8;
    const url = `${this.gammaBaseUrl}/events?active=true&closed=false&order=volume&ascending=false&limit=${capped * 3}`;
    const data = await this.getJsonCached("search-events", url);
    const list = Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.events) ? data.events : [];
    const source = nowSource(this.gammaBaseUrl + "/events");
    const events = list.filter(isRecord).map((record) => mapEventRecord(record, source)).filter((event) => event.id !== "");
    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 1);
    const matched = events.filter((event) => {
      if (terms.length === 0) return true;
      const haystack = (event.title + " " + (event.description ?? "") + " " + event.markets.map((m) => m.question).join(" ")).toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return (matched.length > 0 ? matched : events).slice(0, capped);
  }

  async getMarket(marketId: string): Promise<PolymarketMarketSummary> {
    const data = await this.getJson(`${this.gammaBaseUrl}/markets/${encodeURIComponent(marketId)}`);
    if (!isRecord(data)) throw new Error("Polymarket market " + marketId + " not found");
    return mapMarketRecord(data, nowSource(this.gammaBaseUrl + "/markets/" + marketId));
  }

  async getOrderbook(tokenId: string, context: { marketId?: string | null; outcome?: string | null } = {}): Promise<PolymarketOrderbook> {
    const data = await this.getJson(`${this.clobBaseUrl}/book?token_id=${encodeURIComponent(tokenId)}`);
    const book = isRecord(data) ? data : {};
    const bids = normalizeLevels(book.bids).sort((a, b) => b.price - a.price);
    const asks = normalizeLevels(book.asks).sort((a, b) => a.price - b.price);
    const bestBid = bids.length > 0 ? bids[0].price : null;
    const bestAsk = asks.length > 0 ? asks[0].price : null;
    const midpoint = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
    const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
    const warnings: string[] = [];
    if (bids.length === 0 || asks.length === 0) warnings.push("Thin or one-sided orderbook.");
    return {
      marketId: context.marketId ?? (isRecord(book) ? stringOrNull(book.market) : null),
      tokenId,
      outcome: context.outcome ?? null,
      bids,
      asks,
      bestBid,
      bestAsk,
      midpoint,
      spread,
      source: nowSource(this.clobBaseUrl + "/book"),
      warnings,
    };
  }

  async checkCompliance(): Promise<PolymarketComplianceStatus> {
    try {
      const data = await this.getJson(this.geoblockUrl);
      const blocked = isRecord(data) ? booleanOr(data.blocked, false) : false;
      const jurisdiction = isRecord(data) ? stringOrNull(data.country) ?? stringOrNull(data.region) : null;
      return {
        status: blocked ? "blocked" : "allowed",
        reason: blocked ? "Polymarket geoblock reports this region is restricted from trading." : null,
        jurisdiction,
        checkedAt: new Date().toISOString(),
        source: this.geoblockUrl,
      };
    } catch (err) {
      return {
        status: "unknown",
        reason: "Geoblock check failed: " + (err instanceof Error ? err.message : "unknown error"),
        jurisdiction: null,
        checkedAt: new Date().toISOString(),
        source: this.geoblockUrl,
      };
    }
  }

  private async getJsonCached(key: string, url: string): Promise<unknown> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.getJson(url);
    this.cache.set(key, { expiresAt: Date.now() + POLYMARKET_CACHE_MS, value });
    return value;
  }

  private async getJson(url: string): Promise<unknown> {
    const response = await this.fetcher(url);
    if (!response.ok) {
      let detail = response.statusText;
      try {
        detail = await response.text();
      } catch {
        // keep statusText
      }
      throw new Error("Polymarket endpoint failed (" + response.status + "): " + detail);
    }
    return response.json();
  }
}

function normalizeLevels(value: unknown): PolymarketBookLevel[] {
  if (!Array.isArray(value)) return [];
  const levels: PolymarketBookLevel[] = [];
  for (const entry of value.slice(0, 50)) {
    if (!isRecord(entry)) continue;
    const price = numberOrNull(entry.price);
    const size = numberOrNull(entry.size);
    if (price === null || size === null || price <= 0 || size < 0) continue;
    levels.push({ price, size, raw: entry });
  }
  return levels;
}

const defaultFetcher: Fetcher = (url) => fetch(url, { method: "GET" });

export const polymarketProvider = new PolymarketInfoProvider();

// ---------------------------------------------------------------------------
// Planner.
// ---------------------------------------------------------------------------

export function planPolymarketChat(input: PolymarketChatExecutionInput): PolymarketIntent {
  const message = input.message.toLowerCase();
  if (/\b(prepare|preview|buy|bet|wager|place|order)\b/.test(message) && /\b(yes|no|share|shares|\$|usdc)\b/.test(message)) return "order_preview";
  if (/\b(watch|monitor|track|alert|notify|keep an eye)\b/.test(message)) return "monitor";
  if (/\bgeoblock/.test(message) || /\b(compliance|restricted|jurisdiction)\b/.test(message)) return "compliance";
  if (/\b(order\s*book|orderbook|book|bid|ask|spread|midpoint|depth)\b/.test(message)) return "orderbook";
  if (/\b(odds|probability|probabilities|chance|liquidity|volume)\b/.test(message)) return "odds";
  if (/\b(explain|detail|details|describe|resolve|resolution|about this market)\b/.test(message)) return "market";
  if (/\bevents?\b/.test(message)) return "events";
  if (/\b(find|search|discover|markets?|list)\b/.test(message)) return "discover";
  return "learn";
}

export function extractPolymarketOrderInput(input: PolymarketChatExecutionInput): PolymarketOrderPreviewInput {
  const message = input.message;
  const lower = message.toLowerCase();
  const amountMatch = lower.match(/\$\s?(\d+(?:\.\d+)?)|\b(\d+(?:\.\d+)?)\s*(?:usdc|dollars?)\b/);
  const amountUsdc = input.amountUsdc ?? (amountMatch ? Number(amountMatch[1] ?? amountMatch[2]) : null);
  const side: PolymarketSide | null = input.side ?? (/\byes\b/.test(lower) ? "yes" : /\bno\b/.test(lower) ? "no" : null);
  return {
    marketId: input.marketId ?? null,
    outcome: input.outcome ?? null,
    side,
    amountUsdc,
    message,
  };
}

// ---------------------------------------------------------------------------
// Preview (preview-only).
// ---------------------------------------------------------------------------

const PREVIEW_CONSEQUENCE_SUFFIX =
  "External signing/execution is not enabled. Matterhorn never holds keys, signs, or submits Polymarket orders.";

export function buildBlockedPolymarketPreview(args: {
  market: PolymarketMarketSummary | null;
  outcome: string | null;
  side: PolymarketSide | null;
  compliance: PolymarketComplianceStatus;
}): PolymarketActionPreview {
  const warnings = ["Order preview blocked by Polymarket compliance / geoblock.", "No executable order parameters were generated."];
  return {
    version: "matterhorn.market.action-preview.v1",
    venue: "polymarket",
    intent: "order_preview",
    signerPolicy: "blocked_by_compliance",
    execution: "blocked_by_compliance",
    action: "buy_shares",
    marketId: args.market?.id ?? null,
    marketLabel: args.market?.question ?? null,
    outcome: args.outcome,
    side: args.side,
    size: null,
    sizeAsset: "USDC",
    price: null,
    priceAsset: "probability",
    estimatedShares: null,
    marketability: null,
    risk: null,
    resolution: null,
    priceContext: null,
    liquidity: null,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    fees: [],
    consequence: (args.compliance.reason ?? "Blocked by compliance.") + " " + PREVIEW_CONSEQUENCE_SUFFIX,
    confirmationText: "This region is geoblocked. No order can be previewed or placed through Matterhorn.",
    previewSha256: sha256({ blocked: true, marketId: args.market?.id ?? null, outcome: args.outcome }),
    source: nowSource(args.compliance.source),
    compliance: args.compliance,
    warnings,
    canSubmit: false,
  };
}

export async function preparePolymarketOrderPreview(
  args: {
    market: PolymarketMarketSummary;
    outcome: string;
    side: PolymarketSide;
    amountUsdc: number;
    compliance: PolymarketComplianceStatus;
    slippageTolerance?: number | null;
  },
  provider: PolymarketProvider = polymarketProvider,
): Promise<PolymarketActionPreview> {
  const { market, outcome, side, amountUsdc, compliance } = args;
  const slippageTolerance = numberOrNull(args.slippageTolerance);
  const warnings = [
    "Preview only: Matterhorn does not submit Polymarket orders.",
    "No API wallet secret, private key, or signature is accepted or stored.",
    RISK_DISCLAIMER,
  ];

  const tokenId = market.tokenIds[outcome];
  let marketability: PolymarketMarketabilityEstimate | null = null;
  let bookMidpoint: number | null = null;
  if (tokenId) {
    try {
      const orderbook = await provider.getOrderbook(tokenId, { marketId: market.id, outcome });
      bookMidpoint = orderbook.midpoint;
      marketability = estimatePolymarketFill(orderbook.asks, amountUsdc);
      if (marketability.depthSufficient === false) warnings.push("Visible orderbook depth is insufficient to fully fill this size; expect a worse fill than estimated.");
      if (slippageTolerance !== null && marketability.estimatedSlippagePct !== null && marketability.estimatedSlippagePct > slippageTolerance) {
        warnings.push("Estimated slippage (" + marketability.estimatedSlippagePct.toFixed(3) + "%) exceeds your tolerance (" + slippageTolerance + "%).");
      }
    } catch (err) {
      warnings.push(err instanceof Error ? "Could not read orderbook for marketability: " + err.message : "Could not read orderbook for marketability.");
    }
  } else {
    warnings.push("No CLOB token id is known for outcome " + outcome + "; price could not be estimated.");
  }

  const impliedProbability = market.outcomePrices[outcome] ?? null;
  const price = marketability?.estimatedFillPrice ?? impliedProbability ?? null;
  const estimatedShares = marketability?.estimatedShares ?? (price !== null && price > 0 ? Number((amountUsdc / price).toFixed(4)) : null);

  if (market.outcomes.length > 2) warnings.push("This market has " + market.outcomes.length + " outcomes; make sure '" + outcome + "' is the one you mean.");

  const risk = buildPolymarketRisk(amountUsdc, price, estimatedShares);
  const resolution = buildPolymarketResolution(market.endDate, warnings);
  const priceContext = buildPolymarketPriceContext(impliedProbability, marketability?.estimatedFillPrice ?? null, bookMidpoint, warnings);
  const liquidity = buildPolymarketLiquidity(market, warnings);

  const previewSha256 = sha256({
    venue: "polymarket",
    marketId: market.id,
    outcome,
    side,
    amountUsdc,
    price,
  });

  return {
    version: "matterhorn.market.action-preview.v1",
    venue: "polymarket",
    intent: "order_preview",
    signerPolicy: "api_wallet_required",
    execution: "unsigned_preview",
    action: "buy_shares",
    marketId: market.id,
    marketLabel: market.question,
    outcome,
    side,
    size: amountUsdc,
    sizeAsset: "USDC",
    price,
    priceAsset: "probability",
    estimatedShares,
    marketability,
    risk,
    resolution,
    priceContext,
    liquidity,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    fees: [{ label: "Polymarket trading fee", amount: null, asset: "USDC" }],
    consequence:
      "If executed outside Matterhorn, this would attempt to buy ~" + (estimatedShares ?? "?") + " '" + outcome + "' shares for $" + amountUsdc.toFixed(2) + " USDC at about " + formatProbability(price) + " on \"" + market.question + "\". " +
      (risk.payoutIfWinUsdc !== null ? "If '" + outcome + "' resolves true, ~$" + risk.payoutIfWinUsdc.toFixed(2) + " USDC pays out (max profit ~$" + (risk.maxProfitUsdc ?? 0).toFixed(2) + "); otherwise the $" + amountUsdc.toFixed(2) + " stake is lost. " : "") +
      PREVIEW_CONSEQUENCE_SUFFIX,
    confirmationText: "I understand this is preview-only in Matterhorn. " + PREVIEW_CONSEQUENCE_SUFFIX,
    previewSha256,
    source: nowSource(GAMMA_BASE_URL),
    compliance,
    warnings,
    canSubmit: false,
  };
}

/** Cost/payout/max-profit/max-loss/breakeven framing. Each share pays $1 if the outcome resolves true. */
function buildPolymarketRisk(amountUsdc: number, price: number | null, estimatedShares: number | null): PolymarketRiskContext {
  const payoutIfWin = estimatedShares === null ? null : Number(estimatedShares.toFixed(4));
  const maxProfit = payoutIfWin === null ? null : Number((payoutIfWin - amountUsdc).toFixed(4));
  return {
    costUsdc: amountUsdc,
    payoutIfWinUsdc: payoutIfWin,
    maxProfitUsdc: maxProfit,
    maxLossUsdc: amountUsdc,
    breakevenProbability: price,
    note:
      payoutIfWin === null
        ? "Payout could not be estimated without a price."
        : "You pay $" + amountUsdc.toFixed(2) + " now. If it resolves true you receive ~$" + payoutIfWin.toFixed(2) + " (each share pays $1); if it resolves false you lose the full $" + amountUsdc.toFixed(2) + " stake. Breakeven probability is " + formatProbability(price) + ".",
  };
}

function buildPolymarketResolution(endDate: string | null, warnings: string[]): PolymarketResolutionContext {
  if (!endDate) return { endDate: null, resolvesInDays: null, note: "Resolution date is unknown." };
  const end = Date.parse(endDate);
  if (!Number.isFinite(end)) return { endDate, resolvesInDays: null, note: "Resolution date could not be parsed." };
  const days = Number(((end - Date.now()) / (24 * 60 * 60 * 1000)).toFixed(2));
  if (days < 0) warnings.push("This market's listed end date is in the past; confirm it is still open before acting.");
  else if (days < 1) warnings.push("This market resolves within a day; price can move sharply near resolution.");
  return {
    endDate,
    resolvesInDays: days,
    note: days < 0 ? "Listed end date has passed." : "Resolves in about " + days + " day(s); funds are locked until resolution if you trade.",
  };
}

function buildPolymarketPriceContext(
  impliedProbability: number | null,
  estimatedFillProbability: number | null,
  bookMidpoint: number | null,
  warnings: string[],
): PolymarketPriceContext {
  const gap =
    impliedProbability !== null && impliedProbability > 0 && estimatedFillProbability !== null
      ? Math.abs((estimatedFillProbability - impliedProbability) / impliedProbability) * 100
      : null;
  if (gap !== null && gap > LARGE_GAP_PCT) {
    warnings.push("Live orderbook price differs from the headline odds by ~" + gap.toFixed(1) + "%; the displayed probability may be stale.");
  }
  return {
    impliedProbability,
    estimatedFillProbability,
    bookMidpoint,
    gapVsImpliedPct: gap === null ? null : Number(gap.toFixed(2)),
    note:
      gap === null
        ? "Headline odds and live book could not be compared."
        : "Headline implied probability " + formatProbability(impliedProbability) + " vs estimated fill " + formatProbability(estimatedFillProbability) + " (gap ~" + gap.toFixed(1) + "%).",
  };
}

function buildPolymarketLiquidity(market: PolymarketMarketSummary, warnings: string[]): PolymarketLiquidityContext {
  if (market.liquidity !== null && market.liquidity < THIN_LIQUIDITY_USD) {
    warnings.push("Thin market liquidity (~$" + market.liquidity + "); fills may be partial or move the price.");
  }
  return {
    liquidityUsd: market.liquidity,
    volumeUsd: market.volume,
    note:
      market.liquidity === null
        ? "Liquidity is unknown."
        : "Market liquidity ~$" + market.liquidity + (market.volume === null ? "" : ", volume ~$" + market.volume) + ".",
  };
}

/**
 * Build a read-only watch descriptor for a market: a current-odds snapshot plus
 * suggested ±10pp alert thresholds and a resolution reminder. No alerts are
 * scheduled and nothing is auto-executed.
 */
export function buildPolymarketWatchDescriptor(market: PolymarketMarketSummary): PolymarketWatchDescriptor {
  const warnings: string[] = [];
  const conditions: PolymarketWatchCondition[] = market.outcomes
    .filter((outcome) => outcome !== "__proto__" && outcome !== "constructor" && outcome !== "prototype")
    .map((outcome) => {
      const current = market.outcomePrices[outcome] ?? null;
      const upper = current === null ? null : Number(Math.min(0.95, current + 0.1).toFixed(2));
      const lower = current === null ? null : Number(Math.max(0.05, current - 0.1).toFixed(2));
      return {
        outcome,
        currentProbability: current,
        upperThreshold: upper,
        lowerThreshold: lower,
        note:
          current === null
            ? "No current probability; watch for the first quote."
            : "Alert if it rises above " + formatProbability(upper) + " or falls below " + formatProbability(lower) + ".",
      };
    });

  let resolvesInDays: number | null = null;
  if (market.endDate) {
    const end = Date.parse(market.endDate);
    if (Number.isFinite(end)) {
      resolvesInDays = Number(((end - Date.now()) / (24 * 60 * 60 * 1000)).toFixed(2));
      if (resolvesInDays < 0) warnings.push("Listed end date is in the past; confirm the market is still open.");
    }
  }
  if (market.closed) warnings.push("This market is marked closed; a watch may not update.");

  return {
    version: "matterhorn.polymarket.watch.v1",
    marketId: market.id,
    marketLabel: market.question,
    endDate: market.endDate,
    resolvesInDays,
    conditions,
    createdAt: new Date().toISOString(),
    source: market.source,
    warnings,
    note: "Read-only watch. Matterhorn surfaces odds moves and a resolution reminder; it never places or auto-executes orders.",
  };
}

/** Walk asks to estimate average fill probability and shares for a USDC buy. */
export function estimatePolymarketFill(asks: PolymarketBookLevel[], amountUsdc: number): PolymarketMarketabilityEstimate {
  const sorted = [...asks].sort((a, b) => a.price - b.price);
  if (sorted.length === 0) {
    return { referencePrice: null, estimatedFillPrice: null, estimatedSlippagePct: null, estimatedShares: null, depthSufficient: null, note: "No ask-side liquidity; fill could not be estimated." };
  }
  const reference = sorted[0].price;
  let remaining = amountUsdc;
  let shares = 0;
  let spent = 0;
  for (const level of sorted) {
    if (remaining <= 0) break;
    const levelUsdc = level.price * level.size;
    const takeUsdc = Math.min(levelUsdc, remaining);
    if (level.price > 0) shares += takeUsdc / level.price;
    spent += takeUsdc;
    remaining -= takeUsdc;
  }
  const avgPrice = shares > 0 ? spent / shares : null;
  const slippagePct = avgPrice !== null && reference > 0 ? Math.abs((avgPrice - reference) / reference) * 100 : null;
  const depthSufficient = remaining <= 1e-9;
  return {
    referencePrice: reference,
    estimatedFillPrice: avgPrice === null ? null : Number(avgPrice.toFixed(6)),
    estimatedSlippagePct: slippagePct === null ? null : Number(slippagePct.toFixed(4)),
    estimatedShares: avgPrice === null ? null : Number(shares.toFixed(4)),
    depthSufficient,
    note: depthSufficient ? "Estimated from visible ask levels; live fills may differ." : "Only partial depth was visible; estimate is a lower bound on slippage.",
  };
}

// ---------------------------------------------------------------------------
// External-signer handoff + receipt verification.
//
// Matterhorn never signs, submits, broadcasts, or holds keys. It produces an
// unsigned handoff for the user to sign with their own wallet, and later
// validates a PUBLIC receipt. Signing material is rejected on the way in.
// ---------------------------------------------------------------------------

const POLYGON_CHAIN_ID = 137;
const HANDOFF_TTL_MS = 10 * 60 * 1000;

/**
 * Build an external-signer handoff from an unsigned order preview. Throws if the
 * preview is blocked by compliance or is not an unsigned preview. The returned
 * packet contains only public order terms — no keys, secrets, or signatures.
 */
export function buildPolymarketSigningHandoff(preview: PolymarketActionPreview): PolymarketSigningHandoff {
  if (preview.execution === "blocked_by_compliance") {
    throw new Error("Cannot build a signing handoff for a compliance-blocked preview.");
  }
  if (preview.execution !== "unsigned_preview" || preview.canSubmit !== false) {
    throw new Error("A signing handoff requires a non-submittable unsigned preview.");
  }
  if (!preview.marketId || !preview.outcome || preview.side === null || preview.size === null) {
    throw new Error("Preview is missing market, outcome, side, or size; cannot build a handoff.");
  }
  // Defensive: never echo signing material into a handoff.
  const forbidden = findForbiddenPolymarketCredentialInput(preview);
  if (forbidden) throw new Error("Preview unexpectedly contained credential-shaped data at " + forbidden);

  const warnings = [
    "External signer required: sign and submit this with your OWN wallet. Matterhorn does not sign, submit, or hold keys.",
    "Do not send the signature or any signed payload back to Matterhorn; only a public receipt can be imported.",
    RISK_DISCLAIMER,
  ];
  const order = {
    // The CLOB token id is resolved by the signer's client from marketId+outcome; the preview does not carry it.
    tokenId: null,
    makerAmountUsdc: preview.size,
    expectedShares: preview.estimatedShares,
    side: preview.side,
  };
  const core = {
    version: "matterhorn.polymarket.signing-handoff.v1",
    venue: "polymarket",
    marketId: preview.marketId,
    outcome: preview.outcome,
    side: preview.side,
    sizeUsdc: preview.size,
    price: preview.price,
    previewSha256: preview.previewSha256,
  };
  return {
    version: "matterhorn.polymarket.signing-handoff.v1",
    venue: "polymarket",
    signerPolicy: "external_signer_required",
    action: "buy_shares",
    marketId: preview.marketId,
    marketLabel: preview.marketLabel ?? preview.marketId,
    outcome: preview.outcome,
    side: preview.side,
    sizeUsdc: preview.size,
    price: preview.price,
    estimatedShares: preview.estimatedShares,
    order,
    signingScheme: {
      standard: "eip712",
      chainId: POLYGON_CHAIN_ID,
      venue: "polymarket-clob",
      instructions:
        "Sign this order with your own wallet via Polymarket's official CLOB client (EIP-712 order on Polygon). " +
        "Matterhorn provides the economic terms only and never produces the signature, the API key, or the submission.",
    },
    previewSha256: preview.previewSha256,
    handoffSha256: sha256(core),
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
    compliance: preview.compliance,
    warnings,
    canSubmit: false,
    externalSignerOnly: true,
  };
}

const PUBLIC_RECEIPT_STATUSES = ["received", "pending", "filled", "cancelled", "rejected", "failed", "unknown"] as const;

function normalizeReceiptStatus(value: string | null | undefined): PolymarketReceipt["status"] {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (PUBLIC_RECEIPT_STATUSES as readonly string[]).includes(status) ? (status as PolymarketReceipt["status"]) : "unknown";
}

/**
 * Validate a returned PUBLIC receipt against the handoff that produced it.
 * Rejects any signing material in the receipt and never accepts a signature.
 */
/** The handoff fields a receipt is matched against. A full handoff satisfies this. */
export type PolymarketHandoffReference = Pick<PolymarketSigningHandoff, "previewSha256" | "handoffSha256" | "marketId" | "outcome" | "side">;

export function verifyPolymarketReceipt(handoff: PolymarketHandoffReference, input: PolymarketReceiptInput): PolymarketReceiptVerification {
  const errors: string[] = [];
  const warnings: string[] = [];

  const forbidden = findForbiddenPolymarketCredentialInput(input);
  if (forbidden) {
    return {
      ok: false,
      receipt: null,
      matchesHandoff: false,
      errors: ["Receipt contained credential-shaped data at " + forbidden + "; signatures and signed payloads are never accepted."],
      warnings: [],
    };
  }

  if (input.previewSha256 && input.previewSha256 !== handoff.previewSha256) errors.push("Receipt previewSha256 does not match the handoff.");
  if (input.handoffSha256 && input.handoffSha256 !== handoff.handoffSha256) errors.push("Receipt handoffSha256 does not match the handoff.");
  if (input.marketId && input.marketId !== handoff.marketId) errors.push("Receipt market does not match the handoff.");
  if (input.outcome && input.outcome !== handoff.outcome) errors.push("Receipt outcome does not match the handoff.");
  if (input.side && input.side !== handoff.side) errors.push("Receipt side does not match the handoff.");
  if (!input.orderId && !input.txHash) warnings.push("Receipt has neither an order id nor a tx hash; status cannot be independently located.");

  const receipt: PolymarketReceipt = {
    version: "matterhorn.market.receipt.v1",
    venue: "polymarket",
    status: normalizeReceiptStatus(input.status),
    action: "buy_shares",
    previewSha256: input.previewSha256 ?? handoff.previewSha256,
    handoffSha256: input.handoffSha256 ?? handoff.handoffSha256,
    orderId: input.orderId ?? null,
    txHash: input.txHash ?? null,
    marketId: input.marketId ?? handoff.marketId,
    outcome: input.outcome ?? handoff.outcome,
    side: input.side ?? handoff.side,
    submittedAt: input.submittedAt ?? null,
    warnings,
  };

  return { ok: errors.length === 0, receipt, matchesHandoff: errors.length === 0, errors, warnings };
}

/** Narrow an untrusted request body into a handoff reference. Returns null if malformed. */
export function coercePolymarketHandoffReference(value: unknown): PolymarketHandoffReference | null {
  if (!isRecord(value)) return null;
  const previewSha256 = stringOrNull(value.previewSha256);
  const handoffSha256 = stringOrNull(value.handoffSha256);
  const marketId = stringOrNull(value.marketId);
  const outcome = stringOrNull(value.outcome);
  const sideRaw = stringOrNull(value.side);
  const side: PolymarketSide | null = sideRaw === "yes" || sideRaw === "no" ? sideRaw : null;
  if (!previewSha256 || !handoffSha256 || !marketId || !outcome || side === null) return null;
  return { previewSha256, handoffSha256, marketId, outcome, side };
}

/** Narrow an untrusted request body into a receipt input (public fields only). */
export function coercePolymarketReceiptInput(value: unknown): PolymarketReceiptInput {
  if (!isRecord(value)) return {};
  const sideRaw = stringOrNull(value.side);
  return {
    previewSha256: stringOrNull(value.previewSha256),
    handoffSha256: stringOrNull(value.handoffSha256),
    orderId: stringOrNull(value.orderId),
    txHash: stringOrNull(value.txHash),
    status: stringOrNull(value.status),
    marketId: stringOrNull(value.marketId),
    outcome: stringOrNull(value.outcome),
    side: sideRaw === "yes" || sideRaw === "no" ? sideRaw : null,
    submittedAt: stringOrNull(value.submittedAt),
  };
}

// ---------------------------------------------------------------------------
// Chat workflow.
// ---------------------------------------------------------------------------

export async function executePolymarketChatWorkflow(
  input: PolymarketChatExecutionInput,
  options: { provider?: PolymarketProvider } = {},
): Promise<PolymarketChatExecutionResult> {
  const provider = options.provider ?? polymarketProvider;
  const forbidden = findForbiddenPolymarketCredentialInput(input);
  if (forbidden) {
    return clarification(
      "For safety, remove private keys, API secrets, signatures, or signed payloads. Matterhorn only accepts public market ids and order parameters for Polymarket preview.",
      ["Rejected credential-shaped field: " + forbidden],
      "unsupported",
      "order_preview",
    );
  }

  const intent = planPolymarketChat(input);

  if (intent === "learn") {
    return {
      venue: "polymarket",
      intent,
      execution: "answered",
      responseText:
        "Polymarket support is read-only plus preview-only. I can search prediction markets, explain a market's odds and liquidity, show a CLOB orderbook, check the compliance/geoblock status, and prepare a non-submittable bet preview. I never accept API secrets or submit orders. " + RISK_DISCLAIMER,
      cards: [],
      warnings: [],
    };
  }

  if (intent === "discover") {
    const limit = Math.max(1, Math.min(50, Math.trunc(numberOrNull(input.limit) ?? 8)));
    const markets = await provider.searchMarkets(input.message, limit);
    return {
      venue: "polymarket",
      intent,
      execution: "read_only",
      responseText:
        markets.length > 0
          ? "Found " + markets.length + " active Polymarket market(s). These are read-only summaries with source/freshness labels. " + RISK_DISCLAIMER
          : "No active Polymarket markets matched that query.",
      cards: [{ kind: "polymarket_market_list", title: "Polymarket markets", markets, warnings: [] }],
      data: { markets },
      warnings: [],
    };
  }

  if (intent === "events") {
    const limit = Math.max(1, Math.min(50, Math.trunc(numberOrNull(input.limit) ?? 6)));
    const events = await provider.searchEvents(input.message, limit);
    return {
      venue: "polymarket",
      intent,
      execution: "read_only",
      responseText:
        events.length > 0
          ? "Found " + events.length + " active Polymarket event(s), each grouping related markets:\n" +
            events.map((e) => "- " + e.title + " (" + e.marketCount + " market" + (e.marketCount === 1 ? "" : "s") + ")").join("\n") + "\n" + RISK_DISCLAIMER
          : "No active Polymarket events matched that query.",
      cards: [{ kind: "polymarket_event_list", title: "Polymarket events", events, warnings: [] }],
      data: { events },
      warnings: [],
    };
  }

  if (intent === "market" || intent === "odds") {
    if (!input.marketId) {
      return clarification("Which Polymarket market should I explain? Share a market id, or search first.", [], "clarification_required", intent);
    }
    const market = await provider.getMarket(input.marketId);
    const lines = market.outcomes.map((outcome) => "- " + outcome + ": " + formatProbability(market.outcomePrices[outcome] ?? null));
    return {
      venue: "polymarket",
      intent,
      execution: "read_only",
      responseText:
        "\"" + market.question + "\"\n" +
        (market.description ? market.description + "\n" : "") +
        "Implied probabilities:\n" + lines.join("\n") + "\n" +
        "Liquidity: " + (market.liquidity === null ? "unknown" : market.liquidity) + ", volume: " + (market.volume === null ? "unknown" : market.volume) + ". " + RISK_DISCLAIMER,
      cards: [{ kind: "polymarket_market_detail", title: market.question, market, warnings: [] }],
      data: { market },
      warnings: [],
    };
  }

  if (intent === "orderbook") {
    if (!input.marketId) {
      return clarification("Which Polymarket market's orderbook? Share a market id.", [], "clarification_required", intent);
    }
    const market = await provider.getMarket(input.marketId);
    const outcome = chooseOutcome(market, input.outcome, input.side);
    const tokenId = outcome ? market.tokenIds[outcome] : undefined;
    if (!outcome || !tokenId) {
      return clarification("Which outcome's orderbook? Options: " + (market.outcomes.join(", ") || "unknown") + ".", [], "clarification_required", intent);
    }
    const orderbook = await provider.getOrderbook(tokenId, { marketId: market.id, outcome });
    return {
      venue: "polymarket",
      intent,
      execution: "read_only",
      responseText:
        "Orderbook for \"" + market.question + "\" (" + outcome + "): best bid " + formatProbability(orderbook.bestBid) + ", best ask " + formatProbability(orderbook.bestAsk) + ", mid " + formatProbability(orderbook.midpoint) + ".",
      cards: [{ kind: "polymarket_orderbook", title: outcome + " orderbook", orderbook, warnings: orderbook.warnings }],
      data: { market, outcome, orderbook },
      warnings: orderbook.warnings,
    };
  }

  if (intent === "compliance") {
    const compliance = await provider.checkCompliance();
    return {
      venue: "polymarket",
      intent,
      execution: compliance.status === "blocked" ? "blocked_by_compliance" : "read_only",
      responseText:
        compliance.status === "blocked"
          ? "Polymarket trading is geoblocked for this region. " + (compliance.reason ?? "")
          : compliance.status === "allowed"
            ? "Polymarket geoblock check: trading previews are allowed for this region."
            : "Polymarket geoblock status is unknown. " + (compliance.reason ?? ""),
      cards: [{ kind: "polymarket_compliance", title: "Polymarket compliance", compliance, warnings: [] }],
      data: { compliance },
      compliance,
      warnings: [],
    };
  }

  if (intent === "monitor") {
    // Watchlist is read-only research and works regardless of compliance.
    if (!input.marketId) {
      return clarification("Which Polymarket market should I set up a read-only watch for? Share a market id, or search first.", [], "clarification_required", "monitor");
    }
    const market = await provider.getMarket(input.marketId);
    const watch = buildPolymarketWatchDescriptor(market);
    return {
      venue: "polymarket",
      intent: "monitor",
      execution: "read_only",
      responseText:
        "Read-only watch for \"" + market.question + "\". Suggested alerts:\n" +
        watch.conditions.map((c) => "- " + c.outcome + " (now " + formatProbability(c.currentProbability) + "): " + c.note).join("\n") + "\n" +
        "Matterhorn will not place or auto-execute any order from this watch. " + RISK_DISCLAIMER,
      cards: [{ kind: "polymarket_watch", title: "Watch: " + market.question, watch, warnings: watch.warnings }],
      data: { market, watch },
      warnings: watch.warnings,
    };
  }

  // order_preview
  const orderInput = extractPolymarketOrderInput(input);
  if (!orderInput.marketId) {
    return clarification("Which Polymarket market? Share a market id, then I can prepare a non-submittable preview.", [], "clarification_required", "order_preview");
  }
  const amountUsdc = numberOrNull(orderInput.amountUsdc);
  if (amountUsdc === null || !(amountUsdc > 0)) {
    return clarification("How much USDC should the preview use? For example, $10.", [], "clarification_required", "order_preview");
  }

  const market = await provider.getMarket(orderInput.marketId);
  const side: PolymarketSide = orderInput.side ?? "yes";
  const outcome = chooseOutcome(market, orderInput.outcome, side);

  // Compliance gate BEFORE any executable preview.
  const compliance = await provider.checkCompliance();
  if (compliance.status === "blocked") {
    const preview = buildBlockedPolymarketPreview({ market, outcome, side, compliance });
    return {
      venue: "polymarket",
      intent: "order_preview",
      execution: "blocked_by_compliance",
      responseText: "Order preview blocked: this region is geoblocked by Polymarket. " + (compliance.reason ?? ""),
      cards: [{ kind: "polymarket_compliance", title: "Polymarket compliance", compliance, warnings: [] }],
      data: { market, compliance },
      preview,
      compliance,
      warnings: preview.warnings,
    };
  }

  if (!outcome || !market.tokenIds[outcome]) {
    return clarification("Which outcome should the order target? Options: " + (market.outcomes.join(", ") || "unknown") + ".", [], "clarification_required", "order_preview");
  }
  const preview = await preparePolymarketOrderPreview({ market, outcome, side, amountUsdc, compliance, slippageTolerance: numberOrNull(input.slippageTolerance) }, provider);
  return {
    venue: "polymarket",
    intent: "order_preview",
    execution: "unsigned_preview",
    responseText: preview.consequence,
    cards: [{ kind: "polymarket_order_preview", title: "Polymarket order preview", preview, warnings: preview.warnings }],
    data: { market, outcome, preview },
    preview,
    compliance,
    warnings: preview.warnings,
  };
}

function chooseOutcome(market: PolymarketMarketSummary, requested: string | null | undefined, side: PolymarketSide | null | undefined): string | null {
  if (requested && market.outcomes.includes(requested)) return requested;
  if (side) {
    const match = market.outcomes.find((outcome) => outcome.toLowerCase() === side);
    if (match) return match;
  }
  return market.outcomes.length > 0 ? market.outcomes[0] : null;
}

// ---------------------------------------------------------------------------
// HTTP/MCP/CLI helpers (thin, reuse the workflow internals).
// ---------------------------------------------------------------------------

export function buildPolymarketMarketListCard(markets: PolymarketMarketSummary[]): PolymarketChatCard {
  return { kind: "polymarket_market_list", title: "Polymarket markets", markets, warnings: [] };
}

export function buildPolymarketEventListCard(events: PolymarketEventSummary[]): PolymarketChatCard {
  return { kind: "polymarket_event_list", title: "Polymarket events", events, warnings: [] };
}

export function buildPolymarketMarketDetailCard(market: PolymarketMarketSummary): PolymarketChatCard {
  return { kind: "polymarket_market_detail", title: market.question, market, warnings: [] };
}

export function buildPolymarketOrderbookCard(orderbook: PolymarketOrderbook): PolymarketChatCard {
  return { kind: "polymarket_orderbook", title: (orderbook.outcome ?? orderbook.tokenId) + " orderbook", orderbook, warnings: orderbook.warnings };
}

export function buildPolymarketComplianceCard(compliance: PolymarketComplianceStatus): PolymarketChatCard {
  return { kind: "polymarket_compliance", title: "Polymarket compliance", compliance, warnings: [] };
}

export function buildPolymarketOrderPreviewCard(preview: PolymarketActionPreview): PolymarketChatCard {
  return { kind: "polymarket_order_preview", title: "Polymarket order preview", preview, warnings: preview.warnings };
}

/**
 * Structured (non-chat) order preview for the HTTP/MCP/CLI surface. Fetches the
 * market, runs the compliance gate, and returns a blocked or unsigned preview.
 * Never submits; `canSubmit` is always false.
 */
export async function preparePolymarketOrderFromRequest(
  input: { marketId: string; outcome?: string | null; side?: PolymarketSide | null; amountUsdc: number; slippageTolerance?: number | null },
  provider: PolymarketProvider = polymarketProvider,
): Promise<PolymarketActionPreview> {
  if (!input.marketId) throw new Error("marketId is required for a Polymarket order preview");
  if (!(input.amountUsdc > 0)) throw new Error("a positive amountUsdc is required for a Polymarket order preview");
  const market = await provider.getMarket(input.marketId);
  const side: PolymarketSide = input.side ?? "yes";
  const outcome = chooseOutcome(market, input.outcome ?? null, side);
  const compliance = await provider.checkCompliance();
  if (compliance.status === "blocked") {
    return buildBlockedPolymarketPreview({ market, outcome, side, compliance });
  }
  if (!outcome || !market.tokenIds[outcome]) {
    throw new Error("outcome is required; options: " + (market.outcomes.join(", ") || "unknown"));
  }
  return preparePolymarketOrderPreview({ market, outcome, side, amountUsdc: input.amountUsdc, compliance, slippageTolerance: input.slippageTolerance ?? null }, provider);
}

function clarification(
  question: string,
  warnings: string[],
  execution: PolymarketExecution,
  intent: PolymarketIntent,
): PolymarketChatExecutionResult {
  return {
    venue: "polymarket",
    intent,
    execution,
    responseText: question,
    cards: [{ kind: "polymarket_clarification", title: "More information needed", question, warnings }],
    warnings,
    requiresClarification: execution === "clarification_required" ? true : undefined,
    clarificationQuestion: execution === "clarification_required" ? question : undefined,
  };
}
