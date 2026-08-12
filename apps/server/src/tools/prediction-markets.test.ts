import { describe, expect, test } from "bun:test";
import type { PolymarketMarketSummary } from "./polymarket.js";
import {
  buildPredictionMarketVenuesResponse,
  searchPredictionMarkets,
} from "./prediction-markets.js";

const NOW = new Date("2026-08-11T12:00:00.000Z");

const polymarketMarket: PolymarketMarketSummary = {
  id: "pm-1",
  question: "Will Bitcoin exceed $150k in 2026?",
  slug: "bitcoin-150k-2026",
  eventId: null,
  eventTitle: null,
  description: null,
  outcomes: ["Yes", "No"],
  outcomePrices: { Yes: 0.42, No: 0.58 },
  tokenIds: {},
  volume: 2_000_000,
  liquidity: 100_000,
  endDate: "2026-12-31T00:00:00.000Z",
  active: true,
  closed: false,
  source: {
    source: "Polymarket Gamma API",
    fetchedAt: NOW.toISOString(),
    freshness: "live",
    warnings: [],
  },
};

const kalshiPayload = {
  markets: [{
    ticker: "KXBTC-26DEC31-150000",
    title: "Bitcoin price above $150,000 before 2027?",
    yes_sub_title: "$150,000 or more",
    status: "active",
    last_price_dollars: "0.4100",
    yes_bid_dollars: "0.4000",
    yes_ask_dollars: "0.4200",
    volume_fp: "3200.00",
    liquidity_dollars: "12000.00",
    close_time: "2026-12-31T23:59:00Z",
  }],
};

const manifoldPayload = [{
  id: "mf-1",
  question: "Will Bitcoin exceed $150k in 2026?",
  url: "https://manifold.markets/test/bitcoin-150k",
  probability: 0.39,
  volume: 5000,
  totalLiquidity: 800,
  closeTime: Date.parse("2026-12-31T23:59:00Z"),
  isResolved: false,
}];

async function marketFetch(input: string | URL | Request): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
  if (url.hostname === "external-api.kalshi.com") {
    return Response.json(kalshiPayload);
  }
  if (url.hostname === "api.manifold.markets") {
    return Response.json(manifoldPayload);
  }
  return new Response("not found", { status: 404 });
}

describe("prediction-market venue coverage", () => {
  test("publishes three venues without widening transaction authority", () => {
    const response = buildPredictionMarketVenuesResponse();
    expect(response.venues.map((venue) => venue.id)).toEqual(["polymarket", "kalshi", "manifold"]);
    expect(response.venues.find((venue) => venue.id === "polymarket")?.execution).toBe("wallet_reviewed");
    expect(response.venues.find((venue) => venue.id === "kalshi")?.execution).toBe("external_account");
    expect(response.venues.find((venue) => venue.id === "manifold")?.execution).toBe("research_only");
    expect(response.safety).toEqual({
      researchOnlyOutsideReviewedPolymarket: true,
      eligibilityCheckedBeforeExecution: true,
      unattendedTrading: false,
    });
  });

  test("normalizes live public search results from all supported venues", async () => {
    const response = await searchPredictionMarkets("bitcoin", 3, {
      now: () => NOW,
      fetchImpl: marketFetch,
      polymarket: { searchMarkets: async () => [polymarketMarket] },
    });

    expect(response.query).toBe("bitcoin");
    expect(response.markets.map((market) => market.venueId)).toEqual(["polymarket", "kalshi", "manifold"]);
    expect(response.markets.find((market) => market.venueId === "kalshi")?.probability).toBe(0.41);
    expect(response.markets.find((market) => market.venueId === "kalshi")?.title).toContain("$150,000 or more");
    expect(response.markets.find((market) => market.venueId === "manifold")?.unit).toBe("MANA");
    expect(response.venues.every((venue) => venue.status === "ready")).toBe(true);
  });

  test("keeps healthy venue results when one source is degraded", async () => {
    const response = await searchPredictionMarkets("bitcoin", 3, {
      now: () => NOW,
      polymarket: { searchMarkets: async () => [polymarketMarket] },
      fetchImpl: async (input) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
        if (url.hostname === "external-api.kalshi.com") throw new Error("provider unavailable");
        return Response.json(manifoldPayload);
      },
    });

    expect(response.markets.map((market) => market.venueId)).toEqual(["polymarket", "manifold"]);
    expect(response.venues.find((venue) => venue.venueId === "kalshi")?.status).toBe("degraded");
    expect(response.safety.researchOnlyOutsideReviewedPolymarket).toBe(true);
  });
});
