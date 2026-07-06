/** @jsxImportSource react */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, FolderOpen, NotebookPen, Trash2, X } from "lucide-react";

import type { MatterhornServerClient } from "@/app/lib/matterhorn-server";
import { openDesktopPath } from "@/app/lib/desktop";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatFileSize } from "@/lib/utils";
import { ConfirmModal } from "../../../design-system/modals/confirm-modal";
import { getArtifactNoteContext } from "./artifact-note-context";
import { ArtifactIcon } from "./artifact-icon";
import type { BinaryData, Data, OpenTarget, TextData } from "./open-target";
import { outputDescriptorFromOpenTarget, type OutputDescriptor } from "./output-descriptor";
import { OutputList } from "./output-list";
import { normalizeOutputReceiptPath, type WorkflowOutputReceipt } from "./output-receipts";
import { HTMLPreview, ImagePreview, MarkdownPreview, PlainText, PreviewError, PreviewLoading, PreviewUnavailable } from "./preview";

const ArtifactTextEditor = lazy(() =>
  import("./artifact-text-editor").then((module) => ({ default: module.ArtifactTextEditor })),
);
const ArtifactSpreadsheetEditor = lazy(() =>
  import("./artifact-spreadsheet-editor").then((module) => ({ default: module.ArtifactSpreadsheetEditor })),
);

type ArtifactPanelProps = {
  client: MatterhornServerClient;
  workspaceId: string;
  workspaceRoot: string;
  workspaceName?: string;
  isRemoteWorkspace?: boolean;
  target: OpenTarget;
  targets?: OpenTarget[];
  outputReceipts?: WorkflowOutputReceipt[];
  onSelectTarget?: (target: OpenTarget) => void;
  onAddNote?: (artifactPath: string, desk?: string, sessionSlug?: string) => void;
  onRevealPath?: (path: string, label: string) => Promise<void> | void;
  onDeletedTarget?: (target: OpenTarget) => void;
  onClose: () => void;
};

type ArtifactQueryState =
  | (TextData & { updatedAt: number | null })
  | (BinaryData & { contentType: string | null; updatedAt: number | null });

type SaveArtifactInput = Data & { baseUpdatedAt: number | null };

function absoluteWorkspacePath(root: string, path: string) {
  const cleanRoot = root.trim().replace(/[/\\]+$/, "");
  const cleanPath = path.trim().replace(/^\.\//, "");

  return cleanRoot ? `${cleanRoot}/${cleanPath}` : cleanPath;
}

function isTextContent(target: OpenTarget): boolean {
  return ["markdown", "text", "sheet", "html"].includes(target.preview) && !/\.(xlsx|xls|ods)$/i.test(target.value);
}

export function ArtifactPanel({
  client,
  workspaceId,
  workspaceRoot,
  workspaceName,
  isRemoteWorkspace = false,
  target,
  targets = [],
  outputReceipts = [],
  onSelectTarget,
  onAddNote,
  onRevealPath,
  onDeletedTarget,
  onClose,
}: ArtifactPanelProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copiedPath, setCopiedPath] = useState(false);
  const [pendingDeleteTarget, setPendingDeleteTarget] = useState<OpenTarget | null>(null);
  const isDirectTextEdit = isTextContent(target) && target.preview === "markdown";
  const externalPathForTarget = useCallback(
    (nextTarget: OpenTarget) => (nextTarget.kind === "file" ? absoluteWorkspacePath(workspaceRoot, nextTarget.value) : nextTarget.value),
    [workspaceRoot],
  );
  const externalPath = useMemo(() => externalPathForTarget(target), [externalPathForTarget, target]);
  const noteContext = useMemo(() => getArtifactNoteContext(target.value), [target.value]);
  const receiptByPath = useMemo(() => {
    const next = new Map<string, WorkflowOutputReceipt>();
    for (const receipt of outputReceipts) {
      next.set(normalizeOutputReceiptPath(receipt.outputPath).toLowerCase(), receipt);
    }
    return next;
  }, [outputReceipts]);
  const outputs = useMemo(
    () => (targets ?? []).map((nextTarget) => outputDescriptorFromOpenTarget(
      nextTarget,
      receiptByPath.get(normalizeOutputReceiptPath(nextTarget.value).toLowerCase()),
    )),
    [receiptByPath, targets],
  );
  const selectedOutput = useMemo(
    () => outputs.find((output) => output.id === target.id) ?? outputs[0] ?? null,
    [outputs, target.id],
  );
  const canDeleteTarget = target.kind === "file" && target.exists !== false && normalizeOutputReceiptPath(target.value).startsWith("outputs/");

  const { data, error, isError, isLoading } = useQuery<ArtifactQueryState>({
    queryKey: ["artifact-panel", workspaceId, target.id] as const,
    queryFn: async () => {
      if (target.kind === "url") {
        throw new Error("URLs open in browser tabs.");
      }
      else if (target.exists === false) {
        throw new Error("File not found in this workspace.");
      }

      if (isTextContent(target)) {
        const result = await client.readWorkspaceFile(workspaceId, target.value);

        return { kind: "text", data: result.content, updatedAt: result.updatedAt ?? null };
      }

      const result = await client.downloadWorkspaceFile(workspaceId, target.value);

      return { kind: "binary", data: result.data, contentType: result.contentType, updatedAt: target.updatedAt ?? null };
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const [binaryObjectUrl, setBinaryObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!data || data.kind !== "binary") {
      setBinaryObjectUrl(null);

      return;
    }

    const url = URL.createObjectURL(new Blob([data.data], { type: data.contentType ?? "application/octet-stream" }));

    setBinaryObjectUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [data]);

  useEffect(() => {
    setEditing(false);
    setDraft("");
  }, [target.id, workspaceId]);

  useEffect(() => {
    if (data?.kind === "text") {
      setDraft(data.data);
    }
  }, [data]);

  const { mutate, mutateAsync, isPending: isSaving } = useMutation({
    mutationFn: async (input: SaveArtifactInput) => {
      if (target.kind !== "file") {
        throw new Error("Cannot save non-file output.");
      }

      if (input.kind === "text") {
        return client.writeWorkspaceFile(workspaceId, { path: target.value, content: input.data, baseUpdatedAt: input.baseUpdatedAt });
      }

      return client.writeWorkspaceBinaryFile(workspaceId, { path: target.value, data: input.data, baseUpdatedAt: input.baseUpdatedAt });
    },
    onSuccess: (result, input) => {
      queryClient.setQueryData<ArtifactQueryState>(
        ["artifact-panel", workspaceId, target.id] as const,
        input.kind === "text"
          ? { kind: "text", data: input.data, updatedAt: result.updatedAt ?? null }
          : { kind: "binary", data: input.data, contentType: data?.kind === "binary" ? data.contentType : null, updatedAt: result.updatedAt ?? null },
      );

      if (input.kind === "text") {
        setDraft(input.data);
      }
    },
  });
  const deleteOutputMutation = useMutation({
    mutationFn: async (nextTarget: OpenTarget) => {
      if (nextTarget.kind !== "file") {
        throw new Error("Cannot delete non-file output.");
      }
      return client.deleteWorkspaceOutput(workspaceId, nextTarget.value);
    },
    onSuccess: (_result, deletedTarget) => {
      queryClient.removeQueries({ queryKey: ["artifact-panel", workspaceId, deletedTarget.id] as const });
      void queryClient.invalidateQueries({ queryKey: ["workflow-output-receipts", workspaceId] as const });
      void queryClient.invalidateQueries({ queryKey: ["project-evidence", workspaceId] });
      window.dispatchEvent(new CustomEvent("matterhorn:project-evidence-updated"));
      onDeletedTarget?.(deletedTarget);
      setPendingDeleteTarget(null);
    },
  });

  const download = async (nextTarget = target) => {
    if (nextTarget.kind === "url") {
      return;
    }

    const result = await client.downloadWorkspaceFile(workspaceId, nextTarget.value);
    const url = URL.createObjectURL(new Blob([result.data], { type: result.contentType ?? "application/octet-stream" }));
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = nextTarget.name;
    anchor.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openExternal = async (nextTarget = target) => {
    if (nextTarget.kind === "url") {
      window.open(nextTarget.value, "_blank", "noopener,noreferrer");

      return;
    }
    else if (!isRemoteWorkspace) {
      void openDesktopPath(externalPathForTarget(nextTarget));

      return;
    }

    await download(nextTarget);
  };

  const reveal = async (nextTarget = target) => {
    if (nextTarget.kind !== "file") return;
    const nextExternalPath = externalPathForTarget(nextTarget);
    if (!nextExternalPath) return;
    if (onRevealPath) {
      await onRevealPath(nextExternalPath, "Output file");
      return;
    }
    if (!isRemoteWorkspace) {
      void openDesktopPath(nextExternalPath);
    }
  };

  const save = () => {
    if (target.kind !== "file" || !isTextContent(target) || data?.kind !== "text") {
      return;
    }

    mutate(
      {
        kind: "text",
        data: draft,
        baseUpdatedAt: data.updatedAt,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  const saveSpreadsheetContent = async (payload: Data) => {
    if (target.kind !== "file") {
      return;
    }

    await mutateAsync({
      ...payload,
      baseUpdatedAt: data?.kind === payload.kind ? data.updatedAt : target.updatedAt ?? null,
    });
  };

  const copyPath = async () => {
    if (target.kind !== "file") return;
    await navigator.clipboard.writeText(target.value);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1800);
  };

  const handleAddNote = () => {
    if (!onAddNote) return;
    onAddNote(noteContext.path, noteContext.desk, noteContext.sessionSlug);
  };

  const handleSelectOutput = (output: OutputDescriptor) => {
    const match = targets.find((item) => item.id === output.id);
    if (match) onSelectTarget?.(match);
  };

  const handleOpenOutput = (output: OutputDescriptor) => {
    const match = targets.find((item) => item.id === output.id);
    if (!match) return;
    onSelectTarget?.(match);
    void openExternal(match);
  };
  const handleDeleteOutput = (output: OutputDescriptor) => {
    const match = targets.find((item) => item.id === output.id || item.value === output.path);
    if (match?.kind === "file") setPendingDeleteTarget(match);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {targets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-dls-surface-muted/25">
            <FolderOpen className="size-5 text-muted-foreground" />
          </div>
          <div className="grid gap-1">
            <p className="text-sm font-medium text-foreground">No outputs yet</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Outputs appear here after Matterhorn creates files in this project.
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              Saved files live under <span className="font-medium text-foreground">outputs/&lt;desk&gt;/&lt;session-slug&gt;/</span>.
            </p>
          </div>
          {workspaceName && (
            <div className="mt-1 flex items-center gap-1.5 rounded-md bg-dls-surface-muted/25 px-3 py-1 text-[11px] text-muted-foreground">
              <FolderOpen className="size-3" />
              {workspaceName}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="shrink-0 border-b border-border bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
            <div className="flex h-10 items-center gap-2 pe-2 ps-4">
              <div className="min-w-0 flex-1 flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-foreground">
                  <span className="truncate">{target.name}</span>
                </h3>
                <span className="truncate text-xs text-muted-foreground">
                  {target.exists === false ? "missing" : target.size !== undefined ? `${formatFileSize(target.size)}` : ""}
                </span>
              </div>
              {isTextContent(target) && data?.kind === "text" ? (
                editing || isDirectTextEdit ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger
                        render={(
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (data?.kind === "text") {
                                setDraft(data.data);
                              }
                              setEditing(false);
                            }}
                            disabled={isSaving}
                          >
                            Discard
                          </Button>
                        )}
                      />
                      <TooltipContent>Discard changes</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={(
                          <Button variant="default" size="sm" onClick={() => void save()} disabled={isSaving || draft === data.data}>{isSaving ? "Saving" : "Save"}</Button>
                        )}
                      />
                      <TooltipContent>Save changes</TooltipContent>
                    </Tooltip>
                  </>
                ) : (
                  <Tooltip>
                    <TooltipTrigger
                      render={(
                        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                      )}
                    />
                    <TooltipContent>Edit output</TooltipContent>
                  </Tooltip>
                )
              ) : null}
              {target.kind === "file" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button variant="ghost" size="icon-sm" onClick={() => void copyPath()} aria-label="Copy path">
                        <Copy className={cn("size-3.5", copiedPath && "text-green-400")} />
                      </Button>
                    )}
                  />
                  <TooltipContent>{copiedPath ? "Copied!" : "Copy path"}</TooltipContent>
                </Tooltip>
              ) : null}
              {target.kind === "file" && onAddNote ? (
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void handleAddNote()}
                        aria-label="Add note about this output"
                      >
                        <NotebookPen />
                      </Button>
                    )}
                  />
                  <TooltipContent>Add note about this output</TooltipContent>
                </Tooltip>
              ) : null}
              {target.kind === "file" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button variant="ghost" size="icon-sm" onClick={() => void download()} aria-label="Download output">
                        <Download />
                      </Button>
                    )}
                  />
                  <TooltipContent>Download output</TooltipContent>
                </Tooltip>
              ) : null}
              {target.kind === "file" && !isRemoteWorkspace ? (
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button variant="ghost" size="icon-sm" onClick={() => void reveal()} aria-label="Reveal in folder">
                        <FolderOpen />
                      </Button>
                    )}
                  />
                  <TooltipContent>Reveal in folder</TooltipContent>
                </Tooltip>
              ) : null}
              {canDeleteTarget ? (
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setPendingDeleteTarget(target)}
                        aria-label="Delete output"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 />
                      </Button>
                    )}
                  />
                  <TooltipContent>Delete output</TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button variant="ghost" size="icon-sm" onClick={() => void openExternal()} aria-label={isRemoteWorkspace ? "Download output" : "Open externally"}>
                      <ExternalLink />
                    </Button>
                  )}
                />
                <TooltipContent>{isRemoteWorkspace ? "Download output" : "Open externally"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close output">
                      <X />
                    </Button>
                  )}
                />
                <TooltipContent>Close output</TooltipContent>
              </Tooltip>
            </div>
            {target.kind === "file" && (
              <div className="flex items-center gap-2 border-b border-border/60 px-4 py-1.5">
                {workspaceName && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                    <FolderOpen className="size-2.5" />
                    {workspaceName}
                  </span>
                )}
                {noteContext.desk && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {noteContext.desk}
                  </span>
                )}
                {noteContext.sessionSlug && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {noteContext.sessionSlug}
                  </span>
                )}
                <span className="truncate text-[11px] text-muted-foreground" title={target.value}>{target.value}</span>
                {noteContext.isLegacy ? (
                  <span className="ml-auto shrink-0 text-[10px] font-medium text-amber-300">
                    Legacy location
                  </span>
                ) : (
                  <span className="ml-auto shrink-0 text-[10px] font-medium text-emerald-300">
                    Saved in this project
                  </span>
                )}
              </div>
            )}
            {selectedOutput?.receiptTitle ? (
              <div className="flex min-w-0 items-center gap-2 border-b border-border/60 px-4 py-1.5 text-[11px]">
                <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                  Workflow receipt
                </span>
                <span className="truncate text-muted-foreground" title={selectedOutput.receiptSummary ?? selectedOutput.receiptTitle}>
                  {selectedOutput.receiptTitle}
                </span>
              </div>
            ) : null}
            {outputs.length > 1 ? (
              <OutputList
                outputs={outputs}
                selectedId={selectedOutput?.id}
                onSelect={handleSelectOutput}
                onOpen={handleOpenOutput}
                onCopyPath={(output) => {
                  void navigator.clipboard.writeText(output.path);
                }}
                onAddNote={onAddNote ? (output) => onAddNote(output.path, output.desk, output.sessionSlug) : undefined}
                onReveal={!isRemoteWorkspace ? (output) => {
                  const match = targets.find((item) => item.id === output.id);
                  if (match) void reveal(match);
                } : undefined}
                onDelete={handleDeleteOutput}
              />
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {isLoading || (data?.kind === "binary" && !binaryObjectUrl) ? (
              <PreviewLoading />
            ) : isError ? (
              <PreviewError message={error instanceof Error ? error.message : "Failed to load output" } />
            ) : data?.kind === "text" && (editing || isDirectTextEdit) ? (
              <TextEditor value={draft} language={target.preview === "markdown" ? "markdown" : "text"} onChange={setDraft} />
            ) : target.preview === "markdown" && data?.kind === "text" ? (
              <MarkdownPreview content={data.data} />
            ) : target.preview === "sheet" ? (
              <SheetEditor
                name={target.name}
                content={data ?? { kind: "binary", data: new ArrayBuffer(0) }}
                saving={isSaving}
                onSave={saveSpreadsheetContent}
              />
            ) : target.preview === "html" && data?.kind === "text" ? (
              <HTMLPreview type="text" title={target.name} content={data.data} />
            ) : target.preview === "image" && data?.kind === "binary" && binaryObjectUrl ? (
              <ImagePreview src={binaryObjectUrl} alt={target.name} />
            ) : data?.kind === "binary" && binaryObjectUrl && (target.preview === "pdf" || target.preview === "html") ? (
              <HTMLPreview type="binary" title={target.name} url={binaryObjectUrl} />
            ) : data?.kind === "text" ? (
              <PlainText content={data.data} />
            ) : (
              <PreviewUnavailable />
            )}
          </div>
        </>
      )}
      <ConfirmModal
        open={Boolean(pendingDeleteTarget)}
        title="Delete output?"
        message={pendingDeleteTarget ? (
          <span>
            Delete <span className="font-mono text-xs">{pendingDeleteTarget.value}</span> from this workspace. The action is recorded in Project Activity.
          </span>
        ) : "Delete this output from the workspace."}
        confirmLabel={deleteOutputMutation.isPending ? "Deleting" : "Delete"}
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => {
          if (!pendingDeleteTarget || deleteOutputMutation.isPending) return;
          deleteOutputMutation.mutate(pendingDeleteTarget);
        }}
        onCancel={() => {
          if (!deleteOutputMutation.isPending) setPendingDeleteTarget(null);
        }}
      />
    </div>
  );
}

interface TextEditorProps extends React.ComponentProps<typeof ArtifactTextEditor> {
  value: string;
  language: "markdown" | "text";
  onChange: (value: string) => void;
}

function TextEditor({ value, language, onChange, ...props }: TextEditorProps) {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <ArtifactTextEditor value={value} language={language} onChange={onChange} {...props} />
    </Suspense>
  );
}

interface SheetEditorProps extends React.ComponentProps<typeof ArtifactSpreadsheetEditor> {

}

function SheetEditor({ className, ...props }: SheetEditorProps) {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <ArtifactSpreadsheetEditor
        className={className}
        {...props}
      />
    </Suspense>
  );
}
