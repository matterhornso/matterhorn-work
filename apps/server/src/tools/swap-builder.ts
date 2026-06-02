/**
 * 1inch DEX Aggregation Swap Builder.
 * Builds swap transactions ready for user approval + wagmi broadcast.
 * Requires ONE_INCH_API_KEY env var.
 */

import { ApiClient } from "./api-client.js";
import { tokensForChain } from "../infra/token-registry.js";
import type { Address } from "viem";

const ONE_INCH_BASE = "https://api.1inch.dev/swap/v6.0";

function getClient(chainId: number) {
  const key = process.env.ONE_INCH_API_KEY;
  if (!key) throw new Error("ONE_INCH_API_KEY not configured");
  return new ApiClient({
    baseUrl: `${ONE_INCH_BASE}/${chainId}`,
    headers: { Authorization: `Bearer ${key}` },
  });
}

const DEFAULT_MAX_SLIPPAGE_BPS = 100; // 1%

/** Resolve a symbol like "USDC" or "WETH" to its on-chain address. */
function resolveToken(chainId: number, symbol: string): string {
  const registry = tokensForChain(chainId);
  const match = registry?.[symbol.toUpperCase()];
  if (match) return match.address;
  // If already an address
  if (/^0x[a-fA-F0-9]{40}$/.test(symbol)) return symbol;
  throw new Error(`Unknown token "${symbol}" on chain ${chainId}`);
}

/** Format raw amount to human-readable. */
function formatAmount(raw: string, symbol: string): string {
  const num = Number(raw);
  if (symbol.toUpperCase() === "USDC") return (num / 1e6).toFixed(2);
  if (symbol.toUpperCase() === "WETH" || symbol.toUpperCase() === "ETH") return (num / 1e18).toFixed(4);
  return raw;
}

/** Reject slippage above limit (basis points). */
function enforceSlippageLimit(slippagePct: number, maxBps: number = DEFAULT_MAX_SLIPPAGE_BPS): void {
  const requestedBps = Math.round(slippagePct * 100);
  if (requestedBps > maxBps) {
    throw new Error(
      `Slippage ${slippagePct}% exceeds the maximum allowed ${(maxBps / 100).toFixed(2)}% (${maxBps} bps). ` +
        "Increase the limit in wallet settings or reduce slippage."
    );
  }
}

/** Quote only — no transaction. Useful for agent reasoning. */
export async function getQuote({
  chainId,
  fromToken,
  toToken,
  amount,
  slippage = 1,
  maxSlippageBps,
}: {
  chainId: number;
  fromToken: string;
  toToken: string;
  amount: string; // wei / raw amount
  slippage?: number; // percent
  maxSlippageBps?: number;
}) {
  const effectiveMax = maxSlippageBps ?? DEFAULT_MAX_SLIPPAGE_BPS;
  enforceSlippageLimit(slippage, effectiveMax);

  const client = getClient(chainId);
  const data = await client.get("/quote", {
    src: resolveToken(chainId, fromToken),
    dst: resolveToken(chainId, toToken),
    amount,
  }) as {
    fromToken: { symbol: string; address: string };
    toToken: { symbol: string; address: string };
    fromAmount: string;
    toAmount: string;
    estimatedGas: string;
  };

  return {
    from: data.fromToken.symbol,
    to: data.toToken.symbol,
    fromAmount: data.fromAmount,
    toAmount: data.toAmount,
    estimatedGas: data.estimatedGas,
    slippagePct: slippage,
  };
}

/** Build full swap transaction tx object. */
export async function buildSwap({
  chainId,
  fromToken,
  toToken,
  amount,
  fromAddress,
  slippage = 1,
  maxSlippageBps,
}: {
  chainId: number;
  fromToken: string;
  toToken: string;
  amount: string; // wei / raw amount
  fromAddress: Address;
  slippage?: number; // percent
  maxSlippageBps?: number;
}) {
  const effectiveMax = maxSlippageBps ?? DEFAULT_MAX_SLIPPAGE_BPS;
  enforceSlippageLimit(slippage, effectiveMax);

  const client = getClient(chainId);
  const data = await client.get("/swap", {
    src: resolveToken(chainId, fromToken),
    dst: resolveToken(chainId, toToken),
    amount,
    from: fromAddress,
    slippage,
    disableEstimate: "true",
    includeGas: "true",
  }) as {
    tx: {
      to: Address;
      data: `0x${string}`;
      value: string;
      gas: string;
      gasPrice: string;
    };
    toTokenAmount: string;
    fromTokenAmount: string;
    toToken: { symbol: string };
    fromToken: { symbol: string };
  };

  const summary = `Swap ${formatAmount(data.fromTokenAmount, fromToken)} ${data.fromToken.symbol} → ${formatAmount(data.toTokenAmount, data.toToken.symbol)} ${data.toToken.symbol}`;

  return {
    action: "swap",
    chainId,
    tx: {
      to: data.tx.to,
      data: data.tx.data,
      value: data.tx.value,
      gas: data.tx.gas,
      gasPrice: data.tx.gasPrice,
    },
    summary,
    needsApproval: true,
    protocol: "1inch",
  };
}
