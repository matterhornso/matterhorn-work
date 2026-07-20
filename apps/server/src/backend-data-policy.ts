import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  MatterhornWorkspaceAppendOnlyRetentionMode,
  MatterhornWorkspaceAppendOnlyRetentionPolicy,
  MatterhornWorkspaceDataPolicyRecord,
  MatterhornWorkspaceDataPolicyResponse,
  MatterhornWorkspaceDataPolicyUpdateRequest,
  MatterhornWorkspaceFeedbackUse,
} from "@matterhorn-work/types/backend-data-policy";
import { atomicWriteTextFile } from "./atomic-file.js";
import type { WorkspaceInfo } from "./types.js";

export function workspaceDataPolicyPath(workspace: WorkspaceInfo): string {
  return join(workspace.path, ".matterhorn-work", "privacy", "data-policy.json");
}

function normalizeAppendOnlyRetention(value: unknown): MatterhornWorkspaceAppendOnlyRetentionMode {
  if (value === "accountability_default") return value;
  return "accountability_default";
}

export function buildAppendOnlyRetentionPolicy(workspaceId: string): MatterhornWorkspaceAppendOnlyRetentionPolicy {
  return {
    mode: "accountability_default",
    label: "Accountability default",
    summary: "Audit, task event, and workflow run rows are append-only local records retained for accountability and exported through the project ledger.",
    stores: ["audit", "taskEvents", "workflowRuns"],
    exportRoute: `/workspace/${encodeURIComponent(workspaceId)}/data-ledger/export`,
    windowDays: null,
    windowLabel: "No automatic purge window in this local build.",
    purgeSupported: false,
    configurable: false,
  };
}

function defaultDataPolicyRecord(): MatterhornWorkspaceDataPolicyRecord {
  return {
    version: "matterhorn.backend.data-policy.v1",
    feedbackUse: "eval_routing_product_quality_only",
    appendOnlyRetention: "accountability_default",
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeFeedbackUse(value: unknown): MatterhornWorkspaceFeedbackUse {
  if (value === "eval_routing_product_quality_only" || value === "disabled") return value;
  return "eval_routing_product_quality_only";
}

function normalizeDataPolicyRecord(value: unknown): MatterhornWorkspaceDataPolicyRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultDataPolicyRecord();
  const record = value as Record<string, unknown>;
  const updatedAt = typeof record.updatedAt === "string" && record.updatedAt.trim()
    ? record.updatedAt.trim()
    : new Date(0).toISOString();
  const updatedBy = typeof record.updatedBy === "string" && record.updatedBy.trim()
    ? record.updatedBy.trim().slice(0, 80)
    : undefined;

  return {
    version: "matterhorn.backend.data-policy.v1",
    feedbackUse: normalizeFeedbackUse(record.feedbackUse),
    appendOnlyRetention: normalizeAppendOnlyRetention(record.appendOnlyRetention),
    updatedAt,
    ...(updatedBy ? { updatedBy } : {}),
  };
}

export function readWorkspaceDataPolicySync(workspace: WorkspaceInfo): MatterhornWorkspaceDataPolicyRecord {
  const path = workspaceDataPolicyPath(workspace);
  if (!existsSync(path)) return defaultDataPolicyRecord();
  try {
    return normalizeDataPolicyRecord(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return defaultDataPolicyRecord();
  }
}

export async function readWorkspaceDataPolicy(workspace: WorkspaceInfo): Promise<MatterhornWorkspaceDataPolicyRecord> {
  const path = workspaceDataPolicyPath(workspace);
  if (!existsSync(path)) return defaultDataPolicyRecord();
  try {
    return normalizeDataPolicyRecord(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return defaultDataPolicyRecord();
  }
}

export function buildWorkspaceDataPolicyResponse(workspace: WorkspaceInfo): MatterhornWorkspaceDataPolicyResponse {
  const path = workspaceDataPolicyPath(workspace);
  const record = readWorkspaceDataPolicySync(workspace);
  const feedbackEnabled = record.feedbackUse !== "disabled";
  const appendOnlyRetention = buildAppendOnlyRetentionPolicy(workspace.id);

  return {
    success: true,
    version: "matterhorn.backend.data-policy.v1",
    generatedAt: new Date().toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      type: workspace.workspaceType,
      preset: workspace.preset,
    },
    storage: {
      path,
      exists: existsSync(path),
    },
    policy: {
      trainingUse: "none_by_default",
      feedbackUse: record.feedbackUse,
      appendOnlyRetention,
      secretsReturned: false,
    },
    controls: {
      modelTraining: {
        status: "unsupported",
        label: "Model training disabled",
        description: "Matterhorn Desks does not use workspace chats, notes, outputs, memory, wallet evidence, or feedback for RL or model training.",
        configurable: false,
        rlTraining: false,
      },
      feedback: {
        status: feedbackEnabled ? "working" : "unsupported",
        label: feedbackEnabled ? "Feedback enabled" : "Feedback disabled",
        description: feedbackEnabled
          ? "Explicit user feedback is stored locally for evaluation, routing, and product quality only."
          : "New feedback writes are blocked for this workspace. Existing feedback can still be exported or deleted.",
        configurable: true,
        enabled: feedbackEnabled,
        route: `/workspace/${encodeURIComponent(workspace.id)}/feedback`,
      },
      retention: {
        status: "working",
        description: appendOnlyRetention.summary,
        ...appendOnlyRetention,
      },
    },
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

export async function writeWorkspaceDataPolicy(
  workspace: WorkspaceInfo,
  request: MatterhornWorkspaceDataPolicyUpdateRequest,
  updatedBy?: string,
): Promise<MatterhornWorkspaceDataPolicyResponse> {
  const current = await readWorkspaceDataPolicy(workspace);
  const next: MatterhornWorkspaceDataPolicyRecord = {
    version: "matterhorn.backend.data-policy.v1",
    feedbackUse: request.feedbackUse ? normalizeFeedbackUse(request.feedbackUse) : current.feedbackUse,
    appendOnlyRetention: current.appendOnlyRetention,
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy: updatedBy.slice(0, 80) } : {}),
  };
  const path = workspaceDataPolicyPath(workspace);
  await atomicWriteTextFile(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return buildWorkspaceDataPolicyResponse(workspace);
}
