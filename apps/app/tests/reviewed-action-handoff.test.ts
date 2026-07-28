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

    expect(sessionPage).toContain(
      'subscribeReviewedActionHandoff((handoff) => setCurrentSidePanel(handoff.protocol))',
    );
  });

  it("makes a disabled Hyperliquid submission route clear before wallet connection", () => {
    const walletPanel = readFileSync(
      resolve(import.meta.dir, "../src/react-app/domains/wallet/pages/BittensorPanel.tsx"),
      "utf8",
    );

    expect(walletPanel).toContain("const executionUnavailable = executionAvailable !== true;");
    expect(walletPanel).toContain("const executionStatusMessage = executionAvailable === false");
    expect(walletPanel).toContain("title=\"Wallet submission unavailable\"");
    expect(walletPanel).toContain("disabled={executionUnavailable || !firstConnector || connectPending}");
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
        network: "testnet",
        asset: "BTC",
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

  it("hands off Bittensor transfers but keeps staking and advanced calls prepare-only", () => {
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
        sender: "5Sender",
        destination: "5Destination",
        amountTao: "0.25",
      },
    });

    expect(reviewedActionHandoffFromCard({
      kind: "action_preview",
      venue: "bittensor",
      data: {
        preview: {
          action: "stake",
          destination: "5Destination",
          amountTao: 1,
        },
      },
    })).toBeNull();
  });
});
