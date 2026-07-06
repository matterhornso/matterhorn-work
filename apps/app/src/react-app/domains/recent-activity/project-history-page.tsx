/** @jsxImportSource react */
import { useMemo, useState, type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  History,
  ListFilter,
  Lock,
  MessageSquareText,
  Play,
  Save,
  ShieldCheck,
} from "lucide-react";

import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import { formatRelativeTime } from "../../../app/utils";
import type {
  MatterhornProjectDataLedgerEntry,
  MatterhornProjectDataLedgerKind,
  MatterhornProjectDataLedgerResponse,
} from "@matterhorn-work/types/project-data-ledger";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorState } from "../shell/error-state";

type ProjectHistoryFilter = MatterhornProjectDataLedgerKind | "all";
const ALL_DESKS = "all" as const;

export const PROJECT_HISTORY_FILTERS: Array<{
  id: ProjectHistoryFilter;
  label: string;
  kind?: MatterhornProjectDataLedgerKind;
}> = [
  { id: "task", label: "Runs", kind: "task" },
  { id: "output", label: "Outputs", kind: "output" },
  { id: "note", label: "Notes", kind: "note" },
  { id: "memory_suggestion", label: "Memory", kind: "memory_suggestion" },
  { id: "feedback", label: "Feedback", kind: "feedback" },
  { id: "audit", label: "Audit", kind: "audit" },
  { id: "all", label: "All" },
];

const KIND_META: Record<MatterhornProjectDataLedgerKind, { icon: ElementType; tone: string }> = {
  note: { icon: FileText, tone: "text-sky-300" },
  memory_suggestion: { icon: BrainCircuit, tone: "text-amber-300" },
  task: { icon: Play, tone: "text-violet-300" },
  output: { icon: Save, tone: "text-emerald-300" },
  audit: { icon: ShieldCheck, tone: "text-dls-secondary" },
  feedback: { icon: MessageSquareText, tone: "text-sky-300" },
};

function safeDownloadFilePart(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workspace";
}

function downloadJsonFile(filename: string, content: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatActivityTimestamp(timestamp: string) {
  const timestampMs = Date.parse(timestamp);
  return Number.isFinite(timestampMs) ? formatRelativeTime(timestampMs) : "Unknown time";
}

function deskLabel(value?: string) {
  if (!value) return "";
  if (value === "bittensor") return "Bittensor";
  if (value === "hyperliquid") return "Hyperliquid";
  if (value === "polymarket") return "Polymarket";
  if (value === "wellness" || value === "longevity") return "Longevity";
  if (value === "memory") return "Memory";
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function titleForEntry(entry: MatterhornProjectDataLedgerEntry) {
  if (entry.eventType === "task.started") return "Run started";
  if (entry.eventType === "task.stage_started") return "Stage started";
  if (entry.eventType === "task.output_saved") return "Output saved";
  if (entry.eventType === "task.completed") return "Run completed";
  if (entry.eventType === "task.failed") return "Run failed";
  if (entry.eventType === "task.cancelled") return "Run cancelled";
  if (entry.kind === "memory_suggestion") return entry.title || "Memory review";
  return entry.title || "Project event";
}

function kindCount(data: MatterhornProjectDataLedgerResponse | undefined, filter: ProjectHistoryFilter) {
  if (!data) return 0;
  if (filter === "all") return data.summary.total;
  if (filter === "note") return data.summary.notes;
  if (filter === "memory_suggestion") return data.summary.memorySuggestions;
  if (filter === "task") return data.summary.tasks;
  if (filter === "output") return data.summary.outputs;
  if (filter === "audit") return data.summary.audits;
  if (filter === "feedback") return data.summary.feedback;
  return 0;
}

function entryContext(entry: MatterhornProjectDataLedgerEntry) {
  return [
    deskLabel(entry.desk),
    entry.sessionSlug,
    entry.outputPath ? "Output" : null,
    entry.redactionApplied ? "Redacted" : null,
  ].filter(Boolean).join(" · ");
}

function ProjectHistoryRow({ entry }: { entry: MatterhornProjectDataLedgerEntry }) {
  const meta = KIND_META[entry.kind];
  const Icon = meta.icon;
  const context = entryContext(entry);
  const title = titleForEntry(entry);
  const summary = entry.outputPath || entry.summary || context;

  return (
    <article className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-3 px-3 py-3.5 transition-colors hover:bg-dls-hover/25">
      <span className={cn("mt-0.5 flex size-5 items-center justify-center", meta.tone)} aria-hidden="true">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="truncate text-sm font-medium leading-5 text-dls-text">{title}</h3>
          {entry.desk ? <span className="text-xs leading-5 text-dls-secondary">{deskLabel(entry.desk)}</span> : null}
          {entry.trainingUse !== "none" ? (
            <span className="inline-flex items-center gap-1 text-xs leading-5 text-dls-secondary">
              <Lock className="size-3" aria-hidden="true" />
              No training by default
            </span>
          ) : null}
        </div>
        {summary ? (
          <p className="mt-0.5 truncate text-xs leading-5 text-dls-secondary" title={summary}>
            {summary}
          </p>
        ) : null}
        <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-[11px] leading-4 text-dls-secondary/80">
          <span>{entry.source.replace(/_/g, " ")}</span>
          {entry.taskId ? <span className="truncate">task {entry.taskId}</span> : null}
          {entry.noteId ? <span className="truncate">note {entry.noteId}</span> : null}
          {entry.containsSecrets === "redacted" ? <span>secret-safe</span> : null}
        </div>
      </div>
      <time className="shrink-0 text-xs leading-5 text-dls-secondary" dateTime={entry.timestamp}>
        {formatActivityTimestamp(entry.timestamp)}
      </time>
    </article>
  );
}

export function ProjectHistoryPage({
  matterhornServerClient,
  runtimeWorkspaceId,
}: {
  matterhornServerClient: MatterhornServerClient | null;
  runtimeWorkspaceId: string | null;
}) {
  const [activeFilter, setActiveFilter] = useState<ProjectHistoryFilter>("task");
  const [activeDesk, setActiveDesk] = useState<string>(ALL_DESKS);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const activeFilterConfig = PROJECT_HISTORY_FILTERS.find((filter) => filter.id === activeFilter) ?? PROJECT_HISTORY_FILTERS[0];
  const activeKind = activeFilterConfig.kind;

  const summaryQuery = useQuery({
    queryKey: ["project-history-ledger-summary", runtimeWorkspaceId],
    enabled: Boolean(matterhornServerClient && runtimeWorkspaceId),
    queryFn: async () => {
      if (!matterhornServerClient || !runtimeWorkspaceId) throw new Error("Open a workspace to see run history.");
      return matterhornServerClient.listProjectDataLedger(runtimeWorkspaceId, { limit: 300 });
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const ledgerQuery = useQuery({
    queryKey: ["project-history-ledger", runtimeWorkspaceId, activeKind ?? "all", activeDesk],
    enabled: Boolean(matterhornServerClient && runtimeWorkspaceId),
    queryFn: async () => {
      if (!matterhornServerClient || !runtimeWorkspaceId) throw new Error("Open a workspace to see run history.");
      return matterhornServerClient.listProjectDataLedger(runtimeWorkspaceId, {
        limit: 120,
        ...(activeKind ? { kind: activeKind } : {}),
        ...(activeDesk !== ALL_DESKS ? { desk: activeDesk } : {}),
      });
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const rows = ledgerQuery.data?.items ?? [];
  const latest = rows[0] ?? null;
  const visiblePolicy = summaryQuery.data?.policy ?? ledgerQuery.data?.policy ?? null;
  const filterCounts = useMemo(() => (
    Object.fromEntries(PROJECT_HISTORY_FILTERS.map((filter) => [filter.id, kindCount(summaryQuery.data, filter.id)]))
  ), [summaryQuery.data]);
  const deskOptions = useMemo(() => {
    const desks = new Map<string, number>();
    for (const entry of summaryQuery.data?.items ?? []) {
      const desk = entry.desk?.trim();
      if (!desk) continue;
      desks.set(desk, (desks.get(desk) ?? 0) + 1);
    }
    return [...desks.entries()]
      .sort((a, b) => deskLabel(a[0]).localeCompare(deskLabel(b[0])))
      .map(([id, count]) => ({ id, label: deskLabel(id), count }));
  }, [summaryQuery.data]);

  const exportLedger = async () => {
    if (!matterhornServerClient || !runtimeWorkspaceId) {
      setExportStatus("Open a connected workspace to export history.");
      return;
    }
    setExportStatus("Exporting...");
    try {
      const ledger = await matterhornServerClient.listProjectDataLedger(runtimeWorkspaceId, { limit: 300 });
      const datePart = new Date().toISOString().slice(0, 10);
      downloadJsonFile(
        `matterhorn-project-history-${safeDownloadFilePart(runtimeWorkspaceId)}-${datePart}.json`,
        JSON.stringify(ledger, null, 2),
      );
      setExportStatus(`Exported ${ledger.count} events.`);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Could not export project history.");
    }
  };

  return (
    <div
      className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 pb-24 pt-6 sm:px-6 sm:pb-28 sm:pt-8"
      style={{ scrollbarGutter: "stable" }}
    >
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <header className="flex flex-col gap-3 border-b border-dls-border/30 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-dls-secondary">
              <History className="size-3.5" aria-hidden="true" />
              Project ledger
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-dls-text">Run history</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-dls-secondary">
              Runs stay here with their outputs, notes, memory reviews, feedback, and audit events.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {visiblePolicy ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-dls-secondary">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                No training by default
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2 text-xs text-dls-secondary hover:text-dls-text"
              onClick={() => void exportLedger()}
              disabled={!matterhornServerClient || !runtimeWorkspaceId}
            >
              <Download className="size-3.5" />
              Export
            </Button>
          </div>
        </header>

        <section aria-label="Project history filters" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {PROJECT_HISTORY_FILTERS.map((filter) => {
              const selected = filter.id === activeFilter;
              const count = filterCounts[filter.id] ?? 0;
              return (
                <button
                  key={filter.id}
                  type="button"
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dls-border",
                    selected
                      ? "bg-dls-text text-dls-background"
                      : "bg-dls-surface-muted/25 text-dls-secondary hover:bg-dls-hover hover:text-dls-text",
                  )}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  <span>{filter.label}</span>
                  <span className={cn("text-[11px]", selected ? "text-dls-background/75" : "text-dls-secondary/75")}>
                    {summaryQuery.isLoading ? "…" : count}
                  </span>
                </button>
              );
            })}
          </div>
          {deskOptions.length > 0 ? (
            <label className="flex w-full items-center gap-2 text-xs text-dls-secondary sm:w-auto">
              <span className="shrink-0">Desk</span>
              <select
                className="h-8 min-w-40 rounded-md border border-dls-border/60 bg-dls-background px-2 text-xs text-dls-text outline-none transition-colors focus:border-dls-text"
                value={activeDesk}
                onChange={(event) => setActiveDesk(event.currentTarget.value)}
              >
                <option value={ALL_DESKS}>All desks</option>
                {deskOptions.map((desk) => (
                  <option key={desk.id} value={desk.id}>
                    {desk.label} ({desk.count})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </section>

        {exportStatus ? (
          <p className="text-xs leading-5 text-dls-secondary">{exportStatus}</p>
        ) : null}

        {ledgerQuery.isLoading ? (
          <div className="flex items-center gap-2 rounded-lg bg-dls-surface-muted/15 px-3 py-3 text-xs text-dls-secondary">
            <Clock3 className="size-3.5 animate-pulse" />
            Loading project history...
          </div>
        ) : ledgerQuery.isError ? (
          <ErrorState
            error={ledgerQuery.error}
            title="Project history could not load"
            detail={ledgerQuery.error instanceof Error ? ledgerQuery.error.message : "Check the workspace connection and try again."}
            onRetry={() => void ledgerQuery.refetch()}
            className="rounded-lg bg-destructive/10 px-3 py-2.5"
          />
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-dls-surface-muted/15 px-3 py-3 text-xs text-dls-secondary">
            <ListFilter className="size-3.5" />
            No {activeFilterConfig.label.toLowerCase()} recorded yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-dls-surface-muted/10">
            {latest ? (
              <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-dls-secondary">
                <span>{rows.length} shown</span>
                <span>Latest {formatActivityTimestamp(latest.timestamp)}</span>
              </div>
            ) : null}
            <div className="divide-y divide-dls-border/20">
              {rows.map((entry) => (
                <ProjectHistoryRow key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
