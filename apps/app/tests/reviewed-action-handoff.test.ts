import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { reviewedActionHandoffFromCard } from "../src/react-app/domains/wallet/reviewed-action-handoff";

describe("agent card to wallet review handoff", () => {
  it("opens the matching protocol ticket instead of generic wallet settings", () => {
    const sessionPage = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/session/chat/session-page.tsx"),
      "utf8",
    );

    expect(sessionPage).toContain("subscribeReviewedActionHandoff((handoff) => {");
    expect(sessionPage).toContain("setReviewedActionEntryProtocol(handoff.protocol);");
    expect(sessionPage).toContain("setCurrentSidePanel(handoff.protocol);");
  });

  it("makes a disabled Hyperliquid submission route clear before wallet connection", () => {
    const walletPanel = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/wallet/pages/BittensorPanel.tsx"),
      "utf8",
    );

    expect(walletPanel).toContain("const executionUnavailable = executionAvailable !== true;");
    expect(walletPanel).toContain("const executionStatusMessage = executionAvailable === false");
    expect(walletPanel).toContain('value: "Review, sign, and submit"');
    expect(walletPanel).toContain("disabled={!firstConnector || connectPending}");
    expect(walletPanel).toContain("disabled={executionUnavailable || busy !== null || !isConnected");
    expect(walletPanel).toContain("onClick={reviewAction} disabled={busy !== null}");
    expect(walletPanel).toContain("Connect wallet to continue");
    expect(walletPanel).toContain("Prepare wallet signature");
    expect(walletPanel).toContain("executionAvailable={marketExecutionReadiness?.reviewedWalletTickets.hyperliquid.available ?? null}");
  });

  it("sanitizes a Hyperliquid preview into exact public order terms", () => {
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "hyperliquid",
      data: {
        preview: {
          asset: "btc",
          side: "buy",
          size: 0.001,
          orderType: "market",
          price: null,
          slippageTolerance: 1,
          reduceOnly: false,
          arbitrarySignedPayload: "must-not-cross-the-boundary",
        },
      },
    })).toEqual({
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "hyperliquid",
      source: "agent-card",
      draft: {
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
      },
    });
  });

  it("keeps a market draft market even when the agent includes an indicative mark", () => {
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "hyperliquid",
      data: {
        preview: {
          asset: "btc",
          side: "buy",
          size: 0.001,
          orderType: "market",
          price: 64519.5,
          slippageTolerance: 1,
          reduceOnly: false,
        },
      },
    })?.draft).toMatchObject({
      orderType: "market",
      limitPrice: null,
    });
  });

  it("carries an explicit limit price into the matching review ticket", () => {
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "hyperliquid",
      data: {
        preview: {
          asset: "btc",
          side: "sell",
          size: 0.002,
          orderType: "limit",
          price: 65000,
          slippageTolerance: 0.5,
          reduceOnly: true,
        },
      },
    })?.draft).toMatchObject({
      orderType: "limit",
      limitPrice: 65000,
      slippageBps: 50,
      reduceOnly: true,
    });
  });

  it("allows only compliance-approved complete Polymarket previews", () => {
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "polymarket",
      data: {
        preview: {
          marketId: "market-1",
          outcome: "Yes",
          size: 5,
          slippageTolerance: 2,
        },
      },
    })).toBeNull();

    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "polymarket",
      data: {
        preview: {
          marketId: "market-1",
          outcome: "Yes",
          size: 5,
          slippageTolerance: 2,
          compliance: { status: "blocked" },
        },
      },
    })).toBeNull();

    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "polymarket",
      data: {
        preview: {
          marketId: "market-1",
          outcome: "Yes",
          size: 5,
          slippageTolerance: 2,
          compliance: { status: "allowed" },
        },
      },
    })?.protocol).toBe("polymarket");
  });

  it("hands off Bittensor transfer, stake, and unstake drafts without signed payloads", () => {
    const transfer = reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "bittensor",
      data: {
        data: {
          preview: {
            action: "transfer",
            coldkey: "5Sender",
            destination: "5Destination",
            amountTao: 0.25,
            unsignedPayload: { call: "not-forwarded" },
          },
        },
      },
    });
    expect(transfer).toEqual({
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "bittensor",
      source: "agent-card",
      draft: {
        operation: "transfer",
        sender: "5Sender",
        destination: "5Destination",
        hotkey: null,
        netuid: null,
        amountTao: "0.25",
      },
    });

    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "bittensor",
      data: {
        preview: {
          action: "stake",
          sender: "5Sender",
          hotkey: "5Hotkey",
          netuid: 7,
          amountTao: 1,
        },
      },
    })?.draft).toEqual({
      operation: "stake",
      sender: "5Sender",
      destination: null,
      hotkey: "5Hotkey",
      netuid: 7,
      amountTao: "1",
    });
  });

  it("sanitizes Hyperliquid cancel and Polymarket sell/cancel cards", () => {
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "hyperliquid",
      data: { preview: { operation: "cancel_order", network: "mainnet", asset: "ETH", orderId: 42 } },
    })?.draft).toEqual({
      operation: "cancel_order",
      network: "mainnet",
      asset: "ETH",
      orderId: 42,
      side: null,
      size: null,
      orderType: null,
      limitPrice: null,
      slippageBps: null,
      reduceOnly: null,
    });
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "polymarket",
      data: {
        preview: {
          operation: "sell",
          marketId: "market-1",
          outcome: "No",
          amountShares: 2,
          compliance: { status: "allowed" },
        },
      },
    })?.draft).toMatchObject({
      operation: "sell",
      amountUsdc: null,
      amountShares: 2,
    });
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "polymarket",
      data: { preview: { operation: "cancel", orderIds: ["order_public_123"] } },
    })?.draft).toMatchObject({
      operation: "cancel",
      orderIds: ["order_public_123"],
      cancelAll: false,
    });
  });

  it("sanitizes every supported Sui transfer card and feeds the Sui review panel", () => {
    const recipientA = `0x${"a".repeat(64)}`;
    const recipientB = `0x${"b".repeat(64)}`;
    const objectId = `0x${"c".repeat(64)}`;

    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "sui",
      data: { preview: { operation: "transfer_sui", network: "testnet", recipient: recipientA, amount: 0.5 } },
    })?.draft).toMatchObject({
      operation: "transfer_sui",
      recipient: recipientA,
      amount: "0.5",
    });
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "sui",
      data: { preview: { operation: "transfer_coin", recipient: recipientA, amount: 2, coinType: "0x2::coin::COIN" } },
    })?.draft).toMatchObject({ operation: "transfer_coin", coinType: "0x2::coin::COIN" });
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "sui",
      data: { preview: { operation: "transfer_object", recipient: recipientA, objectId } },
    })?.draft).toMatchObject({ operation: "transfer_object", objectId });
    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "sui",
      data: { preview: { operation: "batch_transfer_sui", transfers: [
        { recipient: recipientA, amount: "0.1" },
        { recipient: recipientB, amount: "0.2" },
      ] } },
    })?.draft).toMatchObject({ operation: "batch_transfer_sui" });

    const suiPanel = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/wallet/sui-workflow-panel.tsx"),
      "utf8",
    );
    expect(suiPanel).toContain("subscribeReviewedActionHandoff");
    expect(suiPanel).toContain("setTransactionKind(draft.operation)");
    expect(suiPanel).toContain("setBatchTransfers(");
  });
});
