import {
  isReviewedActionDraftHandoff,
  isReviewedActionHandoffV2,
  type ReviewedActionDraftHandoff,
  type ReviewedActionHandoffV2,
  type ReviewedActionWalletHandoff,
} from "@matterhorn-work/types";

const REVIEWED_ACTION_HANDOFF_EVENT = "matterhorn:reviewed-action-handoff";

let pendingHandoff: ReviewedActionDraftHandoff | null = null;
let pendingGuardedHandoff: ReviewedActionHandoffV2 | null = null;

type SharedActionCard = {
  kind?: string;
  originalKind?: string | null;
  venue?: string;
  data?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function finiteInteger(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeSlippageBps(value: unknown): number {
  const parsed = finiteNumber(value);
  if (parsed === null || parsed <= 0) return 100;
  const bps = parsed <= 50 ? parsed * 100 : parsed;
  return Math.min(5_000, Math.max(1, Math.round(bps)));
}

function publicOrderIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((orderId) => nonEmptyText(orderId))
    .filter((orderId): orderId is string => orderId !== null)
    .slice(0, 100);
}

function publicSuiTransfers(value: unknown): Array<{ recipient: string; amount: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const recipient = nonEmptyText(entry.recipient);
    const amount = finiteNumber(entry.amount ?? entry.amountSui);
    return recipient && amount !== null && amount > 0
      ? [{ recipient, amount: String(amount) }]
      : [];
  }).slice(0, 16);
}

export function reviewedActionHandoffFromCard(card: SharedActionCard): ReviewedActionWalletHandoff | null {
  if (card.kind !== "action_preview" || !isRecord(card.data)) return null;
  const guardedCandidate = card.data.reviewedAction
    ?? (isRecord(card.data.data) ? card.data.data.reviewedAction : undefined);
  if (isReviewedActionHandoffV2(guardedCandidate)) return guardedCandidate;
  const nestedData = isRecord(card.data.data) ? card.data.data : null;
  const preview = isRecord(card.data.preview)
    ? card.data.preview
    : nestedData && isRecord(nestedData.preview)
      ? nestedData.preview
      : null;
  if (!preview) return null;

  let candidate: ReviewedActionDraftHandoff | null = null;
  if (card.venue === "hyperliquid") {
    const asset = nonEmptyText(preview.asset);
    const side = nonEmptyText(preview.side)?.toLowerCase();
    const size = finiteNumber(preview.size);
    const price = finiteNumber(preview.price);
    const orderId = finiteInteger(preview.orderId);
    const orderType = preview.orderType === "limit" ? "limit" : "market";
    const rawOperation = nonEmptyText(preview.operation ?? preview.action)?.toLowerCase();
    const operation = rawOperation === "cancel" || rawOperation === "cancel_order"
      ? "cancel_order"
      : rawOperation === "modify" || rawOperation === "modify_order"
        ? "modify_order"
        : rawOperation === "close" || rawOperation === "close_position"
          ? "close_position"
          : "place_order";
    const network = preview.network === "mainnet" ? "mainnet" : "testnet";
    if (asset && operation === "cancel_order" && orderId !== null) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "hyperliquid",
        source: "agent-card",
        draft: {
          operation,
          network,
          asset: asset.toUpperCase(),
          orderId,
          side: null,
          size: null,
          orderType: null,
          limitPrice: null,
          slippageBps: null,
          reduceOnly: null,
        },
      };
    } else if (
      asset
      && (side === "buy" || side === "sell")
      && size !== null
      && size > 0
      && (operation !== "modify_order" || orderId !== null)
    ) {
      candidate = operation === "close_position"
        ? {
            version: "matterhorn.reviewed-action-handoff.v1",
            protocol: "hyperliquid",
            source: "agent-card",
            draft: {
              operation: "close_position",
              network,
              asset: asset.toUpperCase(),
              orderId: null,
              side,
              size,
              orderType: "market",
              limitPrice: null,
              slippageBps: safeSlippageBps(preview.slippageTolerance),
              reduceOnly: true,
            },
          }
        : operation === "modify_order"
          ? {
              version: "matterhorn.reviewed-action-handoff.v1",
              protocol: "hyperliquid",
              source: "agent-card",
              draft: {
                operation: "modify_order",
                network,
                asset: asset.toUpperCase(),
                orderId: orderId!,
                side,
                size,
                orderType,
                limitPrice: orderType === "limit" && price !== null && price > 0 ? price : null,
                slippageBps: safeSlippageBps(preview.slippageTolerance),
                reduceOnly: preview.reduceOnly === true,
              },
            }
          : {
              version: "matterhorn.reviewed-action-handoff.v1",
              protocol: "hyperliquid",
              source: "agent-card",
              draft: {
                operation: "place_order",
                network,
                asset: asset.toUpperCase(),
                orderId: null,
                side,
                size,
                orderType,
                limitPrice: orderType === "limit" && price !== null && price > 0 ? price : null,
                slippageBps: safeSlippageBps(preview.slippageTolerance),
                reduceOnly: preview.reduceOnly === true,
              },
            };
    }
  } else if (card.venue === "polymarket") {
    const rawOperation = nonEmptyText(preview.operation ?? preview.action)?.toLowerCase();
    const operation = rawOperation === "sell" || rawOperation === "sell_order"
      ? "sell"
      : rawOperation === "cancel" || rawOperation === "cancel_order" || rawOperation === "cancel_orders"
        ? "cancel"
        : "buy";
    const marketId = nonEmptyText(preview.marketId);
    const outcome = nonEmptyText(preview.outcome);
    const amountUsdc = finiteNumber(preview.amountUsdc ?? preview.size);
    const amountShares = finiteNumber(preview.amountShares ?? preview.shares ?? preview.size);
    const slippage = finiteNumber(preview.slippageTolerance);
    const orderIds = publicOrderIds(preview.orderIds);
    const singleOrderId = nonEmptyText(preview.orderId);
    if (singleOrderId && !orderIds.includes(singleOrderId)) orderIds.push(singleOrderId);
    const cancelAll = preview.cancelAll === true;
    if (operation === "cancel" && (cancelAll || orderIds.length > 0)) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "polymarket",
        source: "agent-card",
        draft: {
          operation,
          marketId: null,
          outcome: null,
          amountUsdc: null,
          amountShares: null,
          slippageTolerance: null,
          orderIds,
          cancelAll,
        },
      };
    } else if (
      marketId
      && outcome
      && ((operation === "buy" && amountUsdc !== null && amountUsdc > 0)
        || (operation === "sell" && amountShares !== null && amountShares > 0))
      && isRecord(preview.compliance)
      && preview.compliance.status === "allowed"
    ) {
      const commonDraft = {
        marketId,
        outcome,
        slippageTolerance: slippage !== null && slippage > 0 ? Math.min(slippage, 50) : 2,
        orderIds: [] as [],
        cancelAll: false as const,
      };
      candidate = operation === "buy"
        ? {
            version: "matterhorn.reviewed-action-handoff.v1",
            protocol: "polymarket",
            source: "agent-card",
            draft: {
              operation: "buy",
              ...commonDraft,
              amountUsdc: amountUsdc!,
              amountShares: null,
            },
          }
        : {
            version: "matterhorn.reviewed-action-handoff.v1",
            protocol: "polymarket",
            source: "agent-card",
            draft: {
              operation: "sell",
              ...commonDraft,
              amountUsdc: null,
              amountShares: amountShares!,
            },
          };
    }
  } else if (card.venue === "bittensor") {
    const rawOperation = nonEmptyText(preview.operation ?? preview.action)?.toLowerCase();
    const operation = rawOperation === "stake" || rawOperation === "unstake" ? rawOperation : "transfer";
    const destination = nonEmptyText(preview.destination);
    const amountTao = finiteNumber(preview.amountTao);
    const sender = nonEmptyText(preview.sender ?? preview.coldkey);
    const hotkey = nonEmptyText(preview.hotkey ?? preview.validatorHotkey);
    const netuid = finiteInteger(preview.netuid);
    if (operation === "transfer" && destination && amountTao !== null && amountTao > 0) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "bittensor",
        source: "agent-card",
        draft: {
          operation,
          sender,
          destination,
          hotkey: null,
          netuid: null,
          amountTao: String(amountTao),
        },
      };
    } else if (operation !== "transfer" && hotkey && netuid !== null && amountTao !== null && amountTao > 0) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "bittensor",
        source: "agent-card",
        draft: {
          operation,
          sender,
          destination: null,
          hotkey,
          netuid,
          amountTao: String(amountTao),
        },
      };
    }
  } else if (card.venue === "sui") {
    const rawOperation = nonEmptyText(preview.operation ?? preview.action ?? preview.kind)?.toLowerCase();
    const operation = rawOperation === "transfer_coin" || rawOperation === "send_coin"
      ? "transfer_coin"
      : rawOperation === "transfer_object" || rawOperation === "send_object" || rawOperation === "send_nft"
        ? "transfer_object"
        : rawOperation === "batch_transfer_sui" || rawOperation === "batch_transfer"
          ? "batch_transfer_sui"
          : "transfer_sui";
    const network = preview.network === "mainnet" ? "mainnet" : "testnet";
    const sender = nonEmptyText(preview.sender);
    const recipient = nonEmptyText(preview.recipient);
    const amount = finiteNumber(preview.amount ?? preview.amountSui);
    const coinType = nonEmptyText(preview.coinType);
    const objectId = nonEmptyText(preview.objectId);
    const transfers = publicSuiTransfers(preview.transfers);
    if (operation === "batch_transfer_sui" && transfers.length >= 2) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "sui",
        source: "agent-card",
        draft: {
          operation,
          network,
          sender,
          recipient: null,
          amount: null,
          coinType: null,
          objectId: null,
          transfers,
        },
      };
    } else if (operation === "transfer_object" && recipient && objectId) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "sui",
        source: "agent-card",
        draft: {
          operation,
          network,
          sender,
          recipient,
          amount: null,
          coinType: null,
          objectId,
          transfers: [],
        },
      };
    } else if (operation === "transfer_coin" && recipient && amount !== null && amount > 0 && coinType) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "sui",
        source: "agent-card",
        draft: {
          operation,
          network,
          sender,
          recipient,
          amount: String(amount),
          coinType,
          objectId: null,
          transfers: [],
        },
      };
    } else if (operation === "transfer_sui" && recipient && amount !== null && amount > 0) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "sui",
        source: "agent-card",
        draft: {
          operation,
          network,
          sender,
          recipient,
          amount: String(amount),
          coinType: null,
          objectId: null,
          transfers: [],
        },
      };
    }
  }

  return candidate && isReviewedActionDraftHandoff(candidate) ? candidate : null;
}

export function stageReviewedActionHandoff(handoff: ReviewedActionWalletHandoff): boolean {
  if (!isReviewedActionDraftHandoff(handoff) && !isReviewedActionHandoffV2(handoff)) return false;
  if (isReviewedActionHandoffV2(handoff)) {
    const nowMs = Date.now();
    if (Date.parse(handoff.expiresAt) <= nowMs || nowMs - Date.parse(handoff.simulation.simulatedAt) > 60_000) return false;
    pendingGuardedHandoff = structuredClone(handoff);
  } else {
    pendingGuardedHandoff = null;
  }
  const nextHandoff = {
    version: "matterhorn.reviewed-action-handoff.v1" as const,
    protocol: handoff.protocol,
    source: handoff.source,
    draft: { ...handoff.draft },
  } as ReviewedActionDraftHandoff;
  pendingHandoff = nextHandoff;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REVIEWED_ACTION_HANDOFF_EVENT, { detail: nextHandoff }));
  }
  return true;
}

export function takePendingReviewedActionHandoff(): ReviewedActionDraftHandoff | null {
  const handoff = pendingHandoff;
  pendingHandoff = null;
  return handoff;
}

/** Guard metadata stays separate from editable wallet form state. */
export function takePendingReviewedActionGuard(): ReviewedActionHandoffV2 | null {
  const handoff = pendingGuardedHandoff;
  pendingGuardedHandoff = null;
  return handoff;
}

export function subscribeReviewedActionHandoff(
  listener: (handoff: ReviewedActionDraftHandoff) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    if (!(event instanceof CustomEvent) || !isReviewedActionDraftHandoff(event.detail)) return;
    listener(event.detail);
  };
  window.addEventListener(REVIEWED_ACTION_HANDOFF_EVENT, handler);
  return () => window.removeEventListener(REVIEWED_ACTION_HANDOFF_EVENT, handler);
}
