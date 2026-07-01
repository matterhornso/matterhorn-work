/** @jsxImportSource react */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, FolderOpen, X } from "lucide-react";

import type { MatterhornServerClient } from "@/app/lib/matterhorn-server";
import { openDesktopPath } from "@/app/lib/desktop";
import { PanelTab, PanelTabItem, PanelTabList } from "@/components/panel-tabs";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatFileSize } from "@/lib/utils";
import { ArtifactIcon } from "./artifact-icon";
import type { BinaryData, Data, OpenTarget, TextData } from "./open-target";
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
  onSelectTarget?: (target: OpenTarget) => void;
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

export function ArtifactPanel({ client, workspaceId, workspaceRoot, workspaceName, isRemoteWorkspace = false, target, targets = [], onSelectTarget, onClose }: ArtifactPanelProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copiedPath, setCopiedPath] = useState(false);
  const isDirectTextEdit = isTextContent(target) && target.preview === "markdown";
  const externalPath = useMemo(() => target.kind === "file" ? absoluteWorkspacePath(workspaceRoot, target.value) : target.value, [target.kind, target.value, workspaceRoot]);

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
        throw new Error("Cannot save non-file artifact.");
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

  const download = async () => {
    if (target.kind === "url") {
      return;
    }
    
    const result = await client.downloadWorkspaceFile(workspaceId, target.value);
    const url = URL.createObjectURL(new Blob([result.data], { type: result.contentType ?? "application/octet-stream" }));
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = target.name;
    anchor.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openExternal = async () => {
    if (target.kind === "url") {
      window.open(target.value, "_blank", "noopener,noreferrer");

      return;
    }
    else if (!isRemoteWorkspace) {
      void openDesktopPath(externalPath);

      return;
    }

    await download();
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {targets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl border border-dls-border bg-dls-surface">
            <FolderOpen className="size-5 text-muted-foreground" />
          </div>
          <div className="grid gap-1">
            <p className="text-sm font-medium text-foreground">No outputs yet</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Outputs appear here after Matterhorn creates files in this project.
            </p>
          </div>
          {workspaceName && (
            <div className="mt-1 flex items-center gap-1.5 rounded-full border border-dls-border bg-dls-surface px-3 py-1 text-[11px] text-muted-foreground">
              <FolderOpen className="size-3" />
              {workspaceName}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="shrink-0 border-b border-border bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
            {targets.length > 1 ? (
              <div className="flex h-10 items-center gap-1 border-b border-border/60 px-2">
                <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
                  <PanelTabList values={targets.map((item) => item.id)} onReorder={() => {}}>
                    {targets.map((item) => (
                      <PanelTabItem
                        key={item.id}
                        value={item.id}
                      >
                        <PanelTab
                          active={item.id === target.id}
                          title={`${item.value}${item.exists === false ? " (missing)" : ""}`}
                          onClick={() => onSelectTarget?.(item)}
                        >
                          <ArtifactIcon type={item.preview} />
                          <span className="truncate">{item.name}{item.exists === false ? " · missing" : ""}</span>
                        </PanelTab>
                      </PanelTabItem>
                    ))}
                  </PanelTabList>
                </div>
              </div>
            ) : null}
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
                    <TooltipContent>Edit artifact</TooltipContent>
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
              {target.kind === "file" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button variant="ghost" size="icon-sm" onClick={() => void download()} aria-label="Download artifact">
                        <Download />
                      </Button>
                    )}
                  />
                  <TooltipContent>Download artifact</TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button variant="ghost" size="icon-sm" onClick={() => void openExternal()} aria-label={isRemoteWorkspace ? "Download artifact" : "Open externally"}>
                      <ExternalLink />
                    </Button>
                  )}
                />
                <TooltipContent>{isRemoteWorkspace ? "Download artifact" : "Open externally"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close artifact">
                      <X />
                    </Button>
                  )}
                />
                <TooltipContent>Close artifact</TooltipContent>
              </Tooltip>
            </div>
            {target.kind === "file" && (
              <div className="flex items-center gap-2 border-b border-border/60 px-4 py-1.5">
                {workspaceName && (
                  <span className="flex items-center gap-1 rounded-full border border-dls-border bg-dls-surface px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <FolderOpen className="size-2.5" />
                    {workspaceName}
                  </span>
                )}
                <span className="truncate text-[11px] text-muted-foreground" title={target.value}>{target.value}</span>
                <span className="ml-auto shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  Saved in this project
                </span>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {isLoading || (data?.kind === "binary" && !binaryObjectUrl) ? (
              <PreviewLoading />
            ) : isError ? (
              <PreviewError message={error instanceof Error ? error.message : "Failed to load artifact" } />
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

