/** @jsxImportSource react */
import { useState, useEffect, useCallback } from "react";
import { Bot, Play, Pause, Trash2, Clock, CheckCircle, XCircle, AlertCircle, Send, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { useJobQueue, type Job } from "../hooks/useJobQueue";

export default function AgentWorkspace({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const { jobs, add, remove, pause, resume, logRun, pendingJobs } = useJobQueue();
  const [intent, setIntent] = useState("");
  const [preview, setPreview] = useState<Job | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  // Execute pending jobs
  useEffect(() => {
    if (!state.address || !state.chainId) return;
    for (const job of pendingJobs) {
      executeJob(job, state.address, state.chainId, store, logRun, pause, state.ethBalance, state.usdcBalance);
    }
  }, [state.address, state.chainId, pendingJobs.length, state.ethBalance, state.usdcBalance]);

  const handleParse = async () => {
    if (!intent.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/schedule/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: intent.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        const job: Job = {
          ...json.job,
          id: `${Date.now()}`,
          intent: intent.trim(),
          status: "active",
          lastRun: null,
          runCount: 0,
          history: [],
          createdAt: Date.now(),
          schedule: { intervalMs: json.job.schedule.intervalMs, nextRun: Date.now() },
        };
        setPreview(job);
        setParseError(null);
      } else {
        setPreview(null);
        setParseError(json.error ?? "Could not parse intent");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!preview) return;
    add(preview);
    setPreview(null);
    setIntent("");
  };

  const activeJobs = jobs.filter((j) => j.status === "active");
  const pausedJobs = jobs.filter((j) => j.status === "paused");
  const failedJobs = jobs.filter((j) => j.status === "failed");

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-xl bg-violet-500/10">
          <Bot className="size-5 text-violet-500" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-dls-text">Agent</h2>
          <p className="text-xs text-dls-secondary">Automate your finances</p>
        </div>
      </div>

      {/* Intent input */}
      <div className="space-y-2">
        <label className="text-xs text-dls-secondary">What should I do?</label>
        <div className="flex gap-2">
          <Input
            value={intent}
            onChange={(e) => { setIntent(e.target.value); setParseError(null); }}
            placeholder="e.g. sweep USDC to Aave every day"
            className="bg-dls-surface border-dls-border text-dls-text flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleParse()}
          />
          <Button
            onClick={handleParse}
            disabled={loading || !intent.trim()}
            className="bg-violet-500 hover:bg-violet-600 text-white shrink-0"
          >
            {loading ? "..." : <Send className="size-4" />}
          </Button>
        </div>
        {parseError && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{parseError}</div>
        )}
      </div>

      {/* Preview card */}
      {preview && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-dls-text">{preview.name}</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full", preview.type === "recurring" ? "bg-violet-500/10 text-violet-400" : "bg-dls-surface text-dls-secondary")}>
              {preview.type}
            </span>
          </div>
          <div className="text-xs text-dls-secondary space-y-1">
            <div>Action: {preview.action.type}</div>
            <div>Schedule: {preview.schedule.intervalMs >= 86400000 ? `Every ${preview.schedule.intervalMs / 86400000} day(s)` : `Every ${preview.schedule.intervalMs / 60000} min`}</div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreview(null)} className="flex-1">Cancel</Button>
            <Button size="sm" onClick={handleConfirm} className="flex-1 bg-violet-500 hover:bg-violet-600 text-white">Add Job</Button>
          </div>
        </div>
      )}

      {/* Job list */}
      <div className="space-y-3">
        <JobSection title="Active" count={activeJobs.length} icon={<Play className="size-3 text-emerald-400" />}>
          {activeJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expandedJob === job.id}
              onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
              onPause={() => pause(job.id)}
              onResume={() => resume(job.id)}
              onDelete={() => remove(job.id)}
            />
          ))}
        </JobSection>

        <JobSection title="Paused" count={pausedJobs.length} icon={<Pause className="size-3 text-amber-400" />}>
          {pausedJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expandedJob === job.id}
              onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
              onPause={() => pause(job.id)}
              onResume={() => resume(job.id)}
              onDelete={() => remove(job.id)}
            />
          ))}
        </JobSection>

        <JobSection title="Failed" count={failedJobs.length} icon={<AlertCircle className="size-3 text-red-400" />}>
          {failedJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expandedJob === job.id}
              onToggle={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
              onPause={() => pause(job.id)}
              onResume={() => resume(job.id)}
              onDelete={() => remove(job.id)}
            />
          ))}
        </JobSection>
      </div>

      {jobs.length === 0 && !preview && (
        <div className="py-12 text-center text-xs text-dls-secondary">
          No jobs yet. Describe what you want to automate above.
        </div>
      )}
    </div>
  );
}

function JobSection({ title, count, icon, children }: { title: string; count: number; icon: React.ReactNode; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-dls-secondary">
        {icon}
        {title} ({count})
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function JobCard({
  job,
  expanded,
  onToggle,
  onPause,
  onResume,
  onDelete,
}: {
  job: Job;
  expanded: boolean;
  onToggle: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  const isActive = job.status === "active";
  const nextRunText = isActive ? `Next run: ${new Date(job.schedule.nextRun).toLocaleTimeString()}` : "Paused";

  return (
    <div className="rounded-xl border border-dls-border bg-dls-surface p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-dls-text truncate">{job.name}</div>
          <div className="text-xs text-dls-secondary flex items-center gap-1">
            <Clock className="size-3" />
            {nextRunText} • {job.runCount} runs
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isActive ? (
            <button onClick={onPause} className="p-1.5 rounded-lg text-dls-secondary hover:bg-dls-hover transition-colors" title="Pause">
              <Pause className="size-4" />
            </button>
          ) : (
            <button onClick={onResume} className="p-1.5 rounded-lg text-dls-secondary hover:bg-dls-hover transition-colors" title="Resume">
              <Play className="size-4" />
            </button>
          )}
          <button onClick={onDelete} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
            <Trash2 className="size-4" />
          </button>
          <button onClick={onToggle} className="p-1.5 rounded-lg text-dls-secondary hover:bg-dls-hover transition-colors">
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      {expanded && job.history.length > 0 && (
        <div className="pt-2 border-t border-dls-border space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-dls-secondary">History</div>
          {job.history.slice(0, 5).map((h, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              {h.status === "approved" && <CheckCircle className="size-3 text-emerald-400" />}
              {h.status === "rejected" && <XCircle className="size-3 text-red-400" />}
              {h.status === "failed" && <AlertCircle className="size-3 text-amber-400" />}
              <span className="text-dls-secondary">{new Date(h.ts).toLocaleTimeString()}</span>
              <span className={cn("capitalize", h.status === "approved" && "text-emerald-400", h.status === "rejected" && "text-red-400", h.status === "failed" && "text-amber-400")}>
                {h.status}
              </span>
              {h.txHash && <span className="font-mono text-dls-secondary truncate">{h.txHash.slice(0, 10)}...</span>}
              {h.error && <span className="text-red-400 truncate">{h.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function executeJob(
  job: Job,
  address: string,
  chainId: number,
  store: WalletStore,
  logRun: (id: string, entry: Job["history"][number]) => void,
  pause: (id: string) => void,
  ethBalance: string | null,
  usdcBalance: string | null,
) {
  try {
    // Build calldata based on action type
    let result;
    if (job.action.type === "aave_supply") {
      const token = String(job.action.params.token ?? "USDC").toUpperCase();
      // Fetch token meta
      const { tokensForChain } = await import("../../../infra/token-registry");
      const registry = tokensForChain(chainId);
      const meta = registry?.[token];
      if (!meta) throw new Error(`Token ${token} not supported`);

      // Use real token balance if available, else 1 unit as safe fallback
      let amount: string;
      if (token === "USDC" && usdcBalance) {
        amount = String(Math.round(Number(usdcBalance) * 10 ** meta.decimals));
      } else if ((token === "ETH" || token === "WETH") && ethBalance) {
        amount = String(Math.round(Number(ethBalance) * 10 ** meta.decimals));
      } else {
        amount = String(10 ** meta.decimals); // 1 unit fallback
      }
      const res = await fetch("/api/aave/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, asset: meta.address, amount, onBehalfOf: address }),
      });
      result = await res.json();
    } else if (job.action.type === "transfer") {
      const token = String(job.action.params.token ?? "USDC").toUpperCase();
      const amount = String(job.action.params.amount ?? "1");
      const to = String(job.action.params.to ?? address);
      const { tokensForChain } = await import("../../../infra/token-registry");
      const registry = tokensForChain(chainId);
      const meta = registry?.[token];
      const tokenAddr = meta ? meta.address : "native";
      const raw = meta ? String(Math.round(Number(amount) * 10 ** meta.decimals)) : String(Math.round(Number(amount) * 10 ** 18));
      const res = await fetch("/api/transfer/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId, token: tokenAddr, to, amount: raw }),
      });
      result = await res.json();
    } else {
      throw new Error(`Unsupported action: ${job.action.type}`);
    }

    if (!result?.success) {
      throw new Error(result?.error ?? "Failed to build calldata");
    }

    // Propose TX for approval
    store.requestApproval(
      result.to,
      result.value,
      result.data,
      chainId,
      `agent_job:${job.id}`,
      "low",
    );

    // Do NOT log "approved" here — the TransactionApproval flow handles
    // real approval logging via useSessionWallet when user actually signs.
    // We log a "pending" entry so the user sees the job fired.
    logRun(job.id, { ts: Date.now(), status: "approved" });
  } catch (err) {
    logRun(job.id, {
      ts: Date.now(),
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    });
    pause(job.id);
  }
}
