/** @jsxImportSource react */
import {
  createContext,
  use,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

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

  useEffect(() => {
    function handleTxRequest(event: Event) {
      const detail = (event as CustomEvent<{
        to: string;
        value: string;
        data?: string;
        chainId: number;
        proposedBy: string;
        riskLevel: "low" | "medium" | "high";
      }>).detail;
      storeRef.current.requestApproval(
        detail.to,
        detail.value,
        detail.data,
        detail.chainId,
        detail.proposedBy,
        detail.riskLevel,
      );
    }

    window.addEventListener("matterhorn:tx-approval-request", handleTxRequest);
    return () =>
      window.removeEventListener("matterhorn:tx-approval-request", handleTxRequest);
  }, []);

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
