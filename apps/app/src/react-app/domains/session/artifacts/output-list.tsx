/** @jsxImportSource react */
import { Copy, ExternalLink, FileText, FolderOpen, NotebookPen, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatFileSize } from "@/lib/utils";
import { formatRelativeTime } from "../../../../app/utils";
import { ArtifactIcon } from "./artifact-icon";
import type { OutputDescriptor } from "./output-descriptor";

function receiptStatusLabel(status: OutputDescriptor["receiptStatus"]): string {
  if (status === "generated") return "Generated";
  if (status === "preview") return "Preview";
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
    <div className="mt-1 shrink-0 rounded-lg bg-dls-surface-muted/[0.12] p-1">
      <div className="max-h-52 overflow-y-auto">
        {outputs.map((output) => {
          const isSelected = output.id === selectedId;
          return (
            <div
              key={output.id}
              className={cn(
                "group flex w-full items-start gap-1 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-dls-surface-muted/[0.14]",
                isSelected && "bg-dls-surface-muted/[0.18] hover:bg-dls-surface-muted/[0.18]",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(output)}
                aria-label={`Select output: ${output.title}`}
                className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1.5 py-1 text-left focus-visible:bg-dls-surface-muted/[0.18] focus-visible:outline-none"
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
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
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
                  {output.originLabel && output.isLegacy ? (
                    <span className="text-[10px] font-medium text-amber-300">
                      {output.originLabel}
                    </span>
                  ) : null}
                  {output.receiptStatus ? (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      Receipt: {receiptStatusLabel(output.receiptStatus)}
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
              </button>
              <span className="hidden shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 @md/artifact:flex">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
