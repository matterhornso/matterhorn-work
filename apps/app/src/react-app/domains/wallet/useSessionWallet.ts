/** @jsxImportSource react */
import { useCallback, useMemo } from "react";
import { useAccount, useChainId, useSendTransaction, useSignMessage } from "wagmi";
import { parseEther } from "viem";

import type { WalletStore } from "./state/wallet-store";
import { useWalletStore } from "./state/wallet-store";
import { buildSessionWalletContext, type SessionWalletContext } from "./SessionContextProvider";
import { CHAIN_NAMES } from "../../infra/chains";
import { USDC_BY_CHAIN } from "../../infra/contracts";

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
    store.addTransaction({
      hash,
      to: approval.to as `0x${string}`,
      value: approval.value,
      status: "pending",
      timestamp: Date.now(),
      chainId: approval.chainId,
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
   */
  const requestTx = useCallback(
    (to: string, value: string, data?: string) => {
      const currentChainId = chainId ?? state.chainId ?? 84532;
      store.requestApproval(to, value, data, currentChainId);
    },
    [chainId, state.chainId, store],
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
