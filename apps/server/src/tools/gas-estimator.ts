/**
 * Gas Estimator.
 * Wraps viem estimateGas with human-readable pricing and limits.
 */

import { getClient } from "../infra/chain-client.js";
import type { Address, Hex } from "viem";

const GAS_PRICE_KEY = "matterhorn:wallet:gasPrice";
const GAS_PRICE_TTL_MS = 60_000; // 1 minute cache

interface CachedGasPrice {
  price: bigint;
  timestamp: number;
}

/** Simple in-memory cache for gas prices per chain. */
const gasPriceCache: Record<number, CachedGasPrice> = {};

async function getGasPriceCached(chainId: number) {
  const now = Date.now();
  const cached = gasPriceCache[chainId];
  if (cached && now - cached.timestamp < GAS_PRICE_TTL_MS) {
    return cached.price;
  }

  const client = getClient(chainId);
  if (!client) return null;

  try {
    const price = await client.getGasPrice();
    gasPriceCache[chainId] = { price, timestamp: now };
    return price;
  } catch {
    return null;
  }
}

/**
 * Estimate gas for a raw call and return formatted output.
 */
export async function estimateGasFormatted({
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
    const [gas, gasPrice] = await Promise.all([
      client.estimateGas({
        to,
        data,
        value: BigInt(value),
        account: from,
      }),
      getGasPriceCached(chainId),
    ]);

    const gasPriceGwei = gasPrice ? Number(gasPrice) / 1e9 : null;
    const estimatedCostWei = gasPrice ? gas * gasPrice : null;
    const estimatedCostEth = estimatedCostWei ? Number(estimatedCostWei) / 1e18 : null;

    return {
      success: true,
      gas: gas.toString(),
      gasFormatted: Number(gas).toLocaleString(),
      gasPriceWei: gasPrice?.toString() ?? null,
      gasPriceGwei,
      estimatedCostWei: estimatedCostWei?.toString() ?? null,
      estimatedCostEth: estimatedCostEth !== null ? estimatedCostEth.toFixed(8) : null,
      estimatedCostUSD: estimatedCostEth !== null ? (estimatedCostEth * 2000).toFixed(2) : null,
      unit: "ETH",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Gas estimation failed",
    };
  }
}

/**
 * Get current gas price for a chain (cached).
 */
export async function getGasPrice(chainId: number) {
  const price = await getGasPriceCached(chainId);
  if (!price) return { success: false, error: "Failed to fetch gas price" };

  return {
    success: true,
    gasPriceWei: price.toString(),
    gasPriceGwei: Number(price) / 1e9,
    unit: "gwei",
  };
}
