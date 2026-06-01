import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

/**
 * Base mainnet public client. Read-only — no wallet required.
 */
export const baseClient = createPublicClient({
  chain: base,
  transport: http(),
});

/**
 * Base Sepolia testnet public client.
 */
export const baseSepoliaClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

/**
 * Select a client by numeric chain ID.
 * Returns undefined for unsupported chains.
 */
export function getClient(chainId: number) {
  if (chainId === 8453) return baseClient;
  if (chainId === 84532) return baseSepoliaClient;
  return undefined;
}
