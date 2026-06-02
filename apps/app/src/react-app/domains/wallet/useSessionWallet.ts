/** @jsxImportSource react */
import { useCallback, useMemo } from "react";
import { useAccount, useChainId, useSendTransaction, useSignMessage } from "wagmi";
import { parseEther } from "viem";

import type { WalletStore } from "./state/wallet-store";
import { useWalletStore, computeTxValueUSD } from "./state/wallet-store";
import { buildSessionWalletContext, type SessionWalletContext } from "./SessionContextProvider";
import { CHAIN_NAMES } from "../../infra/chains";
import { USDC_BY_CHAIN } from "../../infra/contracts";
import { isWhitelistedAddress } from "./infra/whitelist";

/**
 * Hook that provides the session-scoped wallet context
 * and TX pipeline methods. Use this in session pages to
 * inject wallet context into agent prompts and handle
 * transaction approval.
 */
export function useSessionWallet(store: WalletStore) {
  const state = useWalletStore(store);
  const { address: wagmiAddress } = useAccount();
  const chainId = useChainId();
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
  const approveTx = useCallback(async (): Promise<`0x${string}`> => {
    const approval = state.pendingApproval;
    if (!approval) throw new Error("No pending transaction to approve");

    if (!wagmiAddress) throw new Error("Wallet not connected");

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
   * Computes risk level from whitelist + amount, and enforces spend limits.
   */
  const requestTx = useCallback(
    (to: string, value: string, data?: string, proposedBy = "user_manual") => {
      const currentChainId = chainId ?? state.chainId ?? 84532;
      const whitelisted = isWhitelistedAddress(currentChainId, to);
      const valueUSD = computeTxValueUSD(value);
      let riskLevel: "low" | "medium" | "high" = "low";
      if (!whitelisted) riskLevel = "high";
      else if (valueUSD > state.maxPerTransactionUSD) riskLevel = "medium";
      else if (valueUSD + state.dailySpendUSD > state.maxDailySpendUSD) riskLevel = "medium";

      if (state.maxPerTransactionUSD > 0 && valueUSD > state.maxPerTransactionUSD) {
        store.setError(`This transaction exceeds your per-transaction limit of $${state.maxPerTransactionUSD}`);
      }
      if (state.maxDailySpendUSD > 0 && valueUSD + state.dailySpendUSD > state.maxDailySpendUSD) {
        store.setError(`This transaction exceeds your daily limit of $${state.maxDailySpendUSD}`);
      }

      store.requestApproval(to, value, data, currentChainId, proposedBy, riskLevel);
    },
    [chainId, state.chainId, store, state.maxPerTransactionUSD, state.maxDailySpendUSD, state.dailySpendUSD],
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

  // Format wallet context as a string for injection into system prompts
  const promptContext = useMemo(() => {
    if (!walletContext.address) return "";
    return `Connected wallet: ${walletContext.address} (${walletContext.chainName ?? "Unknown Chain"}, Chain ID: ${walletContext.chainId})
USDC token: ${walletContext.usdcAddress ?? "Not available"}
The wallet is connected and ready for on-chain actions.`;
  }, [walletContext]);

  return {
    walletContext,
    promptContext,
    isConnected: state.isConnected,
    approveTx,
    rejectTx,
    updateTxStatus,
    requestTx,
    signMessage,
    pendingApproval: state.pendingApproval,
  };
}
