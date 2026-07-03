import { useCallback, useEffect, useMemo, useState } from "react";

import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import type {
  MatterhornNoteCreateRequest,
  MatterhornNoteUpdateRequest,
} from "@matterhorn-work/types";
import { useNotesServerClient } from "./notes-server-client";
import type {
  MatterhornNote,
  NoteDraftInput,
  NoteFilterId,
  NoteUpdateInput,
} from "./notes-types";
import { noteAttachmentFields, noteFilterMatches, noteTimestampMs } from "./notes-types";

export const NOTES_UPDATED_EVENT = "matterhorn:notes-updated";

export type NotesUpdatedEventDetail = {
  workspaceId?: string;
};

export function dispatchNotesUpdated(workspaceId?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotesUpdatedEventDetail>(NOTES_UPDATED_EVENT, {
      detail: { workspaceId },
    }),
  );
}

export function normalizeTags(raw: string[] | undefined): string[] {
  return (raw ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, self) => self.indexOf(tag) === index);
}

export function noteDraftToCreateRequest(
  input: NoteDraftInput,
  source: MatterhornNoteCreateRequest["source"] = "manual",
): MatterhornNoteCreateRequest {
  const fields = noteAttachmentFields(input.attachment);
  return {
    title: (input.title ?? "").trim(),
    body: (input.body ?? "").trim(),
    tags: normalizeTags(input.tags),
    links: fields.links ?? [],
    desk: fields.desk,
    sessionId: fields.sessionId,
    taskId: fields.taskId,
    outputPath: fields.outputPath,
    source,
  };
}

export function notePatchToUpdateRequest(patch: NoteUpdateInput): MatterhornNoteUpdateRequest {
  const next: MatterhornNoteUpdateRequest = {};

  if (patch.title !== undefined) next.title = patch.title;
  if (patch.body !== undefined) next.body = patch.body;
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);

  if ("attachment" in patch) {
    const fields = noteAttachmentFields(patch.attachment ?? null);
    next.links = fields.links ?? [];
    next.desk = fields.desk;
    next.sessionId = fields.sessionId;
    next.taskId = fields.taskId;
    next.outputPath = fields.outputPath;
  }

  return next;
}

export function filterNotes(
  notes: MatterhornNote[],
  options: { query?: string; filterId?: NoteFilterId },
): MatterhornNote[] {
  const query = (options.query ?? "").trim().toLowerCase();
  const filterId = options.filterId ?? "all";
  return notes.filter((note) => {
    if (!noteFilterMatches(filterId, note)) return false;
    if (!query) return true;
    const haystack = `${note.title}\n${note.body}\n${note.tags.join(" ")}`.toLowerCase();
    return haystack.includes(query);
  });
}

function sortNotes(notes: MatterhornNote[]): MatterhornNote[] {
  return [...notes].sort(
    (a, b) => noteTimestampMs(b.updatedAt) - noteTimestampMs(a.updatedAt),
  );
}

function upsertNote(notes: MatterhornNote[], note: MatterhornNote): MatterhornNote[] {
  return sortNotes([note, ...notes.filter((item) => item.id !== note.id)]);
}

export type NotesStoreState = {
  notes: MatterhornNote[];
  loading: boolean;
  error: string | null;
  create: (input: NoteDraftInput) => Promise<MatterhornNote | null>;
  update: (noteId: string, patch: NoteUpdateInput) => Promise<MatterhornNote | null>;
  remove: (noteId: string) => Promise<boolean>;
  suggestMemory: (noteId: string) => Promise<MatterhornNote | null>;
  refresh: () => Promise<void>;
};

export function useNotesStore(
  workspaceId: string,
  explicitClient?: MatterhornServerClient | null,
): NotesStoreState {
  const client = useNotesServerClient(explicitClient);
  const [notes, setNotes] = useState<MatterhornNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const id = workspaceId.trim();
    if (!id) {
      setNotes([]);
      setError(null);
      return;
    }

    if (!client) {
      setNotes([]);
      setError("Matterhorn server is not connected.");
      return;
    }

    setLoading(true);
    try {
      const response = await client.listNotes(id);
      setNotes(sortNotes(response.items));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Could not load notes.");
    } finally {
      setLoading(false);
    }
  }, [client, workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onNotesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<NotesUpdatedEventDetail>).detail;
      if (!detail?.workspaceId || detail.workspaceId === workspaceId.trim()) {
        void refresh();
      }
    };
    window.addEventListener(NOTES_UPDATED_EVENT, onNotesUpdated);
    return () => window.removeEventListener(NOTES_UPDATED_EVENT, onNotesUpdated);
  }, [workspaceId, refresh]);

  const create = useCallback<NotesStoreState["create"]>(
    async (input) => {
      const id = workspaceId.trim();
      if (!id || !client) return null;
      try {
        const response = await client.createNote(id, noteDraftToCreateRequest(input, "manual"));
        setNotes((current) => upsertNote(current, response.note));
        setError(null);
        dispatchNotesUpdated(id);
        return response.note;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Could not save note.");
        return null;
      }
    },
    [client, workspaceId],
  );

  const update = useCallback<NotesStoreState["update"]>(
    async (noteId, patch) => {
      const id = workspaceId.trim();
      if (!id || !client) return null;
      try {
        const response = await client.updateNote(id, noteId, notePatchToUpdateRequest(patch));
        setNotes((current) => upsertNote(current, response.note));
        setError(null);
        dispatchNotesUpdated(id);
        return response.note;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Could not update note.");
        return null;
      }
    },
    [client, workspaceId],
  );

  const remove = useCallback<NotesStoreState["remove"]>(
    async (noteId) => {
      const id = workspaceId.trim();
      if (!id || !client) return false;
      try {
        await client.deleteNote(id, noteId);
        setNotes((current) => current.filter((item) => item.id !== noteId));
        setError(null);
        dispatchNotesUpdated(id);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Could not delete note.");
        return false;
      }
    },
    [client, workspaceId],
  );

  const suggestMemory = useCallback<NotesStoreState["suggestMemory"]>(
    async (noteId) => {
      const id = workspaceId.trim();
      if (!id || !client) return null;
      try {
        const response = await client.suggestMemoryFromNote(id, noteId);
        setNotes((current) => upsertNote(current, response.note));
        setError(null);
        dispatchNotesUpdated(id);
        return response.note;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Could not suggest this note to Memory.");
        return null;
      }
    },
    [client, workspaceId],
  );

  return useMemo(
    () => ({
      notes,
      loading,
      error,
      create,
      update,
      remove,
      suggestMemory,
      refresh,
    }),
    [notes, loading, error, create, update, remove, suggestMemory, refresh],
  );
}
