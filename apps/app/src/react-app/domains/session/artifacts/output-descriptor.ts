import type { NoteAttachment, NoteOutputAttachment } from "../../notes/notes-types";
import { getArtifactNoteContext } from "./artifact-note-context";
import type { OpenTarget, OpenTargetPreview } from "./open-target";
import type { WorkflowOutputReceipt, WorkflowOutputReceiptStatus } from "./output-receipts";

export type OutputKind = "file" | "workflow-receipt" | "note-attachment";

export type OutputDescriptor = {
  id: string;
  kind: OutputKind;
  /** Customer-facing title of the output. */
  title: string;
  /** Relative or absolute path/identifier for the output. */
  path: string;
  /** Source desk id, when the path or metadata implies one. */
  desk?: string;
  /** Source session slug, when the path or metadata implies one. */
  sessionSlug?: string;
  /** Optional id of the originating workflow run, note, etc. */
  sourceId?: string;
  /** Last update timestamp in milliseconds, if known. */
  updatedAt?: number;
  /** File size in bytes, if known. */
  size?: number;
  /** Whether the referenced file is known to exist in the workspace. */
  exists?: boolean;
  /** Preview classification for file outputs. */
  preview?: OpenTargetPreview;
  /** True for legacy/internal paths such as .opencode/openwork/outbox/. */
  isLegacy?: boolean;
  /** Customer-facing origin label, e.g. the desk name or "Project note". */
  originLabel?: string;
  /** Workflow receipt status when this output was observed through project evidence. */
  receiptStatus?: WorkflowOutputReceiptStatus;
  /** Workflow receipt title from Project Activity. */
  receiptTitle?: string;
  /** Compact workflow receipt detail from Project Activity. */
  receiptSummary?: string;
  /** Workflow task id that produced or reported this output. */
  taskId?: string;
  /** Number of outputs reported by the same workflow receipt event. */
  receiptArtifactCount?: number;
};

function legacyOriginLabel(kind: "opencode" | "openwork" | "outbox" | null | undefined): string {
  if (kind === "opencode") return "OpenCode import";
  if (kind === "openwork") return "OpenWork import";
  if (kind === "outbox") return "Legacy outbox";
  return "Imported";
}

export function outputDescriptorFromOpenTarget(target: OpenTarget, receipt?: WorkflowOutputReceipt): OutputDescriptor {
  const context = getArtifactNoteContext(target.value);
  const title = target.name || context.fileName || target.value;

  return {
    id: target.id,
    kind: "file",
    title,
    path: context.path,
    desk: receipt?.desk ?? context.desk,
    sessionSlug: receipt?.sessionSlug ?? context.sessionSlug,
    sourceId: receipt?.taskId,
    updatedAt: receipt?.updatedAt ?? target.updatedAt,
    size: target.size,
    exists: target.exists,
    preview: target.preview,
    isLegacy: context.isLegacy,
    originLabel: context.isLegacy
      ? legacyOriginLabel(context.legacyKind)
      : receipt?.desk
        ? deskLabel(receipt.desk)
        : context.desk
        ? deskLabel(context.desk)
        : undefined,
    receiptStatus: receipt?.status,
    receiptTitle: receipt?.title,
    receiptSummary: receipt?.summary,
    taskId: receipt?.taskId,
    receiptArtifactCount: receipt?.artifactCount,
  };
}

export function outputDescriptorFromNoteAttachment(attachment: NoteOutputAttachment): OutputDescriptor {
  const context = getArtifactNoteContext(attachment.id);

  return {
    id: `note-output:${attachment.id}`,
    kind: "note-attachment",
    title: attachment.label || context.fileName || attachment.id,
    path: context.path,
    desk: context.desk,
    sessionSlug: context.sessionSlug,
    isLegacy: context.isLegacy,
    originLabel: context.isLegacy ? legacyOriginLabel(context.legacyKind) : "Project note",
  };
}

export function outputDescriptorFromNoteAttachmentAny(attachment: NoteAttachment): OutputDescriptor | null {
  if (attachment.type !== "output") return null;
  return outputDescriptorFromNoteAttachment(attachment);
}

export function deskLabel(desk: string): string {
  if (desk === "bittensor") return "Bittensor";
  if (desk === "hyperliquid") return "Hyperliquid";
  if (desk === "polymarket") return "Polymarket";
  if (desk === "longevity" || desk === "wellness") return "Longevity";
  if (desk === "memory") return "Memory";
  if (desk === "mcp") return "MCP";
  return desk
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatOutputPath(path: string): string {
  return path.replace(/^\.+[/\\]/, "").replace(/^[\/\\]+/, "");
}
