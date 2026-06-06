/**
 * Address book hook — save/recall recipient addresses via localStorage.
 * Auto-resolves ENS names when saving. No backend persistence.
 */
import { useState, useCallback, useEffect } from "react";
import { lookupEnsName } from "../lib/ens";
import type { Address } from "viem";

export interface SavedAddress {
  name: string;
  address: string;
  chainId?: number;
  ensName?: string;
}

const STORAGE_KEY = "matterhorn_address_book";
const ENS_CACHE_KEY = "matterhorn_address_book_ens_cache";

function readEnsCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ENS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeEnsCache(cache: Record<string, string>) {
  localStorage.setItem(ENS_CACHE_KEY, JSON.stringify(cache));
}

export function useAddressBook() {
  const [addresses, setAddresses] = useState<SavedAddress[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedAddress[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
  }, [addresses]);

  const add = useCallback(async (addr: SavedAddress) => {
    if (!addr.address.startsWith("0x") || addr.address.length !== 42) return;
    const lowerAddr = addr.address.toLowerCase();

    // Resolve ENS if not already provided
    let ensName = addr.ensName;
    if (!ensName) {
      const cache = readEnsCache();
      ensName = cache[lowerAddr];
      if (!ensName) {
        try {
          ensName = (await lookupEnsName(addr.address as Address)) ?? undefined;
          if (ensName) {
            cache[lowerAddr] = ensName;
            writeEnsCache(cache);
          }
        } catch {
          // Ignore ENS lookup failures
        }
      }
    }

    setAddresses((prev) => {
      if (prev.some((a) => a.address.toLowerCase() === lowerAddr)) return prev;
      return [...prev, { ...addr, ensName }];
    });
  }, []);

  const remove = useCallback((address: string) => {
    setAddresses((prev) => prev.filter((a) => a.address.toLowerCase() !== address.toLowerCase()));
  }, []);

  return { addresses, add, remove };
}
