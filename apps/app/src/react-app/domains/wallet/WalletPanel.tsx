/** @jsxImportSource react */
import { Copy, ExternalLink, ChevronDown, Wallet as WalletIcon, RefreshCw, BarChart3, ArrowRightLeft, Landmark, Send } from "lucide-react";
import { useState, useMemo, lazy, Suspense, useCallback } from "react";

import { cn } from "@/lib/utils";
import type { WalletStore } from "./state/wallet-store";
import { useWalletStore } from "./state/wallet-store";
import { CHAIN_NAMES } from "../../infra/chains";
import { getSecurityLog, type SecurityLogEntry } from "./state/security-log";

const PortfolioView = lazy(() => import("./pages/PortfolioView"));
const CowSwapPanel = lazy(() => import("./pages/CowSwapPanel"));
const AavePanel = lazy(() => import("./pages/AavePanel"));
const BridgePanel = lazy(() => import("./pages/BridgePanel"));
const TransferPanel = lazy(() => import("./pages/TransferPanel"));

type PanelType = "portfolio" | "cow" | "aave" | "bridge" | "send" | null;

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

function securityLogActionLabel(action: SecurityLogEntry["action"]): string {
  const labels: Record<SecurityLogEntry["action"], string> = {
    tx_proposed: "Proposed",
    tx_approved: "Approved",
    tx_rejected: "Rejected",
    limit_hit: "Limit",
    whitelist_denied: "Denied",
    rate_limit_hit: "Rate limit",
    simulation_failed: "Failed",
    countdown_expired: "Ready",
  };
  return labels[action] ?? action;
}

function securityLogColor(action: SecurityLogEntry["action"]): string {
  switch (action) {
    case "tx_approved":
      return "text-green-400";
    case "tx_rejected":
      return "text-red-400";
    case "limit_hit":
    case "rate_limit_hit":
      return "text-amber-400";
    case "whitelist_denied":
      return "text-red-400";
    case "simulation_failed":
      return "text-red-400";
    default:
      return "text-dls-secondary";
  }
}

export type WalletPanelProps = {
  store: WalletStore;
};

export function WalletPanel({ store }: WalletPanelProps) {
  const state = useWalletStore(store);
  const [expanded, setExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);
  const [portfolioData, setPortfolioData] = useState<import("./pages/PortfolioView").PortfolioData | null>(null);
  const securityLog = useMemo(() => getSecurityLog(5), []);

  const handlePortfolioOpen = useCallback(async () => {
    if (!state.address || !state.chainId) return;
    setActivePanel("portfolio");
    setIsPortfolioLoading(true);
    try {
      const res = await fetch(`/api/portfolio?chainId=${state.chainId}&address=${state.address}`);
      const json = await res.json();
      if (json.success) setPortfolioData(json.data);
      else setPortfolioData(null);
    } catch {
      setPortfolioData(null);
    } finally {
      setIsPortfolioLoading(false);
    }
  }, [state.address, state.chainId]);

  const handlePanelClose = useCallback(() => setActivePanel(null), []);

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
  const isTestnet = state.chainId === 84532;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Testnet banner */}
      {isTestnet && (
        <div className="flex items-start gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2">
          <span className="text-sm">🔒</span>
          <p className="text-xs text-green-300">
            Testnet mode — Transactions won't spend real money. Switch to mainnet in Settings &gt; Wallet when ready.
          </p>
        </div>
      )}

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

          <div className="border-t border-dls-border pt-3">
            <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-dls-secondary">Activity</h4>
            {state.transactions.length === 0 ? (
              <p className="text-xs text-dls-secondary py-2">No activity yet.</p>
            ) : (
              <div className="space-y-1">
                {state.transactions.slice(0, 5).map((tx) => (
                  <div
                    key={tx.hash}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-dls-hover transition-colors"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", txStatusColor(tx.status))} />
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-dls-text truncate">
                        {truncateAddress(tx.hash)}
                      </span>
                      <span className="text-dls-secondary">
                        {tx.value} ETH • {tx.proposedBy} • {tx.riskLevel}
                      </span>
                    </div>
                    <span className="shrink-0 text-dls-secondary ml-auto">{tx.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Protocol nav buttons */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              className="flex items-center justify-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-medium text-white hover:bg-violet-600 transition-colors col-span-2"
              onClick={() => setActivePanel("send")}
            >
              <Send className="size-3.5" />
              Send
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-dls-surface border border-dls-border px-3 py-2 text-xs text-dls-text hover:bg-dls-hover transition-colors"
              onClick={handlePortfolioOpen}
            >
              <BarChart3 className="size-3.5 text-violet-400" />
              Portfolio
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-dls-surface border border-dls-border px-3 py-2 text-xs text-dls-text hover:bg-dls-hover transition-colors"
              onClick={() => setActivePanel("cow")}
            >
              <ArrowRightLeft className="size-3.5 text-green-400" />
              CoW Swap
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-dls-surface border border-dls-border px-3 py-2 text-xs text-dls-text hover:bg-dls-hover transition-colors"
              onClick={() => setActivePanel("aave")}
            >
              <Landmark className="size-3.5 text-amber-400" />
              Aave
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-dls-surface border border-dls-border px-3 py-2 text-xs text-dls-text hover:bg-dls-hover transition-colors"
              onClick={() => setActivePanel("bridge")}
            >
              <ExternalLink className="size-3.5 text-blue-400" />
              Bridge
            </button>
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

      {/* Panel overlays */}
      {activePanel === "portfolio" && (
        <div className="absolute inset-0 z-50 bg-dls-sidebar">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center text-xs text-dls-secondary">Loading portfolio...</div>
          }>
            <PortfolioView
              data={portfolioData}
              onRefresh={handlePortfolioOpen}
              isLoading={isPortfolioLoading}
              store={store}
            />
          </Suspense>
          <button
            type="button"
            className="absolute top-3 right-3 rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover"
            onClick={handlePanelClose}
          >
            Back
          </button>
        </div>
      )}
      {activePanel === "cow" && (
        <div className="absolute inset-0 z-50 bg-dls-sidebar">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center text-xs text-dls-secondary">Loading CoW Swap...</div>
          }>
            <CowSwapPanel store={store} />
          </Suspense>
          <button
            type="button"
            className="absolute top-3 right-3 rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover"
            onClick={handlePanelClose}
          >
            Back
          </button>
        </div>
      )}
      {activePanel === "aave" && (
        <div className="absolute inset-0 z-50 bg-dls-sidebar">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center text-xs text-dls-secondary">Loading Aave...</div>
          }>
            <AavePanel store={store} />
          </Suspense>
          <button
            type="button"
            className="absolute top-3 right-3 rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover"
            onClick={handlePanelClose}
          >
            Back
          </button>
        </div>
      )}
      {activePanel === "bridge" && (
        <div className="absolute inset-0 z-50 bg-dls-sidebar">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center text-xs text-dls-secondary">Loading Bridge...</div>
          }>
            <BridgePanel store={store} />
          </Suspense>
          <button
            type="button"
            className="absolute top-3 right-3 rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover"
            onClick={handlePanelClose}
          >
            Back
          </button>
        </div>
      )}
      {activePanel === "send" && (
        <div className="absolute inset-0 z-50 bg-dls-sidebar">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center text-xs text-dls-secondary">Loading Send...</div>
          }>
            <TransferPanel store={store} />
          </Suspense>
          <button
            type="button"
            className="absolute top-3 right-3 rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover"
            onClick={handlePanelClose}
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
