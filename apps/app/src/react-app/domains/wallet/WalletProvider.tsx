/** @jsxImportSource react */
import { createContext, use, useMemo, useRef, type ReactNode } from "react";

import type { WalletStore, WalletStoreSnapshot } from "./state/wallet-store";
import { createWalletStore, useWalletStore } from "./state/wallet-store";

type WalletProviderValue = {
  store: WalletStore;
  snapshot: WalletStoreSnapshot;
};

const WalletContext = createContext<WalletProviderValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<WalletStore>(createWalletStore());
  const snapshot = useWalletStore(storeRef.current);

  const value = useMemo<WalletProviderValue>(
    () => ({ store: storeRef.current, snapshot }),
    [snapshot],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletProviderValue {
  const ctx = use(WalletContext);
  if (!ctx) {
    // Fallback — create a standalone store if no provider
    // This lets wallet-aware components work outside the provider tree
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return ctx;
}

/** Non-throwing variant for optional wallet usage. */
export function useOptionalWallet(): WalletProviderValue | null {
  try {
    return use(WalletContext) ?? null;
  } catch {
    return null;
  }
}
