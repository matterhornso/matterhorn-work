import { describe, expect, test } from "bun:test";
import {
  buildUnifiedCryptoSharedCards,
  executeUnifiedCryptoChatWorkflow,
  findForbiddenUnifiedCryptoCredentialInput,
  planUnifiedCryptoChat,
  type UnifiedCryptoSharedCard,
  type UnifiedCryptoChatResult,
} from "./crypto-chat.js";
import type {
  HyperliquidAccountSnapshot,
  HyperliquidFundingSnapshot,
  HyperliquidMarketSummary,
  HyperliquidOrderbook,
  HyperliquidProvider,
  HyperliquidSource,
} from "./hyperliquid.js";
import type {
  PolymarketComplianceStatus,
  PolymarketEventSummary,
  PolymarketMarketSummary,
  PolymarketOrderbook,
  PolymarketProvider,
  PolymarketSource,
} from "./polymarket.js";

const now = "2026-06-17T00:00:00.000Z";

function hyperSource(warnings: string[] = []): HyperliquidSource {
  return { source: "mock.hyperliquid", fetchedAt: now, freshness: "live", warnings };
}

function polySource(warnings: string[] = []): PolymarketSource {
  return { source: "mock.polymarket", fetchedAt: now, freshness: "live", warnings };
}

const hyperliquidMarket: HyperliquidMarketSummary = {
  asset: "BTC",
  index: 0,
  markPx: 65000,
  szDecimals: 5,
  maxLeverage: 50,
  onlyIsolated: false,
  source: hyperSource(),
};

const hyperliquidFunding: HyperliquidFundingSnapshot = {
  asset: "BTC",
  fundingRate: 0.0001,
  premium: 0.0002,
  openInterest: 1234,
  oraclePx: 65010,
  markPx: 65000,
  previousDayPx: 64000,
  dayNotionalVolume: 1_000_000,
  source: hyperSource(),
  warnings: [],
  raw: {},
};

const hyperliquidOrderbook: HyperliquidOrderbook = {
  asset: "BTC",
  bids: [{ price: 64999, size: 1, raw: {} }],
  asks: [{ price: 65001, size: 1, raw: {} }],
  source: hyperSource(),
  warnings: [],
};

const hyperliquidAccount: HyperliquidAccountSnapshot = {
  address: "0x0000000000000000000000000000000000000001",
  marginSummary: null,
  crossMarginSummary: null,
  withdrawable: "10",
  positionCount: 0,
  openOrderCount: 0,
  notionalExposure: 0,
  unrealizedPnl: 0,
  positions: [],
  orders: [],
  assetPositions: [],
  openOrders: [],
  source: hyperSource(),
  warnings: [],
};

const hyperliquidProvider: HyperliquidProvider = {
  async listMarkets() {
    return [hyperliquidMarket];
  },
  async getAccount() {
    return hyperliquidAccount;
  },
  async getFunding() {
    return hyperliquidFunding;
  },
  async getOrderbook() {
    return hyperliquidOrderbook;
  },
};

const polymarketMarket: PolymarketMarketSummary = {
  id: "0xmarket-ai",
  question: "Will an AI model pass a major benchmark in 2027?",
  slug: "ai-benchmark-2027",
  eventId: "evt-ai",
  eventTitle: "AI milestones",
  description: "Read-only mock market for routing tests.",
  outcomes: ["Yes", "No"],
  outcomePrices: { Yes: 0.62, No: 0.38 },
  tokenIds: { Yes: "token-yes", No: "token-no" },
  volume: 125000,
  liquidity: 42000,
  endDate: "2027-12-31T00:00:00Z",
  active: true,
  closed: false,
  source: polySource(),
};

const polymarketEvent: PolymarketEventSummary = {
  id: "evt-ai",
  title: "AI milestones",
  description: "AI prediction markets",
  endDate: "2027-12-31T00:00:00Z",
  volume: 250000,
  liquidity: 80000,
  marketCount: 1,
  markets: [polymarketMarket],
  source: polySource(),
};

const polymarketOrderbook: PolymarketOrderbook = {
  marketId: polymarketMarket.id,
  tokenId: "token-yes",
  outcome: "Yes",
  bids: [{ price: 0.61, size: 100, raw: {} }],
  asks: [{ price: 0.63, size: 200, raw: {} }],
  bestBid: 0.61,
  bestAsk: 0.63,
  midpoint: 0.62,
  spread: 0.02,
  source: polySource(),
  warnings: [],
};

const polymarketCompliance: PolymarketComplianceStatus = {
  status: "allowed",
  reason: null,
  jurisdiction: "US",
  checkedAt: now,
  source: "mock.polymarket",
};

const polymarketProvider: PolymarketProvider = {
  async searchMarkets() {
    return [polymarketMarket];
  },
  async searchEvents() {
    return [polymarketEvent];
  },
  async getMarket() {
    return polymarketMarket;
  },
  async getOrderbook() {
    return polymarketOrderbook;
  },
  async checkCompliance() {
    return polymarketCompliance;
  },
};

function cardKind(result: UnifiedCryptoChatResult): string | null {
  const first = result.cards[0];
  return first && typeof first === "object" && "kind" in first && typeof first.kind === "string"
    ? first.kind
    : null;
}

function expectSharedCardContract(card: UnifiedCryptoSharedCard, venue: UnifiedCryptoSharedCard["venue"]) {
  expect(card.venue).toBe(venue);
  expect(typeof card.kind).toBe("string");
  expect(typeof card.title).toBe("string");
  expect(card.title.length).toBeGreaterThan(0);
  expect(typeof card.summary).toBe("string");
  expect(card.summary.length).toBeGreaterThan(0);
  expect(["info", "success", "warning", "danger"]).toContain(card.status);
  expect(Array.isArray(card.warnings)).toBe(true);
  expect(card.originalKind === null || typeof card.originalKind === "string").toBe(true);
  expect(card.data).toBeTruthy();
}

function sharedKinds(result: UnifiedCryptoChatResult): string[] {
  return result.sharedCards.map((card) => card.kind);
}

describe("unified crypto chat router", () => {
  test("plans explicit venue overrides", () => {
    const plan = planUnifiedCryptoChat({ venue: "polymarket", message: "show markets about AI" });
    expect(plan.requestedVenue).toBe("polymarket");
    expect(plan.routedVenue).toBe("polymarket");
    expect(plan.requiresClarification).toBe(false);
  });

  test("asks for one venue clarification when a prompt is too generic", () => {
    const plan = planUnifiedCryptoChat({ message: "show me markets" });
    expect(plan.routedVenue).toBeNull();
    expect(plan.requiresClarification).toBe(true);
    expect(plan.clarificationQuestion).toContain("Bittensor");
  });

  test("routes Bittensor chat through the Bittensor executor", async () => {
    const result = await executeUnifiedCryptoChatWorkflow(
      { message: "show my TAO", ss58Address: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX" },
      {
        bittensorExecutor: async () => ({
          plan: { intent: "wallet" } as never,
          responseText: "Wallet snapshot loaded.",
          cards: [{ kind: "wallet_snapshot", title: "Wallet", items: [] }] as never,
          data: { wallet: { freeTao: 1 } },
          warnings: [],
          requiresClarification: false,
          clarificationQuestion: null,
          execution: "answered",
        }),
      },
    );
    expect(result.venue).toBe("bittensor");
    expect(result.intent).toBe("wallet");
    expect(result.execution).toBe("answered");
    expect(cardKind(result)).toBe("wallet_snapshot");
    expect(result.sharedCards[0]).toMatchObject({
      kind: "account_snapshot",
      venue: "bittensor",
      originalKind: "wallet_snapshot",
      status: "success",
    });
  });

  test("routes Hyperliquid reads through the Hyperliquid workflow", async () => {
    const result = await executeUnifiedCryptoChatWorkflow(
      { message: "show BTC Hyperliquid funding" },
      { hyperliquidProvider },
    );
    expect(result.venue).toBe("hyperliquid");
    expect(result.intent).toBe("funding");
    expect(result.execution).toBe("read_only");
    expect(cardKind(result)).toBe("hyperliquid_funding");
    expect(result.sharedCards[0]).toMatchObject({
      kind: "market_context",
      venue: "hyperliquid",
      originalKind: "hyperliquid_funding",
      status: "success",
    });
    expect(result.sharedCards[0]?.source).toMatchObject({ source: "mock.hyperliquid" });
    expect(JSON.stringify(result)).not.toContain("/orders/submit");
  });

  test("routes Polymarket discovery through the Polymarket workflow", async () => {
    const result = await executeUnifiedCryptoChatWorkflow(
      { message: "find Polymarket markets about AI", limit: 5 },
      { polymarketProvider },
    );
    expect(result.venue).toBe("polymarket");
    expect(result.intent).toBe("discover");
    expect(result.execution).toBe("read_only");
    expect(cardKind(result)).toBe("polymarket_market_list");
    expect(result.sharedCards[0]).toMatchObject({
      kind: "discovery",
      venue: "polymarket",
      originalKind: "polymarket_market_list",
      status: "success",
    });
  });

  test("rejects secret-shaped input before venue execution", async () => {
    expect(findForbiddenUnifiedCryptoCredentialInput({ nested: { apiSecret: "supersecret" } })).toBe("nested.apiSecret");
    const result = await executeUnifiedCryptoChatWorkflow(
      { message: "show BTC Hyperliquid funding", apiSecret: "supersecret" } as never,
      { hyperliquidProvider },
    );
    expect(result.execution).toBe("unsupported");
    expect(result.intent).toBe("secret_rejected");
    expect(result.warnings.join(" ")).toContain("apiSecret");
    expect(JSON.stringify(result)).not.toContain("supersecret");
    expect(result.sharedCards[0]).toMatchObject({
      kind: "generic",
      venue: "auto",
      status: "warning",
      originalKind: "crypto_chat_secret_rejected",
    });
  });

  test("maps venue card kinds into customer-readable shared card categories", () => {
    const shared = buildUnifiedCryptoSharedCards("polymarket", "blocked_by_compliance", [
      { kind: "polymarket_market_list", title: "Markets", markets: [], warnings: [] },
      { kind: "wallet_snapshot", title: "Wallet", wallet: {}, warnings: [] },
      { kind: "polymarket_market_detail", title: "Market", market: {}, warnings: [] },
      { kind: "polymarket_orderbook", title: "Orderbook", orderbook: {}, warnings: [] },
      { kind: "polymarket_compliance", title: "Compliance", compliance: { status: "blocked" }, warnings: ["blocked"] },
      { kind: "polymarket_order_preview", title: "Preview", preview: { canSubmit: false }, warnings: [] },
      { kind: "signing_handoff", title: "Handoff", handoff: {}, warnings: [] },
      { kind: "signing_receipt", title: "Receipt", receipt: {}, warnings: [] },
      { kind: "polymarket_watch", title: "Watch", watch: {}, warnings: [] },
    ]);
    expect(shared.map((card) => card.kind)).toEqual([
      "discovery",
      "account_snapshot",
      "market_context",
      "orderbook_context",
      "compliance_block",
      "action_preview",
      "external_signer_handoff",
      "receipt_status",
      "watch_alert",
    ]);
    shared.forEach((card) => expectSharedCardContract(card, "polymarket"));
    expect(shared[4]?.status).toBe("danger");
    expect(shared[5]?.summary).toContain("does not sign or submit");
    expect(shared[7]?.summary).toContain("receipt/status");
  });

  test("locks shared-card contract for representative Bittensor workflows", async () => {
    const result = await executeUnifiedCryptoChatWorkflow(
      { venue: "bittensor", message: "show my TAO and prepare staking context", ss58Address: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX" },
      {
        bittensorExecutor: async () => ({
          plan: { intent: "wallet" } as never,
          responseText: "Bittensor context loaded.",
          cards: [
            { kind: "wallet_snapshot", title: "Wallet snapshot", wallet: {}, warnings: [] },
            { kind: "subnet_comparison", title: "Useful subnets", subnets: [], warnings: [] },
            { kind: "validator_selection", title: "Validator comparison", validators: [], warnings: [] },
            { kind: "staking_quote", title: "Staking preview", preview: { canSubmit: false }, warnings: [] },
            { kind: "signing_handoff", title: "External signer handoff", handoff: {}, warnings: [] },
            { kind: "signed_result", title: "Public receipt", receipt: {}, warnings: [] },
            { kind: "watchlist", title: "Watch alert", watches: [], warnings: [] },
          ] as never,
          data: { wallet: { freeTao: 1 } },
          warnings: [],
          requiresClarification: false,
          clarificationQuestion: null,
          execution: "unsigned_preview",
        }),
      },
    );

    expect(result.venue).toBe("bittensor");
    expect(sharedKinds(result)).toEqual([
      "account_snapshot",
      "discovery",
      "market_context",
      "action_preview",
      "external_signer_handoff",
      "receipt_status",
      "watch_alert",
    ]);
    result.sharedCards.forEach((card) => expectSharedCardContract(card, "bittensor"));
    expect(JSON.stringify(result)).not.toContain("seed");
    expect(JSON.stringify(result)).not.toContain("/orders/submit");
  });

  test("locks shared-card contract for Hyperliquid read and preview workflows", async () => {
    const orderbook = await executeUnifiedCryptoChatWorkflow(
      { venue: "hyperliquid", message: "show BTC orderbook", asset: "BTC" },
      { hyperliquidProvider },
    );
    const preview = await executeUnifiedCryptoChatWorkflow(
      { venue: "hyperliquid", message: "preview buying 0.1 BTC at 65000", asset: "BTC", side: "buy", size: 0.1, price: 65000 },
      { hyperliquidProvider },
    );

    expect(orderbook.venue).toBe("hyperliquid");
    expect(orderbook.sharedCards[0]).toMatchObject({ kind: "orderbook_context", originalKind: "hyperliquid_orderbook", status: "success" });
    expect(preview.venue).toBe("hyperliquid");
    expect(preview.sharedCards[0]).toMatchObject({ kind: "action_preview", originalKind: "hyperliquid_order_preview", status: "warning" });
    orderbook.sharedCards.forEach((card) => expectSharedCardContract(card, "hyperliquid"));
    preview.sharedCards.forEach((card) => expectSharedCardContract(card, "hyperliquid"));
    expect((preview.sharedCards[0]?.data as { preview?: { canSubmit?: boolean } }).preview?.canSubmit).toBe(false);
    expect(JSON.stringify(preview)).not.toContain("/orders/submit");
  });

  test("locks shared-card contract for Polymarket discovery, watch, and blocked preview workflows", async () => {
    const blockedCompliance: PolymarketComplianceStatus = {
      ...polymarketCompliance,
      status: "blocked",
      reason: "Geoblocked test region",
    };
    const blockedProvider: PolymarketProvider = {
      ...polymarketProvider,
      async checkCompliance() {
        return blockedCompliance;
      },
    };

    const discovery = await executeUnifiedCryptoChatWorkflow(
      { venue: "polymarket", message: "find AI markets", limit: 5 },
      { polymarketProvider },
    );
    const watch = await executeUnifiedCryptoChatWorkflow(
      { venue: "polymarket", message: "watch this market", marketId: polymarketMarket.id },
      { polymarketProvider },
    );
    const blocked = await executeUnifiedCryptoChatWorkflow(
      { venue: "polymarket", message: "preview buying $10 of Yes", marketId: polymarketMarket.id, outcome: "Yes", amountUsdc: 10 },
      { polymarketProvider: blockedProvider },
    );

    expect(discovery.sharedCards[0]).toMatchObject({ kind: "discovery", originalKind: "polymarket_market_list", status: "success" });
    expect(watch.sharedCards[0]).toMatchObject({ kind: "watch_alert", originalKind: "polymarket_watch", status: "success" });
    expect(sharedKinds(blocked)).toEqual(["compliance_block", "action_preview"]);
    blocked.sharedCards.forEach((card) => expectSharedCardContract(card, "polymarket"));
    const blockedAction = blocked.sharedCards.find((card) => card.kind === "action_preview");
    const blockedPreview = (blockedAction?.data as { preview?: { canSubmit?: boolean; size?: number | null; price?: number | null; estimatedShares?: number | null } }).preview;
    expect(blocked.execution).toBe("blocked_by_compliance");
    expect(blockedAction?.status).toBe("danger");
    expect(blockedPreview?.canSubmit).toBe(false);
    expect(blockedPreview?.size).toBeNull();
    expect(blockedPreview?.price).toBeNull();
    expect(blockedPreview?.estimatedShares).toBeNull();
    expect(JSON.stringify(blocked)).not.toContain("/orders/submit");
  });
});
