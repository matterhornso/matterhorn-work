import type {
  MatterhornImageEditingCapability,
  MatterhornImageGenerationCapability,
  MatterhornImageSetupRequirement,
  MatterhornImageProvider,
  MatterhornNftMarketplaceListingCapability,
  MatterhornNftMintingCapability,
  MatterhornNftSetupRequirement,
  MatterhornWalrusStorageCapability,
} from "@matterhorn-work/types/generated-media";
import type { ImageGenerationProviderConfig, ImageGenerationProviderStatus } from "./image-generation-provider.js";

export interface NftEnvironmentConfig {
  suiNetwork?: "sui-testnet" | "sui-mainnet";
  suiNftPackageId?: string;
  suiNftModuleName?: string;
  suiNftType?: string;
  suiKioskPackageId?: string;
  suiKioskId?: string;
  suiKioskOwnerCapId?: string;
  suiTransferPolicyId?: string;
  suiTransferPolicyPackageId?: string;
  walrusPublisherUrl?: string;
  walrusPublisherBearerToken?: string;
  walrusRelayUrl?: string;
  walrusStorageEpochs?: number;
  validationIssues?: NftEnvironmentValidationIssue[];
}

export interface NftEnvironmentValidationIssue {
  field:
    | "MATTERHORN_SUI_NETWORK"
    | "MATTERHORN_WALRUS_PUBLISHER_URL"
    | "MATTERHORN_WALRUS_RELAY_URL"
    | "MATTERHORN_WALRUS_STORAGE_EPOCHS";
  message: string;
}

export function resolveNftEnvironmentConfig(env: typeof process.env): NftEnvironmentConfig {
  const storageEpochs = Number(env.MATTERHORN_WALRUS_STORAGE_EPOCHS ?? "");
  const validationIssues: NftEnvironmentValidationIssue[] = [];
  const suiNetwork = parseSuiNetwork(env.MATTERHORN_SUI_NETWORK, validationIssues);
  const walrusPublisherUrl = parsePublicHttpUrl(
    env.MATTERHORN_WALRUS_PUBLISHER_URL,
    "MATTERHORN_WALRUS_PUBLISHER_URL",
    validationIssues,
  );
  const walrusRelayUrl = parsePublicHttpUrl(
    env.MATTERHORN_WALRUS_RELAY_URL,
    "MATTERHORN_WALRUS_RELAY_URL",
    validationIssues,
  );
  if (
    env.MATTERHORN_WALRUS_STORAGE_EPOCHS?.trim()
    && (!Number.isFinite(storageEpochs) || storageEpochs <= 0)
  ) {
    validationIssues.push({
      field: "MATTERHORN_WALRUS_STORAGE_EPOCHS",
      message: "MATTERHORN_WALRUS_STORAGE_EPOCHS must be a positive number.",
    });
  }
  return {
    suiNetwork,
    suiNftPackageId: env.MATTERHORN_SUI_NFT_PACKAGE_ID?.trim(),
    suiNftModuleName: env.MATTERHORN_SUI_NFT_MODULE_NAME?.trim(),
    suiNftType: env.MATTERHORN_SUI_NFT_TYPE?.trim(),
    suiKioskPackageId: env.MATTERHORN_SUI_KIOSK_PACKAGE_ID?.trim(),
    suiKioskId: env.MATTERHORN_SUI_KIOSK_ID?.trim(),
    suiKioskOwnerCapId: env.MATTERHORN_SUI_KIOSK_OWNER_CAP_ID?.trim(),
    suiTransferPolicyId: env.MATTERHORN_SUI_TRANSFER_POLICY_ID?.trim(),
    suiTransferPolicyPackageId: env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID?.trim(),
    walrusPublisherUrl,
    walrusPublisherBearerToken: env.MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN?.trim(),
    walrusRelayUrl,
    walrusStorageEpochs: Number.isFinite(storageEpochs) && storageEpochs > 0 ? Math.floor(storageEpochs) : undefined,
    validationIssues,
  };
}

export function buildImageGenerationCapability(
  providerStatus: ImageGenerationProviderStatus,
): MatterhornImageGenerationCapability {
  const setupRequirements = buildImageGenerationSetupRequirements(providerStatus);
  return {
    ...capability(
      providerStatus.status,
      providerStatus.provider === "openai" ? "Image generation (OpenAI)" : "Image generation (mock)",
      providerStatus.status === "working"
        ? `Generate images from chat using ${providerStatus.provider}. Images are saved as workspace outputs.`
        : providerStatus.message ?? "Image generation is not configured.",
    ),
    providers: [providerStatus],
    defaultProvider: providerStatus.provider,
    defaultModel: providerStatus.model,
    setupRequirements,
  };
}

export function buildImageEditingCapability(
  providerStatus: ImageGenerationProviderStatus,
): MatterhornImageEditingCapability {
  const status = providerStatus.status === "working" ? "preview" : providerStatus.status;
  return {
    ...capability(
      status,
      "Image editing",
      status === "preview"
        ? "Image editing is in preview and requires a configured provider."
        : "Image editing requires image generation to be configured first.",
    ),
    providers: [providerStatus],
  };
}

export function buildWalrusStorageCapability(config: NftEnvironmentConfig): MatterhornWalrusStorageCapability {
  const issues = validationIssuesFor(config, "MATTERHORN_WALRUS_PUBLISHER_URL", "MATTERHORN_WALRUS_RELAY_URL", "MATTERHORN_WALRUS_STORAGE_EPOCHS");
  const publisherConfigured = Boolean(config.walrusPublisherUrl?.trim());
  const relayConfigured = Boolean(config.walrusRelayUrl?.trim());
  const status = issues.length ? "error" : publisherConfigured && relayConfigured ? "working" : "needs_setup";
  const setupRequirements = buildWalrusCapabilitySetupRequirements(config);
  return {
    ...capability(
      status,
      "Walrus storage",
      status === "error"
        ? "Walrus public storage has invalid setup. Fix the highlighted environment values before uploading NFT media."
        : status === "working"
        ? "Walrus publisher and relay are configured for explicit public NFT media upload."
        : "Walrus public storage is not configured. Set MATTERHORN_WALRUS_PUBLISHER_URL and MATTERHORN_WALRUS_RELAY_URL.",
      {
        publisherConfigured,
        relayConfigured,
        storageEpochs: config.walrusStorageEpochs ?? 1,
        validationIssues: issues,
        setupRequirements,
      },
    ),
    publisherConfigured,
    relayConfigured,
    setupRequirements,
  };
}

export function buildNftMintingCapability(config: NftEnvironmentConfig): MatterhornNftMintingCapability {
  const issues = validationIssuesFor(config, "MATTERHORN_SUI_NETWORK");
  const packageConfigured = Boolean(config.suiNftPackageId?.trim());
  const status = issues.length ? "error" : packageConfigured ? "preview" : "needs_setup";
  const setupRequirements = buildMintCapabilitySetupRequirements(config);
  return {
    ...capability(
      status,
      "Sui NFT minting",
      status === "error"
        ? "Sui NFT minting has invalid setup. Fix the network value before preparing mint previews."
        : status === "preview"
        ? "Sui NFT mint previews can be prepared. Minting is signed by the user's Sui wallet; Matterhorn has no custody."
        : "Sui NFT package is not configured. Set MATTERHORN_SUI_NFT_PACKAGE_ID to enable mint previews.",
      {
        network: config.suiNetwork ?? "sui-testnet",
        packageConfigured,
        validationIssues: issues,
        setupRequirements,
      },
    ),
    network: config.suiNetwork ?? "sui-testnet",
    custody: false,
    signing: "client_wallet",
    packageConfigured,
    kioskConfigured: false,
    setupRequirements,
  };
}

export function buildNftMarketplaceListingCapability(
  config: NftEnvironmentConfig,
): MatterhornNftMarketplaceListingCapability {
  const issues = validationIssuesFor(config, "MATTERHORN_SUI_NETWORK");
  const packageConfigured = Boolean(config.suiKioskPackageId?.trim() && config.suiTransferPolicyPackageId?.trim());
  const status = issues.length ? "error" : packageConfigured ? "preview" : "needs_setup";
  const setupRequirements = buildListingCapabilitySetupRequirements(config);
  return {
    ...capability(
      status,
      "NFT marketplace listing",
      status === "error"
        ? "NFT marketplace listing has invalid setup. Fix the network value before preparing listing previews."
        : status === "preview"
        ? "Kiosk/TransferPolicy listing previews can be prepared. Listing transactions are signed by the user's Sui wallet."
        : "Kiosk/TransferPolicy config is not configured. Set MATTERHORN_SUI_KIOSK_PACKAGE_ID and MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID to enable listing previews.",
      {
        network: config.suiNetwork ?? "sui-testnet",
        packageConfigured,
        validationIssues: issues,
        setupRequirements,
      },
    ),
    network: config.suiNetwork ?? "sui-testnet",
    custody: false,
    signing: "client_wallet",
    packageConfigured,
    kioskConfigured: packageConfigured,
    setupRequirements,
  };
}

function buildImageGenerationSetupRequirements(
  status: ImageGenerationProviderStatus,
): MatterhornImageSetupRequirement[] {
  if (status.status === "working" || status.status === "preview") return [];

  if (status.status === "needs_setup" && status.provider === "openai") {
    return [{
      key: "openai_api_key",
      label: "OpenAI API key",
      status: "missing",
      envVar: "OPENAI_API_KEY",
      description: status.message ?? "OpenAI image generation requires an OPENAI_API_KEY.",
    }];
  }

  const envVar = imageConfigEnvVarFromMessage(status.message);
  return [{
    key: imageConfigRequirementKey(envVar),
    label: imageConfigRequirementLabel(envVar),
    status: "invalid",
    ...(envVar ? { envVar } : {}),
    description: status.message ?? "Image generation setup is invalid.",
  }];
}

function buildWalrusCapabilitySetupRequirements(config: NftEnvironmentConfig): MatterhornNftSetupRequirement[] {
  const publisherIssue = validationIssueFor(config, "MATTERHORN_WALRUS_PUBLISHER_URL");
  const relayIssue = validationIssueFor(config, "MATTERHORN_WALRUS_RELAY_URL");
  const epochsIssue = validationIssueFor(config, "MATTERHORN_WALRUS_STORAGE_EPOCHS");
  return [
    nftSetupRequirement({
      key: "walrus_publisher",
      label: "Walrus publisher",
      envVar: "MATTERHORN_WALRUS_PUBLISHER_URL",
      status: publisherIssue ? "invalid" : config.walrusPublisherUrl?.trim() ? "configured" : "missing",
      description: publisherIssue?.message ?? "Public NFT media upload needs a Walrus publisher endpoint.",
    }),
    nftSetupRequirement({
      key: "walrus_relay",
      label: "Walrus relay",
      envVar: "MATTERHORN_WALRUS_RELAY_URL",
      status: relayIssue ? "invalid" : config.walrusRelayUrl?.trim() ? "configured" : "missing",
      description: relayIssue?.message ?? "NFT media needs a public aggregator or relay URL after upload.",
    }),
    ...(epochsIssue ? [nftSetupRequirement({
      key: "walrus_storage_epochs",
      label: "Walrus storage epochs",
      envVar: "MATTERHORN_WALRUS_STORAGE_EPOCHS",
      status: "invalid",
      description: epochsIssue.message,
    })] : []),
  ];
}

function buildMintCapabilitySetupRequirements(config: NftEnvironmentConfig): MatterhornNftSetupRequirement[] {
  const networkIssue = validationIssueFor(config, "MATTERHORN_SUI_NETWORK");
  return [
    ...(networkIssue ? [nftSetupRequirement({
      key: "sui_network",
      label: "Sui network",
      envVar: "MATTERHORN_SUI_NETWORK",
      status: "invalid",
      description: networkIssue.message,
    })] : []),
    nftSetupRequirement({
      key: "sui_nft_package",
      label: "Sui NFT package",
      envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
      status: config.suiNftPackageId?.trim() ? "configured" : "missing",
      description: "Mint previews need the Move package id that defines the NFT mint entrypoint.",
    }),
    nftSetupRequirement({
      key: "sui_nft_module",
      label: "Sui NFT module",
      envVar: "MATTERHORN_SUI_NFT_MODULE_NAME",
      status: "configured",
      description: `Move module name for mint previews. Defaults to ${config.suiNftModuleName || "matterhorn_nft"}.`,
    }),
  ];
}

function buildListingCapabilitySetupRequirements(config: NftEnvironmentConfig): MatterhornNftSetupRequirement[] {
  const networkIssue = validationIssueFor(config, "MATTERHORN_SUI_NETWORK");
  return [
    ...(networkIssue ? [nftSetupRequirement({
      key: "sui_network",
      label: "Sui network",
      envVar: "MATTERHORN_SUI_NETWORK",
      status: "invalid",
      description: networkIssue.message,
    })] : []),
    nftSetupRequirement({
      key: "sui_kiosk_package",
      label: "Sui Kiosk package",
      envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
      status: config.suiKioskPackageId?.trim() ? "configured" : "missing",
      description: "Marketplace listing previews need the Kiosk package/config id.",
    }),
    nftSetupRequirement({
      key: "sui_transfer_policy",
      label: "Sui TransferPolicy",
      envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
      status: config.suiTransferPolicyPackageId?.trim() ? "configured" : "missing",
      description: "Listings need the TransferPolicy config that controls marketplace transfer rules.",
    }),
  ];
}

function nftSetupRequirement(input: MatterhornNftSetupRequirement): MatterhornNftSetupRequirement {
  return input;
}

function imageConfigEnvVarFromMessage(message: string | undefined): MatterhornImageSetupRequirement["envVar"] | undefined {
  const candidates = [
    "MATTERHORN_IMAGE_PROVIDER",
    "MATTERHORN_IMAGE_SIZE",
    "MATTERHORN_IMAGE_QUALITY",
    "MATTERHORN_IMAGE_FORMAT",
  ] as const;
  return candidates.find((candidate) => message?.includes(candidate));
}

function imageConfigRequirementKey(
  envVar: MatterhornImageSetupRequirement["envVar"] | undefined,
): MatterhornImageSetupRequirement["key"] {
  if (envVar === "MATTERHORN_IMAGE_SIZE") return "image_size";
  if (envVar === "MATTERHORN_IMAGE_QUALITY") return "image_quality";
  if (envVar === "MATTERHORN_IMAGE_FORMAT") return "image_format";
  return "image_provider";
}

function imageConfigRequirementLabel(envVar: MatterhornImageSetupRequirement["envVar"] | undefined): string {
  if (envVar === "MATTERHORN_IMAGE_SIZE") return "Image size";
  if (envVar === "MATTERHORN_IMAGE_QUALITY") return "Image quality";
  if (envVar === "MATTERHORN_IMAGE_FORMAT") return "Image format";
  return "Image provider";
}

function parseSuiNetwork(
  value: string | undefined,
  issues: NftEnvironmentValidationIssue[],
): NftEnvironmentConfig["suiNetwork"] {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed === "sui-testnet" || trimmed === "sui-mainnet") return trimmed;
  issues.push({
    field: "MATTERHORN_SUI_NETWORK",
    message: "MATTERHORN_SUI_NETWORK must be sui-testnet or sui-mainnet.",
  });
  return undefined;
}

function parsePublicHttpUrl(
  value: string | undefined,
  field: Extract<NftEnvironmentValidationIssue["field"], "MATTERHORN_WALRUS_PUBLISHER_URL" | "MATTERHORN_WALRUS_RELAY_URL">,
  issues: NftEnvironmentValidationIssue[],
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      issues.push({ field, message: `${field} must use http or https.` });
      return undefined;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    issues.push({ field, message: `${field} must be a valid URL.` });
    return undefined;
  }
}

function validationIssuesFor(
  config: NftEnvironmentConfig,
  ...fields: NftEnvironmentValidationIssue["field"][]
): NftEnvironmentValidationIssue[] {
  const allowed = new Set(fields);
  return (config.validationIssues ?? []).filter((issue) => allowed.has(issue.field));
}

function validationIssueFor(
  config: NftEnvironmentConfig,
  field: NftEnvironmentValidationIssue["field"],
): NftEnvironmentValidationIssue | undefined {
  return (config.validationIssues ?? []).find((issue) => issue.field === field);
}

function capability(
  status: "working" | "needs_setup" | "preview" | "unsupported" | "error",
  label: string,
  description?: string,
  details?: Record<string, unknown>,
): { status: typeof status; label: string; description?: string; details?: Record<string, unknown> } {
  return { status, label, description, details };
}
