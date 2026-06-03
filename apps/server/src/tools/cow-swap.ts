/**
 * CoW Protocol MEV-Safe Swap Routing.
 * Provides quote + order submission via CoW's intent-based batch auctions.
 * Uses GPv2VaultRelayer — no separate approve tx needed for most tokens.
 *
 * API docs: https://docs.cow.fi
 */

import type { Address, Hex } from "viem";

const COW_API_BASE: Record<number, string> = {
  1: "https://api.cow.fi/mainnet",
  8453: "https://api.cow.fi/base",
  42161: "https://api.cow.fi/arbitrum",
  100: "https://api.cow.fi/xdai",
};

/**
 * CoW Protocol quote response.
 */
export interface CowQuote {
  sellToken: Address;
  buyToken: Address;
  receiver: Address;
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  validTo: number;
  appData: string;
  kind: "sell" | "buy";
  partiallyFillable: boolean;
  sellTokenBalance: "erc20" | "external" | "internal";
  buyTokenBalance: "erc20" | "internal";
}

/**
 * Get a CoW Protocol quote.
 */
export async function getCowQuote({
  chainId,
  sellToken,
  buyToken,
  sellAmount,
  receiver,
  validMinutes = 10,
}: {
  chainId: number;
  sellToken: Address;
  buyToken: Address;
  sellAmount: string; // raw wei
  receiver: Address;
  validMinutes?: number;
}) {
  const base = COW_API_BASE[chainId];
  if (!base) return { success: false, error: `Unsupported chainId: ${chainId}` };

  try {
    const body = {
      sellToken,
      buyToken,
      sellAmount,
      receiver,
      kind: "sell",
      partiallyFillable: false,
      validTo: Math.floor(Date.now() / 1000) + validMinutes * 60,
      appData: "0x0000000000000000000000000000000000000000000000000000000000000000",
      sellTokenBalance: "erc20",
      buyTokenBalance: "erc20",
      from: receiver,
    };

    const res = await fetch(`${base}/api/v1/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown");
      return { success: false, error: `CoW API HTTP ${res.status}: ${errText}` };
    }

    const data = (await res.json()) as {
      quote: CowQuote;
      id: string;
      // error response
      errorType?: string;
      description?: string;
    };

    if ("errorType" in data && data.errorType) {
      return { success: false, error: `${data.errorType}: ${data.description ?? ""}` };
    }

    return {
      success: true,
      quote: data.quote,
      quoteId: data.id,
      protocol: "cow",
      mevProtected: true,
      summary: `CoW quote: sell ${data.quote.sellAmount} → buy ${data.quote.buyAmount}`,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "CoW quote failed" };
  }
}

/**
 * Build a CoW Protocol order ready for signing and POST to /api/v1/orders.
 * Returns the unsigned order JSON.
 */
export function buildCowOrder({
  quote,
  owner,
}: {
  quote: CowQuote;
  owner: Address;
}) {
  return {
    ...quote,
    from: owner,
    /** The order is EIP-712 signed by the user and POSTed to CoW /api/v1/orders. */
    signingScheme: "eip712" as const,
  };
}

/**
 * Submit a CoW Protocol order (POST to /api/v1/orders).
 * The order must already include an EIP-712 signature.
 */
export async function submitCowOrder({
  chainId,
  order,
  signature,
}: {
  chainId: number;
  order: ReturnType<typeof buildCowOrder>;
  signature: Hex;
}): Promise<
  | { success: true; orderId: string; explorerUrl: string }
  | { success: false; error: string }
> {
  const base = COW_API_BASE[chainId];
  if (!base) return { success: false, error: `Unsupported chainId: ${chainId}` };
  try {
    const res = await fetch(`${base}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...order, signature }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      return { success: false, error: `CoW order submission failed: ${res.status} ${err}` };
    }
    const orderId = (await res.json()) as string;
    return { success: true, orderId, explorerUrl: `${base}/orders/${orderId}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Order submission failed" };
  }
}

/**
 * Check if CoW supports a chain.
 */
export function isCowSupported(chainId: number): boolean {
  return chainId in COW_API_BASE;
}
