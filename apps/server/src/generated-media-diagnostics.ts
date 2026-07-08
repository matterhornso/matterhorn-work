import type {
  MatterhornGeneratedMediaDiagnosticCheck,
  MatterhornGeneratedMediaDiagnosticStatus,
  MatterhornGeneratedMediaDiagnosticsResponse,
  MatterhornGeneratedMediaProductionSmokePlan,
  MatterhornGeneratedMediaProductionSmokeStage,
  MatterhornImageSetupRequirement,
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
    productionSmokePlan: buildProductionSmokePlan(checks),
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

function buildProductionSmokePlan(
  checks: MatterhornGeneratedMediaDiagnosticCheck[],
): MatterhornGeneratedMediaProductionSmokePlan {
  const imageProvider = requiredCheck(checks, "image_provider");
  const walrusStorage = requiredCheck(checks, "walrus_storage");
  const suiMinting = requiredCheck(checks, "sui_nft_minting");
  const suiListing = requiredCheck(checks, "sui_marketplace_listing");
  const safety = requiredCheck(checks, "non_custody_safety");
  const imageProviderName = stringDetail(imageProvider, "provider");
  const isProductionImageProvider = imageProvider.status === "pass" && imageProviderName === "openai";
  const productionImageRequirement = isProductionImageProvider ? [] : [openAiProductionRequirement(imageProviderName)];

  const stages: MatterhornGeneratedMediaProductionSmokeStage[] = [
    {
      id: "safe_diagnostics",
      label: "Run safe diagnostics",
      status: safety.status === "pass" ? "ready" : "blocked",
      writeScope: "none",
      requiresWallet: false,
      requiresPublicWrite: false,
      summary: "Checks provider setup, endpoint reachability, Sui config shape, and non-custody guarantees without writing public data.",
      setupRequirements: unresolvedRequirements(safety.setupRequirements),
    },
    {
      id: "chat_image_generation",
      label: "Generate an image in chat",
      status: imageProvider.status === "pass" ? "ready" : "blocked",
      writeScope: "workspace_output",
      requiresWallet: false,
      requiresPublicWrite: false,
      summary: isProductionImageProvider
        ? "OpenAI image generation is configured; a production smoke can create a workspace output."
        : "Only local/mock image generation is ready. Configure OpenAI before treating this as production evidence.",
      setupRequirements: [
        ...unresolvedRequirements(imageProvider.setupRequirements),
        ...productionImageRequirement,
      ],
    },
    {
      id: "walrus_public_upload",
      label: "Upload media to Walrus",
      status: walrusStorage.status === "pass" ? "manual" : "blocked",
      writeScope: "public_storage",
      requiresWallet: false,
      requiresPublicWrite: true,
      summary: walrusStorage.status === "pass"
        ? "Walrus endpoints responded. Uploading image bytes is a public storage action and still requires explicit user confirmation."
        : "Walrus upload is blocked until publisher and relay setup pass diagnostics.",
      setupRequirements: unresolvedRequirements(walrusStorage.setupRequirements),
    },
    {
      id: "sui_wallet_mint",
      label: "Sign Sui mint transaction",
      status: suiMinting.status === "pass" ? "manual" : "blocked",
      writeScope: "wallet_signed_transaction",
      requiresWallet: true,
      requiresPublicWrite: true,
      summary: suiMinting.status === "pass"
        ? "Mint preview can be prepared; the user must review and sign with a Sui wallet."
        : "Minting is blocked until the Sui NFT package setup passes diagnostics.",
      setupRequirements: unresolvedRequirements(suiMinting.setupRequirements),
    },
    {
      id: "sui_kiosk_listing",
      label: "Sign marketplace listing transaction",
      status: suiListing.status === "pass" ? "manual" : "blocked",
      writeScope: "wallet_signed_transaction",
      requiresWallet: true,
      requiresPublicWrite: true,
      summary: suiListing.status === "pass"
        ? "Kiosk listing preview can be prepared; the user must review and sign with a Sui wallet."
        : "Marketplace listing is blocked until Kiosk and TransferPolicy setup passes diagnostics.",
      setupRequirements: unresolvedRequirements(suiListing.setupRequirements),
    },
  ];

  const blockers = dedupeRequirements(stages.flatMap((stage) => stage.setupRequirements ?? []));
  const endToEndStagesReady = stages.every((stage) => stage.status !== "blocked");
  const mode = !endToEndStagesReady
    ? "needs_setup"
    : isProductionImageProvider
      ? "production_candidate"
      : "local_test";

  return {
    mode,
    summary: productionSmokeSummary(mode, blockers.length),
    canRunEndToEnd: mode === "production_candidate" && endToEndStagesReady,
    publicWritesOnlyAfterUserAction: true,
    stages,
    blockers,
  };
}

function requiredCheck(
  checks: MatterhornGeneratedMediaDiagnosticCheck[],
  id: MatterhornGeneratedMediaDiagnosticCheck["id"],
): MatterhornGeneratedMediaDiagnosticCheck {
  const check = checks.find((candidate) => candidate.id === id);
  if (check) return check;
  return {
    id,
    label: id,
    status: "fail",
    summary: "Diagnostic check did not run.",
  };
}

function stringDetail(check: MatterhornGeneratedMediaDiagnosticCheck, key: string): string | null {
  const value = check.details?.[key];
  return typeof value === "string" ? value : null;
}

function openAiProductionRequirement(provider: string | null): MatterhornImageSetupRequirement {
  return {
    key: provider === "mock" ? "openai_api_key" : "image_provider",
    label: "Production image provider",
    status: "missing",
    envVar: provider === "mock" ? "OPENAI_API_KEY" : "MATTERHORN_IMAGE_PROVIDER",
    description: provider === "mock"
      ? "Local mock image generation is ready, but production smoke requires MATTERHORN_IMAGE_PROVIDER=openai and OPENAI_API_KEY."
      : "Production smoke requires a configured OpenAI image provider.",
  };
}

function unresolvedRequirements(
  requirements: MatterhornGeneratedMediaDiagnosticCheck["setupRequirements"] | undefined,
): Array<MatterhornImageSetupRequirement | MatterhornNftSetupRequirement> {
  return (requirements ?? []).filter((requirement) => requirement.status !== "configured");
}

function dedupeRequirements(
  requirements: Array<MatterhornImageSetupRequirement | MatterhornNftSetupRequirement>,
): Array<MatterhornImageSetupRequirement | MatterhornNftSetupRequirement> {
  const seen = new Set<string>();
  return requirements.filter((requirement) => {
    const key = `${requirement.envVar ?? ""}:${requirement.key}:${requirement.label}:${requirement.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function productionSmokeSummary(mode: MatterhornGeneratedMediaProductionSmokePlan["mode"], blockerCount: number): string {
  if (mode === "production_candidate") {
    return "Production smoke can run end-to-end after explicit user actions for public upload and wallet signing.";
  }
  if (mode === "local_test") {
    return "Local generated-media smoke can run, but production image generation still needs OpenAI setup.";
  }
  return `Production smoke is blocked by ${blockerCount} setup ${blockerCount === 1 ? "item" : "items"}.`;
}
