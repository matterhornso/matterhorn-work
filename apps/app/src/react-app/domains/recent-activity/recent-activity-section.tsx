/** @jsxImportSource react */
import type { ElementType } from "react";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileText,
  ListTodo,
  Play,
  RefreshCw,
  Save,
  Sparkles,
  XCircle,
} from "lucide-react";

import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { formatRelativeTime } from "../../../../app/utils";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  normalizeEvidenceEvents,
  type RecentActivityItem,
  type RecentActivityKind,
} from "./recent-activity-types";

/** Icon + colour tokens for each activity kind. */
const KIND_META: Record<RecentActivityKind, { icon: ElementType; tone: string; label: string }> = {
  note_created: { icon: FileText, tone: "text-sky-300", label: "Note" },
  memory_suggested: { icon: BrainCircuit, tone: "text-amber-300", label: "Memory" },
  task_started: { icon: Play, tone: "text-sky-300", label: "Started" },
  task_stage_started: { icon: Play, tone: "text-violet-300", label: "Stage" },
  task_output_saved: { icon: Save, tone: "text-emerald-300", label: "Saved" },
  task_completed: { icon: CheckCircle2, tone: "text-emerald-300", label: "Done" },
  task_failed: { icon: XCircle, tone: "text-red-300", label: "Failed" },
  task_cancelled: { icon: AlertCircle, tone: "text-muted-foreground", label: "Cancelled" },
};

function ActivityRow(props: { item: RecentActivityItem }) {
  const { item } = props;
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  const relativeTime = formatRelativeTime(Date.parse(item.timestamp) / 1000);

  return (
    <div className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
      {/* Status dot */}
      <div
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
          "bg-current/10 text-current",
          meta.tone,
        )}
        aria-hidden="true"
      >
        <Icon className="size-3" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium capitalize text-dls-text">{item.title}</span>
          {item.desk ? (
            <span className="rounded-full border border-dls-border bg-dls-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {item.desk}
            </span>
          ) : null}
          {item.sessionSlug ? (
            <span className="rounded-full border border-dls-border bg-dls-surface px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {item.sessionSlug}
            </span>
          ) : null}
          <span className={cn("ml-auto shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", meta.tone)}>
            {meta.label}
          </span>
        </div>
        {item.detail ? (
          <p className="mt-0.5 truncate text-[11px] leading-5 text-muted-foreground">{item.detail}</p>
        ) : null}
        <p className="mt-0.5 text-[10px] text-muted-foreground">{relativeTime}</p>
      </div>
    </div>
  );
}

interface RecentActivitySectionProps {
  /** Server client instance. */
  matterhornServerClient: MatterhornServerClient;
  /** Active workspace id. */
  runtimeWorkspaceId: string;
  /** Number of items to fetch (default 10). */
  limit?: number;
}

export function RecentActivitySection({
  matterhornServerClient,
  runtimeWorkspaceId,
  limit = 10,
}: RecentActivitySectionProps) {
  const queryKey = ["project-evidence", runtimeWorkspaceId, limit] as const;

  const { data, error, isError, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => matterhornServerClient.listProjectEvidence(runtimeWorkspaceId, { limit }),
    enabled: Boolean(matterhornServerClient && runtimeWorkspaceId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const items: RecentActivityItem[] = data?.items ? normalizeEvidenceEvents(data.items) : [];

  return (
    <div className="space-y-2">
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="size-3.5 animate-pulse" />
          Loading recent activity…
        </div>
      ) : isError ? (
        <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-xs text-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">Recent activity could not load.</p>
              <p className="mt-0.5 break-words text-red-200/80">
                {error instanceof Error ? error.message : "Check the workspace connection and try again."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit gap-1.5 border-red-300/35 text-red-100 hover:bg-red-500/15"
            onClick={() => void refetch()}
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dls-border bg-dls-surface px-3 py-3 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 shrink-0" />
          Notes, tasks, and outputs will appear here as you work.
        </div>
      ) : (
        <div className="divide-y divide-dls-border/45">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
