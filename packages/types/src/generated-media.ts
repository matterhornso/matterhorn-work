import type { MatterhornCapability } from "./backend-capabilities.js";

export const MATTERHORN_IMAGE_PROVIDERS = ["mock", "openai"] as const;
export type MatterhornImageProvider = (typeof MATTERHORN_IMAGE_PROVIDERS)[number];

export const MATTERHORN_IMAGE_GENERATION_STATUSES = [
  "working",
  "needs_setup",
  "preview",
  "unsupported",
  "error",
] as const;
export type MatterhornImageGenerationStatus =
  (typeof MATTERHORN_IMAGE_GENERATION_STATUSES)[number];

export const MATTERHORN_IMAGE_FORMATS = ["png", "jpeg", "webp"] as const;
export type MatterhornImageFormat = (typeof MATTERHORN_IMAGE_FORMATS)[number];

export const MATTERHORN_IMAGE_SIZES = [
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "auto",
] as const;
export type MatterhornImageSize = (typeof MATTERHORN_IMAGE_SIZES)[number];

export const MATTERHORN_IMAGE_QUALITIES = ["auto", "high", "medium", "low"] as const;
export type MatterhornImageQuality = (typeof MATTERHORN_IMAGE_QUALITIES)[number];

export interface MatterhornGeneratedImageSafety {
  secretsRejected: boolean;
  publicFigureWarning?: boolean;
  copyrightWarning?: boolean;
}

export interface MatterhornGeneratedImage {
  id: string;
  workspaceId: string;
  outputId: string;
  provider: MatterhornImageProvider;
  model: string;
  prompt: string;
  promptRevised?: string;
  promptRedacted?: boolean;
  size: string;
  quality: string;
  format: MatterhornImageFormat;
  fileName: string;
  relativePath: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  createdAt: string;
  status: "generated" | "failed";
  safety: MatterhornGeneratedImageSafety;
}

export interface MatterhornImageGenerationInput {
  prompt: string;
  size?: MatterhornImageSize;
  quality?: MatterhornImageQuality;
  format?: MatterhornImageFormat;
  model?: string;
  n?: number;
  sessionId?: string;
  desk?: string;
}

export interface MatterhornImageGenerationResult {
  success: true;
  image: MatterhornGeneratedImage;
}

export interface MatterhornImageGenerationError {
  success: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type MatterhornImageGenerationResponse =
  | MatterhornImageGenerationResult
  | MatterhornImageGenerationError;

export interface MatterhornImageCapability extends MatterhornCapability {
  provider: MatterhornImageProvider;
  model: string;
  size: string;
  quality: string;
  format: MatterhornImageFormat;
}

export interface MatterhornImageGenerationCapability extends MatterhornCapability {
  providers: MatterhornImageCapability[];
  defaultProvider: MatterhornImageProvider;
  defaultModel: string;
}

export interface MatterhornImageEditingCapability extends MatterhornCapability {
  providers: MatterhornImageCapability[];
}

export const MATTERHORN_NFT_DRAFT_STATUSES = [
  "draft",
  "storage_ready",
  "mint_preview_ready",
  "minted",
  "listed",
  "needs_setup",
  "blocked",
] as const;
export type MatterhornNftDraftStatus = (typeof MATTERHORN_NFT_DRAFT_STATUSES)[number];

export const MATTERHORN_NFT_STORAGE_STATUSES = [
  "local_only",
  "ready_to_upload",
  "uploaded",
  "needs_setup",
  "failed",
] as const;
export type MatterhornNftStorageStatus = (typeof MATTERHORN_NFT_STORAGE_STATUSES)[number];

export const MATTERHORN_NFT_MINT_STATUSES = [
  "not_ready",
  "preview_ready",
  "signed",
  "submitted",
  "confirmed",
  "needs_setup",
  "failed",
] as const;
export type MatterhornNftMintStatus = (typeof MATTERHORN_NFT_MINT_STATUSES)[number];

export const MATTERHORN_NFT_LISTING_STATUSES = [
  "not_ready",
  "preview_ready",
  "listed",
  "needs_setup",
  "failed",
] as const;
export type MatterhornNftListingStatus = (typeof MATTERHORN_NFT_LISTING_STATUSES)[number];

export interface MatterhornNftAttribute {
  trait_type: string;
  value: string | number | boolean;
}

export interface MatterhornNftDraftStorage {
  provider: "walrus" | "local";
  status: MatterhornNftStorageStatus;
  blobId?: string | null;
  url?: string | null;
  error?: string | null;
}

export interface MatterhornNftDraftMint {
  status: MatterhornNftMintStatus;
  transactionDigest?: string | null;
  objectId?: string | null;
  packageId?: string | null;
  error?: string | null;
}

export interface MatterhornNftDraftListing {
  status: MatterhornNftListingStatus;
  kioskId?: string | null;
  transferPolicyId?: string | null;
  priceMist?: string | null;
  error?: string | null;
}

export interface MatterhornNftDraftMetadata {
  name: string;
  description: string;
  imageUrl?: string | null;
  attributes: MatterhornNftAttribute[];
  license?: string | null;
  usageNote?: string | null;
}

export interface MatterhornImageNftDraft {
  id: string;
  workspaceId: string;
  imageId: string;
  status: MatterhornNftDraftStatus;
  title: string;
  description: string;
  creatorAddress?: string | null;
  network: "sui-testnet" | "sui-mainnet";
  metadata: MatterhornNftDraftMetadata;
  storage: MatterhornNftDraftStorage;
  mint: MatterhornNftDraftMint;
  listing: MatterhornNftDraftListing;
  createdAt: string;
  updatedAt: string;
}

export interface MatterhornImageNftDraftInput {
  title?: string;
  description?: string;
  creatorAddress?: string;
  network?: "sui-testnet" | "sui-mainnet";
  metadata?: Partial<MatterhornNftDraftMetadata>;
  attributes?: MatterhornNftAttribute[];
  listingPriceMist?: string;
}

export interface MatterhornNftCapability extends MatterhornCapability {
  network: "sui-testnet" | "sui-mainnet" | null;
  custody: false;
  signing: "client_wallet";
  packageConfigured: boolean;
  kioskConfigured: boolean;
}

export interface MatterhornNftMintingCapability extends MatterhornNftCapability {}
export interface MatterhornNftMarketplaceListingCapability extends MatterhornNftCapability {}

export interface MatterhornWalrusStorageCapability extends MatterhornCapability {
  publisherConfigured: boolean;
  relayConfigured: boolean;
}

export type MatterhornNftSetupRequirementStatus = "configured" | "missing" | "not_implemented";

export type MatterhornNftSetupRequirementKey =
  | "walrus_publisher"
  | "walrus_relay"
  | "walrus_upload_connector"
  | "sui_nft_package"
  | "sui_nft_module"
  | "sui_kiosk_package"
  | "sui_transfer_policy";

export interface MatterhornNftSetupRequirement {
  key: MatterhornNftSetupRequirementKey;
  label: string;
  status: MatterhornNftSetupRequirementStatus;
  envVar?: string;
  description: string;
}

export interface MatterhornNftPreviewErrorDetails {
  custody: false;
  canSubmit: false;
  setupRequirements: MatterhornNftSetupRequirement[];
}

export interface MatterhornNftPreviewStep {
  label: string;
  description: string;
}

export interface MatterhornImageListResponse {
  success: true;
  images: MatterhornGeneratedImage[];
}

export interface MatterhornImageResponse {
  success: true;
  image: MatterhornGeneratedImage;
}

export interface MatterhornImageNftDraftListResponse {
  success: true;
  drafts: MatterhornImageNftDraft[];
}

export interface MatterhornImageNftDraftResponse {
  success: true;
  draft: MatterhornImageNftDraft;
}

export interface MatterhornNftMintPreviewResponse {
  success: true;
  custody: false;
  canSubmit: false;
  signerPolicy: "client_wallet_required";
  handoff: {
    kind: "sui_wallet_standard";
    network: "sui-testnet" | "sui-mainnet";
    transactionKind: "programmable";
    packageId: string;
    moduleName: string;
    functionName: "mint";
    storageUrl?: string | null;
    metadata: MatterhornNftDraftMetadata;
    steps: MatterhornNftPreviewStep[];
  };
  setupRequirements: MatterhornNftSetupRequirement[];
  draft: MatterhornImageNftDraft;
}

export interface MatterhornNftListingPreviewResponse {
  success: true;
  custody: false;
  canSubmit: false;
  signerPolicy: "client_wallet_required";
  handoff: {
    kind: "sui_wallet_standard";
    network: "sui-testnet" | "sui-mainnet";
    transactionKind: "kiosk_listing";
    marketplace: "sui_kiosk";
    kioskPackageId: string;
    transferPolicyPackageId: string;
    priceMist?: string;
    objectId?: string | null;
    steps: MatterhornNftPreviewStep[];
  };
  setupRequirements: MatterhornNftSetupRequirement[];
  draft: MatterhornImageNftDraft;
}

export interface MatterhornNftReceiptRequest {
  transactionDigest: string;
  objectId: string;
  network: "sui-testnet" | "sui-mainnet";
  packageId?: string;
  kioskId?: string;
  transferPolicyId?: string;
}

export interface MatterhornNftReceiptResponse {
  success: true;
  custody: false;
  containsSignatureMaterial: false;
  draft: MatterhornImageNftDraft;
}
