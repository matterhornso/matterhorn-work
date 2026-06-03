/**
 * Token Approval Manager.
 * Uses revoke.cash API + on-chain reads to show ERC-20 approvals.
 */

import { getClient } from "../infra/chain-client.js";
import { encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";

const erc20AllowanceAbi = [
  {
    constant: true,
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
  {
    constant: true,
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    type: "function",
  },
] as const;

const erc20ApproveAbi = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

/**
 * Fetch token metadata (symbol, name, decimals) from on-chain.
 */
async function getTokenMeta(chainId: number, tokenAddress: Address) {
  const client = getClient(chainId);
  if (!client) return null;

  try {
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: "symbol",
      }).catch(() => "???"),
      client.readContract({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: "name",
      }).catch(() => "Unknown Token"),
      client.readContract({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: "decimals",
      }).catch(() => 18),
    ]);
    return { symbol, name, decimals: Number(decimals) };
  } catch {
    return null;
  }
}

/**
 * Get current allowance for a (token, owner, spender) triple.
 */
export async function getAllowance({
  chainId,
  tokenAddress,
  owner,
  spender,
}: {
  chainId: number;
  tokenAddress: Address;
  owner: Address;
  spender: Address;
}) {
  const client = getClient(chainId);
  if (!client) return { success: false, error: `Unsupported chainId: ${chainId}` };

  try {
    const [allowance, meta] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [owner, spender],
      }) as Promise<bigint>,
      getTokenMeta(chainId, tokenAddress),
    ]);

    return {
      success: true,
      tokenAddress,
      owner,
      spender,
      allowance: allowance.toString(),
      allowanceFormatted: meta ? Number(allowance) / 10 ** meta.decimals : null,
      symbol: meta?.symbol ?? null,
      name: meta?.name ?? null,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "getAllowance failed",
    };
  }
}

/**
 * Build an ERC-20 approve(0) calldata to revoke an allowance.
 * Returns the raw tx data; user must sign+broadcast.
 */
export function buildRevokeApprovalTx({
  tokenAddress,
  spender,
}: {
  tokenAddress: Address;
  spender: Address;
}) {
  try {
    const data = encodeFunctionData({
      abi: erc20ApproveAbi,
      functionName: "approve",
      args: [spender, 0n],
    }) as Hex;

    return {
      success: true,
      tokenAddress,
      spender,
      data,
      description: `Revoke approval for ${spender} on ${tokenAddress}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to build revoke tx",
    };
  }
}
