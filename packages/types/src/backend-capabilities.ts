export const MATTERHORN_BACKEND_CAPABILITIES_VERSION = "matterhorn.backend.capabilities.v1" as const;
export const MATTERHORN_BACKEND_DATA_MAP_VERSION = "matterhorn.backend.data-map.v1" as const;

export const MATTERHORN_CAPABILITY_STATUSES = [
  "working",
  "needs_setup",
  "preview",
  "unsupported",
  "error",
] as const;

export type MatterhornCapabilityStatus = (typeof MATTERHORN_CAPABILITY_STATUSES)[number];

export interface MatterhornCapabilityAction {
  id: string;
  label: string;
  kind: "route" | "external_link" | "command" | "copy";
  href?: string;
  command?: string;
  value?: string;
}

export interface MatterhornCapability {
  status: MatterhornCapabilityStatus;
  label: string;
  description?: string;
  details?: Record<string, unknown>;
  actions?: MatterhornCapabilityAction[];
}

export interface MatterhornModelCapability extends MatterhornCapability {
  defaultModel: {
    providerId: string;
    modelId: string;
  };
  providerListSource: "opencode" | "matterhorn_cloud" | "local_static" | "unknown";
  selectedModelSource: "local_preferences" | "server_default" | "unknown";
  routing?: {
    answerPath: "opencode_session_prompt_async" | "unknown";
    modelListTool: "opencode_provider_list" | "matterhorn_backend_registry" | "unknown";
    userSelectable: boolean;
    selectionSurface: "model_picker" | "settings" | "none" | "unknown";
    preferenceStore: "local_preferences" | "server" | "unknown";
    cloudProviderImport: boolean;
  };
}

export interface MatterhornProviderCapability extends MatterhornCapability {
  sources: Array<"opencode" | "matterhorn_cloud" | "managed_openwork_models">;
}

export interface MatterhornStorageCapability extends MatterhornCapability {
  stores: Record<string, MatterhornDataStoreDescriptor>;
}

export interface MatterhornMemoryCapability extends MatterhornCapability {
  scope: "machine_global" | "workspace" | "unknown";
  rootPath?: string;
  pendingSuggestionCount?: number;
  confirmedRecordCount?: number;
}

export interface MatterhornNotesCapability extends MatterhornCapability {
  scope: "workspace";
  notesDir?: string;
  indexPath?: string;
}

export interface MatterhornEvidenceCapability extends MatterhornCapability {
  sources: Array<"notes" | "memory" | "task_events" | "task_runs" | "outputs" | "workflow_runs">;
}

export interface MatterhornWalletFamilyCapability extends MatterhornCapability {
  family: "evm" | "sui" | "bittensor";
  custody: false;
  directConnect: boolean;
  publicRead: boolean;
  preview: boolean;
  signing: "client_wallet" | "external_signer" | "unsupported";
  supportedChains?: string[];
}

export interface MatterhornWalletCapability extends MatterhornCapability {
  families: Record<"evm" | "sui" | "bittensor", MatterhornWalletFamilyCapability>;
}

export interface MatterhornTeamCapability extends MatterhornCapability {
  localTokenSharing: MatterhornCapability;
  cloudTeams: MatterhornCapability;
}

export interface MatterhornSecurityCapability extends MatterhornCapability {
  loopback: MatterhornCapability;
  bearerTokens: MatterhornCapability;
  hostToken: MatterhornCapability;
  approvals: MatterhornCapability;
  cors: MatterhornCapability;
  authorizedRoots: MatterhornCapability;
  requestLogging: MatterhornCapability;
  memoryWriteGuards: MatterhornCapability;
}

export interface MatterhornSettingsSectionCapability extends MatterhornCapability {
  section:
    | "overview"
    | "profile"
    | "models"
    | "providers"
    | "wallet"
    | "memory"
    | "notes"
    | "outputs"
    | "teams"
    | "security"
    | "feedback"
    | "mcp";
}

export interface MatterhornBackendCapabilitiesResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_CAPABILITIES_VERSION;
  generatedAt: string;
  server: {
    version: string;
    opencodeVersion: string;
    host: string;
    port: number;
    readOnly: boolean;
    approvalMode: "manual" | "auto";
  };
  models: MatterhornModelCapability;
  providers: MatterhornProviderCapability;
  storage: MatterhornStorageCapability;
  memory: MatterhornMemoryCapability;
  notes: MatterhornNotesCapability;
  evidence: MatterhornEvidenceCapability;
  wallets: MatterhornWalletCapability;
  teams: MatterhornTeamCapability;
  security: MatterhornSecurityCapability;
  settings: MatterhornSettingsSectionCapability[];
}

export type MatterhornDataStoreScope =
  | "workspace"
  | "machine_global"
  | "opencode_runtime"
  | "matterhorn_cloud"
  | "unknown";

export interface MatterhornDataStoreDescriptor extends MatterhornCapability {
  id: string;
  scope: MatterhornDataStoreScope;
  path?: string;
  paths?: string[];
  format?: "markdown" | "json" | "jsonl" | "sqlite" | "directory" | "mixed" | "external" | "unknown";
  containsUserContent: boolean;
  containsSecrets: "never" | "redacted" | "possible" | "unknown";
  retention: "user_controlled" | "append_only" | "runtime_controlled" | "unknown";
  exportable: boolean;
  deletable: boolean;
}

export interface MatterhornWorkspaceDataMapResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_DATA_MAP_VERSION;
  generatedAt: string;
  workspace: {
    id: string;
    name: string;
    path: string;
    type: "local" | "remote";
    preset: string;
  };
  stores: Record<
    | "chat"
    | "notes"
    | "modelPreferences"
    | "memory"
    | "outputs"
    | "audit"
    | "taskEvents"
    | "workflowRuns"
    | "walletEvidence"
    | "evidence"
    | "feedback",
    MatterhornDataStoreDescriptor
  >;
  policy: {
    trainingUse: "none_by_default" | "opt_in_only" | "unknown";
    redaction: MatterhornCapability;
    export: MatterhornCapability;
    deletion: MatterhornCapability;
  };
}
