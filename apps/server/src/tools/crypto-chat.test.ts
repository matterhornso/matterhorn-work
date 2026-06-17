import { describe, expect, test } from "bun:test";
import {
  buildUnifiedCryptoSharedCards,
  executeUnifiedCryptoChatWorkflow,
  findForbiddenUnifiedCryptoCredentialInput,
  planUnifiedCryptoChat,
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
      { kind: "polymarket_compliance", title: "Compliance", compliance: { status: "blocked" }, warnings: ["blocked"] },
      { kind: "polymarket_order_preview", title: "Preview", preview: { canSubmit: false }, warnings: [] },
    ]);
    expect(shared.map((card) => card.kind)).toEqual(["compliance_block", "action_preview"]);
    expect(shared[0]?.status).toBe("danger");
    expect(shared[1]?.summary).toContain("does not sign or submit");
  });
});
