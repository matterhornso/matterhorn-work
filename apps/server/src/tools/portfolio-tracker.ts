/**
 * Portfolio Tracker.
 * Aggregates on-chain positions and off-chain protocol data into a single view.
 * Read-only — no transactions.
 */

import { getClient } from "../infra/chain-client.js";
import { tokensForChain } from "../infra/token-registry.js";
import type { Address } from "viem";

const balanceOfAbi = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    name: "symbol",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

/**
 * Read ERC-20 balance + metadata for an address.
 */
async function getTokenBalance(
  chainId: number,
  tokenAddress: Address,
  owner: Address,
) {
  const client = getClient(chainId);
  if (!client) return null;
  try {
    const [balance, decimals, symbol] = await Promise.all([
      client.readContract({
        address: tokenAddress,
        abi: balanceOfAbi,
        functionName: "balanceOf",
        args: [owner],
      }),
      client.readContract({
        address: tokenAddress,
        abi: balanceOfAbi,
        functionName: "decimals",
      }).catch(() => 18),
      client.readContract({
        address: tokenAddress,
        abi: balanceOfAbi,
        functionName: "symbol",
      }).catch(() => "???"),
    ]);
    return {
      raw: balance.toString(),
      formatted: Number(balance) / 10 ** Number(decimals),
      decimals: Number(decimals),
      symbol,
      address: tokenAddress,
    };
  } catch {
    return null;
  }
}

/**
 * Get ETH/native token balance for an address (in wei + formatted).
 */
async function getNativeBalance(chainId: number, address: Address) {
  const client = getClient(chainId);
  if (!client) return null;
  try {
    const balance = await client.getBalance({ address });
    return {
      raw: balance.toString(),
      formatted: Number(balance) / 1e18,
      symbol: "ETH",
      decimals: 18,
      address: "0x0000000000000000000000000000000000000000" as Address,
    };
  } catch {
    return null;
  }
}

// ─── Hyperliquid positions (reuse existing infra) ──────────────────────

async function hl_getPositions(user: string) {
  const res = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "clearinghouseState", user }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.assetPositions || []).map((ap: Record<string, unknown>) => ({
    coin: (ap.position as Record<string, string>).coin,
    entryPx: Number((ap.position as Record<string, unknown>).entryPx),
    positionValue: Number((ap.position as Record<string, unknown>).positionValue),
    unrealizedPnl: Number(
      (ap.position as Record<string, unknown>).unrealizedPnl,
    ),
    leverage: Number(
      (ap.position as Record<string, unknown>).leverage?.value,
    ),
    liquidationPx: (ap.position as Record<string, unknown>).liquidationPx
      ? Number((ap.position as Record<string, unknown>).liquidationPx)
      : null,
    marginUsed: Number((ap.position as Record<string, unknown>).marginUsed),
  }));
}

// ─── DeFiLlama yields ─────────────────────────────────────────────────

async function getYields(chain: string, limit = 10) {
  try {
    const res = await fetch(
      "https://yields.llama.fi/pools",
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) return [];
    const data = await res.json();
    const pools = (data.data || []).filter(
      (p: { chain: string }) => p.chain.toLowerCase() === chain.toLowerCase(),
    );
    return pools
      .sort((a: { tvlUsd: number }, b: { tvlUsd: number }) => b.tvlUsd - a.tvlUsd)
      .slice(0, limit)
      .map((p: { pool: string; project: string; symbol: string; tvlUsd: number; apy: number }) => ({
        pool: p.pool,
        project: p.project,
        symbol: p.symbol,
        tvlUsd: p.tvlUsd,
        apy: p.apy,
      }));
  } catch {
    return [];
  }
}

// ─── Portfolio Tracker Entry Point ────────────────────────────────────

export interface PortfolioResponse {
  success: true;
  address: Address;
  chainId: number;
  native: { raw: string; formatted: number; symbol: string } | null;
  tokens: Array<{
    raw: string;
    formatted: number;
    decimals: number;
    symbol: string;
    address: Address;
  }>;
  hyperliquid: Array<{
    coin: string;
    entryPx: number;
    positionValue: number;
    unrealizedPnl: number;
    leverage: number | null;
    liquidationPx: number | null;
    marginUsed: number;
  }> | null;
  yields: Array<{
    pool: string;
    project: string;
    symbol: string;
    tvlUsd: number;
    apy: number;
  }>;
}

/**
 * Fetch the full portfolio for an address.
 * Combines native ETH/USDC balances + Hyperliquid perps + yield opportunities.
 */
export async function getPortfolio({
  chainId,
  address,
}: {
  chainId: number;
  address: Address;
}): Promise<{ success: true; data: PortfolioResponse } | { success: false; error: string }> {
  const client = getClient(chainId);
  if (!client) {
    return { success: false, error: `Unsupported chainId: ${chainId}` };
  }

  const registry = tokensForChain(chainId);
  const tokenAddresses = registry
    ? Object.values(registry).map((t) => t.address as Address)
    : [];

  const [native, tokenBalances, hlPositions, yields] = await Promise.all([
    getNativeBalance(chainId, address),
    Promise.all(
      tokenAddresses.map((addr) => getTokenBalance(chainId, addr, address)),
    ),
    hl_getPositions(address).catch(() => null),
    getYields(chainId === 8453 ? "Base" : "Base Sepolia", 10),
  ]);

  const tokens = tokenBalances.filter(Boolean) as PortfolioResponse["tokens"];

  return {
    success: true,
    data: {
      address,
      chainId,
      native: native
        ? { raw: native.raw, formatted: native.formatted, symbol: native.symbol }
        : null,
      tokens,
      hyperliquid: hlPositions,
      yields,
    },
  };
}
