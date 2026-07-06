import type {
  MatterhornCapability,
  MatterhornCapabilityStatus,
  MatterhornDataStoreDescriptor,
  MatterhornWorkspaceDataMapResponse,
} from "./backend-capabilities.js";

export const MATTERHORN_BACKEND_DATA_CONTROLS_VERSION = "matterhorn.backend.data-controls.v1" as const;

export type MatterhornDataControlStoreId = keyof MatterhornWorkspaceDataMapResponse["stores"];

export type MatterhornDataControlActionKind =
  | "api_route"
  | "app_download"
  | "app_route"
  | "filesystem"
  | "manual"
  | "none";

export type MatterhornDataControlRequirement =
  | "collaborator"
  | "owner_or_host"
  | "writable_server"
  | "filesystem_access"
  | "specific_record_id";

export interface MatterhornDataControlAction {
  id: string;
  label: string;
  description: string;
  kind: MatterhornDataControlActionKind;
  status: MatterhornCapabilityStatus;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  href?: string;
  destructive?: boolean;
  requirements?: MatterhornDataControlRequirement[];
}

export interface MatterhornDataControlCapability {
  status: MatterhornCapabilityStatus;
  label: string;
  summary: string;
  actions: MatterhornDataControlAction[];
}

export interface MatterhornDataRetentionControl {
  mode: MatterhornDataStoreDescriptor["retention"];
  label: string;
  summary: string;
  configurable: boolean;
}

export interface MatterhornDataControlStore {
  storeId: MatterhornDataControlStoreId;
  store: MatterhornDataStoreDescriptor;
  export: MatterhornDataControlCapability;
  deletion: MatterhornDataControlCapability;
  retention: MatterhornDataRetentionControl;
  privacy: {
    containsUserContent: boolean;
    containsSecrets: MatterhornDataStoreDescriptor["containsSecrets"];
    trainingUse: "none" | "none_by_default" | "eval_routing_product_quality_only";
  };
}

export interface MatterhornWorkspaceDataControlsResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_DATA_CONTROLS_VERSION;
  generatedAt: string;
  workspace: MatterhornWorkspaceDataMapResponse["workspace"];
  stores: Record<MatterhornDataControlStoreId, MatterhornDataControlStore>;
  summary: {
    totalStores: number;
    exportableStores: number;
    deletableStores: number;
    appendOnlyStores: number;
    userControlledStores: number;
  };
  policy: {
    trainingUse: "none_by_default" | "opt_in_only" | "unknown";
    redaction: MatterhornCapability;
    export: MatterhornCapability;
    deletion: MatterhornCapability;
    limitations: string[];
  };
}
