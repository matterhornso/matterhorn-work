/** @jsxImportSource react */
import { useState, useEffect, useMemo } from "react";
import {
  Wallet,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type TokenPosition = {
  raw: string;
  formatted: number;
  decimals: number;
  symbol: string;
  address: string;
  usdValue?: string | null;
};

export type HlPosition = {
  coin: string;
  entryPx: number;
  positionValue: number;
  unrealizedPnl: number;
  leverage: number | null;
  liquidationPx: number | null;
  marginUsed: number;
};

export type YieldPool = {
  pool: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number;
};

export type PortfolioData = {
  address: string;
  chainId: number;
  native: { raw: string; formatted: number; symbol: string } | null;
  tokens: TokenPosition[];
  hyperliquid: HlPosition[] | null;
  yields: YieldPool[];
};

export default function PortfolioView({
  data,
  onRefresh,
  isLoading,
}: {
  data: PortfolioData | null;
  onRefresh: () => void;
  isLoading: boolean;
}) {
  const [tab, setTab] = useState<"overview" | "perps" | "opportunities">("overview");

  const totalTokenBalance = useMemo(() => {
    if (!data) return 0;
    const nativeVal = data.native?.formatted ?? 0;
    const tokenSum = data.tokens.reduce((acc, t) => acc + t.formatted, 0);
    return nativeVal + tokenSum;
  }, [data]);

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-dls-secondary">
        <Loader2 className="mr-2 size-5 animate-spin" />
        Fetching portfolio...
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10">
            <Wallet className="size-5 text-violet-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-dls-text">Portfolio</h2>
            <p className="text-xs text-dls-secondary">
              {data.address.slice(0, 6)}...{data.address.slice(-4)} on Chain {data.chainId}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-dls-secondary"
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Total balance card */}
      <div className="mb-4 rounded-2xl border border-dls-border bg-dls-sidebar p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary mb-1">
          Total Holdings
        </div>
        <div className="font-mono text-2xl font-semibold text-dls-text">
          {totalTokenBalance.toFixed(6)} ETH
        </div>
        <div className="mt-1 text-xs text-dls-secondary">
          {data.tokens.length} token{data.tokens.length !== 1 && "s"}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 rounded-lg bg-dls-surface p-1">
        {[
          { key: "overview" as const, label: "Holdings" },
          { key: "perps" as const, label: "Perps" },
          { key: "opportunities" as const, label: "Yields" },
        ].map((t) => (
          <button
            key={t.key}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key
                ? "bg-violet-500 text-white"
                : "text-dls-secondary hover:text-dls-text",
            )}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && <HoldingsTab data={data} />}
      {tab === "perps" && <PerpsTab positions={data.hyperliquid} />}
      {tab === "opportunities" && <YieldsTab yields={data.yields} />}
    </div>
  );
}

function HoldingsTab({ data }: { data: PortfolioData }) {
  return (
    <div className="space-y-2">
      {data.native && (
        <TokenCard
          symbol={data.native.symbol}
          balance={data.native.formatted}
          address="Native"
          type="native"
        />
      )}
      {data.tokens.map((t) => (
        <TokenCard
          key={t.address}
          symbol={t.symbol}
          balance={t.formatted}
          address={t.address}
          type="token"
        />
      ))}
      {data.tokens.length === 0 && !data.native && (
        <div className="py-8 text-center text-sm text-dls-secondary">No token balances found.</div>
      )}
    </div>
  );
}

function TokenCard({
  symbol,
  balance,
  address,
  type,
}: {
  symbol: string;
  balance: number;
  address: string;
  type: "native" | "token";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dls-border bg-dls-surface p-3">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
          type === "native"
            ? "bg-violet-500/20 text-violet-400"
            : "bg-dls-hover text-dls-text",
        )}
      >
        {symbol.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-dls-text">{symbol}</div>
        <div className="text-xs text-dls-secondary truncate">
          {type === "token" ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Base gas token"}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm text-dls-text">{balance.toFixed(6)}</div>
      </div>
    </div>
  );
}

function PerpsTab({
  positions,
}: {
  positions: PortfolioData["hyperliquid"];
}) {
  if (positions === null || positions === undefined) {
    return (
      <div className="py-8 text-center text-sm text-dls-secondary">
        Hyperliquid position data unavailable.
      </div>
    );
  }
  if (positions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-dls-secondary">
        No open Hyperliquid positions.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {positions.map((pos) => (
        <div
          key={pos.coin}
          className="rounded-xl border border-dls-border bg-dls-surface p-3"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-violet-400" />
              <span className="text-sm font-semibold text-dls-text">
                {pos.coin}
              </span>
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                pos.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400",
              )}
            >
              {pos.unrealizedPnl >= 0 ? "+" : ""}
              {pos.unrealizedPnl.toFixed(2)} PnL
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-dls-secondary">
            <div>Entry: {pos.entryPx.toFixed(4)}</div>
            <div>Value: ${pos.positionValue.toFixed(2)}</div>
            <div>Leverage: {pos.leverage ?? "—"}x</div>
            <div>
              Margin: ${pos.marginUsed.toFixed(2)}
            </div>
            {pos.liquidationPx !== null && (
              <div className="col-span-2 text-red-400">
                Liquidation @ {pos.liquidationPx.toFixed(4)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function YieldsTab({ yields }: { yields: YieldPool[] }) {
  if (yields.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-dls-secondary">
        No yield data available.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {yields.map((y, i) => (
        <div
          key={`${y.pool}-${i}`}
          className="rounded-xl border border-dls-border bg-dls-surface p-3"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-medium text-dls-text">
              {y.project}
            </span>
            <span className="font-mono text-sm text-green-400">
              {(y.apy * 100).toFixed(1)}% APY
            </span>
          </div>
          <div className="text-xs text-dls-secondary">
            {y.symbol} — TVL ${(y.tvlUsd / 1e6).toFixed(1)}M
          </div>
        </div>
      ))}
    </div>
  );
}
