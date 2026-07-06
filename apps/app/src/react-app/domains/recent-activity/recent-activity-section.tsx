/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Files,
  FileText,
  Hash,
  ListTodo,
  Play,
  Save,
  XCircle,
} from "lucide-react";

import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import { formatRelativeTime } from "../../../app/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ErrorState } from "../shell/error-state";
import {
  normalizeEvidenceEvents,
  type RecentActivityItem,
  type RecentActivityKind,
} from "./recent-activity-types";

/** Icon + colour tokens for each activity kind. */
const KIND_META: Record<RecentActivityKind, { icon: ElementType; tone: string }> = {
  note_created: { icon: FileText, tone: "text-sky-300" },
  memory_suggested: { icon: BrainCircuit, tone: "text-amber-300" },
  task_started: { icon: Play, tone: "text-sky-300" },
  task_stage_started: { icon: Play, tone: "text-violet-300" },
  task_output_saved: { icon: Save, tone: "text-emerald-300" },
  task_completed: { icon: CheckCircle2, tone: "text-emerald-300" },
  task_failed: { icon: XCircle, tone: "text-red-300" },
  task_cancelled: { icon: AlertCircle, tone: "text-muted-foreground" },
};

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

function deskLabel(desk?: string) {
  if (!desk) return "Workspace";
  if (desk === "bittensor") return "Bittensor";
  if (desk === "hyperliquid") return "Hyperliquid";
  if (desk === "polymarket") return "Polymarket";
  if (desk === "longevity" || desk === "wellness") return "Longevity";
  if (desk === "memory") return "Memory";
  return desk
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function activityDisplayTitle(item: RecentActivityItem) {
  if (item.kind === "task_started") return "Run started";
  if (item.kind === "task_stage_started") return "Stage started";
  if (item.kind === "task_output_saved") return "Output saved";
  if (item.kind === "task_completed") return `${deskLabel(item.desk)} run completed`;
  if (item.kind === "task_failed") return `${deskLabel(item.desk)} run failed`;
  if (item.kind === "task_cancelled") return `${deskLabel(item.desk)} run cancelled`;
  if (item.kind === "note_created") return item.title || "Note created";
  if (item.kind === "memory_suggested") return "Memory review suggested";
  return item.title || "Project activity";
}

function isStartOnlyTaskEvent(item: RecentActivityItem) {
  return item.kind === "task_started" || item.kind === "task_stage_started";
}

function activityStatusLine(item: RecentActivityItem, relatedOutputCount: number) {
  if (isStartOnlyTaskEvent(item) && relatedOutputCount === 0) {
    return "No output recorded yet.";
  }
  if (isStartOnlyTaskEvent(item)) {
    return `${relatedOutputCount} output ${relatedOutputCount === 1 ? "receipt" : "receipts"} recorded.`;
  }
  if (item.kind === "task_output_saved") return "Saved to Outputs.";
  if (item.kind === "task_completed") return relatedOutputCount > 0 ? "Completed with output receipts." : "Completed without saved outputs.";
  if (item.kind === "task_failed") return "Run failed.";
  if (item.kind === "task_cancelled") return "Run cancelled.";
  if (item.kind === "memory_suggested") return "Waiting for review before anything is saved.";
  return item.detail || "Recorded in this project.";
}

function cleanOutputPath(path: string) {
  return path.trim().replace(/[\\]+/g, "/").replace(/^\.\//, "").replace(/^[\/]+/, "");
}

function compactOutputPath(path: string) {
  const parts = cleanOutputPath(path).split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/");
  return parts.slice(-2).join("/");
}

function outputPathsForItem(item: RecentActivityItem) {
  return Array.from(new Set([
    ...(item.outputPath ? [item.outputPath] : []),
    ...(item.artifactPaths ?? []),
  ].map(cleanOutputPath).filter(Boolean)));
}

function relatedOutputPathsForItem(item: RecentActivityItem, items: RecentActivityItem[]) {
  const paths = new Set(outputPathsForItem(item));

  for (const candidate of items) {
    const sameTask = Boolean(item.taskId && candidate.taskId === item.taskId);
    const sameSession = Boolean(
      !item.taskId
      && item.sessionSlug
      && candidate.sessionSlug === item.sessionSlug
      && candidate.desk === item.desk,
    );

    if (!sameTask && !sameSession) continue;

    for (const path of outputPathsForItem(candidate)) {
      paths.add(path);
    }
  }

  return Array.from(paths);
}

function ActivityRow(props: { item: RecentActivityItem; onSelect: () => void }) {
  const { item, onSelect } = props;
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const relativeTime = formatActivityTimestamp(item.timestamp);
  const title = activityDisplayTitle(item);
  const context = item.desk ? deskLabel(item.desk) : item.source.replace(/_/g, " ");
  const outputPath = outputPathsForItem(item)[0];
  const inlineContext = [item.desk, item.sessionSlug].filter(Boolean).join(" · ");
  const shouldShowDetail =
    item.kind === "note_created"
    || item.kind === "memory_suggested"
    || item.kind === "task_output_saved"
    || item.kind === "task_failed"
    || item.kind === "task_cancelled";
  const detail = outputPath
    ? compactOutputPath(outputPath)
    : shouldShowDetail && item.detail && item.detail !== inlineContext
      ? item.detail
      : "";

  return (
    <button
      type="button"
      className="group grid w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-dls-hover/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dls-border"
      onClick={onSelect}
      aria-label={`${title}, ${context}, ${relativeTime}`}
    >
      <span className={cn("flex size-5 shrink-0 items-center justify-center opacity-80", meta.tone)} aria-hidden="true">
        <Icon className="size-3" />
      </span>

      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-medium leading-5 text-dls-text">{title}</span>
          <span className="text-xs leading-5 text-dls-secondary">{context}</span>
        </div>
        {detail ? (
          <p className="truncate text-xs leading-5 text-dls-secondary/85">{detail}</p>
        ) : null}
      </div>
      <time className="shrink-0 text-xs leading-5 text-dls-secondary" dateTime={item.timestamp}>
        {relativeTime}
      </time>
    </button>
  );
}

function DetailLine(props: { label: string; value?: string }) {
  if (!props.value) return null;

  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 text-xs">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 break-words text-dls-text">{props.value}</dd>
    </div>
  );
}

function ActivityDetailSheet(props: {
  item: RecentActivityItem | null;
  items: RecentActivityItem[];
  onOpenChange: (open: boolean) => void;
  onOpenOutputPath?: (path: string) => void;
}) {
  const { item, items, onOpenChange, onOpenOutputPath } = props;
  const outputPaths = useMemo(() => item ? relatedOutputPathsForItem(item, items) : [], [item, items]);

  if (!item) return null;

  const title = activityDisplayTitle(item);
  const statusLine = activityStatusLine(item, outputPaths.length);
  const isStartOnlyRun = isStartOnlyTaskEvent(item) && outputPaths.length === 0;
  const isFailedRun = item.kind === "task_failed";

  return (
    <Sheet open={Boolean(item)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(100vw,420px)] border-dls-border bg-dls-background sm:max-w-[420px]"
      >
        <SheetHeader className="border-b border-dls-border/70 px-5 py-4">
          <SheetTitle className="text-sm font-semibold text-dls-text">{title}</SheetTitle>
          <SheetDescription className="text-xs leading-5 text-dls-secondary">
            {statusLine}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-dls-text">
              <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Timing
            </div>
            <dl className="space-y-1.5">
              <DetailLine label="Recorded" value={formatAbsoluteTimestamp(item.timestamp)} />
              <DetailLine label="Relative" value={formatActivityTimestamp(item.timestamp)} />
            </dl>
          </section>

          <section className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-dls-text">
              <Hash className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Source
            </div>
            <dl className="space-y-1.5">
              <DetailLine label="Desk" value={item.desk ? deskLabel(item.desk) : undefined} />
              <DetailLine label="Session" value={item.sessionSlug ?? item.sessionId} />
              <DetailLine label="Task" value={item.taskId} />
              <DetailLine label="Event" value={item.id} />
              <DetailLine label="Source" value={item.source.replace(/_/g, " ")} />
            </dl>
          </section>

          {item.detail && !isFailedRun ? (
            <section className="space-y-1.5">
              <p className="text-xs font-medium text-dls-text">Detail</p>
              <p className="text-xs leading-5 text-dls-secondary">{item.detail}</p>
            </section>
          ) : null}

          {isFailedRun && item.detail ? (
            <section className="space-y-1.5">
              <p className="text-xs font-medium text-dls-text">Failure detail</p>
              <p className="text-xs leading-5 text-dls-secondary">{item.detail}</p>
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
                  <button
                    key={path}
                    type="button"
                    className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs text-dls-text transition-colors hover:bg-dls-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dls-border disabled:cursor-default disabled:hover:bg-transparent"
                    onClick={() => onOpenOutputPath?.(path)}
                    disabled={!onOpenOutputPath}
                  >
                    <span className="min-w-0 truncate" title={path}>{path}</span>
                    {onOpenOutputPath ? (
                      <span className="shrink-0 text-[10px] text-dls-secondary">Open</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {isStartOnlyRun ? (
            <p className="text-xs leading-5 text-dls-secondary">
              This may still be running or may have ended without a saved receipt.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface RecentActivitySectionProps {
  /** Server client instance. */
  matterhornServerClient: MatterhornServerClient;
  /** Active workspace id. */
  runtimeWorkspaceId: string;
  /** Number of items to fetch (default 10). */
  limit?: number;
  /** Optional visible heading for standalone placements. */
  title?: string;
  /** Optional supporting line for standalone placements. */
  description?: string;
  /** Optional bridge into the Outputs panel when an activity has output receipts. */
  onOpenOutputPath?: (path: string) => void;
}

export function RecentActivitySection({
  matterhornServerClient,
  runtimeWorkspaceId,
  limit = 10,
  title,
  description,
  onOpenOutputPath,
}: RecentActivitySectionProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const queryKey = ["project-evidence", runtimeWorkspaceId, limit] as const;

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => matterhornServerClient.listProjectEvidence(runtimeWorkspaceId, { limit }),
    enabled: Boolean(matterhornServerClient && runtimeWorkspaceId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const refresh = () => {
      void refetch();
    };
    window.addEventListener("matterhorn:task-log-updated", refresh);
    window.addEventListener("matterhorn:project-evidence-updated", refresh);
    return () => {
      window.removeEventListener("matterhorn:task-log-updated", refresh);
      window.removeEventListener("matterhorn:project-evidence-updated", refresh);
    };
  }, [refetch]);

  const items: RecentActivityItem[] = data?.items ? normalizeEvidenceEvents(data.items) : [];
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  return (
    <section className="space-y-3" aria-label={title ?? "Project activity"}>
      {title ? (
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold leading-5 text-dls-text">{title}</p>
            {description ? (
              <p className="mt-0.5 text-xs leading-5 text-dls-secondary">{description}</p>
            ) : null}
          </div>
          {!isLoading && !isError && items.length > 0 ? (
            <span className="shrink-0 text-xs text-dls-secondary">{items.length} recent</span>
          ) : null}
        </div>
      ) : null}
      {isLoading ? (
        <div className="flex items-center gap-2 rounded-lg bg-dls-surface-muted/15 px-3 py-3 text-xs text-muted-foreground">
          <Clock3 className="size-3.5 animate-pulse" />
          Loading project activity…
        </div>
      ) : isError ? (
        <ErrorState
          error={error}
          title="No activity recorded yet"
          detail={error instanceof Error ? error.message : "Check the workspace connection and try again."}
          onRetry={() => void refetch()}
          className="rounded-lg bg-destructive/10 px-3 py-2.5"
        />
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-dls-surface-muted/15 px-3 py-3 text-xs text-muted-foreground">
          <ListTodo className="size-3.5 shrink-0" />
          Notes, tasks, and outputs will appear here as you work.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-dls-surface-muted/10">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} onSelect={() => setSelectedItemId(item.id)} />
          ))}
        </div>
      )}
      <ActivityDetailSheet
        item={selectedItem}
        items={items}
        onOpenChange={(open) => {
          if (!open) setSelectedItemId(null);
        }}
        onOpenOutputPath={onOpenOutputPath}
      />
    </section>
  );
}
