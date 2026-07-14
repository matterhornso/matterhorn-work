/**
 * Gas estimation client utilities.
 */

import { createPublicClient, http, type Address, type Hex } from "viem";
import { base, baseSepolia } from "viem/chains";
import { parseTxValueWei } from "../state/wallet-store";

const clients = {
  [base.id]: createPublicClient({ chain: base, transport: http("https://mainnet.base.org") }),
  [baseSepolia.id]: createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") }),
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

export function sanitizeGasEstimateError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  const lower = message.toLowerCase();
  if (lower.includes("insufficient funds")) return "Gas estimate failed because the connected wallet may not have enough funds.";
  if (lower.includes("execution reverted") || lower.includes("reverted")) return "Gas estimate failed because the transaction would revert.";
  if (lower.includes("user rejected") || lower.includes("denied")) return "Gas estimate was rejected by the wallet or provider.";
  if (lower.includes("unsupported chain")) return "Gas estimate is unavailable on this network.";
  if (lower.includes("timeout") || lower.includes("timed out")) return "Gas estimate timed out. Try again after the provider responds.";
  if (lower.includes("network") || lower.includes("fetch")) return "Gas estimate failed because the network provider did not respond.";
  return "Gas estimate is unavailable. Review the transaction details before continuing.";
}

/**
 * Estimate gas for a transaction on the given chain.
 */
export async function estimateGasClient({
  chainId,
  to,
  data,
  value,
  from,
  ethPriceUSD = 2000,
}: {
  chainId: number;
  to: Address;
  data: Hex;
  value?: string;
  from: Address;
  ethPriceUSD?: number;
}): Promise<GasEstimateResult> {
  const client = clients[chainId as keyof typeof clients];
  if (!client) return { success: false, error: `Unsupported chainId: ${chainId}` };

  try {
    const [gas, gasPrice] = await Promise.all([
      client.estimateGas({
        to,
        data,
        value: parseTxValueWei(value ?? "0"),
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
      estimatedCostUSD: costEth !== null ? (costEth * ethPriceUSD).toFixed(2) : null,
    };
  } catch (err) {
    return {
      success: false,
      error: sanitizeGasEstimateError(err),
    };
  }
}
