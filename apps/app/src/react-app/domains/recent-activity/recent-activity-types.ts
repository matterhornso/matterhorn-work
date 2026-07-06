/**
 * Recent Activity normalization layer.
 *
 * Maps the raw server event model (MatterhornProjectEvidenceEvent) into a compact
 * UI-friendly form so the same rendering component can be used on both Home and
 * Settings/Profile without knowing about server internals.
 */

import type { MatterhornProjectEvidenceEvent } from "@matterhorn-work/types/project-evidence";

/** Compact UI activity kind — derived from server event types but surfaced as
 *  first-class union so consumers don't need to import project-evidence types. */
export type RecentActivityKind =
  | "note_created"
  | "memory_suggested"
  | "task_started"
  | "task_stage_started"
  | "task_output_saved"
  | "task_completed"
  | "task_failed"
  | "task_cancelled";

export interface RecentActivityItem {
  /** Stable identifier (original event id). */
  id: string;
  kind: RecentActivityKind;
  /** Primary label, already human-readable from the server. */
  title: string;
  /** Secondary detail — desk · sessionSlug or the event summary. */
  detail: string;
  /** ISO-8601 timestamp (can be passed directly to Date.parse). */
  timestamp: string;
  /** Desk slug when available. */
  desk?: string;
  source: MatterhornProjectEvidenceEvent["source"];
  sessionId?: string;
  sessionSlug?: string;
  taskId?: string;
  noteId?: string;
  outputPath?: string;
  artifactPaths?: string[];
  memorySuggestionStatus?: MatterhornProjectEvidenceEvent["memorySuggestionStatus"];
  /** Clickable route for this item (e.g. /workspace/ws1/notes). */
  href?: string;
}

const EVENT_TYPE_MAP: Record<MatterhornProjectEvidenceEvent["type"], RecentActivityKind> = {
  "note.created": "note_created",
  "note.memory_suggested": "memory_suggested",
  "task.started": "task_started",
  "task.stage_started": "task_stage_started",
  "task.output_saved": "task_output_saved",
  "task.completed": "task_completed",
  "task.failed": "task_failed",
  "task.cancelled": "task_cancelled",
};

/** Build a compact detail string: desk · sessionSlug or raw summary. */
function buildDetail(event: MatterhornProjectEvidenceEvent): string {
  if (event.desk || event.sessionSlug) {
    return [event.desk, event.sessionSlug].filter(Boolean).join(" · ");
  }
  return event.summary ?? "";
}

/**
 * Normalize an array of server evidence events into compact RecentActivityItems.
 * Returns items sorted by timestamp descending (newest first).
 */
export function normalizeEvidenceEvents(events: MatterhornProjectEvidenceEvent[]): RecentActivityItem[] {
  return events
    .map((event): RecentActivityItem => ({
      id: event.id,
      kind: EVENT_TYPE_MAP[event.type],
      title: event.title || "Untitled",
      detail: buildDetail(event),
      timestamp: event.timestamp,
      desk: event.desk,
      source: event.source,
      sessionId: event.sessionId,
      sessionSlug: event.sessionSlug,
      taskId: event.taskId,
      noteId: event.noteId,
      outputPath: event.outputPath,
      artifactPaths: event.artifactPaths,
      memorySuggestionStatus: event.memorySuggestionStatus,
      href: event.href,
    }))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}
