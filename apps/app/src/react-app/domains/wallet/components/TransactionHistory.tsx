/** @jsxImportSource react */
import { useState, useMemo } from "react";
import { Download, Filter, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, Landmark, Bot, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TxRecord } from "../state/wallet-store";

const TX_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  transfer: { label: "Send", icon: <ArrowUpRight className="size-3" />, color: "text-violet-400" },
  aave_supply: { label: "Deposit", icon: <ArrowDownLeft className="size-3" />, color: "text-amber-400" },
  aave_borrow: { label: "Borrow", icon: <ArrowUpRight className="size-3" />, color: "text-amber-400" },
  cow_swap: { label: "Swap", icon: <ArrowRightLeft className="size-3" />, color: "text-emerald-400" },
  across_bridge: { label: "Bridge", icon: <ArrowRightLeft className="size-3" />, color: "text-blue-400" },
  agent_job: { label: "Agent", icon: <Bot className="size-3" />, color: "text-violet-400" },
  user_manual: { label: "Manual", icon: <ArrowUpRight className="size-3" />, color: "text-dls-secondary" },
};

function getTxTypeInfo(proposedBy: string) {
  const key = Object.keys(TX_TYPE_LABELS).find((k) => proposedBy.startsWith(k) || proposedBy.includes(k));
  return key ? TX_TYPE_LABELS[key] : { label: proposedBy, icon: <ExternalLink className="size-3" />, color: "text-dls-secondary" };
}

function statusColor(status: string): string {
  switch (status) {
    case "confirmed": return "bg-emerald-400";
    case "pending": return "bg-amber-400";
    case "failed": return "bg-red-400";
    default: return "bg-dls-secondary";
  }
}

function statusTextColor(status: string): string {
  switch (status) {
    case "confirmed": return "text-emerald-400";
    case "pending": return "text-amber-400";
    case "failed": return "text-red-400";
    default: return "text-dls-secondary";
  }
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function exportToCSV(txs: TxRecord[]) {
  const headers = ["Hash", "To", "Value", "Status", "Type", "Risk", "Chain", "Time"];
  const rows = txs.map((tx) => [
    tx.hash,
    tx.to,
    tx.value,
    tx.status,
    tx.proposedBy,
    tx.riskLevel,
    String(tx.chainId),
    new Date(tx.timestamp).toISOString(),
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `matterhorn-txs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TransactionHistory({ txs }: { txs: TxRecord[] }) {
  const [filter, setFilter] = useState<"all" | "confirmed" | "pending" | "failed">("all");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    for (const tx of txs) {
      const info = getTxTypeInfo(tx.proposedBy);
      types.add(info.label);
    }
    return Array.from(types);
  }, [txs]);

  const filtered = useMemo(() => {
    return txs.filter((tx) => {
      if (filter !== "all" && tx.status !== filter) return false;
      if (typeFilter) {
        const info = getTxTypeInfo(tx.proposedBy);
        if (info.label !== typeFilter) return false;
      }
      return true;
    });
  }, [txs, filter, typeFilter]);

  if (txs.length === 0) {
    return (
      <div className="ow-empty-state py-6">
        <div className="ow-empty-state-icon">
          <ArrowUpRight className="size-5" />
        </div>
        <div className="ow-empty-state-title">No transactions yet</div>
        <div className="ow-empty-state-desc">Your on-chain activity will appear here after you make transfers, swaps, or deposits.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border",
            showFilters
              ? "bg-violet-500/10 text-violet-400 border-violet-500/30"
              : "bg-dls-surface text-dls-secondary border-dls-border hover:text-dls-text"
          )}
        >
          <Filter className="size-3.5" />
          Filter
          {(filter !== "all" || typeFilter) && <span className="ml-1 size-4 rounded-full bg-violet-500 text-white text-[9px] flex items-center justify-center">!</span>}
        </button>
        <button
          onClick={() => exportToCSV(filtered)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-dls-surface text-dls-secondary border border-dls-border hover:text-dls-text transition-colors ml-auto"
        >
          <Download className="size-3.5" />
          Export CSV
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-2">
          {/* Status filter */}
          {(["all", "confirmed", "pending", "failed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors",
                filter === s
                  ? "bg-violet-500 text-white border-violet-500"
                  : "bg-dls-surface text-dls-secondary border-dls-border hover:text-dls-text"
              )}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          {/* Type filter */}
          {allTypes.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors",
                typeFilter === t
                  ? "bg-violet-500 text-white border-violet-500"
                  : "bg-dls-surface text-dls-secondary border-dls-border hover:text-dls-text"
              )}
            >
              {t}
              {typeFilter === t && <X className="size-3 inline ml-1" />}
            </button>
          ))}
        </div>
      )}

      {/* Count */}
      <div className="text-[11px] text-dls-secondary">
        Showing {filtered.length} of {txs.length} transactions
      </div>

      {/* List */}
      <div className="space-y-1.5">
        {filtered.map((tx) => {
          const info = getTxTypeInfo(tx.proposedBy);
          return (
            <div
              key={tx.hash}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs bg-dls-surface-muted/30 border border-dls-border hover:bg-dls-hover transition-colors"
            >
              <div className={cn("flex size-7 items-center justify-center rounded-lg shrink-0", info.color.replace("text-", "bg-").replace("400", "500/10"))}>
                <span className={info.color}>{info.icon}</span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-dls-text truncate">{truncateAddress(tx.hash)}</span>
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border", info.color.replace("text-", "bg-").replace("400", "500/10"), info.color.replace("400", "300"), "border-current/20")}>
                    {info.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-dls-secondary">
                  <span>{tx.value} ETH</span>
                  <span>•</span>
                  <span>{tx.riskLevel}</span>
                  <span>•</span>
                  <span>{new Date(tx.timestamp).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn("size-2 rounded-full", statusColor(tx.status))} />
                <span className={cn("text-[11px] font-medium capitalize", statusTextColor(tx.status))}>{tx.status}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
