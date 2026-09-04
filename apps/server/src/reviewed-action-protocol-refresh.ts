import type {
  ReviewedActionDraftHandoff,
  ReviewedActionHandoffV2,
} from "@matterhorn-work/types/reviewed-actions";
import { sha256 } from "./guarded-runtime-crypto.js";
import type { ReviewedActionRefreshEvidence } from "./reviewed-action-refresh.js";
import {
  hyperliquidProvider,
  prepareHyperliquidOrderPreview,
} from "./tools/hyperliquid.js";
import {
  polymarketProvider,
  preparePolymarketOrderFromRequest,
  preparePolymarketSellPreviewFromRequest,
} from "./tools/polymarket.js";
import { prepareBittensorExtrinsic } from "./tools/bittensor.js";
import { simulateSuiTransactionPreview } from "./tools/sui.js";

function mismatch(condition: boolean, message: string): string[] {
  return condition ? [message] : [];
}

type BittensorRuntimeNetwork = "finney" | "test" | "local";

function normalizeBittensorNetwork(value: string): BittensorRuntimeNetwork | null {
  const normalized = value.trim().toLowerCase().replace(/^bittensor:/, "");
  if (normalized === "finney" || normalized === "test" || normalized === "local") return normalized;
  return null;
}

export function bittensorReviewedNetworkMatches(
  reviewedNetwork: string,
  observedNetwork: BittensorRuntimeNetwork,
): boolean {
  return normalizeBittensorNetwork(reviewedNetwork) === observedNetwork;
}

async function refreshHyperliquid(
  handoff: Extract<ReviewedActionHandoffV2, { protocol: "hyperliquid" }>,
  currentDraft: Extract<ReviewedActionDraftHandoff, { protocol: "hyperliquid" }>,
): Promise<ReviewedActionRefreshEvidence> {
  const draft = currentDraft.draft;
  const account = handoff.signer ? await hyperliquidProvider.getAccount(handoff.signer) : null;
  if (draft.operation === "cancel_order") {
    if (!account) throw new Error("Connect the reviewed Hyperliquid account before refreshing a cancellation.");
    const openOrder = account.orders.find((order) => String(order.oid) === String(draft.orderId));
    return {
      reference: sha256({
        protocol: "hyperliquid",
        operation: draft.operation,
        network: draft.network,
        signer: handoff.signer,
        openOrder: openOrder ? {
          asset: openOrder.asset,
          side: openOrder.side,
          size: openOrder.size,
          limitPx: openOrder.limitPx,
          oid: openOrder.oid,
          reduceOnly: openOrder.reduceOnly,
        } : null,
      }),
      observedAt: new Date(),
      materialChangeReasons: openOrder
        ? mismatch(openOrder.asset !== draft.asset, "The live Hyperliquid order asset changed.")
        : ["The reviewed Hyperliquid order is no longer open."],
    };
  }
  const preview = await prepareHyperliquidOrderPreview({
    asset: draft.asset,
    side: draft.side,
    size: draft.size,
    orderType: draft.orderType,
    network: draft.network,
    price: draft.limitPrice,
    reduceOnly: draft.reduceOnly,
    slippageTolerance: draft.slippageBps == null ? null : draft.slippageBps / 100,
    address: handoff.signer,
    closeIntent: draft.operation === "close_position" ? { isClose: true, fraction: null } : null,
    positionContext: draft.operation === "close_position"
      ? account?.positions.find((position) => position.asset === draft.asset) ?? null
      : null,
  });
  const reasons = [
    ...mismatch(preview.network !== draft.network, "The Hyperliquid network changed."),
    ...mismatch(preview.asset !== draft.asset, "Hyperliquid market metadata resolved to a different asset."),
    ...mismatch(preview.size !== draft.size, "Hyperliquid lot-size rules changed the reviewed size."),
    ...mismatch(
      preview.marketability.estimatedSlippagePct !== null
        && draft.slippageBps !== null
        && preview.marketability.estimatedSlippagePct * 100 > draft.slippageBps,
      "Current Hyperliquid orderbook slippage exceeds the reviewed limit.",
    ),
  ];
  if (draft.operation === "modify_order") {
    const openOrder = account?.orders.find((order) => String(order.oid) === String(draft.orderId));
    if (!openOrder) reasons.push("The Hyperliquid order to modify is no longer open.");
  }
  if (draft.operation === "close_position") {
    const position = account?.positions.find((item) => item.asset === draft.asset);
    if (!position || position.side === "flat" || !position.size) reasons.push("The Hyperliquid position is no longer open.");
  }
  return {
    reference: preview.previewSha256,
    observedAt: new Date(preview.source.fetchedAt),
    materialChangeReasons: reasons,
  };
}

async function refreshPolymarket(
  _handoff: Extract<ReviewedActionHandoffV2, { protocol: "polymarket" }>,
  currentDraft: Extract<ReviewedActionDraftHandoff, { protocol: "polymarket" }>,
): Promise<ReviewedActionRefreshEvidence> {
  const draft = currentDraft.draft;
  const compliance = await polymarketProvider.checkCompliance();
  if (compliance.status !== "allowed") {
    return {
      reference: sha256({ protocol: "polymarket", compliance }),
      observedAt: new Date(compliance.checkedAt),
      materialChangeReasons: [`Polymarket eligibility is ${compliance.status}; wallet review is blocked.`],
    };
  }
  if (draft.operation === "cancel") {
    throw new Error("Polymarket cancellation state cannot be refreshed without the connected wallet's CLOB session.");
  }
  const preview = draft.operation === "buy"
    ? await preparePolymarketOrderFromRequest({
        marketId: draft.marketId,
        outcome: draft.outcome,
        side: "yes",
        amountUsdc: draft.amountUsdc,
        slippageTolerance: draft.slippageTolerance,
      })
    : await preparePolymarketSellPreviewFromRequest({
        marketId: draft.marketId,
        outcome: draft.outcome,
        side: "yes",
        shares: draft.amountShares,
        slippageTolerance: draft.slippageTolerance,
      });
  const reasons = [
    ...mismatch(preview.marketId !== draft.marketId, "Polymarket resolved a different market."),
    ...mismatch(preview.outcome !== draft.outcome, "Polymarket resolved a different outcome."),
    ...mismatch(preview.compliance.status !== "allowed", "Polymarket compliance no longer permits this review."),
    ...mismatch(
      preview.marketability?.estimatedSlippagePct !== null
        && preview.marketability?.estimatedSlippagePct !== undefined
        && preview.marketability.estimatedSlippagePct > draft.slippageTolerance,
      "Current Polymarket orderbook slippage exceeds the reviewed limit.",
    ),
  ];
  return {
    reference: preview.previewSha256,
    observedAt: new Date(preview.source.fetchedAt),
    materialChangeReasons: reasons,
  };
}

async function refreshBittensor(
  handoff: Extract<ReviewedActionHandoffV2, { protocol: "bittensor" }>,
  currentDraft: Extract<ReviewedActionDraftHandoff, { protocol: "bittensor" }>,
): Promise<ReviewedActionRefreshEvidence> {
  const draft = currentDraft.draft;
  const preview = await prepareBittensorExtrinsic({
    action: draft.operation,
    amountTao: draft.amountTao,
    coldkey: draft.sender,
    destination: draft.destination,
    hotkey: draft.hotkey,
    netuid: draft.netuid,
  });
  const reasons = [
    ...mismatch(
      !bittensorReviewedNetworkMatches(handoff.network, preview.network),
      `The Bittensor preview resolved ${preview.network}, not the reviewed ${handoff.network} network.`,
    ),
    ...mismatch(Boolean(handoff.signer && preview.coldkey && handoff.signer !== preview.coldkey), "The Bittensor signer changed."),
    ...mismatch(Boolean(draft.destination && preview.destination !== draft.destination), "The Bittensor destination changed."),
    ...mismatch(Boolean(draft.hotkey && preview.hotkey !== draft.hotkey), "The Bittensor validator hotkey changed."),
    ...mismatch(Boolean(draft.netuid !== null && preview.netuid !== draft.netuid), "The Bittensor subnet changed."),
    ...mismatch(Boolean(preview.amountTao !== null && String(preview.amountTao) !== String(draft.amountTao)), "The Bittensor amount changed."),
  ];
  return {
    reference: sha256({
      action: preview.action,
      network: preview.network,
      netuid: preview.netuid,
      amountTao: preview.amountTao,
      coldkey: preview.coldkey,
      hotkey: preview.hotkey,
      destination: preview.destination,
      feeTao: preview.feeTao,
      slippageBps: preview.slippageBps,
      expectedAlpha: preview.expectedAlpha,
      unsignedPayload: preview.unsignedPayload,
    }),
    observedAt: new Date(),
    materialChangeReasons: reasons,
  };
}

async function refreshSui(
  _handoff: Extract<ReviewedActionHandoffV2, { protocol: "sui" }>,
  currentDraft: Extract<ReviewedActionDraftHandoff, { protocol: "sui" }>,
): Promise<ReviewedActionRefreshEvidence> {
  const draft = currentDraft.draft;
  if (!draft.sender) throw new Error("Connect the exact Sui signer before running the wallet dry-run.");
  const simulation = await simulateSuiTransactionPreview({
    network: draft.network,
    kind: draft.operation,
    sender: draft.sender,
    recipient: draft.recipient,
    amountSui: draft.amount,
    coinType: draft.coinType,
    objectId: draft.objectId,
    transfers: draft.transfers.map((transfer) => ({ recipient: transfer.recipient, amountSui: transfer.amount })),
  });
  return {
    reference: simulation.reference,
    block: simulation.block,
    observedAt: new Date(simulation.simulatedAt),
  };
}

export async function refreshReviewedActionProtocolState(input: {
  handoff: ReviewedActionHandoffV2;
  currentDraft: ReviewedActionDraftHandoff;
}): Promise<ReviewedActionRefreshEvidence> {
  if (input.handoff.protocol !== input.currentDraft.protocol) {
    throw new Error("The reviewed action protocol changed.");
  }
  if (input.handoff.protocol === "hyperliquid" && input.currentDraft.protocol === "hyperliquid") {
    return refreshHyperliquid(input.handoff, input.currentDraft);
  }
  if (input.handoff.protocol === "polymarket" && input.currentDraft.protocol === "polymarket") {
    return refreshPolymarket(input.handoff, input.currentDraft);
  }
  if (input.handoff.protocol === "bittensor" && input.currentDraft.protocol === "bittensor") {
    return refreshBittensor(input.handoff, input.currentDraft);
  }
  if (input.handoff.protocol === "sui" && input.currentDraft.protocol === "sui") {
    return refreshSui(input.handoff, input.currentDraft);
  }
  throw new Error("Matterhorn has no protocol refresh adapter for this reviewed action.");
}
