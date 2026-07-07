import type { MatterhornNote } from "./notes.js";

export const MATTERHORN_PROJECT_EVIDENCE_EVENT_TYPES = [
  "note.created",
  "note.memory_suggested",
  "task.started",
  "task.stage_started",
  "task.output_saved",
  "task.output_deleted",
  "task.completed",
  "task.failed",
  "task.cancelled",
  "image.generated",
  "image.failed",
  "nft.draft_created",
  "nft.minted",
  "nft.listed",
] as const;

export type MatterhornProjectEvidenceEventType =
  (typeof MATTERHORN_PROJECT_EVIDENCE_EVENT_TYPES)[number];

export type MatterhornProjectEvidenceSource =
  | "notes"
  | "memory"
  | "task_events"
  | "task_runs";

export interface MatterhornProjectEvidenceEvent {
  id: string;
  workspaceId: string;
  type: MatterhornProjectEvidenceEventType;
  source: MatterhornProjectEvidenceSource;
  timestamp: string;
  title: string;
  summary?: string;
  desk?: string;
  sessionId?: string;
  sessionSlug?: string;
  taskId?: string;
  noteId?: string;
  outputPath?: string;
  artifactPaths?: string[];
  memorySuggestionId?: string;
  memorySuggestionStatus?: MatterhornNote["memorySuggestionStatus"];
  href?: string;
}

export interface MatterhornProjectEvidenceListOptions {
  limit?: number;
  desk?: string;
  sessionId?: string;
  taskId?: string;
  source?: MatterhornProjectEvidenceSource;
}

export interface MatterhornProjectEvidenceSummary {
  notes: number;
  memorySuggestions: number;
  taskEvents: number;
  taskRuns: number;
  outputs: number;
  images: number;
  nfts: number;
}

export interface MatterhornProjectEvidenceResponse {
  success: true;
  items: MatterhornProjectEvidenceEvent[];
  count: number;
  summary: MatterhornProjectEvidenceSummary;
}
