import type {
  MatterhornGeneratedMediaDiagnosticCheck,
  MatterhornGeneratedMediaDiagnosticStatus,
  MatterhornGeneratedMediaDiagnosticsResponse,
  MatterhornGeneratedMediaProductionSmokePlan,
  MatterhornGeneratedMediaProductionSmokeStage,
  MatterhornImageSetupRequirement,
  MatterhornNftSetupRequirement,
} from "@matterhorn-work/types/generated-media";
import { SuiGrpcClient } from "@mysten/sui/grpc";
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
import {
  normalizeMatterhornSuiAddress,
  SUI_GRPC_URLS,
  type SuiNetwork,
} from "./tools/sui.js";

type DiagnosticEnv = typeof process.env;

export interface GeneratedMediaDiagnosticsOptions {
  workspaceId: string;
  env?: DiagnosticEnv;
  fetchImpl?: typeof fetch;
  suiPackageVerifier?: SuiPackageVerifier;
  now?: () => Date;
  timeoutMs?: number;
}

export interface SuiPackageVerifier {
  verifyPackage(input: {
    network: "sui-testnet" | "sui-mainnet";
    packageId: string;
    signal: AbortSignal;
  }): Promise<{ status: "deployed" | "not_found" | "not_package" }>;
}

export interface GeneratedMediaReadinessMarkdownOptions {
  diagnostics: MatterhornGeneratedMediaDiagnosticsResponse;
}

interface ProbeResult {
  ok: boolean;
  status: number | null;
  summary: string;
  durationMs: number;
}

type SuiPackageVerificationStatus =
  | "not_checked"
  | "deployed"
  | "not_found"
  | "not_package"
  | "unavailable";

interface SuiPackageVerificationResult {
  status: SuiPackageVerificationStatus;
  durationMs: number;
}

export async function buildGeneratedMediaDiagnostics(
  options: GeneratedMediaDiagnosticsOptions,
): Promise<MatterhornGeneratedMediaDiagnosticsResponse> {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const nftEnv = resolveNftEnvironmentConfig(env);
  const timeoutMs = options.timeoutMs ?? 2_500;
  const suiPackageVerifier = options.suiPackageVerifier ?? createSuiPackageVerifier();
  const checks = await Promise.all([
    imageProviderDiagnostic(env),
    walrusDiagnostic(nftEnv, options.fetchImpl ?? fetch, timeoutMs),
    suiMintingDiagnostic(nftEnv, suiPackageVerifier, timeoutMs),
    suiListingDiagnostic(nftEnv, suiPackageVerifier, timeoutMs),
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

async function suiMintingDiagnostic(
  config: NftEnvironmentConfig,
  verifier: SuiPackageVerifier,
  timeoutMs: number,
): Promise<MatterhornGeneratedMediaDiagnosticCheck> {
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
  const packageVerification = shapeIssues.length === 0
    ? await verifyConfiguredSuiPackage(config, config.suiNftPackageId, verifier, timeoutMs)
    : notCheckedSuiPackage();
  const status = suiDiagnosticStatus(setupStatus, shapeIssues, [packageVerification]);
  const summary = shapeIssues.length
    ? shapeIssues.join(" ")
    : suiPackageSummary(
      "Sui NFT package",
      config.suiNetwork,
      packageVerification,
      capability.description ?? "Sui NFT minting readiness was checked.",
    );

  return {
    id: "sui_nft_minting",
    label: "Sui NFT minting",
    status,
    summary,
    durationMs: Date.now() - startedAt,
    details: {
      network: config.suiNetwork ?? "sui-testnet",
      packageConfigured: Boolean(config.suiNftPackageId?.trim()),
      packagePlaceholder: isPlaceholderSuiObjectId(config.suiNftPackageId),
      packageDeploymentStatus: packageVerification.status,
      packageDeploymentVerified: packageVerification.status === "deployed",
      packageVerificationMs: packageVerification.durationMs,
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

async function suiListingDiagnostic(
  config: NftEnvironmentConfig,
  verifier: SuiPackageVerifier,
  timeoutMs: number,
): Promise<MatterhornGeneratedMediaDiagnosticCheck> {
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
  const [kioskPackageVerification, transferPolicyPackageVerification] = shapeIssues.length === 0
    ? await Promise.all([
      verifyConfiguredSuiPackage(config, config.suiKioskPackageId, verifier, timeoutMs),
      verifyConfiguredSuiPackage(config, config.suiTransferPolicyPackageId, verifier, timeoutMs),
    ])
    : [notCheckedSuiPackage(), notCheckedSuiPackage()];
  const status = suiDiagnosticStatus(
    setupStatus,
    shapeIssues,
    [kioskPackageVerification, transferPolicyPackageVerification],
  );
  const summary = shapeIssues.length
    ? shapeIssues.join(" ")
    : suiListingPackageSummary(
      config,
      kioskPackageVerification,
      transferPolicyPackageVerification,
      capability.description ?? "Sui marketplace listing readiness was checked.",
    );

  return {
    id: "sui_marketplace_listing",
    label: "Marketplace listing",
    status,
    summary,
    durationMs: Date.now() - startedAt,
    details: {
      network: config.suiNetwork ?? "sui-testnet",
      kioskPackageConfigured: Boolean(config.suiKioskPackageId?.trim()),
      kioskPackagePlaceholder: isPlaceholderSuiObjectId(config.suiKioskPackageId),
      kioskPackageDeploymentStatus: kioskPackageVerification.status,
      kioskPackageDeploymentVerified: kioskPackageVerification.status === "deployed",
      kioskPackageVerificationMs: kioskPackageVerification.durationMs,
      transferPolicyPackageConfigured: Boolean(config.suiTransferPolicyPackageId?.trim()),
      transferPolicyPackagePlaceholder: isPlaceholderSuiObjectId(config.suiTransferPolicyPackageId),
      transferPolicyPackageDeploymentStatus: transferPolicyPackageVerification.status,
      transferPolicyPackageDeploymentVerified: transferPolicyPackageVerification.status === "deployed",
      transferPolicyPackageVerificationMs: transferPolicyPackageVerification.durationMs,
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

function createSuiPackageVerifier(): SuiPackageVerifier {
  const clients = new Map<SuiNetwork, SuiGrpcClient>();
  return {
    async verifyPackage(input) {
      const network: SuiNetwork = input.network === "sui-mainnet" ? "mainnet" : "testnet";
      let client = clients.get(network);
      if (!client) {
        client = new SuiGrpcClient({
          network,
          baseUrl: SUI_GRPC_URLS[network],
        });
        clients.set(network, client);
      }

      try {
        const { object } = await client.getObject({
          objectId: normalizeMatterhornSuiAddress(input.packageId),
          signal: input.signal,
        });
        return { status: object.type === "package" ? "deployed" : "not_package" };
      } catch (error) {
        if (isSuiNotFoundError(error)) return { status: "not_found" };
        throw error;
      }
    },
  };
}

async function verifyConfiguredSuiPackage(
  config: NftEnvironmentConfig,
  packageId: string | undefined,
  verifier: SuiPackageVerifier,
  timeoutMs: number,
): Promise<SuiPackageVerificationResult> {
  if (!packageId?.trim() || isPlaceholderSuiObjectId(packageId)) return notCheckedSuiPackage();
  const startedAt = Date.now();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      verifier.verifyPackage({
        network: config.suiNetwork ?? "sui-testnet",
        packageId,
        signal: controller.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Sui package verification timed out."));
        }, timeoutMs);
      }),
    ]);
    return {
      status: result.status,
      durationMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: "unavailable",
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function notCheckedSuiPackage(): SuiPackageVerificationResult {
  return { status: "not_checked", durationMs: 0 };
}

function suiDiagnosticStatus(
  setupStatus: MatterhornGeneratedMediaDiagnosticStatus,
  shapeIssues: string[],
  verifications: SuiPackageVerificationResult[],
): MatterhornGeneratedMediaDiagnosticStatus {
  if (setupStatus === "fail" || shapeIssues.length > 0) return "fail";
  if (verifications.some((verification) => (
    verification.status === "not_found" || verification.status === "not_package"
  ))) {
    return "fail";
  }
  if (
    setupStatus === "warning"
    || verifications.some((verification) => verification.status === "unavailable")
  ) {
    return "warning";
  }
  return "pass";
}

function suiPackageSummary(
  label: string,
  network: NftEnvironmentConfig["suiNetwork"],
  verification: SuiPackageVerificationResult,
  fallback: string,
): string {
  const networkLabel = network === "sui-mainnet" ? "Sui mainnet" : "Sui testnet";
  if (verification.status === "deployed") {
    return `${label} is deployed on ${networkLabel}. No transaction was prepared or submitted.`;
  }
  if (verification.status === "not_found") return `${label} was not found on ${networkLabel}.`;
  if (verification.status === "not_package") {
    return `${label} exists on ${networkLabel}, but it is not a Move package.`;
  }
  if (verification.status === "unavailable") {
    return `${label} could not be verified on ${networkLabel}. No transaction was prepared or submitted.`;
  }
  return fallback;
}

function suiListingPackageSummary(
  config: NftEnvironmentConfig,
  kiosk: SuiPackageVerificationResult,
  transferPolicy: SuiPackageVerificationResult,
  fallback: string,
): string {
  if (kiosk.status === "not_checked" && transferPolicy.status === "not_checked") return fallback;
  if (kiosk.status === "deployed" && transferPolicy.status === "deployed") {
    return `Sui Kiosk and TransferPolicy packages are deployed on ${config.suiNetwork === "sui-mainnet" ? "Sui mainnet" : "Sui testnet"}. No transaction was prepared or submitted.`;
  }
  const issues = [
    suiPackageIssueLabel("Sui Kiosk package", kiosk.status),
    suiPackageIssueLabel("Sui TransferPolicy package", transferPolicy.status),
  ].filter((issue): issue is string => Boolean(issue));
  if (issues.length === 0) return fallback;
  return `${issues.join(" ")} No transaction was prepared or submitted.`;
}

function suiPackageIssueLabel(label: string, status: SuiPackageVerificationStatus): string | null {
  if (status === "not_found") return `${label} was not found on the selected Sui network.`;
  if (status === "not_package") return `${label} exists, but it is not a Move package.`;
  if (status === "unavailable") return `${label} could not be verified on the selected Sui network.`;
  return null;
}

function isSuiNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as Error & { code?: unknown }).code;
  return code === 5
    || code === "5"
    || String(code ?? "").toLowerCase() === "not_found"
    || /^Object 0x[0-9a-f]+ not found$/i.test(error.message.trim());
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
    publisherProductionEndpoint: isProductionHttpsUrl(config.walrusPublisherUrl),
    relayConfigured: Boolean(config.walrusRelayUrl?.trim()),
    relayProductionEndpoint: isProductionHttpsUrl(config.walrusRelayUrl),
    storageEpochs: config.walrusStorageEpochs ?? 1,
    publisherAuthConfigured: Boolean(config.walrusPublisherBearerToken?.trim()),
  };
}

function isProductionHttpsUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname === "::"
      || hostname === "::1"
      || hostname === "0.0.0.0"
      || hostname.startsWith("127.")
      || hostname.startsWith("10.")
      || hostname.startsWith("192.168.")
      || hostname.startsWith("169.254.")
    ) {
      return false;
    }
    const ipv4Parts = hostname.split(".").map(Number);
    if (
      ipv4Parts.length === 4
      && ipv4Parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
      && ipv4Parts[0] === 172
      && ipv4Parts[1] >= 16
      && ipv4Parts[1] <= 31
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isPlaceholderSuiObjectId(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  try {
    const normalized = normalizeMatterhornSuiAddress(value).slice(2).toLowerCase();
    return /^([0-9a-f])\1{63}$/.test(normalized);
  } catch {
    return false;
  }
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
  const isProductionWalrus = walrusStorage.status === "pass"
    && booleanDetail(walrusStorage, "publisherProductionEndpoint")
    && booleanDetail(walrusStorage, "relayProductionEndpoint");
  const isProductionSuiMinting = suiMinting.status === "pass"
    && booleanDetail(suiMinting, "packageDeploymentVerified");
  const isProductionSuiListing = suiListing.status === "pass"
    && booleanDetail(suiListing, "kioskPackageDeploymentVerified")
    && booleanDetail(suiListing, "transferPolicyPackageDeploymentVerified");
  const productionWalrusRequirements = [
    ...productionEndpointRequirement(
      "walrus_publisher",
      "Production Walrus publisher",
      "MATTERHORN_WALRUS_PUBLISHER_URL",
      booleanDetail(walrusStorage, "publisherConfigured"),
      booleanDetail(walrusStorage, "publisherProductionEndpoint"),
    ),
    ...productionEndpointRequirement(
      "walrus_relay",
      "Production Walrus relay",
      "MATTERHORN_WALRUS_RELAY_URL",
      booleanDetail(walrusStorage, "relayConfigured"),
      booleanDetail(walrusStorage, "relayProductionEndpoint"),
    ),
  ];
  const productionMintRequirements = productionSuiPackageRequirement(
    "sui_nft_package",
    "Production Sui NFT package",
    "MATTERHORN_SUI_NFT_PACKAGE_ID",
    booleanDetail(suiMinting, "packageConfigured"),
    booleanDetail(suiMinting, "packagePlaceholder"),
    stringDetail(suiMinting, "packageDeploymentStatus"),
  );
  const productionListingRequirements = [
    ...productionSuiPackageRequirement(
      "sui_kiosk_package",
      "Production Sui Kiosk package",
      "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
      booleanDetail(suiListing, "kioskPackageConfigured"),
      booleanDetail(suiListing, "kioskPackagePlaceholder"),
      stringDetail(suiListing, "kioskPackageDeploymentStatus"),
    ),
    ...productionSuiPackageRequirement(
      "sui_transfer_policy",
      "Production Sui TransferPolicy package",
      "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
      booleanDetail(suiListing, "transferPolicyPackageConfigured"),
      booleanDetail(suiListing, "transferPolicyPackagePlaceholder"),
      stringDetail(suiListing, "transferPolicyPackageDeploymentStatus"),
    ),
  ];

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
      status: isProductionWalrus ? "manual" : "blocked",
      writeScope: "public_storage",
      requiresWallet: false,
      requiresPublicWrite: true,
      summary: isProductionWalrus
        ? "Walrus endpoints responded. Uploading image bytes is a public storage action and still requires explicit user confirmation."
        : walrusStorage.status === "pass"
          ? "Local Walrus endpoints passed safe diagnostics, but production evidence requires public HTTPS publisher and relay endpoints."
          : "Walrus upload is blocked until publisher and relay setup pass diagnostics.",
      setupRequirements: [
        ...unresolvedRequirements(walrusStorage.setupRequirements),
        ...productionWalrusRequirements,
      ],
    },
    {
      id: "sui_wallet_mint",
      label: "Sign Sui mint transaction",
      status: isProductionSuiMinting ? "manual" : "blocked",
      writeScope: "wallet_signed_transaction",
      requiresWallet: true,
      requiresPublicWrite: true,
      summary: isProductionSuiMinting
        ? "Mint preview can be prepared; the user must review and sign with a Sui wallet."
        : suiMinting.status === "pass"
          ? "Local mint previews work, but production evidence requires a Sui NFT package verified on the selected network."
          : "Minting is blocked until the Sui NFT package is configured and verified on the selected network.",
      setupRequirements: [
        ...unresolvedRequirements(suiMinting.setupRequirements),
        ...productionMintRequirements,
      ],
    },
    {
      id: "sui_kiosk_listing",
      label: "Sign marketplace listing transaction",
      status: isProductionSuiListing ? "manual" : "blocked",
      writeScope: "wallet_signed_transaction",
      requiresWallet: true,
      requiresPublicWrite: true,
      summary: isProductionSuiListing
        ? "Kiosk listing preview can be prepared; the user must review and sign with a Sui wallet."
        : suiListing.status === "pass"
          ? "Local listing previews work, but production evidence requires Kiosk and TransferPolicy packages verified on the selected network."
          : "Marketplace listing is blocked until the Kiosk and TransferPolicy packages are configured and verified on the selected network.",
      setupRequirements: [
        ...unresolvedRequirements(suiListing.setupRequirements),
        ...productionListingRequirements,
      ],
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

function booleanDetail(check: MatterhornGeneratedMediaDiagnosticCheck, key: string): boolean {
  return check.details?.[key] === true;
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

function productionEndpointRequirement(
  key: "walrus_publisher" | "walrus_relay",
  label: string,
  envVar: "MATTERHORN_WALRUS_PUBLISHER_URL" | "MATTERHORN_WALRUS_RELAY_URL",
  configured: boolean,
  productionEndpoint: boolean,
): MatterhornNftSetupRequirement[] {
  if (!configured || productionEndpoint) return [];
  return [{
    key,
    label,
    status: "invalid",
    envVar,
    description: "Production readiness requires a public HTTPS endpoint; loopback, private-network, and HTTP endpoints remain local QA only.",
  }];
}

function productionSuiPackageRequirement(
  key: "sui_nft_package" | "sui_kiosk_package" | "sui_transfer_policy",
  label: string,
  envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID" | "MATTERHORN_SUI_KIOSK_PACKAGE_ID" | "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
  configured: boolean,
  placeholder: boolean,
  deploymentStatus: string | null,
): MatterhornNftSetupRequirement[] {
  if (!configured || deploymentStatus === "deployed") return [];
  const description = placeholder
    ? "Production readiness requires a package verified on the selected Sui network; repeated-character smoke placeholders remain local QA only."
    : deploymentStatus === "not_found"
      ? "The configured package id was not found on the selected Sui network."
      : deploymentStatus === "not_package"
        ? "The configured object exists on the selected Sui network, but it is not a Move package."
        : "Matterhorn could not verify this package on the selected Sui network. Check network access and retry diagnostics.";
  return [{
    key,
    label,
    status: "invalid",
    envVar,
    description,
  }];
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

export function generatedMediaReadinessReportFilename(workspaceId: string, checkedAt: string): string {
  const workspace = workspaceId.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "workspace";
  const date = checkedAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
  return `matterhorn-generated-media-readiness-${workspace}-${date}.md`;
}

export function buildGeneratedMediaReadinessMarkdown(
  options: GeneratedMediaReadinessMarkdownOptions,
): string {
  const diagnostics = options.diagnostics;
  const plan = diagnostics.productionSmokePlan;
  const ready = diagnostics.status === "pass"
    && plan.mode === "production_candidate"
    && plan.canRunEndToEnd === true;
  const lines = [
    "# Matterhorn Generated Media Readiness",
    "",
    `Generated: ${markdownEscape(diagnostics.checkedAt)}`,
    `Workspace: ${markdownEscape(diagnostics.workspaceId)}`,
    `Mode: ${markdownEscape(productionModeLabel(plan.mode))}`,
    `Status: ${markdownEscape(diagnostics.status)}`,
    `End-to-end production flow: ${ready ? "ready" : "not ready"}`,
    "No public writes were performed.",
    "",
    "## Summary",
    "",
    markdownEscape(diagnostics.summary || plan.summary || "Generated media readiness was checked."),
    "",
    "## Safety",
    "",
    "- Non-custodial: yes",
    "- Can submit transactions: no",
    `- Wallet signing: ${markdownEscape(diagnostics.safety.walletSigning)}`,
    "- Public writes during diagnostics: no",
    "- Stores secrets: no",
    "- Public writes only after user action: yes",
    "",
    "## Checks",
    "",
    "| Check | Status | Summary |",
    "| --- | --- | --- |",
  ];

  if (diagnostics.checks.length === 0) {
    lines.push("| None | unknown | No checks returned. |");
  } else {
    for (const check of diagnostics.checks) {
      lines.push(`| ${markdownEscape(check.label || check.id)} | ${markdownEscape(check.status)} | ${markdownEscape(check.summary)} |`);
    }
  }

  lines.push(
    "",
    "## Production Stages",
    "",
    "| Stage | Status | Write scope | Wallet | Public write | Summary |",
    "| --- | --- | --- | --- | --- | --- |",
  );

  if (plan.stages.length === 0) {
    lines.push("| None | unknown | none | no | no | No stages returned. |");
  } else {
    for (const stage of plan.stages) {
      lines.push(`| ${markdownEscape(stage.label || stage.id)} | ${markdownEscape(stage.status)} | ${markdownEscape(stage.writeScope)} | ${stage.requiresWallet ? "yes" : "no"} | ${stage.requiresPublicWrite ? "yes" : "no"} | ${markdownEscape(stage.summary)} |`);
    }
  }

  lines.push("", "## Blockers", "");
  if (plan.blockers.length === 0) {
    lines.push("- None");
  } else {
    for (const blocker of plan.blockers) {
      const env = blocker.envVar ? ` (${blocker.envVar})` : "";
      lines.push(`- ${markdownListLine(blocker.label)}${env}: ${markdownListLine(blocker.description || blocker.status)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function productionModeLabel(mode: MatterhornGeneratedMediaProductionSmokePlan["mode"]): string {
  if (mode === "production_candidate") return "production candidate";
  if (mode === "local_test") return "local test";
  return "needs setup";
}

function markdownEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, " ")
    .trim();
}

function markdownListLine(value: unknown, fallback = "None"): string {
  const text = String(value ?? "").trim();
  return text ? markdownEscape(text) : fallback;
}
