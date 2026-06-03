/**
 * Client-side ENS resolution utilities.
 * Uses wagmi/viem under the hood.
 */

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { useMemo } from "react";
import type { Address } from "viem";

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
});

/**
 * Resolve an ENS name → address (one-shot).
 */
export async function resolveEnsName(name: string): Promise<Address | null> {
  try {
    const address = await mainnetClient.getEnsAddress({ name });
    return address ?? null;
  } catch {
    return null;
  }
}

/**
 * Reverse-resolve address → ENS name (one-shot).
 */
export async function lookupEnsName(address: Address): Promise<string | null> {
  try {
    const name = await mainnetClient.getEnsName({ address });
    return name ?? null;
  } catch {
    return null;
  }
}

/**
 * Format address with ENS fallback: "vitalik.eth" or "0xabcd...1234".
 */
export function useFormattedAddress(address: Address | null | undefined): string {
  return useMemo(() => {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);
}

/**
 * Truncate an address for display.
 */
export function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
