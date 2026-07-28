import type { MatterhornBackendControlPlaneResponse } from "@matterhorn-work/types/backend-control-plane";
import type { MatterhornBackendSupportReportResponse } from "@matterhorn-work/types/backend-support-report";
import type { MatterhornBackendTeamAccessSummaryResponse } from "@matterhorn-work/types/backend-team-access";
import type {
  MatterhornBillingSetupCheck,
  MatterhornBillingStatusResponse,
} from "@matterhorn-work/types/billing";
import type { MatterhornProjectDataLedgerExportControlPlaneSnapshot } from "@matterhorn-work/types/project-data-ledger";
import type { WorkspaceInfo } from "./types.js";
import {
  activeMatterhornBillingPendingCheckout,
  billingUsagePeriodForSubscription,
  buildBillingStatusResponseForSubscription,
  buildBillingStatusResponseWithUsage,
  buildMatterhornBillingSubscription,
  isBillingUsageTimestampInPeriod,
  resolveBillingProviderConfigFromEnv,
} from "./billing.js";
import { MatterhornBillingAccountStore } from "./billing-account-store.js";
import { MatterhornGeneratedImageStore } from "./generated-image-store.js";
import { countDurableGeneratedImageUsage } from "./generated-media-usage.js";
import { buildGeneratedMediaDiagnostics } from "./generated-media-diagnostics.js";
import { MatterhornImageNftDraftStore } from "./image-nft-draft-store.js";
import { buildProjectDataLedgerExport } from "./project-data-ledger.js";

const SUPPORT_REPORT_FORBIDDEN_MARKERS = [
  "OPENAI_API_KEY",
  "MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN",
  "MATTERHORN_STRIPE_SECRET_KEY",
  "MATTERHORN_STRIPE_WEBHOOK_SECRET",
  "MATTERHORN_STRIPE_PRICE_ID_PLUS",
  "MATTERHORN_STRIPE_PRICE_ID_MAX",
  "MATTERHORN_STRIPE_TEST_CUSTOMER_ID",
  "Authorization",
  "X-Matterhorn-Host-Token",
] as const;

function safeExportFilePart(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workspace";
}

function redactSupportReportText(value: string): string {
  return SUPPORT_REPORT_FORBIDDEN_MARKERS.reduce(
    (text, marker) => text.split(marker).join("a configured secret"),
    value,
  );
}

function isSupportReportSecretMarker(value: string | undefined): boolean {
  return Boolean(value && SUPPORT_REPORT_FORBIDDEN_MARKERS.includes(value as typeof SUPPORT_REPORT_FORBIDDEN_MARKERS[number]));
}

function redactSetupRequirementsForSupportReport<T extends { envVar?: string; description?: string }>(
  requirements: T[] | undefined,
): T[] | undefined {
  if (!requirements) return undefined;
  return requirements.map((requirement) => {
    const { envVar, description, ...rest } = requirement;
    return {
      ...rest,
      ...(envVar && !isSupportReportSecretMarker(envVar) ? { envVar } : {}),
      ...(description ? { description: redactSupportReportText(description) } : {}),
    } as T;
  });
}

function redactGeneratedMediaDiagnosticsForSupportReport(
  diagnostics: Awaited<ReturnType<typeof buildGeneratedMediaDiagnostics>>,
): Awaited<ReturnType<typeof buildGeneratedMediaDiagnostics>> {
  return {
    ...diagnostics,
    summary: redactSupportReportText(diagnostics.summary),
    checks: diagnostics.checks.map((check) => ({
      ...check,
      summary: redactSupportReportText(check.summary),
      setupRequirements: redactSetupRequirementsForSupportReport(check.setupRequirements),
    })),
    productionSmokePlan: {
      ...diagnostics.productionSmokePlan,
      summary: redactSupportReportText(diagnostics.productionSmokePlan.summary),
      blockers: redactSetupRequirementsForSupportReport(diagnostics.productionSmokePlan.blockers) ?? [],
      stages: diagnostics.productionSmokePlan.stages.map((stage) => ({
        ...stage,
        summary: redactSupportReportText(stage.summary),
        setupRequirements: redactSetupRequirementsForSupportReport(stage.setupRequirements),
      })),
    },
  };
}

function redactBillingSetupChecksForSupportReport(
  checks: MatterhornBillingSetupCheck[],
): MatterhornBillingSetupCheck[] {
  return checks.map((check) => ({
    ...check,
    description: redactSupportReportText(check.description),
  }));
}

function redactBillingStatusForSupportReport(
  response: MatterhornBillingStatusResponse,
): MatterhornBillingStatusResponse {
  return {
    ...response,
    status: {
      ...response.status,
      setup: {
        ...response.status.setup,
        checks: redactBillingSetupChecksForSupportReport(response.status.setup.checks),
      },
    },
  };
}

async function buildBillingSupportReportSection(options: {
  workspace: WorkspaceInfo;
  controlPlane: MatterhornBackendControlPlaneResponse;
  teamAccess: MatterhornBackendTeamAccessSummaryResponse;
}): Promise<MatterhornBackendSupportReportResponse["billing"]> {
  const billingConfig = resolveBillingProviderConfigFromEnv(process.env);
  const accountStore = new MatterhornBillingAccountStore({
    workspaceRoot: options.workspace.path,
    workspaceId: options.workspace.id,
  });
  const account = await accountStore.get();
  const subscription = account?.subscription ?? buildMatterhornBillingSubscription(billingConfig.currentPlanId);
  const activePendingCheckout = activeMatterhornBillingPendingCheckout(account?.pendingCheckout);
  const usagePeriod = billingUsagePeriodForSubscription(subscription);
  const [images, nftDrafts] = await Promise.all([
    new MatterhornGeneratedImageStore({
      workspaceRoot: options.workspace.path,
      workspaceId: options.workspace.id,
    }).list(),
    new MatterhornImageNftDraftStore({
      workspaceRoot: options.workspace.path,
      workspaceId: options.workspace.id,
    }).list(),
  ]);
  const usage = {
    generatedImages: await countDurableGeneratedImageUsage(options.workspace, images, usagePeriod),
    generatedImagesResetsAt: usagePeriod.resetsAt,
    nftDrafts: nftDrafts.filter((draft) => isBillingUsageTimestampInPeriod(draft.createdAt, usagePeriod)).length,
    nftDraftsResetsAt: usagePeriod.resetsAt,
    teamMembers: Math.max(1, options.teamAccess.localAccess.tokenCount),
    cloudStorageBytes: 0,
  };
  const status = redactBillingStatusForSupportReport(
    account
      ? buildBillingStatusResponseForSubscription(
          billingConfig,
          subscription,
          usage,
          activePendingCheckout,
          account.source,
          account.updatedAt,
        )
      : buildBillingStatusResponseWithUsage(billingConfig, usage),
  );
  const capability = {
    ...options.controlPlane.capabilities.billing,
    setup: {
      ...options.controlPlane.capabilities.billing.setup,
      checks: redactBillingSetupChecksForSupportReport(options.controlPlane.capabilities.billing.setup.checks),
    },
  };
  const pendingCheckout = status.status.pendingCheckout
    ? {
        planId: status.status.pendingCheckout.planId,
        interval: status.status.pendingCheckout.interval,
        provider: status.status.pendingCheckout.provider,
        mode: status.status.pendingCheckout.mode,
        createdAt: status.status.pendingCheckout.createdAt,
        expiresAt: status.status.pendingCheckout.expiresAt ?? null,
        providerSessionIdPresent: Boolean(status.status.pendingCheckout.providerSessionId),
      }
    : null;
  const setupChecks = status.status.setup.checks;
  const recommendedActions = setupChecks
    .filter((check) => check.status === "needs_setup" || check.status === "error")
    .map((check) => ({
      id: check.id,
      label: check.label,
      status: check.status,
    }));

  return {
    capability,
    status,
    diagnostics: {
      mode: status.status.mode,
      provider: status.status.provider,
      currentPlanId: billingConfig.currentPlanId,
      workspacePlanId: status.status.subscription.planId,
      livePaymentsEnabled: false,
      checkoutSupported: capability.checkoutSupported,
      portalSupported: capability.portalSupported,
      readyForTestCheckout: status.status.setup.readyForTestCheckout,
      readyForWebhooks: status.status.setup.readyForWebhooks,
      pendingCheckout,
      usage: status.status.usage,
      checks: setupChecks,
      safety: {
        liveCharges: false,
        rawCardDataHandled: false,
        secretsReturned: false,
        providerWritesDuringDiagnostics: false,
      },
      recommendedActions,
    },
  };
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
  const generatedMediaDiagnostics = await buildGeneratedMediaDiagnostics({
    workspaceId: options.workspace.id,
    timeoutMs: 1_000,
  });
  const billing = await buildBillingSupportReportSection(options);
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
        defaultModels: options.controlPlane.models.catalog.defaultModels,
        providers: options.controlPlane.models.catalog.providers.map((provider) => ({
          id: provider.id,
          name: provider.name,
          source: provider.source,
          connected: provider.connected,
          modelCount: provider.modelCount,
          sampleModels: provider.sampleModels,
        })),
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
    generatedMedia: {
      diagnostics: redactGeneratedMediaDiagnosticsForSupportReport(generatedMediaDiagnostics),
    },
    billing,
    privacy: {
      trainingUse: controlPlaneSnapshot.privacy.trainingUse,
      feedbackUse: controlPlaneSnapshot.privacy.feedbackUse,
      feedbackCollectionEnabled: controlPlaneSnapshot.privacy.feedbackCollectionEnabled,
      secretsReturned: false,
    },
    warnings: [
      "Support reports include backend status, readiness, sanitized storage locations, local access counts, and data-policy summaries.",
      "Support reports do not include raw chat transcripts, provider credentials, bearer tokens, host tokens, or full model provider payloads.",
      "Support reports include billing readiness and usage only; they do not create checkout sessions, open portals, process cards, or contact payment providers.",
      "Open the project data ledger export separately when row-level redacted evidence is needed.",
    ],
  };
}
