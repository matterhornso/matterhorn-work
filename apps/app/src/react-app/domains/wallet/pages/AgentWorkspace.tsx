/** @jsxImportSource react */
import { useState, useEffect } from "react";
import { Bot, Play, Pause, Trash2, Clock, CheckCircle, XCircle, AlertCircle, Send, ChevronDown, ChevronUp, Sparkles, Terminal, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WalletStore } from "../state/wallet-store";
import { useWalletStore } from "../state/wallet-store";
import { useJobQueue, type Job } from "../hooks/useJobQueue";
import { requestNotificationPermission } from "../lib/notifications";
import { executeJob, type JobExecutionContext } from "../lib/execute-job";

export default function AgentWorkspace({ store }: { store: WalletStore }) {
  const state = useWalletStore(store);
  const { jobs, add, remove, pause, resume, logRun, pendingJobs } = useJobQueue();
  const [intent, setIntent] = useState("");
  const [preview, setPreview] = useState<Job | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "granted") {
      setNotificationsEnabled(true);
    }
  }, []);

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      return;
    }
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
  };

  // Execute pending jobs
  useEffect(() => {
    if (!state.address || !state.chainId) return;
    for (const job of pendingJobs) {
      const ctx: JobExecutionContext = {
        address: state.address,
        chainId: state.chainId,
        store,
        ethBalance: state.ethBalance,
        usdcBalance: state.usdcBalance,
        logRun,
        pause,
        notificationsEnabled,
      };
      executeJob(ctx, job);
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
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto animate-fade-in">
      {/* Header */}
      <div className="ow-soft-card p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-lg bg-dls-surface-muted/35 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-dls-text">Agent</h2>
            <p className="text-xs text-dls-secondary">Automate your finances</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-violet-500/10">
            <Wand2 className="size-3.5 text-violet-400" />
          </div>
          <span className="text-xs text-violet-300 flex-1">Try: "sweep USDC to Aave every day" or "send 50 USDC to 0x..."</span>
          <button
            onClick={handleToggleNotifications}
            className={cn(
              "text-[10px] px-2 py-1 rounded-full font-semibold uppercase tracking-wider transition-colors",
              notificationsEnabled
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-dls-surface text-dls-secondary border border-dls-border hover:text-dls-text"
            )}
            title={notificationsEnabled ? "Notifications on — click to disable" : "Enable desktop notifications"}
          >
            {notificationsEnabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {/* Intent input */}
      <div className="ow-soft-card p-4 space-y-3">
        <div className="ow-section-heading">What should I do?</div>
        <div className="flex gap-2">
          <Input
            value={intent}
            onChange={(e) => { setIntent(e.target.value); setParseError(null); }}
            placeholder="e.g. sweep USDC to Aave every day"
            className="bg-dls-surface border-dls-border text-dls-text flex-1 h-11"
            onKeyDown={(e) => e.key === "Enter" && handleParse()}
          />
          <Button
            onClick={handleParse}
            disabled={loading || !intent.trim()}
            className="h-11 shrink-0 px-4"
          >
            {loading ? (
              <div className="flex items-center gap-1.5">
                <div className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                <span className="text-xs">...</span>
              </div>
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
        {parseError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/5 px-3 py-2.5 text-xs text-red-300">
            <div className="flex size-5 items-center justify-center rounded-md bg-red-500/10">
              <span className="text-red-400 font-bold">!</span>
            </div>
            {parseError}
          </div>
        )}
      </div>

      {/* Preview card */}
      {preview && (
        <div className="ow-soft-card p-4 space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/10">
                <Terminal className="size-4 text-violet-400" />
              </div>
              <span className="text-sm font-semibold text-dls-text">{preview.name}</span>
            </div>
            <span className={cn(
              "rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
              preview.type === "recurring" ? "bg-violet-500/10 text-violet-300" : "bg-dls-surface-muted/25 text-dls-secondary"
            )}>
              {preview.type}
            </span>
          </div>
          <div className="space-y-1.5 text-xs text-dls-secondary">
            <div className="flex items-center gap-2">
              <span className="w-16 text-[10px] uppercase tracking-wider">Action</span>
              <span className="font-mono text-dls-text">{preview.action.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-[10px] uppercase tracking-wider">Schedule</span>
              <span className="text-dls-text">
                {preview.schedule.intervalMs >= 86400000 ? `Every ${preview.schedule.intervalMs / 86400000} day(s)` : `Every ${preview.schedule.intervalMs / 60000} min`}
              </span>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setPreview(null)} className="flex-1 bg-transparent hover:bg-dls-hover/35">Cancel</Button>
            <Button size="sm" onClick={handleConfirm} className="flex-1">Add Job</Button>
          </div>
        </div>
      )}

      {/* Job list */}
      <div className="space-y-3">
        <JobSection title="Active" count={activeJobs.length} icon={<div className="flex size-5 items-center justify-center rounded-md bg-emerald-500/10"><Play className="size-3 text-emerald-400" /></div>} color="emerald">
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

        <JobSection title="Paused" count={pausedJobs.length} icon={<div className="flex size-5 items-center justify-center rounded-md bg-amber-500/10"><Pause className="size-3 text-amber-400" /></div>} color="amber">
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

        <JobSection title="Failed" count={failedJobs.length} icon={<div className="flex size-5 items-center justify-center rounded-md bg-red-500/10"><AlertCircle className="size-3 text-red-400" /></div>} color="red">
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
        <div className="ow-empty-state py-12">
          <div className="ow-empty-state-icon">
            <Bot className="size-5" />
          </div>
          <div className="ow-empty-state-title">No jobs yet</div>
          <div className="ow-empty-state-desc">Describe what you want to automate above. The agent will create a job for you.</div>
        </div>
      )}
    </div>
  );
}

function JobSection({
  title,
  count,
  icon,
  color,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-dls-secondary">
        {icon}
        <span className={cn("uppercase tracking-wider", color === "emerald" && "text-emerald-400", color === "amber" && "text-amber-400", color === "red" && "text-red-400")}>
          {title}
        </span>
        <span className="bg-dls-surface border border-dls-border rounded-full px-2 py-0.5 text-[10px]">{count}</span>
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
  const nextRunText = isActive ? `Next: ${new Date(job.schedule.nextRun).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Paused";

  return (
    <div className="ow-soft-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex items-center gap-2">
          <div className={cn(
            "flex size-7 items-center justify-center rounded-lg shrink-0",
            isActive ? "bg-emerald-500/10" : "bg-amber-500/10"
          )}>
            {isActive ? (
              <Play className="size-3.5 text-emerald-400" />
            ) : (
              <Pause className="size-3.5 text-amber-400" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-dls-text truncate">{job.name}</div>
            <div className="text-[11px] text-dls-secondary flex items-center gap-1">
              <Clock className="size-3" />
              {nextRunText} • {job.runCount} run{job.runCount !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
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
        <div className="pt-2 border-t border-dls-border space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-dls-secondary">History</div>
          {job.history.slice(0, 5).map((h, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="flex size-5 items-center justify-center rounded-md shrink-0">
                {h.status === "approved" && <CheckCircle className="size-3.5 text-emerald-400" />}
                {h.status === "rejected" && <XCircle className="size-3.5 text-red-400" />}
                {h.status === "failed" && <AlertCircle className="size-3.5 text-amber-400" />}
              </div>
              <span className="text-dls-secondary text-[11px]">{new Date(h.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className={cn(
                "capitalize font-medium text-[11px]",
                h.status === "approved" && "text-emerald-400",
                h.status === "rejected" && "text-red-400",
                h.status === "failed" && "text-amber-400"
              )}>
                {h.status}
              </span>
              {h.txHash && <span className="font-mono text-dls-secondary text-[10px] truncate">{h.txHash.slice(0, 10)}...</span>}
              {h.error && <span className="text-red-400 text-[10px] truncate">{h.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
