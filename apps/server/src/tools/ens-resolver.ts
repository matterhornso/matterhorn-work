/**
 * ENS Name Resolution.
 * Uses viem ENS utilities to resolve .eth names → addresses.
 * Falls back to Ethereum mainnet for resolution since ENS L1 lives there.
 */

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import type { Address } from "viem";

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http("https://ethereum-rpc.publicnode.com"),
});

/**
 * Resolve an ENS name (e.g. "vitalik.eth") to an Ethereum address.
 */
export async function resolveEnsName(name: string) {
  try {
    const address = await mainnetClient.getEnsAddress({ name });
    return {
      success: true,
      name,
      address: address ?? null,
      resolved: address !== null,
    };
  } catch (err) {
    return {
      success: false,
      name,
      error: err instanceof Error ? err.message : "ENS resolution failed",
    };
  }
}

/**
 * Reverse-resolve an address to an ENS name (if any).
 */
export async function lookupEnsAddress(address: Address) {
  try {
    const ensName = await mainnetClient.getEnsName({ address });
    return {
      success: true,
      address,
      ensName: ensName ?? null,
      resolved: ensName !== null,
    };
  } catch (err) {
    return {
      success: false,
      address,
      error: err instanceof Error ? err.message : "ENS reverse lookup failed",
    };
  }
}

/**
 * Batch resolve multiple addresses — return a map of address → ensName.
 */
export async function batchResolveAddresses(addresses: Address[]) {
  const results = await Promise.all(addresses.map((a) => lookupEnsAddress(a)));
  const map: Record<Address, string | null> = {};
  for (let i = 0; i < addresses.length; i++) {
    const r = results[i];
    map[addresses[i]] = r.success && r.resolved ? r.ensName : null;
  }
  return map;
}
