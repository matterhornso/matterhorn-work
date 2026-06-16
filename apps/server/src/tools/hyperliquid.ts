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

export type HyperliquidIntent = "learn" | "discover" | "account" | "positions" | "orderbook" | "order_preview";
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
  assetPositions: unknown[];
  openOrders: unknown[];
  source: HyperliquidSource;
  warnings: string[];
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
  | { kind: "hyperliquid_orderbook"; title: string; orderbook: HyperliquidOrderbook; warnings: string[] }
  | { kind: "hyperliquid_order_preview"; title: string; preview: HyperliquidActionPreview; warnings: string[] }
  | { kind: "hyperliquid_clarification"; title: string; question: string; warnings: string[] };

export interface HyperliquidProvider {
  listMarkets(limit?: number | null): Promise<HyperliquidMarketSummary[]>;
  getAccount(address: string): Promise<HyperliquidAccountSnapshot>;
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
    return {
      address,
      marginSummary: stateRecord.marginSummary && typeof stateRecord.marginSummary === "object" ? stateRecord.marginSummary as Record<string, unknown> : null,
      crossMarginSummary: stateRecord.crossMarginSummary && typeof stateRecord.crossMarginSummary === "object" ? stateRecord.crossMarginSummary as Record<string, unknown> : null,
      withdrawable: stringOrNull(stateRecord.withdrawable),
      positionCount: positions.length,
      openOrderCount: orders.length,
      assetPositions: positions,
      openOrders: orders,
      source: nowSource(),
      warnings: ["Read-only account snapshot. Use the actual master or sub-account address, not an agent wallet address."],
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
  if (/\b(order\s*book|orderbook|book|bid|ask|liquidity)\b/.test(message)) return "orderbook";
  if (/\b(position|positions|account|balance|margin|portfolio|pnl|open orders?)\b/.test(message)) return "account";
  if (/\b(buy|sell|long|short|trade|order|preview)\b/.test(message)) return "order_preview";
  if (/\b(market|markets|coin|coins|perp|perps|asset|assets|discover|list)\b/.test(message)) return "discover";
  return "learn";
}

export function extractHyperliquidOrderInput(input: HyperliquidChatExecutionInput): HyperliquidOrderPreviewInput {
  const message = input.message;
  const asset = normalizeAsset(input.asset) ?? extractAsset(message);
  const side = input.side ?? extractSide(message);
  const size = input.size ?? extractNumberAfter(message, /\b(size|amount|qty|quantity)\b/i) ?? extractNumberBeforeAsset(message, asset);
  const price = input.price ?? extractNumberAfter(message, /\b(price|at|limit)\b/i);
  return {
    asset,
    side,
    size,
    price,
    reduceOnly: input.reduceOnly ?? /\breduce[\s-]?only\b/i.test(message),
    slippageTolerance: input.slippageTolerance,
    address: input.address,
    message,
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

  let markPx: number | null = null;
  try {
    const markets = await provider.listMarkets(100);
    markPx = markets.find((market) => market.asset === asset)?.markPx ?? null;
  } catch (err) {
    warnings.push(err instanceof Error ? "Could not fetch live mark price: " + err.message : "Could not fetch live mark price.");
  }

  const price = explicitPrice ?? markPx;
  if (price === null) warnings.push("No explicit price or mark price is available; preview cannot estimate notional.");
  const actionPayload = {
    venue: "hyperliquid",
    action: "place_order",
    asset,
    side,
    size,
    price,
    reduceOnly: Boolean(input.reduceOnly),
    slippageTolerance,
    canSubmit: false,
  };
  const previewSha256 = sha256(actionPayload);
  const notionalText = price === null ? size + " " + asset : size + " " + asset + " at about " + formatNumber(price) + " USDC";
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
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
    reduceOnly: Boolean(input.reduceOnly),
    expiresAt,
    fees: [{ label: "Trading fee estimate", amount: null, asset: "USDC" }],
    consequence: "If executed outside Matterhorn, this would attempt to " + side + " " + notionalText + " on Hyperliquid.",
    confirmationText: "I understand this is preview-only in Matterhorn and requires separate Hyperliquid signing/execution outside this milestone.",
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
      responseText: "Hyperliquid account snapshot for " + input.address + ": " + account.positionCount + " positions and " + account.openOrderCount + " open orders. This is read-only public account data.",
      cards: [buildHyperliquidAccountCard(account)],
      data: { account },
      warnings: account.warnings,
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
}

export function buildHyperliquidMarketListCard(markets: HyperliquidMarketSummary[]): HyperliquidChatCard {
  return { kind: "hyperliquid_market_list", title: "Hyperliquid markets", markets, warnings: [] };
}

export function buildHyperliquidAccountCard(account: HyperliquidAccountSnapshot): HyperliquidChatCard {
  return { kind: "hyperliquid_account_snapshot", title: "Hyperliquid account", account, warnings: account.warnings };
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
  return numberOrNull(match?.[1]);
}

function extractNumberBeforeAsset(message: string, asset: string | null): number | null {
  if (!asset) return null;
  const match = message.match(new RegExp("\\b([0-9]+(?:\\.[0-9]+)?)\\s*" + asset + "\\b", "i"));
  return numberOrNull(match?.[1]);
}

function formatNumber(value: number): string {
  return value >= 1000 ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(value);
}
