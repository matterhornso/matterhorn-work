/**
 * Polymarket read and preview tools.
 *
 * This Matterhorn Polymarket slice prepares public, reviewable order terms for
 * a browser wallet. It never accepts API secrets, private keys, signatures, or
 * signed payloads. Wallet authorization and CLOB submission stay in the client
 * runtime. Prediction-market prices are treated as risk-bearing information,
 * never as betting or investment advice.
 *
 * Compliance: a geoblock check runs before any order preview. When the user's
 * region is blocked, the preview is returned as `blocked_by_compliance` with no
 * executable price/size. Research and orderbook reads work regardless.
 */

import { createHash } from "node:crypto";
import { parseUnits } from "viem";

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
const FORBIDDEN_CREDENTIAL_VALUE_RE =
  /\b(seed phrase|mnemonic|private key|api secret|raw signature|signed payload|wallet export)\b\s*(?:is|=|:|=>|to sign|for signing)?\s*["'`<]?[A-Za-z0-9_+=/@:.-]{8,}/i;
const FORBIDDEN_CREDENTIAL_COMMAND_RE =
  /\b(?:use|sign with|submit with|authenticate with|broadcast with)\b.{0,80}\b(seed phrase|mnemonic|private key|api secret|raw signature|signed payload|wallet export)\b/i;

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

export interface PolymarketMarketContextSnapshot {
  version: "matterhorn.polymarket.market-context.v1";
  marketId: string;
  marketLabel: string;
  active: boolean;
  closed: boolean;
  outcomes: Array<{ outcome: string; probability: number | null; tokenId: string | null }>;
  liquidityUsd: number | null;
  volumeUsd: number | null;
  compliance: PolymarketComplianceStatus;
  previewAvailability: "available" | "blocked_by_compliance" | "market_closed";
  publicReceiptHistory: "not_configured";
  source: PolymarketSource;
  warnings: string[];
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
  /** Public CLOB outcome token id. Required by the user's wallet at submit time. */
  tokenId: string | null;
  marketLabel: string | null;
  outcome: string | null;
  side: PolymarketSide | null;
  /** USDC notional */
  size: number | null;
  sizeAsset: "USDC";
  /** expected average fill price as a probability (0..1) */
  price: number | null;
  priceAsset: "probability";
  /** Maximum slippage percentage requested by the user. */
  slippageTolerance: number | null;
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

export interface PolymarketSellMarketabilityEstimate {
  referencePrice: number | null;
  estimatedFillPrice: number | null;
  estimatedSlippagePct: number | null;
  requestedShares: number;
  estimatedProceedsUsdc: number | null;
  depthSufficient: boolean | null;
  note: string;
}

export interface PolymarketSellPreview {
  version: "matterhorn.polymarket.sell-preview.v1";
  venue: "polymarket";
  action: "sell_shares";
  marketId: string;
  tokenId: string;
  marketLabel: string;
  outcome: string;
  shares: number;
  estimatedFillPrice: number | null;
  estimatedProceedsUsdc: number | null;
  slippageTolerance: number | null;
  marketability: PolymarketSellMarketabilityEstimate;
  expiresAt: string;
  previewSha256: string;
  compliance: PolymarketComplianceStatus;
  source: PolymarketSource;
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
  /**
   * EIP-712 order typed-data template, present only when an exchange address is
   * configured (POLYMARKET_EXCHANGE_ADDRESS). Always requiresClientValidation.
   */
  signingPayload: PolymarketOrderTypedData | null;
  expiresAt: string;
  compliance: PolymarketComplianceStatus;
  warnings: string[];
  canSubmit: false;
  externalSignerOnly: true;
}

export interface PolymarketExternalSignRequest {
  version: "matterhorn.market.external-sign-request.v1";
  venue: "polymarket";
  routeName: "polymarket.orders.sign_request";
  executionMode: "testnet_external_signer";
  network: "testnet";
  action: "place_order";
  marketId: string;
  marketLabel: string;
  outcome: string;
  previewSha256: string;
  handoffSha256: string;
  unsignedPayloadSha256: string;
  signRequestSha256: string;
  signingPayload: PolymarketOrderTypedData | null;
  signingInstructions: string;
  readyToSign: boolean;
  signedArtifactAccepted: false;
  submitSignedAllowedByContract: false;
  canSubmit: false;
  liveSubmissionEnabled: false;
  externalSignerOnly: true;
  operatorConfirmation: string;
  createdAt: string;
  expiresAt: string;
  compliance: PolymarketComplianceStatus;
  warnings: string[];
}

export interface PolymarketRedactedSignedArtifactEnvelope {
  version: "matterhorn.market.redacted-signed-artifact-envelope.v1";
  venue: "polymarket";
  routeName: "polymarket.orders.sign_request";
  validationMode: "public_redacted_metadata";
  executionMode: "testnet_external_signer";
  network: string;
  action: "place_order";
  signRequestSha256: string;
  previewSha256: string;
  handoffSha256: string;
  unsignedPayloadSha256: string;
  signedArtifactPublicHash: string;
  signedArtifactRedacted: true;
  signerAddress?: string | null;
  artifactKind?: "clob_order" | "exchange_order" | "unknown";
  producedAt?: string | null;
  source?: PolymarketSource | null;
  canSubmit: false;
  liveSubmissionEnabled: false;
  warnings?: string[];
}

export interface PolymarketArtifactValidationResult {
  version: "matterhorn.market.artifact-validation.v1";
  venue: "polymarket";
  status: "accepted_public_metadata" | "rejected";
  validationMode: "public_redacted_metadata";
  matchesSignRequest: boolean;
  signRequestSha256: string;
  signedArtifactPublicHash: string | null;
  signedArtifactRedacted: boolean;
  redactedMetadataAccepted: boolean;
  signedArtifactAccepted: false;
  submitSignedAllowedByContract: false;
  canSubmit: false;
  liveSubmissionEnabled: false;
  publicAuditReceiptCandidate: PolymarketReceipt | null;
  errors: string[];
  warnings: string[];
}

/**
 * EIP-712 typed-data TEMPLATE for a Polymarket CLOB order. Matterhorn fills only
 * the economic terms it can know (token, amounts, side). The user's wallet/client
 * fills `walletMustSet` fields (maker, signer, salt, nonce, expiration) and
 * produces the signature. No final digest is emitted because Matterhorn does not
 * know those wallet-supplied values — and it never holds a key.
 *
 * `requiresClientValidation` is always true: validate the domain, contract
 * address, types, and amount rounding against Polymarket's official CLOB client
 * (and on testnet) before signing with real funds.
 */
export interface PolymarketOrderTypedData {
  standard: "eip712";
  requiresClientValidation: true;
  domain: { name: string; version: string; chainId: number; verifyingContract: string };
  primaryType: "Order";
  types: Record<string, Array<{ name: string; type: string }>>;
  message: {
    salt: string;
    maker: string;
    signer: string;
    taker: string;
    tokenId: string;
    makerAmount: string;
    takerAmount: string;
    expiration: string;
    nonce: string;
    feeRateBps: string;
    side: number;
    signatureType: number;
  };
  walletMustSet: string[];
  notes: string[];
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
  id: string;
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

export interface PolymarketWatchObservation {
  label: string;
  value: number | string | null;
  unit: string | null;
  source: string;
}

export interface PolymarketWatchCheckResult {
  version: "matterhorn.polymarket.watch-check.v1";
  watchId: string;
  marketId: string;
  status: "ok" | "triggered" | "degraded";
  checkedAt: string;
  observations: PolymarketWatchObservation[];
  alerts: string[];
  source: PolymarketSource;
  warnings: string[];
}

export interface PolymarketWatchDigest {
  version: "matterhorn.polymarket.watch-digest.v1";
  venue: "polymarket";
  checkedAt: string;
  watchCount: number;
  triggeredCount: number;
  degradedCount: number;
  summaries: string[];
  checks: PolymarketWatchCheckResult[];
  safety: {
    nonCustodial: true;
    liveSubmissionEnabled: false;
    canSubmit: false;
  };
}

export type PolymarketChatCard =
  | { kind: "polymarket_market_list"; title: string; markets: PolymarketMarketSummary[]; warnings: string[] }
  | { kind: "polymarket_event_list"; title: string; events: PolymarketEventSummary[]; warnings: string[] }
  | { kind: "polymarket_market_detail"; title: string; market: PolymarketMarketSummary; warnings: string[] }
  | { kind: "polymarket_market_context"; title: string; context: PolymarketMarketContextSnapshot; warnings: string[] }
  | { kind: "polymarket_orderbook"; title: string; orderbook: PolymarketOrderbook; warnings: string[] }
  | { kind: "polymarket_compliance"; title: string; compliance: PolymarketComplianceStatus; warnings: string[] }
  | { kind: "polymarket_watch"; title: string; watch: PolymarketWatchDescriptor; check?: PolymarketWatchCheckResult; warnings: string[] }
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
    if (typeof current === "string") {
      const sample = current.length > 4096 ? current.slice(0, 4096) : current;
      if (FORBIDDEN_CREDENTIAL_VALUE_RE.test(sample) || FORBIDDEN_CREDENTIAL_COMMAND_RE.test(sample)) {
        return node.path.length ? node.path.join(".") : "input";
      }
      continue;
    }
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
  private readonly configuredGammaBaseUrl?: string;
  private readonly configuredClobBaseUrl?: string;
  private readonly configuredGeoblockUrl?: string;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: { gammaBaseUrl?: string; clobBaseUrl?: string; geoblockUrl?: string; fetcher?: Fetcher; timeoutMs?: number } = {}) {
    this.configuredGammaBaseUrl = options.gammaBaseUrl;
    this.configuredClobBaseUrl = options.clobBaseUrl;
    this.configuredGeoblockUrl = options.geoblockUrl;
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
    return (terms.length === 0 ? markets : matched).slice(0, capped);
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
    const cacheKey = key + ":" + url;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.getJson(url);
    this.cache.set(cacheKey, { expiresAt: Date.now() + POLYMARKET_CACHE_MS, value });
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

  private get gammaBaseUrl(): string {
    return (this.configuredGammaBaseUrl ?? process.env.POLYMARKET_GAMMA_URL ?? GAMMA_BASE_URL).replace(/\/+$/, "");
  }

  private get clobBaseUrl(): string {
    return (this.configuredClobBaseUrl ?? process.env.POLYMARKET_CLOB_URL ?? CLOB_BASE_URL).replace(/\/+$/, "");
  }

  private get geoblockUrl(): string {
    return this.configuredGeoblockUrl ?? process.env.POLYMARKET_GEOBLOCK_URL ?? GEOBLOCK_URL;
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
  if (/\b(explain|detail|details|describe|summarize|summary|resolve|resolution|about this market)\b/.test(message)) return "market";
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
    tokenId: null,
    marketLabel: args.market?.question ?? null,
    outcome: args.outcome,
    side: args.side,
    size: null,
    sizeAsset: "USDC",
    price: null,
    priceAsset: "probability",
    slippageTolerance: null,
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
    "Review required: a connected EVM wallet must authorize the exact order before submission.",
    "Wallet authorization and CLOB API credentials stay in browser memory and are never accepted or stored by the Matterhorn backend.",
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
    slippageTolerance,
  });

  return {
    version: "matterhorn.market.action-preview.v1",
    venue: "polymarket",
    intent: "order_preview",
    signerPolicy: "api_wallet_required",
    execution: "unsigned_preview",
    action: "buy_shares",
    marketId: market.id,
    tokenId,
    marketLabel: market.question,
    outcome,
    side,
    size: amountUsdc,
    sizeAsset: "USDC",
    price,
    priceAsset: "probability",
    slippageTolerance,
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
      "Submitting requires a separate connected-wallet review.",
    confirmationText: "I reviewed the exact market, outcome, amount, estimated fill, and maximum loss. My connected wallet must authorize submission.",
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

  const createdAt = new Date().toISOString();
  return {
    version: "matterhorn.polymarket.watch.v1",
    id: "pmw_" + sha256({ marketId: market.id, createdAt }).slice(0, 16),
    marketId: market.id,
    marketLabel: market.question,
    endDate: market.endDate,
    resolvesInDays,
    conditions,
    createdAt,
    source: market.source,
    warnings,
    note: "Read-only watch. Matterhorn surfaces odds moves and a resolution reminder; it never places or auto-executes orders.",
  };
}

export async function checkPolymarketWatchDescriptor(
  watch: PolymarketWatchDescriptor,
  provider: PolymarketProvider = polymarketProvider,
): Promise<PolymarketWatchCheckResult> {
  const observations: PolymarketWatchObservation[] = [];
  const warnings = [...watch.warnings];
  const alerts: string[] = [];
  let source = watch.source;
  try {
    const [market, compliance] = await Promise.all([
      provider.getMarket(watch.marketId),
      provider.checkCompliance().catch(() => null),
    ]);
    source = market.source;
    observations.push(
      { label: "Market active", value: market.active ? "yes" : "no", unit: null, source: market.source.source },
      { label: "Market closed", value: market.closed ? "yes" : "no", unit: null, source: market.source.source },
      { label: "Liquidity", value: market.liquidity, unit: "USD", source: market.source.source },
      { label: "Volume", value: market.volume, unit: "USD", source: market.source.source },
    );
    if (!market.active || market.closed) alerts.push("Market is inactive or closed.");
    if (compliance?.status === "blocked") alerts.push("Polymarket compliance is currently blocked for this environment.");
    for (const condition of watch.conditions) {
      const current = market.outcomePrices[condition.outcome] ?? null;
      observations.push({
        label: condition.outcome + " probability",
        value: current,
        unit: "probability",
        source: market.source.source,
      });
      if (current !== null && condition.upperThreshold !== null && current >= condition.upperThreshold) {
        alerts.push(condition.outcome + " probability rose above " + formatProbability(condition.upperThreshold) + ".");
      }
      if (current !== null && condition.lowerThreshold !== null && current <= condition.lowerThreshold) {
        alerts.push(condition.outcome + " probability fell below " + formatProbability(condition.lowerThreshold) + ".");
      }
    }
    warnings.push(...market.source.warnings);
  } catch (err) {
    return {
      version: "matterhorn.polymarket.watch-check.v1",
      watchId: watch.id,
      marketId: watch.marketId,
      status: "degraded",
      checkedAt: new Date().toISOString(),
      observations,
      alerts: [],
      source,
      warnings: [...warnings, err instanceof Error ? err.message : String(err)],
    };
  }
  return {
    version: "matterhorn.polymarket.watch-check.v1",
    watchId: watch.id,
    marketId: watch.marketId,
    status: alerts.length > 0 ? "triggered" : "ok",
    checkedAt: new Date().toISOString(),
    observations,
    alerts,
    source,
    warnings: Array.from(new Set(warnings)),
  };
}

export function buildPolymarketWatchDigest(checks: PolymarketWatchCheckResult[]): PolymarketWatchDigest {
  return {
    version: "matterhorn.polymarket.watch-digest.v1",
    venue: "polymarket",
    checkedAt: new Date().toISOString(),
    watchCount: checks.length,
    triggeredCount: checks.filter((check) => check.status === "triggered").length,
    degradedCount: checks.filter((check) => check.status === "degraded").length,
    summaries: checks.map((check) => check.status + ": " + check.watchId + (check.alerts.length ? " - " + check.alerts.join("; ") : "")),
    checks,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      canSubmit: false,
    },
  };
}

export function buildPolymarketMarketContextSnapshot(
  market: PolymarketMarketSummary,
  compliance: PolymarketComplianceStatus,
): PolymarketMarketContextSnapshot {
  const warnings: string[] = [];
  if (!market.active || market.closed) warnings.push("Market is inactive or closed; preview is unavailable.");
  if (compliance.status === "blocked") warnings.push("Compliance blocks order preview terms for this region.");
  if (market.liquidity !== null && market.liquidity < THIN_LIQUIDITY_USD) warnings.push("Thin liquidity may make preview fills unreliable.");
  const previewAvailability = !market.active || market.closed
    ? "market_closed"
    : compliance.status === "blocked"
      ? "blocked_by_compliance"
      : "available";
  return {
    version: "matterhorn.polymarket.market-context.v1",
    marketId: market.id,
    marketLabel: market.question,
    active: market.active,
    closed: market.closed,
    outcomes: market.outcomes.map((outcome) => ({
      outcome,
      probability: market.outcomePrices[outcome] ?? null,
      tokenId: market.tokenIds[outcome] ?? null,
    })),
    liquidityUsd: market.liquidity,
    volumeUsd: market.volume,
    compliance,
    previewAvailability,
    publicReceiptHistory: "not_configured",
    source: market.source,
    warnings,
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

/** Walk bids from best to worst to estimate USDC proceeds for a share sale. */
export function estimatePolymarketSellFill(bids: PolymarketBookLevel[], shares: number): PolymarketSellMarketabilityEstimate {
  const sorted = [...bids].sort((a, b) => b.price - a.price);
  if (sorted.length === 0) {
    return {
      referencePrice: null,
      estimatedFillPrice: null,
      estimatedSlippagePct: null,
      requestedShares: shares,
      estimatedProceedsUsdc: null,
      depthSufficient: null,
      note: "No bid-side liquidity; sale proceeds could not be estimated.",
    };
  }
  const reference = sorted[0].price;
  let remaining = shares;
  let sold = 0;
  let proceeds = 0;
  for (const level of sorted) {
    if (remaining <= 0) break;
    const takeShares = Math.min(level.size, remaining);
    sold += takeShares;
    proceeds += takeShares * level.price;
    remaining -= takeShares;
  }
  const averagePrice = sold > 0 ? proceeds / sold : null;
  const slippagePct = averagePrice !== null && reference > 0
    ? Math.abs((reference - averagePrice) / reference) * 100
    : null;
  const depthSufficient = remaining <= 1e-9;
  return {
    referencePrice: reference,
    estimatedFillPrice: averagePrice === null ? null : Number(averagePrice.toFixed(6)),
    estimatedSlippagePct: slippagePct === null ? null : Number(slippagePct.toFixed(4)),
    requestedShares: shares,
    estimatedProceedsUsdc: Number(proceeds.toFixed(4)),
    depthSufficient,
    note: depthSufficient
      ? "Estimated from visible bid levels; live fills may differ."
      : "Visible bids cover only part of the requested shares; the order may fill partially.",
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
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** EIP-712 type layout for a Polymarket CTF Exchange order. Validate against the official client. */
const POLYMARKET_ORDER_EIP712_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
};

export interface PolymarketExchangeConfig {
  chainId: number;
  verifyingContract: string;
  domainName?: string;
  domainVersion?: string;
}

/** Read the exchange config from env. Returns null when unconfigured (typed-data is then omitted). */
export function readPolymarketExchangeConfig(): PolymarketExchangeConfig | null {
  const verifyingContract = process.env.POLYMARKET_EXCHANGE_ADDRESS;
  if (!verifyingContract || !/^0x[a-fA-F0-9]{40}$/.test(verifyingContract)) return null;
  const chainId = Number(process.env.POLYMARKET_CHAIN_ID ?? POLYGON_CHAIN_ID);
  return {
    chainId: Number.isFinite(chainId) ? chainId : POLYGON_CHAIN_ID,
    verifyingContract,
    domainName: process.env.POLYMARKET_EXCHANGE_DOMAIN_NAME ?? "Polymarket CTF Exchange",
    domainVersion: process.env.POLYMARKET_EXCHANGE_DOMAIN_VERSION ?? "1",
  };
}

function toBaseUnits6(value: number): string {
  // Polymarket USDC and outcome shares both use 6 decimals.
  return parseUnits(value.toFixed(6), 6).toString();
}

/**
 * Build the EIP-712 order typed-data TEMPLATE. Matterhorn fills the economic
 * terms only; the wallet/client fills maker/signer/salt/nonce/expiration and
 * signs. No final digest is emitted (Matterhorn does not know those values).
 * Always requiresClientValidation — confirm against Polymarket's CLOB client.
 */
export function buildPolymarketOrderTypedData(args: {
  tokenId: string;
  amountUsdc: number;
  price: number | null;
  side: PolymarketSide;
  exchange: PolymarketExchangeConfig;
}): PolymarketOrderTypedData {
  const { tokenId, amountUsdc, price, exchange } = args;
  const shares = price !== null && price > 0 ? amountUsdc / price : 0;
  return {
    standard: "eip712",
    requiresClientValidation: true,
    domain: {
      name: exchange.domainName ?? "Polymarket CTF Exchange",
      version: exchange.domainVersion ?? "1",
      chainId: exchange.chainId,
      verifyingContract: exchange.verifyingContract,
    },
    primaryType: "Order",
    types: POLYMARKET_ORDER_EIP712_TYPES,
    message: {
      salt: "0",
      maker: ZERO_ADDRESS,
      signer: ZERO_ADDRESS,
      taker: ZERO_ADDRESS,
      tokenId,
      makerAmount: toBaseUnits6(amountUsdc),
      takerAmount: toBaseUnits6(shares),
      expiration: "0",
      nonce: "0",
      feeRateBps: "0",
      // buy_shares previews are always a BUY of the chosen outcome token; side=0=BUY. (yes/no selects the token, not the direction.)
      side: 0,
      signatureType: 0, // EOA
    },
    walletMustSet: ["maker", "signer", "salt", "nonce", "expiration"],
    notes: [
      "TEMPLATE ONLY — validate the domain, verifyingContract, types, and amount rounding against Polymarket's official CLOB client (@polymarket/clob-client) and on testnet before signing real funds.",
      "Your wallet/client must set maker, signer, salt, nonce, and expiration; Matterhorn cannot and does not know them.",
      "makerAmount/takerAmount use 6 decimals and are derived from the estimated fill price; the official client applies exact tick/rounding rules.",
    ],
  };
}

/**
 * Build an external-signer handoff from an unsigned order preview. Throws if the
 * preview is blocked by compliance or is not an unsigned preview. The returned
 * packet contains only public order terms — no keys, secrets, or signatures.
 *
 * When `options.tokenId` and an exchange config are present, an EIP-712 order
 * typed-data template is attached (still requiresClientValidation, still
 * canSubmit:false).
 */
export function buildPolymarketSigningHandoff(
  preview: PolymarketActionPreview,
  options: { tokenId?: string | null; exchange?: PolymarketExchangeConfig | null } = {},
): PolymarketSigningHandoff {
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

  const tokenId = options.tokenId ?? null;
  const warnings = [
    "External signer required: sign and submit this with your OWN wallet. Matterhorn does not sign, submit, or hold keys.",
    "Do not send the signature or any signed payload back to Matterhorn; only a public receipt can be imported.",
    RISK_DISCLAIMER,
  ];
  let signingPayload: PolymarketOrderTypedData | null = null;
  if (tokenId && options.exchange) {
    signingPayload = buildPolymarketOrderTypedData({ tokenId, amountUsdc: preview.size, price: preview.price, side: preview.side, exchange: options.exchange });
    warnings.push("EIP-712 order typed-data is a TEMPLATE requiring validation against Polymarket's official CLOB client before signing real funds.");
  } else {
    warnings.push("No EIP-712 typed-data attached; set POLYMARKET_EXCHANGE_ADDRESS (a validated exchange address) to include it.");
  }

  const order = {
    tokenId,
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
      chainId: options.exchange?.chainId ?? POLYGON_CHAIN_ID,
      venue: "polymarket-clob",
      instructions:
        "Sign this order with your own wallet via Polymarket's official CLOB client (EIP-712 order on Polygon). " +
        "Matterhorn provides the economic terms only and never produces the signature, the API key, or the submission.",
    },
    previewSha256: preview.previewSha256,
    handoffSha256: sha256(core),
    signingPayload,
    expiresAt: new Date(Date.now() + HANDOFF_TTL_MS).toISOString(),
    compliance: preview.compliance,
    warnings,
    canSubmit: false,
    externalSignerOnly: true,
  };
}

export function buildPolymarketExternalSignRequest(
  handoff: PolymarketSigningHandoff,
  options: { executionMode?: string | null } = {},
): PolymarketExternalSignRequest {
  if (options.executionMode !== "testnet_external_signer") {
    throw new Error("executionMode=testnet_external_signer is required to create a Polymarket external sign request.");
  }
  const forbidden = findForbiddenPolymarketCredentialInput({
    marketId: handoff.marketId,
    outcome: handoff.outcome,
    side: handoff.side,
    sizeUsdc: handoff.sizeUsdc,
    price: handoff.price,
    previewSha256: handoff.previewSha256,
    handoffSha256: handoff.handoffSha256,
  });
  if (forbidden) throw new Error("Handoff unexpectedly contained credential-shaped data at " + forbidden);
  const createdAt = new Date().toISOString();
  const unsignedPayload = handoff.signingPayload ?? handoff.order;
  const unsignedPayloadSha256 = sha256(unsignedPayload);
  const readyToSign = Boolean(handoff.signingPayload);
  const warnings = [
    ...handoff.warnings,
    "Phase 1 sign request only: Matterhorn creates a hash-bound request for an external signer, but does not accept signed artifacts and does not submit.",
    readyToSign
      ? "Validate the Polymarket typed data with the official CLOB client on testnet before signing."
      : "No EIP-712 typed-data is attached; configure a validated Polymarket exchange address and rebuild before signing.",
  ];
  const core = {
    version: "matterhorn.market.external-sign-request.v1",
    venue: "polymarket",
    routeName: "polymarket.orders.sign_request",
    executionMode: "testnet_external_signer",
    network: "testnet",
    previewSha256: handoff.previewSha256,
    handoffSha256: handoff.handoffSha256,
    unsignedPayloadSha256,
    createdAt,
    expiresAt: handoff.expiresAt,
  } as const;
  return {
    ...core,
    action: "place_order",
    marketId: handoff.marketId,
    marketLabel: handoff.marketLabel,
    outcome: handoff.outcome,
    signingPayload: handoff.signingPayload,
    signingInstructions:
      "Use your own Polymarket testnet/client flow to inspect and sign this unsigned order template. " +
      "Do not paste the signature, signed order, L2 API secret, or passphrase back into Matterhorn in Phase 1.",
    readyToSign,
    signedArtifactAccepted: false,
    submitSignedAllowedByContract: false,
    canSubmit: false,
    liveSubmissionEnabled: false,
    externalSignerOnly: true,
    operatorConfirmation: "I understand this is an external testnet sign request only. Matterhorn will not sign, accept the signature, store CLOB credentials, or submit.",
    signRequestSha256: sha256(core),
    compliance: handoff.compliance,
    warnings,
  };
}

function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function findRawPolymarketArtifactMaterial(value: unknown, rootPath: string[] = []): string | null {
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
    if (typeof current === "string") {
      const trimmed = current.trim();
      if (/^0x[a-fA-F0-9]{128,}$/.test(trimmed)) return node.path.length ? node.path.join(".") : "input";
      if (/"(?:signature|signedPayload|signedOrder|exchangePayload)"\s*:/i.test(trimmed)) {
        return node.path.length ? node.path.join(".") : "input";
      }
      continue;
    }
    if (Array.isArray(current)) {
      current.forEach((child, index) => stack.push({ value: child, path: [...node.path, String(index)], depth: node.depth + 1 }));
      continue;
    }
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (/^(signature|rawSignature|signedPayload|signedOrder|signedAction|exchangePayload)$/i.test(key)) {
        return [...node.path, key].join(".");
      }
      stack.push({ value: child, path: [...node.path, key], depth: node.depth + 1 });
    }
  }
  return null;
}

export function validatePolymarketRedactedArtifactEnvelope(
  signRequest: PolymarketExternalSignRequest,
  artifact: PolymarketRedactedSignedArtifactEnvelope,
): PolymarketArtifactValidationResult {
  const errors: string[] = [];
  const warnings = [
    "Validation-only Phase 2: Matterhorn accepts public/redacted metadata only and does not submit.",
    ...signRequest.warnings,
    ...(artifact.warnings ?? []),
  ];

  const { unsignedPayloadSha256: artifactUnsignedPayloadSha256, ...artifactForSecretScan } = artifact;
  const forbiddenCredentialPath = findForbiddenPolymarketCredentialInput({
    artifact: { ...artifactForSecretScan, payloadHash: artifactUnsignedPayloadSha256 },
    signRequest: {
      venue: signRequest.venue,
      routeName: signRequest.routeName,
      executionMode: signRequest.executionMode,
      network: signRequest.network,
      action: signRequest.action,
      signRequestSha256: signRequest.signRequestSha256,
      previewSha256: signRequest.previewSha256,
      handoffSha256: signRequest.handoffSha256,
      payloadHash: signRequest.unsignedPayloadSha256,
    },
  });
  if (forbiddenCredentialPath) errors.push(`Credential-shaped field rejected at ${forbiddenCredentialPath}.`);
  const rawArtifactPath = findRawPolymarketArtifactMaterial(artifact);
  if (rawArtifactPath) errors.push(`Raw signed artifact material rejected at ${rawArtifactPath}.`);

  if (signRequest.version !== "matterhorn.market.external-sign-request.v1") errors.push("Invalid sign-request version.");
  if (artifact.version !== "matterhorn.market.redacted-signed-artifact-envelope.v1") errors.push("Invalid artifact envelope version.");
  if (signRequest.venue !== "polymarket" || artifact.venue !== "polymarket") errors.push("Venue must be polymarket.");
  if (artifact.validationMode !== "public_redacted_metadata") errors.push("Artifact validationMode must be public_redacted_metadata.");
  if (signRequest.executionMode !== "testnet_external_signer" || artifact.executionMode !== "testnet_external_signer") {
    errors.push("Only executionMode=testnet_external_signer is accepted in Phase 2.");
  }
  if (artifact.signedArtifactRedacted !== true) errors.push("signedArtifactRedacted must be true.");
  if (artifact.canSubmit !== false || artifact.liveSubmissionEnabled !== false) {
    errors.push("Artifact metadata must keep canSubmit=false and liveSubmissionEnabled=false.");
  }
  if (!isSha256Hex(artifact.signedArtifactPublicHash)) errors.push("signedArtifactPublicHash must be a 64-character SHA-256 hash.");

  for (const field of ["signRequestSha256", "previewSha256", "handoffSha256", "unsignedPayloadSha256", "network", "action", "routeName"] as const) {
    if (artifact[field] !== signRequest[field]) errors.push(`Artifact ${field} does not match the sign request.`);
  }

  const expiresAtMs = Date.parse(signRequest.expiresAt);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) errors.push("Sign request is expired.");
  if (artifact.producedAt) {
    const producedAtMs = Date.parse(artifact.producedAt);
    if (!Number.isFinite(producedAtMs)) errors.push("producedAt must be an ISO timestamp when provided.");
    else if (Number.isFinite(expiresAtMs) && producedAtMs > expiresAtMs) errors.push("Artifact was produced after the sign request expired.");
  }

  const ok = errors.length === 0;
  const receipt: PolymarketReceipt | null = ok
    ? {
        version: "matterhorn.market.receipt.v1",
        venue: "polymarket",
        status: "received",
        action: "buy_shares",
        previewSha256: signRequest.previewSha256,
        handoffSha256: signRequest.handoffSha256,
        orderId: null,
        txHash: null,
        marketId: signRequest.marketId,
        outcome: signRequest.outcome,
        side: null,
        submittedAt: null,
        warnings: [
          "Public audit receipt candidate only. It proves redacted metadata matched the sign request; it is not exchange submission evidence.",
          `signedArtifactPublicHash=${artifact.signedArtifactPublicHash}`,
          ...(artifact.signerAddress ? [`signerAddress=${artifact.signerAddress}`] : []),
        ],
      }
    : null;

  return {
    version: "matterhorn.market.artifact-validation.v1",
    venue: "polymarket",
    status: ok ? "accepted_public_metadata" : "rejected",
    validationMode: "public_redacted_metadata",
    matchesSignRequest: ok,
    signRequestSha256: signRequest.signRequestSha256,
    signedArtifactPublicHash: typeof artifact.signedArtifactPublicHash === "string" ? artifact.signedArtifactPublicHash : null,
    signedArtifactRedacted: artifact.signedArtifactRedacted === true,
    redactedMetadataAccepted: ok,
    signedArtifactAccepted: false,
    submitSignedAllowedByContract: false,
    canSubmit: false,
    liveSubmissionEnabled: false,
    publicAuditReceiptCandidate: receipt,
    errors,
    warnings,
  };
}

/**
 * Resolve a market, run the compliance gate, build the preview, and (when an
 * exchange address is configured) attach the EIP-712 typed-data — in one pass.
 */
export async function preparePolymarketHandoffFromRequest(
  input: { marketId: string; outcome?: string | null; side?: PolymarketSide | null; amountUsdc: number; slippageTolerance?: number | null },
  provider: PolymarketProvider = polymarketProvider,
  exchange: PolymarketExchangeConfig | null = readPolymarketExchangeConfig(),
): Promise<{ preview: PolymarketActionPreview; handoff: PolymarketSigningHandoff | null; blocked: boolean }> {
  if (!input.marketId) throw new Error("marketId is required for a Polymarket signing handoff");
  if (!(input.amountUsdc > 0)) throw new Error("a positive amountUsdc is required for a Polymarket signing handoff");
  const market = await provider.getMarket(input.marketId);
  const side: PolymarketSide = input.side ?? "yes";
  const outcome = chooseOutcome(market, input.outcome ?? null, side);
  const compliance = await provider.checkCompliance();
  if (compliance.status === "blocked") {
    return { preview: buildBlockedPolymarketPreview({ market, outcome, side, compliance }), handoff: null, blocked: true };
  }
  if (!outcome || !market.tokenIds[outcome]) {
    throw new Error("outcome is required; options: " + (market.outcomes.join(", ") || "unknown"));
  }
  const preview = await preparePolymarketOrderPreview({ market, outcome, side, amountUsdc: input.amountUsdc, compliance, slippageTolerance: input.slippageTolerance ?? null }, provider);
  const handoff = buildPolymarketSigningHandoff(preview, { tokenId: market.tokenIds[outcome] ?? null, exchange });
  return { preview, handoff, blocked: false };
}

export async function preparePolymarketExternalSignRequestFromRequest(
  input: { marketId: string; outcome?: string | null; side?: PolymarketSide | null; amountUsdc: number; slippageTolerance?: number | null; executionMode?: string | null },
  provider: PolymarketProvider = polymarketProvider,
  exchange: PolymarketExchangeConfig | null = readPolymarketExchangeConfig(),
): Promise<{ preview: PolymarketActionPreview; handoff: PolymarketSigningHandoff | null; signRequest: PolymarketExternalSignRequest | null; blocked: boolean }> {
  const { preview, handoff, blocked } = await preparePolymarketHandoffFromRequest(input, provider, exchange);
  if (blocked || !handoff) return { preview, handoff, signRequest: null, blocked: true };
  const signRequest = buildPolymarketExternalSignRequest(handoff, { executionMode: input.executionMode });
  return { preview, handoff, signRequest, blocked: false };
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

/** Customer-facing read-only provider failure. Never echoes secrets or submits anything. */
function polymarketProviderUnavailable(intent: PolymarketIntent, err: unknown): PolymarketChatExecutionResult {
  const detail = err instanceof Error ? err.message : String(err);
  return {
    venue: "polymarket",
    intent,
    execution: "unsupported",
    responseText:
      "Polymarket data is temporarily unavailable, so I could not complete this read-only request. " +
      "Nothing was submitted or signed. Please try again shortly; if it persists, check the provider or network configuration.",
    cards: [],
    data: { providerUnavailable: true },
    warnings: ["provider_unavailable: " + detail],
  };
}

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
  try {

  if (intent === "learn") {
    return {
      venue: "polymarket",
      intent,
      execution: "answered",
      responseText:
        "I can search prediction markets, explain odds and liquidity, inspect the CLOB orderbook, check compliance, and prepare exact order terms. The agent draft cannot submit. Eligible buy, sell, and cancel actions continue in the separate Polymarket ticket for exact review and connected Polygon-wallet authorization. Proxy accounts, agents, and watches cannot submit. I never ask for API secrets or wallet keys. " + RISK_DISCLAIMER,
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
    const compliance = await provider.checkCompliance();
    const context = buildPolymarketMarketContextSnapshot(market, compliance);
    const lines = market.outcomes.map((outcome) => "- " + outcome + ": " + formatProbability(market.outcomePrices[outcome] ?? null));
    return {
      venue: "polymarket",
      intent,
      execution: "read_only",
      responseText:
        "\"" + market.question + "\"\n" +
        (market.description ? market.description + "\n" : "") +
        "Implied probabilities:\n" + lines.join("\n") + "\n" +
        "Liquidity: " + (market.liquidity === null ? "unknown" : market.liquidity)
        + ", volume: " + (market.volume === null ? "unknown" : market.volume)
        + ", compliance: " + compliance.status
        + ", preview availability: " + context.previewAvailability + ". " + RISK_DISCLAIMER,
      cards: [buildPolymarketMarketDetailCard(market), buildPolymarketMarketContextCard(context)],
      data: { market, context, compliance },
      compliance,
      warnings: context.warnings,
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
    const check = await checkPolymarketWatchDescriptor(watch, provider);
    return {
      venue: "polymarket",
      intent: "monitor",
      execution: "read_only",
      responseText:
        "Read-only watch for \"" + market.question + "\". Suggested alerts:\n" +
        watch.conditions.map((c) => "- " + c.outcome + " (now " + formatProbability(c.currentProbability) + "): " + c.note).join("\n") + "\n" +
        "Current status: " + check.status + (check.alerts.length ? " (" + check.alerts.join("; ") + ")" : "") + ". " +
        "Matterhorn will not place or auto-execute any order from this watch. " + RISK_DISCLAIMER,
      cards: [buildPolymarketWatchCard(watch, check)],
      data: { market, watch, check },
      warnings: check.warnings,
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
  } catch (err) {
    return polymarketProviderUnavailable(intent, err);
  }
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

export function buildPolymarketMarketContextCard(context: PolymarketMarketContextSnapshot): PolymarketChatCard {
  return { kind: "polymarket_market_context", title: "Polymarket market context", context, warnings: context.warnings };
}

export function buildPolymarketOrderbookCard(orderbook: PolymarketOrderbook): PolymarketChatCard {
  return { kind: "polymarket_orderbook", title: (orderbook.outcome ?? orderbook.tokenId) + " orderbook", orderbook, warnings: orderbook.warnings };
}

export function buildPolymarketComplianceCard(compliance: PolymarketComplianceStatus): PolymarketChatCard {
  return { kind: "polymarket_compliance", title: "Polymarket compliance", compliance, warnings: [] };
}

export function buildPolymarketWatchCard(watch: PolymarketWatchDescriptor, check?: PolymarketWatchCheckResult): PolymarketChatCard {
  return {
    kind: "polymarket_watch",
    title: "Watch: " + watch.marketLabel,
    watch,
    check,
    warnings: check?.warnings ?? watch.warnings,
  };
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

export async function preparePolymarketSellPreviewFromRequest(
  input: { marketId: string; outcome?: string | null; side?: PolymarketSide | null; shares: number; slippageTolerance?: number | null },
  provider: PolymarketProvider = polymarketProvider,
): Promise<PolymarketSellPreview> {
  if (!input.marketId) throw new Error("marketId is required for a Polymarket sell preview");
  if (!(input.shares > 0)) throw new Error("a positive share quantity is required for a Polymarket sell preview");
  const market = await provider.getMarket(input.marketId);
  if (!market.active || market.closed) throw new Error("This Polymarket market is not active.");
  const side: PolymarketSide = input.side ?? "yes";
  const outcome = chooseOutcome(market, input.outcome ?? null, side);
  if (!outcome || !market.tokenIds[outcome]) {
    throw new Error("outcome is required; options: " + (market.outcomes.join(", ") || "unknown"));
  }
  const compliance = await provider.checkCompliance();
  if (compliance.status !== "allowed") {
    throw new Error(compliance.reason || "Polymarket trading is unavailable in this region.");
  }
  const tokenId = market.tokenIds[outcome];
  const orderbook = await provider.getOrderbook(tokenId, { marketId: market.id, outcome });
  const marketability = estimatePolymarketSellFill(orderbook.bids, input.shares);
  const slippageTolerance = numberOrNull(input.slippageTolerance);
  const warnings = [
    "Review required: a connected EVM wallet must authorize the exact sale before submission.",
    "Wallet authorization and CLOB API credentials stay in browser memory and are never accepted or stored by the Matterhorn backend.",
    RISK_DISCLAIMER,
  ];
  if (marketability.depthSufficient === false) {
    warnings.push("Visible bid depth is insufficient to sell the full quantity; a fill-and-kill order may only fill part of it.");
  }
  if (
    slippageTolerance !== null
    && marketability.estimatedSlippagePct !== null
    && marketability.estimatedSlippagePct > slippageTolerance
  ) {
    warnings.push("Estimated slippage exceeds your selected tolerance.");
  }
  const previewSha256 = sha256({
    venue: "polymarket",
    action: "sell_shares",
    marketId: market.id,
    outcome,
    shares: input.shares,
    estimatedFillPrice: marketability.estimatedFillPrice,
    estimatedProceedsUsdc: marketability.estimatedProceedsUsdc,
    slippageTolerance,
  });
  return {
    version: "matterhorn.polymarket.sell-preview.v1",
    venue: "polymarket",
    action: "sell_shares",
    marketId: market.id,
    tokenId,
    marketLabel: market.question,
    outcome,
    shares: input.shares,
    estimatedFillPrice: marketability.estimatedFillPrice,
    estimatedProceedsUsdc: marketability.estimatedProceedsUsdc,
    slippageTolerance,
    marketability,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    previewSha256,
    compliance,
    source: market.source,
    warnings,
    canSubmit: false,
  };
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
