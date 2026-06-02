/** @jsxImportSource react */
import { Copy, ExternalLink, ChevronDown, Wallet as WalletIcon, RefreshCw } from "lucide-react";
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
      return "bg-dls-secondary";
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
        <div className="flex size-12 items-center justify-center rounded-2xl bg-dls-surface border border-dls-border">
          <WalletIcon className="size-6 text-dls-secondary" />
        </div>
        <p className="text-sm text-dls-secondary">Connect a wallet to see balances and transactions.</p>
      </div>
    );
  }

  const chainName = state.chainId ? CHAIN_NAMES[state.chainId] ?? "Unknown Chain" : null;
  const recentTxs = state.transactions.slice(0, 5);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-green-500/10">
            <span className="size-2 rounded-full bg-green-500" />
          </div>
          <h3 className="text-sm font-medium text-dls-text">Wallet</h3>
        </div>
        <button
          type="button"
          className="rounded-lg p-1 text-dls-secondary hover:bg-dls-hover hover:text-dls-text transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")} />
        </button>
      </div>

      {/* Address + Chain */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-dls-secondary">Address</span>
          <button
            type="button"
            className="flex items-center gap-1 font-mono text-xs text-dls-text hover:text-dls-accent transition-colors"
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
            <span className="text-dls-secondary">Chain</span>
            <span className="flex items-center gap-1.5 text-dls-text">
              <span className="size-2 rounded-full bg-green-500" />
              {chainName}
            </span>
          </div>
        )}
      </div>

      {/* Balances */}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-dls-surface p-3 border border-dls-border">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-0.5">ETH</div>
          <div className="font-mono text-sm text-dls-text">{state.ethBalance ?? "—"}</div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-0.5">USDC</div>
          <div className="font-mono text-sm text-dls-text">{state.usdcBalance ?? "—"}</div>
        </div>
      </div>

      {expanded && (
        <>
          <div className="border-t border-dls-border pt-3">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Recent Transactions</h4>
            {recentTxs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <RefreshCw className="size-5 text-dls-secondary" />
                <p className="text-xs text-dls-secondary">No transactions yet.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentTxs.map((tx) => (
                  <div
                    key={tx.hash}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-dls-hover transition-colors"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", txStatusColor(tx.status))} />
                    <span className="font-mono text-dls-text truncate flex-1">
                      {truncateAddress(tx.hash)}
                    </span>
                    <span className="shrink-0 text-dls-secondary">{tx.status}</span>
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
              className="flex items-center gap-1.5 text-xs text-dls-secondary hover:text-dls-text transition-colors"
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
