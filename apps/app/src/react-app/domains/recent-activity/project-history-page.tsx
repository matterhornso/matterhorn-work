/** @jsxImportSource react */
import { useMemo, useState, type ElementType } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BrainCircuit,
  CalendarClock,
  Clock3,
  Download,
  Files,
  FileText,
  Hash,
  Image,
  ListFilter,
  Lock,
  MessageSquareText,
  Play,
  Save,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import { formatRelativeTime } from "../../../app/utils";
import type {
  MatterhornProjectDataLedgerEntry,
  MatterhornProjectDataLedgerKind,
  MatterhornProjectDataLedgerResponse,
} from "@matterhorn-work/types/project-data-ledger";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  { id: "team_access", label: "Access", kind: "team_access" },
  { id: "wallet", label: "Wallet", kind: "wallet" },
  { id: "chat", label: "Chats", kind: "chat" },
  { id: "feedback", label: "Feedback", kind: "feedback" },
  { id: "audit", label: "Audit", kind: "audit" },
  { id: "all", label: "All" },
];

const KIND_META: Record<MatterhornProjectDataLedgerKind, { icon: ElementType; tone: string }> = {
  note: { icon: FileText, tone: "text-sky-300" },
  memory_suggestion: { icon: BrainCircuit, tone: "text-amber-300" },
  team_access: { icon: Users, tone: "text-indigo-300" },
  wallet: { icon: WalletCards, tone: "text-cyan-300" },
  chat: { icon: MessageSquareText, tone: "text-blue-300" },
  task: { icon: Play, tone: "text-violet-300" },
  output: { icon: Save, tone: "text-emerald-300" },
  image: { icon: Image, tone: "text-pink-300" },
  nft: { icon: WalletCards, tone: "text-cyan-300" },
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

function formatAbsoluteTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "Unknown time";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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

function sourceLabel(source: MatterhornProjectDataLedgerEntry["source"]) {
  if (source === "project_evidence") return "Project evidence";
  if (source === "opencode_runtime") return "Chat runtime";
  return source.replace(/_/g, " ");
}

function compactLedgerPath(path: string) {
  const parts = path.trim().replace(/[\\]+/g, "/").split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/");
  return parts.slice(-2).join("/");
}

function isTaskStartEntry(entry: MatterhornProjectDataLedgerEntry) {
  return entry.eventType === "task.started" || entry.eventType === "task.stage_started";
}

function entryDisplaySummary(entry: MatterhornProjectDataLedgerEntry) {
  if (entry.outputPath) return compactLedgerPath(entry.outputPath);
  if (entry.eventType === "task.started") return "Actual local event recorded when the desk task started.";
  if (entry.eventType === "task.stage_started") return "Actual local event recorded when a workflow stage started.";
  if (entry.eventType === "task.completed") return "Desk run finished and was recorded in this workspace.";
  if (entry.eventType === "task.failed") return entry.summary || "Desk run failed; details are kept in the project ledger.";
  if (entry.eventType === "task.cancelled") return "Desk run was cancelled.";
  if (entry.kind === "output") return entry.summary || "Output receipt saved for this workspace.";
  return entry.summary || entryContext(entry);
}

function kindCount(data: MatterhornProjectDataLedgerResponse | undefined, filter: ProjectHistoryFilter) {
  if (!data) return 0;
  if (filter === "all") return data.summary.total;
  if (filter === "note") return data.summary.notes;
  if (filter === "memory_suggestion") return data.summary.memorySuggestions;
  if (filter === "team_access") return data.summary.teamAccess;
  if (filter === "wallet") return data.summary.wallets;
  if (filter === "chat") return data.summary.chats;
  if (filter === "task") return data.summary.tasks;
  if (filter === "output") return data.summary.outputs;
  if (filter === "audit") return data.summary.audits;
  if (filter === "feedback") return data.summary.feedback;
  return 0;
}

function projectHistoryFilterFromParam(value: string | null): ProjectHistoryFilter {
  if (value && PROJECT_HISTORY_FILTERS.some((filter) => filter.id === value)) {
    return value as ProjectHistoryFilter;
  }
  return "task";
}

function projectHistoryDeskFromParam(value: string | null): string {
  const next = value?.trim();
  return next ? next : ALL_DESKS;
}

function entryContext(entry: MatterhornProjectDataLedgerEntry) {
  return [
    deskLabel(entry.desk),
    entry.sessionSlug,
    entry.outputPath ? "Output" : null,
    entry.redactionApplied ? "Redacted" : null,
  ].filter(Boolean).join(" · ");
}

function humanizeValue(value: string) {
  return value.replace(/_/g, " ");
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

function outputPathsForEntry(entry: MatterhornProjectDataLedgerEntry) {
  return Array.from(new Set([
    entry.outputPath,
    ...(entry.artifactPaths ?? []),
  ].filter((path): path is string => Boolean(path?.trim()))));
}

function DetailLine(props: { label: string; value?: string }) {
  if (!props.value) return null;

  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 text-xs">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 break-words text-dls-text">{props.value}</dd>
    </div>
  );
}

function ProjectHistoryRow({
  entry,
  onSelect,
}: {
  entry: MatterhornProjectDataLedgerEntry;
  onSelect: () => void;
}) {
  const meta = KIND_META[entry.kind];
  const Icon = meta.icon;
  const title = titleForEntry(entry);
  const summary = entryDisplaySummary(entry);
  const desk = deskLabel(entry.desk);
  const showDesk = Boolean(desk && !isTaskStartEntry(entry));

  return (
    <button
      type="button"
      className="grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-3 rounded-md px-3 py-3 text-left transition-colors hover:bg-dls-hover/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dls-border"
      onClick={onSelect}
      aria-label={`${title}, ${formatActivityTimestamp(entry.timestamp)}`}
    >
      <span className={cn("mt-0.5 flex size-5 items-center justify-center", meta.tone)} aria-hidden="true">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="truncate text-sm font-medium leading-5 text-dls-text">{title}</h3>
          {showDesk ? <span className="text-xs leading-5 text-dls-secondary">{desk}</span> : null}
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
          <span>{sourceLabel(entry.source)}</span>
          {isTaskStartEntry(entry) && desk ? <span>{desk}</span> : null}
          {entry.outputPath ? <span>output receipt</span> : null}
          {entry.retention === "append_only" ? <span>append-only</span> : null}
          {entry.containsSecrets === "redacted" ? <span>secret-safe</span> : null}
        </div>
      </div>
      <time className="shrink-0 text-xs leading-5 text-dls-secondary" dateTime={entry.timestamp}>
        {formatActivityTimestamp(entry.timestamp)}
      </time>
    </button>
  );
}

function ProjectHistoryDetailSheet({
  entry,
  onOpenChange,
}: {
  entry: MatterhornProjectDataLedgerEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!entry) return null;

  const title = titleForEntry(entry);
  const summary = entryDisplaySummary(entry) || "Recorded in the project ledger.";
  const desk = deskLabel(entry.desk);
  const outputPaths = outputPathsForEntry(entry);
  const actor = [entry.actor?.type, entry.actor?.scope].filter(Boolean).join(" · ");

  return (
    <Sheet open={Boolean(entry)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(100vw,430px)] border-dls-border bg-dls-background sm:max-w-[430px]"
      >
        <SheetHeader className="border-b border-dls-border/60 px-5 py-4">
          <SheetTitle className="text-sm font-semibold text-dls-text">{title}</SheetTitle>
          <SheetDescription className="text-xs leading-5 text-dls-secondary">
            {summary}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-dls-text">
              <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Timing
            </div>
            <dl className="space-y-1.5">
              <DetailLine label="Recorded" value={formatAbsoluteTimestamp(entry.timestamp)} />
              <DetailLine label="Relative" value={formatActivityTimestamp(entry.timestamp)} />
            </dl>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-dls-text">
              <Hash className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Source
            </div>
            <dl className="space-y-1.5">
              <DetailLine label="Kind" value={humanizeValue(entry.kind)} />
              <DetailLine label="Source" value={sourceLabel(entry.source)} />
              <DetailLine label="Event" value={entry.eventType} />
              <DetailLine label="Desk" value={desk || undefined} />
              <DetailLine label="Session" value={entry.sessionSlug ?? entry.sessionId} />
              <DetailLine label="Task" value={entry.taskId} />
              <DetailLine label="Note" value={entry.noteId} />
              <DetailLine label="Actor" value={actor || undefined} />
              <DetailLine label="Ledger id" value={entry.id} />
            </dl>
          </section>

          {entry.summary ? (
            <section className="space-y-1.5">
              <p className="text-xs font-medium text-dls-text">Summary</p>
              <p className="text-xs leading-5 text-dls-secondary">{entry.summary}</p>
            </section>
          ) : null}

          {outputPaths.length > 0 ? (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-dls-text">
                <Files className="size-3.5 text-muted-foreground" aria-hidden="true" />
                Outputs
              </div>
              <div className="space-y-1">
                {outputPaths.map((path) => (
                  <div
                    key={path}
                    className="min-w-0 rounded-md bg-dls-surface-muted/20 px-2 py-1.5 text-xs text-dls-text"
                    title={path}
                  >
                    <span className="block truncate">{compactLedgerPath(path)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-dls-text">
              <ShieldCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Data policy
            </div>
            <dl className="space-y-1.5">
              <DetailLine label="Data class" value={humanizeValue(entry.dataClass)} />
              <DetailLine label="User content" value={yesNo(entry.containsUserContent)} />
              <DetailLine label="Secrets" value={humanizeValue(entry.containsSecrets)} />
              <DetailLine label="Retention" value={humanizeValue(entry.retention)} />
              <DetailLine label="Exportable" value={yesNo(entry.exportable)} />
              <DetailLine label="Deletable" value={yesNo(entry.deletable)} />
              <DetailLine label="Redacted" value={yesNo(entry.redactionApplied)} />
              <DetailLine label="Training use" value={humanizeValue(entry.trainingUse)} />
            </dl>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ProjectHistoryPage({
  matterhornServerClient,
  runtimeWorkspaceId,
}: {
  matterhornServerClient: MatterhornServerClient | null;
  runtimeWorkspaceId: string | null;
}) {
  const [historySearchParams, setHistorySearchParams] = useSearchParams();
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const activeFilter = projectHistoryFilterFromParam(historySearchParams.get("kind"));
  const activeDesk = projectHistoryDeskFromParam(historySearchParams.get("desk"));
  const activeFilterConfig = PROJECT_HISTORY_FILTERS.find((filter) => filter.id === activeFilter) ?? PROJECT_HISTORY_FILTERS[0];
  const activeKind = activeFilterConfig.kind;

  const setHistoryFilter = (filter: ProjectHistoryFilter) => {
    const params = new URLSearchParams(historySearchParams);
    if (filter === "task") params.delete("kind");
    else params.set("kind", filter);
    setHistorySearchParams(params);
  };

  const setHistoryDesk = (desk: string) => {
    const params = new URLSearchParams(historySearchParams);
    const nextDesk = desk.trim();
    if (!nextDesk || nextDesk === ALL_DESKS) params.delete("desk");
    else params.set("desk", nextDesk);
    setHistorySearchParams(params);
  };

  const summaryQuery = useQuery({
    queryKey: ["project-history-ledger-summary", runtimeWorkspaceId],
    enabled: Boolean(matterhornServerClient && runtimeWorkspaceId),
    queryFn: async () => {
      if (!matterhornServerClient || !runtimeWorkspaceId) throw new Error("Open a workspace to see project history.");
      return matterhornServerClient.listProjectDataLedger(runtimeWorkspaceId, { limit: 300 });
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const ledgerQuery = useQuery({
    queryKey: ["project-history-ledger", runtimeWorkspaceId, activeKind ?? "all", activeDesk],
    enabled: Boolean(matterhornServerClient && runtimeWorkspaceId),
    queryFn: async () => {
      if (!matterhornServerClient || !runtimeWorkspaceId) throw new Error("Open a workspace to see project history.");
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
  const selectedEntry = rows.find((entry) => entry.id === selectedEntryId) ?? null;
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
      const exportPayload = await matterhornServerClient.exportProjectDataLedger(runtimeWorkspaceId, {
        limit: 300,
        ...(activeKind ? { kind: activeKind } : {}),
        ...(activeDesk !== ALL_DESKS ? { desk: activeDesk } : {}),
      });
      const datePart = new Date().toISOString().slice(0, 10);
      downloadJsonFile(
        exportPayload.filename || `matterhorn-project-history-${safeDownloadFilePart(runtimeWorkspaceId)}-${datePart}.json`,
        JSON.stringify(exportPayload, null, 2),
      );
      setExportStatus(`Exported ${exportPayload.manifest.itemCount} events.`);
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
        <header className="flex flex-col gap-3 border-b border-dls-border/15 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-[-0.01em] text-dls-text">Project history</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-dls-secondary">
              Actual local events from this workspace: runs, outputs, notes, memory reviews, wallet receipts, feedback, access, and audit records.
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
                      ? "bg-dls-hover text-dls-text"
                      : "bg-transparent text-dls-secondary hover:bg-dls-surface-muted/20 hover:text-dls-text",
                  )}
                  onClick={() => setHistoryFilter(filter.id)}
                >
                  <span>{filter.label}</span>
                  <span className="text-[11px] text-dls-secondary/75">
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
                onChange={(event) => setHistoryDesk(event.currentTarget.value)}
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
          <div className="rounded-lg bg-dls-surface-muted/10 px-2 py-2">
            {latest ? (
              <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-dls-secondary">
                <span>{rows.length} actual event{rows.length === 1 ? "" : "s"} shown</span>
                <span>Latest {formatActivityTimestamp(latest.timestamp)}</span>
              </div>
            ) : null}
            <div className="space-y-1">
              {rows.map((entry) => (
                <ProjectHistoryRow
                  key={entry.id}
                  entry={entry}
                  onSelect={() => setSelectedEntryId(entry.id)}
                />
              ))}
            </div>
          </div>
        )}
        <ProjectHistoryDetailSheet
          entry={selectedEntry}
          onOpenChange={(open) => {
            if (!open) setSelectedEntryId(null);
          }}
        />
      </div>
    </div>
  );
}
