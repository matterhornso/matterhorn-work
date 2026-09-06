import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  reviewedActionHandoffFromCard,
  stageReviewedActionHandoff,
  takePendingCoworkerWalletIntentContext,
  takePendingReviewedActionGuard,
} from "../src/react-app/domains/wallet/reviewed-action-handoff";

function guardedSuiHandoff(options?: { simulatedAt?: string; expiresAt?: string }) {
  const now = new Date();
  return {
    version: "matterhorn.reviewed-action-handoff.v2" as const,
    protocol: "sui" as const,
    source: "agent-card" as const,
    runId: "run_guarded_ui",
    intentHash: "a".repeat(64),
    policyHash: "b".repeat(64),
    signer: `0x${"1".repeat(64)}`,
    network: "testnet",
    operation: "transfer_sui",
    amount: "0.1",
    asset: "SUI",
    recipient: `0x${"2".repeat(64)}`,
    slippage: null,
    expiresAt: options?.expiresAt ?? new Date(now.getTime() + 300_000).toISOString(),
    simulation: {
      reference: "sha256:preview",
      block: "checkpoint:1",
      simulatedAt: options?.simulatedAt ?? now.toISOString(),
    },
    preparedAt: now.toISOString(),
    capabilityClass: "wallet_review_only" as const,
    draft: {
      operation: "transfer_sui" as const,
      network: "testnet" as const,
      sender: `0x${"1".repeat(64)}`,
      recipient: `0x${"2".repeat(64)}`,
      amount: "0.1",
      coinType: null,
      objectId: null,
      transfers: [] as [],
    },
  };
}

describe("agent card to wallet review handoff", () => {
  it("prefers a fresh hash-bound v2 handoff over reparsing display copy", () => {
    const now = new Date();
    const guarded = {
      version: "matterhorn.reviewed-action-handoff.v2" as const,
      protocol: "sui" as const,
      source: "agent-card" as const,
      runId: "run_guarded_ui",
      intentHash: "a".repeat(64),
      policyHash: "b".repeat(64),
      signer: `0x${"1".repeat(64)}`,
      network: "testnet",
      operation: "transfer_sui",
      amount: "0.1",
      asset: "SUI",
      recipient: `0x${"2".repeat(64)}`,
      slippage: null,
      expiresAt: new Date(now.getTime() + 300_000).toISOString(),
      simulation: { reference: "sha256:preview", block: "checkpoint:1", simulatedAt: now.toISOString() },
      preparedAt: now.toISOString(),
      capabilityClass: "wallet_review_only" as const,
      draft: {
        operation: "transfer_sui" as const,
        network: "testnet" as const,
        sender: `0x${"1".repeat(64)}`,
        recipient: `0x${"2".repeat(64)}`,
        amount: "0.1",
        coinType: null,
        objectId: null,
        transfers: [] as [],
      },
    };
    const parsed = reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "sui",
      data: { reviewedAction: guarded, preview: { recipient: "malicious replacement", amount: "999" } },
    });
    expect(parsed).toEqual(guarded);
    expect(parsed && stageReviewedActionHandoff(parsed)).toBe(true);
    expect(takePendingReviewedActionGuard()?.intentHash).toBe(guarded.intentHash);
  });

  it("binds coworker identity to one exact, unexpired wallet handoff", () => {
    const handoff = guardedSuiHandoff();
    const context = {
      version: "matterhorn.coworker-wallet-intent-handoff.v1" as const,
      workspaceId: "workspace_exact",
      sessionId: "session_exact",
      coworkerId: "coworker_exact",
      intentId: "intent_exact",
      expectedRevision: 3,
      protocol: "sui" as const,
      network: `sui:${handoff.network}`,
      signer: handoff.signer,
      operation: handoff.operation,
      authorizedArgumentsHash: "c".repeat(64),
    };

    expect(stageReviewedActionHandoff(handoff, context)).toBe(true);
    expect(takePendingCoworkerWalletIntentContext("hyperliquid")).toBeNull();
    expect(takePendingCoworkerWalletIntentContext("sui")).toEqual(context);
    expect(takePendingCoworkerWalletIntentContext("sui")).toBeNull();
  });

  it("rejects expired or mutated coworker bindings but stages stale simulations for server refresh", () => {
    const stale = guardedSuiHandoff({
      simulatedAt: new Date(Date.now() - 120_000).toISOString(),
    });
    const context = {
      version: "matterhorn.coworker-wallet-intent-handoff.v1" as const,
      workspaceId: "workspace_exact",
      sessionId: "session_exact",
      coworkerId: "coworker_exact",
      intentId: "intent_exact",
      expectedRevision: 1,
      protocol: "sui" as const,
      network: `sui:${stale.network}`,
      signer: stale.signer,
      operation: stale.operation,
      authorizedArgumentsHash: "d".repeat(64),
    };
    expect(stageReviewedActionHandoff(stale, context)).toBe(true);
    expect(takePendingCoworkerWalletIntentContext("sui")).toEqual(context);

    expect(stageReviewedActionHandoff(stale, { ...context, operation: "transfer_object" })).toBe(false);
    expect(stageReviewedActionHandoff(stale, { ...context, authorizedArgumentsHash: "not-a-hash" })).toBe(false);
    expect(stageReviewedActionHandoff(guardedSuiHandoff({
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    }), context)).toBe(false);
    expect(stageReviewedActionHandoff({
      ...guardedSuiHandoff(),
      expiresAt: "not-a-date",
    }, context)).toBe(false);
  });

  it("opens the matching protocol ticket instead of generic wallet settings", () => {
    const sessionPage = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/session/chat/session-page.tsx"),
      "utf8",
    );

    expect(sessionPage).toContain("subscribeReviewedActionHandoff((handoff) => {");
    expect(sessionPage).toContain("setReviewedActionEntryProtocol(handoff.protocol);");
    expect(sessionPage).toContain("setCurrentSidePanel(handoff.protocol);");
    expect(sessionPage).toContain("stageReviewedActionHandoff(item.reviewedAction");
    expect(sessionPage).toContain("authorizedArgumentsHash: item.intent.authorizedArgumentsHash");
  });

  it("reconciles Sui, Hyperliquid, Bittensor, and Polymarket public results without exposing signing authority", () => {
    const suiPanel = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/wallet/sui-workflow-panel.tsx"),
      "utf8",
    );
    const marketPanel = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/wallet/pages/BittensorPanel.tsx"),
      "utf8",
    );

    for (const source of [suiPanel, marketPanel]) {
      expect(source).toContain("recordCoworkerWalletReceipt");
      expect(source).toContain("authorizedArgumentsHash: coworkerIntentContext.authorizedArgumentsHash");
      expect(source).toContain("Do not send it again");
      expect(source).not.toContain("MATTERHORN_CAPABILITY_SIGNING_SECRET");
      expect(source).not.toContain("MATTERHORN_AGENT_RUNTIME_SECRET");
    }
    expect(marketPanel).toContain('coworkerIntentContext?.protocol === "bittensor"');
    expect(marketPanel).toContain('coworkerIntentContext?.protocol === "polymarket"');
    expect(marketPanel).toContain("polymarketCoworkerWalletMismatchReason");
    expect(marketPanel).toContain("polymarketCoworkerWalletReceiptInput");
    expect(marketPanel).toContain("bittensorWalletNetworkMatches(coworkerIntentContext.network, nextReceipt.network)");
  });

  it("makes a disabled Hyperliquid submission route clear before wallet connection", () => {
    const walletPanel = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/wallet/pages/BittensorPanel.tsx"),
      "utf8",
    );

    expect(walletPanel).toContain("const executionUnavailable = executionAvailable !== true;");
    expect(walletPanel).toContain("const executionStatusMessage = executionAvailable === false");
    expect(walletPanel).toContain('value: "Ready in connected wallet"');
    expect(walletPanel).toContain('value: "Preview only"');
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
