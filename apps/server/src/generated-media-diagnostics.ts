import type {
  MatterhornGeneratedMediaDiagnosticCheck,
  MatterhornGeneratedMediaDiagnosticStatus,
  MatterhornGeneratedMediaDiagnosticsResponse,
  MatterhornNftSetupRequirement,
} from "@matterhorn-work/types/generated-media";
import {
  buildImageGenerationCapability,
  buildNftMarketplaceListingCapability,
  buildNftMintingCapability,
  buildWalrusStorageCapability,
  resolveNftEnvironmentConfig,
  type NftEnvironmentConfig,
} from "./image-nft-capabilities.js";
import {
  createImageGenerationProvider,
  resolveImageGenerationProviderFromEnv,
} from "./image-generation-provider.js";
import {
  buildWalrusBlobReadUrl,
  buildWalrusBlobUploadUrl,
} from "./walrus-storage.js";
import { normalizeMatterhornSuiAddress } from "./tools/sui.js";

type DiagnosticEnv = typeof process.env;

export interface GeneratedMediaDiagnosticsOptions {
  workspaceId: string;
  env?: DiagnosticEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

interface ProbeResult {
  ok: boolean;
  status: number | null;
  summary: string;
  durationMs: number;
}

export async function buildGeneratedMediaDiagnostics(
  options: GeneratedMediaDiagnosticsOptions,
): Promise<MatterhornGeneratedMediaDiagnosticsResponse> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const nftEnv = resolveNftEnvironmentConfig(env);
  const checks = await Promise.all([
    imageProviderDiagnostic(env),
    walrusDiagnostic(nftEnv, options.fetchImpl ?? fetch, options.timeoutMs ?? 2_500),
    suiMintingDiagnostic(nftEnv),
    suiListingDiagnostic(nftEnv),
    nonCustodySafetyDiagnostic(),
  ]);
  const status = rollupStatus(checks.map((check) => check.status));

  return {
    success: true,
    workspaceId: options.workspaceId,
    checkedAt: now().toISOString(),
    status,
    summary: diagnosticSummary(status),
    checks,
    safety: {
      custody: false,
      canSubmit: false,
      walletSigning: "client_wallet",
      publicWritesDuringDiagnostics: false,
      storesSecrets: false,
    },
  };
}

async function imageProviderDiagnostic(env: DiagnosticEnv): Promise<MatterhornGeneratedMediaDiagnosticCheck> {
  const startedAt = Date.now();
  const providerConfig = resolveImageGenerationProviderFromEnv(env);
  const providerStatus = await createImageGenerationProvider(providerConfig).status();
  const capability = buildImageGenerationCapability(providerStatus);
  const status = capability.status === "working"
    ? "pass"
    : capability.status === "needs_setup"
      ? "warning"
      : "fail";
  const summary = status === "pass"
    ? providerStatus.provider === "openai"
      ? "OpenAI image generation is configured. Diagnostics do not create billable images."
      : "Mock image generation is available for local testing."
    : providerStatus.message ?? "Image generation is not ready.";

  return {
    id: "image_provider",
    label: "Image provider",
    status,
    summary,
    durationMs: Date.now() - startedAt,
    details: {
      provider: providerStatus.provider,
      model: providerStatus.model,
      size: providerStatus.size,
      quality: providerStatus.quality,
      format: providerStatus.format,
    },
    setupRequirements: capability.setupRequirements,
  };
}

async function walrusDiagnostic(
  config: NftEnvironmentConfig,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<MatterhornGeneratedMediaDiagnosticCheck> {
  const startedAt = Date.now();
  const capability = buildWalrusStorageCapability(config);
  if (capability.status === "error") {
    return {
      id: "walrus_storage",
      label: "Walrus storage",
      status: "fail",
      summary: capability.description ?? "Walrus storage setup is invalid.",
      durationMs: Date.now() - startedAt,
      details: walrusDetails(config),
      setupRequirements: capability.setupRequirements,
    };
  }
  if (capability.status !== "working" || !config.walrusPublisherUrl || !config.walrusRelayUrl) {
    return {
      id: "walrus_storage",
      label: "Walrus storage",
      status: "warning",
      summary: capability.description ?? "Walrus storage needs setup before public NFT media upload.",
      durationMs: Date.now() - startedAt,
      details: walrusDetails(config),
      setupRequirements: capability.setupRequirements,
    };
  }

  const [publisher, relay] = await Promise.all([
    probeEndpoint({
      fetchImpl,
      method: "OPTIONS",
      url: buildWalrusBlobUploadUrl(config.walrusPublisherUrl, config.walrusStorageEpochs ?? 1),
      timeoutMs,
      authorization: config.walrusPublisherBearerToken ? `Bearer ${config.walrusPublisherBearerToken}` : undefined,
    }),
    probeEndpoint({
      fetchImpl,
      method: "HEAD",
      url: buildWalrusBlobReadUrl(config.walrusRelayUrl, "matterhorn-diagnostics-nonexistent"),
      timeoutMs,
    }),
  ]);
  const status: MatterhornGeneratedMediaDiagnosticStatus = publisher.ok && relay.ok ? "pass" : "fail";
  const summary = status === "pass"
    ? "Walrus publisher and relay endpoints responded to safe diagnostics probes."
    : `Walrus diagnostics could not reach ${publisher.ok ? "the relay" : relay.ok ? "the publisher" : "the publisher or relay"}.`;

  return {
    id: "walrus_storage",
    label: "Walrus storage",
    status,
    summary,
    durationMs: Date.now() - startedAt,
    details: {
      ...walrusDetails(config),
      publisherStatus: publisher.status,
      relayStatus: relay.status,
      publisherProbeMs: publisher.durationMs,
      relayProbeMs: relay.durationMs,
    },
    setupRequirements: capability.setupRequirements,
  };
}

function suiMintingDiagnostic(config: NftEnvironmentConfig): MatterhornGeneratedMediaDiagnosticCheck {
  const startedAt = Date.now();
  const capability = buildNftMintingCapability(config);
  const setupStatus = capability.status === "preview"
    ? "pass"
    : capability.status === "needs_setup"
      ? "warning"
      : "fail";
  const shapeIssues = [
    ...validateOptionalSuiObjectId("Sui NFT package", config.suiNftPackageId),
    ...validateSuiModuleName(config.suiNftModuleName || "matterhorn_nft"),
  ];
  const status = setupStatus === "pass" && shapeIssues.length ? "fail" : setupStatus;
  const summary = shapeIssues.length
    ? shapeIssues.join(" ")
    : capability.description ?? "Sui NFT minting readiness was checked.";

  return {
    id: "sui_nft_minting",
    label: "Sui NFT minting",
    status,
    summary,
    durationMs: Date.now() - startedAt,
    details: {
      network: config.suiNetwork ?? "sui-testnet",
      packageConfigured: Boolean(config.suiNftPackageId?.trim()),
      moduleName: config.suiNftModuleName || "matterhorn_nft",
      custody: false,
      canSubmit: false,
    },
    setupRequirements: [
      ...(capability.setupRequirements ?? []),
      ...shapeIssues.map((description): MatterhornNftSetupRequirement => ({
        key: "sui_nft_package",
        label: "Sui NFT package",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
        description,
      })),
    ],
  };
}

function suiListingDiagnostic(config: NftEnvironmentConfig): MatterhornGeneratedMediaDiagnosticCheck {
  const startedAt = Date.now();
  const capability = buildNftMarketplaceListingCapability(config);
  const setupStatus = capability.status === "preview"
    ? "pass"
    : capability.status === "needs_setup"
      ? "warning"
      : "fail";
  const shapeIssues = [
    ...validateOptionalSuiObjectId("Sui Kiosk package", config.suiKioskPackageId),
    ...validateOptionalSuiObjectId("Sui TransferPolicy package", config.suiTransferPolicyPackageId),
    ...validateOptionalSuiObjectId("Sui Kiosk", config.suiKioskId),
    ...validateOptionalSuiObjectId("Sui Kiosk owner cap", config.suiKioskOwnerCapId),
    ...validateOptionalSuiObjectId("Sui TransferPolicy", config.suiTransferPolicyId),
  ];
  const status = setupStatus === "pass" && shapeIssues.length ? "fail" : setupStatus;
  const summary = shapeIssues.length
    ? shapeIssues.join(" ")
    : capability.description ?? "Sui marketplace listing readiness was checked.";

  return {
    id: "sui_marketplace_listing",
    label: "Marketplace listing",
    status,
    summary,
    durationMs: Date.now() - startedAt,
    details: {
      network: config.suiNetwork ?? "sui-testnet",
      kioskPackageConfigured: Boolean(config.suiKioskPackageId?.trim()),
      transferPolicyPackageConfigured: Boolean(config.suiTransferPolicyPackageId?.trim()),
      defaultKioskInputsConfigured: Boolean(
        config.suiKioskId?.trim()
          && config.suiKioskOwnerCapId?.trim()
          && config.suiTransferPolicyId?.trim(),
      ),
      custody: false,
      canSubmit: false,
    },
    setupRequirements: capability.setupRequirements,
  };
}

function nonCustodySafetyDiagnostic(): MatterhornGeneratedMediaDiagnosticCheck {
  return {
    id: "non_custody_safety",
    label: "Signing safety",
    status: "pass",
    summary: "Diagnostics do not upload user media, do not sign, and do not submit transactions. Sui actions require the user's wallet.",
    details: {
      custody: false,
      canSubmit: false,
      walletSigning: "client_wallet",
      publicWritesDuringDiagnostics: false,
      storesSecrets: false,
    },
  };
}

async function probeEndpoint(input: {
  fetchImpl: typeof fetch;
  method: "HEAD" | "OPTIONS";
  url: string;
  timeoutMs: number;
  authorization?: string;
}): Promise<ProbeResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await input.fetchImpl(input.url, {
      method: input.method,
      headers: input.authorization ? { Authorization: input.authorization } : undefined,
      signal: controller.signal,
    });
    const ok = response.status < 500;
    return {
      ok,
      status: response.status,
      summary: ok ? `Endpoint responded with ${response.status}.` : `Endpoint returned ${response.status}.`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      summary: error instanceof Error ? error.message : "Endpoint could not be reached.",
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

function walrusDetails(config: NftEnvironmentConfig): Record<string, string | number | boolean | null> {
  return {
    publisherConfigured: Boolean(config.walrusPublisherUrl?.trim()),
    relayConfigured: Boolean(config.walrusRelayUrl?.trim()),
    storageEpochs: config.walrusStorageEpochs ?? 1,
    publisherAuthConfigured: Boolean(config.walrusPublisherBearerToken?.trim()),
  };
}

function validateOptionalSuiObjectId(label: string, value: string | undefined): string[] {
  if (!value?.trim()) return [];
  try {
    normalizeMatterhornSuiAddress(value);
    return [];
  } catch {
    return [`${label} must be a valid Sui object id.`];
  }
}

function validateSuiModuleName(value: string): string[] {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
    ? []
    : ["Sui NFT module must be a Move identifier."];
}

function rollupStatus(statuses: MatterhornGeneratedMediaDiagnosticStatus[]): MatterhornGeneratedMediaDiagnosticStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warning")) return "warning";
  return "pass";
}

function diagnosticSummary(status: MatterhornGeneratedMediaDiagnosticStatus): string {
  if (status === "pass") return "Generated media setup passed all safe diagnostics.";
  if (status === "warning") return "Generated media is partially ready; review setup warnings before production use.";
  return "Generated media setup has blocking issues.";
}
