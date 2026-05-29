/** @jsxImportSource react */
import * as React from "react";

import type { WalletStoreSnapshot } from "./state/wallet-store";

export type SessionWalletContext = {
  address: `0x${string}` | null;
  chainId: number | null;
  chainName: string | null;
  rpcUrl: string | null;
  usdcAddress: `0x${string}` | null;
};

const defaultContext: SessionWalletContext = {
  address: null,
  chainId: null,
  chainName: null,
  rpcUrl: null,
  usdcAddress: null,
};

export const WalletSessionContext = React.createContext<SessionWalletContext>(defaultContext);

export function buildSessionWalletContext(
  wallet: WalletStoreSnapshot,
  chainName: string | null,
  usdcAddress: `0x${string}` | null,
): SessionWalletContext {
  if (!wallet.isConnected || !wallet.address || !wallet.chainId) {
    return defaultContext;
  }

  return {
    address: wallet.address,
    chainId: wallet.chainId,
    chainName,
    rpcUrl: wallet.chainId === 8453
      ? "https://mainnet.base.org"
      : "https://sepolia.base.org",
    usdcAddress,
  };
}

export function formatSessionPrompt(context: SessionWalletContext): string | null {
  if (!context.address || !context.chainId) return null;

  return [
    `You are connected to wallet ${context.address} on ${context.chainName ?? "chain " + context.chainId} (chain ID: ${context.chainId}).`,
    context.usdcAddress ? `USDC is deployed at ${context.usdcAddress} on this chain.` : null,
    "You can propose on-chain transactions using the wallet MCP tools.",
    "The user will approve or reject each transaction in the wallet panel.",
  ]
    .filter(Boolean)
    .join("\n");
}
