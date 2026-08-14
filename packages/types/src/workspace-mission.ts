import type {
  MatterhornProjectDataLedgerEntry,
  MatterhornProjectDataLedgerSummary,
} from "./project-data-ledger.js";
import type {
  MatterhornWorkflowRunListItem,
  MatterhornWorkflowRunStatus,
} from "./workflow-runs.js";

export const MATTERHORN_WORKSPACE_MISSION_VERSION = "matterhorn.workspace-mission.v1" as const;
export const MATTERHORN_WORKSPACE_MISSION_OVERVIEW_VERSION = "matterhorn.workspace-mission-overview.v1" as const;

export const MATTERHORN_WORKSPACE_MISSION_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;

export type MatterhornWorkspaceMissionStatus =
  (typeof MATTERHORN_WORKSPACE_MISSION_STATUSES)[number];

export const MATTERHORN_MISSION_DESK_IDS = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
  "wellness",
] as const;

export type MatterhornMissionDeskId = (typeof MATTERHORN_MISSION_DESK_IDS)[number];

export interface MatterhornWorkspaceMission {
  version: typeof MATTERHORN_WORKSPACE_MISSION_VERSION;
  id: string;
  workspaceId: string;
  objective: string;
  successCriteria: string[];
  deskIds: MatterhornMissionDeskId[];
  networks: string[];
  status: MatterhornWorkspaceMissionStatus;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface MatterhornWorkspaceMissionUpdateRequest {
  objective?: string;
  successCriteria?: string[];
  deskIds?: MatterhornMissionDeskId[];
  networks?: string[];
  status?: MatterhornWorkspaceMissionStatus;
}

export interface MatterhornWorkspaceMissionResponse {
  success: true;
  version: typeof MATTERHORN_WORKSPACE_MISSION_VERSION;
  generatedAt: string;
  workspace: {
    id: string;
    name: string;
    type: "local" | "remote";
    preset: string;
  };
  mission: MatterhornWorkspaceMission | null;
  writable: boolean;
}

export const MATTERHORN_ATTENTION_KINDS = [
  "needs_input",
  "ready_to_start",
  "run_failed",
  "run_delayed",
  "approval_ready",
  "wallet_issue",
] as const;

export type MatterhornAttentionKind = (typeof MATTERHORN_ATTENTION_KINDS)[number];
export type MatterhornAttentionPriority = "high" | "normal" | "low";
export type MatterhornAttentionSource = "workflow" | "evidence";

export interface MatterhornAttentionItem {
  id: string;
  kind: MatterhornAttentionKind;
  priority: MatterhornAttentionPriority;
  source: MatterhornAttentionSource;
  title: string;
  summary: string;
  occurredAt: string;
  deskId?: string;
  sessionId?: string;
  workflowRunId?: string;
  href?: string;
}

export interface MatterhornMissionRunSummary {
  total: number;
  byStatus: Record<MatterhornWorkflowRunStatus, number>;
}

export interface MatterhornWorkspaceMissionOverviewResponse {
  success: true;
  version: typeof MATTERHORN_WORKSPACE_MISSION_OVERVIEW_VERSION;
  generatedAt: string;
  workspace: MatterhornWorkspaceMissionResponse["workspace"];
  mission: MatterhornWorkspaceMission | null;
  writable: boolean;
  attention: MatterhornAttentionItem[];
  runs: {
    items: MatterhornWorkflowRunListItem[];
    summary: MatterhornMissionRunSummary;
  };
  evidence: {
    items: MatterhornProjectDataLedgerEntry[];
    summary: MatterhornProjectDataLedgerSummary;
    href: string;
  };
}
