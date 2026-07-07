import type { MatterhornBackendControlPlaneResponse } from "./backend-control-plane.js";
import type { MatterhornBackendCapabilitiesResponse } from "./backend-capabilities.js";
import type { MatterhornBackendModelProviderSummary, MatterhornBackendModelsResponse } from "./backend-models.js";
import type { MatterhornBackendTeamAccessSummaryResponse } from "./backend-team-access.js";
import type { MatterhornWorkspaceDataControlsResponse } from "./backend-data-controls.js";
import type {
  MatterhornProjectDataLedgerExportControlPlaneSnapshot,
  MatterhornProjectDataLedgerExportResponse,
  MatterhornProjectDataLedgerResponse,
} from "./project-data-ledger.js";

export const MATTERHORN_BACKEND_SUPPORT_REPORT_VERSION = "matterhorn.backend.support-report.v1" as const;

export interface MatterhornBackendSupportReportResponse {
  success: true;
  version: typeof MATTERHORN_BACKEND_SUPPORT_REPORT_VERSION;
  generatedAt: string;
  filename: string;
  workspace: MatterhornProjectDataLedgerExportControlPlaneSnapshot["workspace"];
  controlPlane: MatterhornProjectDataLedgerExportControlPlaneSnapshot;
  wallets: MatterhornBackendCapabilitiesResponse["wallets"];
  teams: MatterhornBackendCapabilitiesResponse["teams"];
  teamAccess: MatterhornBackendTeamAccessSummaryResponse;
  security: MatterhornBackendCapabilitiesResponse["security"];
  readiness: {
    version: MatterhornBackendControlPlaneResponse["readiness"]["version"];
    generatedAt: string;
    summary: MatterhornBackendControlPlaneResponse["readiness"]["summary"];
    features: MatterhornBackendControlPlaneResponse["readiness"]["features"];
  };
  models: {
    defaultModel: MatterhornBackendModelsResponse["defaultModel"];
    routing: MatterhornBackendModelsResponse["routing"];
    catalog: Pick<
      MatterhornBackendModelsResponse["catalog"],
      | "status"
      | "label"
      | "description"
      | "source"
      | "serverFetched"
      | "providerCount"
      | "connectedProviderCount"
      | "modelCount"
      | "connectedProviderIds"
      | "defaultModels"
      | "errorCode"
    > & {
      providers: Array<Pick<
        MatterhornBackendModelProviderSummary,
        "id" | "name" | "source" | "connected" | "modelCount" | "sampleModels"
      >>;
    };
  };
  dataPolicy: {
    dataMap: {
      version: MatterhornBackendControlPlaneResponse["dataMap"]["version"];
      stores: MatterhornBackendControlPlaneResponse["dataMap"]["stores"];
      policy: MatterhornBackendControlPlaneResponse["dataMap"]["policy"];
    };
    controls: {
      version: MatterhornBackendControlPlaneResponse["dataControls"]["version"];
      summary: MatterhornWorkspaceDataControlsResponse["summary"];
      policy: MatterhornWorkspaceDataControlsResponse["policy"];
    };
  };
  dataLedger: {
    version: MatterhornProjectDataLedgerResponse["version"];
    generatedAt: string;
    summary: MatterhornProjectDataLedgerResponse["summary"];
    policy: MatterhornProjectDataLedgerResponse["policy"];
    export: {
      href: string;
      version: MatterhornProjectDataLedgerExportResponse["version"];
      filename: string;
      manifest: MatterhornProjectDataLedgerExportResponse["manifest"];
      warnings: string[];
    };
  };
  privacy: {
    trainingUse: MatterhornBackendControlPlaneResponse["privacy"]["trainingUse"];
    feedbackUse: MatterhornBackendControlPlaneResponse["privacy"]["feedbackUse"];
    feedbackCollectionEnabled: MatterhornBackendControlPlaneResponse["privacy"]["feedbackCollectionEnabled"];
    secretsReturned: false;
  };
  warnings: string[];
}
