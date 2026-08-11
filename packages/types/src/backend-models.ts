import type { MatterhornCapability } from "./backend-capabilities.js";

export const MATTERHORN_BACKEND_MODELS_VERSION = "matterhorn.backend.models.v1" as const;
export const MATTERHORN_BACKEND_MODEL_SELECTION_VERSION = "matterhorn.backend.model-selection.v1" as const;

export type MatterhornBackendModelListSource =
  | "opencode_provider_list"
  | "matterhorn_backend_registry"
  | "unknown";

export interface MatterhornBackendModelRef {
  providerId: string;
  modelId: string;
}

export type MatterhornBackendModelSelectionSource =
  | "server_workspace_preference"
  | "server_default"
  | "local_preferences"
  | "unknown";

export interface MatterhornBackendModelSelectionRecord extends MatterhornBackendModelRef {
  source: "server_workspace_preference";
  variant?: string;
  savedAt: string;
  savedBy?: {
    type: string;
    scope?: string;
  };
}

export interface MatterhornBackendModelSelectionRequest extends MatterhornBackendModelRef {
  variant?: string | null;
}

export interface MatterhornBackendModelSelectionResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_MODEL_SELECTION_VERSION;
  generatedAt: string;
  workspace: {
    id: string;
    name: string;
    type: "local" | "remote";
  };
  selection: MatterhornBackendModelSelectionRecord | null;
  effectiveModel: MatterhornBackendModelRef & {
    source: Extract<MatterhornBackendModelSelectionSource, "server_workspace_preference" | "server_default">;
    variant?: string | null;
  };
  storage: MatterhornCapability & {
    scope: "workspace";
    path: string;
    containsSecrets: false;
    auditLogged: boolean;
  };
  policy: {
    storesCredentials: false;
    userSelectable: true;
    writeRequires: Array<"collaborator" | "writable_server">;
    feedbackTrainingUse: "none_by_default";
  };
  privacy: MatterhornProviderPrivacySummary;
}

export type MatterhornBackendModelCatalogErrorCode =
  | "opencode_unconfigured"
  | "opencode_request_failed"
  | "unknown";

export interface MatterhornBackendModelProviderSummary {
  id: string;
  name: string;
  source?: "env" | "api" | "config" | "custom" | "unknown" | string;
  connected: boolean;
  modelCount: number;
  modelIds: string[];
  sampleModels: string[];
}

export type MatterhornProviderPrivacyStatus =
  | "verified_no_training"
  | "local_processing"
  | "opt_in_training"
  | "unverified";

export type MatterhornProviderTrainingUse =
  | "none"
  | "opt_in_only"
  | "unknown";

export type MatterhornProviderPrivacyEnforcementMode =
  | "verified_only"
  | "disclosure";

export interface MatterhornProviderPrivacyPolicy {
  providerId: string;
  providerName: string;
  status: MatterhornProviderPrivacyStatus;
  trainingUse: MatterhornProviderTrainingUse;
  retentionDays: number | null;
  policyUrl: string | null;
  verifiedAt: string | null;
  allowed: boolean;
  label: string;
  description: string;
}

export interface MatterhornProviderPrivacySummary {
  matterhornTrainingUse: "none";
  enforcementMode: MatterhornProviderPrivacyEnforcementMode;
  providers: MatterhornProviderPrivacyPolicy[];
}

export interface MatterhornBackendModelCatalogSnapshot extends MatterhornCapability {
  source: MatterhornBackendModelListSource;
  serverFetched: boolean;
  providerCount: number;
  connectedProviderCount: number;
  modelCount: number;
  connectedProviderIds: string[];
  defaultModels: Record<string, string>;
  providers: MatterhornBackendModelProviderSummary[];
  errorCode?: MatterhornBackendModelCatalogErrorCode;
}

export interface MatterhornBackendModelRouting {
  answerPath: MatterhornCapability & {
    transport: "opencode_session_prompt_async" | "unknown";
    requestModelField: "model.providerID_modelID" | "none" | "unknown";
  };
  selection: MatterhornCapability & {
    userSelectable: boolean;
    surface: "model_picker" | "settings" | "none" | "unknown";
    preferenceStore: "local_preferences" | "server" | "unknown";
    serverPersisted: boolean;
  };
  registry: MatterhornCapability & {
    source: MatterhornBackendModelListSource;
    serverOwned: boolean;
    clientTool?: "opencode_client_provider_list";
    cloudProviderImport: boolean;
  };
}

export interface MatterhornBackendModelsResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_MODELS_VERSION;
  generatedAt: string;
  defaultModel: MatterhornBackendModelRef & {
    source: MatterhornBackendModelSelectionSource;
    variant?: string | null;
  };
  workspaceSelection?: MatterhornBackendModelSelectionRecord | null;
  catalog: MatterhornBackendModelCatalogSnapshot;
  routing: MatterhornBackendModelRouting;
  privacy: {
    trainingUse: "none_by_default";
    feedbackUse: "eval_routing_product_quality_only";
  } & MatterhornProviderPrivacySummary;
  limitations: string[];
}
