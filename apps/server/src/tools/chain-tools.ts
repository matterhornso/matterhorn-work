/**
 * MCP-style on-chain tool helpers.
 * Each function returns plain JSON-serializable data.
 */

import { getClient } from "../infra/chain-client.js";
import { tokensForChain } from "../infra/token-registry.js";
import type { Address, Abi } from "viem";

const erc20BalanceOfAbi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
] as const;

/**
 * Get native balance (ETH) + USDC token balance for an address on a given chain.
 */
export async function getBalance({
  address,
  chainId,
}: {
  address: Address;
  chainId: number;
}) {
  const client = getClient(chainId);
  if (!client) return { error: `Unsupported chainId: ${chainId}` };

  // Native balance
  const native: bigint = await client.getBalance({ address });

  // USDC balance
  let usdc = BigInt(0);
  const registry = tokensForChain(chainId);
  if (registry?.USDC) {
    usdc = await client.readContract({
      address: registry.USDC.address,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [address],
    }) as bigint;
  }

  return {
    chainId,
    address,
    native: native.toString(),
    nativeFormatted: Number(native) / 1e18,
    usdc: usdc.toString(),
    usdcFormatted: Number(usdc) / 1e6,
  };
}

/**
 * Generic readContract helper.
 * Returns raw hex/decoded value.
 */
export async function readContract({
  chainId,
  address,
  abi,
  functionName,
  args,
}: {
  chainId: number;
  address: Address;
  abi: Abi;
  functionName: string;
  args?: unknown[];
}) {
  const client = getClient(chainId);
  if (!client) return { error: `Unsupported chainId: ${chainId}` };

  try {
    const result = await client.readContract({
      address,
      abi,
      functionName,
      args: args ?? [],
    });
    return { result, chainId, address, functionName };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "readContract failed",
      chainId,
      address,
      functionName,
    };
  }
}
