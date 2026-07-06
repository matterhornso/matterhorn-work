import type { MatterhornCapability } from "./backend-capabilities.js";

export const MATTERHORN_BACKEND_DATA_POLICY_VERSION = "matterhorn.backend.data-policy.v1" as const;

export type MatterhornWorkspaceModelTrainingUse = "none_by_default";
export type MatterhornWorkspaceFeedbackUse = "eval_routing_product_quality_only" | "disabled";
export type MatterhornWorkspaceAppendOnlyRetentionMode = "accountability_default";
export type MatterhornWorkspaceAppendOnlyStoreId = "audit" | "taskEvents" | "workflowRuns";

export interface MatterhornWorkspaceAppendOnlyRetentionPolicy {
  mode: MatterhornWorkspaceAppendOnlyRetentionMode;
  label: string;
  summary: string;
  stores: MatterhornWorkspaceAppendOnlyStoreId[];
  exportRoute: string;
  windowDays: null;
  windowLabel: string;
  purgeSupported: false;
  configurable: false;
}

export interface MatterhornWorkspaceDataPolicyRecord {
  version: typeof MATTERHORN_BACKEND_DATA_POLICY_VERSION;
  feedbackUse: MatterhornWorkspaceFeedbackUse;
  appendOnlyRetention: MatterhornWorkspaceAppendOnlyRetentionMode;
  updatedAt: string;
  updatedBy?: string;
}

export interface MatterhornWorkspaceDataPolicyUpdateRequest {
  feedbackUse?: MatterhornWorkspaceFeedbackUse;
}

export interface MatterhornWorkspaceDataPolicyResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_DATA_POLICY_VERSION;
  generatedAt: string;
  workspace: {
    id: string;
    name: string;
    type: "local" | "remote";
    preset: string;
  };
  storage: {
    path: string;
    exists: boolean;
  };
  policy: {
    trainingUse: MatterhornWorkspaceModelTrainingUse;
    feedbackUse: MatterhornWorkspaceFeedbackUse;
    appendOnlyRetention: MatterhornWorkspaceAppendOnlyRetentionPolicy;
    secretsReturned: false;
  };
  controls: {
    modelTraining: MatterhornCapability & {
      configurable: false;
      rlTraining: false;
    };
    feedback: MatterhornCapability & {
      configurable: true;
      enabled: boolean;
      route: string;
    };
    retention: MatterhornCapability & MatterhornWorkspaceAppendOnlyRetentionPolicy;
  };
  updatedAt?: string;
  updatedBy?: string;
}
