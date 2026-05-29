import * as React from "react";

export type TxRecord = {
  hash: `0x${string}`;
  to: `0x${string}`;
  value: string;
  status: "pending" | "confirmed" | "failed";
  timestamp: number;
  chainId: number;
};

export type WalletStoreSnapshot = {
  address: `0x${string}` | null;
  chainId: number | null;
  ethBalance: string | null;
  usdcBalance: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connector: string | null;
  transactions: TxRecord[];
  pendingApproval: {
    to: string;
    value: string;
    data?: string;
    chainId: number;
  } | null;
  error: string | null;
};

export type WalletStore = ReturnType<typeof createWalletStore>;

const MAX_TRANSACTIONS = 50;

export function createWalletStore() {
  const listeners = new Set<() => void>();

  let snapshot: WalletStoreSnapshot = {
    address: null,
    chainId: null,
    ethBalance: null,
    usdcBalance: null,
    isConnected: false,
    isConnecting: false,
    connector: null,
    transactions: [],
    pendingApproval: null,
    error: null,
  };

  function emitChange() {
    for (const listener of listeners) listener();
  }

  function mutate(updater: (s: WalletStoreSnapshot) => WalletStoreSnapshot) {
    snapshot = updater(snapshot);
    emitChange();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(): WalletStoreSnapshot {
      return snapshot;
    },

    setConnecting(value: boolean) {
      mutate((s) => ({ ...s, isConnecting: value, error: null }));
    },

    setConnected(address: `0x${string}`, chainId: number, connector: string) {
      mutate((s) => ({
        ...s,
        address,
        chainId,
        connector,
        isConnected: true,
        isConnecting: false,
        error: null,
      }));
    },

    disconnect() {
      mutate((s) => ({
        ...s,
        address: null,
        chainId: null,
        ethBalance: null,
        usdcBalance: null,
        isConnected: false,
        isConnecting: false,
        connector: null,
        pendingApproval: null,
        error: null,
      }));
    },

    setChainId(chainId: number) {
      mutate((s) => ({ ...s, chainId }));
    },

    setBalances(ethBalance: string, usdcBalance: string) {
      mutate((s) => ({ ...s, ethBalance, usdcBalance }));
    },

    addTransaction(tx: TxRecord) {
      mutate((s) => ({
        ...s,
        transactions: [tx, ...s.transactions].slice(0, MAX_TRANSACTIONS),
      }));
    },

    updateTransaction(hash: string, status: TxRecord["status"]) {
      mutate((s) => ({
        ...s,
        transactions: s.transactions.map((tx) =>
          tx.hash === hash ? { ...tx, status } : tx,
        ),
      }));
    },

    requestApproval(to: string, value: string, data: string | undefined, chainId: number) {
      mutate((s) => ({
        ...s,
        pendingApproval: { to, value, data, chainId },
      }));
    },

    clearApproval() {
      mutate((s) => ({ ...s, pendingApproval: null }));
    },

    setError(error: string | null) {
      mutate((s) => ({ ...s, error }));
    },
  };
}

export function useWalletStore(store: WalletStore) {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot);
}
