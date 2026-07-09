/**
 * Reactive ENS resolution hook.
 * Debounces input and resolves ENS names via mainnet.
 */
import { useState, useCallback, useRef } from "react";
import { resolveEnsName, lookupEnsName } from "../lib/ens";
import type { Address } from "viem";

export function useEnsResolution() {
  const [resolvedAddress, setResolvedAddress] = useState<Address | null>(null);
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolvedFor, setResolvedFor] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const requestIdRef = useRef(0);

  const resolve = useCallback(async (input: string) => {
    const query = input.trim();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setResolvedAddress(null);
    setResolvedName(null);
    setResolvedFor(query);

    if (!query || query.length < 3) {
      setIsResolving(false);
      setResolvedAddress(null);
      setResolvedName(null);
      return;
    }

    // If already an address, try reverse lookup
    if (query.startsWith("0x") && query.length === 42) {
      setResolvedAddress(query as Address);
      setIsResolving(true);
      try {
        const name = await lookupEnsName(query as Address);
        if (requestId === requestIdRef.current) setResolvedName(name);
      } finally {
        if (requestId === requestIdRef.current) setIsResolving(false);
      }
      return;
    }

    // If looks like ENS name
    if (query.includes(".")) {
      setIsResolving(true);
      try {
        const address = await resolveEnsName(query);
        if (requestId !== requestIdRef.current) return;
        setResolvedAddress(address);
        setResolvedName(address ? query : null);
      } finally {
        if (requestId === requestIdRef.current) setIsResolving(false);
      }
      return;
    }

    setResolvedAddress(null);
    setResolvedName(null);
    setIsResolving(false);
  }, []);

  return { resolvedAddress, resolvedName, resolvedFor, isResolving, resolve };
}
