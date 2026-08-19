/** Gas estimate display contracts and redaction. Estimation is server-routed. */

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
