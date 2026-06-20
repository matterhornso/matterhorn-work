/** @jsxImportSource react */
import { Copy, ExternalLink, ChevronDown, Wallet as WalletIcon, RefreshCw, BarChart3, ArrowRightLeft, Landmark, Send, Bot, Sparkles, Activity, Shield, Zap, BrainCircuit } from "lucide-react";
import { useState, useMemo, lazy, Suspense, useCallback, useEffect } from "react";

import { cn } from "@/lib/utils";
import type { WalletStore } from "./state/wallet-store";
import { useWalletStore } from "./state/wallet-store";
import { CHAIN_NAMES } from "../../infra/chains";
import { MAINNET } from "../../infra/token-registry";
import { TransactionHistory } from "./components/TransactionHistory";
import { TokenIcon } from "./components/TokenIcon";
import { getSecurityLog, type SecurityLogEntry } from "./state/security-log";
import { useTokenPrices } from "./hooks/useTokenPrices";

const PortfolioView = lazy(() => import("./pages/PortfolioView"));
const CowSwapPanel = lazy(() => import("./pages/CowSwapPanel"));
const AavePanel = lazy(() => import("./pages/AavePanel"));
const BridgePanel = lazy(() => import("./pages/BridgePanel"));
const TransferPanel = lazy(() => import("./pages/TransferPanel"));
const AgentWorkspace = lazy(() => import("./pages/AgentWorkspace"));
const BittensorPanel = lazy(() => import("./pages/BittensorPanel"));

type PanelType = "crypto" | "portfolio" | "cow" | "aave" | "bridge" | "send" | "agent" | null;
export type CryptoVenue = "bittensor" | "hyperliquid" | "polymarket";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function txStatusColor(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-400";
    case "pending":
      return "bg-amber-400";
    case "failed":
      return "bg-red-400";
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
      return "text-emerald-400";
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
  gasPriceGwei?: number | null;
  blockExplorerUrl?: (hash: string) => string;
  initialVenue?: CryptoVenue;
};

export function WalletPanel({ store, gasPriceGwei, blockExplorerUrl, initialVenue = "bittensor" }: WalletPanelProps) {
  const state = useWalletStore(store);
  const [expanded, setExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<PanelType>("crypto");
  const [isPortfolioLoading, setIsPortfolioLoading] = useState(false);
  const [portfolioData, setPortfolioData] = useState<import("./pages/PortfolioView").PortfolioData | null>(null);
  const securityLog = useMemo(() => getSecurityLog(5), []);
  const { prices, fetchPrices, getPrice } = useTokenPrices();

  useEffect(() => {
    setActivePanel("crypto");
  }, [initialVenue]);

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

  // Fetch real token prices on mount / when connected
  useEffect(() => {
    if (!state.isConnected || state.chainId !== 8453) return;
    const ids = Object.values(MAINNET)
      .map((t) => t.coingeckoId)
      .filter(Boolean) as string[];
    if (ids.length > 0) {
      fetchPrices(ids);
    }
  }, [state.isConnected, state.chainId, fetchPrices]);

  // Live prices
  const ethPrice = getPrice("ethereum");
  const usdcPrice = getPrice("usd-coin");
  const wethPrice = getPrice("weth");
  const cbethPrice = getPrice("coinbase-wrapped-staked-eth");

  const effectiveEthPrice = ethPrice || wethPrice || 2000;
  const effectiveUsdcPrice = usdcPrice || 1;

  const ethUsdValue = Number(state.ethBalance ?? 0) * effectiveEthPrice;
  const usdcUsdValue = Number(state.usdcBalance ?? 0) * effectiveUsdcPrice;
  const totalUsdValue = ethUsdValue + usdcUsdValue;

  if (!state.isConnected) {
    return (
      <div className="relative h-full min-h-0 bg-dls-sidebar animate-fade-in">
        <Suspense fallback={
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[rgba(var(--matterhorn-blue-rgb),0.14)] animate-skeleton" />
              <span className="text-sm text-dls-secondary">Loading protocol workspace...</span>
            </div>
          </div>
        }>
          <BittensorPanel initialVenue={initialVenue} />
        </Suspense>
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-xl border border-dls-border bg-dls-surface/95 px-3 py-2 text-[11px] leading-relaxed text-dls-secondary shadow-[var(--dls-card-shadow)]">
          EVM wallet not connected. Bittensor public reads, subnet discovery, Hyperliquid/Polymarket read previews, and external-signer guidance still work from here.
        </div>
      </div>
    );
  }

  const chainName = state.chainId ? CHAIN_NAMES[state.chainId] ?? "Unknown Chain" : null;
  const recentTxs = state.transactions.slice(0, 5);
  const isTestnet = state.chainId === 84532;

  return (
    <div className="flex flex-col gap-4 p-4 animate-fade-in">
      {/* Testnet banner */}
      {isTestnet && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5">
          <Shield className="size-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-300 leading-relaxed">
            Testnet mode — Transactions won't spend real money. Switch to mainnet in Settings &gt; Wallet when ready.
          </p>
        </div>
      )}

      {/* Header — Glass hero card */}
      <div className="ow-glass-card ow-glow-border p-4 space-y-4">
        {/* Top row: Brand + Network + Expand */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-lg shadow-violet-500/20">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-dls-text">Matterhorn</h3>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-soft-pulse" />
                <span className="text-[11px] text-dls-secondary">{chainName ?? "Unknown"}</span>
                {gasPriceGwei != null && (
                  <span className="text-[10px] text-amber-400 font-mono ml-1">
                    {gasPriceGwei.toFixed(1)} gwei
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-dls-secondary hover:text-dls-text hover:bg-dls-hover transition-all"
            onClick={() => setExpanded(!expanded)}
          >
            <ChevronDown className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")} />
          </button>
        </div>

        {/* Address row */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="group flex items-center gap-1.5 font-mono text-xs text-dls-secondary hover:text-violet-400 transition-colors"
            onClick={() => {
              if (state.address) navigator.clipboard.writeText(state.address);
            }}
          >
            {state.address ? truncateAddress(state.address) : ""}
            <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <div className="flex items-center gap-1 text-[11px] text-dls-secondary">
            <Zap className="size-3 text-amber-400" />
            <span>{state.transactions.length} tx</span>
          </div>
        </div>
      </div>

      {/* Hero Balance Card */}
      <div className="ow-glass-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="ow-section-heading">Total Balance</div>
          {prices.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-soft-pulse" />
              Live
            </div>
          )}
        </div>
        <div className="ow-hero-text bg-gradient-to-r from-white via-white to-violet-300 bg-clip-text text-transparent">
          {totalUsdValue > 0
            ? `$${totalUsdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : state.ethBalance
              ? `$${(Number(state.ethBalance) * 2000 + Number(state.usdcBalance ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "—"}
        </div>

        {/* Token allocation mini-bars */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <TokenIcon symbol="ETH" size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-dls-text">Ethereum</span>
                <span className="text-sm font-mono text-dls-text">{state.ethBalance ?? "0.00"}</span>
              </div>
              <div className="h-1.5 rounded-full bg-dls-surface-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-500"
                  style={{ width: `${totalUsdValue > 0 ? Math.min((ethUsdValue / totalUsdValue) * 100, 100) : state.ethBalance ? Math.min((Number(state.ethBalance) * 2000 / (Number(state.ethBalance) * 2000 + Number(state.usdcBalance ?? 0) + 1)) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TokenIcon symbol="USDC" size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-dls-text">USDC</span>
                <span className="text-sm font-mono text-dls-text">{state.usdcBalance ?? "0.00"}</span>
              </div>
              <div className="h-1.5 rounded-full bg-dls-surface-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-500 transition-all duration-500"
                  style={{ width: `${totalUsdValue > 0 ? Math.min((usdcUsdValue / totalUsdValue) * 100, 100) : state.usdcBalance ? Math.min((Number(state.usdcBalance) / (Number(state.ethBalance ?? 0) * 2000 + Number(state.usdcBalance) + 1)) * 100, 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions — Icon grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <ActionButton icon={<BrainCircuit className="size-4" />} label="Crypto" accent="blue" onClick={() => setActivePanel("crypto")} primary />
        <ActionButton icon={<Send className="size-4" />} label="Send" accent="violet" onClick={() => setActivePanel("send")} primary />
        <ActionButton icon={<Bot className="size-4" />} label="Agent" accent="violet" onClick={() => setActivePanel("agent")} />
        <ActionButton icon={<BarChart3 className="size-4" />} label="Portfolio" accent="violet" onClick={handlePortfolioOpen} />
        <ActionButton icon={<ArrowRightLeft className="size-4" />} label="Swap" accent="emerald" onClick={() => setActivePanel("cow")} />
        <ActionButton icon={<Landmark className="size-4" />} label="Aave" accent="amber" onClick={() => setActivePanel("aave")} />
        <ActionButton icon={<ExternalLink className="size-4" />} label="Bridge" accent="blue" onClick={() => setActivePanel("bridge")} />
      </div>

      {expanded && (
        <>
          {/* Recent Transactions */}
          <div className="ow-glass-card p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="ow-section-heading">Transactions</div>
              <Activity className="size-3.5 text-dls-secondary" />
            </div>
            <TransactionHistory txs={recentTxs} blockExplorerUrl={blockExplorerUrl} />
          </div>

          {/* Security Activity */}
          <div className="ow-glass-card p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="ow-section-heading">Security Log</div>
              <Shield className="size-3.5 text-dls-secondary" />
            </div>
            {securityLog.length === 0 ? (
              <div className="ow-empty-state py-6">
                <div className="ow-empty-state-icon">
                  <Shield className="size-5" />
                </div>
                <div className="ow-empty-state-desc">Security log is empty. Approval events and spend limits will be tracked here.</div>
              </div>
            ) : (
              <div className="space-y-1">
                {securityLog.map((entry, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-dls-hover transition-colors"
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", entry.action === "tx_approved" ? "bg-emerald-400" : entry.action === "tx_rejected" ? "bg-red-400" : "bg-amber-400")} />
                    <span className={cn("shrink-0 font-medium", securityLogColor(entry.action))}>
                      {securityLogActionLabel(entry.action)}
                    </span>
                    <span className="text-dls-secondary truncate flex-1">{entry.reason}</span>
                    <span className="shrink-0 text-dls-secondary text-[10px]">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
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
              className="flex items-center justify-center gap-1.5 text-xs text-dls-secondary hover:text-dls-text transition-colors py-2"
            >
              <ExternalLink className="size-3" />
              View on Block Explorer
            </a>
          )}
        </>
      )}

      {/* Panel overlays */}
      {activePanel === "crypto" && (
        <div className="absolute inset-0 z-50 bg-dls-sidebar">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[rgba(var(--matterhorn-blue-rgb),0.14)] animate-skeleton" />
                <span className="text-sm text-dls-secondary">Loading crypto workspace...</span>
              </div>
            </div>
          }>
            <BittensorPanel initialVenue={initialVenue} />
          </Suspense>
          <button
            type="button"
            className="absolute top-3 right-3 rounded-lg border border-dls-border bg-dls-surface px-2 py-1.5 text-xs text-dls-secondary hover:bg-dls-hover"
            onClick={handlePanelClose}
          >
            Wallet
          </button>
        </div>
      )}
      {activePanel === "portfolio" && (
        <div className="absolute inset-0 z-50 bg-dls-sidebar">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-500/10 animate-skeleton" />
                <span className="text-sm text-dls-secondary">Loading portfolio...</span>
              </div>
            </div>
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
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 animate-skeleton" />
                <span className="text-sm text-dls-secondary">Loading CoW Swap...</span>
              </div>
            </div>
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
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 animate-skeleton" />
                <span className="text-sm text-dls-secondary">Loading Aave...</span>
              </div>
            </div>
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
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 animate-skeleton" />
                <span className="text-sm text-dls-secondary">Loading Bridge...</span>
              </div>
            </div>
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
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-500/10 animate-skeleton" />
                <span className="text-sm text-dls-secondary">Loading Send...</span>
              </div>
            </div>
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
      {activePanel === "agent" && (
        <div className="absolute inset-0 z-50 bg-dls-sidebar">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-500/10 animate-skeleton" />
                <span className="text-sm text-dls-secondary">Loading Agent...</span>
              </div>
            </div>
          }>
            <AgentWorkspace store={store} />
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

/** Quick action button with icon tile and colored accent */
function ActionButton({
  icon,
  label,
  accent,
  onClick,
  primary = false,
}: {
  icon: React.ReactNode;
  label: string;
  accent: "violet" | "emerald" | "amber" | "blue";
  onClick: () => void;
  primary?: boolean;
}) {
  const accentMap = {
    violet: { bg: "bg-violet-500/10", text: "text-violet-400", border: "border-violet-500/20", glow: "hover:shadow-violet-500/10" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", glow: "hover:shadow-emerald-500/10" },
    amber: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", glow: "hover:shadow-amber-500/10" },
    blue: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20", glow: "hover:shadow-blue-500/10" },
  };
  const a = accentMap[accent];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border px-3 py-3 transition-all duration-200",
        primary
          ? "bg-violet-500 text-white border-violet-500 shadow-lg shadow-violet-500/20 hover:bg-violet-600 hover:shadow-violet-500/30"
          : `bg-dls-surface ${a.border} ${a.glow} hover:bg-dls-hover hover:shadow-lg`
      )}
    >
      <div className={cn("flex size-9 items-center justify-center rounded-xl", primary ? "bg-white/10" : a.bg)}>
        <span className={primary ? "text-white" : a.text}>{icon}</span>
      </div>
      <span className={cn("text-[11px] font-medium", primary ? "text-white" : "text-dls-text")}>{label}</span>
    </button>
  );
}
