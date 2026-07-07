import type { MatterhornProjectEvidenceEvent } from "@matterhorn-work/types/project-evidence";

import {
  nftReceiptMetadataFromEvidence,
  type NftReceiptMetadata,
} from "../../project-evidence/nft-receipt-metadata";
import { classifyOpenTarget, type OpenTarget } from "./open-target";

export type WorkflowOutputReceiptStatus = "saved" | "completed" | "failed" | "cancelled" | "generated" | "published";
export type WorkflowOutputReceiptKind = "workflow" | "image" | "nft";

export type WorkflowOutputReceipt = {
  id: string;
  kind: WorkflowOutputReceiptKind;
  outputPath: string;
  title: string;
  summary?: string;
  desk?: string;
  sessionSlug?: string;
  taskId?: string;
  timestamp: string;
  updatedAt?: number;
  status: WorkflowOutputReceiptStatus;
  source: MatterhornProjectEvidenceEvent["source"];
  artifactCount: number;
  nftReceipt?: NftReceiptMetadata;
};

const RECEIPT_EVENT_TYPES = new Set<MatterhornProjectEvidenceEvent["type"]>([
  "task.output_saved",
  "task.completed",
  "task.failed",
  "task.cancelled",
  "image.generated",
  "nft.minted",
  "nft.listed",
]);

const STATUS_PRIORITY: Record<WorkflowOutputReceiptStatus, number> = {
  published: 5,
  generated: 4,
  saved: 4,
  completed: 3,
  failed: 2,
  cancelled: 1,
};

export function normalizeOutputReceiptPath(path: string): string {
  return path
    .trim()
    .replace(/[\\]+/g, "/")
    .replace(/^\.\//, "")
    .replace(/^[\/]+/, "");
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function statusForEvent(event: MatterhornProjectEvidenceEvent): WorkflowOutputReceiptStatus | null {
  if (event.type === "task.output_saved") return "saved";
  if (event.type === "task.completed") return "completed";
  if (event.type === "task.failed") return "failed";
  if (event.type === "task.cancelled") return "cancelled";
  if (event.type === "image.generated") return "generated";
  if (event.type === "nft.minted" || event.type === "nft.listed") return "published";
  return null;
}

function kindForEvent(event: MatterhornProjectEvidenceEvent): WorkflowOutputReceiptKind {
  if (event.type === "image.generated") return "image";
  if (event.type.startsWith("nft.")) return "nft";
  return "workflow";
}

function eventOutputPaths(event: MatterhornProjectEvidenceEvent): string[] {
  return Array.from(new Set([
    ...(event.artifactPaths ?? []),
    ...(event.outputPath ? [event.outputPath] : []),
  ].map(normalizeOutputReceiptPath).filter(Boolean)));
}

function shouldReplaceReceipt(existing: WorkflowOutputReceipt, next: WorkflowOutputReceipt): boolean {
  const existingPriority = STATUS_PRIORITY[existing.status];
  const nextPriority = STATUS_PRIORITY[next.status];
  if (nextPriority !== existingPriority) return nextPriority > existingPriority;
  return (next.updatedAt ?? 0) >= (existing.updatedAt ?? 0);
}

export function workflowOutputReceiptsFromEvidence(events: MatterhornProjectEvidenceEvent[]): WorkflowOutputReceipt[] {
  const receiptsByPath = new Map<string, WorkflowOutputReceipt>();
  const deletedAtByPath = new Map<string, number>();

  for (const event of events) {
    if (event.type !== "task.output_deleted") continue;
    const timestampMs = Date.parse(event.timestamp);
    for (const outputPath of eventOutputPaths(event)) {
      const key = outputPath.toLowerCase();
      deletedAtByPath.set(key, Math.max(deletedAtByPath.get(key) ?? 0, Number.isFinite(timestampMs) ? timestampMs : 0));
    }
  }

  for (const event of events) {
    if (!RECEIPT_EVENT_TYPES.has(event.type)) continue;
    const status = statusForEvent(event);
    if (!status) continue;

    const paths = eventOutputPaths(event);
    if (paths.length === 0) continue;

    const timestampMs = Date.parse(event.timestamp);

    for (const outputPath of paths) {
      const deletedAt = deletedAtByPath.get(outputPath.toLowerCase());
      if (deletedAt !== undefined && (!Number.isFinite(timestampMs) || timestampMs <= deletedAt)) {
        continue;
      }
      const kind = kindForEvent(event);
      const receipt: WorkflowOutputReceipt = {
        id: `workflow-output:${event.id}:${outputPath}`,
        kind,
        outputPath,
        title: event.title && event.title !== "Image generated"
          ? event.title
          : kind === "image"
            ? `Image generated: ${basename(outputPath)}`
            : event.title || basename(outputPath),
        summary: event.summary,
        desk: event.desk,
        sessionSlug: event.sessionSlug,
        taskId: event.taskId,
        timestamp: event.timestamp,
        updatedAt: Number.isFinite(timestampMs) ? timestampMs : undefined,
        status,
        source: event.source,
        artifactCount: paths.length,
        nftReceipt: kind === "nft" ? nftReceiptMetadataFromEvidence(event.metadata) : undefined,
      };
      const existing = receiptsByPath.get(outputPath);
      if (!existing || shouldReplaceReceipt(existing, receipt)) {
        receiptsByPath.set(outputPath, receipt);
      }
    }
  }

  return Array.from(receiptsByPath.values())
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

export function openTargetFromWorkflowOutputReceipt(receipt: WorkflowOutputReceipt): OpenTarget {
  const preview = classifyOpenTarget(receipt.outputPath, "file");
  const name = basename(receipt.outputPath);

  return {
    id: `file:${receipt.outputPath.toLowerCase()}`,
    kind: "file",
    value: receipt.outputPath,
    name,
    preview,
    confidence: 98,
    reason: "workflow output receipt",
    exists: true,
    updatedAt: receipt.updatedAt,
  };
}

export function mergeOpenTargetsWithWorkflowOutputReceipts(
  targets: OpenTarget[],
  receipts: WorkflowOutputReceipt[],
): OpenTarget[] {
  const targetsByPath = new Map<string, OpenTarget>();

  for (const target of targets) {
    targetsByPath.set(normalizeOutputReceiptPath(target.value).toLowerCase(), target);
  }

  for (const receipt of receipts) {
    const key = normalizeOutputReceiptPath(receipt.outputPath).toLowerCase();
    const receiptTarget = openTargetFromWorkflowOutputReceipt(receipt);
    const existing = targetsByPath.get(key);

    if (!existing) {
      targetsByPath.set(key, receiptTarget);
      continue;
    }

    const mergedUpdatedAt = Math.max(existing.updatedAt ?? 0, receipt.updatedAt ?? 0)
      || (existing.updatedAt ?? receipt.updatedAt);

    targetsByPath.set(key, {
      ...receiptTarget,
      ...existing,
      exists: existing.exists ?? true,
      updatedAt: mergedUpdatedAt,
      confidence: Math.max(existing.confidence, receiptTarget.confidence),
      reason: existing.reason.includes("workflow output receipt")
        ? existing.reason
        : `${existing.reason}; workflow output receipt`,
    });
  }

  return Array.from(targetsByPath.values())
    .sort((left, right) => {
      const timeDelta = (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
      if (timeDelta !== 0) return timeDelta;
      return right.confidence - left.confidence;
    });
}
