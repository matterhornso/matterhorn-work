import * as React from "react";
import { USDC_BY_CHAIN, USDC_DECIMALS } from "../../../infra/contracts";

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
  /** Mainnet must be explicitly enabled before Matterhorn will send Base mainnet transactions. */
  mainnetEnabled: boolean;
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
export const MAX_SWAPS_PER_HOUR = 5;

const DAILY_RESET_KEY = "matterhorn:wallet:lastSpendReset";
const DAILY_SPEND_KEY = "matterhorn:wallet:dailySpendUSD";
const MAX_DAILY_KEY = "matterhorn:wallet:maxDailySpendUSD";
const MAX_PER_TX_KEY = "matterhorn:wallet:maxPerTransactionUSD";
const PREFERRED_NETWORK_KEY = "matterhorn:wallet:preferredNetwork";
const MAINNET_ENABLED_KEY = "matterhorn:wallet:mainnetEnabled";
const MAX_SLIPPAGE_BPS_KEY = "matterhorn:wallet:maxSlippageBps";
const SWAP_COUNT_KEY = "matterhorn:wallet:sessionSwapCount";
const LAST_SWAP_RESET_KEY = "matterhorn:wallet:lastSwapReset";
const WEI_PER_ETH = 1_000_000_000_000_000_000n;
const MAX_UINT256 =
  115792089237316195423570985008687907853269984665640564039457584007913129639935n;

export type KnownTokenAction = {
  kind: "approve" | "transfer" | "transferFrom";
  tokenSymbol: "USDC";
  tokenAddress: string;
  amountRaw: bigint;
  amount: number;
  amountFormatted: string;
  usdValue: number;
  recipient?: string;
  spender?: string;
  from?: string;
  isUnlimitedApproval: boolean;
};

export type WalletTransactionAnalysis = {
  nativeValueWei: bigint;
  nativeValueEth: string;
  nativeValueUSD: number;
  tokenAction: KnownTokenAction | null;
  isSwap: boolean;
  valueUSD: number;
  displayValue: string;
  assetChanges: WalletAssetChange[];
  warnings: string[];
};

export type WalletAssetChange = {
  asset: "ETH" | "USDC";
  direction: "send" | "approve" | "transfer" | "transferFrom";
  amount: string;
  usdValue: number;
  recipient?: string;
  spender?: string;
  from?: string;
  summary: string;
};

export type WalletApprovalPolicyInput = {
  valueUSD: number;
  maxPerTransactionUSD: number;
  maxDailySpendUSD: number;
  dailySpendUSD: number;
  sessionSwapCount: number;
  lastSwapReset: number;
  isSwap?: boolean;
  now?: number;
};

export type WalletSafetyPolicy = {
  version: "matterhorn.wallet.safety-policy.v1";
  maxPerTransactionUSD: number;
  maxDailySpendUSD: number;
  dailySpendUSD: number;
  sessionSwapCount: number;
  lastSwapReset: number;
  mainnetEnabled: boolean;
  maxSlippageBps: number;
  preferredNetwork: number | null;
};

export type WalletTransactionSendValidationInput = {
  chainId: number;
  connectedChainId: number | null | undefined;
  to: string;
  value: string;
  data?: string;
  forceTestnet?: boolean;
  policy: Omit<WalletApprovalPolicyInput, "valueUSD">;
  chainName?: (chainId: number) => string;
};

export type PreparedWalletSendRequest = {
  analysis: WalletTransactionAnalysis;
  request: {
    chainId: number;
    to: `0x${string}`;
    value: bigint;
    data?: `0x${string}`;
  };
};

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

function readBool(key: string, fallback: boolean): boolean {
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

function writeBool(key: string, value: boolean): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, value ? "true" : "false");
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
  const mainnetEnabled = readBool(MAINNET_ENABLED_KEY, false);
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
    mainnetEnabled,
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

function normalizeAddress(address: string | undefined): string {
  return String(address ?? "").trim().toLowerCase();
}

function hexWord(data: string, index: number): string | null {
  const clean = data.toLowerCase().replace(/^0x/, "");
  const start = 8 + index * 64;
  const word = clean.slice(start, start + 64);
  return word.length === 64 ? word : null;
}

function addressFromWord(word: string | null): string | null {
  if (!word) return null;
  return `0x${word.slice(24)}`;
}

function bigintFromWord(word: string | null): bigint | null {
  if (!word) return null;
  try {
    return BigInt(`0x${word}`);
  } catch {
    return null;
  }
}

function formatTokenAmount(raw: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = raw / scale;
  const fraction = raw % scale;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fractionText}`;
}

function knownUsdcAddress(chainId: number): string | null {
  return USDC_BY_CHAIN[chainId]?.toLowerCase() ?? null;
}

function isKnownSwapSelector(data: string | undefined): boolean {
  if (!data || data === "0x") return false;
  const selector = `0x${data.toLowerCase().replace(/^0x/, "").slice(0, 8)}`;
  return [
    "0x38ed1739", // swapExactTokensForTokens
    "0x8803dbee", // swapTokensForExactTokens
    "0x7ff36ab5", // swapExactETHForTokens
    "0x18cbafe5", // swapExactTokensForETH
  ].includes(selector);
}

export function decodeKnownTokenAction({
  chainId,
  to,
  data,
}: {
  chainId: number;
  to: string;
  data?: string;
}): KnownTokenAction | null {
  const usdcAddress = knownUsdcAddress(chainId);
  if (!data || data === "0x" || !usdcAddress || normalizeAddress(to) !== usdcAddress) return null;

  const clean = data.toLowerCase().replace(/^0x/, "");
  const selector = `0x${clean.slice(0, 8)}`;
  const tokenAddress = USDC_BY_CHAIN[chainId];
  let kind: KnownTokenAction["kind"] | null = null;
  let amountRaw: bigint | null = null;
  let recipient: string | undefined;
  let spender: string | undefined;
  let from: string | undefined;

  if (selector === "0xa9059cbb") {
    kind = "transfer";
    recipient = addressFromWord(hexWord(data, 0)) ?? undefined;
    amountRaw = bigintFromWord(hexWord(data, 1));
  } else if (selector === "0x095ea7b3") {
    kind = "approve";
    spender = addressFromWord(hexWord(data, 0)) ?? undefined;
    amountRaw = bigintFromWord(hexWord(data, 1));
  } else if (selector === "0x23b872dd") {
    kind = "transferFrom";
    from = addressFromWord(hexWord(data, 0)) ?? undefined;
    recipient = addressFromWord(hexWord(data, 1)) ?? undefined;
    amountRaw = bigintFromWord(hexWord(data, 2));
  }

  if (!kind || amountRaw === null) return null;

  const isUnlimitedApproval = kind === "approve" && amountRaw === MAX_UINT256;
  const amountFormatted = isUnlimitedApproval ? "Unlimited" : formatTokenAmount(amountRaw, USDC_DECIMALS);
  const amount = isUnlimitedApproval ? Number.MAX_SAFE_INTEGER : Number(amountFormatted);
  const usdValue = Number.isFinite(amount) && amount > 0 ? amount : 0;

  return {
    kind,
    tokenSymbol: "USDC",
    tokenAddress,
    amountRaw,
    amount,
    amountFormatted,
    usdValue,
    recipient,
    spender,
    from,
    isUnlimitedApproval,
  };
}

export function analyzeWalletTransaction({
  chainId,
  to,
  value,
  data,
}: {
  chainId: number;
  to: string;
  value: string;
  data?: string;
}): WalletTransactionAnalysis {
  const nativeValueWei = parseTxValueWei(value);
  const nativeValueEth = formatTxValueEth(value);
  const nativeValueUSD = computeTxValueUSD(value);
  const tokenAction = decodeKnownTokenAction({ chainId, to, data });
  const isSwap = isKnownSwapSelector(data);
  const valueUSD = nativeValueUSD + (tokenAction?.usdValue ?? 0);
  const warnings: string[] = [];
  const assetChanges: WalletAssetChange[] = [];

  if (tokenAction?.isUnlimitedApproval) {
    warnings.push("Unlimited USDC approval detected. Use a limited allowance unless you fully trust the spender.");
  }

  const displayParts: string[] = [];
  if (nativeValueWei > 0n) {
    displayParts.push(`${nativeValueEth} ETH`);
    assetChanges.push({
      asset: "ETH",
      direction: "send",
      amount: nativeValueEth,
      usdValue: nativeValueUSD,
      recipient: to,
      summary: `Send ${nativeValueEth} ETH`,
    });
  }
  if (tokenAction) {
    const verb = tokenAction.kind === "approve" ? "Approve" : tokenAction.kind === "transferFrom" ? "Transfer from" : "Transfer";
    displayParts.push(`${verb} ${tokenAction.amountFormatted} ${tokenAction.tokenSymbol}`);
    assetChanges.push({
      asset: tokenAction.tokenSymbol,
      direction: tokenAction.kind,
      amount: tokenAction.amountFormatted,
      usdValue: tokenAction.usdValue,
      recipient: tokenAction.recipient,
      spender: tokenAction.spender,
      from: tokenAction.from,
      summary: `${verb} ${tokenAction.amountFormatted} ${tokenAction.tokenSymbol}`,
    });
  }

  return {
    nativeValueWei,
    nativeValueEth,
    nativeValueUSD,
    tokenAction,
    isSwap,
    valueUSD,
    displayValue: displayParts.length > 0 ? displayParts.join(" + ") : "0 ETH",
    assetChanges,
    warnings,
  };
}

export function evaluateWalletApprovalPolicy(input: WalletApprovalPolicyInput): string[] {
  const reasons: string[] = [];
  if (input.maxPerTransactionUSD > 0 && input.valueUSD > input.maxPerTransactionUSD) {
    reasons.push(`This transaction exceeds your per-transaction limit of $${input.maxPerTransactionUSD}.`);
  }
  if (input.maxDailySpendUSD > 0 && input.valueUSD + input.dailySpendUSD > input.maxDailySpendUSD) {
    reasons.push(`This transaction exceeds your daily limit of $${input.maxDailySpendUSD}.`);
  }

  const now = input.now ?? Date.now();
  const windowExpired = now - input.lastSwapReset >= 60 * 60 * 1000;
  if (input.isSwap && !windowExpired && input.sessionSwapCount >= MAX_SWAPS_PER_HOUR) {
    reasons.push(`Swap rate limit reached (${MAX_SWAPS_PER_HOUR}/hour).`);
  }

  return reasons;
}

export function walletSafetyPolicyFromSnapshot(snapshot: Pick<
  WalletStoreSnapshot,
  | "maxPerTransactionUSD"
  | "maxDailySpendUSD"
  | "dailySpendUSD"
  | "sessionSwapCount"
  | "lastSwapReset"
  | "mainnetEnabled"
  | "maxSlippageBps"
  | "preferredNetwork"
>): WalletSafetyPolicy {
  return {
    version: "matterhorn.wallet.safety-policy.v1",
    maxPerTransactionUSD: snapshot.maxPerTransactionUSD,
    maxDailySpendUSD: snapshot.maxDailySpendUSD,
    dailySpendUSD: snapshot.dailySpendUSD,
    sessionSwapCount: snapshot.sessionSwapCount,
    lastSwapReset: snapshot.lastSwapReset,
    mainnetEnabled: snapshot.mainnetEnabled,
    maxSlippageBps: snapshot.maxSlippageBps,
    preferredNetwork: snapshot.preferredNetwork,
  };
}

export function approvalPolicyFromSafetyPolicy(
  policy: WalletSafetyPolicy,
): Omit<WalletApprovalPolicyInput, "valueUSD"> {
  return {
    maxPerTransactionUSD: policy.maxPerTransactionUSD,
    maxDailySpendUSD: policy.maxDailySpendUSD,
    dailySpendUSD: policy.dailySpendUSD,
    sessionSwapCount: policy.sessionSwapCount,
    lastSwapReset: policy.lastSwapReset,
  };
}

export function evaluateWalletApprovalAgainstPolicy(input: {
  valueUSD: number;
  policy: WalletSafetyPolicy;
  isSwap?: boolean;
  now?: number;
}): string[] {
  return evaluateWalletApprovalPolicy({
    ...approvalPolicyFromSafetyPolicy(input.policy),
    valueUSD: input.valueUSD,
    isSwap: input.isSwap,
    now: input.now,
  });
}

export function validateWalletTransactionBeforeSend(
  input: WalletTransactionSendValidationInput,
): WalletTransactionAnalysis {
  if (input.forceTestnet && input.chainId === 8453) {
    throw new Error("Mainnet is disabled (FORCE_TESTNET=true)");
  }

  if (!input.connectedChainId) {
    throw new Error("Wallet chain is unavailable. Reconnect your wallet and try again.");
  }

  if (input.connectedChainId !== input.chainId) {
    const expected = input.chainName?.(input.chainId) ?? `chain ${input.chainId}`;
    const actual = input.chainName?.(input.connectedChainId) ?? `chain ${input.connectedChainId}`;
    throw new Error(`Switch your wallet to ${expected}. It is currently on ${actual}.`);
  }

  const analysis = analyzeWalletTransaction({
    chainId: input.chainId,
    to: input.to,
    value: input.value,
    data: input.data,
  });
  const blockingReasons = evaluateWalletApprovalPolicy({
    ...input.policy,
    valueUSD: analysis.valueUSD,
    isSwap: analysis.isSwap,
  });
  if (blockingReasons.length > 0) {
    throw new Error(blockingReasons.join(" "));
  }

  return analysis;
}

export function prepareWalletTransactionSend(
  input: WalletTransactionSendValidationInput,
): PreparedWalletSendRequest {
  const analysis = validateWalletTransactionBeforeSend(input);
  return {
    analysis,
    request: {
      chainId: input.chainId,
      to: input.to as `0x${string}`,
      value: parseTxValueWei(input.value),
      data: input.data as `0x${string}` | undefined,
    },
  };
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

    setMainnetEnabled(value: boolean) {
      writeBool(MAINNET_ENABLED_KEY, value);
      mutate((s) => ({ ...s, mainnetEnabled: value }));
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
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
