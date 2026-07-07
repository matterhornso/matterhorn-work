/** @jsxImportSource react */
import type { ReactNode } from "react";
import { CloudUpload, Coins, Image, Store, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatterhornCapabilityStatus } from "@matterhorn-work/types/backend-capabilities";
import type {
  MatterhornImageGenerationCapability,
  MatterhornNftMarketplaceListingCapability,
  MatterhornNftMintingCapability,
  MatterhornWalrusStorageCapability,
} from "@matterhorn-work/types/generated-media";

export type NftPublishingReadinessStatus = MatterhornCapabilityStatus | "unavailable";

type CapabilityLike = {
  status?: NftPublishingReadinessStatus;
  label?: string;
  description?: string;
  value?: string | null;
};

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
  needs_setup: "bg-sky-500/10 text-sky-300",
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
        props.surface ? "rounded-md bg-dls-surface-muted/35 px-3 py-3" : null,
        props.className,
      )}
    >
      {props.title || props.description ? (
        <div className="grid gap-1">
          {props.title ? <h3 className="text-sm font-medium text-dls-text">{props.title}</h3> : null}
          {props.description ? <p className="text-xs leading-5 text-dls-secondary">{props.description}</p> : null}
        </div>
      ) : null}
      <div className="divide-y divide-dls-border/40">
        {props.items.map((item) => (
          <div key={item.id} className="grid gap-2 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-dls-text">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-dls-surface-muted text-dls-secondary">
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
