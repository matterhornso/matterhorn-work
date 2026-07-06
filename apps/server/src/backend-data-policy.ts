import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type {
  MatterhornWorkspaceDataPolicyRecord,
  MatterhornWorkspaceDataPolicyResponse,
  MatterhornWorkspaceDataPolicyUpdateRequest,
  MatterhornWorkspaceFeedbackUse,
} from "@matterhorn-work/types/backend-data-policy";
import type { WorkspaceInfo } from "./types.js";
import { ensureDir } from "./utils.js";

export function workspaceDataPolicyPath(workspace: WorkspaceInfo): string {
  return join(workspace.path, ".matterhorn-work", "privacy", "data-policy.json");
}

function defaultDataPolicyRecord(): MatterhornWorkspaceDataPolicyRecord {
  return {
    version: "matterhorn.backend.data-policy.v1",
    feedbackUse: "eval_routing_product_quality_only",
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
      secretsReturned: false,
    },
    controls: {
      modelTraining: {
        status: "unsupported",
        label: "Model training disabled",
        description: "Matterhorn Work does not use workspace chats, notes, outputs, memory, wallet evidence, or feedback for RL or model training.",
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
    updatedAt: new Date().toISOString(),
    ...(updatedBy ? { updatedBy: updatedBy.slice(0, 80) } : {}),
  };
  const path = workspaceDataPolicyPath(workspace);
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return buildWorkspaceDataPolicyResponse(workspace);
}
