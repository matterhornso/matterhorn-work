import { useEffect, useMemo, useState } from "react";
import type { MatterhornWorkflowRunListItem } from "@matterhorn-work/types/workflow-runs";
import type { MatterhornServerClient } from "../../../../app/lib/matterhorn-server";
import { useSessionActivityStore, type SessionActivityStatus } from "../../session/status/session-activity-store";

export type TaskLogSource = "backend" | "local";

export type TaskLogEntry = {
  id: string;
  workspaceId: string;
  sessionId: string;
  deskId?: string;
  outputBasePath?: string;
  visibleUserIntent?: string;
  status: SessionActivityStatus | string;
  updatedAt: number;
  waitingCount: number;
  source: TaskLogSource;
};

function backendStatusToLabel(status: string): SessionActivityStatus | string {
  switch (status) {
    case "staged":
    case "running":
      return "thinking";
    case "waiting":
      return "waiting";
    case "completed":
      return "idle";
    case "failed":
      return "error";
    case "cancelled":
      return "idle";
    default:
      return status;
  }
}

export function useWorkflowTaskLog(
  workspaceId?: string,
  matterhornServerClient?: Pick<MatterhornServerClient, "listWorkflowRuns">,
): {
  logs: TaskLogEntry[];
  isLoading: boolean;
  error: string | null;
} {
  const [backendRuns, setBackendRuns] = useState<MatterhornWorkflowRunListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recordsByWorkspaceId = useSessionActivityStore((state) => state.recordsByWorkspaceId);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    if (!matterhornServerClient) {
      setBackendRuns([]);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLoading(true);
    matterhornServerClient
      .listWorkflowRuns({ workspaceId, limit: 20 })
      .then((json) => {
        if (cancelled) return;
        setBackendRuns(json.items ?? []);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [matterhornServerClient, workspaceId]);

  const localLogs = useMemo(() => {
    return Object.entries(recordsByWorkspaceId)
      .flatMap(([wsId, sessions]) =>
        Object.entries(sessions).map(([sessionId, record]) => ({
          id: `${wsId}:${sessionId}`,
          workspaceId: wsId,
          sessionId,
          status: record.status,
          updatedAt: record.updatedAt,
          waitingCount: record.waitingPermissionIds.length + record.waitingQuestionIds.length,
          source: "local" as TaskLogSource,
        })),
      )
      .filter((item) => item.updatedAt > 0);
  }, [recordsByWorkspaceId]);

  const logs = useMemo(() => {
    const backendLogs: TaskLogEntry[] = backendRuns.map((run) => ({
      id: run.workflowRunId,
      workspaceId: run.workspaceId,
      sessionId: run.sessionId,
      deskId: run.deskId,
      outputBasePath: run.outputBasePath,
      visibleUserIntent: run.visibleUserIntent,
      status: backendStatusToLabel(run.status),
      updatedAt: run.updatedAt,
      waitingCount: 0,
      source: "backend",
    }));

    // When backend data is available, use it as the primary source and fall back
    // to local records only for sessions the backend does not yet know about.
    const backendSessionKeys = new Set(backendLogs.map((log) => `${log.workspaceId}:${log.sessionId}`));
    const filteredLocal = backendLogs.length > 0
      ? localLogs.filter((log) => !backendSessionKeys.has(`${log.workspaceId}:${log.sessionId}`))
      : localLogs;

    return [...backendLogs, ...filteredLocal]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8);
  }, [backendRuns, localLogs]);

  return { logs, isLoading, error };
}
