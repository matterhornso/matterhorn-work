/** @jsxImportSource react */

import { useEffect, useMemo, useState } from "react";
import { NotebookPen, Sparkles } from "lucide-react";

import { t } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
      <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-2xl px-4 pb-6 pt-5 sm:px-6">
        <SheetHeader className="gap-1 px-0 pb-2">
          <SheetTitle className="flex items-center gap-2 text-base font-semibold">
            <NotebookPen className="size-4 text-primary" />
            {t("notes.quick_jot_title")}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {t("notes.quick_jot_description")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 py-2">
          <Input
            placeholder={t("notes.note_title_placeholder")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={busy}
            className="h-10"
          />

          <Textarea
            placeholder={t("notes.write_placeholder")}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={busy}
            className="min-h-32"
          />

          <Input
            placeholder={t("notes.tags_placeholder")}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            disabled={busy}
          />

          {tagChips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {tagChips.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-dls-border bg-dls-surface px-2 py-0.5 text-[11px] text-dls-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {currentAttachment ? (
            <div className="flex items-center gap-2">
              <NoteAttachmentChip
                attachment={currentAttachment}
                onRemove={() => setCurrentAttachment(undefined)}
              />
            </div>
          ) : null}
        </div>

        <SheetFooter className="flex-col-reverse gap-2 px-0 pt-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            {t("notes.cancel")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleSave(true)}
            disabled={!canSave || busy}
            className="w-full gap-1.5 sm:w-auto"
          >
            <Sparkles className="size-3.5" />
            {t("notes.quick_jot_save_and_suggest")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave(false)}
            disabled={!canSave || busy}
            className="w-full sm:w-auto"
          >
            {busy ? t("notes.quick_jot_saving") : t("notes.quick_jot_save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
