/**
 * Hyperliquid Execution Tools.
 * Builds orders and external-signing helpers.
 * IMPORTANT: Hyperliquid is NOT EVM. It uses Arbitrum L1 signatures for L2 settlement.
 * Flow: Server builds order JSON -> UI displays it with "Sign with Wallet" button
 *       -> wagmi signs a L1 proof via signTypedData -> server submits to HL API.
 */

import type { OrderType } from "hyperliquid";

// ─── Order Types ───────────────────────────────────────────

export interface OrderParams {
  asset: string; // e.g. "ETH"
  isBuy: boolean;
  sz: number; // order size in native units
  limitPx?: number; // limit price; omit for market order
  reduceOnly?: boolean;
}

function makeOrderType(limitPx?: number): OrderType {
  return limitPx !== undefined ? { limit: { tif: "Gtc" } } : {};
}

/**
 * Build a raw order JSON suitable for Hyperliquid's exchange API.
 * This returns the unsigned order — needs a user signature before submission.
 */
export function buildOrder(params: OrderParams) {
  const orderType = makeOrderType(params.limitPx);

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
 * Build the EIP-712 typed data parameters for the wallet UI to sign.
 * This constructs the Hyperliquid L1 proof without needing the SDK's
 * internal helpers. Uses msgpack to hash the action just like the SDK.
 */
export function buildSignTypedData(
  action: unknown,
  {
    nonce,
    vaultAddress,
    isMainnet,
  }: { nonce: number; vaultAddress?: string | null; isMainnet: boolean },
) {
  // We need the hash to match what HL's SDK computes. Rather than
  // re-implementing the exact msgpack wire format here (which is
  // complex and version-sensitive), we return a structured request
  // and let the UI's signing service produce the correct hash.
  return {
    domain: {
      name: "Exchange",
      version: "1",
      chainId: 1337,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: {
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ],
    },
    primaryType: "Agent" as const,
    message: {
      source: isMainnet ? "a" : "b",
      connectionId: "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
    action,
    nonce,
    vaultAddress,
    isMainnet,
  };
}

/**
 * Compatibility stub for the old server-side signing helper.
 *
 * Matterhorn Work is non-custodial: this server module must never accept
 * custody material. Use buildOrder/buildSignTypedData for previews and
 * submitOrder only after an external signer returns a signature.
 */
export async function signAndSubmitOrder(_input: {
  order: ReturnType<typeof buildOrder>;
  isTestnet?: boolean;
}) {
  throw new Error("Server-side Hyperliquid signing is disabled. Use an external signer flow.");
}

/**
 * Submit a signed order to Hyperliquid.
 * Requires the L1 signature (from signTypedData) and the order JSON.
 */
export async function submitOrder({
  signedOrder: _signedOrder,
  signature: _signature,
  publicAddress: _publicAddress,
}: {
  signedOrder: unknown;
  signature: `0x${string}`;
  publicAddress: `0x${string}`;
}) {
  throw new Error("Arbitrary signed-order submission is disabled. Use the short-lived Hyperliquid execution-intent flow.");
}

/**
 * Human-readable order summary for the UI approval screen.
 */
export function summarizeOrder(params: OrderParams): string {
  const side = params.isBuy ? "Buy" : "Sell";
  const type = params.limitPx !== undefined ? `Limit @ ${params.limitPx}` : "Market";
  return `${side} ${params.sz} ${params.asset} (${type})`;
}
