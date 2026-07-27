export type ReviewedActionProtocol = "hyperliquid" | "polymarket" | "bittensor"

export type ReviewedActionState =
  | "draft"
  | "ready_for_review"
  | "awaiting_wallet"
  | "awaiting_signature"
  | "submitting"
  | "submitted"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "expired"
  | "unavailable"

export type ReviewedActionSignerKind =
  | "evm_wallet"
  | "polkadot_extension"
  | "external_signer"

export interface ReviewedActionCapabilities {
  canPrepare: boolean
  canConnectWallet: boolean
  canSign: boolean
  canSubmit: boolean
  signerKinds: ReviewedActionSignerKind[]
  unavailableReason: string | null
}

export interface ReviewedActionTerm {
  label: string
  value: string
  emphasis?: "default" | "positive" | "warning" | "danger"
}

export interface ReviewedActionReceipt {
  status: "submitted" | "confirmed" | "failed" | "cancelled" | "expired"
  publicId: string | null
  transactionHash: string | null
  blockHash: string | null
  submittedAt: string | null
  confirmedAt: string | null
  message: string
  explorerUrl: string | null
}

export interface ReviewedAction {
  id: string
  protocol: ReviewedActionProtocol
  action: string
  state: ReviewedActionState
  network: string
  signerAddress: string | null
  signerKind: ReviewedActionSignerKind
  terms: ReviewedActionTerm[]
  consequence: string
  warnings: string[]
  expiresAt: string | null
  requiresLiveConfirmation: boolean
  liveConfirmationPhrase: string | null
  capabilities: ReviewedActionCapabilities
  receipt: ReviewedActionReceipt | null
}

export type ReviewedActionDraftHandoff =
  | {
      version: "matterhorn.reviewed-action-handoff.v1"
      protocol: "hyperliquid"
      source: "agent-card"
      draft: {
        network: "testnet" | "mainnet"
        asset: string
        side: "buy" | "sell"
        size: number
        orderType: "market" | "limit"
        limitPrice: number | null
        slippageBps: number
        reduceOnly: boolean
      }
    }
  | {
      version: "matterhorn.reviewed-action-handoff.v1"
      protocol: "polymarket"
      source: "agent-card"
      draft: {
        marketId: string
        outcome: string
        amountUsdc: number
        slippageTolerance: number
      }
    }
  | {
      version: "matterhorn.reviewed-action-handoff.v1"
      protocol: "bittensor"
      source: "agent-card"
      draft: {
        sender: string | null
        destination: string
        amountTao: string
      }
    }

function isFiniteNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isNonEmptyPublicText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximumLength
}

export function isReviewedActionDraftHandoff(value: unknown): value is ReviewedActionDraftHandoff {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const handoff = value as Record<string, unknown>
  if (
    handoff.version !== "matterhorn.reviewed-action-handoff.v1"
    || handoff.source !== "agent-card"
    || !handoff.draft
    || typeof handoff.draft !== "object"
    || Array.isArray(handoff.draft)
  ) {
    return false
  }

  const draft = handoff.draft as Record<string, unknown>
  if (handoff.protocol === "hyperliquid") {
    return (
      (draft.network === "testnet" || draft.network === "mainnet")
      && isNonEmptyPublicText(draft.asset, 24)
      && (draft.side === "buy" || draft.side === "sell")
      && isFiniteNumberInRange(draft.size, Number.MIN_VALUE, 1_000_000_000)
      && (draft.orderType === "market" || draft.orderType === "limit")
      && (draft.limitPrice === null || isFiniteNumberInRange(draft.limitPrice, Number.MIN_VALUE, 1_000_000_000))
      && (draft.orderType !== "limit" || draft.limitPrice !== null)
      && isFiniteNumberInRange(draft.slippageBps, 1, 5_000)
      && typeof draft.reduceOnly === "boolean"
    )
  }

  if (handoff.protocol === "polymarket") {
    return (
      isNonEmptyPublicText(draft.marketId, 512)
      && isNonEmptyPublicText(draft.outcome, 256)
      && isFiniteNumberInRange(draft.amountUsdc, 0.01, 1_000_000)
      && isFiniteNumberInRange(draft.slippageTolerance, 0.01, 50)
    )
  }

  if (handoff.protocol === "bittensor") {
    return (
      (draft.sender === null || isNonEmptyPublicText(draft.sender, 128))
      && isNonEmptyPublicText(draft.destination, 128)
      && isNonEmptyPublicText(draft.amountTao, 64)
      && isFiniteNumberInRange(Number(draft.amountTao), Number.MIN_VALUE, 21_000_000)
    )
  }

  return false
}

const TERMINAL_REVIEWED_ACTION_STATES = new Set<ReviewedActionState>([
  "confirmed",
  "failed",
  "cancelled",
  "expired",
  "unavailable",
])

export function isReviewedActionTerminal(state: ReviewedActionState): boolean {
  return TERMINAL_REVIEWED_ACTION_STATES.has(state)
}

export function reviewedActionCanAdvance(action: ReviewedAction): boolean {
  if (isReviewedActionTerminal(action.state)) return false
  if (action.state === "draft") return action.capabilities.canPrepare
  if (action.state === "ready_for_review") return action.capabilities.canConnectWallet
  if (action.state === "awaiting_wallet") return action.capabilities.canConnectWallet
  if (action.state === "awaiting_signature") return action.capabilities.canSign
  if (action.state === "submitting") return false
  if (action.state === "submitted") return true
  return false
}

export function reviewedActionCapabilityLabel(capabilities: ReviewedActionCapabilities): string {
  if (!capabilities.canPrepare) return "Unavailable"
  if (!capabilities.canConnectWallet || !capabilities.canSign || !capabilities.canSubmit) {
    return "Prepare only"
  }
  return "Review and submit"
}
