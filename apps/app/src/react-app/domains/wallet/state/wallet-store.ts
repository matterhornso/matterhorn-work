import * as React from "react";

export type HlOrderApproval = {
  type: "hl_order";
  asset: string;
  isBuy: boolean;
  sz: number;
  limitPx?: number;
  reduceOnly?: boolean;
  summary: string;
  proposedBy: string;
  riskLevel: "low" | "medium" | "high";
};

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

export type ApprovalRequest = {
  to: string;
  value: string;
  data?: string;
  chainId: number;
  proposedBy: string;
  riskLevel: "low" | "medium" | "high";
  /** Warn if target address has no bytecode (EOA with data). */
  contractWarning?: string;
};

export type BatchApproval = {
  type: "batch";
  /** Unique batch ID for tracking. */
  batchId: string;
  steps: BatchStepView[];
  chainId: number;
  proposedBy: string;
  riskLevel: "low" | "medium" | "high";
};

export type BatchStepView = {
  id: string;
  type: string;
  description: string;
  to: string;
  data?: string;
  value?: string;
  dependsOn?: string;
  estimatedGas?: string | null;
  estimatedCostEth?: string | null;
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
  pendingApproval: (ApprovalRequest & { type: "tx" }) | HlOrderApproval | BatchApproval | null;
  error: string | null;
  maxDailySpendUSD: number;
  maxPerTransactionUSD: number;
  dailySpendUSD: number;
  lastSpendReset: string;
  preferredNetwork: number | null;
  /** Max slippage in basis points (1 = 0.01%). Default 100 = 1%. */
  maxSlippageBps: number;
  /** Number of swaps performed in the current hourly window. */
  sessionSwapCount: number;
  /** Timestamp (ms) when the swap count window started. */
  lastSwapReset: number;
};

export type WalletStore = ReturnType<typeof createWalletStore>;

const MAX_TRANSACTIONS = 50;
const FALLBACK_ETH_PRICE_USD = 2000;

const DAILY_RESET_KEY = "matterhorn:wallet:lastSpendReset";
const DAILY_SPEND_KEY = "matterhorn:wallet:dailySpendUSD";
const MAX_DAILY_KEY = "matterhorn:wallet:maxDailySpendUSD";
const MAX_PER_TX_KEY = "matterhorn:wallet:maxPerTransactionUSD";
const PREFERRED_NETWORK_KEY = "matterhorn:wallet:preferredNetwork";
const MAX_SLIPPAGE_BPS_KEY = "matterhorn:wallet:maxSlippageBps";
const SWAP_COUNT_KEY = "matterhorn:wallet:sessionSwapCount";
const LAST_SWAP_RESET_KEY = "matterhorn:wallet:lastSwapReset";
const WEI_PER_ETH = 1_000_000_000_000_000_000n;

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
  const maxSlippageBps = readNum(MAX_SLIPPAGE_BPS_KEY, 100);
  const now = Date.now();
  const lastSwap = readNum(LAST_SWAP_RESET_KEY, now);
  const hourMs = 60 * 60 * 1000;
  const sessionSwapCount = now - lastSwap >= hourMs ? 0 : readNum(SWAP_COUNT_KEY, 0);
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
    maxSlippageBps,
    sessionSwapCount,
    lastSwapReset: lastSwap,
  };
}

export function parseTxValueWei(value: string): bigint {
  const text = String(value ?? "0").trim();
  if (text.startsWith("0x")) return BigInt(text);
  if (/^(0|[1-9]\d*)$/.test(text)) return BigInt(text);
  if (/^(0|[1-9]\d*)\.\d+$/.test(text)) {
    const [whole, fraction = ""] = text.split(".");
    const paddedFraction = `${fraction.slice(0, 18)}${"0".repeat(Math.max(0, 18 - fraction.length))}`;
    return BigInt(whole) * WEI_PER_ETH + BigInt(paddedFraction);
  }
  throw new Error("Transaction value must be hex wei, raw wei, or decimal ETH");
}

export function formatTxValueEth(value: string): string {
  const wei = parseTxValueWei(value);
  const whole = wei / WEI_PER_ETH;
  const fraction = wei % WEI_PER_ETH;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

export function computeTxValueUSD(value: string): number {
  try {
    const eth = Number(parseTxValueWei(value)) / Number(WEI_PER_ETH);
    if (!Number.isFinite(eth) || eth < 0) return 0;
    return eth * FALLBACK_ETH_PRICE_USD;
  } catch {
    return 0;
  }
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
      contractWarning?: string,
    ) {
      mutate((s) => ({
        ...s,
        pendingApproval: { type: "tx" as const, to, value, data, chainId, proposedBy, riskLevel, contractWarning },
      }));
    },

    requestHlOrderApproval(order: Omit<HlOrderApproval, "type" | "riskLevel">) {
      mutate((s) => ({
        ...s,
        pendingApproval: {
          type: "hl_order" as const,
          ...order,
          riskLevel: "high" as const,
        },
      }));
    },

    requestBatchApproval(batch: Omit<BatchApproval, "type">) {
      mutate((s) => ({
        ...s,
        pendingApproval: { type: "batch" as const, ...batch },
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

    setMaxSlippageBps(value: number) {
      const v = Number.isFinite(value) && value > 0 ? value : 100;
      writeNum(MAX_SLIPPAGE_BPS_KEY, v);
      mutate((s) => ({ ...s, maxSlippageBps: v }));
    },

    /** Call this after a swap is successfully initiated to rate-limit. */
    incrementSessionSwapCount() {
      const now = Date.now();
      const hourMs = 60 * 60 * 1000;
      const windowExpired = now - snapshot.lastSwapReset >= hourMs;
      const nextCount = windowExpired ? 1 : snapshot.sessionSwapCount + 1;
      const nextReset = windowExpired ? now : snapshot.lastSwapReset;
      writeNum(SWAP_COUNT_KEY, nextCount);
      writeNum(LAST_SWAP_RESET_KEY, nextReset);
      mutate((s) => ({ ...s, sessionSwapCount: nextCount, lastSwapReset: nextReset }));
    },
  };
}

export function useWalletStore(store: WalletStore) {
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot);
}
