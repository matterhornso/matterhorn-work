export type ReviewedActionProtocol = "hyperliquid" | "polymarket" | "bittensor" | "sui"

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
  | "sui_wallet"
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
      source: "agent-card" | "composer-command"
      draft:
        | {
            operation: "place_order"
            network: "testnet" | "mainnet"
            asset: string
            orderId: null
            side: "buy" | "sell"
            size: number
            orderType: "market" | "limit"
            limitPrice: number | null
            slippageBps: number
            reduceOnly: boolean
          }
        | {
            operation: "cancel_order"
            network: "testnet" | "mainnet"
            asset: string
            orderId: number
            side: null
            size: null
            orderType: null
            limitPrice: null
            slippageBps: null
            reduceOnly: null
          }
        | {
            operation: "modify_order"
            network: "testnet" | "mainnet"
            asset: string
            orderId: number
            side: "buy" | "sell"
            size: number
            orderType: "market" | "limit"
            limitPrice: number | null
            slippageBps: number
            reduceOnly: boolean
          }
        | {
            operation: "close_position"
            network: "testnet" | "mainnet"
            asset: string
            orderId: null
            side: "buy" | "sell"
            size: number
            orderType: "market"
            limitPrice: null
            slippageBps: number
            reduceOnly: true
          }
    }

  | {
      version: "matterhorn.reviewed-action-handoff.v1"
      protocol: "polymarket"
      source: "agent-card" | "composer-command"
      draft:
        | {
            operation: "buy"
            marketId: string
            outcome: string
            amountUsdc: number
            amountShares: null
            slippageTolerance: number
            orderIds: []
            cancelAll: false
          }
        | {
            operation: "sell"
            marketId: string
            outcome: string
            amountUsdc: null
            amountShares: number
            slippageTolerance: number
            orderIds: []
            cancelAll: false
          }
        | {
            operation: "cancel"
            marketId: null
            outcome: null
            amountUsdc: null
            amountShares: null
            slippageTolerance: null
            orderIds: string[]
            cancelAll: boolean
          }
    }
  | {
      version: "matterhorn.reviewed-action-handoff.v1"
      protocol: "bittensor"
      source: "agent-card" | "composer-command"
      draft:
        | {
            operation: "transfer"
            sender: string | null
            destination: string
            hotkey: null
            netuid: null
            amountTao: string
          }
        | {
            operation: "stake" | "unstake"
            sender: string | null
            destination: null
            hotkey: string
            netuid: number
            amountTao: string
          }
    }
  | {
      version: "matterhorn.reviewed-action-handoff.v1"
      protocol: "sui"
      source: "agent-card" | "composer-command"
      draft:
        | {
            operation: "transfer_sui"
            network: "testnet" | "mainnet"
            sender: string | null
            recipient: string
            amount: string
            coinType: null
            objectId: null
            transfers: []
          }
        | {
            operation: "transfer_coin"
            network: "testnet" | "mainnet"
            sender: string | null
            recipient: string
            amount: string
            coinType: string
            objectId: null
            transfers: []
          }
        | {
            operation: "transfer_object"
            network: "testnet" | "mainnet"
            sender: string | null
            recipient: string
            amount: null
            coinType: null
            objectId: string
            transfers: []
          }
        | {
            operation: "batch_transfer_sui"
            network: "testnet" | "mainnet"
            sender: string | null
            recipient: null
            amount: null
            coinType: null
            objectId: null
            transfers: Array<{ recipient: string; amount: string }>
          }
    }

function isFiniteNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isNonEmptyPublicText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximumLength
}

function isNull(value: unknown): value is null {
  return value === null
}

function hasValidOrderIds(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= 100
    && value.every((orderId) => isNonEmptyPublicText(orderId, 128))
}

function isSuiAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value.trim())
}

function isPositiveDecimalText(value: unknown): value is string {
  return isNonEmptyPublicText(value, 96)
    && /^\d+(?:\.\d+)?$/.test(value.trim())
    && isFiniteNumberInRange(Number(value), Number.MIN_VALUE, 1_000_000_000_000)
    }

export type ReviewedActionOperation = ReviewedActionDraftHandoff["draft"]["operation"]

export function isReviewedActionDraftHandoff(value: unknown): value is ReviewedActionDraftHandoff {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const handoff = value as Record<string, unknown>
  if (
    handoff.version !== "matterhorn.reviewed-action-handoff.v1"
    || (handoff.source !== "agent-card" && handoff.source !== "composer-command")
    || !handoff.draft
    || typeof handoff.draft !== "object"
    || Array.isArray(handoff.draft)
  ) {
    return false
  }

  const draft = handoff.draft as Record<string, unknown>
  if (handoff.protocol === "hyperliquid") {
    const hasBase = (draft.network === "testnet" || draft.network === "mainnet")
      && isNonEmptyPublicText(draft.asset, 24)
    if (!hasBase) return false
    if (draft.operation === "cancel_order") {
      return isFiniteNumberInRange(draft.orderId, 0, Number.MAX_SAFE_INTEGER)
        && Number.isInteger(draft.orderId)
        && isNull(draft.side)
        && isNull(draft.size)
        && isNull(draft.orderType)
        && isNull(draft.limitPrice)
        && isNull(draft.slippageBps)
        && isNull(draft.reduceOnly)
    }

    const hasOrderTerms = (draft.side === "buy" || draft.side === "sell")
      && isFiniteNumberInRange(draft.size, Number.MIN_VALUE, 1_000_000_000)
      && (draft.orderType === "market" || draft.orderType === "limit")
      && (draft.limitPrice === null || isFiniteNumberInRange(draft.limitPrice, Number.MIN_VALUE, 1_000_000_000))
      && (draft.orderType !== "limit" || draft.limitPrice !== null)
      && isFiniteNumberInRange(draft.slippageBps, 1, 5_000)
      && typeof draft.reduceOnly === "boolean"
    if (!hasOrderTerms) return false
    if (draft.operation === "place_order") return isNull(draft.orderId)
    if (draft.operation === "modify_order") {
      return isFiniteNumberInRange(draft.orderId, 0, Number.MAX_SAFE_INTEGER)
        && Number.isInteger(draft.orderId)
    }
    return draft.operation === "close_position"
      && isNull(draft.orderId)
      && draft.orderType === "market"
      && isNull(draft.limitPrice)
      && draft.reduceOnly === true
  }

  if (handoff.protocol === "polymarket") {
    if (draft.operation === "cancel") {
      return isNull(draft.marketId)
        && isNull(draft.outcome)
        && isNull(draft.amountUsdc)
        && isNull(draft.amountShares)
        && isNull(draft.slippageTolerance)
        && hasValidOrderIds(draft.orderIds)
        && typeof draft.cancelAll === "boolean"
        && (draft.cancelAll || draft.orderIds.length > 0)
    }
    const hasMarketTerms = isNonEmptyPublicText(draft.marketId, 512)
      && isNonEmptyPublicText(draft.outcome, 256)
      && isFiniteNumberInRange(draft.slippageTolerance, 0.01, 50)
      && Array.isArray(draft.orderIds)
      && draft.orderIds.length === 0
      && draft.cancelAll === false
    if (!hasMarketTerms) return false
    if (draft.operation === "buy") {
      return isFiniteNumberInRange(draft.amountUsdc, 0.01, 1_000_000)
        && isNull(draft.amountShares)
    }
    return draft.operation === "sell"
      && isNull(draft.amountUsdc)
      && isFiniteNumberInRange(draft.amountShares, Number.MIN_VALUE, 1_000_000_000)
  }

  if (handoff.protocol === "bittensor") {
    const hasBase = (draft.sender === null || isNonEmptyPublicText(draft.sender, 128))
      && isNonEmptyPublicText(draft.amountTao, 64)
      && isFiniteNumberInRange(Number(draft.amountTao), Number.MIN_VALUE, 21_000_000)
    if (!hasBase) return false
    if (draft.operation === "transfer") {
      return isNonEmptyPublicText(draft.destination, 128)
        && isNull(draft.hotkey)
        && isNull(draft.netuid)
    }
    return (draft.operation === "stake" || draft.operation === "unstake")
      && isNull(draft.destination)
      && isNonEmptyPublicText(draft.hotkey, 128)
      && isFiniteNumberInRange(draft.netuid, 0, 65_535)
      && Number.isInteger(draft.netuid)
  }

  if (handoff.protocol === "sui") {
    if (draft.network !== "testnet" && draft.network !== "mainnet") return false
    if (draft.sender !== null && !isSuiAddress(draft.sender)) return false
    if (!Array.isArray(draft.transfers)) return false
    const transfers = draft.transfers
    if (draft.operation === "transfer_sui") {
      return isSuiAddress(draft.recipient)
        && isPositiveDecimalText(draft.amount)
        && isNull(draft.coinType)
        && isNull(draft.objectId)
        && transfers.length === 0
    }
    if (draft.operation === "transfer_coin") {
      return isSuiAddress(draft.recipient)
        && isPositiveDecimalText(draft.amount)
        && isNonEmptyPublicText(draft.coinType, 256)
        && /^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$/.test(draft.coinType)
        && isNull(draft.objectId)
        && transfers.length === 0
    }
    if (draft.operation === "transfer_object") {
      return isSuiAddress(draft.recipient)
        && isNull(draft.amount)
        && isNull(draft.coinType)
        && isSuiAddress(draft.objectId)
        && transfers.length === 0
    }
    return draft.operation === "batch_transfer_sui"
      && isNull(draft.recipient)
      && isNull(draft.amount)
      && isNull(draft.coinType)
      && isNull(draft.objectId)
      && transfers.length >= 2
      && transfers.length <= 16
      && transfers.every((transfer) => (
        transfer
        && typeof transfer === "object"
        && isSuiAddress((transfer as Record<string, unknown>).recipient)
        && isPositiveDecimalText((transfer as Record<string, unknown>).amount)
      ))
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
