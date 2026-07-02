export const MATTERHORN_WORKFLOW_RUN_STATUSES = [
  "staged",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
] as const;
export type MatterhornWorkflowRunStatus = (typeof MATTERHORN_WORKFLOW_RUN_STATUSES)[number];

export const MATTERHORN_WORKFLOW_RUN_EVENT_TYPES = [
  "workflow.staged",
  "workflow.started",
  "workflow.stage_started",
  "workflow.tool_called",
  "workflow.artifact_saved",
  "workflow.waiting_for_user",
  "workflow.completed",
  "workflow.failed",
  "workflow.cancelled",
] as const;
export type MatterhornWorkflowRunEventType = (typeof MATTERHORN_WORKFLOW_RUN_EVENT_TYPES)[number];

export type MatterhornWorkflowRunEventPayload = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface MatterhornWorkflowRunEvent {
  eventId: string;
  workflowRunId: string;
  type: MatterhornWorkflowRunEventType;
  timestamp: number;
  stageId?: string;
  actionId?: string;
  payload?: MatterhornWorkflowRunEventPayload;
  redacted?: boolean;
}

export interface MatterhornWorkflowRun {
  workflowRunId: string;
  workspaceId: string;
  sessionId: string;
  deskId: string;
  agentId: string;
  workflowId: string;
  actionId?: string;
  stageId?: string;
  visibleUserIntent: string;
  hiddenAgentInstructions?: string;
  workflowManifestRef?: string;
  status: MatterhornWorkflowRunStatus;
  outputBasePath: string;
  createdAt: number;
  updatedAt: number;
  events: MatterhornWorkflowRunEvent[];
}

export const MATTERHORN_WORKFLOW_RUN_EVENT_REDACTED_FIELD_PATTERNS = [
  "privateKey",
  "private_key",
  "apiKey",
  "api_key",
  "apiSecret",
  "api_secret",
  "secret",
  "token",
  "authToken",
  "auth_token",
  "seed",
  "seedPhrase",
  "seed_phrase",
  "mnemonic",
  "walletExport",
  "wallet_export",
  "rawSignature",
  "raw_signature",
  "signedPayload",
  "signed_payload",
  "password",
  "ssn",
  "clinicalRecord",
  "clinical_record",
  "diagnosis",
  "prescription",
  "medicalRecord",
  "medical_record",
  "patientId",
  "patient_id",
] as const;

export type MatterhornWorkflowRunRedactedFieldPattern =
  (typeof MATTERHORN_WORKFLOW_RUN_EVENT_REDACTED_FIELD_PATTERNS)[number];

export interface MatterhornWorkflowRunListItem {
  workflowRunId: string;
  workspaceId: string;
  sessionId: string;
  deskId: string;
  agentId: string;
  workflowId: string;
  status: MatterhornWorkflowRunStatus;
  visibleUserIntent: string;
  outputBasePath: string;
  createdAt: number;
  updatedAt: number;
}

export interface MatterhornWorkflowRunStageInput {
  workspaceId: string;
  sessionId: string;
  deskId: string;
  actionId?: string;
  stageId?: string;
  visibleUserIntent: string;
  hiddenAgentInstructions?: string;
  workflowManifestRef?: string;
}

export interface MatterhornWorkflowRunFilters {
  workspaceId?: string;
  sessionId?: string;
  deskId?: string;
  status?: MatterhornWorkflowRunStatus;
  limit?: number;
}
