import type {
  MatterhornWorkflowRun,
  MatterhornWorkflowRunEvent,
  MatterhornWorkflowRunEventType,
  MatterhornWorkflowRunStatus,
  MatterhornWorkflowRunStageInput,
} from "@matterhorn-work/types/workflow-runs";
import { shortId } from "./utils.js";

export type {
  MatterhornWorkflowRun,
  MatterhornWorkflowRunEvent,
  MatterhornWorkflowRunEventType,
  MatterhornWorkflowRunStatus,
  MatterhornWorkflowRunStageInput,
};

export function createWorkflowRunId(): string {
  return `run_${shortId()}`;
}

export function createWorkflowRunEventId(): string {
  return `evt_${shortId()}`;
}

export function makeOutputBasePath(deskId: string, sessionSlug: string): string {
  const safeDeskId = deskId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeSessionSlug = sessionSlug.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `outputs/${safeDeskId}/${safeSessionSlug}/`;
}

export function normalizeSessionSlug(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "session";
}

export function isValidWorkflowRunStatus(value: unknown): value is MatterhornWorkflowRunStatus {
  return (
    typeof value === "string" &&
    ["staged", "running", "waiting", "completed", "failed", "cancelled"].includes(value)
  );
}

export function canTransitionTo(
  current: MatterhornWorkflowRunStatus,
  next: MatterhornWorkflowRunStatus,
): boolean {
  const terminal: MatterhornWorkflowRunStatus[] = ["completed", "failed", "cancelled"];
  if (terminal.includes(current)) return false;
  if (current === "staged" && next === "running") return true;
  if (current === "running" && ["waiting", "completed", "failed", "cancelled"].includes(next)) {
    return true;
  }
  if (current === "waiting" && ["running", "completed", "failed", "cancelled"].includes(next)) {
    return true;
  }
  return false;
}
