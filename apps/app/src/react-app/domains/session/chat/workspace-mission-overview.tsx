/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Clock3,
  PencilLine,
  Target,
  Trash2,
} from "lucide-react";

import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { Button } from "@/components/ui/button";

function missionStatusLabel(status: string) {
  if (status === "completed") return "Completed";
  if (status === "paused") return "Paused";
  if (status === "draft") return "Draft";
  return "Active mission";
}

export function WorkspaceMissionOverview({
  matterhornServerClient,
  runtimeWorkspaceId,
  onOpenSession,
  onOpenHistory,
}: {
  matterhornServerClient: MatterhornServerClient;
  runtimeWorkspaceId: string;
  onOpenSession: (sessionId: string) => void;
  onOpenHistory: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [objective, setObjective] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const queryKey = [
    "workspace-mission-overview",
    matterhornServerClient.baseUrl,
    runtimeWorkspaceId,
  ] as const;

  const missionQuery = useQuery({
    queryKey,
    queryFn: () => matterhornServerClient.getWorkspaceMissionOverview(runtimeWorkspaceId),
    enabled: Boolean(runtimeWorkspaceId),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    setEditing(false);
    setObjective("");
    setFormError(null);
    setConfirmingDelete(false);
  }, [runtimeWorkspaceId]);

  useEffect(() => {
    const refresh = () => void missionQuery.refetch();
    window.addEventListener("matterhorn:task-log-updated", refresh);
    window.addEventListener("matterhorn:project-evidence-updated", refresh);
    return () => {
      window.removeEventListener("matterhorn:task-log-updated", refresh);
      window.removeEventListener("matterhorn:project-evidence-updated", refresh);
    };
  }, [missionQuery.refetch]);

  const updateMission = useMutation({
    mutationFn: (nextObjective: string) => matterhornServerClient.updateWorkspaceMission(
      runtimeWorkspaceId,
      { objective: nextObjective, status: "active" },
    ),
    onSuccess: async () => {
      setEditing(false);
      setConfirmingDelete(false);
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      setFormError("Mission could not be saved. Check your connection and try again.");
    },
  });

  const removeMission = useMutation({
    mutationFn: () => matterhornServerClient.deleteWorkspaceMission(runtimeWorkspaceId),
    onSuccess: async () => {
      setEditing(false);
      setConfirmingDelete(false);
      setObjective("");
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      setFormError("Mission could not be removed. Check your connection and try again.");
    },
  });

  const mission = missionQuery.data?.mission ?? null;
  const attention = missionQuery.data?.attention ?? [];
  const completedRuns = missionQuery.data?.runs.summary.byStatus.completed ?? 0;
  const evidenceCount = missionQuery.data?.evidence.summary.total ?? 0;
  const summary = useMemo(() => {
    const parts = [`${completedRuns} completed run${completedRuns === 1 ? "" : "s"}`];
    parts.push(`${evidenceCount} saved record${evidenceCount === 1 ? "" : "s"}`);
    return parts.join(" · ");
  }, [completedRuns, evidenceCount]);

  const beginEditing = () => {
    setObjective(mission?.objective ?? "");
    setFormError(null);
    setConfirmingDelete(false);
    setEditing(true);
  };

  const saveMission = async () => {
    const nextObjective = objective.trim();
    if (!nextObjective) {
      setFormError("Describe the outcome this project should achieve.");
      return;
    }
    await updateMission.mutateAsync(nextObjective).catch(() => undefined);
  };

  if (missionQuery.isLoading) {
    return (
      <section className="border-t border-dls-border/40 pt-3" aria-label="Project goal">
        <div className="flex items-center gap-2 text-xs text-dls-secondary" role="status">
          <Clock3 className="size-3.5 animate-pulse" aria-hidden="true" />
          Loading project goal…
        </div>
      </section>
    );
  }

  if (missionQuery.isError) {
    return (
      <section className="border-t border-dls-border/40 pt-3" aria-label="Project goal">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-dls-text">Project goal</p>
          </div>
          <Button variant="secondary" size="sm" className="h-11 sm:h-8" onClick={() => void missionQuery.refetch()}>
            Retry
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 border-t border-dls-border/40 pt-3" aria-label="Project goal">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--matterhorn-blue-rgb)/0.10)] text-[var(--dls-accent)]">
            <Target className="size-4" strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="text-sm font-semibold text-dls-text">Project goal</h3>
              {mission ? (
                <span className="text-[11px] font-medium text-dls-secondary">
                  {missionStatusLabel(mission.status)}
                </span>
              ) : null}
            </div>
            {mission ? (
              <p className="mt-1 max-w-3xl text-sm leading-6 text-dls-text">{mission.objective}</p>
            ) : null}
            {mission ? <p className="mt-1 text-[11px] text-dls-secondary">{summary}</p> : null}
          </div>
        </div>
        {missionQuery.data?.writable ? (
          <Button
            type="button"
            variant={mission ? "ghost" : "secondary"}
            size="sm"
            className="h-11 shrink-0 px-3 sm:h-8"
            onClick={beginEditing}
          >
            {mission ? <PencilLine className="mr-1.5 size-3.5" aria-hidden="true" /> : null}
            {mission ? "Edit" : "Set goal"}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="ml-0 space-y-2 sm:ml-11">
          <label htmlFor="workspace-mission-objective" className="text-xs font-medium text-dls-text">
            Outcome to achieve
          </label>
          <textarea
            id="workspace-mission-objective"
            value={objective}
            maxLength={1_000}
            rows={3}
            autoFocus
            className="min-h-24 w-full resize-y rounded-md border border-dls-border bg-dls-surface px-3 py-2.5 text-sm leading-6 text-dls-text outline-none placeholder:text-dls-muted focus-visible:ring-2 focus-visible:ring-[var(--dls-accent)]/40"
            placeholder="Example: Monitor validator performance, compare risk, and prepare a wallet-reviewed 10 TAO staking decision."
            onChange={(event) => {
              setObjective(event.target.value);
              if (formError) setFormError(null);
            }}
          />
          {formError ? <p className="text-xs leading-5 text-red-11" role="alert">{formError}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="h-11 px-4 sm:h-8"
              disabled={updateMission.isPending}
              onClick={() => void saveMission()}
            >
              {updateMission.isPending ? "Saving…" : "Save mission"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 px-3 sm:h-8"
              disabled={updateMission.isPending}
              onClick={() => {
                setEditing(false);
                setConfirmingDelete(false);
                setFormError(null);
              }}
            >
              Cancel
            </Button>
            {mission ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-11 px-3 text-red-11 hover:text-red-11 sm:h-8"
                disabled={updateMission.isPending || removeMission.isPending}
                onClick={() => {
                  if (!confirmingDelete) {
                    setConfirmingDelete(true);
                    setFormError(null);
                    return;
                  }
                  void removeMission.mutateAsync().catch(() => undefined);
                }}
              >
                <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
                {removeMission.isPending
                  ? "Removing…"
                  : confirmingDelete
                    ? "Confirm removal"
                    : "Remove mission"}
              </Button>
            ) : null}
          </div>
          {confirmingDelete ? (
            <p className="text-xs leading-5 text-dls-secondary">
              This removes the mission from the workspace. Audit history remains for accountability.
            </p>
          ) : null}
        </div>
      ) : null}

      {attention.length > 0 ? (
        <button
          type="button"
          className="group flex min-h-11 w-full items-center justify-between gap-3 border-t border-dls-border/35 pt-2 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dls-border sm:ml-11 sm:w-[calc(100%-2.75rem)]"
          onClick={() => attention.length === 1 && attention[0]?.sessionId
            ? onOpenSession(attention[0].sessionId)
            : onOpenHistory()}
        >
          <span className="font-medium text-dls-text">
            {attention.length} item{attention.length === 1 ? "" : "s"} need attention
          </span>
          <span className="inline-flex items-center gap-0.5 text-dls-secondary group-hover:text-dls-text">
            Review
            <ChevronRight className="size-3" aria-hidden="true" />
          </span>
        </button>
      ) : null}
    </section>
  );
}
