export { NotesPage, type NotesPageProps } from "./notes-page";
export { QuickJotProvider, useQuickJotContext } from "./quick-jot-provider";
export { useQuickJot } from "./use-quick-jot";
export { QuickJotSheet, type QuickJotSheetProps } from "./quick-jot-sheet";
export { QuickJotGlobal } from "./quick-jot-global";
export { NoteAttachmentChip, type NoteAttachmentChipProps } from "./note-attachment-chip";
export { NotesEmptyState, type NotesEmptyStateProps } from "./notes-empty-state";
export { sendNoteToMemory, type SendNoteToMemoryResult } from "./send-note-to-memory";
export { createFallbackNotesClient, useNotesServerClient } from "./notes-server-client";
export {
  NOTES_UPDATED_EVENT,
  dispatchNotesUpdated,
  normalizeTags,
  noteDraftToCreateRequest,
  notePatchToUpdateRequest,
  filterNotes,
  useNotesStore,
} from "./notes-store";
export type {
  MatterhornNote,
  NoteAttachment,
  NoteAttachmentType,
  NoteDeskAttachment,
  NoteSessionAttachment,
  NoteTaskAttachment,
  NoteOutputAttachment,
  NoteFilter,
  NoteFilterId,
  NoteDeskFilterId,
} from "./notes-types";
export { NOTE_FILTERS, NOTE_FILTER_IDS, NOTE_DESK_FILTER_IDS, noteFilterMatches } from "./notes-types";
