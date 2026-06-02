/**
 * Transaction Simulation.
 * Uses viem eth_call to verify a raw tx won't revert before showing Approve.
 */

import { getClient } from "../infra/chain-client.js";
import type { Address, Hex } from "viem";

/**
 * Simulate a raw contract call (swap, bridge, etc.).
 * Returns { success: true } or { error: string }.
 */
export async function simulateTransaction({
  chainId,
  to,
  data,
  value = "0",
  from,
}: {
  chainId: number;
  to: Address;
  data: Hex;
  value?: string;
  from: Address;
}) {
  const client = getClient(chainId);
  if (!client) return { success: false, error: `Unsupported chainId: ${chainId}` };

  try {
    await client.call({
      to,
      data,
      value: BigInt(value),
      account: from,
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Simulation failed",
    };
  }
}

/**
 * Estimate gas for a raw call.
 * Returns { gas: bigint } or { error: string }.
 */
export async function estimateGas({
  chainId,
  to,
  data,
  value = "0",
  from,
}: {
  chainId: number;
  to: Address;
  data: Hex;
  value?: string;
  from: Address;
}) {
  const client = getClient(chainId);
  if (!client) return { success: false, error: `Unsupported chainId: ${chainId}` };

  try {
    const gas = await client.estimateGas({
      to,
      data,
      value: BigInt(value),
      account: from,
    });
    return { gas };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Gas estimation failed",
    };
  }
}
