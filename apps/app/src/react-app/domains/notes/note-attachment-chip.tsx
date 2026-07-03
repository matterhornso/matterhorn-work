/** @jsxImportSource react */

import { X } from "lucide-react";

import { t } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NoteAttachment } from "./notes-types";

function attachmentIcon(attachment: NoteAttachment): string {
  switch (attachment.type) {
    case "desk":
      return t("notes.attachment_type_desk");
    case "session":
      return t("notes.attachment_type_session");
    case "task":
      return t("notes.attachment_type_task");
    case "output":
      return t("notes.attachment_type_output");
    default:
      return t("notes.attachment_type_attached");
  }
}

export type NoteAttachmentChipProps = {
  attachment: NoteAttachment;
  onRemove?: () => void;
  className?: string;
};

export function NoteAttachmentChip({ attachment, onRemove, className }: NoteAttachmentChipProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "inline-flex h-auto max-w-full items-center gap-1.5 px-2 py-1 text-xs font-medium",
        onRemove ? "pr-1" : "",
        className,
      )}
    >
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {attachmentIcon(attachment)}
      </span>
      <span className="min-w-0 truncate">{attachment.label}</span>
      {onRemove ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-4 shrink-0 rounded-full p-0 hover:bg-background"
          onClick={onRemove}
          aria-label={t("notes.attachment_remove")}
          title={t("notes.attachment_remove")}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </Badge>
  );
}
