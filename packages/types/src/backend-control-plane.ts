import type {
  MatterhornBackendCapabilitiesResponse,
  MatterhornCapabilityStatus,
  MatterhornWorkspaceDataMapResponse,
} from "./backend-capabilities.js";
import type { MatterhornWorkspaceDataControlsResponse } from "./backend-data-controls.js";
import type { MatterhornBackendModelsResponse } from "./backend-models.js";
import type {
  MatterhornBackendReadinessCheckId,
  MatterhornBackendReadinessResponse,
} from "./backend-readiness.js";

export const MATTERHORN_BACKEND_CONTROL_PLANE_VERSION = "matterhorn.backend.control-plane.v1" as const;

export interface MatterhornBackendControlPlaneResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_CONTROL_PLANE_VERSION;
  generatedAt: string;
  workspace: MatterhornWorkspaceDataMapResponse["workspace"];
  summary: {
    status: MatterhornCapabilityStatus;
    capabilitiesStatus: MatterhornCapabilityStatus;
    modelCatalogStatus: MatterhornCapabilityStatus;
    readinessStatus: MatterhornCapabilityStatus;
    dataControlsStatus: MatterhornCapabilityStatus;
    readyFeatures: number;
    totalFeatures: number;
    blockingChecks: MatterhornBackendReadinessCheckId[];
    connectedProviders: number;
    totalProviders: number;
    totalModels: number;
    exportableStores: number;
    deletableStores: number;
  };
  versions: {
    capabilities: MatterhornBackendCapabilitiesResponse["version"];
    models: MatterhornBackendModelsResponse["version"];
    readiness: MatterhornBackendReadinessResponse["version"];
    dataMap: MatterhornWorkspaceDataMapResponse["version"];
    dataControls: MatterhornWorkspaceDataControlsResponse["version"];
  };
  capabilities: MatterhornBackendCapabilitiesResponse;
  models: MatterhornBackendModelsResponse;
  readiness: MatterhornBackendReadinessResponse;
  dataMap: MatterhornWorkspaceDataMapResponse;
  dataControls: MatterhornWorkspaceDataControlsResponse;
  privacy: {
    trainingUse: "none_by_default";
    feedbackUse: "eval_routing_product_quality_only";
    secretsReturned: false;
  };
}
