import type { ReviewedActionDraftHandoff } from "@matterhorn-work/types";

export type HyperliquidReviewDraft = Extract<
  ReviewedActionDraftHandoff,
  { protocol: "hyperliquid" }
>["draft"];

export type HyperliquidReviewDraftInput = {
  operation: HyperliquidReviewDraft["operation"];
  network: "testnet" | "mainnet";
  asset: string;
  side: "buy" | "sell";
  size: string;
  orderType: "market" | "limit";
  limitPrice: string;
  slippageBps: string;
  reduceOnly: boolean;
  orderId: string;
};

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return parsed;
}

function positiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parsed;
}

export function createHyperliquidReviewDraft(input: HyperliquidReviewDraftInput): HyperliquidReviewDraft {
  const asset = input.asset.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,16}$/.test(asset)) {
    throw new Error("Enter a valid Hyperliquid asset symbol.");
  }

  if (input.operation === "cancel_order") {
    return {
      operation: "cancel_order",
      network: input.network,
      asset,
      orderId: positiveInteger(input.orderId, "Order ID"),
      side: null,
      size: null,
      orderType: null,
      limitPrice: null,
      slippageBps: null,
      reduceOnly: null,
    };
  }

  const size = positiveNumber(input.size, "Size");
  const slippageBps = positiveInteger(input.slippageBps, "Max slippage");
  if (slippageBps > 5_000) {
    throw new Error("Max slippage cannot exceed 5,000 bps.");
  }

  if (input.operation === "close_position") {
    return {
      operation: "close_position",
      network: input.network,
      asset,
      orderId: null,
      side: input.side,
      size,
      orderType: "market",
      limitPrice: null,
      slippageBps,
      reduceOnly: true,
    };
  }

  const limitPrice = input.orderType === "limit"
    ? positiveNumber(input.limitPrice, "Limit price")
    : null;
  if (input.operation === "modify_order") {
    return {
      operation: "modify_order",
      network: input.network,
      asset,
      orderId: positiveInteger(input.orderId, "Order ID"),
      side: input.side,
      size,
      orderType: input.orderType,
      limitPrice,
      slippageBps,
      reduceOnly: input.reduceOnly,
    };
  }

  return {
    operation: "place_order",
    network: input.network,
    asset,
    orderId: null,
    side: input.side,
    size,
    orderType: input.orderType,
    limitPrice,
    slippageBps,
    reduceOnly: input.reduceOnly,
  };
}
