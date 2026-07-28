import { describe, expect, it } from "vitest";
import {
  POLYMARKET_LIVE_CONFIRMATION,
  assertPolymarketPreparedOrder,
  type PolymarketPreparedOrder,
} from "../src/react-app/domains/wallet/polymarket-execution";

function prepared(overrides: Partial<PolymarketPreparedOrder> = {}): PolymarketPreparedOrder {
  return {
    marketId: "condition-1",
    tokenId: "token-yes",
    marketLabel: "Will the test pass?",
    outcome: "Yes",
    amountUsdc: 5,
    estimatedFillPrice: 0.55,
    estimatedShares: 9.09,
    maxLossUsdc: 5,
    previewSha256: "abc",
    expiresAt: "2030-01-01T00:00:00.000Z",
    compliance: { status: "allowed", reason: null },
    warnings: [],
    ...overrides,
  };
}

describe("Polymarket reviewed execution", () => {
  it("accepts an unexpired, compliance-allowed exact order", () => {
    expect(() => assertPolymarketPreparedOrder(prepared(), Date.parse("2029-01-01"))).not.toThrow();
  });

  it("blocks compliance-restricted orders", () => {
    expect(() => assertPolymarketPreparedOrder(prepared({
      compliance: { status: "blocked", reason: "Region blocked" },
    }), Date.parse("2029-01-01"))).toThrow("Region blocked");
  });

  it("blocks expired reviews", () => {
    expect(() => assertPolymarketPreparedOrder(prepared(), Date.parse("2031-01-01"))).toThrow("expired");
  });

  it("uses an explicit live-order confirmation phrase", () => {
    expect(POLYMARKET_LIVE_CONFIRMATION).toBe("SUBMIT POLYMARKET ORDER");
  });
});
