import {
  MATTERHORN_EXECUTION_MODE_OPTIONS,
  buildMatterhornExecutionModeSystemPrompt,
  buildMatterhornExecutionModeTools,
  normalizeMatterhornExecutionMode,
  type MatterhornExecutionMode,
} from "@matterhorn-work/types/execution-mode";

export {
  MATTERHORN_EXECUTION_MODE_OPTIONS,
  buildMatterhornExecutionModeSystemPrompt,
  buildMatterhornExecutionModeTools,
  type MatterhornExecutionMode,
};

const STORAGE_PREFIX = "matterhorn.execution-mode.v1";

function storageKey(workspaceId: string, sessionId: string) {
  return `${STORAGE_PREFIX}:${workspaceId}:${sessionId}`;
}

export function executionModesEnabled() {
  return import.meta.env.VITE_MATTERHORN_EXECUTION_MODES !== "0";
}

export function readMatterhornExecutionMode(
  workspaceId: string,
  sessionId: string | null,
): MatterhornExecutionMode {
  if (!executionModesEnabled() || !workspaceId || !sessionId || typeof window === "undefined") return "work";
  try {
    return normalizeMatterhornExecutionMode(window.localStorage.getItem(storageKey(workspaceId, sessionId)));
  } catch {
    return "work";
  }
}

export function writeMatterhornExecutionMode(
  workspaceId: string,
  sessionId: string | null,
  mode: MatterhornExecutionMode,
) {
  if (!executionModesEnabled() || !workspaceId || !sessionId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(workspaceId, sessionId), mode);
  } catch {
    // Storage is optional; the active chat still keeps its in-memory mode.
  }
}
