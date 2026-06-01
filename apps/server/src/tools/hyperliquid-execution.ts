/**
 * Hyperliquid Execution Tools.
 * Builds orders + submits them.
 * IMPORTANT: Hyperliquid is NOT EVM. It uses Arbitrum L1 signatures for L2 settlement.
 * Flow: Server builds order JSON → UI displays it with "Sign with Wallet" button
 *       → wagmi signs a L1 proof via wallet_signMessage → server submits to HL API.
 */

import { ApiClient } from "./api-client.js";
import type { Address } from "viem";

const client = new ApiClient({ baseUrl: "https://api.hyperliquid.xyz/exchange" });

interface OrderParams {
  asset: string; // e.g. "ETH-PERP"
  isBuy: boolean;
  sz: number; // order size in native units
  limitPx?: number; // limit price; omit for market order
  reduceOnly?: boolean;
}

/**
 * Build a raw order JSON suitable for Hyperliquid’s exchange API.
 * This returns the unsigned order — needs a user signature before submission.
 */
export function buildOrder(params: OrderParams) {
  const orderType = params.limitPx !== undefined
    ? { limit: { tif: "Gtc" } }
    : { market: {} };

  return {
    action: {
      orderAction: {
        orders: [
          {
            a: params.asset,
            b: params.isBuy,
            p: params.limitPx?.toString() ?? "0",
            s: params.sz.toString(),
            r: params.reduceOnly ?? false,
            t: orderType,
          },
        ],
      },
    },
    nonce: Date.now(),
    needsSignature: true,
  };
}

/**
 * Submit a signed order to Hyperliquid.
 * Requires the L1 signature (from wallet_signMessage) and the order JSON.
 */
export async function submitOrder({
  signedOrder,
  signature,
  publicAddress,
}: {
  signedOrder: unknown;
  signature: `0x${string}`;
  publicAddress: Address;
}) {
  const data = (await client.post("", {
    action: signedOrder,
    signature,
    nonce: Date.now(),
  })) as Record<string, unknown>;

  if ("error" in data) {
    return { success: false, error: data.error };
  }
  return { success: true, data };
}

/**
 * Human-readable order summary for the UI approval screen.
 */
export function summarizeOrder(params: OrderParams): string {
  const side = params.isBuy ? "Buy" : "Sell";
  const type = params.limitPx !== undefined ? `Limit @ ${params.limitPx}` : "Market";
  return `${side} ${params.sz} ${params.asset} (${type})`;
}
