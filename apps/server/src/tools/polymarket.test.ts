import { describe, expect, test } from "bun:test";
import {
  PolymarketInfoProvider,
  estimatePolymarketFill,
  executePolymarketChatWorkflow,
  extractPolymarketOrderInput,
  findForbiddenPolymarketCredentialInput,
  planPolymarketChat,
  preparePolymarketOrderPreview,
  type PolymarketBookLevel,
  type PolymarketProvider,
} from "./polymarket.js";

const AI_MARKET = {
  id: "0xmarket-ai",
  conditionId: "0xcond-ai",
  question: "Will an AI model pass the bar exam by 2027?",
  slug: "ai-bar-exam-2027",
  description: "Resolves YES if a publicly disclosed AI model passes the bar exam.",
  outcomes: JSON.stringify(["Yes", "No"]),
  outcomePrices: JSON.stringify(["0.62", "0.38"]),
  clobTokenIds: JSON.stringify(["token-yes", "token-no"]),
  volume: 125000,
  liquidity: 42000,
  endDate: "2027-12-31T00:00:00Z",
  active: true,
  closed: false,
  events: [{ id: "evt-ai", title: "AI milestones" }],
};

const SPORTS_MARKET = {
  id: "0xmarket-sports",
  question: "Will the home team win the championship?",
  outcomes: JSON.stringify(["Yes", "No"]),
  outcomePrices: JSON.stringify(["0.5", "0.5"]),
  clobTokenIds: JSON.stringify(["token-s-yes", "token-s-no"]),
  active: true,
  closed: false,
};

const BOOK_YES = {
  market: "0xmarket-ai",
  bids: [{ price: "0.61", size: "100" }],
  asks: [{ price: "0.63", size: "200" }, { price: "0.64", size: "300" }],
};

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function mockFetcher(options: { blocked?: boolean } = {}) {
  return async (url: string) => {
    if (url.includes("/api/geoblock")) return jsonResponse({ blocked: options.blocked ?? false, country: "US" });
    if (url.includes("/markets/0xmarket-ai")) return jsonResponse(AI_MARKET);
    if (url.includes("/markets/0xmarket-sports")) return jsonResponse(SPORTS_MARKET);
    if (url.includes("/markets")) return jsonResponse([AI_MARKET, SPORTS_MARKET]);
    if (url.includes("/book")) return jsonResponse(BOOK_YES);
    return jsonResponse({ error: "not found" }, false, 404);
  };
}

function provider(options: { blocked?: boolean } = {}): PolymarketProvider {
  return new PolymarketInfoProvider({
    gammaBaseUrl: "https://gamma.test",
    clobBaseUrl: "https://clob.test",
    geoblockUrl: "https://poly.test/api/geoblock",
    fetcher: mockFetcher(options) as never,
  });
}

describe("Polymarket read/preview safety", () => {
  test("rejects credential-shaped payload keys", () => {
    expect(findForbiddenPolymarketCredentialInput({ nested: { apiSecret: "nope" } })).toBe("nested.apiSecret");
    expect(findForbiddenPolymarketCredentialInput({ privateKey: "x" })).toBe("privateKey");
    expect(findForbiddenPolymarketCredentialInput({ marketId: "0xabc", amountUsdc: 10 })).toBeNull();
  });

  test("fails closed on a deeply-nested payload", () => {
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < 100_000; i++) deep = { a: deep };
    expect(findForbiddenPolymarketCredentialInput(deep)).toContain("too-deep");
  });

  test("classifies ordinary chat intents", () => {
    expect(planPolymarketChat({ message: "find markets about AI" })).toBe("discover");
    expect(planPolymarketChat({ message: "explain this market" })).toBe("market");
    expect(planPolymarketChat({ message: "what are the odds and liquidity?" })).toBe("odds");
    expect(planPolymarketChat({ message: "show the orderbook" })).toBe("orderbook");
    expect(planPolymarketChat({ message: "am I geoblocked?" })).toBe("compliance");
    expect(planPolymarketChat({ message: "watch this market" })).toBe("monitor");
    expect(planPolymarketChat({ message: "prepare a $10 Yes order" })).toBe("order_preview");
  });

  test("extracts order preview fields from natural language", () => {
    const input = extractPolymarketOrderInput({ message: "prepare a $10 Yes order", marketId: "0xmarket-ai" });
    expect(input.side).toBe("yes");
    expect(input.amountUsdc).toBe(10);
    expect(input.marketId).toBe("0xmarket-ai");
  });
});

describe("Polymarket provider reads", () => {
  test("searches markets by keyword", async () => {
    const markets = await provider().searchMarkets("AI", 10);
    expect(markets).toHaveLength(1);
    expect(markets[0].id).toBe("0xmarket-ai");
    expect(markets[0].outcomePrices.Yes).toBeCloseTo(0.62);
    expect(markets[0].tokenIds.Yes).toBe("token-yes");
    expect(markets[0].source.source).toContain("gamma.test");
  });

  test("reads market detail and parses JSON-encoded fields", async () => {
    const market = await provider().getMarket("0xmarket-ai");
    expect(market.question).toContain("bar exam");
    expect(market.eventId).toBe("evt-ai");
    expect(market.tokenIds.No).toBe("token-no");
    expect(market.active).toBe(true);
  });

  test("ignores prototype-mutating outcome labels from a hostile provider", async () => {
    const hostile = {
      id: "0xmarket-proto",
      question: "hostile",
      outcomes: JSON.stringify(["__proto__", "Yes"]),
      outcomePrices: JSON.stringify(["0.5", "0.5"]),
      clobTokenIds: JSON.stringify(["t0", "t1"]),
    };
    const fetcher = (async () => jsonResponse(hostile)) as never;
    const market = await new PolymarketInfoProvider({ gammaBaseUrl: "https://gamma.test", fetcher }).getMarket("0xmarket-proto");
    const probe: Record<string, unknown> = {};
    expect(probe.polluted).toBeUndefined();
    expect(market.tokenIds.Yes).toBe("t1");
    expect(Object.prototype.hasOwnProperty.call(market.tokenIds, "__proto__")).toBe(false);
  });

  test("reads and shapes the CLOB orderbook", async () => {
    const book = await provider().getOrderbook("token-yes", { marketId: "0xmarket-ai", outcome: "Yes" });
    expect(book.bestBid).toBeCloseTo(0.61);
    expect(book.bestAsk).toBeCloseTo(0.63);
    expect(book.midpoint).toBeCloseTo(0.62);
    expect(book.spread).toBeCloseTo(0.02);
  });

  test("geoblock allowed and blocked", async () => {
    expect((await provider({ blocked: false }).checkCompliance()).status).toBe("allowed");
    const blocked = await provider({ blocked: true }).checkCompliance();
    expect(blocked.status).toBe("blocked");
    expect(blocked.reason).toBeTruthy();
  });
});

describe("Polymarket chat workflow", () => {
  test("discover returns read-only markets", async () => {
    const result = await executePolymarketChatWorkflow({ message: "find markets about AI" }, { provider: provider() });
    expect(result.intent).toBe("discover");
    expect(result.execution).toBe("read_only");
    expect(result.cards[0]?.kind).toBe("polymarket_market_list");
  });

  test("market detail is read-only with a risk disclaimer", async () => {
    const result = await executePolymarketChatWorkflow({ message: "explain this market", marketId: "0xmarket-ai" }, { provider: provider() });
    expect(result.intent).toBe("market");
    expect(result.responseText).toMatch(/risk-bearing/);
  });

  test("orderbook read returns a shaped book", async () => {
    const result = await executePolymarketChatWorkflow({ message: "show the orderbook", marketId: "0xmarket-ai", outcome: "Yes" }, { provider: provider() });
    expect(result.intent).toBe("orderbook");
    expect(result.responseText).toMatch(/best bid/);
  });

  test("geoblock allowed -> unsigned non-submittable preview with marketability", async () => {
    const result = await executePolymarketChatWorkflow({ message: "prepare a $10 Yes order", marketId: "0xmarket-ai" }, { provider: provider({ blocked: false }) });
    expect(result.execution).toBe("unsigned_preview");
    expect(result.preview?.canSubmit).toBe(false);
    expect(result.preview?.signerPolicy).toBe("api_wallet_required");
    expect(result.preview?.price).not.toBeNull();
    expect(result.preview?.estimatedShares).toBeGreaterThan(0);
    expect(result.preview?.marketability?.depthSufficient).toBe(true);
    expect(result.preview?.previewSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("geoblock blocked -> blocked_by_compliance with no executable preview", async () => {
    const result = await executePolymarketChatWorkflow({ message: "prepare a $10 Yes order", marketId: "0xmarket-ai" }, { provider: provider({ blocked: true }) });
    expect(result.execution).toBe("blocked_by_compliance");
    expect(result.preview?.execution).toBe("blocked_by_compliance");
    expect(result.preview?.price).toBeNull();
    expect(result.preview?.size).toBeNull();
    expect(result.preview?.estimatedShares).toBeNull();
    expect(result.preview?.canSubmit).toBe(false);
  });

  test("order preview without amount asks one clarification", async () => {
    const result = await executePolymarketChatWorkflow({ message: "prepare a Yes order", marketId: "0xmarket-ai" }, { provider: provider() });
    expect(result.requiresClarification).toBe(true);
    expect(result.preview).toBeUndefined();
  });

  test("rejects a payload carrying signing material", async () => {
    const result = await executePolymarketChatWorkflow(
      { message: "prepare order", marketId: "0xmarket-ai", apiSecret: "bad" } as never,
      { provider: provider() },
    );
    expect(result.execution).toBe("unsupported");
    expect(result.warnings.join(" ")).toContain("apiSecret");
  });

  test("monitor builds a read-only watch with suggested thresholds", async () => {
    const result = await executePolymarketChatWorkflow({ message: "watch this market", marketId: "0xmarket-ai" }, { provider: provider() });
    expect(result.intent).toBe("monitor");
    expect(result.execution).toBe("read_only");
    expect(result.cards[0]?.kind).toBe("polymarket_watch");
    const watch = result.data?.watch as { conditions?: Array<{ outcome?: string; upperThreshold?: number; lowerThreshold?: number }>; note?: string };
    expect(watch.conditions?.[0]?.outcome).toBe("Yes");
    expect(watch.conditions?.[0]?.upperThreshold).toBeCloseTo(0.72, 2); // 0.62 + 0.1
    expect(watch.conditions?.[0]?.lowerThreshold).toBeCloseTo(0.52, 2);
    expect(result.responseText).toMatch(/will not place or auto-execute/);
  });

  test("monitor works even when the region is geoblocked (research flow)", async () => {
    const result = await executePolymarketChatWorkflow({ message: "track this market", marketId: "0xmarket-ai" }, { provider: provider({ blocked: true }) });
    expect(result.intent).toBe("monitor");
    expect(result.execution).toBe("read_only");
  });

  test("monitor without a market id asks one clarification", async () => {
    const result = await executePolymarketChatWorkflow({ message: "watch a market for me" }, { provider: provider() });
    expect(result.requiresClarification).toBe(true);
  });
});

describe("Polymarket preview math", () => {
  test("estimatePolymarketFill walks asks for a USDC buy", () => {
    const asks: PolymarketBookLevel[] = [
      { price: 0.63, size: 200, raw: null },
      { price: 0.64, size: 300, raw: null },
    ];
    const fill = estimatePolymarketFill(asks, 10);
    expect(fill.depthSufficient).toBe(true);
    expect(fill.estimatedFillPrice).toBeCloseTo(0.63);
    expect(fill.estimatedShares).toBeCloseTo(10 / 0.63, 2);
  });

  test("estimatePolymarketFill flags insufficient depth", () => {
    const fill = estimatePolymarketFill([{ price: 0.63, size: 1, raw: null }], 100);
    expect(fill.depthSufficient).toBe(false);
  });

  test("preparePolymarketOrderPreview is never submittable", async () => {
    const market = await provider().getMarket("0xmarket-ai");
    const compliance = { status: "allowed" as const, reason: null, jurisdiction: "US", checkedAt: "t", source: "mock" };
    const preview = await preparePolymarketOrderPreview({ market, outcome: "Yes", side: "yes", amountUsdc: 10, compliance }, provider());
    expect(preview.canSubmit).toBe(false);
    expect(preview.version).toBe("matterhorn.market.action-preview.v1");
    expect(preview.warnings.join(" ")).toContain("does not submit");
  });
});

describe("Polymarket preview risk polish", () => {
  const allowed = { status: "allowed" as const, reason: null, jurisdiction: "US", checkedAt: "t", source: "mock" };

  test("includes cost/payout/max-loss risk framing", async () => {
    const market = await provider().getMarket("0xmarket-ai");
    const preview = await preparePolymarketOrderPreview({ market, outcome: "Yes", side: "yes", amountUsdc: 10, compliance: allowed }, provider());
    expect(preview.risk?.costUsdc).toBe(10);
    expect(preview.risk?.maxLossUsdc).toBe(10);
    // ~15.87 shares at 0.63 -> payout ~15.87, profit ~5.87
    expect(preview.risk?.payoutIfWinUsdc).toBeGreaterThan(10);
    expect(preview.risk?.maxProfitUsdc).toBeGreaterThan(0);
    expect(preview.risk?.breakevenProbability).toBeCloseTo(0.63, 2);
    expect(preview.consequence).toContain("stake is lost");
  });

  test("includes resolution, liquidity, and implied-vs-book price context", async () => {
    const market = await provider().getMarket("0xmarket-ai");
    const preview = await preparePolymarketOrderPreview({ market, outcome: "Yes", side: "yes", amountUsdc: 10, compliance: allowed }, provider());
    expect(preview.resolution?.endDate).toBe("2027-12-31T00:00:00Z");
    expect(preview.liquidity?.liquidityUsd).toBe(42000);
    expect(preview.priceContext?.impliedProbability).toBeCloseTo(0.62, 2);
    expect(preview.priceContext?.estimatedFillProbability).toBeCloseTo(0.63, 2);
    expect(preview.priceContext?.gapVsImpliedPct).not.toBeNull();
  });

  test("warns when estimated slippage exceeds tolerance", async () => {
    const market = await provider().getMarket("0xmarket-ai");
    // amount 200 forces walking into the 0.64 level -> slippage vs 0.63 reference.
    const preview = await preparePolymarketOrderPreview({ market, outcome: "Yes", side: "yes", amountUsdc: 200, compliance: allowed, slippageTolerance: 0.01 }, provider());
    expect(preview.warnings.some((w) => /exceeds your tolerance/.test(w))).toBe(true);
  });

  test("blocked preview carries null risk context", async () => {
    const result = await executePolymarketChatWorkflow({ message: "prepare a $10 Yes order", marketId: "0xmarket-ai" }, { provider: provider({ blocked: true }) });
    expect(result.preview?.execution).toBe("blocked_by_compliance");
    expect(result.preview?.risk).toBeNull();
    expect(result.preview?.resolution).toBeNull();
    expect(result.preview?.canSubmit).toBe(false);
  });
});
