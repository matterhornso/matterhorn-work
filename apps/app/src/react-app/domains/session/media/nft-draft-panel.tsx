/** @jsxImportSource react */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  Image,
  Loader2,
  Lock,
  Send,
  Unplug,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  MatterhornGeneratedImage,
  MatterhornImageNftDraft,
  MatterhornImageNftDraftInput,
  MatterhornNftListingPreviewInput,
  MatterhornNftListingPreviewResponse,
  MatterhornNftMintPreviewResponse,
  MatterhornNftReceiptRequest,
  MatterhornNftSetupRequirement,
  MatterhornNftMarketplaceListingCapability,
  MatterhornNftMintingCapability,
  MatterhornWalrusStorageCapability,
} from "@matterhorn-work/types/generated-media";
import {
  buildNftPublishingReadinessItems,
  NftPublishingReadinessRows,
  NftPublishingSetupRows,
  type PublishingSetupRequirement,
} from "./nft-publishing-readiness";
import type { MatterhornSuiWalletExecutionReceipt } from "./sui-nft-transaction-plan";

export type NftCapabilityStatus = "working" | "needs_setup" | "preview";
type NftCapabilityInput<T extends object> = NftCapabilityStatus | (Partial<T> & {
  status?: NftCapabilityStatus;
  label?: string;
  description?: string;
  value?: string | null;
  setupRequirements?: PublishingSetupRequirement[];
});
type NormalizedNftCapabilityInput<T extends object> = Omit<Partial<T>, "status"> & {
  status: NftCapabilityStatus;
  label?: string;
  description?: string;
  value?: string | null;
  setupRequirements?: PublishingSetupRequirement[];
};

export interface NftDraftPublishingCapabilities {
  walrusStorage: NftCapabilityInput<MatterhornWalrusStorageCapability>;
  nftMinting: NftCapabilityInput<MatterhornNftMintingCapability>;
  nftMarketplaceListing: NftCapabilityInput<MatterhornNftMarketplaceListingCapability>;
}

export interface NftWalletOption {
  id: string;
  name: string;
  icon?: string | null;
}

export interface NftWalletExecutionState {
  directWalletAvailable: boolean;
  connectedAddress?: string | null;
  walletName?: string | null;
  walletOptions?: NftWalletOption[];
  isConnecting?: boolean;
  isSigning?: boolean;
  error?: string | null;
  lastMintReceipt?: MatterhornSuiWalletExecutionReceipt | null;
  lastListingReceipt?: MatterhornSuiWalletExecutionReceipt | null;
  onConnectWallet?: (walletId: string) => void | Promise<void>;
  onDisconnectWallet?: () => void | Promise<void>;
  onSignMint?: () => void | Promise<void>;
  onSignListing?: () => void | Promise<void>;
}

export interface NftDraftPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: MatterhornGeneratedImage;
  imageUrl?: string;
  capabilities: NftDraftPublishingCapabilities;
  draft?: MatterhornImageNftDraft | null;
  mintPreview?: MatterhornNftMintPreviewResponse | null;
  listingPreview?: MatterhornNftListingPreviewResponse | null;
  walletExecution?: NftWalletExecutionState;
  readinessSetupRequirements?: PublishingSetupRequirement[];
  setupRequirements?: MatterhornNftSetupRequirement[];
  isLoading?: boolean;
  onCreateDraft: (input: MatterhornImageNftDraftInput) => void | Promise<void>;
  onPrepareStorage: () => void | Promise<void>;
  onUploadStorage: () => void | Promise<void>;
  onPreviewMint: () => void | Promise<void>;
  onRecordMintReceipt: (receipt: MatterhornNftReceiptRequest) => void | Promise<void>;
  onPreviewListing: (input: MatterhornNftListingPreviewInput) => void | Promise<void>;
  onRecordListingReceipt: (receipt: MatterhornNftReceiptRequest) => void | Promise<void>;
}

export function NftDraftPanel(props: NftDraftPanelProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [copyLabel, setCopyLabel] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [mintDigest, setMintDigest] = useState("");
  const [mintObjectId, setMintObjectId] = useState("");
  const [listingDigest, setListingDigest] = useState("");
  const [listingObjectId, setListingObjectId] = useState("");
  const [nftType, setNftType] = useState("");
  const [kioskId, setKioskId] = useState("");
  const [kioskOwnerCapId, setKioskOwnerCapId] = useState("");
  const [transferPolicyId, setTransferPolicyId] = useState("");
  const [priceMist, setPriceMist] = useState("");

  const walrusStorage = normalizeNftCapabilityInput(props.capabilities.walrusStorage);
  const nftMinting = normalizeNftCapabilityInput(props.capabilities.nftMinting);
  const nftMarketplaceListing = normalizeNftCapabilityInput(props.capabilities.nftMarketplaceListing);
  const canUpload = walrusStorage.status === "working" || walrusStorage.status === "preview";
  const canMint = nftMinting.status === "working" || nftMinting.status === "preview";
  const canList = nftMarketplaceListing.status === "working" || nftMarketplaceListing.status === "preview";
  const walletExecution = props.walletExecution;
  const draft = props.draft ?? null;
  const previewSummaries = buildNftDraftPreviewSummaries({
    draft,
    mintPreview: props.mintPreview,
    listingPreview: props.listingPreview,
  });
  const publishingReadiness = useMemo(() => buildNftPublishingReadinessItems({
    imageGeneration: {
      status: "working",
      label: "Generated image",
      description: "This generated image is ready to use as NFT media.",
      value: `${props.image.provider}/${props.image.model}`,
    },
    walrusStorage: { ...walrusStorage, label: walrusStorage.label ?? "Public storage" },
    nftMinting: { ...nftMinting, label: nftMinting.label ?? "Sui minting" },
    nftMarketplaceListing: { ...nftMarketplaceListing, label: nftMarketplaceListing.label ?? "Marketplace listing" },
  }), [
    nftMarketplaceListing,
    nftMinting,
    walrusStorage,
    props.image.model,
    props.image.provider,
  ]);

  useEffect(() => {
    if (!draft) return;
    setMintDigest(draft.mint.transactionDigest ?? "");
    setMintObjectId(draft.mint.objectId ?? "");
    setListingObjectId(draft.mint.objectId ?? "");
    setNftType(draft.listing.itemType ?? "");
    setKioskId(draft.listing.kioskId ?? "");
    setKioskOwnerCapId(draft.listing.kioskOwnerCapId ?? "");
    setTransferPolicyId(draft.listing.transferPolicyId ?? "");
    setPriceMist(draft.listing.priceMist ?? "");
  }, [draft?.id]);

  useEffect(() => {
    const receipt = walletExecution?.lastMintReceipt;
    if (!receipt) return;
    setMintDigest(receipt.digest);
    if (receipt.objectId) {
      setMintObjectId(receipt.objectId);
      setListingObjectId(receipt.objectId);
    }
  }, [walletExecution?.lastMintReceipt]);

  useEffect(() => {
    const receipt = walletExecution?.lastListingReceipt;
    if (!receipt) return;
    setListingDigest(receipt.digest);
  }, [walletExecution?.lastListingReceipt]);

  const unresolvedSetup = useMemo(() => (
    props.setupRequirements?.filter((requirement) => requirement.status !== "configured") ?? []
  ), [props.setupRequirements]);

  const handleCreateDraft = () => {
    setFormError(null);
    void props.onCreateDraft({
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  const handleRecordMintReceipt = () => {
    if (!draft) return;
    const transactionDigest = mintDigest.trim();
    const objectId = mintObjectId.trim();
    if (!transactionDigest || !objectId) {
      setFormError("Mint receipt needs both a transaction digest and object id.");
      return;
    }
    setFormError(null);
    void props.onRecordMintReceipt({
      transactionDigest,
      objectId,
      network: draft.network,
      packageId: props.mintPreview?.handoff.packageId ?? draft.mint.packageId ?? undefined,
    });
  };

  const handlePreviewListing = () => {
    setFormError(null);
    void props.onPreviewListing(cleanListingInput({
      objectId: listingObjectId || mintObjectId || draft?.mint.objectId || undefined,
      nftType,
      kioskId,
      kioskOwnerCapId,
      transferPolicyId,
      priceMist,
      sender: walletExecution?.connectedAddress ?? draft?.creatorAddress ?? undefined,
    }));
  };

  const handleRecordListingReceipt = () => {
    if (!draft) return;
    const transactionDigest = listingDigest.trim();
    const objectId = (listingObjectId || mintObjectId || draft.mint.objectId || "").trim();
    if (!transactionDigest || !objectId) {
      setFormError("Listing receipt needs a transaction digest and NFT object id.");
      return;
    }
    setFormError(null);
    void props.onRecordListingReceipt({
      transactionDigest,
      objectId,
      network: draft.network,
      kioskId: kioskId.trim() || draft.listing.kioskId || undefined,
      transferPolicyId: transferPolicyId.trim() || draft.listing.transferPolicyId || undefined,
    });
  };

  const copyPlan = async (label: string, value: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopyLabel(label);
      window.setTimeout(() => setCopyLabel((current) => current === label ? null : current), 1400);
    } catch {
      setCopyLabel("Copy failed");
      window.setTimeout(() => setCopyLabel((current) => current === "Copy failed" ? null : current), 1600);
    }
  };

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[33rem]">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Image size={18} />
            Publish as NFT
          </SheetTitle>
          <SheetDescription className="text-xs">
            Create a local draft, then choose when to upload, mint, or list.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3">
            <div className="relative flex aspect-square size-32 shrink-0 items-center justify-center overflow-hidden rounded-md bg-dls-surface-muted/45">
              {props.imageUrl ? (
                <img src={props.imageUrl} alt={props.image.prompt} className="h-full w-full object-contain" />
              ) : (
                <Image size={20} className="text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 text-xs leading-5 text-muted-foreground">
              <p className="line-clamp-3 text-dls-text">{props.image.prompt}</p>
              <p className="mt-2">{props.image.provider} · {props.image.model}</p>
              <p>{props.image.size} · {props.image.format}</p>
            </div>
          </div>

          <NftPublishingReadinessRows
            items={publishingReadiness}
            title="Publishing path"
            description="Drafts are local first. Public storage, minting, and listing require your next action."
            surface
          />
          <NftPublishingSetupRows
            requirements={props.readinessSetupRequirements ?? []}
            description="Backend setup needed before public publishing actions are available."
          />

          {!draft ? (
            <div className="grid gap-3 border-t border-dls-border/45 pt-4">
              <div className="grid gap-1.5">
                <Label htmlFor="nft-title" className="text-xs">Title</Label>
                <Input id="nft-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Untitled NFT" className="h-8 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nft-description" className="text-xs">Description</Label>
                <Textarea
                  id="nft-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe the NFT..."
                  className="min-h-[80px] text-sm"
                />
              </div>
              <Button size="sm" className="w-fit gap-1 text-xs" onClick={handleCreateDraft} disabled={props.isLoading}>
                {props.isLoading ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                Create draft
              </Button>
            </div>
          ) : (
            <div className="grid gap-5">
              {unresolvedSetup.length ? <NftSetupRequirements requirements={unresolvedSetup} /> : null}
              {formError ? (
                <div className="rounded-md bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">{formError}</div>
              ) : null}

              <NftSection
                title="Storage"
                status={draft.storage.status}
                description={canUpload ? "Prepare the media, then upload it to Walrus." : "Walrus publisher and relay are not configured."}
              >
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void props.onPrepareStorage()} disabled={!canUpload || props.isLoading}>
                    Prepare
                  </Button>
                  <Button size="sm" onClick={() => void props.onUploadStorage()} disabled={!canUpload || draft.storage.status !== "ready_to_upload" || props.isLoading}>
                    Upload to Walrus
                  </Button>
                </div>
                {draft.storage.url ? (
                  <p className="break-all text-xs text-dls-secondary">{draft.storage.url}</p>
                ) : null}
              </NftSection>

              <NftSection
                title="Mint"
                status={draft.mint.status}
                description={canMint ? "Prepare the mint plan, then sign it in your Sui wallet." : "Sui NFT package is not configured."}
              >
                <WalletSummary walletExecution={walletExecution} />
                {previewSummaries.mint ? (
                  <PlanSummary
                    title={previewSummaries.mint.title}
                    lines={previewSummaries.mint.lines}
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => void props.onPreviewMint()} disabled={!canMint || draft.storage.status !== "uploaded" || props.isLoading}>
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void walletExecution?.onSignMint?.()}
                    disabled={!props.mintPreview || !walletExecution?.connectedAddress || walletExecution?.isSigning || props.isLoading}
                  >
                    {walletExecution?.isSigning ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                    Sign in wallet
                  </Button>
                  {props.mintPreview ? (
                    <Button size="sm" variant="ghost" onClick={() => void copyPlan("mint", props.mintPreview?.transactionPlan)}>
                      <Copy className="size-3" />
                      {copyLabel === "mint" ? "Copied" : "Copy plan"}
                    </Button>
                  ) : null}
                </div>
                <ReceiptFields
                  digest={mintDigest}
                  objectId={mintObjectId}
                  onDigestChange={setMintDigest}
                  onObjectIdChange={setMintObjectId}
                  onRecord={handleRecordMintReceipt}
                  disabled={props.isLoading || !previewSummaries.mintPreviewReady}
                />
              </NftSection>

              <NftSection
                title="Marketplace"
                status={draft.listing.status}
                description={canList ? "Prepare a Sui Kiosk listing plan, then sign it in your wallet." : "Kiosk and TransferPolicy config are not configured."}
              >
                <details className="group rounded-md bg-dls-surface-muted/18 px-3 py-2 text-xs">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-dls-text">
                    Listing inputs
                    <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="NFT object id" value={listingObjectId} onChange={setListingObjectId} placeholder="0x..." />
                      <Field label="Price (MIST)" value={priceMist} onChange={setPriceMist} placeholder="1000000000" />
                    </div>
                    <Field label="NFT type" value={nftType} onChange={setNftType} placeholder="0x...::module::MatterhornNFT" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Kiosk id" value={kioskId} onChange={setKioskId} placeholder="0x..." />
                      <Field label="Owner cap id" value={kioskOwnerCapId} onChange={setKioskOwnerCapId} placeholder="0x..." />
                    </div>
                    <Field label="TransferPolicy id" value={transferPolicyId} onChange={setTransferPolicyId} placeholder="0x..." />
                  </div>
                </details>
                {previewSummaries.listing ? (
                  <PlanSummary
                    title={previewSummaries.listing.title}
                    lines={previewSummaries.listing.lines}
                  />
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handlePreviewListing} disabled={!canList || props.isLoading}>
                    Preview
                  </Button>
                  {props.listingPreview ? (
                    <Button size="sm" variant="ghost" onClick={() => void copyPlan("listing", props.listingPreview?.transactionPlan)}>
                      <Copy className="size-3" />
                      {copyLabel === "listing" ? "Copied" : "Copy plan"}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => void walletExecution?.onSignListing?.()}
                    disabled={!props.listingPreview || !walletExecution?.connectedAddress || walletExecution?.isSigning || props.isLoading}
                  >
                    {walletExecution?.isSigning ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                    Sign in wallet
                  </Button>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nft-listing-digest" className="text-xs">Listing transaction digest</Label>
                  <Input
                    id="nft-listing-digest"
                    value={listingDigest}
                    onChange={(event) => setListingDigest(event.target.value)}
                    placeholder="Public Sui transaction digest"
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-fit"
                    onClick={handleRecordListingReceipt}
                    disabled={props.isLoading || !previewSummaries.listingPreviewReady}
                  >
                    Save listing receipt
                  </Button>
                </div>
              </NftSection>
            </div>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            Matterhorn never asks for keys, signatures, or wallet exports. Wallet actions happen only after you choose them.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type NftPreviewSummary = { title: string; lines: string[] };

export function buildNftDraftPreviewSummaries(input: {
  draft?: MatterhornImageNftDraft | null;
  mintPreview?: MatterhornNftMintPreviewResponse | null;
  listingPreview?: MatterhornNftListingPreviewResponse | null;
}): {
  mint: NftPreviewSummary | null;
  listing: NftPreviewSummary | null;
  mintPreviewReady: boolean;
  listingPreviewReady: boolean;
} {
  const { draft, mintPreview, listingPreview } = input;
  const mint = mintPreview ? {
    title: "Mint plan ready",
    lines: [
      `Network ${mintPreview.transactionPlan.network}`,
      `Target ${mintPreview.transactionPlan.moveCalls[0]?.target ?? "unknown"}`,
      "Wallet signing only",
    ],
  } : draft?.mint.status === "preview_ready" ? {
    title: "Mint preview ready",
    lines: [
      `Network ${draft.network}`,
      `Package ${draft.mint.packageId ?? "configured"}`,
      "Wallet signing only",
    ],
  } : null;

  const listing = listingPreview ? {
    title: "Listing plan ready",
    lines: [
      `Network ${listingPreview.transactionPlan.network}`,
      `Marketplace ${listingPreview.transactionPlan.marketplace}`,
      `Price ${listingPreview.transactionPlan.priceMist} MIST`,
    ],
  } : draft?.listing.status === "preview_ready" ? {
    title: "Listing preview ready",
    lines: [
      `Network ${draft.network}`,
      "Marketplace Sui Kiosk",
      `Price ${draft.listing.priceMist ? `${draft.listing.priceMist} MIST` : "not set"}`,
    ],
  } : null;

  return {
    mint,
    listing,
    mintPreviewReady: Boolean(mintPreview) || draft?.mint.status === "preview_ready",
    listingPreviewReady: Boolean(listingPreview) || draft?.listing.status === "preview_ready",
  };
}

function normalizeNftCapabilityInput<T extends object>(
  capability: NftCapabilityInput<T>,
): NormalizedNftCapabilityInput<T> {
  if (typeof capability === "string") return { status: capability } as NormalizedNftCapabilityInput<T>;
  return { ...capability, status: capability.status ?? "needs_setup" } as NormalizedNftCapabilityInput<T>;
}

export function NftSetupRequirements(props: { requirements: MatterhornNftSetupRequirement[] }) {
  const unresolved = props.requirements.filter((requirement) => requirement.status !== "configured");
  if (!unresolved.length) return null;

  return (
    <div className="rounded-lg bg-dls-surface-muted/20 px-3 py-2.5">
      <div className="mb-2 text-xs font-medium text-dls-text">Setup needed</div>
      <div className="space-y-2">
        {unresolved.map((requirement) => (
          <div key={requirement.key} className="text-xs leading-5 text-muted-foreground">
            <span className="text-dls-text">{requirement.label}</span>
            {requirement.envVar ? <span className="ml-1 font-mono text-[11px]">{requirement.envVar}</span> : null}
            <div>{requirement.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NftSection(props: {
  title: string;
  status: string;
  description: string;
  children: ReactNode;
}) {
  const completed = ["uploaded", "confirmed", "listed"].includes(props.status);
  const ready = ["ready_to_upload", "preview_ready"].includes(props.status);
  return (
    <section className="grid gap-3 border-t border-dls-border/25 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-dls-text">
            {completed || ready ? (
              <CheckCircle2 size={14} className={completed ? "text-emerald-300" : "text-dls-secondary"} />
            ) : (
              <Circle size={8} className="text-dls-secondary" />
            )}
            {props.title}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{props.description}</p>
        </div>
        <span className="shrink-0 text-[11px] text-dls-secondary">{statusLabel(props.status)}</span>
      </div>
      {props.children}
    </section>
  );
}

function WalletSummary(props: { walletExecution?: NftWalletExecutionState }) {
  const wallet = props.walletExecution;
  if (!wallet?.directWalletAvailable) {
    return (
      <p className="text-xs leading-5 text-dls-secondary">
        Mint signing uses an external Sui wallet. Copy the plan and record the public receipt after signing.
      </p>
    );
  }
  if (wallet.connectedAddress) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-dls-secondary">
        <span>{wallet.walletName ?? "Sui wallet"} · {truncateMiddle(wallet.connectedAddress)}</span>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void wallet.onDisconnectWallet?.()}>
          <Unplug className="size-3" />
          Disconnect
        </Button>
        {wallet.error ? <p className="basis-full text-red-300">{wallet.error}</p> : null}
      </div>
    );
  }

  const wallets = wallet.walletOptions ?? [];
  if (!wallets.length) {
    return <p className="text-xs leading-5 text-dls-secondary">Install or unlock a Sui wallet to sign the mint transaction in the browser.</p>;
  }

  return (
    <div className="grid gap-2">
      {wallets.map((option) => (
        <Button
          key={option.id}
          variant="outline"
          size="sm"
          className="h-8 justify-start gap-2 text-xs"
          disabled={wallet.isConnecting}
          onClick={() => void wallet.onConnectWallet?.(option.id)}
        >
          {option.icon ? (
            <img src={option.icon} alt="" className="size-4 rounded-sm" />
          ) : (
            <Wallet className="size-3.5" />
          )}
          {option.name}
        </Button>
      ))}
      {wallet.error ? <p className="text-xs text-red-300">{wallet.error}</p> : null}
    </div>
  );
}

function PlanSummary(props: { title: string; lines: string[] }) {
  return (
    <details className="group rounded-md bg-dls-surface-muted/35 px-3 py-2 text-xs text-dls-secondary">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-dls-text">
        {props.title}
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 grid gap-1">
        {props.lines.map((line) => (
          <p key={line} className="break-all">{line}</p>
        ))}
      </div>
    </details>
  );
}

function ReceiptFields(props: {
  digest: string;
  objectId: string;
  onDigestChange: (value: string) => void;
  onObjectIdChange: (value: string) => void;
  onRecord: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Mint digest" value={props.digest} onChange={props.onDigestChange} placeholder="Public transaction digest" />
        <Field label="Minted object id" value={props.objectId} onChange={props.onObjectIdChange} placeholder="0x..." />
      </div>
      <Button size="sm" variant="outline" className="w-fit" onClick={props.onRecord} disabled={props.disabled}>
        Save mint receipt
      </Button>
    </div>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = `nft-field-${props.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">{props.label}</Label>
      <Input
        id={id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}

function cleanListingInput(input: Record<keyof MatterhornNftListingPreviewInput, string | undefined>): MatterhornNftListingPreviewInput {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value?.trim() || undefined]),
  ) as MatterhornNftListingPreviewInput;
}

function statusLabel(status: string) {
  return status
    .replace(/_/g, " ")
    .replace(/^\w/, (match) => match.toUpperCase());
}

function truncateMiddle(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}
