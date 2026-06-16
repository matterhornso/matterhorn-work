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

// Mirrors MARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN in packages/types/src/markets.ts.
// Kept Polymarket-local so this stream stays independent of shared files.
const FORBIDDEN_CREDENTIAL_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;

export type PolymarketIntent = "learn" | "discover" | "market" | "odds" | "orderbook" | "compliance" | "order_preview";
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

export interface PolymarketOrderPreviewInput {
  marketId?: string | null;
  outcome?: string | null;
  side?: PolymarketSide | null;
  /** USDC notional the user intends to spend */
  amountUsdc?: number | string | null;
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

export interface PolymarketChatExecutionInput {
  message: string;
  marketId?: string | null;
  outcome?: string | null;
  side?: PolymarketSide | null;
  amountUsdc?: number | string | null;
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

export type PolymarketChatCard =
  | { kind: "polymarket_market_list"; title: string; markets: PolymarketMarketSummary[]; warnings: string[] }
  | { kind: "polymarket_market_detail"; title: string; market: PolymarketMarketSummary; warnings: string[] }
  | { kind: "polymarket_orderbook"; title: string; orderbook: PolymarketOrderbook; warnings: string[] }
  | { kind: "polymarket_compliance"; title: string; compliance: PolymarketComplianceStatus; warnings: string[] }
  | { kind: "polymarket_order_preview"; title: string; preview: PolymarketActionPreview; warnings: string[] }
  | { kind: "polymarket_clarification"; title: string; question: string; warnings: string[] };

export interface PolymarketProvider {
  searchMarkets(query: string, limit?: number | null): Promise<PolymarketMarketSummary[]>;
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
  if (/\bgeoblock/.test(message) || /\b(compliance|restricted|jurisdiction)\b/.test(message)) return "compliance";
  if (/\b(order\s*book|orderbook|book|bid|ask|spread|midpoint|depth)\b/.test(message)) return "orderbook";
  if (/\b(odds|probability|probabilities|chance|liquidity|volume)\b/.test(message)) return "odds";
  if (/\b(explain|detail|details|describe|resolve|resolution|about this market)\b/.test(message)) return "market";
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
  args: { market: PolymarketMarketSummary; outcome: string; side: PolymarketSide; amountUsdc: number; compliance: PolymarketComplianceStatus },
  provider: PolymarketProvider = polymarketProvider,
): Promise<PolymarketActionPreview> {
  const { market, outcome, side, amountUsdc, compliance } = args;
  const warnings = [
    "Preview only: Matterhorn does not submit Polymarket orders.",
    "No API wallet secret, private key, or signature is accepted or stored.",
    RISK_DISCLAIMER,
  ];

  const tokenId = market.tokenIds[outcome];
  let marketability: PolymarketMarketabilityEstimate | null = null;
  if (tokenId) {
    try {
      const orderbook = await provider.getOrderbook(tokenId, { marketId: market.id, outcome });
      marketability = estimatePolymarketFill(orderbook.asks, amountUsdc);
      if (marketability.depthSufficient === false) warnings.push("Visible orderbook depth is insufficient to fully fill this size; expect a worse fill than estimated.");
    } catch (err) {
      warnings.push(err instanceof Error ? "Could not read orderbook for marketability: " + err.message : "Could not read orderbook for marketability.");
    }
  } else {
    warnings.push("No CLOB token id is known for outcome " + outcome + "; price could not be estimated.");
  }

  const price = marketability?.estimatedFillPrice ?? market.outcomePrices[outcome] ?? null;
  const estimatedShares = marketability?.estimatedShares ?? (price !== null && price > 0 ? Number((amountUsdc / price).toFixed(4)) : null);
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
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    fees: [{ label: "Polymarket trading fee", amount: null, asset: "USDC" }],
    consequence:
      "If executed outside Matterhorn, this would attempt to buy ~" + (estimatedShares ?? "?") + " '" + outcome + "' shares for $" + amountUsdc.toFixed(2) + " USDC at about " + formatProbability(price) + " on \"" + market.question + "\". " + PREVIEW_CONSEQUENCE_SUFFIX,
    confirmationText: "I understand this is preview-only in Matterhorn. " + PREVIEW_CONSEQUENCE_SUFFIX,
    previewSha256,
    source: nowSource(GAMMA_BASE_URL),
    compliance,
    warnings,
    canSubmit: false,
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
  const preview = await preparePolymarketOrderPreview({ market, outcome, side, amountUsdc, compliance }, provider);
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
