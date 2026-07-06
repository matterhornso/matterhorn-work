import type { MatterhornBackendControlPlaneResponse } from "@matterhorn-work/types/backend-control-plane";
import type { MatterhornBackendSupportReportResponse } from "@matterhorn-work/types/backend-support-report";
import type { MatterhornBackendTeamAccessSummaryResponse } from "@matterhorn-work/types/backend-team-access";
import type { MatterhornProjectDataLedgerExportControlPlaneSnapshot } from "@matterhorn-work/types/project-data-ledger";
import type { WorkspaceInfo } from "./types.js";
import { buildProjectDataLedgerExport } from "./project-data-ledger.js";

function safeExportFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workspace";
}

export function backendControlPlaneExportSnapshot(
  controlPlane: MatterhornBackendControlPlaneResponse,
): MatterhornProjectDataLedgerExportControlPlaneSnapshot {
  return {
    version: controlPlane.version,
    generatedAt: controlPlane.generatedAt,
    workspace: controlPlane.workspace,
    summary: controlPlane.summary,
    versions: controlPlane.versions,
    privacy: controlPlane.privacy,
  };
}

export async function buildBackendSupportReport(options: {
  workspace: WorkspaceInfo;
  controlPlane: MatterhornBackendControlPlaneResponse;
  teamAccess: MatterhornBackendTeamAccessSummaryResponse;
}): Promise<MatterhornBackendSupportReportResponse> {
  const generatedAt = new Date().toISOString();
  const controlPlaneSnapshot = backendControlPlaneExportSnapshot(options.controlPlane);
  const ledgerExport = await buildProjectDataLedgerExport({
    workspace: options.workspace,
    limit: 300,
    backendControlPlane: controlPlaneSnapshot,
  });

  return {
    success: true,
    version: "matterhorn.backend.support-report.v1",
    generatedAt,
    filename: `matterhorn-backend-support-${safeExportFilePart(options.workspace.id)}-${generatedAt.slice(0, 10)}.json`,
    workspace: controlPlaneSnapshot.workspace,
    controlPlane: controlPlaneSnapshot,
    wallets: options.controlPlane.capabilities.wallets,
    teams: options.controlPlane.capabilities.teams,
    teamAccess: options.teamAccess,
    security: options.controlPlane.capabilities.security,
    readiness: {
      version: options.controlPlane.readiness.version,
      generatedAt: options.controlPlane.readiness.generatedAt,
      summary: options.controlPlane.readiness.summary,
      features: options.controlPlane.readiness.features,
    },
    models: {
      defaultModel: options.controlPlane.models.defaultModel,
      routing: options.controlPlane.models.routing,
      catalog: {
        status: options.controlPlane.models.catalog.status,
        label: options.controlPlane.models.catalog.label,
        description: options.controlPlane.models.catalog.description,
        source: options.controlPlane.models.catalog.source,
        serverFetched: options.controlPlane.models.catalog.serverFetched,
        providerCount: options.controlPlane.models.catalog.providerCount,
        connectedProviderCount: options.controlPlane.models.catalog.connectedProviderCount,
        modelCount: options.controlPlane.models.catalog.modelCount,
        connectedProviderIds: options.controlPlane.models.catalog.connectedProviderIds,
        errorCode: options.controlPlane.models.catalog.errorCode,
      },
    },
    dataPolicy: {
      dataMap: {
        version: options.controlPlane.dataMap.version,
        stores: options.controlPlane.dataMap.stores,
        policy: options.controlPlane.dataMap.policy,
      },
      controls: {
        version: options.controlPlane.dataControls.version,
        summary: options.controlPlane.dataControls.summary,
        policy: options.controlPlane.dataControls.policy,
      },
    },
    dataLedger: {
      version: ledgerExport.ledger.version,
      generatedAt: ledgerExport.ledger.generatedAt,
      summary: ledgerExport.ledger.summary,
      policy: ledgerExport.ledger.policy,
      export: {
        href: `/workspace/${encodeURIComponent(options.workspace.id)}/data-ledger/export`,
        version: ledgerExport.version,
        filename: ledgerExport.filename,
        manifest: ledgerExport.manifest,
        warnings: ledgerExport.warnings,
      },
    },
    privacy: {
      trainingUse: controlPlaneSnapshot.privacy.trainingUse,
      feedbackUse: controlPlaneSnapshot.privacy.feedbackUse,
      feedbackCollectionEnabled: controlPlaneSnapshot.privacy.feedbackCollectionEnabled,
      secretsReturned: false,
    },
    warnings: [
      "Support reports include backend status, readiness, sanitized storage locations, local access counts, and data-policy summaries.",
      "Support reports do not include raw chat transcripts, provider credentials, bearer tokens, host tokens, or full model provider payloads.",
      "Open the project data ledger export separately when row-level redacted evidence is needed.",
    ],
  };
}
