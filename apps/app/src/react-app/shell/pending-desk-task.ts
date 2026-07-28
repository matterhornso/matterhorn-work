export const pendingDeskTaskDeskIds = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
  "wellness",
] as const;

export type PendingDeskTaskId = (typeof pendingDeskTaskDeskIds)[number];

export type PendingDeskTaskNavigation = {
  deskId: PendingDeskTaskId;
  title: string;
};

const STORAGE_PREFIX = "matterhorn.pending-desk-task.v1";
export const PENDING_DESK_TASK_RETURN_PARAM = "resumeDeskTask";

const pendingDeskTaskReturnTitles: Record<PendingDeskTaskId, string> = {
  bittensor: "Bittensor desk",
  hyperliquid: "Hyperliquid desk",
  polymarket: "Polymarket desk",
  sui: "Sui desk",
  wellness: "Longevity desk",
};

export function isPendingDeskTaskId(value: unknown): value is PendingDeskTaskId {
  return typeof value === "string" && pendingDeskTaskDeskIds.includes(value as PendingDeskTaskId);
}

function normalizePendingDeskTask(value: unknown): PendingDeskTaskNavigation | null {
  if (!value || typeof value !== "object") return null;
  const deskId = (value as { deskId?: unknown }).deskId;
  const title = (value as { title?: unknown }).title;
  if (!isPendingDeskTaskId(deskId) || typeof title !== "string") return null;
  const normalizedTitle = title.trim().slice(0, 160);
  return normalizedTitle ? { deskId, title: normalizedTitle } : null;
}

export function readPendingDeskTaskNavigation(
  state: unknown,
): PendingDeskTaskNavigation | null {
  if (!state || typeof state !== "object") return null;
  return normalizePendingDeskTask((state as { pendingDeskTask?: unknown }).pendingDeskTask);
}

function storageKey(workspaceId: string) {
  return `${STORAGE_PREFIX}:${workspaceId.trim()}`;
}

/**
 * Retains the smallest possible first-run handoff while someone chooses a
 * model. Prompts remain in the normal draft store and are never copied here.
 */
export function writePendingDeskTask(
  workspaceId: string,
  task: PendingDeskTaskNavigation,
) {
  if (typeof window === "undefined" || !workspaceId.trim()) return;
  try {
    window.sessionStorage.setItem(storageKey(workspaceId), JSON.stringify(task));
  } catch {
    // Private browsing or a full storage quota should not block model setup.
  }
}

export function readStoredPendingDeskTask(
  workspaceId: string,
): PendingDeskTaskNavigation | null {
  if (typeof window === "undefined" || !workspaceId.trim()) return null;
  try {
    const value = window.sessionStorage.getItem(storageKey(workspaceId));
    return value ? normalizePendingDeskTask(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}

export function clearPendingDeskTask(workspaceId: string) {
  if (typeof window === "undefined" || !workspaceId.trim()) return;
  try {
    window.sessionStorage.removeItem(storageKey(workspaceId));
  } catch {
    // Clearing the optional recovery hint is best-effort.
  }
}

/**
 * The return route carries only the desk identifier. The original draft and
 * any typed context remain out of the URL and are never auto-submitted.
 */
export function readPendingDeskTaskReturn(
  search: string,
): PendingDeskTaskNavigation | null {
  try {
    const deskId = new URLSearchParams(search).get(PENDING_DESK_TASK_RETURN_PARAM);
    if (!isPendingDeskTaskId(deskId)) return null;
    return {
      deskId,
      title: pendingDeskTaskReturnTitles[deskId],
    };
  } catch {
    return null;
  }
}
