import type { MatterhornCapability } from "./backend-capabilities.js";

export const MATTERHORN_BACKEND_READINESS_VERSION = "matterhorn.backend.readiness.v1" as const;

export type MatterhornBackendReadinessFeatureId =
  | "start_chat"
  | "start_desk_task"
  | "save_notes"
  | "review_memory"
  | "save_memory"
  | "export_evidence";

export type MatterhornBackendReadinessCheckId =
  | "workspace_authorized"
  | "workspace_writable"
  | "opencode_connection"
  | "notes_store"
  | "memory_vault"
  | "outputs_folder"
  | "project_ledger";

export interface MatterhornBackendReadinessCheck extends MatterhornCapability {
  checkId: MatterhornBackendReadinessCheckId;
  requiredFor: MatterhornBackendReadinessFeatureId[];
}

export interface MatterhornBackendReadinessFeature extends MatterhornCapability {
  featureId: MatterhornBackendReadinessFeatureId;
  ready: boolean;
  blockingCheckIds: MatterhornBackendReadinessCheckId[];
}

export interface MatterhornBackendReadinessResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_READINESS_VERSION;
  generatedAt: string;
  workspace: {
    id: string;
    name: string;
    type: "local" | "remote";
    preset: string;
  };
  summary: {
    status: MatterhornCapability["status"];
    readyFeatures: number;
    totalFeatures: number;
    blockingChecks: MatterhornBackendReadinessCheckId[];
  };
  checks: Record<MatterhornBackendReadinessCheckId, MatterhornBackendReadinessCheck>;
  features: Record<MatterhornBackendReadinessFeatureId, MatterhornBackendReadinessFeature>;
}
