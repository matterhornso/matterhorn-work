/** @jsxImportSource react */
import { Copy, ExternalLink, FileText, FolderOpen, NotebookPen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatFileSize } from "@/lib/utils";
import { formatRelativeTime } from "../../../../app/utils";
import { ArtifactIcon } from "./artifact-icon";
import type { OutputDescriptor } from "./output-descriptor";

function receiptStatusLabel(status: OutputDescriptor["receiptStatus"]): string {
  if (status === "generated") return "Generated";
  if (status === "published") return "Published";
  if (status === "saved") return "Saved";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return "Receipt";
}

type OutputListProps = {
  outputs: OutputDescriptor[];
  selectedId?: string;
  onSelect: (output: OutputDescriptor) => void;
  onOpen: (output: OutputDescriptor) => void;
  onAddNote?: (output: OutputDescriptor) => void;
  onCopyPath?: (output: OutputDescriptor) => void;
  onReveal?: (output: OutputDescriptor) => void;
  onDelete?: (output: OutputDescriptor) => void;
};

export function OutputList({
  outputs,
  selectedId,
  onSelect,
  onOpen,
  onAddNote,
  onCopyPath,
  onReveal,
  onDelete,
}: OutputListProps) {
  if (outputs.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-border/45 bg-background">
      <div className="max-h-48 overflow-y-auto">
        {outputs.map((output) => {
          const isSelected = output.id === selectedId;
          return (
            <button
              key={output.id}
              type="button"
              onClick={() => onSelect(output)}
              className={cn(
                "group flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none",
                isSelected && "bg-muted/45 hover:bg-muted/45",
              )}
            >
              <span className="mt-0.5 shrink-0 text-muted-foreground">
                <ArtifactIcon type={output.preview ?? "external"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="block truncate text-xs font-medium text-foreground">
                    {output.title}
                  </span>
                  {output.exists === false ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">missing</span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground" title={output.path}>
                  {output.path}
                </span>
                {output.receiptTitle ? (
                  <span className="block truncate text-[11px] text-muted-foreground" title={output.receiptSummary ?? output.receiptTitle}>
                    Receipt: {output.receiptTitle}
                  </span>
                ) : null}
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  {output.desk ? (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {output.desk}
                    </span>
                  ) : null}
                  {output.sessionSlug ? (
                    <span className="max-w-[120px] truncate text-[10px] font-medium text-muted-foreground">
                      {output.sessionSlug}
                    </span>
                  ) : null}
                  {output.originLabel ? (
                    <span className={cn(
                      "text-[10px] font-medium",
                      output.isLegacy
                        ? "text-amber-300"
                        : "text-emerald-300",
                    )}>
                      {output.originLabel}
                    </span>
                  ) : null}
                  {output.receiptStatus ? (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      Receipt: {receiptStatusLabel(output.receiptStatus)}
                    </span>
                  ) : null}
                  {output.taskId ? (
                    <span className="max-w-[120px] truncate text-[10px] text-muted-foreground" title={output.taskId}>
                      {output.taskId}
                    </span>
                  ) : null}
                  {output.updatedAt ? (
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(output.updatedAt)}
                    </span>
                  ) : null}
                  {output.size !== undefined ? (
                    <span className="text-[10px] text-muted-foreground">{formatFileSize(output.size)}</span>
                  ) : null}
                </span>
              </span>
              <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex sm:flex">
                {onCopyPath ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCopyPath(output);
                    }}
                    aria-label="Copy path"
                    title="Copy path"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                ) : null}
                {onAddNote ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddNote(output);
                    }}
                    aria-label="Add note about this output"
                    title="Add note about this output"
                  >
                    <NotebookPen className="size-3.5" />
                  </Button>
                ) : null}
                {onReveal ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onReveal(output);
                    }}
                    aria-label="Reveal in folder"
                    title="Reveal in folder"
                  >
                    <FolderOpen className="size-3.5" />
                  </Button>
                ) : null}
                {onDelete && output.path.startsWith("outputs/") && output.exists !== false ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(output);
                    }}
                    aria-label="Delete output"
                    title="Delete output"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(output);
                  }}
                  aria-label="Open output"
                  title="Open output"
                >
                  <ExternalLink className="size-3.5" />
                </Button>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
