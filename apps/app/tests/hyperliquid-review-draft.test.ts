import { describe, expect, test } from "bun:test";

import { createHyperliquidReviewDraft } from "../src/react-app/domains/wallet/hyperliquid-review-draft";

const PLACE_INPUT = {
  operation: "place_order" as const,
  network: "testnet" as const,
  asset: " btc ",
  side: "buy" as const,
  size: "0.001",
  orderType: "market" as const,
  limitPrice: "",
  slippageBps: "100",
  reduceOnly: false,
  orderId: "",
};

describe("Hyperliquid pre-wallet action review", () => {
  test("creates exact market-order terms without a wallet address or signature", () => {
    expect(createHyperliquidReviewDraft(PLACE_INPUT)).toEqual({
      operation: "place_order",
      network: "testnet",
      asset: "BTC",
      orderId: null,
      side: "buy",
      size: 0.001,
      orderType: "market",
      limitPrice: null,
      slippageBps: 100,
      reduceOnly: false,
    });
  });

  test("preserves exact cancel, modify, and close terms", () => {
    expect(createHyperliquidReviewDraft({ ...PLACE_INPUT, operation: "cancel_order", orderId: "42" })).toMatchObject({
      operation: "cancel_order",
      orderId: 42,
      side: null,
      size: null,
    });
    expect(createHyperliquidReviewDraft({ ...PLACE_INPUT, operation: "modify_order", orderId: "43", orderType: "limit", limitPrice: "65000" })).toMatchObject({
      operation: "modify_order",
      orderId: 43,
      limitPrice: 65_000,
    });
    expect(createHyperliquidReviewDraft({ ...PLACE_INPUT, operation: "close_position", side: "sell" })).toMatchObject({
      operation: "close_position",
      side: "sell",
      orderType: "market",
      reduceOnly: true,
    });
  });

  test("rejects incomplete or unsafe review terms before wallet work begins", () => {
    expect(() => createHyperliquidReviewDraft({ ...PLACE_INPUT, size: "0" })).toThrow("Size must be greater than zero");
    expect(() => createHyperliquidReviewDraft({ ...PLACE_INPUT, slippageBps: "5001" })).toThrow("cannot exceed 5,000 bps");
    expect(() => createHyperliquidReviewDraft({ ...PLACE_INPUT, operation: "modify_order", orderId: "" })).toThrow("Order ID must be a positive whole number");
  });
});
