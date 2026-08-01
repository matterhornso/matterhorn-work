import type { WalletClient } from "viem";

export const POLYMARKET_CHAIN_ID = 137;
export const POLYMARKET_CLOB_HOST = "https://clob.polymarket.com";
export const POLYMARKET_LIVE_CONFIRMATION = "SUBMIT POLYMARKET ORDER";
export const POLYMARKET_CANCEL_CONFIRMATION = "CANCEL POLYMARKET ORDERS";
export const POLYMARKET_CANCEL_ALL_CONFIRMATION = "CANCEL ALL POLYMARKET ORDERS";

export type PolymarketPreparedOrder = {
  tradeSide: "BUY" | "SELL";
  marketId: string;
  tokenId: string;
  marketLabel: string;
  outcome: string;
  amountUsdc: number | null;
  amountShares: number | null;
  estimatedFillPrice: number | null;
  estimatedShares: number | null;
  estimatedProceedsUsdc: number | null;
  maxLossUsdc: number | null;
  previewSha256: string;
  expiresAt: string;
  compliance: { status: "allowed" | "blocked" | "unknown"; reason: string | null };
  warnings: string[];
};

export type PolymarketPublicReceipt = {
  status: string;
  orderId: string | null;
  transactionHashes: string[];
  tradeIds: string[];
  takingAmount: string | null;
  makingAmount: string | null;
  submittedAt: string;
};

type PolymarketOrderResponse = {
  success: boolean;
  errorMsg?: string;
  orderID?: string;
  transactionsHashes?: string[];
  tradeIDs?: string[];
  status?: string;
  takingAmount?: string;
  makingAmount?: string;
};

export function assertPolymarketPreparedOrder(order: PolymarketPreparedOrder, now = Date.now()) {
  if (!order.marketId || !order.tokenId || !order.outcome) {
    throw new Error("The prepared order is missing its market, outcome, or CLOB token.");
  }
  if (order.tradeSide === "BUY") {
    if (
      !Number.isFinite(order.amountUsdc)
      || !Number.isFinite(order.maxLossUsdc)
      || !((order.amountUsdc ?? 0) > 0)
      || !((order.maxLossUsdc ?? 0) > 0)
    ) {
      throw new Error("The prepared buy amount must be positive.");
    }
    if (Math.abs((order.amountUsdc ?? 0) - (order.maxLossUsdc ?? 0)) > 0.000001) {
      throw new Error("The reviewed spend no longer matches the maximum loss. Prepare the order again.");
    }
  } else if (!Number.isFinite(order.amountShares) || !((order.amountShares ?? 0) > 0)) {
    throw new Error("The prepared share quantity must be positive.");
  }
  if (order.compliance.status !== "allowed") {
    throw new Error(order.compliance.reason || "Polymarket trading is unavailable in this region.");
  }
  const expiresAt = new Date(order.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new Error("This Polymarket review expired. Prepare the order again.");
  }
}

/**
 * Wallet authorization and temporary CLOB credentials remain inside this
 * function. Only public order status is returned to the UI.
 */
export async function submitPolymarketOrder(args: {
  walletClient: WalletClient;
  order: PolymarketPreparedOrder;
}): Promise<PolymarketPublicReceipt> {
  assertPolymarketPreparedOrder(args.order);
  if (!args.walletClient.account) {
    throw new Error("Connect an EVM wallet before submitting.");
  }
  if (args.walletClient.chain?.id !== POLYMARKET_CHAIN_ID) {
    throw new Error("Switch the connected wallet to Polygon before submitting.");
  }

  const { Chain, ClobClient, OrderType, Side } = await import("@polymarket/clob-client");
  const unauthenticated = new ClobClient(
    POLYMARKET_CLOB_HOST,
    Chain.POLYGON,
    args.walletClient,
  );
  const credentials = await unauthenticated.createOrDeriveApiKey();
  try {
    if (!credentials?.key || !credentials.secret || !credentials.passphrase) {
      throw new Error("Polymarket did not return temporary order credentials.");
    }
    const client = new ClobClient(
      POLYMARKET_CLOB_HOST,
      Chain.POLYGON,
      args.walletClient,
      credentials,
    );
    const response = await client.createAndPostMarketOrder(
      {
        tokenID: args.order.tokenId,
        amount: args.order.tradeSide === "BUY" ? args.order.amountUsdc ?? 0 : args.order.amountShares ?? 0,
        side: args.order.tradeSide === "BUY" ? Side.BUY : Side.SELL,
        orderType: OrderType.FAK,
      },
      undefined,
      OrderType.FAK,
    ) as PolymarketOrderResponse;

    if (!response.success) {
      throw new Error(response.errorMsg || "Polymarket rejected the order.");
    }
    return {
      status: response.status || "submitted",
      orderId: response.orderID || null,
      transactionHashes: response.transactionsHashes ?? [],
      tradeIds: response.tradeIDs ?? [],
      takingAmount: response.takingAmount ?? null,
      makingAmount: response.makingAmount ?? null,
      submittedAt: new Date().toISOString(),
    };
  } finally {
    if (credentials) {
      credentials.key = "";
      credentials.secret = "";
      credentials.passphrase = "";
    }
  }
}

export function normalizePolymarketOrderIds(value: string): string[] {
  const ids = value
    .split(/[\s,]+/)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) throw new Error("Enter at least one exact Polymarket order ID.");
  if (unique.length > 50) throw new Error("Cancel at most 50 exact order IDs at a time.");
  if (unique.some((id) => id.length < 6 || id.length > 160 || !/^[A-Za-z0-9_-]+$/.test(id))) {
    throw new Error("One or more Polymarket order IDs are invalid.");
  }
  return unique;
}

export async function cancelPolymarketOrders(args: {
  walletClient: WalletClient;
  orderIds?: string[];
  cancelAll?: boolean;
}): Promise<PolymarketPublicReceipt> {
  if (!args.walletClient.account) throw new Error("Connect an EVM wallet before cancelling orders.");
  if (args.walletClient.chain?.id !== POLYMARKET_CHAIN_ID) {
    throw new Error("Switch the connected wallet to Polygon before cancelling orders.");
  }
  const ids = Array.from(new Set(args.orderIds ?? []));
  if (!args.cancelAll && ids.length === 0) throw new Error("Select one or more exact order IDs to cancel.");
  if (args.cancelAll && ids.length > 0) throw new Error("Cancel-all cannot be combined with individual order IDs.");

  const { Chain, ClobClient } = await import("@polymarket/clob-client");
  const unauthenticated = new ClobClient(POLYMARKET_CLOB_HOST, Chain.POLYGON, args.walletClient);
  const credentials = await unauthenticated.createOrDeriveApiKey();
  try {
    if (!credentials?.key || !credentials.secret || !credentials.passphrase) {
      throw new Error("Polymarket did not return temporary order credentials.");
    }
    const client = new ClobClient(POLYMARKET_CLOB_HOST, Chain.POLYGON, args.walletClient, credentials);
    const response = args.cancelAll
      ? await client.cancelAll()
      : ids.length === 1
        ? await client.cancelOrder({ orderID: ids[0] })
        : await client.cancelOrders(ids);
    return {
      status: "cancelled",
      orderId: args.cancelAll ? null : ids.join(","),
      transactionHashes: [],
      tradeIds: [],
      takingAmount: null,
      makingAmount: null,
      submittedAt: new Date().toISOString(),
      ...((response && typeof response === "object" && "status" in response)
        ? { status: String((response as { status?: unknown }).status ?? "cancelled") }
        : {}),
    };
  } finally {
    if (credentials) {
      credentials.key = "";
      credentials.secret = "";
      credentials.passphrase = "";
    }
  }
}
