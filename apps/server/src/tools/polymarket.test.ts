import { describe, expect, test } from "bun:test";
import {
  PolymarketProvider,
  PolymarketSecretRejectedError,
  assertNoForbiddenSecrets,
  buildBlockedOrderPreview,
  buildOrderPreview,
  estimateBuyFill,
  executePolymarketChat,
  planPolymarketIntent,
  shapeOrderbook,
  POLYMARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN,
  POLYMARKET_PREVIEW_VERSION,
  type PolymarketComplianceStatus,
  type PolymarketMarketSummary,
} from "./polymarket.js";

// ---------------------------------------------------------------------------
// Mocked Gamma / CLOB / geoblock fixtures.
// ---------------------------------------------------------------------------

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
  volume: 5000,
  liquidity: 2000,
  active: true,
  closed: false,
};

const ORDERBOOK_YES = {
  market: "0xmarket-ai",
  asset_id: "token-yes",
  bids: [
    { price: "0.61", size: "100" },
    { price: "0.60", size: "500" },
  ],
  asks: [
    { price: "0.63", size: "20" },
    { price: "0.64", size: "300" },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface MockOptions {
  geoblockBlocked?: boolean;
  geoblockThrows?: boolean;
}

/** Build an injectable fetch that routes by URL across Gamma, CLOB, geoblock. */
function makeFetch(options: MockOptions = {}): typeof fetch {
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/api/geoblock")) {
      if (options.geoblockThrows) return new Response("nope", { status: 500, statusText: "Server Error" });
      return jsonResponse({ blocked: options.geoblockBlocked ?? false, country: "US" });
    }
    if (url.includes("/markets/")) {
      if (url.includes("0xmarket-ai")) return jsonResponse(AI_MARKET);
      if (url.includes("0xmarket-sports")) return jsonResponse(SPORTS_MARKET);
      return new Response("not found", { status: 404, statusText: "Not Found" });
    }
    if (url.includes("/markets")) {
      return jsonResponse([AI_MARKET, SPORTS_MARKET]);
    }
    if (url.includes("/book")) {
      return jsonResponse(ORDERBOOK_YES);
    }
    if (url.includes("/events/")) {
      return jsonResponse({ id: "evt-ai", title: "AI milestones", markets: [AI_MARKET], volume: 125000 });
    }
    return new Response("unhandled", { status: 404, statusText: "Not Found" });
  };
  return impl as typeof fetch;
}

function providerWith(options: MockOptions = {}): PolymarketProvider {
  return new PolymarketProvider({ fetchImpl: makeFetch(options) });
}

const ALLOWED_COMPLIANCE: PolymarketComplianceStatus = {
  status: "allowed",
  reason: null,
  jurisdiction: "US",
  checkedAt: "2026-06-16T00:00:00Z",
  source: "mock",
};

// ---------------------------------------------------------------------------
// Provider reads.
// ---------------------------------------------------------------------------

describe("PolymarketProvider — market search", () => {
  test("returns markets matching a keyword", async () => {
    const markets = await providerWith().searchMarkets("AI", 10);
    expect(markets.length).toBe(1);
    expect(markets[0].id).toBe("0xmarket-ai");
    expect(markets[0].outcomes).toEqual(["Yes", "No"]);
    expect(markets[0].outcomePrices.Yes).toBeCloseTo(0.62);
    expect(markets[0].tokenIds.Yes).toBe("token-yes");
  });

  test("filters out non-matching markets", async () => {
    const markets = await providerWith().searchMarkets("championship", 10);
    expect(markets.map((m: PolymarketMarketSummary) => m.id)).toEqual(["0xmarket-sports"]);
  });
});

describe("PolymarketProvider — market detail", () => {
  test("reads a single market and parses JSON-encoded fields", async () => {
    const market = await providerWith().getMarket("0xmarket-ai");
    expect(market.question).toContain("bar exam");
    expect(market.eventId).toBe("evt-ai");
    expect(market.tokenIds.No).toBe("token-no");
    expect(market.active).toBe(true);
  });
});

describe("PolymarketProvider — orderbook read", () => {
  test("shapes best bid/ask, midpoint, spread", async () => {
    const book = await providerWith().getOrderbook("token-yes", { marketId: "0xmarket-ai", outcome: "Yes" });
    expect(book.bestBid).toBeCloseTo(0.61);
    expect(book.bestAsk).toBeCloseTo(0.63);
    expect(book.midpoint).toBeCloseTo(0.62);
    expect(book.spread).toBeCloseTo(0.02);
    // bids sorted desc, asks sorted asc
    expect(book.bids[0].price).toBeGreaterThanOrEqual(book.bids[1].price);
    expect(book.asks[0].price).toBeLessThanOrEqual(book.asks[1].price);
  });

  test("shapeOrderbook flags one-sided books", () => {
    const book = shapeOrderbook("t", [{ price: 0.4, size: 10 }], [], { marketId: null, outcome: null, source: "mock" });
    expect(book.bestAsk).toBeNull();
    expect(book.midpoint).toBeNull();
    expect(book.source.warnings.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Compliance / geoblock.
// ---------------------------------------------------------------------------

describe("PolymarketProvider — geoblock", () => {
  test("allowed when geoblock reports not blocked", async () => {
    const compliance = await providerWith({ geoblockBlocked: false }).checkGeoblock();
    expect(compliance.status).toBe("allowed");
  });

  test("blocked when geoblock reports blocked", async () => {
    const compliance = await providerWith({ geoblockBlocked: true }).checkGeoblock();
    expect(compliance.status).toBe("blocked");
    expect(compliance.reason).toBeTruthy();
  });

  test("unknown (not blocked) when geoblock endpoint fails — research still works", async () => {
    const compliance = await providerWith({ geoblockThrows: true }).checkGeoblock();
    expect(compliance.status).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// Order preview.
// ---------------------------------------------------------------------------

describe("order preview — fill estimation", () => {
  test("estimateBuyFill walks asks for a USDC buy", () => {
    const fill = estimateBuyFill([{ price: 0.63, size: 20 }, { price: 0.64, size: 300 }], 10);
    // $10 fully fills inside the first level ($12.60 available)
    expect(fill.fullyFilled).toBe(true);
    expect(fill.avgPrice).toBeCloseTo(0.63);
    expect(fill.shares).toBeCloseTo(10 / 0.63);
  });

  test("estimateBuyFill flags insufficient liquidity", () => {
    const fill = estimateBuyFill([{ price: 0.63, size: 1 }], 100);
    expect(fill.fullyFilled).toBe(false);
  });
});

describe("buildOrderPreview", () => {
  test("produces an unsigned, non-submittable preview", async () => {
    const market = await providerWith().getMarket("0xmarket-ai");
    const book = await providerWith().getOrderbook("token-yes", { marketId: market.id, outcome: "Yes" });
    const preview = buildOrderPreview({
      market,
      outcome: "Yes",
      side: "yes",
      amountUsdc: 10,
      orderbook: book,
      compliance: ALLOWED_COMPLIANCE,
    });
    expect(preview.canSubmit).toBe(false);
    expect(preview.execution).toBe("unsigned_preview");
    expect(preview.signerPolicy).toBe("api_wallet_required");
    expect(preview.version).toBe(POLYMARKET_PREVIEW_VERSION);
    expect(preview.previewSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(preview.estimatedShares).toBeGreaterThan(0);
    expect(preview.warnings.some((w: string) => /risk-bearing/.test(w))).toBe(true);
  });

  test("preview hash is deterministic", async () => {
    const market = await providerWith().getMarket("0xmarket-ai");
    const book = await providerWith().getOrderbook("token-yes");
    const args = { market, outcome: "Yes", side: "yes" as const, amountUsdc: 10, orderbook: book, compliance: ALLOWED_COMPLIANCE };
    expect(buildOrderPreview(args).previewSha256).toBe(buildOrderPreview(args).previewSha256);
  });
});

describe("buildBlockedOrderPreview", () => {
  test("blocked preview carries no executable price/size", () => {
    const compliance: PolymarketComplianceStatus = { ...ALLOWED_COMPLIANCE, status: "blocked", reason: "geoblocked" };
    const preview = buildBlockedOrderPreview({ market: null, outcome: "Yes", side: "yes", amountUsdc: 10, compliance });
    expect(preview.execution).toBe("blocked_by_compliance");
    expect(preview.signerPolicy).toBe("blocked_by_compliance");
    expect(preview.price).toBeNull();
    expect(preview.size).toBeNull();
    expect(preview.estimatedShares).toBeNull();
    expect(preview.canSubmit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Chat planner / executor.
// ---------------------------------------------------------------------------

describe("planPolymarketIntent", () => {
  test("find markets about AI -> discover", () => {
    expect(planPolymarketIntent("find markets about AI").intent).toBe("discover");
  });
  test("explain this market -> learn", () => {
    expect(planPolymarketIntent("explain this market").intent).toBe("learn");
  });
  test("show the orderbook -> orderbook", () => {
    expect(planPolymarketIntent("show the orderbook").intent).toBe("orderbook");
  });
  test("prepare a $10 Yes order -> order_preview with side+amount", () => {
    const plan = planPolymarketIntent("prepare a $10 Yes order");
    expect(plan.intent).toBe("order_preview");
    expect(plan.side).toBe("yes");
    expect(plan.amountUsdc).toBe(10);
  });
});

describe("executePolymarketChat", () => {
  test("discover returns markets and is read-only", async () => {
    const result = await executePolymarketChat({ message: "find markets about AI" }, { provider: providerWith() });
    expect(result.intent).toBe("discover");
    expect(result.execution).toBe("read_only");
    expect(Array.isArray(result.data.markets)).toBe(true);
  });

  test("explain a market is read-only and includes a risk disclaimer", async () => {
    const result = await executePolymarketChat(
      { message: "explain this market", marketId: "0xmarket-ai" },
      { provider: providerWith() },
    );
    expect(result.intent).toBe("learn");
    expect(result.responseText).toMatch(/risk-bearing/);
  });

  test("show the orderbook returns shaped book", async () => {
    const result = await executePolymarketChat(
      { message: "show the orderbook", marketId: "0xmarket-ai", outcome: "Yes" },
      { provider: providerWith() },
    );
    expect(result.intent).toBe("orderbook");
    expect(result.responseText).toMatch(/best bid/);
  });

  test("geoblock allowed -> order preview is unsigned and non-submittable", async () => {
    const result = await executePolymarketChat(
      { message: "prepare a $10 Yes order", marketId: "0xmarket-ai" },
      { provider: providerWith({ geoblockBlocked: false }) },
    );
    expect(result.intent).toBe("order_preview");
    expect(result.execution).toBe("unsigned_preview");
    expect(result.preview?.canSubmit).toBe(false);
    expect(result.preview?.price).not.toBeNull();
  });

  test("geoblock blocked -> blocked_by_compliance with no executable preview", async () => {
    const result = await executePolymarketChat(
      { message: "prepare a $10 Yes order", marketId: "0xmarket-ai" },
      { provider: providerWith({ geoblockBlocked: true }) },
    );
    expect(result.execution).toBe("blocked_by_compliance");
    expect(result.preview?.execution).toBe("blocked_by_compliance");
    expect(result.preview?.price).toBeNull();
    expect(result.preview?.size).toBeNull();
    expect(result.preview?.canSubmit).toBe(false);
  });

  test("order preview without amount asks for clarification", async () => {
    const result = await executePolymarketChat(
      { message: "prepare a Yes order", marketId: "0xmarket-ai" },
      { provider: providerWith() },
    );
    expect(result.requiresClarification).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Secret-field rejection.
// ---------------------------------------------------------------------------

describe("assertNoForbiddenSecrets", () => {
  test("rejects forbidden credential keys", () => {
    for (const field of ["privateKey", "mnemonic", "seedPhrase", "apiSecret", "passphrase", "walletExport", "rawSignature", "signedPayload"]) {
      expect(() => assertNoForbiddenSecrets({ [field]: "x" })).toThrow(PolymarketSecretRejectedError);
    }
  });

  test("rejects values that look like a hex private key", () => {
    const key = `0x${"a".repeat(64)}`;
    expect(() => assertNoForbiddenSecrets({ note: key })).toThrow(PolymarketSecretRejectedError);
  });

  test("rejects values that look like a mnemonic", () => {
    const phrase = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
    expect(() => assertNoForbiddenSecrets({ note: phrase })).toThrow(PolymarketSecretRejectedError);
  });

  test("error never echoes the offending value", () => {
    const secret = `0x${"b".repeat(64)}`;
    try {
      assertNoForbiddenSecrets({ data: secret });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(PolymarketSecretRejectedError);
      if (error instanceof PolymarketSecretRejectedError) {
        expect(error.message).not.toContain(secret);
        expect(error.message).not.toContain("bbbb");
      }
    }
  });

  test("allows safe research payloads", () => {
    expect(() => assertNoForbiddenSecrets({ message: "find markets about AI", marketId: "0xmarket-ai", amountUsdc: 10 })).not.toThrow();
  });

  test("executePolymarketChat rejects a payload carrying signing material", async () => {
    await expect(
      executePolymarketChat(
        { message: "prepare order", marketId: "0xmarket-ai", outcome: `0x${"c".repeat(64)}` },
        { provider: providerWith() },
      ),
    ).rejects.toBeInstanceOf(PolymarketSecretRejectedError);
  });
});

// ---------------------------------------------------------------------------
// No-live-submission proof.
// ---------------------------------------------------------------------------

describe("no live order submission route exists", () => {
  test("provider exposes only read methods (no submit/sign/post)", () => {
    const proto = Object.getOwnPropertyNames(PolymarketProvider.prototype);
    for (const forbidden of ["submitOrder", "placeOrder", "signOrder", "postOrder", "createOrder", "sendOrder"]) {
      expect(proto).not.toContain(forbidden);
    }
  });

  test("every preview path yields canSubmit:false", async () => {
    const allowed = await executePolymarketChat(
      { message: "prepare a $10 Yes order", marketId: "0xmarket-ai" },
      { provider: providerWith({ geoblockBlocked: false }) },
    );
    const blocked = await executePolymarketChat(
      { message: "prepare a $10 Yes order", marketId: "0xmarket-ai" },
      { provider: providerWith({ geoblockBlocked: true }) },
    );
    expect(allowed.preview?.canSubmit).toBe(false);
    expect(blocked.preview?.canSubmit).toBe(false);
  });

  test("forbidden-credential pattern mirror is present", () => {
    expect(POLYMARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN).toContain("private");
    expect(POLYMARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN).toContain("signature");
  });
});
