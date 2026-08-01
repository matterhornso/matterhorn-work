import { describe, expect, it } from "vitest";
import {
  POLYMARKET_CHAIN_ID,
  POLYMARKET_CANCEL_ALL_CONFIRMATION,
  POLYMARKET_CANCEL_CONFIRMATION,
  POLYMARKET_LIVE_CONFIRMATION,
  assertPolymarketPreparedOrder,
  normalizePolymarketOrderIds,
  submitPolymarketOrder,
  type PolymarketPreparedOrder,
} from "../src/react-app/domains/wallet/polymarket-execution";
import type { WalletClient } from "viem";

function prepared(overrides: Partial<PolymarketPreparedOrder> = {}): PolymarketPreparedOrder {
  return {
    tradeSide: "BUY",
    marketId: "condition-1",
    tokenId: "token-yes",
    marketLabel: "Will the test pass?",
    outcome: "Yes",
    amountUsdc: 5,
    amountShares: null,
    estimatedFillPrice: 0.55,
    estimatedShares: 9.09,
    estimatedProceedsUsdc: null,
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

  it("blocks invalid expiration timestamps", () => {
    expect(() => assertPolymarketPreparedOrder(prepared({ expiresAt: "not-a-date" }))).toThrow("expired");
  });

  it("blocks non-finite amounts and changed maximum loss", () => {
    expect(() => assertPolymarketPreparedOrder(prepared({ amountUsdc: Number.NaN }))).toThrow("positive");
    expect(() => assertPolymarketPreparedOrder(prepared({ maxLossUsdc: 4 }))).toThrow("no longer matches");
  });

  it("validates exact share quantity for sell orders", () => {
    expect(() => assertPolymarketPreparedOrder(prepared({
      tradeSide: "SELL",
      amountUsdc: null,
      amountShares: 4.5,
      maxLossUsdc: null,
      estimatedProceedsUsdc: 2.2,
    }), Date.parse("2029-01-01"))).not.toThrow();
    expect(() => assertPolymarketPreparedOrder(prepared({
      tradeSide: "SELL",
      amountUsdc: null,
      amountShares: 0,
      maxLossUsdc: null,
    }), Date.parse("2029-01-01"))).toThrow("share quantity");
  });

  it("normalizes and bounds exact cancellation order IDs", () => {
    expect(normalizePolymarketOrderIds("order_123, order_456\norder_123")).toEqual(["order_123", "order_456"]);
    expect(() => normalizePolymarketOrderIds(" ")).toThrow("at least one");
    expect(() => normalizePolymarketOrderIds("bad id!")).toThrow("invalid");
  });

  it("blocks submission before loading the exchange client when no wallet is connected", async () => {
    await expect(submitPolymarketOrder({
      walletClient: { account: undefined, chain: { id: POLYMARKET_CHAIN_ID } } as unknown as WalletClient,
      order: prepared(),
    })).rejects.toThrow("Connect an EVM wallet");
  });

  it("blocks submission before loading the exchange client on the wrong chain", async () => {
    await expect(submitPolymarketOrder({
      walletClient: { account: { address: "0x1111111111111111111111111111111111111111" }, chain: { id: 1 } } as unknown as WalletClient,
      order: prepared(),
    })).rejects.toThrow("Switch the connected wallet to Polygon");
  });

  it("uses an explicit live-order confirmation phrase", () => {
    expect(POLYMARKET_LIVE_CONFIRMATION).toBe("SUBMIT POLYMARKET ORDER");
    expect(POLYMARKET_CANCEL_CONFIRMATION).toBe("CANCEL POLYMARKET ORDERS");
    expect(POLYMARKET_CANCEL_ALL_CONFIRMATION).toBe("CANCEL ALL POLYMARKET ORDERS");
  });
});
