import type { MatterhornBackendControlPlaneResponse } from "./backend-control-plane.js";
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
