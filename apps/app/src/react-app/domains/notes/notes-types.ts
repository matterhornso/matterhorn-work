import { t } from "@/i18n";
import type {
  MatterhornNote as ServerMatterhornNote,
  MatterhornNoteCreateRequest,
  MatterhornNoteDesk,
  MatterhornNoteLink,
  MatterhornNoteUpdateRequest,
} from "@matterhorn-work/types";

export type MatterhornNote = Omit<ServerMatterhornNote, "createdAt" | "updatedAt"> & {
  /** Server notes use ISO timestamps; helper tests may still use epoch millis. */
  createdAt: string | number;
  updatedAt: string | number;
  /** Client-side flag set when the user has suggested this note to Memory. */
  suggestedToMemory?: boolean;
};

export type NoteAttachmentType = "desk" | "session" | "task" | "output";

export type NoteDeskAttachment = {
  type: "desk";
  id: MatterhornNoteDesk | string;
  label: string;
};

export type NoteSessionAttachment = {
  type: "session";
  id: string;
  label: string;
};

export type NoteTaskAttachment = {
  type: "task";
  id: string;
  label: string;
};

export type NoteOutputAttachment = {
  type: "output";
  id: string;
  label: string;
};

export type NoteAttachment =
  | NoteDeskAttachment
  | NoteSessionAttachment
  | NoteTaskAttachment
  | NoteOutputAttachment;

export const NOTE_DESK_FILTER_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
  "longevity",
] as const;

export type NoteDeskFilterId = (typeof NOTE_DESK_FILTER_IDS)[number];

export const NOTE_FILTER_IDS = [
  "all",
  ...NOTE_DESK_FILTER_IDS,
  "outputs",
  "memory-suggested",
] as const;

export type NoteFilterId = (typeof NOTE_FILTER_IDS)[number];

export type NoteFilter = {
  id: NoteFilterId;
  label: string;
  shortLabel?: string;
};

export const NOTE_FILTERS: NoteFilter[] = [
  { id: "all", label: "notes.filter_all" },
  { id: "bittensor", label: "notes.filter_bittensor" },
  { id: "hyperliquid", label: "notes.filter_hyperliquid" },
  { id: "polymarket", label: "notes.filter_polymarket" },
  { id: "sui", label: "notes.filter_sui" },
  { id: "longevity", label: "notes.filter_longevity" },
  { id: "outputs", label: "notes.filter_outputs" },
  { id: "memory-suggested", label: "notes.filter_memory_suggested" },
];

export type NoteDraftInput = {
  title?: string;
  body?: string;
  tags?: string[];
  attachment?: NoteAttachment;
};

export type NoteUpdateInput = {
  title?: string;
  body?: string;
  tags?: string[];
  attachment?: NoteAttachment | null;
};

export function noteAttachmentToLink(attachment: NoteAttachment): MatterhornNoteLink {
  switch (attachment.type) {
    case "desk":
      return { kind: "desk", id: attachment.id, label: attachment.label };
    case "session":
      return { kind: "session", id: attachment.id, label: attachment.label };
    case "task":
      return { kind: "task", id: attachment.id, label: attachment.label };
    case "output":
      return { kind: "output", id: attachment.id, path: attachment.id, label: attachment.label };
  }
}

export function noteAttachmentFields(
  attachment: NoteAttachment | null | undefined,
): Pick<MatterhornNoteCreateRequest & MatterhornNoteUpdateRequest, "desk" | "sessionId" | "taskId" | "outputPath" | "links"> {
  if (!attachment) {
    return {
      desk: null,
      sessionId: null,
      taskId: null,
      outputPath: null,
      links: [],
    };
  }

  return {
    desk: attachment.type === "desk" ? attachment.id : null,
    sessionId: attachment.type === "session" ? attachment.id : null,
    taskId: attachment.type === "task" ? attachment.id : null,
    outputPath: attachment.type === "output" ? attachment.id : null,
    links: [noteAttachmentToLink(attachment)],
  };
}

export function noteToAttachment(note: MatterhornNote): NoteAttachment | undefined {
  const directLink = note.links.find((link) =>
    link.kind === "desk" ||
    link.kind === "session" ||
    link.kind === "task" ||
    link.kind === "output" ||
    link.kind === "artifact"
  );
  if (directLink) {
    if (directLink.kind === "desk" && directLink.id) {
      return { type: "desk", id: directLink.id, label: directLink.label ?? directLink.id };
    }
    if (directLink.kind === "session" && directLink.id) {
      return { type: "session", id: directLink.id, label: directLink.label ?? t("notes.attachment_type_session") };
    }
    if (directLink.kind === "task" && directLink.id) {
      return { type: "task", id: directLink.id, label: directLink.label ?? t("notes.attachment_type_task") };
    }
    if ((directLink.kind === "output" || directLink.kind === "artifact") && (directLink.path ?? directLink.id)) {
      const id = directLink.path ?? directLink.id ?? "";
      return { type: "output", id, label: directLink.label ?? id };
    }
  }

  if (note.outputPath) return { type: "output", id: note.outputPath, label: note.outputPath };
  if (note.taskId) return { type: "task", id: note.taskId, label: t("notes.attachment_type_task") };
  if (note.sessionId) return { type: "session", id: note.sessionId, label: t("notes.attachment_type_session") };
  if (note.desk) return { type: "desk", id: note.desk, label: deskLabel(note.desk) };
  return undefined;
}

export function noteSuggestedToMemory(note: MatterhornNote): boolean {
  return Boolean(note.suggestedToMemory || note.memorySuggestionId || note.memorySuggestionStatus);
}

export function noteTimestampMs(value: string | number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function noteFilterMatches(filterId: NoteFilterId, note: MatterhornNote): boolean {
  if (filterId === "all") return true;
  if (filterId === "memory-suggested") return noteSuggestedToMemory(note);
  if (filterId === "outputs") {
    return Boolean(note.outputPath || note.links.some((link) => link.kind === "output" || link.kind === "artifact"));
  }
  if (filterId === "longevity") return note.desk === "longevity" || note.desk === "wellness";
  return note.desk === filterId;
}

function deskLabel(desk: string): string {
  if (desk === "bittensor") return "Bittensor";
  if (desk === "hyperliquid") return "Hyperliquid";
  if (desk === "polymarket") return "Polymarket";
  if (desk === "sui") return "Sui";
  if (desk === "longevity" || desk === "wellness") return "Longevity";
  if (desk === "memory") return "Memory";
  if (desk === "mcp") return "MCP";
  return desk
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
