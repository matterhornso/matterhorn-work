import type { MatterhornCapability } from "./backend-capabilities.js";
import type { MatterhornBackendControlPlaneResponse } from "./backend-control-plane.js";

export const MATTERHORN_PROJECT_DATA_LEDGER_VERSION = "matterhorn.project-data-ledger.v1" as const;
export const MATTERHORN_PROJECT_DATA_LEDGER_EXPORT_VERSION = "matterhorn.project-data-ledger-export.v1" as const;

export const MATTERHORN_PROJECT_DATA_LEDGER_SOURCES = [
  "project_evidence",
  "audit",
  "feedback",
] as const;

export type MatterhornProjectDataLedgerSource =
  (typeof MATTERHORN_PROJECT_DATA_LEDGER_SOURCES)[number];

export type MatterhornProjectDataLedgerKind =
  | "note"
  | "memory_suggestion"
  | "task"
  | "output"
  | "audit"
  | "feedback";

export type MatterhornProjectDataLedgerDataClass =
  | "user_content"
  | "system_event"
  | "audit_metadata"
  | "feedback";

export type MatterhornProjectDataLedgerContainsSecrets =
  | "never"
  | "redacted"
  | "possible"
  | "unknown";

export type MatterhornProjectDataLedgerRetention =
  | "user_controlled"
  | "append_only"
  | "runtime_controlled"
  | "unknown";

export type MatterhornProjectDataLedgerTrainingUse =
  | "none"
  | "eval_routing_product_quality_only";

export interface MatterhornProjectDataLedgerEntry {
  id: string;
  workspaceId: string;
  source: MatterhornProjectDataLedgerSource;
  kind: MatterhornProjectDataLedgerKind;
  timestamp: string;
  title: string;
  summary?: string;
  desk?: string;
  sessionId?: string;
  sessionSlug?: string;
  taskId?: string;
  noteId?: string;
  outputPath?: string;
  artifactPaths?: string[];
  href?: string;
  actor?: {
    type: string;
    scope?: string;
  };
  dataClass: MatterhornProjectDataLedgerDataClass;
  containsUserContent: boolean;
  containsSecrets: MatterhornProjectDataLedgerContainsSecrets;
  retention: MatterhornProjectDataLedgerRetention;
  exportable: boolean;
  deletable: boolean;
  redactionApplied: boolean;
  trainingUse: MatterhornProjectDataLedgerTrainingUse;
  eventType?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface MatterhornProjectDataLedgerSummary {
  total: number;
  notes: number;
  memorySuggestions: number;
  tasks: number;
  outputs: number;
  audits: number;
  feedback: number;
  redacted: number;
}

export interface MatterhornProjectDataLedgerPolicy {
  trainingUse: "none_by_default";
  feedbackUse: "eval_routing_product_quality_only";
  redaction: MatterhornCapability;
  retention: MatterhornCapability;
  export: MatterhornCapability;
  deletion: MatterhornCapability;
  limitations: string[];
}

export interface MatterhornProjectDataLedgerListOptions {
  limit?: number;
  source?: MatterhornProjectDataLedgerSource;
  kind?: MatterhornProjectDataLedgerKind;
  desk?: string;
  sessionId?: string;
  taskId?: string;
  from?: string;
  to?: string;
}

export interface MatterhornProjectDataLedgerResponse {
  success: true;
  version: typeof MATTERHORN_PROJECT_DATA_LEDGER_VERSION;
  generatedAt: string;
  workspace: {
    id: string;
    name: string;
    path: string;
    type: "local" | "remote";
    preset: string;
  };
  items: MatterhornProjectDataLedgerEntry[];
  count: number;
  summary: MatterhornProjectDataLedgerSummary;
  policy: MatterhornProjectDataLedgerPolicy;
}

export type MatterhornProjectDataLedgerExportControlPlaneSnapshot = Pick<
  MatterhornBackendControlPlaneResponse,
  "version" | "generatedAt" | "workspace" | "summary" | "versions" | "privacy"
>;

export interface MatterhornProjectDataLedgerExportResponse {
  success: true;
  version: typeof MATTERHORN_PROJECT_DATA_LEDGER_EXPORT_VERSION;
  generatedAt: string;
  filename: string;
  ledger: MatterhornProjectDataLedgerResponse;
  manifest: {
    exportedAt: string;
    workspaceId: string;
    itemCount: number;
    redactedCount: number;
    filters: {
      source?: MatterhornProjectDataLedgerSource;
      kind?: MatterhornProjectDataLedgerKind;
      desk?: string;
      sessionId?: string;
      taskId?: string;
      from?: string;
      to?: string;
      limit: number;
    };
    backendContext: {
      included: boolean;
      version?: MatterhornProjectDataLedgerExportControlPlaneSnapshot["version"];
      generatedAt?: string;
    };
    includes: Array<"project_evidence" | "audit" | "feedback">;
    trainingUse: "none_by_default";
    feedbackUse: "eval_routing_product_quality_only";
    limitations: string[];
  };
  backend?: {
    controlPlane: MatterhornProjectDataLedgerExportControlPlaneSnapshot;
  };
  warnings: string[];
}

export const MATTERHORN_PROJECT_FEEDBACK_KINDS = [
  "thumbs_up",
  "thumbs_down",
  "rating",
  "comment",
  "bug",
  "feature_request",
] as const;

export type MatterhornProjectFeedbackKind =
  (typeof MATTERHORN_PROJECT_FEEDBACK_KINDS)[number];

export interface MatterhornProjectFeedbackTarget {
  sourceId?: string;
  sourceType?: "chat" | "task" | "output" | "memory" | "note" | "settings" | "wallet" | "other";
  href?: string;
}

export interface MatterhornProjectFeedbackRequest {
  kind: MatterhornProjectFeedbackKind;
  rating?: number;
  comment?: string;
  target?: MatterhornProjectFeedbackTarget;
}

export interface MatterhornProjectFeedbackEntry extends MatterhornProjectFeedbackRequest {
  id: string;
  workspaceId: string;
  createdAt: string;
  actor?: {
    type: string;
    scope?: string;
  };
  trainingUse: "eval_routing_product_quality_only";
  redactionApplied: boolean;
}

export interface MatterhornProjectFeedbackResponse {
  success: true;
  feedback: MatterhornProjectFeedbackEntry;
}
