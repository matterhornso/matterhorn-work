/** @jsxImportSource react */
import { Copy, ExternalLink, ChevronDown, Wallet as WalletIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { WalletStore } from "./state/wallet-store";
import { useWalletStore } from "./state/wallet-store";
import { CHAIN_NAMES } from "../../infra/chains";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function txStatusColor(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-green-500";
    case "pending":
      return "bg-yellow-500";
    case "failed":
      return "bg-red-500";
    default:
      return "bg-gray-500";
  }
}

export type WalletPanelProps = {
  store: WalletStore;
};

export function WalletPanel({ store }: WalletPanelProps) {
  const state = useWalletStore(store);
  const [expanded, setExpanded] = useState(false);

  if (!state.isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <WalletIcon className="size-8 text-gray-8" />
        <p className="text-sm text-gray-8">Connect a wallet to see balances and transactions.</p>
      </div>
    );
  }

  const chainName = state.chainId ? CHAIN_NAMES[state.chainId] ?? "Unknown Chain" : null;
  const recentTxs = state.transactions.slice(0, 5);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-10">Wallet</h3>
        <button
          type="button"
          className="rounded-lg p-1 text-gray-8 hover:bg-dls-surface hover:text-gray-10 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-8">Address</span>
          <button
            type="button"
            className="flex items-center gap-1 font-mono text-xs text-gray-10 hover:text-dls-text transition-colors"
            onClick={() => {
              if (state.address) navigator.clipboard.writeText(state.address);
            }}
          >
            {state.address ? truncateAddress(state.address) : ""}
            <Copy className="size-3" />
          </button>
        </div>

        {chainName && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-8">Chain</span>
            <span className="flex items-center gap-1.5 text-gray-10">
              <span className="size-2 rounded-full bg-green-500" />
              {chainName}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-8">ETH</span>
          <span className="font-mono text-gray-10">{state.ethBalance ?? "—"}</span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-8">USDC</span>
          <span className="font-mono text-gray-10">{state.usdcBalance ?? "—"}</span>
        </div>
      </div>

      {expanded && (
        <>
          <div className="border-t border-dls-border pt-3">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-8">Recent Transactions</h4>
            {recentTxs.length === 0 ? (
              <p className="text-xs text-gray-8">No transactions yet.</p>
            ) : (
              <div className="space-y-1.5">
                {recentTxs.map((tx) => (
                  <div
                    key={tx.hash}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-dls-surface transition-colors"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", txStatusColor(tx.status))} />
                    <span className="font-mono text-gray-10 truncate flex-1">
                      {truncateAddress(tx.hash)}
                    </span>
                    <span className="shrink-0 text-gray-8">{tx.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {state.address && (
            <a
              href={
                state.chainId === 8453
                  ? `https://basescan.org/address/${state.address}`
                  : `https://sepolia.basescan.org/address/${state.address}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-gray-8 hover:text-gray-10 transition-colors"
            >
              <ExternalLink className="size-3" />
              View on Block Explorer
            </a>
          )}
        </>
      )}
    </div>
  );
}
