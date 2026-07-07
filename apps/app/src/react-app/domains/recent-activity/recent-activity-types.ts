/**
 * Recent Activity normalization layer.
 *
 * Maps the raw server event model (MatterhornProjectEvidenceEvent) into a compact
 * UI-friendly form so the same rendering component can be used on both Home and
 * Settings/Profile without knowing about server internals.
 */

import type { MatterhornProjectEvidenceEvent } from "@matterhorn-work/types/project-evidence";
import {
  nftReceiptMetadataFromEvidence,
  type NftReceiptMetadata,
} from "../project-evidence/nft-receipt-metadata";

/** Compact UI activity kind — derived from server event types but surfaced as
 *  first-class union so consumers don't need to import project-evidence types. */
export type RecentActivityKind =
  | "note_created"
  | "memory_suggested"
  | "task_started"
  | "task_stage_started"
  | "task_output_saved"
  | "task_output_deleted"
  | "task_completed"
  | "task_failed"
  | "task_cancelled"
  | "image_generated"
  | "image_failed"
  | "nft_draft_created"
  | "nft_minted"
  | "nft_listed";

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
  nftReceipt?: NftReceiptMetadata;
  /** Clickable route for this item (e.g. /workspace/ws1/notes). */
  href?: string;
}

const EVENT_TYPE_MAP: Record<MatterhornProjectEvidenceEvent["type"], RecentActivityKind> = {
  "note.created": "note_created",
  "note.memory_suggested": "memory_suggested",
  "task.started": "task_started",
  "task.stage_started": "task_stage_started",
  "task.output_saved": "task_output_saved",
  "task.output_deleted": "task_output_deleted",
  "task.completed": "task_completed",
  "task.failed": "task_failed",
  "task.cancelled": "task_cancelled",
  "image.generated": "image_generated",
  "image.failed": "image_failed",
  "nft.draft_created": "nft_draft_created",
  "nft.minted": "nft_minted",
  "nft.listed": "nft_listed",
};

/** Build a compact detail string: desk · sessionSlug or raw summary. */
function buildDetail(event: MatterhornProjectEvidenceEvent): string {
  if (event.desk || event.sessionSlug) {
    return [event.desk, event.sessionSlug].filter(Boolean).join(" · ");
  }
  return event.summary ?? "";
}

function isStartOnlyActivity(item: RecentActivityItem): boolean {
  return item.kind === "task_started" || item.kind === "task_stage_started";
}

function taskStartKey(item: RecentActivityItem): string {
  if (item.taskId) return `task:${item.taskId}`;
  if (item.sessionId) return `session:${item.desk ?? ""}:${item.sessionId}`;
  if (item.sessionSlug) return `slug:${item.desk ?? ""}:${item.sessionSlug}`;
  return "";
}

/**
 * Normalize an array of server evidence events into compact RecentActivityItems.
 * Returns items sorted by timestamp descending (newest first), with duplicate
 * task start/stage-start noise collapsed for Home and Settings summaries.
 */
export function normalizeEvidenceEvents(events: MatterhornProjectEvidenceEvent[]): RecentActivityItem[] {
  const sorted = events
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
      nftReceipt: nftReceiptMetadataFromEvidence(event.metadata),
      href: event.href,
    }))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const taskStartedKeys = new Set(
    sorted
      .filter((item) => item.kind === "task_started")
      .map(taskStartKey)
      .filter(Boolean),
  );
  const emittedStartKeys = new Set<string>();

  return sorted.filter((item) => {
    if (!isStartOnlyActivity(item)) return true;

    const key = taskStartKey(item);
    if (!key) return true;

    if (item.kind === "task_stage_started" && taskStartedKeys.has(key)) {
      return false;
    }

    if (emittedStartKeys.has(key)) {
      return false;
    }
    emittedStartKeys.add(key);
    return true;
  });
}
