import {
  isReviewedActionDraftHandoff,
  type ReviewedActionDraftHandoff,
} from "@matterhorn-work/types";

const REVIEWED_ACTION_HANDOFF_EVENT = "matterhorn:reviewed-action-handoff";

let pendingHandoff: ReviewedActionDraftHandoff | null = null;

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

function nonEmptyText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeSlippageBps(value: unknown): number {
  const parsed = finiteNumber(value);
  if (parsed === null || parsed <= 0) return 100;
  const bps = parsed <= 50 ? parsed * 100 : parsed;
  return Math.min(5_000, Math.max(1, Math.round(bps)));
}

export function reviewedActionHandoffFromCard(card: SharedActionCard): ReviewedActionDraftHandoff | null {
  if (card.kind !== "action_preview" || !isRecord(card.data)) return null;
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
    const orderType = preview.orderType === "limit" ? "limit" : "market";
    if (asset && (side === "buy" || side === "sell") && size !== null && size > 0) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "hyperliquid",
        source: "agent-card",
        draft: {
          network: preview.network === "mainnet" ? "mainnet" : "testnet",
          asset: asset.toUpperCase(),
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
    const marketId = nonEmptyText(preview.marketId);
    const outcome = nonEmptyText(preview.outcome);
    const amountUsdc = finiteNumber(preview.size);
    const slippage = finiteNumber(preview.slippageTolerance);
    if (
      marketId
      && outcome
      && amountUsdc !== null
      && amountUsdc > 0
      && isRecord(preview.compliance)
      && preview.compliance.status === "allowed"
    ) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "polymarket",
        source: "agent-card",
        draft: {
          marketId,
          outcome,
          amountUsdc,
          slippageTolerance: slippage !== null && slippage > 0 ? Math.min(slippage, 50) : 2,
        },
      };
    }
  } else if (card.venue === "bittensor" && preview.action === "transfer") {
    const destination = nonEmptyText(preview.destination);
    const amountTao = finiteNumber(preview.amountTao);
    const sender = nonEmptyText(preview.coldkey);
    if (destination && amountTao !== null && amountTao > 0) {
      candidate = {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "bittensor",
        source: "agent-card",
        draft: {
          sender,
          destination,
          amountTao: String(amountTao),
        },
      };
    }
  }

  return candidate && isReviewedActionDraftHandoff(candidate) ? candidate : null;
}

export function stageReviewedActionHandoff(handoff: ReviewedActionDraftHandoff): boolean {
  if (!isReviewedActionDraftHandoff(handoff)) return false;
  const nextHandoff = {
    ...handoff,
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
