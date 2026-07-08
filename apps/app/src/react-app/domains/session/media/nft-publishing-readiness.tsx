/** @jsxImportSource react */
import type { ReactNode } from "react";
import { CloudUpload, Coins, Image, Store, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatterhornCapabilityStatus } from "@matterhorn-work/types/backend-capabilities";
import type {
  MatterhornImageGenerationCapability,
  MatterhornImageSetupRequirement,
  MatterhornNftMarketplaceListingCapability,
  MatterhornNftMintingCapability,
  MatterhornNftSetupRequirement,
  MatterhornWalrusStorageCapability,
} from "@matterhorn-work/types/generated-media";

export type NftPublishingReadinessStatus = MatterhornCapabilityStatus | "unavailable";

type CapabilityLike = {
  status?: NftPublishingReadinessStatus;
  label?: string;
  description?: string;
  value?: string | null;
  setupRequirements?: PublishingSetupRequirement[];
};

export type PublishingSetupRequirement =
  | MatterhornImageSetupRequirement
  | MatterhornNftSetupRequirement;

export interface NftPublishingReadinessCapabilities {
  imageGeneration?: CapabilityLike & Partial<MatterhornImageGenerationCapability>;
  walrusStorage?: CapabilityLike & Partial<MatterhornWalrusStorageCapability>;
  nftMinting?: CapabilityLike & Partial<MatterhornNftMintingCapability>;
  nftMarketplaceListing?: CapabilityLike & Partial<MatterhornNftMarketplaceListingCapability>;
}

export interface NftPublishingReadinessItem {
  id: "image-generation" | "walrus-storage" | "nft-minting" | "marketplace-listing";
  label: string;
  status: NftPublishingReadinessStatus;
  description: string;
  value: string;
  icon: ReactNode;
}

const setupStatusLabels: Record<PublishingSetupRequirement["status"], string> = {
  configured: "Configured",
  missing: "Missing",
  invalid: "Invalid",
  not_implemented: "Not implemented",
};

const statusLabels: Record<NftPublishingReadinessStatus, string> = {
  working: "Working",
  needs_setup: "Needs setup",
  preview: "Preview",
  unsupported: "Not supported here",
  error: "Unavailable",
  unavailable: "Unavailable",
};

const badgeClasses: Record<NftPublishingReadinessStatus, string> = {
  working: "bg-emerald-500/10 text-emerald-300",
  needs_setup: "bg-dls-hover/70 text-dls-secondary",
  preview: "bg-amber-500/10 text-amber-300",
  unsupported: "bg-dls-surface-muted text-dls-secondary",
  error: "bg-red-500/10 text-red-300",
  unavailable: "bg-dls-surface-muted text-dls-secondary",
};

export function buildNftPublishingReadinessItems(
  capabilities: NftPublishingReadinessCapabilities,
): NftPublishingReadinessItem[] {
  const imageGeneration = capabilities.imageGeneration;
  const walrusStorage = capabilities.walrusStorage;
  const minting = capabilities.nftMinting;
  const listing = capabilities.nftMarketplaceListing;

  return [
    {
      id: "image-generation",
      label: imageGeneration?.label ?? "Generated images",
      status: normalizeStatus(imageGeneration?.status),
      description: imageGeneration?.description ?? "Generate images in chat and save them as workspace outputs.",
      value: imageGeneration?.value ?? imageProviderValue(imageGeneration),
      icon: <Image className="size-3.5" />,
    },
    {
      id: "walrus-storage",
      label: walrusStorage?.label ?? "Walrus public storage",
      status: normalizeStatus(walrusStorage?.status),
      description: walrusStorage?.description ?? "Walrus publisher and relay are required before public NFT media upload.",
      value: walrusStorage?.value ?? walrusValue(walrusStorage),
      icon: <CloudUpload className="size-3.5" />,
    },
    {
      id: "nft-minting",
      label: minting?.label ?? "Sui NFT minting",
      status: normalizeStatus(minting?.status),
      description: minting?.description ?? "Matterhorn prepares the mint plan. Your Sui wallet signs it.",
      value: minting?.value ?? nftMintValue(minting),
      icon: <Coins className="size-3.5" />,
    },
    {
      id: "marketplace-listing",
      label: listing?.label ?? "Marketplace listing",
      status: normalizeStatus(listing?.status),
      description: listing?.description ?? "Sui Kiosk listing needs Kiosk and TransferPolicy config before wallet signing.",
      value: listing?.value ?? nftListingValue(listing),
      icon: <Store className="size-3.5" />,
    },
  ];
}

export function rollUpNftPublishingReadinessStatus(items: NftPublishingReadinessItem[]): NftPublishingReadinessStatus {
  if (items.some((item) => item.status === "error" || item.status === "unavailable")) return "error";
  if (items.some((item) => item.status === "needs_setup")) return "needs_setup";
  if (items.some((item) => item.status === "preview")) return "preview";
  if (items.some((item) => item.status === "unsupported")) return "unsupported";
  return "working";
}

export function buildNftPublishingSetupRequirements(
  capabilities: NftPublishingReadinessCapabilities,
): PublishingSetupRequirement[] {
  const requirements = [
    ...requirementsFromCapability(capabilities.imageGeneration, () => fallbackImageRequirements(capabilities.imageGeneration)),
    ...requirementsFromCapability(capabilities.walrusStorage, () => fallbackWalrusRequirements(capabilities.walrusStorage)),
    ...requirementsFromCapability(capabilities.nftMinting, () => fallbackMintRequirements(capabilities.nftMinting)),
    ...requirementsFromCapability(capabilities.nftMarketplaceListing, () => fallbackListingRequirements(capabilities.nftMarketplaceListing)),
  ].filter((requirement) => requirement.status !== "configured");

  const seen = new Set<string>();
  return requirements.filter((requirement) => {
    const key = `${requirement.envVar ?? ""}:${requirement.key}:${requirement.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function NftPublishingReadinessRows(props: {
  items: NftPublishingReadinessItem[];
  title?: string;
  description?: string;
  className?: string;
  surface?: boolean;
}) {
  return (
    <section
      className={cn(
        "grid gap-2",
        props.surface ? "rounded-lg bg-dls-surface-muted/18 px-3 py-3" : null,
        props.className,
      )}
    >
      {props.title || props.description ? (
        <div className="grid gap-1">
          {props.title ? <h3 className="text-sm font-medium text-dls-text">{props.title}</h3> : null}
          {props.description ? <p className="text-xs leading-5 text-dls-secondary">{props.description}</p> : null}
        </div>
      ) : null}
      <div className="grid gap-1">
        {props.items.map((item) => (
          <div key={item.id} className="grid gap-2 rounded-md px-1 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-dls-text">
                <span className="flex size-5 shrink-0 items-center justify-center text-dls-secondary">
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-dls-secondary">{item.description}</p>
              <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">{item.value}</p>
            </div>
            <span
              className={cn(
                "inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium",
                badgeClasses[item.status],
              )}
            >
              {item.status === "needs_setup" ? <Wrench className="size-3" /> : null}
              {statusLabels[item.status]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function NftPublishingSetupRows(props: {
  requirements: PublishingSetupRequirement[];
  title?: string;
  description?: string;
  className?: string;
}) {
  const unresolved = props.requirements.filter((requirement) => requirement.status !== "configured");
  if (!unresolved.length) return null;

  return (
    <details className={cn("group rounded-lg bg-dls-surface-muted/18 px-3 py-2.5", props.className)}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-medium text-dls-text">{props.title ?? "Required setup"}</span>
            {props.description ? <p className="mt-0.5 text-[11px] leading-4 text-dls-secondary">{props.description}</p> : null}
          </div>
          <span className="shrink-0 text-[11px] text-dls-secondary">
            {unresolved.length}
          </span>
        </div>
      </summary>
      <div className="mt-2 grid gap-1">
        {unresolved.map((requirement) => (
          <div key={`${requirement.key}:${requirement.envVar ?? requirement.label}`} className="grid gap-1 rounded-md px-2 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs font-medium text-dls-text">{requirement.label}</span>
              <span className="text-[11px] text-dls-secondary">{setupStatusLabels[requirement.status]}</span>
              {requirement.envVar ? (
                <code className="rounded-sm bg-dls-surface px-1.5 py-0.5 font-mono text-[10px] text-dls-secondary">
                  {requirement.envVar}
                </code>
              ) : null}
            </div>
            <p className="text-[11px] leading-4 text-dls-secondary">{requirement.description}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

function normalizeStatus(status: NftPublishingReadinessStatus | undefined): NftPublishingReadinessStatus {
  return status ?? "unavailable";
}

function imageProviderValue(capability: (CapabilityLike & Partial<MatterhornImageGenerationCapability>) | undefined): string {
  if (!capability) return "Provider status unavailable";
  const provider = capability.providers?.[0];
  const providerName = provider?.provider ?? capability.defaultProvider;
  const model = provider?.model ?? capability.defaultModel;
  if (providerName && model) return `${providerName}/${model}`;
  if (providerName) return providerName;
  return capability.status === "needs_setup" ? "Image provider needed" : "Provider configured";
}

function requirementsFromCapability(
  capability: CapabilityLike | undefined,
  fallback: () => PublishingSetupRequirement[],
): PublishingSetupRequirement[] {
  if (capability?.setupRequirements?.length) return capability.setupRequirements;
  return fallback();
}

function fallbackImageRequirements(
  capability: (CapabilityLike & Partial<MatterhornImageGenerationCapability>) | undefined,
): PublishingSetupRequirement[] {
  if (!capability || capability.status === "working" || capability.status === "preview") return [];
  const provider = capability.providers?.[0]?.provider ?? capability.defaultProvider;
  if (provider === "openai" || capability.status === "needs_setup") {
    return [{
      key: "openai_api_key",
      label: "OpenAI API key",
      status: capability.status === "error" ? "invalid" : "missing",
      envVar: "OPENAI_API_KEY",
      description: capability.description ?? "OpenAI image generation requires an OPENAI_API_KEY.",
    }];
  }
  return [{
    key: "image_provider",
    label: "Image provider",
    status: "invalid",
    envVar: "MATTERHORN_IMAGE_PROVIDER",
    description: capability.description ?? "Image generation setup is invalid.",
  }];
}

function fallbackWalrusRequirements(
  capability: (CapabilityLike & Partial<MatterhornWalrusStorageCapability>) | undefined,
): PublishingSetupRequirement[] {
  if (!capability || capability.status === "working" || capability.status === "preview") return [];
  const validation = validationRequirements(capability.details, {
    MATTERHORN_WALRUS_PUBLISHER_URL: ["walrus_publisher", "Walrus publisher"],
    MATTERHORN_WALRUS_RELAY_URL: ["walrus_relay", "Walrus relay"],
    MATTERHORN_WALRUS_STORAGE_EPOCHS: ["walrus_storage_epochs", "Walrus storage epochs"],
  });
  return [
    ...validation,
    ...(!capability.publisherConfigured ? [{
      key: "walrus_publisher" as const,
      label: "Walrus publisher",
      status: "missing" as const,
      envVar: "MATTERHORN_WALRUS_PUBLISHER_URL",
      description: "Public NFT media upload needs a Walrus publisher endpoint.",
    }] : []),
    ...(!capability.relayConfigured ? [{
      key: "walrus_relay" as const,
      label: "Walrus relay",
      status: "missing" as const,
      envVar: "MATTERHORN_WALRUS_RELAY_URL",
      description: "NFT media needs a public aggregator or relay URL after upload.",
    }] : []),
  ];
}

function fallbackMintRequirements(
  capability: (CapabilityLike & Partial<MatterhornNftMintingCapability>) | undefined,
): PublishingSetupRequirement[] {
  if (!capability || capability.status === "working" || capability.status === "preview") return [];
  return [
    ...validationRequirements(capability.details, {
      MATTERHORN_SUI_NETWORK: ["sui_network", "Sui network"],
    }),
    ...(!capability.packageConfigured ? [{
      key: "sui_nft_package" as const,
      label: "Sui NFT package",
      status: "missing" as const,
      envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
      description: "Mint previews need the Move package id that defines the NFT mint entrypoint.",
    }] : []),
  ];
}

function fallbackListingRequirements(
  capability: (CapabilityLike & Partial<MatterhornNftMarketplaceListingCapability>) | undefined,
): PublishingSetupRequirement[] {
  if (!capability || capability.status === "working" || capability.status === "preview") return [];
  return [
    ...validationRequirements(capability.details, {
      MATTERHORN_SUI_NETWORK: ["sui_network", "Sui network"],
    }),
    ...(!capability.kioskConfigured ? [
      {
        key: "sui_kiosk_package" as const,
        label: "Sui Kiosk package",
        status: "missing" as const,
        envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
        description: "Marketplace listing previews need the Kiosk package/config id.",
      },
      {
        key: "sui_transfer_policy" as const,
        label: "Sui TransferPolicy",
        status: "missing" as const,
        envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
        description: "Listings need the TransferPolicy config that controls marketplace transfer rules.",
      },
    ] : []),
  ];
}

function validationRequirements(
  details: Record<string, unknown> | undefined,
  fields: Record<string, [MatterhornNftSetupRequirement["key"], string]>,
): PublishingSetupRequirement[] {
  const issues = Array.isArray(details?.validationIssues) ? details.validationIssues : [];
  return issues.flatMap((issue) => {
    if (!issue || typeof issue !== "object") return [];
    const field = "field" in issue && typeof issue.field === "string" ? issue.field : "";
    const message = "message" in issue && typeof issue.message === "string" ? issue.message : `${field} is invalid.`;
    const mapping = fields[field];
    if (!mapping) return [];
    const [key, label] = mapping;
    return [{
      key,
      label,
      status: "invalid" as const,
      envVar: field,
      description: message,
    }];
  });
}

function walrusValue(capability: (CapabilityLike & Partial<MatterhornWalrusStorageCapability>) | undefined): string {
  if (!capability) return "Storage status unavailable";
  if (capability.publisherConfigured && capability.relayConfigured) return "Publisher and relay configured";
  if (capability.publisherConfigured) return "Relay needed";
  if (capability.relayConfigured) return "Publisher needed";
  return "Publisher/relay needed";
}

function nftMintValue(capability: (CapabilityLike & Partial<MatterhornNftMintingCapability>) | undefined): string {
  if (!capability) return "Minting status unavailable";
  const network = networkLabel(capability.network);
  return `${network} · ${capability.packageConfigured ? "Package configured" : "Package needed"}`;
}

function nftListingValue(capability: (CapabilityLike & Partial<MatterhornNftMarketplaceListingCapability>) | undefined): string {
  if (!capability) return "Listing status unavailable";
  const network = networkLabel(capability.network);
  if (capability.kioskConfigured) return `${network} · Kiosk ready`;
  return `${network} · Kiosk/TransferPolicy needed`;
}

function networkLabel(network: MatterhornNftMintingCapability["network"] | undefined): string {
  if (network === "sui-mainnet") return "Sui mainnet";
  if (network === "sui-testnet") return "Sui testnet";
  return "Sui network";
}
