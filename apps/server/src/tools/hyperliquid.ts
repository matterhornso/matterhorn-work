/**
 * Hyperliquid read and preview tools.
 *
 * This first Matterhorn Hyperliquid slice is intentionally read-only plus
 * preview-only. It never accepts API secrets, private keys, signatures, or
 * signed actions, and it never submits to the Hyperliquid exchange endpoint.
 */

import { createHash } from "node:crypto";

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const HYPERLIQUID_CACHE_MS = 15_000;
const ETH_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const FORBIDDEN_CREDENTIAL_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedAction|signed_action)/i;

export type HyperliquidIntent = "learn" | "discover" | "account" | "positions" | "funding" | "orderbook" | "order_preview";
export type HyperliquidExecution = "answered" | "clarification_required" | "read_only" | "unsigned_preview" | "unsupported";
export type HyperliquidSide = "buy" | "sell" | "long" | "short";

export interface HyperliquidSource {
  source: string;
  fetchedAt: string;
  freshness: "live" | "recent" | "stale" | "fallback" | "unknown";
  warnings: string[];
}

export interface HyperliquidMarketSummary {
  asset: string;
  index: number;
  markPx: number | null;
  szDecimals: number | null;
  maxLeverage: number | null;
  onlyIsolated: boolean | null;
  source: HyperliquidSource;
}

export interface HyperliquidAccountSnapshot {
  address: string;
  marginSummary: Record<string, unknown> | null;
  crossMarginSummary: Record<string, unknown> | null;
  withdrawable: string | null;
  positionCount: number;
  openOrderCount: number;
  notionalExposure: number | null;
  unrealizedPnl: number | null;
  positions: HyperliquidPositionSummary[];
  orders: HyperliquidOpenOrderSummary[];
  assetPositions: unknown[];
  openOrders: unknown[];
  source: HyperliquidSource;
  warnings: string[];
}

export interface HyperliquidPositionSummary {
  asset: string;
  side: "long" | "short" | "flat" | "unknown";
  size: number | null;
  entryPx: number | null;
  positionValue: number | null;
  unrealizedPnl: number | null;
  returnOnEquity: number | null;
  liquidationPx: number | null;
  marginUsed: number | null;
  leverageType: string | null;
  leverageValue: number | null;
  raw: unknown;
}

export interface HyperliquidOpenOrderSummary {
  asset: string;
  side: "buy" | "sell" | "unknown";
  size: number | null;
  limitPx: number | null;
  oid: string | number | null;
  timestamp: number | null;
  reduceOnly: boolean | null;
  orderType: string | null;
  raw: unknown;
}

export interface HyperliquidFundingSnapshot {
  asset: string;
  fundingRate: number | null;
  premium: number | null;
  openInterest: number | null;
  oraclePx: number | null;
  markPx: number | null;
  previousDayPx: number | null;
  dayNotionalVolume: number | null;
  source: HyperliquidSource;
  warnings: string[];
  raw: unknown;
}

export interface HyperliquidOrderbook {
  asset: string;
  bids: HyperliquidBookLevel[];
  asks: HyperliquidBookLevel[];
  source: HyperliquidSource;
  warnings: string[];
}

export interface HyperliquidBookLevel {
  price: number;
  size: number;
  raw: unknown;
}

export interface HyperliquidOrderPreviewInput {
  asset?: string | null;
  side?: HyperliquidSide | null;
  size?: number | string | null;
  price?: number | string | null;
  reduceOnly?: boolean | null;
  slippageTolerance?: number | string | null;
  address?: string | null;
  message?: string | null;
  /** Close/reduce intent resolved from chat (e.g. "close half my ETH position"). */
  closeIntent?: HyperliquidCloseIntent | null;
  /** Live position context, supplied only when a public account address is known. */
  positionContext?: HyperliquidPositionContext | null;
  /** Venue max leverage for the asset, used for a leverage placeholder. */
  maxLeverage?: number | null;
}

export interface HyperliquidCloseIntent {
  isClose: boolean;
  /** Fraction of the position to close: 0.5 for "half", 1 for "all". Null when unspecified. */
  fraction: number | null;
}

export interface HyperliquidPositionContext {
  side: "long" | "short" | "flat" | "unknown";
  size: number | null;
  entryPx: number | null;
  liquidationPx: number | null;
  leverageValue: number | null;
  marginUsed: number | null;
}

/** Best-effort marketability/slippage estimate derived from the public orderbook. */
export interface HyperliquidMarketabilityEstimate {
  referencePrice: number | null;
  estimatedFillPrice: number | null;
  estimatedSlippagePct: number | null;
  worstLevelPrice: number | null;
  depthSufficient: boolean | null;
  note: string;
}

export interface HyperliquidPreviewFundingContext {
  fundingRate: number | null;
  annualizedFundingPct: number | null;
  openInterest: number | null;
  note: string;
}

export interface HyperliquidLeverageContext {
  maxLeverage: number | null;
  estimatedLeverage: number | null;
  liquidationPrice: number | null;
  requiresAccountContext: boolean;
  note: string;
}

export interface HyperliquidCloseContext {
  isClose: boolean;
  fraction: number | null;
  note: string;
}

export interface HyperliquidActionPreview {
  version: "matterhorn.market.action-preview.v1";
  venue: "hyperliquid";
  intent: "order_preview";
  signerPolicy: "api_wallet_required";
  execution: "unsigned_preview";
  action: "place_order";
  marketId: string;
  marketLabel: string;
  asset: string;
  side: HyperliquidSide;
  size: number;
  sizeAsset: string;
  price: number | null;
  priceAsset: "USDC";
  slippageTolerance: number | null;
  reduceOnly: boolean;
  notionalUsd: number | null;
  marketability: HyperliquidMarketabilityEstimate;
  funding: HyperliquidPreviewFundingContext | null;
  leverageContext: HyperliquidLeverageContext;
  closeContext: HyperliquidCloseContext | null;
  expiresAt: string;
  fees: Array<{ label: string; amount: number | null; asset: string | null }>;
  consequence: string;
  confirmationText: string;
  previewSha256: string;
  source: HyperliquidSource;
  compliance: {
    status: "unknown";
    reason: string;
    checkedAt: string;
    source: "matterhorn_local_preview";
  };
  warnings: string[];
  canSubmit: false;
}

export interface HyperliquidChatExecutionInput {
  message: string;
  address?: string | null;
  asset?: string | null;
  side?: HyperliquidSide | null;
  size?: number | string | null;
  price?: number | string | null;
  limit?: number | string | null;
  slippageTolerance?: number | string | null;
  reduceOnly?: boolean | null;
}

export interface HyperliquidChatExecutionResult {
  venue: "hyperliquid";
  intent: HyperliquidIntent;
  execution: HyperliquidExecution;
  responseText: string;
  cards: HyperliquidChatCard[];
  data?: Record<string, unknown>;
  preview?: HyperliquidActionPreview;
  warnings: string[];
  requiresClarification?: boolean;
  clarificationQuestion?: string;
}

export type HyperliquidChatCard =
  | { kind: "hyperliquid_market_list"; title: string; markets: HyperliquidMarketSummary[]; warnings: string[] }
  | { kind: "hyperliquid_account_snapshot"; title: string; account: HyperliquidAccountSnapshot; warnings: string[] }
  | { kind: "hyperliquid_position_risk"; title: string; positions: HyperliquidPositionSummary[]; orders: HyperliquidOpenOrderSummary[]; warnings: string[] }
  | { kind: "hyperliquid_funding"; title: string; funding: HyperliquidFundingSnapshot; warnings: string[] }
  | { kind: "hyperliquid_orderbook"; title: string; orderbook: HyperliquidOrderbook; warnings: string[] }
  | { kind: "hyperliquid_order_preview"; title: string; preview: HyperliquidActionPreview; warnings: string[] }
  | { kind: "hyperliquid_clarification"; title: string; question: string; warnings: string[] };

export interface HyperliquidProvider {
  listMarkets(limit?: number | null): Promise<HyperliquidMarketSummary[]>;
  getAccount(address: string): Promise<HyperliquidAccountSnapshot>;
  getFunding(asset: string): Promise<HyperliquidFundingSnapshot>;
  getOrderbook(asset: string): Promise<HyperliquidOrderbook>;
}

type Fetcher = (input: string, init: { method: "POST"; headers: Record<string, string>; body: string }) => Promise<{
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

function nowSource(warnings: string[] = []): HyperliquidSource {
  return {
    source: "hyperliquid.info",
    fetchedAt: new Date().toISOString(),
    freshness: "live",
    warnings,
  };
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

function normalizeAsset(value: unknown): string | null {
  const text = stringOrNull(value);
  if (!text) return null;
  const cleaned = text.replace(/[^a-zA-Z0-9/_:-]/g, "").toUpperCase();
  return cleaned.length > 0 && cleaned.length <= 32 ? cleaned : null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sideFromSize(size: number | null): HyperliquidPositionSummary["side"] {
  if (size === null) return "unknown";
  if (size > 0) return "long";
  if (size < 0) return "short";
  return "flat";
}

function normalizeOrderSide(value: unknown): HyperliquidOpenOrderSummary["side"] {
  const side = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (side === "b" || side === "buy" || side === "bid") return "buy";
  if (side === "a" || side === "sell" || side === "ask") return "sell";
  return "unknown";
}

function normalizePositionSummary(value: unknown): HyperliquidPositionSummary {
  const wrapper = objectOrNull(value) ?? {};
  const position = objectOrNull(wrapper.position) ?? wrapper;
  const leverage = objectOrNull(position.leverage);
  const asset = normalizeAsset(position.coin) ?? "UNKNOWN";
  const size = numberOrNull(position.szi);
  return {
    asset,
    side: sideFromSize(size),
    size,
    entryPx: numberOrNull(position.entryPx),
    positionValue: numberOrNull(position.positionValue),
    unrealizedPnl: numberOrNull(position.unrealizedPnl),
    returnOnEquity: numberOrNull(position.returnOnEquity),
    liquidationPx: numberOrNull(position.liquidationPx),
    marginUsed: numberOrNull(position.marginUsed),
    leverageType: stringOrNull(leverage?.type),
    leverageValue: numberOrNull(leverage?.value),
    raw: value,
  };
}

function normalizeOpenOrderSummary(value: unknown): HyperliquidOpenOrderSummary {
  const order = objectOrNull(value) ?? {};
  return {
    asset: normalizeAsset(order.coin) ?? "UNKNOWN",
    side: normalizeOrderSide(order.side),
    size: numberOrNull(order.sz ?? order.origSz),
    limitPx: numberOrNull(order.limitPx ?? order.px),
    oid: typeof order.oid === "number" || typeof order.oid === "string" ? order.oid : null,
    timestamp: numberOrNull(order.timestamp),
    reduceOnly: typeof order.reduceOnly === "boolean" ? order.reduceOnly : null,
    orderType: stringOrNull(order.orderType ?? order.type),
    raw: value,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stableJson).join(",") + "]";
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return "{" + entries.map(([key, child]) => JSON.stringify(key) + ":" + stableJson(child)).join(",") + "}";
  }
  return JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function isValidHyperliquidAddress(address: unknown): address is string {
  return typeof address === "string" && ETH_ADDRESS_RE.test(address.trim());
}

export function findForbiddenHyperliquidCredentialInput(value: unknown, path: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenHyperliquidCredentialInput(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_CREDENTIAL_KEY_RE.test(key)) return [...path, key].join(".");
    const nested = findForbiddenHyperliquidCredentialInput(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

export class HyperliquidInfoProvider implements HyperliquidProvider {
  private readonly infoUrl: string;
  private readonly fetcher: Fetcher;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: { infoUrl?: string; fetcher?: Fetcher } = {}) {
    this.infoUrl = options.infoUrl ?? process.env.HYPERLIQUID_INFO_URL ?? HYPERLIQUID_INFO_URL;
    this.fetcher = options.fetcher ?? (globalThis.fetch as Fetcher);
  }

  async listMarkets(limit: number | null = 20): Promise<HyperliquidMarketSummary[]> {
    const [meta, mids] = await Promise.all([
      this.postInfoCached("meta", { type: "meta" }),
      this.postInfoCached("allMids", { type: "allMids" }),
    ]);
    const universe = Array.isArray((meta as { universe?: unknown[] }).universe)
      ? (meta as { universe: unknown[] }).universe
      : [];
    const midsRecord = mids && typeof mids === "object" && !Array.isArray(mids) ? mids as Record<string, unknown> : {};
    const source = nowSource();
    const markets = universe.map((entry, index): HyperliquidMarketSummary => {
      const record = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      const asset = normalizeAsset(record.name) ?? "ASSET_" + index;
      return {
        asset,
        index,
        markPx: numberOrNull(midsRecord[asset]),
        szDecimals: numberOrNull(record.szDecimals),
        maxLeverage: numberOrNull(record.maxLeverage),
        onlyIsolated: typeof record.onlyIsolated === "boolean" ? record.onlyIsolated : null,
        source,
      };
    });
    const capped = Number.isFinite(limit) && limit !== null ? Math.max(1, Math.min(100, Math.trunc(limit))) : 20;
    return markets.slice(0, capped);
  }

  async getAccount(address: string): Promise<HyperliquidAccountSnapshot> {
    if (!isValidHyperliquidAddress(address)) throw new Error("address must be a 42-character 0x Hyperliquid account address");
    const [state, openOrders] = await Promise.all([
      this.postInfo({ type: "clearinghouseState", user: address }),
      this.postInfo({ type: "openOrders", user: address }),
    ]);
    const stateRecord = state && typeof state === "object" ? state as Record<string, unknown> : {};
    const positions = Array.isArray(stateRecord.assetPositions) ? stateRecord.assetPositions : [];
    const orders = Array.isArray(openOrders) ? openOrders : [];
    const normalizedPositions = positions.map(normalizePositionSummary);
    const normalizedOrders = orders.map(normalizeOpenOrderSummary);
    const notionalExposure = normalizedPositions.reduce((total, position) => {
      return total + Math.abs(position.positionValue ?? 0);
    }, 0);
    const unrealizedPnl = normalizedPositions.reduce((total, position) => {
      return total + (position.unrealizedPnl ?? 0);
    }, 0);
    return {
      address,
      marginSummary: stateRecord.marginSummary && typeof stateRecord.marginSummary === "object" ? stateRecord.marginSummary as Record<string, unknown> : null,
      crossMarginSummary: stateRecord.crossMarginSummary && typeof stateRecord.crossMarginSummary === "object" ? stateRecord.crossMarginSummary as Record<string, unknown> : null,
      withdrawable: stringOrNull(stateRecord.withdrawable),
      positionCount: positions.length,
      openOrderCount: orders.length,
      notionalExposure: normalizedPositions.length ? notionalExposure : null,
      unrealizedPnl: normalizedPositions.length ? unrealizedPnl : null,
      positions: normalizedPositions,
      orders: normalizedOrders,
      assetPositions: positions,
      openOrders: orders,
      source: nowSource(),
      warnings: ["Read-only account snapshot. Use the actual master or sub-account address, not an agent wallet address."],
    };
  }

  async getFunding(assetInput: string): Promise<HyperliquidFundingSnapshot> {
    const asset = normalizeAsset(assetInput);
    if (!asset) throw new Error("asset is required");
    const payload = await this.postInfoCached("metaAndAssetCtxs", { type: "metaAndAssetCtxs" });
    const tuple = Array.isArray(payload) ? payload : [];
    const meta = objectOrNull(tuple[0]);
    const universe = Array.isArray(meta?.universe) ? meta.universe : [];
    const contexts = Array.isArray(tuple[1]) ? tuple[1] : [];
    const index = universe.findIndex((entry) => normalizeAsset(objectOrNull(entry)?.name) === asset);
    const context = objectOrNull(contexts[index]) ?? {};
    if (index < 0) {
      return {
        asset,
        fundingRate: null,
        premium: null,
        openInterest: null,
        oraclePx: null,
        markPx: null,
        previousDayPx: null,
        dayNotionalVolume: null,
        source: nowSource(["Asset was not found in Hyperliquid metaAndAssetCtxs."]),
        warnings: ["No funding context found for " + asset + "."],
        raw: null,
      };
    }
    return {
      asset,
      fundingRate: numberOrNull(context.funding),
      premium: numberOrNull(context.premium),
      openInterest: numberOrNull(context.openInterest),
      oraclePx: numberOrNull(context.oraclePx),
      markPx: numberOrNull(context.markPx),
      previousDayPx: numberOrNull(context.prevDayPx),
      dayNotionalVolume: numberOrNull(context.dayNtlVlm),
      source: nowSource(),
      warnings: ["Funding is a read-only exchange snapshot and can change quickly."],
      raw: context,
    };
  }

  async getOrderbook(assetInput: string): Promise<HyperliquidOrderbook> {
    const asset = normalizeAsset(assetInput);
    if (!asset) throw new Error("asset is required");
    const book = await this.postInfo({ type: "l2Book", coin: asset });
    const levels = Array.isArray((book as { levels?: unknown[] }).levels) ? (book as { levels: unknown[] }).levels : [];
    const bids = this.normalizeLevels(levels[0]);
    const asks = this.normalizeLevels(levels[1]);
    return {
      asset,
      bids,
      asks,
      source: nowSource(),
      warnings: ["Orderbook is read-only and limited to the levels returned by Hyperliquid info endpoint."],
    };
  }

  private async postInfoCached(key: string, body: Record<string, unknown>): Promise<unknown> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.postInfo(body);
    this.cache.set(key, { expiresAt: Date.now() + HYPERLIQUID_CACHE_MS, value });
    return value;
  }

  private async postInfo(body: Record<string, unknown>): Promise<unknown> {
    const response = await this.fetcher(this.infoUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        detail = await response.text();
      } catch {
        // Keep statusText.
      }
      throw new Error("Hyperliquid info endpoint failed (" + response.status + "): " + detail);
    }
    return response.json();
  }

  private normalizeLevels(value: unknown): HyperliquidBookLevel[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 20).map((level) => {
      const record = level && typeof level === "object" ? level as Record<string, unknown> : {};
      return {
        price: numberOrNull(record.px) ?? 0,
        size: numberOrNull(record.sz) ?? 0,
        raw: level,
      };
    }).filter((level) => level.price > 0 && level.size >= 0);
  }
}

export const hyperliquidProvider = new HyperliquidInfoProvider();

export function planHyperliquidChat(input: HyperliquidChatExecutionInput): HyperliquidIntent {
  const message = input.message.toLowerCase();
  if (/\b(funding|funding rate|premium|open interest|oi)\b/.test(message)) return "funding";
  if (/\b(order\s*book|orderbook|book|bid|ask|liquidity)\b/.test(message)) return "orderbook";
  // Close/reduce intent is an order preview even though it mentions "position".
  if (/\b(close|flatten|exit)\b/.test(message) && /\b(position|positions|long|short|all|half|quarter|everything)\b/.test(message)) return "order_preview";
  if (/\b(position|positions|account|balance|margin|portfolio|pnl|open orders?)\b/.test(message)) return "account";
  if (/\b(buy|sell|long|short|trade|order|preview)\b/.test(message)) return "order_preview";
  if (/\b(market|markets|coin|coins|perp|perps|asset|assets|discover|list)\b/.test(message)) return "discover";
  return "learn";
}

export function extractHyperliquidCloseIntent(message: string): HyperliquidCloseIntent | null {
  const lower = message.toLowerCase();
  const isClose = /\b(close|flatten|exit)\b/.test(lower) && /\b(position|positions|long|short|all|half|quarter|everything)\b/.test(lower);
  if (!isClose) return null;
  let fraction: number | null = null;
  if (/\bhalf\b/.test(lower)) fraction = 0.5;
  else if (/\bquarter\b/.test(lower)) fraction = 0.25;
  else if (/\b(all|entire|everything|full|whole)\b/.test(lower)) fraction = 1;
  else {
    const pct = lower.match(/\b([0-9]{1,3}(?:\.[0-9]+)?)\s*%/);
    if (pct) {
      const value = Number(pct[1]);
      if (Number.isFinite(value) && value > 0 && value <= 100) fraction = value / 100;
    }
  }
  return { isClose: true, fraction };
}

export function extractHyperliquidOrderInput(input: HyperliquidChatExecutionInput): HyperliquidOrderPreviewInput {
  const message = input.message;
  const closeIntent = extractHyperliquidCloseIntent(message);
  const asset = normalizeAsset(input.asset) ?? extractAsset(message);
  const side = input.side ?? extractSide(message);
  const size = input.size ?? extractNumberAfter(message, /\b(size|amount|qty|quantity)\b/i) ?? extractNumberBeforeAsset(message, asset);
  const price = input.price ?? extractNumberAfter(message, /\b(price|at|limit)\b/i);
  return {
    asset,
    side,
    size,
    price,
    reduceOnly: input.reduceOnly ?? (Boolean(closeIntent?.isClose) || /\breduce[\s-]?only\b/i.test(message)),
    slippageTolerance: input.slippageTolerance,
    address: input.address,
    message,
    closeIntent,
  };
}

export async function prepareHyperliquidOrderPreview(
  input: HyperliquidOrderPreviewInput,
  provider: HyperliquidProvider = hyperliquidProvider,
): Promise<HyperliquidActionPreview> {
  const asset = normalizeAsset(input.asset);
  const side = input.side ?? null;
  const size = numberOrNull(input.size);
  const explicitPrice = numberOrNull(input.price);
  const slippageTolerance = numberOrNull(input.slippageTolerance);
  const warnings = [
    "Preview only: Matterhorn does not submit Hyperliquid orders in this milestone.",
    "No API wallet secret, private key, or signature is accepted or stored.",
    "Compliance and jurisdiction checks are not complete; do not treat this as executable.",
  ];
  if (!asset) throw new Error("asset is required for a Hyperliquid order preview");
  if (!side || !["buy", "sell", "long", "short"].includes(side)) throw new Error("side must be buy, sell, long, or short");
  if (!size || size <= 0) throw new Error("positive size is required for a Hyperliquid order preview");

  const reduceOnly = Boolean(input.reduceOnly) || Boolean(input.closeIntent?.isClose);

  let markPx: number | null = null;
  let maxLeverage: number | null = input.maxLeverage ?? null;
  try {
    const markets = await provider.listMarkets(100);
    const market = markets.find((entry) => entry.asset === asset);
    markPx = market?.markPx ?? null;
    maxLeverage = maxLeverage ?? market?.maxLeverage ?? null;
  } catch (err) {
    warnings.push(err instanceof Error ? "Could not fetch live mark price: " + err.message : "Could not fetch live mark price.");
  }

  const price = explicitPrice ?? markPx;
  if (price === null) warnings.push("No explicit price or mark price is available; preview cannot estimate notional.");

  // Best-effort marketability/slippage from the public orderbook.
  const marketability = await estimateHyperliquidMarketability(provider, asset, side, size, warnings);
  if (slippageTolerance !== null && marketability.estimatedSlippagePct !== null && marketability.estimatedSlippagePct > slippageTolerance) {
    warnings.push(
      "Estimated slippage (" + marketability.estimatedSlippagePct.toFixed(3) + "%) exceeds your tolerance (" + slippageTolerance + "%).",
    );
  }

  // Best-effort funding context for the asset.
  const funding = await buildHyperliquidPreviewFunding(provider, asset, warnings);

  // Notional estimate from explicit/mark price, falling back to estimated fill.
  const notionalReference = price ?? marketability.estimatedFillPrice;
  const notionalUsd = notionalReference === null ? null : Number((size * notionalReference).toFixed(2));

  const leverageContext = buildHyperliquidLeverageContext(input.positionContext ?? null, maxLeverage, price ?? marketability.estimatedFillPrice);
  const closeContext = input.closeIntent?.isClose
    ? {
        isClose: true,
        fraction: input.closeIntent.fraction ?? null,
        note:
          input.closeIntent.fraction !== null
            ? "Reduce-only close of about " + Math.round(input.closeIntent.fraction * 100) + "% of the position; it can only shrink, never flip, your exposure."
            : "Reduce-only close; it can only shrink, never flip, your exposure.",
      }
    : null;

  const actionPayload = {
    venue: "hyperliquid",
    action: "place_order",
    asset,
    side,
    size,
    price,
    reduceOnly,
    slippageTolerance,
    canSubmit: false,
  };
  const previewSha256 = sha256(actionPayload);
  const notionalText = notionalUsd === null
    ? size + " " + asset
    : size + " " + asset + " (~" + formatNumber(notionalUsd) + " USDC notional)" + (price === null ? "" : " near " + formatNumber(price) + " USDC");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const consequence = (reduceOnly ? "Reduce-only preview. " : "")
    + "If executed outside Matterhorn, this would attempt to " + side + " " + notionalText + " on Hyperliquid. "
    + "Matterhorn will not sign or submit it.";
  return {
    version: "matterhorn.market.action-preview.v1",
    venue: "hyperliquid",
    intent: "order_preview",
    signerPolicy: "api_wallet_required",
    execution: "unsigned_preview",
    action: "place_order",
    marketId: asset,
    marketLabel: asset + "-PERP",
    asset,
    side,
    size,
    sizeAsset: asset,
    price,
    priceAsset: "USDC",
    slippageTolerance,
    reduceOnly,
    notionalUsd,
    marketability,
    funding,
    leverageContext,
    closeContext,
    expiresAt,
    fees: [{ label: "Trading fee estimate", amount: null, asset: "USDC" }],
    consequence,
    confirmationText: "I understand this is preview-only in Matterhorn. External signing/execution is not enabled; Matterhorn never holds keys or submits to Hyperliquid.",
    previewSha256,
    source: nowSource(markPx === null ? ["Live mark price unavailable for preview."] : []),
    compliance: {
      status: "unknown",
      reason: "Matterhorn has not run jurisdiction, account, or venue compliance checks for this preview.",
      checkedAt: new Date().toISOString(),
      source: "matterhorn_local_preview",
    },
    warnings,
    canSubmit: false,
  };
}

/** Walk the public book to estimate fill price and slippage for a preview. Best-effort. */
async function estimateHyperliquidMarketability(
  provider: HyperliquidProvider,
  asset: string,
  side: HyperliquidSide,
  size: number,
  warnings: string[],
): Promise<HyperliquidMarketabilityEstimate> {
  const isBuy = side === "buy" || side === "long";
  try {
    const orderbook = await provider.getOrderbook(asset);
    const levels = isBuy ? orderbook.asks : orderbook.bids;
    if (levels.length === 0) {
      return { referencePrice: null, estimatedFillPrice: null, estimatedSlippagePct: null, worstLevelPrice: null, depthSufficient: null, note: "Orderbook had no " + (isBuy ? "ask" : "bid") + " levels; marketability could not be estimated." };
    }
    const reference = levels[0].price;
    let remaining = size;
    let cost = 0;
    let filled = 0;
    let worst = reference;
    for (const level of levels) {
      if (remaining <= 0) break;
      const take = Math.min(level.size, remaining);
      cost += take * level.price;
      filled += take;
      worst = level.price;
      remaining -= take;
    }
    const fillPrice = filled > 0 ? cost / filled : null;
    const slippagePct = fillPrice !== null && reference > 0 ? Math.abs((fillPrice - reference) / reference) * 100 : null;
    const depthSufficient = remaining <= 1e-9;
    if (!depthSufficient) warnings.push("Visible orderbook depth is insufficient to fully fill this size; expect more slippage than estimated.");
    return {
      referencePrice: reference,
      estimatedFillPrice: fillPrice === null ? null : Number(fillPrice.toFixed(6)),
      estimatedSlippagePct: slippagePct === null ? null : Number(slippagePct.toFixed(4)),
      worstLevelPrice: worst,
      depthSufficient,
      note: depthSufficient
        ? "Estimated from visible " + (isBuy ? "ask" : "bid") + " levels; live fills may differ."
        : "Only partial depth was visible; estimate is a lower bound on slippage.",
    };
  } catch (err) {
    warnings.push(err instanceof Error ? "Could not read orderbook for marketability: " + err.message : "Could not read orderbook for marketability.");
    return { referencePrice: null, estimatedFillPrice: null, estimatedSlippagePct: null, worstLevelPrice: null, depthSufficient: null, note: "Orderbook unavailable; marketability not estimated." };
  }
}

async function buildHyperliquidPreviewFunding(
  provider: HyperliquidProvider,
  asset: string,
  warnings: string[],
): Promise<HyperliquidPreviewFundingContext | null> {
  try {
    const funding = await provider.getFunding(asset);
    const annualized = funding.fundingRate === null ? null : Number((funding.fundingRate * 24 * 365 * 100).toFixed(4));
    return {
      fundingRate: funding.fundingRate,
      annualizedFundingPct: annualized,
      openInterest: funding.openInterest,
      note: funding.fundingRate === null
        ? "Funding rate unavailable for " + asset + "."
        : "Hourly funding " + funding.fundingRate + " (~" + (annualized ?? 0) + "%/yr if held); longs pay shorts when positive.",
    };
  } catch (err) {
    warnings.push(err instanceof Error ? "Could not read funding for preview: " + err.message : "Could not read funding for preview.");
    return null;
  }
}

function buildHyperliquidLeverageContext(
  position: HyperliquidPositionContext | null,
  maxLeverage: number | null,
  referencePrice: number | null,
): HyperliquidLeverageContext {
  if (position) {
    return {
      maxLeverage,
      estimatedLeverage: position.leverageValue,
      liquidationPrice: position.liquidationPx,
      requiresAccountContext: false,
      note: "Leverage and liquidation are read from your live position. They shift as price, margin, and size change.",
    };
  }
  return {
    maxLeverage,
    estimatedLeverage: null,
    liquidationPrice: null,
    requiresAccountContext: true,
    note: "Leverage and liquidation price require account context. Share your public Hyperliquid address to populate them; "
      + (maxLeverage === null ? "venue max leverage is unknown." : "venue max leverage for this asset is " + maxLeverage + "x."),
  };
}

// ---------------------------------------------------------------------------
// External-signer handoff + receipt verification.
//
// Matterhorn never signs, submits, broadcasts, or holds keys. It produces an
// unsigned handoff for the user to sign with their own wallet, and later
// validates a PUBLIC receipt. Signing material is rejected on the way in.
// ---------------------------------------------------------------------------

const HYPERLIQUID_HANDOFF_TTL_MS = 10 * 60 * 1000;

export interface HyperliquidSigningHandoff {
  version: "matterhorn.hyperliquid.signing-handoff.v1";
  venue: "hyperliquid";
  signerPolicy: "external_signer_required";
  action: "place_order";
  marketId: string;
  marketLabel: string;
  asset: string;
  side: HyperliquidSide;
  size: number;
  sizeAsset: string;
  price: number | null;
  reduceOnly: boolean;
  order: {
    asset: string;
    side: HyperliquidSide;
    size: number;
    price: number | null;
    reduceOnly: boolean;
  };
  signingScheme: {
    standard: "eip712";
    venue: "hyperliquid-exchange";
    instructions: string;
  };
  /** Canonical L1 order-action payload + Agent signing scaffold, when the asset index is resolvable. */
  signingPayload: HyperliquidOrderActionPayload | null;
  previewSha256: string;
  handoffSha256: string;
  expiresAt: string;
  warnings: string[];
  canSubmit: false;
  externalSignerOnly: true;
}

/**
 * Canonical Hyperliquid L1 order-action payload plus the EIP-712 Agent signing
 * scaffold. Matterhorn produces the order action object and the fixed Agent
 * domain/types, but does NOT compute the action hash (connectionId) or the
 * signature — those need msgpack serialization + a key and are produced by the
 * official Hyperliquid SDK. Always requiresClientValidation.
 */
export interface HyperliquidOrderActionPayload {
  standard: "hyperliquid-l1-action";
  requiresClientValidation: true;
  action: {
    type: "order";
    orders: Array<{ a: number; b: boolean; p: string; s: string; r: boolean; t: { limit: { tif: string } } }>;
    grouping: "na";
  };
  agentSigningScheme: {
    standard: "eip712";
    domain: { name: "Exchange"; version: "1"; chainId: number; verifyingContract: string };
    primaryType: "Agent";
    types: Record<string, Array<{ name: string; type: string }>>;
    sourceByNetwork: { mainnet: string; testnet: string };
  };
  clientMustCompute: string[];
  notes: string[];
}

export interface HyperliquidReceiptInput {
  previewSha256?: string | null;
  handoffSha256?: string | null;
  orderId?: string | null;
  txHash?: string | null;
  status?: string | null;
  asset?: string | null;
  side?: HyperliquidSide | null;
  submittedAt?: string | null;
}

export interface HyperliquidReceipt {
  version: "matterhorn.market.receipt.v1";
  venue: "hyperliquid";
  status: "received" | "pending" | "filled" | "cancelled" | "rejected" | "failed" | "unknown";
  action: "place_order";
  previewSha256: string | null;
  handoffSha256: string | null;
  orderId: string | null;
  txHash: string | null;
  asset: string | null;
  side: HyperliquidSide | null;
  submittedAt: string | null;
  warnings: string[];
}

export interface HyperliquidReceiptVerification {
  ok: boolean;
  receipt: HyperliquidReceipt | null;
  matchesHandoff: boolean;
  errors: string[];
  warnings: string[];
}

export type HyperliquidHandoffReference = Pick<HyperliquidSigningHandoff, "previewSha256" | "handoffSha256" | "asset" | "side">;

// Hyperliquid L1 phantom-agent signing domain (fixed and well-known).
const HYPERLIQUID_AGENT_CHAIN_ID = 1337;
const HYPERLIQUID_AGENT_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
};

/**
 * Build the canonical Hyperliquid L1 order-action payload plus the Agent signing
 * scaffold. Matterhorn does NOT compute the action hash (connectionId), the
 * nonce, or the signature — the official Hyperliquid SDK does, from a key
 * Matterhorn never holds. Always requiresClientValidation.
 */
export function buildHyperliquidOrderActionPayload(args: {
  assetIndex: number;
  side: HyperliquidSide;
  size: number;
  price: number | null;
  reduceOnly: boolean;
}): HyperliquidOrderActionPayload {
  const isBuy = args.side === "buy" || args.side === "long";
  return {
    standard: "hyperliquid-l1-action",
    requiresClientValidation: true,
    action: {
      type: "order",
      orders: [
        {
          a: args.assetIndex,
          b: isBuy,
          p: args.price === null ? "0" : String(args.price),
          s: String(args.size),
          r: args.reduceOnly,
          t: { limit: { tif: "Gtc" } },
        },
      ],
      grouping: "na",
    },
    agentSigningScheme: {
      standard: "eip712",
      domain: { name: "Exchange", version: "1", chainId: HYPERLIQUID_AGENT_CHAIN_ID, verifyingContract: "0x0000000000000000000000000000000000000000" },
      primaryType: "Agent",
      types: HYPERLIQUID_AGENT_TYPES,
      sourceByNetwork: { mainnet: "a", testnet: "b" },
    },
    clientMustCompute: ["nonce", "connectionId (msgpack action hash over action+nonce+vault)", "signature"],
    notes: [
      "TEMPLATE ONLY — validate the action format, asset index, tif, and agent domain against Hyperliquid's official SDK and on testnet before signing real funds.",
      "Matterhorn does not compute the connectionId (msgpack action hash) or the signature; the official SDK does, from a key Matterhorn never holds.",
      "If no limit price is given, the client must apply Hyperliquid's market-order handling (IOC + slippage price); this template uses tif=Gtc.",
    ],
  };
}

/**
 * Build an external-signer handoff from an unsigned order preview. The user
 * signs and submits with THEIR OWN wallet. Matterhorn never signs, submits, or
 * holds keys. The packet contains only public order terms. When the asset index
 * is known, the canonical L1 order-action payload is attached (still
 * requiresClientValidation, still canSubmit:false).
 */
export function buildHyperliquidSigningHandoff(
  preview: HyperliquidActionPreview,
  options: { assetIndex?: number | null } = {},
): HyperliquidSigningHandoff {
  if (preview.execution !== "unsigned_preview" || preview.canSubmit !== false) {
    throw new Error("A signing handoff requires a non-submittable unsigned preview.");
  }
  if (!preview.asset || preview.size === null || preview.size <= 0) {
    throw new Error("Preview is missing asset or a positive size; cannot build a handoff.");
  }
  const forbidden = findForbiddenHyperliquidCredentialInput(preview);
  if (forbidden) throw new Error("Preview unexpectedly contained credential-shaped data at " + forbidden);

  const warnings = [
    "External signer required: sign and submit this with your OWN wallet. Matterhorn does not sign, submit, or hold keys.",
    "Do not send the signature or any signed payload back to Matterhorn; only a public receipt can be imported.",
  ];
  let signingPayload: HyperliquidOrderActionPayload | null = null;
  if (typeof options.assetIndex === "number" && options.assetIndex >= 0) {
    signingPayload = buildHyperliquidOrderActionPayload({
      assetIndex: options.assetIndex,
      side: preview.side,
      size: preview.size,
      price: preview.price,
      reduceOnly: preview.reduceOnly,
    });
    warnings.push("L1 order-action payload is a TEMPLATE requiring validation against Hyperliquid's official SDK before signing real funds.");
  } else {
    warnings.push("No L1 order-action payload attached; the asset index could not be resolved.");
  }

  const order = {
    asset: preview.asset,
    side: preview.side,
    size: preview.size,
    price: preview.price,
    reduceOnly: preview.reduceOnly,
  };
  const core = {
    version: "matterhorn.hyperliquid.signing-handoff.v1",
    venue: "hyperliquid",
    asset: preview.asset,
    side: preview.side,
    size: preview.size,
    price: preview.price,
    reduceOnly: preview.reduceOnly,
    previewSha256: preview.previewSha256,
  };
  return {
    version: "matterhorn.hyperliquid.signing-handoff.v1",
    venue: "hyperliquid",
    signerPolicy: "external_signer_required",
    action: "place_order",
    marketId: preview.marketId,
    marketLabel: preview.marketLabel,
    asset: preview.asset,
    side: preview.side,
    size: preview.size,
    sizeAsset: preview.sizeAsset,
    price: preview.price,
    reduceOnly: preview.reduceOnly,
    order,
    signingScheme: {
      standard: "eip712",
      venue: "hyperliquid-exchange",
      instructions:
        "Sign this order with your own wallet via Hyperliquid's official client (L1 action signing). " +
        "Matterhorn provides the economic terms only and never produces the signature, the API wallet, or the submission.",
    },
    signingPayload,
    previewSha256: preview.previewSha256,
    handoffSha256: sha256(core),
    expiresAt: new Date(Date.now() + HYPERLIQUID_HANDOFF_TTL_MS).toISOString(),
    warnings,
    canSubmit: false,
    externalSignerOnly: true,
  };
}

/**
 * Resolve the asset index, build the preview, and attach the L1 order-action
 * payload — in one pass. Matterhorn still never signs, submits, or holds keys.
 */
export async function prepareHyperliquidHandoffFromRequest(
  input: HyperliquidOrderPreviewInput,
  provider: HyperliquidProvider = hyperliquidProvider,
): Promise<{ preview: HyperliquidActionPreview; handoff: HyperliquidSigningHandoff }> {
  const preview = await prepareHyperliquidOrderPreview(input, provider);
  let assetIndex: number | null = null;
  try {
    const markets = await provider.listMarkets(200);
    assetIndex = markets.find((market) => market.asset === preview.asset)?.index ?? null;
  } catch {
    assetIndex = null;
  }
  const handoff = buildHyperliquidSigningHandoff(preview, { assetIndex });
  return { preview, handoff };
}

const HYPERLIQUID_RECEIPT_STATUSES = ["received", "pending", "filled", "cancelled", "rejected", "failed", "unknown"] as const;

function normalizeHyperliquidReceiptStatus(value: string | null | undefined): HyperliquidReceipt["status"] {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (HYPERLIQUID_RECEIPT_STATUSES as readonly string[]).includes(status) ? (status as HyperliquidReceipt["status"]) : "unknown";
}

/**
 * Validate a returned PUBLIC receipt against the handoff that produced it.
 * Rejects any signing material and never accepts a signature.
 */
export function verifyHyperliquidReceipt(handoff: HyperliquidHandoffReference, input: HyperliquidReceiptInput): HyperliquidReceiptVerification {
  const errors: string[] = [];
  const warnings: string[] = [];

  const forbidden = findForbiddenHyperliquidCredentialInput(input);
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
  if (input.asset && normalizeAsset(input.asset) !== handoff.asset) errors.push("Receipt asset does not match the handoff.");
  if (input.side && input.side !== handoff.side) errors.push("Receipt side does not match the handoff.");
  if (!input.orderId && !input.txHash) warnings.push("Receipt has neither an order id nor a tx hash; status cannot be independently located.");

  const receipt: HyperliquidReceipt = {
    version: "matterhorn.market.receipt.v1",
    venue: "hyperliquid",
    status: normalizeHyperliquidReceiptStatus(input.status),
    action: "place_order",
    previewSha256: input.previewSha256 ?? handoff.previewSha256,
    handoffSha256: input.handoffSha256 ?? handoff.handoffSha256,
    orderId: input.orderId ?? null,
    txHash: input.txHash ?? null,
    asset: input.asset ? normalizeAsset(input.asset) : handoff.asset,
    side: input.side ?? handoff.side,
    submittedAt: input.submittedAt ?? null,
    warnings,
  };

  return { ok: errors.length === 0, receipt, matchesHandoff: errors.length === 0, errors, warnings };
}

/** Narrow an untrusted request body into a handoff reference. Returns null if malformed. */
export function coerceHyperliquidHandoffReference(value: unknown): HyperliquidHandoffReference | null {
  const record = objectOrNull(value);
  if (!record) return null;
  const previewSha256 = stringOrNull(record.previewSha256);
  const handoffSha256 = stringOrNull(record.handoffSha256);
  const asset = normalizeAsset(record.asset);
  const sideRaw = stringOrNull(record.side);
  const side = sideRaw === "buy" || sideRaw === "sell" || sideRaw === "long" || sideRaw === "short" ? sideRaw : null;
  if (!previewSha256 || !handoffSha256 || !asset || side === null) return null;
  return { previewSha256, handoffSha256, asset, side };
}

/** Narrow an untrusted request body into a receipt input (public fields only). */
export function coerceHyperliquidReceiptInput(value: unknown): HyperliquidReceiptInput {
  const record = objectOrNull(value);
  if (!record) return {};
  const sideRaw = stringOrNull(record.side);
  return {
    previewSha256: stringOrNull(record.previewSha256),
    handoffSha256: stringOrNull(record.handoffSha256),
    orderId: stringOrNull(record.orderId),
    txHash: stringOrNull(record.txHash),
    status: stringOrNull(record.status),
    asset: stringOrNull(record.asset),
    side: sideRaw === "buy" || sideRaw === "sell" || sideRaw === "long" || sideRaw === "short" ? sideRaw : null,
    submittedAt: stringOrNull(record.submittedAt),
  };
}

/** Customer-facing read-only provider failure. Never echoes secrets or submits anything. */
function hyperliquidProviderUnavailable(intent: HyperliquidIntent, err: unknown): HyperliquidChatExecutionResult {
  const detail = err instanceof Error ? err.message : String(err);
  return {
    venue: "hyperliquid",
    intent,
    execution: "unsupported",
    responseText:
      "Hyperliquid market data is temporarily unavailable, so I could not complete this read-only request. " +
      "Nothing was submitted or signed. Please try again shortly; if it persists, check the provider or network configuration.",
    cards: [],
    data: { providerUnavailable: true },
    warnings: ["provider_unavailable: " + detail],
  };
}

export async function executeHyperliquidChatWorkflow(
  input: HyperliquidChatExecutionInput,
  options: { provider?: HyperliquidProvider } = {},
): Promise<HyperliquidChatExecutionResult> {
  const provider = options.provider ?? hyperliquidProvider;
  const forbidden = findForbiddenHyperliquidCredentialInput(input);
  if (forbidden) {
    return clarification(
      "For safety, remove private keys, API secrets, signatures, or signed payloads. Matterhorn only accepts public addresses and order parameters for Hyperliquid preview.",
      ["Rejected credential-shaped field: " + forbidden],
      "unsupported",
    );
  }

  const intent = planHyperliquidChat(input);
  try {
  if (intent === "learn") {
    return {
      venue: "hyperliquid",
      intent,
      execution: "answered",
      responseText: "Hyperliquid support is read-only plus preview-only right now. I can list markets, inspect public account state, show an orderbook, and prepare a non-submittable order preview. I will not ask for API wallet secrets or submit trades.",
      cards: [],
      warnings: [],
    };
  }

  if (intent === "discover") {
    const limit = Math.max(1, Math.min(100, Math.trunc(numberOrNull(input.limit) ?? 10)));
    const markets = await provider.listMarkets(limit);
    return {
      venue: "hyperliquid",
      intent,
      execution: "read_only",
      responseText: "Found " + markets.length + " Hyperliquid markets. These are read-only market summaries with live/freshness labels where available.",
      cards: [buildHyperliquidMarketListCard(markets)],
      data: { markets },
      warnings: [],
    };
  }

  if (intent === "account" || intent === "positions") {
    if (!isValidHyperliquidAddress(input.address)) {
      return clarification("What Hyperliquid account address should I inspect? Send the public 0x master or sub-account address.", [], "clarification_required", intent);
    }
    const account = await provider.getAccount(input.address);
    return {
      venue: "hyperliquid",
      intent: "account",
      execution: "read_only",
      responseText: "Hyperliquid account snapshot for " + input.address + ": " + account.positionCount + " positions, " + account.openOrderCount + " open orders, and " + (account.notionalExposure === null ? "unknown" : formatNumber(account.notionalExposure) + " USDC") + " notional exposure. This is read-only public account data.",
      cards: [buildHyperliquidAccountCard(account), buildHyperliquidPositionRiskCard(account)],
      data: { account },
      warnings: account.warnings,
    };
  }

  if (intent === "funding") {
    const asset = normalizeAsset(input.asset) ?? extractAsset(input.message);
    if (!asset) return clarification("Which Hyperliquid asset should I check funding for? Example: BTC, ETH, SOL, or HYPE.", [], "clarification_required", intent);
    const funding = await provider.getFunding(asset);
    const annualizedFundingPct = funding.fundingRate === null ? null : Number((funding.fundingRate * 24 * 365 * 100).toFixed(4));
    const fundingRiskText = funding.fundingRate === null
      ? "Hyperliquid " + asset + " funding is currently unavailable. This is read-only and can change quickly."
      : "Hyperliquid " + asset + " funding risk: hourly funding " + funding.fundingRate
        + " (~" + annualizedFundingPct + "%/yr if held). "
        + (funding.fundingRate >= 0 ? "Longs pay shorts" : "Shorts pay longs")
        + " at the current rate, so a held "
        + (funding.fundingRate >= 0 ? "long" : "short")
        + " position bleeds funding over time. This is read-only and can change quickly.";
    return {
      venue: "hyperliquid",
      intent,
      execution: "read_only",
      responseText: fundingRiskText,
      cards: [buildHyperliquidFundingCard(funding)],
      data: { funding, annualizedFundingPct },
      warnings: funding.warnings,
    };
  }

  if (intent === "orderbook") {
    const asset = normalizeAsset(input.asset) ?? extractAsset(input.message);
    if (!asset) return clarification("Which Hyperliquid asset should I show the orderbook for? Example: BTC, ETH, SOL, or HYPE.", [], "clarification_required", intent);
    const orderbook = await provider.getOrderbook(asset);
    return {
      venue: "hyperliquid",
      intent,
      execution: "read_only",
      responseText: "Hyperliquid " + asset + " orderbook snapshot: " + orderbook.bids.length + " bid levels and " + orderbook.asks.length + " ask levels.",
      cards: [buildHyperliquidOrderbookCard(orderbook)],
      data: { orderbook },
      warnings: orderbook.warnings,
    };
  }

  const orderInput = extractHyperliquidOrderInput(input);

  // Close/reduce intent is account-dependent: size and side come from the live
  // position. Resolve from the account when an address is known; otherwise ask
  // exactly one clarification rather than guessing.
  if (orderInput.closeIntent?.isClose) {
    if (!orderInput.asset) {
      return clarification("Which Hyperliquid position should I close? Name the asset, for example: close half my ETH position.", [], "clarification_required", "order_preview");
    }
    if (!isValidHyperliquidAddress(input.address)) {
      return clarification(
        "To preview closing your " + orderInput.asset + " position, share your public Hyperliquid account address so I can size it from your live position. Matterhorn will still not submit anything.",
        [],
        "clarification_required",
        "order_preview",
      );
    }
    const account = await provider.getAccount(input.address);
    const position = account.positions.find((entry) => entry.asset === orderInput.asset && entry.size !== null && entry.size !== 0);
    if (!position || position.size === null || position.size === 0) {
      return clarification(
        "I do not see an open " + orderInput.asset + " position for that address, so there is nothing to close. This is read-only public account data.",
        account.warnings,
        "read_only",
        "order_preview",
      );
    }
    const fraction = orderInput.closeIntent.fraction ?? 1;
    const closeSize = Math.abs(position.size) * fraction;
    const closeSide: HyperliquidSide = position.side === "long" ? "sell" : "buy";
    const closePreview = await prepareHyperliquidOrderPreview(
      {
        asset: orderInput.asset,
        side: closeSide,
        size: closeSize,
        price: orderInput.price,
        reduceOnly: true,
        slippageTolerance: orderInput.slippageTolerance,
        address: input.address,
        message: input.message,
        closeIntent: orderInput.closeIntent,
        positionContext: {
          side: position.side,
          size: position.size,
          entryPx: position.entryPx,
          liquidationPx: position.liquidationPx,
          leverageValue: position.leverageValue,
          marginUsed: position.marginUsed,
        },
      },
      provider,
    );
    return {
      venue: "hyperliquid",
      intent: "order_preview",
      execution: "unsigned_preview",
      responseText: closePreview.consequence,
      cards: [buildHyperliquidOrderPreviewCard(closePreview)],
      data: { preview: closePreview, position },
      preview: closePreview,
      warnings: closePreview.warnings,
    };
  }

  if (!orderInput.asset || !orderInput.side || !numberOrNull(orderInput.size)) {
    return clarification(
      "To prepare a Hyperliquid order preview, send asset, side, and size. Example: preview buying 0.1 BTC at 65000 USDC.",
      ["Matterhorn will still not submit the order; it only creates a non-submittable preview."],
      "clarification_required",
      "order_preview",
    );
  }
  const preview = await prepareHyperliquidOrderPreview(orderInput, provider);
  return {
    venue: "hyperliquid",
    intent: "order_preview",
    execution: "unsigned_preview",
    responseText: preview.consequence,
    cards: [buildHyperliquidOrderPreviewCard(preview)],
    data: { preview },
    preview,
    warnings: preview.warnings,
  };
  } catch (err) {
    return hyperliquidProviderUnavailable(intent, err);
  }
}

export function buildHyperliquidMarketListCard(markets: HyperliquidMarketSummary[]): HyperliquidChatCard {
  return { kind: "hyperliquid_market_list", title: "Hyperliquid markets", markets, warnings: [] };
}

export function buildHyperliquidAccountCard(account: HyperliquidAccountSnapshot): HyperliquidChatCard {
  return { kind: "hyperliquid_account_snapshot", title: "Hyperliquid account", account, warnings: account.warnings };
}

export function buildHyperliquidPositionRiskCard(account: HyperliquidAccountSnapshot): HyperliquidChatCard {
  return {
    kind: "hyperliquid_position_risk",
    title: "Hyperliquid positions and open orders",
    positions: account.positions,
    orders: account.orders,
    warnings: account.warnings,
  };
}

export function buildHyperliquidFundingCard(funding: HyperliquidFundingSnapshot): HyperliquidChatCard {
  return { kind: "hyperliquid_funding", title: funding.asset + " funding", funding, warnings: funding.warnings };
}

export function buildHyperliquidOrderbookCard(orderbook: HyperliquidOrderbook): HyperliquidChatCard {
  return { kind: "hyperliquid_orderbook", title: orderbook.asset + " orderbook", orderbook, warnings: orderbook.warnings };
}

export function buildHyperliquidOrderPreviewCard(preview: HyperliquidActionPreview): HyperliquidChatCard {
  return { kind: "hyperliquid_order_preview", title: "Hyperliquid order preview", preview, warnings: preview.warnings };
}

function clarification(
  question: string,
  warnings: string[],
  execution: HyperliquidExecution = "clarification_required",
  intent: HyperliquidIntent = "order_preview",
): HyperliquidChatExecutionResult {
  return {
    venue: "hyperliquid",
    intent,
    execution,
    responseText: question,
    cards: [{ kind: "hyperliquid_clarification", title: "More information needed", question, warnings }],
    warnings,
    requiresClarification: true,
    clarificationQuestion: question,
  };
}

function extractSide(message: string): HyperliquidSide | null {
  const lower = message.toLowerCase();
  if (/\b(buy|buying|bid|bidding)\b/.test(lower)) return "buy";
  if (/\b(sell|selling|ask|asking)\b/.test(lower)) return "sell";
  if (/\blong\b/.test(lower)) return "long";
  if (/\bshort\b/.test(lower)) return "short";
  return null;
}

function extractAsset(message: string): string | null {
  const explicit = message.match(/\b(?:asset|coin|market)\s+([a-zA-Z][a-zA-Z0-9/_:-]{1,31})\b/i)?.[1];
  if (explicit) return normalizeAsset(explicit);
  const common = message.match(/\b(BTC|ETH|SOL|HYPE|PURR|DOGE|XRP|AVAX|ARB|OP|BNB|ENA|WIF|FET|TAO)\b/i)?.[1];
  return normalizeAsset(common);
}

function extractNumberAfter(message: string, label: RegExp): number | null {
  const match = message.match(new RegExp(label.source + "\\s*(?:is|=|:)?\\s*([0-9]+(?:\\.[0-9]+)?)", "i"));
  return numberOrNull(match?.at(-1));
}

function extractNumberBeforeAsset(message: string, asset: string | null): number | null {
  if (!asset) return null;
  const match = message.match(new RegExp("\\b([0-9]+(?:\\.[0-9]+)?)\\s*" + asset + "\\b", "i"));
  return numberOrNull(match?.[1]);
}

function formatNumber(value: number): string {
  return value >= 1000 ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(value);
}
