import type { MatterhornBackendControlPlaneResponse } from "./backend-control-plane.js";
import type { MatterhornBackendCapabilitiesResponse } from "./backend-capabilities.js";
import type { MatterhornBackendModelsResponse } from "./backend-models.js";
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
  security: MatterhornBackendCapabilitiesResponse["security"];
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
      | "errorCode"
    >;
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
    secretsReturned: false;
  };
  warnings: string[];
}
