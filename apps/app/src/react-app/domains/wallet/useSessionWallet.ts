/** @jsxImportSource react */
import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useSendTransaction, useSignMessage, usePublicClient } from "wagmi";

import type { WalletStore } from "./state/wallet-store";
import {
  useWalletStore,
  analyzeWalletTransaction,
  approvalPolicyFromSafetyPolicy,
  evaluateWalletApprovalAgainstPolicy,
  walletSafetyPolicyFromSnapshot,
} from "./state/wallet-store";
import { buildSessionWalletContext, type SessionWalletContext } from "./SessionContextProvider";
import { CHAIN_NAMES, FORCE_TESTNET } from "../../infra/chains";
import { USDC_BY_CHAIN } from "../../infra/contracts";
import { isWhitelistedAddress } from "./infra/whitelist";
import { appendSecurityLog } from "./state/security-log";
import { sendReviewedWalletTransaction } from "./lib/reviewed-wallet-send";

/**
 * Hook that provides the session-scoped wallet context
 * and TX pipeline methods. Use this in session pages to
 * inject wallet context into agent prompts and handle
 * transaction approval.
 */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function useSessionWallet(store: WalletStore) {
  const state = useWalletStore(store);
  const { address: wagmiAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { signMessageAsync } = useSignMessage();
  const safetyPolicy = useMemo(() => walletSafetyPolicyFromSnapshot(state), [state]);

  const simulatePreparedTransaction = useCallback(async (request: {
    chainId: number;
    to: `0x${string}`;
    value: bigint;
    data?: `0x${string}`;
  }) => {
    if (!publicClient || !wagmiAddress) {
      return { status: "unavailable" as const, error: "Simulation service is unavailable." };
    }
    try {
      await publicClient.call({
        account: wagmiAddress,
        to: request.to,
        value: request.value,
        data: request.data,
      });
      return { status: "passed" as const };
    } catch (error) {
      return {
        status: "failed" as const,
        error: error instanceof Error ? error.message : "Transaction simulation failed.",
      };
    }
  }, [publicClient, wagmiAddress]);

  // Build the session context for injection into agent prompts
  const walletContext: SessionWalletContext = useMemo(() => {
    const chainName = state.chainId ? CHAIN_NAMES[state.chainId] ?? null : null;
    const usdcAddress = state.chainId ? USDC_BY_CHAIN[state.chainId] ?? null : null;
    return buildSessionWalletContext(state, chainName, usdcAddress);
  }, [state, state.chainId]);

  /**
   * Approve a pending TX — sends it to the chain.
   * Returns the transaction hash on success.
   */
  const approveTx = useCallback(async (): Promise<`0x${string}` | undefined> => {
    const approval = state.pendingApproval;
    if (!approval) throw new Error("No pending transaction to approve");
    if (approval.type !== "tx") throw new Error("No on-chain transaction to approve");

    if (!wagmiAddress) throw new Error("Wallet not connected");

    const connectedChainId = chainId ?? state.chainId;
    const result = await sendReviewedWalletTransaction({
      approval,
      connectedChainId,
      forceTestnet: FORCE_TESTNET || !state.mainnetEnabled,
      chainName: (id) => CHAIN_NAMES[id] ?? `chain ${id}`,
      policy: approvalPolicyFromSafetyPolicy(safetyPolicy),
      simulateTransaction: simulatePreparedTransaction,
      sendTransaction: sendTransactionAsync,
      onTransaction: (tx) => store.addTransaction(tx),
      onDailySpend: (amountUSD) => store.incrementDailySpendUSD(amountUSD),
      onSwapSubmitted: () => store.incrementSessionSwapCount(),
      onSecurityLog: appendSecurityLog,
      approvedReason: "User approved via TransactionApproval modal",
    });

    store.clearApproval();
    return result.hash;
  }, [
    state.pendingApproval,
    state.chainId,
    state.mainnetEnabled,
    safetyPolicy,
    wagmiAddress,
    chainId,
    simulatePreparedTransaction,
    sendTransactionAsync,
    store,
  ]);

  /**
   * Reject a pending TX — clears the approval request.
   */
  const rejectTx = useCallback(() => {
    const approval = state.pendingApproval;
    if (approval?.type === "tx") {
      let valueUSD = 0;
      try {
        valueUSD = analyzeWalletTransaction({
          chainId: approval.chainId,
          to: approval.to,
          value: approval.value,
          data: approval.data,
        }).valueUSD;
      } catch {
        valueUSD = 0;
      }
      appendSecurityLog({
        timestamp: Date.now(),
        action: "tx_rejected",
        chainId: approval.chainId,
        to: approval.to,
        valueUSD,
        riskLevel: approval.riskLevel,
        reason: "User rejected the transaction review.",
      });
    }
    store.clearApproval();
  }, [state.pendingApproval, store]);

  /**
   * Mark a transaction as confirmed or failed.
   */
  const updateTxStatus = useCallback(
    (hash: string, status: "confirmed" | "failed") => {
      store.updateTransaction(hash, status);
    },
    [store],
  );

  /**
   * Request a new transaction approval — shows the approval UI.
   * Computes risk level from whitelist + amount, and enforces spend limits
   * plus the swap rate-limit (5 swaps / hour).
   */
  const requestTx = useCallback(
    async (to: string, value: string, data?: string, proposedBy = "user_manual") => {
      const currentChainId = chainId ?? state.chainId ?? 84532;
      const whitelisted = isWhitelistedAddress(currentChainId, to);
      const analysis = analyzeWalletTransaction({ chainId: currentChainId, to, value, data });
      const valueUSD = analysis.valueUSD;
      let riskLevel: "low" | "medium" | "high" = "low";
      if (!analysis.valueUSDIsKnown || !whitelisted) riskLevel = "high";
      else if (valueUSD > state.maxPerTransactionUSD) riskLevel = "medium";
      else if (valueUSD + state.dailySpendUSD > state.maxDailySpendUSD) riskLevel = "medium";

      const now = Date.now();
      const blockingReasons = evaluateWalletApprovalAgainstPolicy({
        valueUSD,
        valueUSDIsKnown: analysis.valueUSDIsKnown,
        policy: safetyPolicy,
        isSwap: analysis.isSwap,
        now,
      });
      if (blockingReasons.length > 0) {
        const isRateLimit = blockingReasons.some((reason) => reason.includes("rate limit"));
        appendSecurityLog({
          timestamp: now,
          action: isRateLimit ? "rate_limit_hit" : "limit_hit",
          chainId: currentChainId,
          to: to || ZERO_ADDRESS,
          valueUSD,
          riskLevel,
          reason: blockingReasons.join(" "),
        });
        store.setError(blockingReasons.join(" "));
        return;
      }

      // Optional: verify target address has bytecode (is a contract, not EOA)
      let contractWarning: string | null = null;
      try {
        if (publicClient) {
          const code = await publicClient.getBytecode({ address: to as `0x${string}` });
          if (!code || code === "0x") {
            if (data && data !== "0x") {
              contractWarning = "This recipient has no contract code, but data is attached. It may be a mistaken transfer.";
            }
          }
        }
      } catch {
        // Ignore RPC errors during check
      }

      store.requestApproval(to, value, data, currentChainId, proposedBy, riskLevel, contractWarning ?? undefined);

      appendSecurityLog({
        timestamp: Date.now(),
        action: "tx_proposed",
        chainId: currentChainId,
        to,
        valueUSD,
        riskLevel,
        reason: analysis.warnings[0] ?? contractWarning ?? (whitelisted ? "Whitelisted address" : "Unknown contract"),
      });
    },
    [chainId, state.chainId, store, state.maxPerTransactionUSD, state.maxDailySpendUSD, state.dailySpendUSD, safetyPolicy, publicClient],
  );

  /**
   * Execute a single batch step — send its transaction to the chain.
   */
  const executeBatchStep = useCallback(
    async (step: { to: string; data?: string; value?: string; chainId?: number }): Promise<`0x${string}`> => {
      if (!wagmiAddress) throw new Error("Wallet not connected");
      const targetChainId = step.chainId ?? state.chainId ?? 84532;
      const connectedChainId = chainId ?? state.chainId;
      const result = await sendReviewedWalletTransaction({
        approval: {
          chainId: targetChainId,
          to: step.to,
          value: step.value ?? "0",
          data: step.data,
          proposedBy: "batch",
          riskLevel: "medium",
        },
        connectedChainId,
        forceTestnet: FORCE_TESTNET || !state.mainnetEnabled,
        chainName: (id) => CHAIN_NAMES[id] ?? `chain ${id}`,
        policy: approvalPolicyFromSafetyPolicy(safetyPolicy),
        simulateTransaction: simulatePreparedTransaction,
        sendTransaction: sendTransactionAsync,
        onTransaction: (tx) => store.addTransaction(tx),
        onDailySpend: (amountUSD) => store.incrementDailySpendUSD(amountUSD),
        onSwapSubmitted: () => store.incrementSessionSwapCount(),
        onSecurityLog: appendSecurityLog,
        blockedReasonPrefix: "Batch step blocked: ",
        approvedReason: "User approved a batch transaction step.",
      });
      return result.hash;
    },
    [
      wagmiAddress,
      chainId,
      simulatePreparedTransaction,
      sendTransactionAsync,
      store,
      state.chainId,
      state.mainnetEnabled,
      safetyPolicy,
    ],
  );

  /**
   * Sign a message with the connected wallet.
   */
  const signMessage = useCallback(
    async (message: string): Promise<`0x${string}`> => {
      if (!wagmiAddress) throw new Error("Wallet not connected");
      const sig = await signMessageAsync({ message });
      return sig;
    },
    [wagmiAddress, signMessageAsync],
  );

  // Gas price polling
  const [gasPriceGwei, setGasPriceGwei] = useState<number | null>(null);
  useEffect(() => {
    if (!publicClient || !state.chainId) return;
    let cancelled = false;
    async function poll() {
      if (!publicClient) return;
      try {
        const price = await publicClient.getGasPrice();
        if (!cancelled) setGasPriceGwei(Number(price) / 1e9);
      } catch { /* ignore */ }
    }
    poll();
    const interval = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [publicClient, state.chainId]);

  // TX receipt polling — auto-update pending transactions
  const pendingHashesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!publicClient || !state.transactions.length) return;
    const pending = state.transactions.filter((tx) => tx.status === "pending");
    if (pending.length === 0) return;

    let cancelled = false;
    async function checkReceipts() {
      if (!publicClient) return;
      for (const tx of pending) {
        if (pendingHashesRef.current.has(tx.hash)) continue; // already checking
        pendingHashesRef.current.add(tx.hash);
        try {
          const receipt = await publicClient.getTransactionReceipt({ hash: tx.hash });
          if (!cancelled) {
            const status = receipt.status === "success" ? "confirmed" : "failed";
            store.updateTransaction(tx.hash, status);
            pendingHashesRef.current.delete(tx.hash);
          }
        } catch {
          // Receipt not yet available — keep pending
          pendingHashesRef.current.delete(tx.hash);
        }
      }
    }

    checkReceipts();
    const interval = setInterval(checkReceipts, 10_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [publicClient, state.transactions, store]);

  // Format wallet context as a string for injection into system prompts
  const promptContext = useMemo(() => {
    if (!walletContext.address) return "";
    return `Connected wallet: ${walletContext.address} (${walletContext.chainName ?? "Unknown Chain"}, Chain ID: ${walletContext.chainId})
USDC token: ${walletContext.usdcAddress ?? "Not available"}
The wallet is connected and ready for on-chain actions.`;
  }, [walletContext]);

  const blockExplorerUrl = useCallback((hash: string) => {
    const cid = state.chainId ?? 84532;
    return cid === 8453
      ? `https://basescan.org/tx/${hash}`
      : `https://sepolia.basescan.org/tx/${hash}`;
  }, [state.chainId]);

  return {
    walletContext,
    promptContext,
    isConnected: state.isConnected,
    approveTx,
    rejectTx,
    updateTxStatus,
    requestTx,
    executeBatchStep,
    signMessage,
    pendingApproval: state.pendingApproval,
    gasPriceGwei,
    blockExplorerUrl,
  };
}
