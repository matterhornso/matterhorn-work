/** @jsxImportSource react */

import { NotebookPen } from "lucide-react";

import { t } from "@/i18n";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export type NotesEmptyStateProps = {
  title?: string;
  description?: string;
};

export function NotesEmptyState({
  title = t("notes.empty_default_title"),
  description = t("notes.empty_default_description"),
}: NotesEmptyStateProps) {
  return (
    <Empty variant="ghost" className="py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <NotebookPen />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
