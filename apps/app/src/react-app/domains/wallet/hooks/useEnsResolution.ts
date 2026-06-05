/**
 * Reactive ENS resolution hook.
 * Debounces input and resolves ENS names via mainnet.
 */
import { useState, useEffect, useCallback } from "react";
import { resolveEnsName, lookupEnsName } from "../lib/ens";
import type { Address } from "viem";

const ENS_DEBOUNCE_MS = 400;

export function useEnsResolution() {
  const [resolvedAddress, setResolvedAddress] = useState<Address | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const resolve = useCallback(async (input: string) => {
    if (!input || input.trim().length < 3) {
      setResolvedAddress(null);
      setResolvedName(null);
      return;
    }

    // If already an address, try reverse lookup
    if (input.startsWith("0x") && input.length === 42) {
      setResolvedAddress(input as Address);
      setIsResolving(true);
      try {
        const name = await lookupEnsName(input as Address);
        setResolvedName(name);
      } finally {
        setIsResolving(false);
      }
      return;
    }

    // If looks like ENS name
    if (input.includes(".")) {
      setIsResolving(true);
      try {
        const address = await resolveEnsName(input);
        setResolvedAddress(address);
        setResolvedName(address ? input : null);
      } finally {
        setIsResolving(false);
      }
      return;
    }

    setResolvedAddress(null);
    setResolvedName(null);
  }, []);

  return { resolvedAddress, resolvedName, isResolving, resolve };
}
