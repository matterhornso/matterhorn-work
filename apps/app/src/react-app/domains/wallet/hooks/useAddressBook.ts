/**
 * Address book hook — save/recall recipient addresses via localStorage.
 * No backend persistence; per-device local storage only.
 */
import { useState, useCallback, useEffect } from "react";

export interface SavedAddress {
  name: string;
  address: string;
  chainId?: number;
}

const STORAGE_KEY = "matterhorn_address_book";

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

  const add = useCallback((addr: SavedAddress) => {
    setAddresses((prev) => {
      if (prev.some((a) => a.address.toLowerCase() === addr.address.toLowerCase())) return prev;
      return [...prev, addr];
    });
  }, []);

  const remove = useCallback((address: string) => {
    setAddresses((prev) => prev.filter((a) => a.address.toLowerCase() !== address.toLowerCase()));
  }, []);

  return { addresses, add, remove };
}
