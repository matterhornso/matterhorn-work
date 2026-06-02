import * as React from "react";

export type TxRecord = {
  hash: `0x${string}`;
  to: `0x${string}`;
  value: string;
  status: "pending" | "confirmed" | "failed";
  timestamp: number;
  chainId: number;
  proposedBy: string;
  riskLevel: "low" | "medium" | "high";
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
    proposedBy: string;
    riskLevel: "low" | "medium" | "high";
  } | null;
  error: string | null;
  maxDailySpendUSD: number;
  maxPerTransactionUSD: number;
  dailySpendUSD: number;
  lastSpendReset: string;
  preferredNetwork: number | null;
};

export type WalletStore = ReturnType<typeof createWalletStore>;

const MAX_TRANSACTIONS = 50;
const FALLBACK_ETH_PRICE_USD = 2000;

const DAILY_RESET_KEY = "matterhorn:wallet:lastSpendReset";
const DAILY_SPEND_KEY = "matterhorn:wallet:dailySpendUSD";
const MAX_DAILY_KEY = "matterhorn:wallet:maxDailySpendUSD";
const MAX_PER_TX_KEY = "matterhorn:wallet:maxPerTransactionUSD";
const PREFERRED_NETWORK_KEY = "matterhorn:wallet:preferredNetwork";

function readNum(key: string, fallback: number): number {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function writeNum(key: string, value: number): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, String(value));
  }
}

function readStr(key: string, fallback: string): string {
  return typeof window !== "undefined" ? window.localStorage.getItem(key) ?? fallback : fallback;
}

function writeStr(key: string, value: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, value);
  }
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailySpendWithReset(): { dailySpendUSD: number; lastSpendReset: string } {
  const today = todayString();
  const lastReset = readStr(DAILY_RESET_KEY, today);
  let dailySpend = readNum(DAILY_SPEND_KEY, 0);
  if (lastReset !== today) {
    dailySpend = 0;
    writeStr(DAILY_RESET_KEY, today);
    writeNum(DAILY_SPEND_KEY, 0);
  }
  return { dailySpendUSD: dailySpend, lastSpendReset: lastReset };
}

function getInitialSnapshot(): WalletStoreSnapshot {
  const { dailySpendUSD, lastSpendReset } = getDailySpendWithReset();
  const maxDailySpendUSD = readNum(MAX_DAILY_KEY, 100);
  const maxPerTransactionUSD = readNum(MAX_PER_TX_KEY, 50);
  const preferredNetwork = readNum(PREFERRED_NETWORK_KEY, 84532);
  return {
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
    maxDailySpendUSD,
    maxPerTransactionUSD,
    dailySpendUSD,
    lastSpendReset,
    preferredNetwork,
  };
}

export function computeTxValueUSD(value: string): number {
  const numeric = value.startsWith("0x") ? Number(BigInt(value)) / 1e18 : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric * FALLBACK_ETH_PRICE_USD;
}

export function createWalletStore() {
  const listeners = new Set<() => void>();

  let snapshot = getInitialSnapshot();

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

    requestApproval(
      to: string,
      value: string,
      data: string | undefined,
      chainId: number,
      proposedBy = "user_manual",
      riskLevel: "low" | "medium" | "high" = "low",
    ) {
      mutate((s) => ({
        ...s,
        pendingApproval: { to, value, data, chainId, proposedBy, riskLevel },
      }));
    },

    clearApproval() {
      mutate((s) => ({ ...s, pendingApproval: null }));
    },

    setError(error: string | null) {
      mutate((s) => ({ ...s, error }));
    },

    setMaxDailySpendUSD(value: number) {
      const v = Number.isFinite(value) && value > 0 ? value : 100;
      writeNum(MAX_DAILY_KEY, v);
      mutate((s) => ({ ...s, maxDailySpendUSD: v }));
    },

    setMaxPerTransactionUSD(value: number) {
      const v = Number.isFinite(value) && value > 0 ? value : 50;
      writeNum(MAX_PER_TX_KEY, v);
      mutate((s) => ({ ...s, maxPerTransactionUSD: v }));
    },

    incrementDailySpendUSD(amountUSD: number) {
      const today = todayString();
      if (snapshot.lastSpendReset !== today) {
        writeStr(DAILY_RESET_KEY, today);
        writeNum(DAILY_SPEND_KEY, 0);
        mutate((s) => ({ ...s, dailySpendUSD: 0, lastSpendReset: today }));
      }
      const next = snapshot.dailySpendUSD + amountUSD;
      writeNum(DAILY_SPEND_KEY, next);
      mutate((s) => ({ ...s, dailySpendUSD: next }));
    },

    setPreferredNetwork(chainId: number) {
      writeNum(PREFERRED_NETWORK_KEY, chainId);
      mutate((s) => ({ ...s, preferredNetwork: chainId }));
    },
  };
}

export function useWalletStore(store: WalletStore) {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot);
}
