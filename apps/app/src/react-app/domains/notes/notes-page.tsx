/** @jsxImportSource react */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Search, Trash2 } from "lucide-react";

import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStatusToasts } from "../shell-feedback/status-toasts";
import { ErrorState } from "../shell/error-state";
import { ACTIVE_WORKSPACE_CHANGED_EVENT, readActiveWorkspaceId } from "../../shell/session-memory";
import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import { useNotesServerClient } from "./notes-server-client";
import { filterNotes, useNotesStore } from "./notes-store";
import type { MatterhornNote, NoteAttachment, NoteFilterId, NoteUpdateInput } from "./notes-types";
import { NOTE_FILTERS, noteSuggestedToMemory, noteTimestampMs, noteToAttachment } from "./notes-types";
import { NotesEmptyState } from "./notes-empty-state";
import { NoteAttachmentChip } from "./note-attachment-chip";
import { cn } from "@/lib/utils";

export type NotesPageProps = {
  client?: MatterhornServerClient | null;
  workspaceId?: string | null;
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

  useEffect(() => {
    setSelectedNoteId(null);
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

  const handleCreateNote = useCallback(async () => {
    if (!workspaceId.trim()) {
      showToast({
        title: t("notes.no_project_selected_title"),
        description: t("notes.no_project_selected_description"),
        tone: "warning",
      });
      return;
    }
    const note = await create({ title: "", body: "" });
    if (note) {
      setSelectedNoteId(note.id);
    }
  }, [workspaceId, create, showToast]);

  const handleUpdateSelected = useCallback(
    (patch: NoteUpdateInput) => {
      if (!selectedNote) return;
      update(selectedNote.id, patch);
    },
    [selectedNote, update],
  );

  const handleSuggestMemory = useCallback(async () => {
    if (!selectedNote) return;
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
  }, [selectedNote, suggestMemory, showToast, error]);

  if (!workspaceId.trim()) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background px-6 py-12 text-center">
        <NotesEmptyState
          title={t("notes.empty_no_project_title")}
          description={t("notes.empty_no_project_description")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 flex-col gap-3 border-b border-dls-border/45 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-dls-text">
              {t("notes.page_title")}
            </h1>
            <p className="mt-0.5 text-xs text-dls-secondary">
              {t("notes.page_description")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleCreateNote}
          >
            {t("notes.create_note")}
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("notes.search_placeholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {NOTE_FILTERS.map((filter) => (
              <Button
                key={filter.id}
                type="button"
                variant={filterId === filter.id ? "default" : "outline"}
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setFilterId(filter.id)}
              >
                {t(filter.label)}
              </Button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="rounded-md bg-dls-surface-muted/25 px-3 py-2 text-xs text-dls-secondary">
            {t("notes.loading")}
          </div>
        ) : error ? (
          <ErrorState
            error={error}
            title="Could not load notes"
            onRetry={() => void refresh()}
            className="rounded-md bg-destructive/10 px-3 py-2"
          />
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex w-full min-w-0 flex-col border-r border-dls-border/45 md:w-72 lg:w-80">
          <ScrollArea>
            {filteredNotes.length === 0 ? (
              <NotesEmptyState
                title={notes.length === 0 ? t("notes.empty_no_notes_title") : t("notes.empty_no_matches_title")}
                description={
                  notes.length === 0
                    ? t("notes.empty_no_notes_description")
                    : t("notes.empty_no_matches_description")
                }
              />
            ) : (
              <div className="flex flex-col p-2">
                {filteredNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setSelectedNoteId(note.id)}
                    className={cn(
                      "flex flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors",
                      selectedNoteId === note.id
                        ? "bg-primary/10 ring-1 ring-primary/25"
                        : "bg-transparent hover:bg-dls-hover/45",
                    )}
                  >
                    <span className="truncate text-sm font-medium text-dls-text">
                      {note.title.trim() || t("notes.untitled")}
                    </span>
                    {note.body.trim() ? (
                      <span className="line-clamp-2 text-xs leading-4 text-dls-secondary">
                        {note.body}
                      </span>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <NoteListAttachment note={note} />
                      {noteSuggestedToMemory(note) ? (
                        <span className="inline-flex items-center rounded-md bg-dls-hover/35 px-1.5 py-0.5 text-[10px] text-dls-secondary">
                          {t("notes.memory_suggested_badge")}
                        </span>
                      ) : null}
                      <span className="ml-auto text-[10px] text-dls-muted">
                        {formatNoteTimestamp(noteTimestampMs(note.updatedAt))}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="hidden min-w-0 flex-1 flex-col md:flex">
          {selectedNote ? (
            <>
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dls-border/45 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  {selectedAttachment ? (
                    <NoteAttachmentChip
                      attachment={selectedAttachment}
                      onRemove={() => handleUpdateSelected({ attachment: null })}
                    />
                  ) : null}
                  <span className="text-xs text-dls-muted">
                    {formatNoteTimestamp(noteTimestampMs(selectedNote.updatedAt))}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!noteSuggestedToMemory(selectedNote) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="bg-transparent hover:bg-dls-hover/45"
                      onClick={() => void handleSuggestMemory()}
                    >
                      {t("notes.suggest_memory")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      remove(selectedNote.id);
                      setSelectedNoteId(null);
                    }}
                    aria-label={t("notes.delete_note")}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-3 p-4 sm:p-6">
                  <Input
                    value={selectedNote.title}
                    onChange={(event) => handleUpdateSelected({ title: event.target.value })}
                    placeholder={t("notes.note_title_placeholder")}
                    className="h-10 text-base font-medium"
                  />
                  <Textarea
                    value={selectedNote.body}
                    onChange={(event) => handleUpdateSelected({ body: event.target.value })}
                    placeholder={t("notes.write_placeholder")}
                    className="min-h-[16rem] flex-1 resize-none"
                  />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-dls-secondary">{t("notes.tags_label")}</label>
                    <Input
                      value={selectedNote.tags.join(", ")}
                      onChange={(event) =>
                        handleUpdateSelected({ tags: tagInputToTags(event.target.value) })
                      }
                      placeholder={t("notes.tags_placeholder")}
                    />
                    {selectedNote.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {selectedNote.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-md bg-dls-hover/35 px-2 py-0.5 text-[11px] text-dls-secondary"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <NotesEmptyState
                title={t("notes.empty_select_title")}
                description={t("notes.empty_select_description")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
