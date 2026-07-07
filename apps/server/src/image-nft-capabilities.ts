import type {
  MatterhornImageEditingCapability,
  MatterhornImageGenerationCapability,
  MatterhornImageProvider,
  MatterhornNftMarketplaceListingCapability,
  MatterhornNftMintingCapability,
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
      },
    ),
    publisherConfigured,
    relayConfigured,
  };
}

export function buildNftMintingCapability(config: NftEnvironmentConfig): MatterhornNftMintingCapability {
  const issues = validationIssuesFor(config, "MATTERHORN_SUI_NETWORK");
  const packageConfigured = Boolean(config.suiNftPackageId?.trim());
  const status = issues.length ? "error" : packageConfigured ? "preview" : "needs_setup";
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
      },
    ),
    network: config.suiNetwork ?? "sui-testnet",
    custody: false,
    signing: "client_wallet",
    packageConfigured,
    kioskConfigured: false,
  };
}

export function buildNftMarketplaceListingCapability(
  config: NftEnvironmentConfig,
): MatterhornNftMarketplaceListingCapability {
  const issues = validationIssuesFor(config, "MATTERHORN_SUI_NETWORK");
  const packageConfigured = Boolean(config.suiKioskPackageId?.trim() && config.suiTransferPolicyPackageId?.trim());
  const status = issues.length ? "error" : packageConfigured ? "preview" : "needs_setup";
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
      },
    ),
    network: config.suiNetwork ?? "sui-testnet",
    custody: false,
    signing: "client_wallet",
    packageConfigured,
    kioskConfigured: packageConfigured,
  };
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

function capability(
  status: "working" | "needs_setup" | "preview" | "unsupported" | "error",
  label: string,
  description?: string,
  details?: Record<string, unknown>,
): { status: typeof status; label: string; description?: string; details?: Record<string, unknown> } {
  return { status, label, description, details };
}
