export const MATTERHORN_NOTE_VERSION = "matterhorn.note.v1" as const;

export const MATTERHORN_NOTE_LINK_KINDS = [
  "project",
  "desk",
  "session",
  "task",
  "output",
  "artifact",
  "memory_suggestion",
] as const;
export type MatterhornNoteLinkKind = (typeof MATTERHORN_NOTE_LINK_KINDS)[number];

export const MATTERHORN_NOTE_DESKS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "longevity",
  "wellness",
  "memory",
  "mcp",
  "generic_workspace",
] as const;
export type MatterhornNoteDesk = (typeof MATTERHORN_NOTE_DESKS)[number];

export const MATTERHORN_NOTE_SOURCES = [
  "manual",
  "quick_jot",
  "session",
  "workflow",
  "output",
] as const;
export type MatterhornNoteSource = (typeof MATTERHORN_NOTE_SOURCES)[number];

export interface MatterhornNoteLink {
  kind: MatterhornNoteLinkKind;
  id?: string;
  label?: string;
  path?: string;
  url?: string;
}

export interface MatterhornNote {
  version: typeof MATTERHORN_NOTE_VERSION;
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  tags: string[];
  links: MatterhornNoteLink[];
  desk?: MatterhornNoteDesk;
  sessionId?: string;
  taskId?: string;
  outputPath?: string;
  source: MatterhornNoteSource;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  memorySuggestionId?: string;
  memorySuggestionStatus?: "pending" | "confirmed" | "edited" | "dismissed" | "expired" | "blocked";
}

export interface MatterhornNoteCreateRequest {
  title?: string;
  body?: string;
  tags?: string[];
  links?: MatterhornNoteLink[];
  desk?: MatterhornNoteDesk | string | null;
  sessionId?: string | null;
  taskId?: string | null;
  outputPath?: string | null;
  source?: MatterhornNoteSource | string | null;
}

export interface MatterhornNoteUpdateRequest {
  title?: string;
  body?: string;
  tags?: string[];
  links?: MatterhornNoteLink[];
  desk?: MatterhornNoteDesk | string | null;
  sessionId?: string | null;
  taskId?: string | null;
  outputPath?: string | null;
  source?: MatterhornNoteSource | string | null;
}

export interface MatterhornNoteListOptions {
  query?: string;
  tags?: string[];
  desk?: MatterhornNoteDesk | string;
  sessionId?: string;
  taskId?: string;
  outputPath?: string;
  includeDeleted?: boolean;
  limit?: number;
}

export interface MatterhornNoteListResponse {
  success: true;
  items: MatterhornNote[];
  count: number;
}

export interface MatterhornNoteResponse {
  success: true;
  note: MatterhornNote;
}

export interface MatterhornNoteDeleteResponse {
  success: true;
  deleted: true;
  note: MatterhornNote;
}

export interface MatterhornNoteMemorySuggestionRequest {
  kind?: "project_fact" | "user_preference" | "decision" | "workflow_artifact";
  title?: string;
  summary?: string;
  tags?: string[];
  reason?: string;
}

export interface MatterhornNoteMemorySuggestionResponse {
  success: true;
  note: MatterhornNote;
  suggestionId: string;
  suggestionStatus: MatterhornNote["memorySuggestionStatus"];
  inbox: unknown;
}
