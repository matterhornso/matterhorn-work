/**
 * Gas estimation client utilities.
 */

import { createPublicClient, http, type Address, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";

const clients = {
  [base.id]: createPublicClient({ chain: base, transport: http() }),
  [baseSepolia.id]: createPublicClient({ chain: baseSepolia, transport: http() }),
};

export type GasEstimateResult = {
  success: true;
  gas: string;
  gasFormatted: string;
  gasPriceGwei: number | null;
  estimatedCostEth: string | null;
  estimatedCostUSD: string | null;
} | {
  success: false;
  error: string;
};

/**
 * Estimate gas for a transaction on the given chain.
 */
export async function estimateGasClient({
  chainId,
  to,
  data,
  value,
  from,
}: {
  chainId: number;
  to: Address;
  data: Hex;
  value?: string;
  from: Address;
}): Promise<GasEstimateResult> {
  const client = clients[chainId as keyof typeof clients];
  if (!client) return { success: false, error: `Unsupported chainId: ${chainId}` };

  try {
    const [gas, gasPrice] = await Promise.all([
      client.estimateGas({
        to,
        data,
        value: BigInt(value ?? "0"),
        account: from,
      }),
      client.getGasPrice().catch(() => null),
    ]);

    const gasPriceGwei = gasPrice ? Number(gasPrice) / 1e9 : null;
    const costWei = gasPrice ? gas * gasPrice : null;
    const costEth = costWei ? Number(costWei) / 1e18 : null;

    return {
      success: true,
      gas: gas.toString(),
      gasFormatted: Number(gas).toLocaleString(),
      gasPriceGwei,
      estimatedCostEth: costEth !== null ? costEth.toFixed(8) : null,
      estimatedCostUSD: costEth !== null ? (costEth * 2000).toFixed(2) : null,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Gas estimation failed",
    };
  }
}
