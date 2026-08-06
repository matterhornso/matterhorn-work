import { describe, expect, it } from "bun:test";

import {
  reviewedActionHandoffFromComposer,
  reviewedActionPreparedChatText,
} from "../src/react-app/domains/session/workflows/reviewed-action-command";

describe("reviewed action composer commands", () => {
  it("stages a bounded Hyperliquid market order on testnet by default", () => {
    expect(reviewedActionHandoffFromComposer("buy 1btc", "hyperliquid")).toEqual({
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "hyperliquid",
      source: "composer-command",
      draft: {
        operation: "place_order",
        network: "testnet",
        asset: "BTC",
        orderId: null,
        side: "buy",
        size: 1,
        orderType: "market",
        limitPrice: null,
        slippageBps: 100,
        reduceOnly: false,
      },
    });
  });

  it("stages Hyperliquid cancel, modify, and close tickets with exact terms", () => {
    expect(reviewedActionHandoffFromComposer(
      "cancel order 12345 for BTC on Hyperliquid testnet",
      "hyperliquid",
    )?.draft).toEqual({
      operation: "cancel_order",
      network: "testnet",
      asset: "BTC",
      orderId: 12345,
      side: null,
      size: null,
      orderType: null,
      limitPrice: null,
      slippageBps: null,
      reduceOnly: null,
    });
    expect(reviewedActionHandoffFromComposer(
      "modify order 12345 to sell 0.02 BTC limit at 65000 on Hyperliquid",
      "hyperliquid",
    )?.draft).toMatchObject({
      operation: "modify_order",
      orderId: 12345,
      side: "sell",
      size: 0.02,
      orderType: "limit",
      limitPrice: 65_000,
    });
    expect(reviewedActionHandoffFromComposer(
      "close 0.1 BTC long on Hyperliquid",
      "hyperliquid",
    )?.draft).toMatchObject({
      operation: "close_position",
      asset: "BTC",
      side: "sell",
      size: 0.1,
      reduceOnly: true,
    });
    expect(reviewedActionHandoffFromComposer(
      "cancel 12345 for BTC on Hyperliquid",
      "hyperliquid",
    )).toBeNull();
  });

  it("requires a price for limit orders and explicit text for mainnet", () => {
    expect(reviewedActionHandoffFromComposer("sell 0.01 BTC limit", "hyperliquid")).toBeNull();
    expect(reviewedActionHandoffFromComposer(
      "sell 0.01 BTC limit at $75,000 on mainnet with 25 bps slippage reduce-only",
      "hyperliquid",
    )).toMatchObject({
      protocol: "hyperliquid",
      draft: {
        network: "mainnet",
        side: "sell",
        orderType: "limit",
        limitPrice: 75_000,
        slippageBps: 25,
        reduceOnly: true,
      },
    });
  });

  it("stages Polymarket sell and cancel tickets with exact public terms", () => {
    expect(reviewedActionHandoffFromComposer(
      "Sell 3 Yes shares on Polymarket market 123456",
      "polymarket",
    )?.draft).toMatchObject({
      operation: "sell",
      marketId: "123456",
      outcome: "Yes",
      amountUsdc: null,
      amountShares: 3,
    });
    expect(reviewedActionHandoffFromComposer(
      "cancel Polymarket order pm_order_123",
      "polymarket",
    )?.draft).toEqual({
      operation: "cancel",
      marketId: null,
      outcome: null,
      amountUsdc: null,
      amountShares: null,
      slippageTolerance: null,
      orderIds: ["pm_order_123"],
      cancelAll: false,
    });
    expect(reviewedActionHandoffFromComposer(
      "cancel all orders on Polymarket",
      "polymarket",
    )?.draft).toMatchObject({
      operation: "cancel",
      orderIds: [],
      cancelAll: true,
    });
  });

  it("stages a Polymarket ticket only with exact public market terms", () => {
    expect(reviewedActionHandoffFromComposer(
      "Buy Yes for $10 on Polymarket market 123456",
      "polymarket",
    )).toMatchObject({
      protocol: "polymarket",
      source: "composer-command",
      draft: {
        marketId: "123456",
        outcome: "Yes",
        amountUsdc: 10,
      },
    });
    expect(reviewedActionHandoffFromComposer("buy Yes for $10", "polymarket")).toBeNull();
  });

  it("stages a Bittensor transfer only with an amount and SS58 destination", () => {
    const destination = `5${"A".repeat(47)}`;
    expect(reviewedActionHandoffFromComposer(
      `transfer 0.25 TAO to ${destination}`,
      "bittensor",
    )).toMatchObject({
      protocol: "bittensor",
      source: "composer-command",
      draft: {
        operation: "transfer",
        sender: null,
        destination,
        hotkey: null,
        netuid: null,
        amountTao: "0.25",
      },
    });
    expect(reviewedActionHandoffFromComposer("transfer some TAO", "bittensor")).toBeNull();
  });

  it("stages Bittensor stake and unstake tickets for a connected wallet", () => {
    const hotkey = `5${"B".repeat(47)}`;
    expect(reviewedActionHandoffFromComposer(
      `stake 1 TAO to ${hotkey} on subnet 7`,
      "bittensor",
    )?.draft).toEqual({
      operation: "stake",
      sender: null,
      destination: null,
      hotkey,
      netuid: 7,
      amountTao: "1",
    });
    expect(reviewedActionHandoffFromComposer(
      `unstake 0.5 TAO from ${hotkey} on netuid 7`,
      "bittensor",
    )?.draft).toMatchObject({
      operation: "unstake",
      hotkey,
      netuid: 7,
      amountTao: "0.5",
    });
  });

  it("stages native Sui, custom coin, object, and batch transfer tickets", () => {
    const recipientA = `0x${"a".repeat(64)}`;
    const recipientB = `0x${"b".repeat(64)}`;
    const objectId = `0x${"c".repeat(64)}`;

    expect(reviewedActionHandoffFromComposer(
      `send 0.25 SUI to ${recipientA}`,
      "sui",
    )?.draft).toEqual({
      operation: "transfer_sui",
      network: "testnet",
      sender: null,
      recipient: recipientA,
      amount: "0.25",
      coinType: null,
      objectId: null,
      transfers: [],
    });
    expect(reviewedActionHandoffFromComposer(
      `send 2 0x2::coin::COIN to ${recipientA} on mainnet`,
      "sui",
    )?.draft).toMatchObject({
      operation: "transfer_coin",
      network: "mainnet",
      amount: "2",
      coinType: "0x2::coin::COIN",
    });
    expect(reviewedActionHandoffFromComposer(
      `transfer object ${objectId} to ${recipientA}`,
      "sui",
    )?.draft).toMatchObject({
      operation: "transfer_object",
      recipient: recipientA,
      objectId,
    });
    expect(reviewedActionHandoffFromComposer(
      `batch send SUI to ${recipientA} 0.1, ${recipientB} 0.2`,
      "sui",
    )?.draft).toMatchObject({
      operation: "batch_transfer_sui",
      transfers: [
        { recipient: recipientA, amount: "0.1" },
        { recipient: recipientB, amount: "0.2" },
      ],
    });
  });

  it("does not infer a financial protocol outside a matching desk", () => {
    expect(reviewedActionHandoffFromComposer("buy 1 BTC", "blank")).toBeNull();
  });

  it("describes the prepared action and makes wallet approval explicit in chat", () => {
    const handoff = reviewedActionHandoffFromComposer("buy 0.001 BTC", "hyperliquid");
    expect(handoff).not.toBeNull();
    const text = reviewedActionPreparedChatText(handoff!);
    expect(text).toContain("Hyperliquid order prepared");
    expect(text).toContain("Buy 0.001 BTC");
    expect(text).toContain("open Wallet panel");
    expect(text).toContain("Nothing is submitted until you approve it in your wallet");
  });
});
