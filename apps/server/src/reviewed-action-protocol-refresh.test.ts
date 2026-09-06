import { describe, expect, test } from "bun:test";

import type { ReviewedActionDraftHandoff } from "@matterhorn-work/types/reviewed-actions";
import { buildReviewedActionHandoffV2 } from "./reviewed-action-airlock.js";
import { refreshReviewedActionProtocolState } from "./reviewed-action-protocol-refresh.js";
import { polymarketProvider } from "./tools/polymarket.js";

const MARKET_ID = `0x${"a".repeat(64)}`;
const TOKEN_ID = "71321045679252212594626385532706912750332728571942532289631379312455583992563";
const PREPARED_AT = new Date("2026-09-01T12:00:00.000Z");

function fixture(): {
  draft: Extract<ReviewedActionDraftHandoff, { protocol: "polymarket" }>;
  handoff: ReturnType<typeof buildReviewedActionHandoffV2>;
} {
  const draft: Extract<ReviewedActionDraftHandoff, { protocol: "polymarket" }> = {
    version: "matterhorn.reviewed-action-handoff.v1",
    protocol: "polymarket",
    source: "agent-card",
    draft: {
      operation: "buy",
      marketId: MARKET_ID,
      tokenId: TOKEN_ID,
      outcome: "Yes",
      orderType: "FAK",
      limitPrice: 0.47,
      tickSize: "0.01",
      negativeRisk: false,
      amountUsdc: 25,
      amountShares: null,
      slippageTolerance: 1,
      orderIds: [],
      cancelAll: false,
    },
  };
  return {
    draft,
    handoff: buildReviewedActionHandoffV2({
      handoff: draft,
      runId: "run_polymarket_refresh",
      signer: `0x${"1".repeat(40)}`,
      exactTerms: {
        network: "polymarket:polygon",
        operation: "buy",
        amount: "25",
        asset: TOKEN_ID,
        recipient: MARKET_ID,
        slippage: "100bps",
        signer: `0x${"1".repeat(40)}`,
      },
      simulation: { reference: "initial", block: "initial-book", simulatedAt: PREPARED_AT },
      preparedAt: PREPARED_AT,
      expiresAt: new Date("2026-09-01T12:05:00.000Z"),
    }),
  };
}

describe("Polymarket reviewed-action protocol refresh", () => {
  test("refreshes only the exact CLOB token and never uses server-IP compliance as an allow signal", async () => {
    const originalBook = polymarketProvider.getOrderbook;
    const originalCompliance = polymarketProvider.checkCompliance;
    let complianceCalls = 0;
    polymarketProvider.checkCompliance = async () => {
      complianceCalls += 1;
      throw new Error("server_ip_must_not_authorize");
    };
    polymarketProvider.getOrderbook = async (tokenId) => ({
      marketId: MARKET_ID,
      reportedMarketId: MARKET_ID,
      tokenId,
      reportedTokenId: TOKEN_ID,
      outcome: "Yes",
      bids: [{ price: 0.44, size: 100, raw: null }],
      asks: [{ price: 0.46, size: 100, raw: null }],
      bestBid: 0.44,
      bestAsk: 0.46,
      midpoint: 0.45,
      spread: 0.02,
      tickSize: "0.01",
      minimumOrderSize: "1",
      negativeRisk: false,
      snapshotHash: `0x${"b".repeat(64)}`,
      snapshotTimestamp: "1788264000000",
      source: { source: "https://clob.polymarket.com/book", fetchedAt: PREPARED_AT.toISOString(), freshness: "live", warnings: [] },
      warnings: [],
    });
    try {
      const { draft, handoff } = fixture();
      const evidence = await refreshReviewedActionProtocolState({ handoff, currentDraft: draft });
      expect(evidence.materialChangeReasons).toEqual([]);
      expect(evidence.block).toBe(`0x${"b".repeat(64)}`);
      expect(evidence.reference).toHaveLength(64);
      expect(complianceCalls).toBe(0);
    } finally {
      polymarketProvider.getOrderbook = originalBook;
      polymarketProvider.checkCompliance = originalCompliance;
    }
  });

  test("invalidates market, token, tick-size, risk-mode, and bounded-liquidity drift", async () => {
    const originalBook = polymarketProvider.getOrderbook;
    polymarketProvider.getOrderbook = async (tokenId) => ({
      marketId: MARKET_ID,
      reportedMarketId: `0x${"c".repeat(64)}`,
      tokenId,
      reportedTokenId: "9",
      outcome: "Yes",
      bids: [{ price: 0.43, size: 1, raw: null }],
      asks: [{ price: 0.48, size: 1, raw: null }],
      bestBid: 0.43,
      bestAsk: 0.48,
      midpoint: 0.455,
      spread: 0.05,
      tickSize: "0.001",
      negativeRisk: true,
      snapshotHash: "changed",
      source: { source: "https://clob.polymarket.com/book", fetchedAt: PREPARED_AT.toISOString(), freshness: "live", warnings: [] },
      warnings: [],
    });
    try {
      const { draft, handoff } = fixture();
      const evidence = await refreshReviewedActionProtocolState({ handoff, currentDraft: draft });
      expect(evidence.materialChangeReasons).toEqual(expect.arrayContaining([
        "Polymarket returned an orderbook for a different market.",
        "Polymarket returned an orderbook for a different outcome token.",
        "Polymarket tick-size rules changed.",
        "Polymarket negative-risk mode changed.",
        "Visible liquidity inside the reviewed price limit is no longer sufficient.",
      ]));
    } finally {
      polymarketProvider.getOrderbook = originalBook;
    }
  });
});
