/** @jsxImportSource react */

import { useEffect, useMemo, useState } from "react";
import { Brain, NotebookPen, Tag, X } from "lucide-react";

import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useStatusToasts } from "../shell-feedback/status-toasts";
import type { MatterhornServerClient } from "../../../app/lib/matterhorn-server";
import { useQuickJotContext } from "./quick-jot-provider";
import type { NoteAttachment, MatterhornNote } from "./notes-types";
import { dispatchNotesUpdated, noteDraftToCreateRequest } from "./notes-store";
import { useNotesServerClient } from "./notes-server-client";
import { NoteAttachmentChip } from "./note-attachment-chip";
import { sendNoteToMemory } from "./send-note-to-memory";

export type QuickJotSheetProps = {
  workspaceId: string;
  client?: MatterhornServerClient | null;
  onSaved?: (note: MatterhornNote) => void;
};

function normalizeTags(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, self) => self.indexOf(tag) === index);
}

export function QuickJotSheet({ workspaceId, client, onSaved }: QuickJotSheetProps) {
  const { open, attachment, closeQuickJot } = useQuickJotContext();
  const notesClient = useNotesServerClient(client);
  const { showToast } = useStatusToasts();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [currentAttachment, setCurrentAttachment] = useState<NoteAttachment | undefined>(attachment);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setBody("");
      setTags("");
      setCurrentAttachment(attachment);
    }
  }, [open, attachment]);

  const tagChips = useMemo(() => normalizeTags(tags), [tags]);

  const canSave = title.trim().length > 0 || body.trim().length > 0;

  const handleClose = () => {
    if (!busy) closeQuickJot();
  };

  const handleSave = async (alsoSuggestMemory: boolean) => {
    if (!canSave || !workspaceId.trim()) return;
    if (!notesClient) {
      showToast({
        title: t("notes.save_failed"),
        description: "Matterhorn server is not connected.",
        tone: "error",
      });
      return;
    }
    setBusy(true);
    try {
      const response = await notesClient.createNote(
        workspaceId,
        noteDraftToCreateRequest(
          {
            title,
            body,
            tags: tagChips,
            attachment: currentAttachment,
          },
          "quick_jot",
        ),
      );
      let savedNote: MatterhornNote = response.note;

      if (alsoSuggestMemory) {
        const result = await sendNoteToMemory(notesClient, savedNote);
        if (result.ok) {
          savedNote = result.note;
          showToast({
            title: t("notes.send_memory_success_title"),
            description: result.message,
            tone: "success",
          });
        } else {
          showToast({
            title: t("notes.send_memory_skipped_title"),
            description: result.message,
            tone: "warning",
          });
        }
      } else {
        showToast({
          title: t("notes.toast_note_saved_title"),
          description: t("notes.toast_note_saved_description"),
          tone: "success",
        });
      }

      dispatchNotesUpdated(workspaceId);
      onSaved?.(savedNote);
      handleClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast({
        title: t("notes.save_failed"),
        description: message || t("notes.save_failed_description"),
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(value) => {
      if (!value) handleClose();
    }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="!w-[min(100vw,420px)] border-0 bg-dls-background p-0 shadow-[-18px_0_48px_rgba(0,0,0,0.16)] sm:!max-w-[420px]"
      >
        <SheetHeader className="gap-2 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="flex min-w-0 items-center gap-2.5 text-base font-semibold">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-dls-surface-muted/[0.24] text-primary">
                <NotebookPen className="size-4" />
              </span>
              {t("notes.quick_jot_title")}
            </SheetTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0 bg-dls-surface-muted/[0.18] text-dls-secondary shadow-none hover:bg-dls-surface-muted/[0.30] hover:text-dls-text"
              onClick={handleClose}
              disabled={busy}
              aria-label="Close Quick Jot"
              title="Close Quick Jot"
            >
              <X className="size-4" />
            </Button>
          </div>
          <SheetDescription className="max-w-[38ch] text-xs leading-5">
            {t("notes.quick_jot_description")}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <div className="flex min-h-full flex-col rounded-lg bg-dls-surface-muted/[0.14] p-1.5">
            <input
              placeholder={t("notes.note_title_placeholder")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy}
              className="h-12 w-full min-w-0 rounded-md bg-transparent px-3 text-lg font-medium text-dls-text outline-none transition-colors placeholder:text-dls-muted focus:bg-dls-surface-muted/[0.16] disabled:cursor-not-allowed disabled:opacity-50"
            />

            <textarea
              placeholder={t("notes.write_placeholder")}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={busy}
              className="min-h-[min(42vh,20rem)] w-full flex-1 resize-none rounded-md bg-transparent px-3 py-2 text-sm leading-6 text-dls-text outline-none transition-colors placeholder:text-dls-muted focus:bg-dls-surface-muted/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
            />

            <div className="flex min-w-0 items-center gap-2 rounded-md bg-dls-surface-muted/[0.18] px-3 py-2 transition-colors focus-within:bg-dls-surface-muted/[0.28]">
              <Tag className="size-3.5 shrink-0 text-dls-muted" />
              <input
                placeholder={t("notes.tags_placeholder")}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                disabled={busy}
                className="h-7 min-w-0 flex-1 bg-transparent text-xs text-dls-text outline-none placeholder:text-dls-muted disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {tagChips.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 px-3 pb-2 pt-2">
                {tagChips.map((tag) => (
                  <span key={tag} className="text-[11px] font-medium text-dls-secondary">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}

            {currentAttachment ? (
              <div className="px-3 pb-2 pt-2">
                <NoteAttachmentChip
                  attachment={currentAttachment}
                  onRemove={() => setCurrentAttachment(undefined)}
                />
              </div>
            ) : null}
          </div>
        </div>

        <SheetFooter className="mt-auto flex-row items-center gap-2 px-5 pb-5 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={busy}
            className="mr-auto bg-transparent px-2 text-dls-secondary shadow-none hover:bg-dls-surface-muted/[0.18] hover:text-dls-text"
          >
            {t("notes.cancel")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleSave(true)}
            disabled={!canSave || busy}
            className="gap-1.5 bg-dls-surface-muted/[0.24] shadow-none hover:bg-dls-surface-muted/[0.36]"
          >
            <Brain className="size-3.5" />
            {t("notes.quick_jot_save_and_suggest")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave(false)}
            disabled={!canSave || busy}
            className="shadow-none"
          >
            {busy ? t("notes.quick_jot_saving") : t("notes.quick_jot_save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
