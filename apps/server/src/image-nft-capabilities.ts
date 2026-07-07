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
  suiKioskPackageId?: string;
  suiTransferPolicyPackageId?: string;
  walrusPublisherUrl?: string;
  walrusRelayUrl?: string;
}

export function resolveNftEnvironmentConfig(env: typeof process.env): NftEnvironmentConfig {
  return {
    suiNetwork: env.MATTERHORN_SUI_NETWORK as "sui-testnet" | "sui-mainnet" | undefined,
    suiNftPackageId: env.MATTERHORN_SUI_NFT_PACKAGE_ID?.trim(),
    suiNftModuleName: env.MATTERHORN_SUI_NFT_MODULE_NAME?.trim(),
    suiKioskPackageId: env.MATTERHORN_SUI_KIOSK_PACKAGE_ID?.trim(),
    suiTransferPolicyPackageId: env.MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID?.trim(),
    walrusPublisherUrl: env.MATTERHORN_WALRUS_PUBLISHER_URL?.trim(),
    walrusRelayUrl: env.MATTERHORN_WALRUS_RELAY_URL?.trim(),
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
  const publisherConfigured = Boolean(config.walrusPublisherUrl?.trim());
  const relayConfigured = Boolean(config.walrusRelayUrl?.trim());
  const status = publisherConfigured && relayConfigured ? "preview" : "needs_setup";
  return {
    ...capability(
      status,
      "Walrus storage",
      status === "preview"
        ? "Walrus publisher and relay are configured for upload handoff previews. Direct upload remains disabled until the connector is implemented."
        : "Walrus public storage is not configured. Set MATTERHORN_WALRUS_PUBLISHER_URL and MATTERHORN_WALRUS_RELAY_URL.",
      {
        publisherConfigured,
        relayConfigured,
      },
    ),
    publisherConfigured,
    relayConfigured,
  };
}

export function buildNftMintingCapability(config: NftEnvironmentConfig): MatterhornNftMintingCapability {
  const packageConfigured = Boolean(config.suiNftPackageId?.trim());
  const status = packageConfigured ? "preview" : "needs_setup";
  return {
    ...capability(
      status,
      "Sui NFT minting",
      status === "preview"
        ? "Sui NFT mint previews can be prepared. Minting is signed by the user's Sui wallet; Matterhorn has no custody."
        : "Sui NFT package is not configured. Set MATTERHORN_SUI_NFT_PACKAGE_ID to enable mint previews.",
      {
        network: config.suiNetwork ?? "sui-testnet",
        packageConfigured,
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
  const packageConfigured = Boolean(config.suiKioskPackageId?.trim() && config.suiTransferPolicyPackageId?.trim());
  const status = packageConfigured ? "preview" : "needs_setup";
  return {
    ...capability(
      status,
      "NFT marketplace listing",
      status === "preview"
        ? "Kiosk/TransferPolicy listing previews can be prepared. Listing transactions are signed by the user's Sui wallet."
        : "Kiosk/TransferPolicy config is not configured. Set MATTERHORN_SUI_KIOSK_PACKAGE_ID and MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID to enable listing previews.",
      {
        network: config.suiNetwork ?? "sui-testnet",
        packageConfigured,
      },
    ),
    network: config.suiNetwork ?? "sui-testnet",
    custody: false,
    signing: "client_wallet",
    packageConfigured,
    kioskConfigured: packageConfigured,
  };
}

function capability(
  status: "working" | "needs_setup" | "preview" | "unsupported" | "error",
  label: string,
  description?: string,
  details?: Record<string, unknown>,
): { status: typeof status; label: string; description?: string; details?: Record<string, unknown> } {
  return { status, label, description, details };
}
