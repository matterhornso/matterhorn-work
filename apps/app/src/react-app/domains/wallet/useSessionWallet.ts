/** @jsxImportSource react */
import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useSendTransaction, useSignMessage, usePublicClient } from "wagmi";
import { parseEther } from "viem";

import type { WalletStore } from "./state/wallet-store";
import { useWalletStore, computeTxValueUSD } from "./state/wallet-store";
import { buildSessionWalletContext, type SessionWalletContext } from "./SessionContextProvider";
import { CHAIN_NAMES, FORCE_TESTNET } from "../../infra/chains";
import { USDC_BY_CHAIN } from "../../infra/contracts";
import { isWhitelistedAddress } from "./infra/whitelist";
import { appendSecurityLog } from "./state/security-log";

/**
 * Hook that provides the session-scoped wallet context
 * and TX pipeline methods. Use this in session pages to
 * inject wallet context into agent prompts and handle
 * transaction approval.
 */
const SWAP_HOUR_WINDOW_MS = 60 * 60 * 1000;
const MAX_SWAPS_PER_HOUR = 5;

export function useSessionWallet(store: WalletStore) {
  const state = useWalletStore(store);
  const { address: wagmiAddress } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const { signMessageAsync } = useSignMessage();

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

    if (FORCE_TESTNET && approval.chainId === 8453) {
      throw new Error("Mainnet is disabled (FORCE_TESTNET=true)");
    }

    const hash = await sendTransactionAsync({
      to: approval.to as `0x${string}`,
      value: approval.value.startsWith("0x")
        ? BigInt(approval.value)
        : parseEther(approval.value),
      data: approval.data as `0x${string}` | undefined,
    });

    store.clearApproval();
    const txValueUSD = computeTxValueUSD(approval.value);
    store.incrementDailySpendUSD(txValueUSD);
    store.addTransaction({
      hash,
      to: approval.to as `0x${string}`,
      value: approval.value,
      status: "pending",
      timestamp: Date.now(),
      chainId: approval.chainId,
      proposedBy: approval.proposedBy,
      riskLevel: approval.riskLevel,
    });
    appendSecurityLog({
      timestamp: Date.now(),
      action: "tx_approved",
      chainId: approval.chainId,
      to: approval.to,
      valueUSD: txValueUSD,
      riskLevel: approval.riskLevel,
      reason: "User approved via TransactionApproval modal",
    });

    return hash;
  }, [state.pendingApproval, wagmiAddress, sendTransactionAsync, store]);

  /**
   * Reject a pending TX — clears the approval request.
   */
  const rejectTx = useCallback(() => {
    store.clearApproval();
  }, [store]);

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
      const valueUSD = computeTxValueUSD(value);
      let riskLevel: "low" | "medium" | "high" = "low";
      if (!whitelisted) riskLevel = "high";
      else if (valueUSD > state.maxPerTransactionUSD) riskLevel = "medium";
      else if (valueUSD + state.dailySpendUSD > state.maxDailySpendUSD) riskLevel = "medium";

      if (state.maxPerTransactionUSD > 0 && valueUSD > state.maxPerTransactionUSD) {
        store.setError(`This transaction exceeds your per-transaction limit of $${state.maxPerTransactionUSD}`);
        appendSecurityLog({
          timestamp: Date.now(),
          action: "limit_hit",
          chainId: currentChainId,
          to,
          valueUSD,
          riskLevel,
          reason: `Per-transaction limit exceeded ($${state.maxPerTransactionUSD})`,
        });
      }

      if (state.maxDailySpendUSD > 0 && valueUSD + state.dailySpendUSD > state.maxDailySpendUSD) {
        store.setError(`This transaction exceeds your daily limit of $${state.maxDailySpendUSD}`);
        appendSecurityLog({
          timestamp: Date.now(),
          action: "limit_hit",
          chainId: currentChainId,
          to,
          valueUSD,
          riskLevel,
          reason: `Daily spend limit exceeded ($${state.maxDailySpendUSD})`,
        });
      }

      const now = Date.now();
      const hourMs = 60 * 60 * 1000;
      const windowExpired = now - state.lastSwapReset >= hourMs;
      const swapLimitExceeded = !windowExpired && state.sessionSwapCount >= MAX_SWAPS_PER_HOUR;
      if (swapLimitExceeded) {
        appendSecurityLog({
          timestamp: now,
          action: "rate_limit_hit",
          chainId: currentChainId,
          to: to || "0x0000000000000000000000000000000000000000",
          valueUSD,
          riskLevel,
          reason: `Swap rate limit reached (${MAX_SWAPS_PER_HOUR}/hour)`,
        });
      }

      // Optional: verify target address has bytecode (is a contract, not EOA)
      let contractWarning: string | null = null;
      try {
        if (publicClient) {
          const code = await publicClient.getBytecode({ address: to as `0x${string}` })
;
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

      if (swapLimitExceeded) {
        store.setError(`Swap rate limit reached (${MAX_SWAPS_PER_HOUR}/hour). This protects against runaway agent loops.`);
      }

      appendSecurityLog({
        timestamp: Date.now(),
        action: "tx_proposed",
        chainId: currentChainId,
        to,
        valueUSD,
        riskLevel,
        reason: swapLimitExceeded
          ? `Rate limit active (${MAX_SWAPS_PER_HOUR}/hour)`
          : contractWarning ?? (whitelisted ? "Whitelisted address" : "Unknown contract"),
      });
    },
    [chainId, state.chainId, store, state.maxPerTransactionUSD, state.maxDailySpendUSD, state.dailySpendUSD, state.sessionSwapCount, state.lastSwapReset, publicClient],
  );

  /**
   * Execute a single batch step — send its transaction to the chain.
   */
  const executeBatchStep = useCallback(
    async (step: { to: string; data?: string; value?: string }): Promise<`0x${string}`> => {
      if (!wagmiAddress) throw new Error("Wallet not connected");
      const hash = await sendTransactionAsync({
        to: step.to as `0x${string}`,
        value: step.value
          ? (step.value.startsWith("0x")
            ? BigInt(step.value)
            : parseEther(step.value))
          : undefined,
        data: step.data as `0x${string}` | undefined,
      });
      store.addTransaction({
        hash,
        to: step.to as `0x${string}`,
        value: step.value ?? "0",
        status: "pending",
        timestamp: Date.now(),
        chainId: state.chainId ?? 84532,
        proposedBy: "batch",
        riskLevel: "medium",
      });
      const txValueUSD = computeTxValueUSD(step.value ?? "0");
      store.incrementDailySpendUSD(txValueUSD);
      return hash;
    },
    [wagmiAddress, sendTransactionAsync, store, state.chainId],
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
