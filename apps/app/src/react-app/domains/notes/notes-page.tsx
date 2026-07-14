/** @jsxImportSource react */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Brain, Filter, Loader2, Plus, Search, Trash2 } from "lucide-react";

import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConfirmModal } from "../../design-system/modals/confirm-modal";
import { ACTIVE_WORKSPACE_CHANGED_EVENT, readActiveWorkspaceId } from "../../shell/session-memory";
import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import { ErrorState } from "../shell/error-state";
import { useStatusToasts } from "../shell-feedback/status-toasts";
import { NoteAttachmentChip } from "./note-attachment-chip";
import { NotesEmptyState } from "./notes-empty-state";
import { useNotesServerClient } from "./notes-server-client";
import { filterNotes, useNotesStore } from "./notes-store";
import type { MatterhornNote, NoteAttachment, NoteFilterId } from "./notes-types";
import { NOTE_FILTERS, noteSuggestedToMemory, noteTimestampMs, noteToAttachment } from "./notes-types";

export type NotesPageProps = {
  client?: MatterhornServerClient | null;
  workspaceId?: string | null;
};

type NoteDraft = {
  title: string;
  body: string;
  tags: string;
};

function formatNoteTimestamp(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

function tagInputToTags(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, self) => self.indexOf(tag) === index);
}

function draftFromNote(note: MatterhornNote): NoteDraft {
  return { title: note.title, body: note.body, tags: note.tags.join(", ") };
}

function NoteListAttachment({ note }: { note: MatterhornNote }) {
  const attachment = noteToAttachment(note);
  if (!attachment) return null;
  return <NoteAttachmentChip attachment={attachment} />;
}

export function NotesPage({ client, workspaceId: explicitWorkspaceId }: NotesPageProps) {
  const { showToast } = useStatusToasts();
  const notesClient = useNotesServerClient(client);
  const params = useParams<{ workspaceId?: string }>();
  const routeWorkspaceId = params.workspaceId?.trim() ?? "";
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => readActiveWorkspaceId() ?? "");
  const workspaceId = explicitWorkspaceId?.trim() || routeWorkspaceId || activeWorkspaceId;
  const { notes, loading, error, create, update, remove, suggestMemory, refresh } = useNotesStore(workspaceId, notesClient);
  const [query, setQuery] = useState("");
  const [filterId, setFilterId] = useState<NoteFilterId>("all");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft>({ title: "", body: "", tags: "" });
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    setSelectedNoteId(null);
    setDraft({ title: "", body: "", tags: "" });
  }, [workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refreshActiveWorkspace = () => setActiveWorkspaceId(readActiveWorkspaceId() ?? "");
    window.addEventListener("storage", refreshActiveWorkspace);
    window.addEventListener(ACTIVE_WORKSPACE_CHANGED_EVENT, refreshActiveWorkspace);
    return () => {
      window.removeEventListener("storage", refreshActiveWorkspace);
      window.removeEventListener(ACTIVE_WORKSPACE_CHANGED_EVENT, refreshActiveWorkspace);
    };
  }, []);

  const filteredNotes = useMemo(
    () => filterNotes(notes, { query, filterId }),
    [notes, query, filterId],
  );
  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );
  const selectedAttachment = useMemo<NoteAttachment | undefined>(
    () => (selectedNote ? noteToAttachment(selectedNote) : undefined),
    [selectedNote],
  );
  const draftTags = useMemo(() => tagInputToTags(draft.tags), [draft.tags]);
  const draftDirty = Boolean(selectedNote && (
    draft.title !== selectedNote.title ||
    draft.body !== selectedNote.body ||
    draftTags.join("\n") !== selectedNote.tags.join("\n")
  ));

  const saveDraft = useCallback(async () => {
    if (!selectedNote || !draftDirty) return true;
    setSaving(true);
    const saved = await update(selectedNote.id, {
      title: draft.title,
      body: draft.body,
      tags: draftTags,
    });
    setSaving(false);
    if (!saved) {
      showToast({
        title: "Could not save note",
        description: error ?? "Your edits are still visible. Try again after reconnecting.",
        tone: "error",
      });
      return false;
    }
    return true;
  }, [draft, draftDirty, draftTags, error, selectedNote, showToast, update]);
  const saveDraftRef = useRef(saveDraft);
  useEffect(() => {
    saveDraftRef.current = saveDraft;
  }, [saveDraft]);
  useEffect(() => () => {
    void saveDraftRef.current();
  }, []);
  useEffect(() => {
    if (!draftDirty || !selectedNote) return undefined;
    const timer = window.setTimeout(() => {
      void saveDraft();
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draftDirty, draft.title, draft.body, draft.tags, saveDraft, selectedNote]);

  const handleCreateNote = useCallback(async () => {
    if (!workspaceId.trim()) {
      showToast({
        title: t("notes.no_project_selected_title"),
        description: t("notes.no_project_selected_description"),
        tone: "warning",
      });
      return;
    }
    const note = await create({ title: t("notes.untitled"), body: "" });
    if (!note) {
      showToast({
        title: "Could not create note",
        description: error ?? "Check the workspace connection and try again.",
        tone: "error",
      });
      return;
    }
    setDraft(draftFromNote(note));
    setSelectedNoteId(note.id);
  }, [create, error, showToast, workspaceId]);

  const openNote = useCallback((note: MatterhornNote) => {
    setDraft(draftFromNote(note));
    setSelectedNoteId(note.id);
  }, []);

  const closeEditor = useCallback(async () => {
    await saveDraft();
    setSelectedNoteId(null);
  }, [saveDraft]);

  const handleSuggestMemory = useCallback(async () => {
    if (!selectedNote) return;
    if (!(await saveDraft())) return;
    const next = await suggestMemory(selectedNote.id);
    if (next) {
      showToast({
        title: t("notes.send_memory_success_title"),
        description: "Sent to Memory inbox for review. It is not remembered yet.",
        tone: "success",
      });
    } else {
      showToast({
        title: t("notes.send_memory_failed_title"),
        description: error ?? "Could not send this note to Memory review.",
        tone: "error",
      });
    }
  }, [error, saveDraft, selectedNote, showToast, suggestMemory]);

  const confirmDelete = useCallback(async () => {
    if (!selectedNote) return;
    const deleted = await remove(selectedNote.id);
    setDeleteOpen(false);
    if (deleted) {
      setSelectedNoteId(null);
      return;
    }
    showToast({
      title: "Could not delete note",
      description: error ?? "Check the workspace connection and try again.",
      tone: "error",
    });
  }, [error, remove, selectedNote, showToast]);

  if (!workspaceId.trim()) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-dls-background px-6 py-12 text-center">
        <NotesEmptyState
          title={t("notes.empty_no_project_title")}
          description={t("notes.empty_no_project_description")}
        />
      </div>
    );
  }

  if (selectedNote) {
    return (
      <div aria-label="Notes editor" role="region" className="matterhorn-rail-content flex h-full min-h-0 flex-col bg-dls-background">
        <header className="flex h-11 shrink-0 items-center gap-1 px-2 shadow-[0_1px_0_rgba(var(--matterhorn-blue-rgb),0.08)]">
          <Tooltip>
            <TooltipTrigger render={(
              <Button variant="ghost" size="icon-sm" onClick={() => void closeEditor()} aria-label="Back to notes">
                <ArrowLeft className="size-4" />
              </Button>
            )} />
            <TooltipContent>Back to notes</TooltipContent>
          </Tooltip>
          <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-dls-text">
            {draft.title.trim() || t("notes.untitled")}
          </span>
          {saving ? (
            <span className="flex items-center gap-1.5 px-1 text-[11px] text-dls-secondary">
              <Loader2 className="size-3 animate-spin" />
              Saving
            </span>
          ) : null}
          {!noteSuggestedToMemory(selectedNote) ? (
            <Tooltip>
              <TooltipTrigger render={(
                <Button variant="ghost" size="icon-sm" onClick={() => void handleSuggestMemory()} aria-label={t("notes.suggest_memory")}>
                  <Brain className="size-4" />
                </Button>
              )} />
              <TooltipContent>{t("notes.suggest_memory")}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger render={(
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-dls-secondary hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                aria-label={t("notes.delete_note")}
              >
                <Trash2 className="size-4" />
              </Button>
            )} />
            <TooltipContent>{t("notes.delete_note")}</TooltipContent>
          </Tooltip>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder={t("notes.note_title_placeholder")}
            className="w-full bg-transparent text-lg font-semibold leading-7 text-dls-text outline-none placeholder:text-dls-muted"
          />
          <textarea
            value={draft.body}
            onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
            placeholder={t("notes.write_placeholder")}
            className="mt-3 min-h-[16rem] w-full resize-none bg-transparent text-sm leading-6 text-dls-text outline-none placeholder:text-dls-muted"
          />

          <div className="mt-4 grid gap-3">
            {selectedAttachment ? (
              <NoteAttachmentChip
                attachment={selectedAttachment}
                onRemove={() => {
                  void saveDraft().then((saved) => {
                    if (saved) void update(selectedNote.id, { attachment: null });
                  });
                }}
              />
            ) : null}
            <details className="group">
              <summary className="cursor-pointer list-none text-xs font-medium text-dls-secondary hover:text-dls-text">
                Tags{draftTags.length ? ` (${draftTags.length})` : ""}
              </summary>
              <input
                value={draft.tags}
                onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
                placeholder={t("notes.tags_placeholder")}
                className="mt-2 h-9 w-full rounded-md bg-dls-surface-muted/[0.22] px-3 text-xs text-dls-text outline-none transition-colors placeholder:text-dls-muted hover:bg-dls-surface-muted/[0.26] focus:bg-dls-surface-muted/[0.28] focus:ring-1 focus:ring-[rgba(var(--dls-accent-rgb),0.32)]"
              />
            </details>
            <div className="flex items-center justify-between gap-3 text-[11px] text-dls-muted">
              <span>{formatNoteTimestamp(noteTimestampMs(selectedNote.updatedAt))}</span>
              {noteSuggestedToMemory(selectedNote) ? <span>In Memory review</span> : null}
            </div>
          </div>
        </div>

        <ConfirmModal
          open={deleteOpen}
          title="Delete note?"
          message={`Delete “${selectedNote.title.trim() || t("notes.untitled")}” from this project.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteOpen(false)}
        />
      </div>
    );
  }

  return (
    <div aria-label="Notes panel" role="region" className="matterhorn-rail-content flex h-full min-h-0 flex-col bg-dls-background">
      <header className="grid shrink-0 gap-3 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-dls-text">{t("notes.page_title")}</h1>
            <p className="mt-0.5 text-xs leading-5 text-dls-secondary">
              {t("notes.page_description")}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger render={(
              <Button type="button" size="icon-sm" onClick={() => void handleCreateNote()} aria-label={t("notes.create_note")}>
                <Plus className="size-4" />
              </Button>
            )} />
            <TooltipContent>{t("notes.create_note")}</TooltipContent>
          </Tooltip>
        </div>

        {notes.length > 0 ? (
          <div className="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
            <label className="relative min-w-0">
              <span className="sr-only">{t("notes.search_placeholder")}</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-dls-muted" />
              <input
                placeholder={t("notes.search_placeholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 w-full rounded-md bg-dls-surface-muted/[0.22] pl-8 pr-2 text-xs text-dls-text outline-none transition-colors placeholder:text-dls-muted hover:bg-dls-surface-muted/[0.26] focus:bg-dls-surface-muted/[0.28] focus:ring-1 focus:ring-[rgba(var(--dls-accent-rgb),0.32)]"
              />
            </label>
            <label className="relative min-w-0">
              <span className="sr-only">Filter notes</span>
              <Filter className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-dls-muted" />
              <select
                value={filterId}
                onChange={(event) => setFilterId(event.target.value as NoteFilterId)}
                className="h-9 w-full appearance-none rounded-md bg-dls-surface-muted/[0.22] pl-8 pr-2 text-xs text-dls-text outline-none transition-colors hover:bg-dls-surface-muted/[0.26] focus:bg-dls-surface-muted/[0.28] focus:ring-1 focus:ring-[rgba(var(--dls-accent-rgb),0.32)]"
                aria-label="Filter notes"
              >
                {NOTE_FILTERS.map((filter) => (
                  <option key={filter.id} value={filter.id}>{t(filter.label)}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {error ? (
          <ErrorState
            error={error}
            title="Could not load notes"
            onRetry={() => void refresh()}
            className="rounded-md bg-destructive/10 px-3 py-2"
          />
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading && notes.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-xs text-dls-secondary">
            <Loader2 className="size-3.5 animate-spin" />
            {t("notes.loading")}
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <NotesEmptyState
              title={notes.length === 0 ? t("notes.empty_no_notes_title") : t("notes.empty_no_matches_title")}
              description={notes.length === 0 ? t("notes.empty_no_notes_description") : t("notes.empty_no_matches_description")}
            />
            {notes.length === 0 ? (
              <Button type="button" size="sm" onClick={() => void handleCreateNote()}>
                <Plus className="size-4" />
                {t("notes.create_first_note")}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-0.5">
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => openNote(note)}
                className="grid min-w-0 gap-1 rounded-md bg-dls-surface-muted/[0.12] px-3 py-2.5 text-left transition-colors hover:bg-dls-surface-muted/[0.20] focus-visible:bg-dls-surface-muted/[0.20] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--dls-accent-rgb),0.32)]"
              >
                <span className="flex min-w-0 items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-dls-text">
                    {note.title.trim() || t("notes.untitled")}
                  </span>
                  <span className="shrink-0 text-[10px] text-dls-muted">
                    {formatNoteTimestamp(noteTimestampMs(note.updatedAt))}
                  </span>
                </span>
                {note.body.trim() ? (
                  <span className="line-clamp-2 text-xs leading-5 text-dls-secondary">{note.body}</span>
                ) : null}
                <span className={cn("flex min-w-0 items-center gap-2", !noteToAttachment(note) && !noteSuggestedToMemory(note) && "hidden")}>
                  <NoteListAttachment note={note} />
                  {noteSuggestedToMemory(note) ? (
                    <span className="text-[10px] text-dls-secondary">In Memory review</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
