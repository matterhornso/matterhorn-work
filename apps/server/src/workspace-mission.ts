import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  MATTERHORN_MISSION_DESK_IDS,
  MATTERHORN_WORKSPACE_MISSION_STATUSES,
  MATTERHORN_WORKSPACE_MISSION_VERSION,
  type MatterhornAttentionItem,
  type MatterhornMissionDeskId,
  type MatterhornMissionRunSummary,
  type MatterhornWorkspaceMission,
  type MatterhornWorkspaceMissionStatus,
  type MatterhornWorkspaceMissionUpdateRequest,
} from "@matterhorn-work/types/workspace-mission";
import type { MatterhornProjectDataLedgerEntry } from "@matterhorn-work/types/project-data-ledger";
import {
  MATTERHORN_WORKFLOW_RUN_STATUSES,
  type MatterhornWorkflowRunListItem,
} from "@matterhorn-work/types/workflow-runs";

import { atomicWriteTextFile } from "./atomic-file.js";
import type { WorkspaceInfo } from "./types.js";

const SECRET_VALUE_PATTERN = /\b(seed phrase|mnemonic|private key|wallet export|raw signature|signed payload|api secret)\b|Bearer\s+[A-Za-z0-9._-]{8,}|0x[A-Fa-f0-9]{64}\b/i;
const SECRET_KEY_PATTERN = /seed|mnemonic|private[_-]?key|wallet[_\s-]?export|raw[_\s-]?signature|signed[_\s-]?payload|api[_\s-]?(?:key|secret)|bearer|password|token/i;
const MISSION_UPDATE_FIELDS = new Set(["objective", "successCriteria", "deskIds", "networks", "status"]);
const MAX_OBJECTIVE_LENGTH = 1_000;
const MAX_SUCCESS_CRITERIA = 10;
const MAX_SUCCESS_CRITERION_LENGTH = 240;
const MAX_NETWORKS = 12;
const MAX_NETWORK_LENGTH = 80;
const RUN_DELAY_THRESHOLD_MS = 5 * 60_000;

const missionStatuses = new Set<string>(MATTERHORN_WORKSPACE_MISSION_STATUSES);
const missionDeskIds = new Set<string>(MATTERHORN_MISSION_DESK_IDS);

export function workspaceMissionPath(workspace: WorkspaceInfo): string {
  return join(workspace.path, ".matterhorn-work", "project", "mission.json");
}

function normalizeStoredText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}

function normalizeStoredMission(value: unknown, workspaceId: string): MatterhornWorkspaceMission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const objective = normalizeStoredText(record.objective, MAX_OBJECTIVE_LENGTH);
  if (!objective || record.workspaceId !== workspaceId) return null;

  const status = typeof record.status === "string" && missionStatuses.has(record.status)
    ? record.status as MatterhornWorkspaceMissionStatus
    : "active";
  const deskIds = Array.isArray(record.deskIds)
    ? Array.from(new Set(record.deskIds.filter(
      (deskId): deskId is MatterhornMissionDeskId => typeof deskId === "string" && missionDeskIds.has(deskId),
    )))
    : [];
  const successCriteria = Array.isArray(record.successCriteria)
    ? record.successCriteria
      .map((criterion) => normalizeStoredText(criterion, MAX_SUCCESS_CRITERION_LENGTH))
      .filter(Boolean)
      .slice(0, MAX_SUCCESS_CRITERIA)
    : [];
  const networks = Array.isArray(record.networks)
    ? Array.from(new Set(record.networks
      .map((network) => normalizeStoredText(network, MAX_NETWORK_LENGTH))
      .filter(Boolean)))
      .slice(0, MAX_NETWORKS)
    : [];
  const createdAt = normalizeStoredText(record.createdAt, 40) || new Date(0).toISOString();
  const updatedAt = normalizeStoredText(record.updatedAt, 40) || createdAt;
  const updatedBy = normalizeStoredText(record.updatedBy, 80) || undefined;

  return {
    version: MATTERHORN_WORKSPACE_MISSION_VERSION,
    id: normalizeStoredText(record.id, 100) || `mission_${workspaceId}`,
    workspaceId,
    objective,
    successCriteria,
    deskIds,
    networks,
    status,
    createdAt,
    updatedAt,
    ...(updatedBy ? { updatedBy } : {}),
  };
}

export async function readWorkspaceMission(workspace: WorkspaceInfo): Promise<MatterhornWorkspaceMission | null> {
  const path = workspaceMissionPath(workspace);
  if (!existsSync(path)) return null;
  try {
    return normalizeStoredMission(JSON.parse(await readFile(path, "utf8")), workspace.id);
  } catch {
    return null;
  }
}

export async function deleteWorkspaceMission(workspace: WorkspaceInfo): Promise<boolean> {
  const path = workspaceMissionPath(workspace);
  const existed = existsSync(path);
  await rm(path, { force: true });
  return existed;
}

function normalizeRequiredText(value: unknown, label: string, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required`);
  if (text.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  if (SECRET_VALUE_PATTERN.test(text)) throw new Error(`${label} cannot contain secret-shaped wallet or API material`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new Error(`${label} contains unsupported control characters`);
  }
  return text;
}

function normalizeTextList(
  value: unknown,
  label: string,
  options: { maxItems: number; maxLength: number },
): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a list`);
  if (value.length > options.maxItems) throw new Error(`${label} supports at most ${options.maxItems} items`);
  return Array.from(new Set(value.map((item, index) =>
    normalizeRequiredText(item, `${label} item ${index + 1}`, options.maxLength),
  )));
}

function normalizeDeskIds(value: unknown): MatterhornMissionDeskId[] {
  if (!Array.isArray(value)) throw new Error("deskIds must be a list");
  const deskIds = Array.from(new Set(value.map((deskId) => String(deskId).trim())));
  const unknownDesk = deskIds.find((deskId) => !missionDeskIds.has(deskId));
  if (unknownDesk) throw new Error(`Unknown mission desk: ${unknownDesk}`);
  return deskIds as MatterhornMissionDeskId[];
}

export function coerceWorkspaceMissionUpdate(value: unknown): MatterhornWorkspaceMissionUpdateRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Mission update must be an object");
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (SECRET_KEY_PATTERN.test(key)) throw new Error(`Mission update contains forbidden field: ${key}`);
    if (!MISSION_UPDATE_FIELDS.has(key)) throw new Error(`Unknown mission field: ${key}`);
  }
  return {
    ...(record.objective !== undefined ? { objective: record.objective as string } : {}),
    ...(record.successCriteria !== undefined ? { successCriteria: record.successCriteria as string[] } : {}),
    ...(record.deskIds !== undefined ? { deskIds: record.deskIds as MatterhornMissionDeskId[] } : {}),
    ...(record.networks !== undefined ? { networks: record.networks as string[] } : {}),
    ...(record.status !== undefined ? { status: record.status as MatterhornWorkspaceMissionStatus } : {}),
  };
}

export async function writeWorkspaceMission(
  workspace: WorkspaceInfo,
  request: MatterhornWorkspaceMissionUpdateRequest,
  updatedBy?: string,
): Promise<MatterhornWorkspaceMission> {
  const current = await readWorkspaceMission(workspace);
  const now = new Date().toISOString();
  const objective = request.objective !== undefined
    ? normalizeRequiredText(request.objective, "Mission objective", MAX_OBJECTIVE_LENGTH)
    : current?.objective;
  if (!objective) throw new Error("Mission objective is required");

  const status = request.status !== undefined
    ? missionStatuses.has(request.status)
      ? request.status
      : null
    : current?.status ?? "active";
  if (!status) throw new Error("Mission status is invalid");

  const mission: MatterhornWorkspaceMission = {
    version: MATTERHORN_WORKSPACE_MISSION_VERSION,
    id: current?.id ?? `mission_${randomUUID()}`,
    workspaceId: workspace.id,
    objective,
    successCriteria: request.successCriteria !== undefined
      ? normalizeTextList(request.successCriteria, "Success criteria", {
        maxItems: MAX_SUCCESS_CRITERIA,
        maxLength: MAX_SUCCESS_CRITERION_LENGTH,
      })
      : current?.successCriteria ?? [],
    deskIds: request.deskIds !== undefined
      ? normalizeDeskIds(request.deskIds)
      : current?.deskIds ?? [],
    networks: request.networks !== undefined
      ? normalizeTextList(request.networks, "Networks", {
        maxItems: MAX_NETWORKS,
        maxLength: MAX_NETWORK_LENGTH,
      })
      : current?.networks ?? [],
    status,
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    ...(updatedBy ? { updatedBy: updatedBy.slice(0, 80) } : {}),
  };

  await atomicWriteTextFile(workspaceMissionPath(workspace), `${JSON.stringify(mission, null, 2)}\n`, {
    mode: 0o600,
  });
  return mission;
}

function isoFromMillis(value: number): string {
  return new Date(value).toISOString();
}

function workflowAttentionItem(
  run: MatterhornWorkflowRunListItem,
  now: number,
): MatterhornAttentionItem | null {
  const common = {
    id: `workflow:${run.workflowRunId}:${run.status}`,
    source: "workflow" as const,
    occurredAt: isoFromMillis(run.updatedAt),
    deskId: run.deskId,
    sessionId: run.sessionId,
    workflowRunId: run.workflowRunId,
    href: `/workspace/${encodeURIComponent(run.workspaceId)}/session/${encodeURIComponent(run.sessionId)}`,
  };
  if (run.status === "waiting") {
    return {
      ...common,
      kind: "needs_input",
      priority: "high",
      title: "Your input is needed",
      summary: run.visibleUserIntent,
    };
  }
  if (run.status === "failed") {
    return {
      ...common,
      kind: "run_failed",
      priority: "high",
      title: "A desk run needs attention",
      summary: run.visibleUserIntent,
    };
  }
  if (run.status === "staged") {
    return {
      ...common,
      kind: "ready_to_start",
      priority: "low",
      title: "A prepared run is ready to start",
      summary: run.visibleUserIntent,
    };
  }
  if (run.status === "running" && now - run.updatedAt >= RUN_DELAY_THRESHOLD_MS) {
    return {
      ...common,
      kind: "run_delayed",
      priority: "normal",
      title: "A desk run is taking longer than usual",
      summary: run.visibleUserIntent,
    };
  }
  return null;
}

function walletAttentionItem(entry: MatterhornProjectDataLedgerEntry): MatterhornAttentionItem | null {
  if (entry.kind !== "wallet") return null;
  const safetyAction = typeof entry.metadata?.safetyAction === "string"
    ? entry.metadata.safetyAction
    : "";
  if (safetyAction === "tx_proposed" || entry.title === "Wallet transaction proposed") {
    return {
      id: `evidence:${entry.id}:approval`,
      kind: "approval_ready",
      priority: "high",
      source: "evidence",
      title: "Wallet review is ready",
      summary: entry.summary ?? "Review the exact transaction terms before approving in your connected wallet.",
      occurredAt: entry.timestamp,
      deskId: entry.desk,
      sessionId: entry.sessionId,
      href: entry.href,
    };
  }
  const issueActions = new Set([
    "chain_mismatch",
    "mainnet_blocked",
    "wallet_unavailable",
    "limit_hit",
    "whitelist_denied",
    "rate_limit_hit",
    "simulation_failed",
    "countdown_expired",
  ]);
  if (issueActions.has(safetyAction)) {
    return {
      id: `evidence:${entry.id}:wallet-issue`,
      kind: "wallet_issue",
      priority: "high",
      source: "evidence",
      title: entry.title,
      summary: entry.summary ?? "Open Wallet to review the safety check and choose the next step.",
      occurredAt: entry.timestamp,
      deskId: entry.desk,
      sessionId: entry.sessionId,
      href: entry.href,
    };
  }
  return null;
}

export function buildWorkspaceAttentionInbox(input: {
  runs: MatterhornWorkflowRunListItem[];
  evidence: MatterhornProjectDataLedgerEntry[];
  now?: number;
  limit?: number;
}): MatterhornAttentionItem[] {
  const now = input.now ?? Date.now();
  const priorityRank = { high: 0, normal: 1, low: 2 } as const;
  return [
    ...input.runs.map((run) => workflowAttentionItem(run, now)),
    ...input.evidence.map(walletAttentionItem),
  ]
    .filter((item): item is MatterhornAttentionItem => item !== null)
    .sort((left, right) => {
      const priorityDifference = priorityRank[left.priority] - priorityRank[right.priority];
      if (priorityDifference !== 0) return priorityDifference;
      return Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    })
    .slice(0, input.limit ?? 20);
}

export function summarizeMissionRuns(runs: MatterhornWorkflowRunListItem[]): MatterhornMissionRunSummary {
  const byStatus = Object.fromEntries(
    MATTERHORN_WORKFLOW_RUN_STATUSES.map((status) => [status, 0]),
  ) as MatterhornMissionRunSummary["byStatus"];
  for (const run of runs) byStatus[run.status] += 1;
  return { total: runs.length, byStatus };
}
