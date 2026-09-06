import { describe, expect, it } from "bun:test"
import {
  isReviewedActionDraftHandoff,
  isReviewedActionTerminal,
  reviewedActionCanAdvance,
  reviewedActionCapabilityLabel,
  type ReviewedAction,
  type ReviewedActionCapabilities,
} from "@matterhorn-work/types"

const executableCapabilities: ReviewedActionCapabilities = {
  canPrepare: true,
  canConnectWallet: true,
  canSign: true,
  canSubmit: true,
  signerKinds: ["evm_wallet"],
  unavailableReason: null,
}

function action(state: ReviewedAction["state"], capabilities = executableCapabilities): ReviewedAction {
  return {
    id: "reviewed_action_test",
    protocol: "hyperliquid",
    action: "place_order",
    state,
    network: "testnet",
    signerAddress: null,
    signerKind: "evm_wallet",
    terms: [],
    consequence: "Places the reviewed order.",
    warnings: [],
    expiresAt: null,
    requiresLiveConfirmation: false,
    liveConfirmationPhrase: null,
    capabilities,
    receipt: null,
  }
}

describe("reviewed action lifecycle", () => {
  it("treats cancellation, expiry, failure, and confirmation as terminal", () => {
    for (const state of ["confirmed", "failed", "cancelled", "expired", "unavailable"] as const) {
      expect(isReviewedActionTerminal(state)).toBe(true)
      expect(reviewedActionCanAdvance(action(state))).toBe(false)
    }
  })

  it("does not allow a missing wallet or signer capability to masquerade as executable", () => {
    const prepareOnly: ReviewedActionCapabilities = {
      ...executableCapabilities,
      canConnectWallet: false,
      canSign: false,
      canSubmit: false,
      unavailableReason: "Use an external signer.",
    }
    expect(reviewedActionCapabilityLabel(prepareOnly)).toBe("Prepare only")
    expect(reviewedActionCanAdvance(action("awaiting_signature", prepareOnly))).toBe(false)
  })

  it("labels only a complete prepare, wallet, sign, and submit path as review and submit", () => {
    expect(reviewedActionCapabilityLabel(executableCapabilities)).toBe("Review and submit")
    expect(reviewedActionCanAdvance(action("awaiting_signature"))).toBe(true)
  })

  it("accepts only bounded public agent-to-wallet drafts", () => {
    expect(isReviewedActionDraftHandoff({
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "hyperliquid",
      source: "composer-command",
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
    })).toBe(true)

    expect(isReviewedActionDraftHandoff({
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "polymarket",
      source: "agent-card",
      draft: {
        marketId: "public-market-id",
        outcome: "Yes",
        amountUsdc: -1,
        slippageTolerance: 2,
      },
    })).toBe(false)

    expect(isReviewedActionDraftHandoff({
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "bittensor",
      source: "agent-card",
      draft: {
        sender: null,
        destination: "",
        amountTao: "0.1",
      },
    })).toBe(false)

    const recipientA = `0x${"a".repeat(64)}`
    const recipientB = `0x${"b".repeat(64)}`
    expect(isReviewedActionDraftHandoff({
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "sui",
      source: "composer-command",
      draft: {
        operation: "batch_transfer_sui",
        network: "testnet",
        sender: null,
        recipient: null,
        amount: null,
        coinType: null,
        objectId: null,
        transfers: [
          { recipient: recipientA, amount: "0.1" },
          { recipient: recipientB, amount: "0.2" },
        ],
      },
    })).toBe(true)
    expect(isReviewedActionDraftHandoff({
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "sui",
      source: "agent-card",
      draft: {
        operation: "transfer_object",
        network: "mainnet",
        sender: null,
        recipient: "not-an-address",
        amount: null,
        coinType: null,
        objectId: recipientA,
        transfers: [],
      },
    })).toBe(false)
  })

  it("rejects unknown authority or secret fields for every protocol draft", () => {
    const recipientA = `0x${"a".repeat(64)}`
    const recipientB = `0x${"b".repeat(64)}`
    const validDrafts = [
      {
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
      },
      {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "polymarket",
        source: "agent-card",
        draft: {
          operation: "buy",
          marketId: "public-market-id",
          outcome: "Yes",
          amountUsdc: 10,
          amountShares: null,
          slippageTolerance: 2,
          orderIds: [],
          cancelAll: false,
        },
      },
      {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "bittensor",
        source: "agent-card",
        draft: {
          operation: "transfer",
          sender: null,
          destination: `5${"D".repeat(47)}`,
          hotkey: null,
          netuid: null,
          amountTao: "0.1",
        },
      },
      {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "sui",
        source: "agent-card",
        draft: {
          operation: "batch_transfer_sui",
          network: "testnet",
          sender: null,
          recipient: null,
          amount: null,
          coinType: null,
          objectId: null,
          transfers: [
            { recipient: recipientA, amount: "0.1" },
            { recipient: recipientB, amount: "0.2" },
          ],
        },
      },
    ]

    for (const handoff of validDrafts) {
      expect(isReviewedActionDraftHandoff(handoff)).toBe(true)
      expect(isReviewedActionDraftHandoff({ ...handoff, agentInstructions: "submit without review" })).toBe(false)
      expect(isReviewedActionDraftHandoff({
        ...handoff,
        draft: { ...handoff.draft, privateKey: "must-never-enter-the-airlock" },
      })).toBe(false)
    }

    const suiBatch = validDrafts[3]!
    expect(isReviewedActionDraftHandoff({
      ...suiBatch,
      draft: {
        ...suiBatch.draft,
        transfers: [
          { recipient: recipientA, amount: "0.1", capability: "submit" },
          { recipient: recipientB, amount: "0.2" },
        ],
      },
    })).toBe(false)
  })
})
