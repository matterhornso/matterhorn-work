/** @jsxImportSource react */
import { useState } from "react";
import { AlertCircle, CheckCircle2, Image, Loader2, Lock, Upload, Wallet } from "lucide-react";
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
} from "@matterhorn-work/types/generated-media";

export interface NftDraftPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  image: MatterhornGeneratedImage;
  imageUrl?: string;
  capabilities: {
    walrusStorage: "working" | "needs_setup" | "preview";
    nftMinting: "working" | "needs_setup" | "preview";
    nftMarketplaceListing: "working" | "needs_setup" | "preview";
  };
  draft?: MatterhornImageNftDraft | null;
  isLoading?: boolean;
  onCreateDraft: (input: MatterhornImageNftDraftInput) => void;
  onPrepareStorage: () => void;
  onUploadStorage: () => void;
  onPreviewMint: () => void;
  onRecordMintReceipt: () => void;
  onPreviewListing: () => void;
  onRecordListingReceipt: () => void;
}

export function NftDraftPanel(props: NftDraftPanelProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const canUpload = props.capabilities.walrusStorage === "working" || props.capabilities.walrusStorage === "preview";
  const canMint = props.capabilities.nftMinting === "working" || props.capabilities.nftMinting === "preview";
  const canList = props.capabilities.nftMarketplaceListing === "working" || props.capabilities.nftMarketplaceListing === "preview";

  const handleCreateDraft = () => {
    props.onCreateDraft({
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Image size={18} />
            Make NFT
          </SheetTitle>
          <SheetDescription className="text-xs">
            Create a Sui NFT draft from this generated image. Public storage, minting, and listing require explicit action.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 py-2">
          <div className="flex flex-col gap-2">
            <div className="relative flex aspect-square size-32 shrink-0 items-center justify-center overflow-hidden rounded-md bg-dls-surface-muted">
              {props.imageUrl ? (
                <img src={props.imageUrl} alt={props.image.prompt} className="h-full w-full object-contain" />
              ) : (
                <Image size={20} className="text-muted-foreground" />
              )}
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{props.image.prompt}</p>
          </div>

          {!props.draft ? (
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="nft-title" className="text-xs">Title</Label>
                <Input id="nft-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Untitled NFT" className="h-8 text-sm" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="nft-description" className="text-xs">Description</Label>
                <Textarea
                  id="nft-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the NFT..."
                  className="min-h-[80px] text-sm"
                />
              </div>
              <Button size="sm" className="gap-1 text-xs" onClick={handleCreateDraft} disabled={props.isLoading}>
                {props.isLoading ? <Loader2 size={12} className="animate-spin" /> : <Lock size={12} />}
                Create local draft
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <NftStep
                status={props.draft.storage.status}
                label="Storage"
                description={canUpload ? "Prepare and upload to Walrus." : "Walrus publisher/relay not configured."}
                actions={[
                  { label: "Prepare upload", onClick: props.onPrepareStorage, disabled: !canUpload || props.isLoading },
                  { label: "Upload", onClick: props.onUploadStorage, disabled: !canUpload || props.draft.storage.status !== "ready_to_upload" || props.isLoading },
                ]}
              />
              <NftStep
                status={props.draft.mint.status}
                label="Mint"
                description={canMint ? "Prepare a Sui mint transaction and sign in your wallet." : "Sui NFT package not configured."}
                actions={[
                  { label: "Preview mint", onClick: props.onPreviewMint, disabled: !canMint || props.draft.storage.status !== "uploaded" || props.isLoading },
                  { label: "Record receipt", onClick: props.onRecordMintReceipt, disabled: !canMint || props.draft.mint.status !== "signed" || props.isLoading },
                ]}
              />
              <NftStep
                status={props.draft.listing.status}
                label="Marketplace listing"
                description={canList ? "Prepare a Kiosk listing and sign in your wallet." : "Kiosk/TransferPolicy config not configured."}
                actions={[
                  { label: "Preview listing", onClick: props.onPreviewListing, disabled: !canList || props.draft.mint.status !== "confirmed" || props.isLoading },
                  { label: "Record receipt", onClick: props.onRecordListingReceipt, disabled: !canList || props.draft.listing.status !== "preview_ready" || props.isLoading },
                ]}
              />
            </div>
          )}

          <p className="text-xs leading-5 text-muted-foreground">
            Public storage and minting are explicit. Matterhorn never asks for your keys.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NftStep(props: {
  status: string;
  label: string;
  description: string;
  actions: { label: string; onClick: () => void; disabled?: boolean }[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-dls-surface-muted/45 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-dls-text">
        {props.status === "confirmed" || props.status === "listed" || props.status === "uploaded" ? (
          <CheckCircle2 size={14} className="text-emerald-300" />
        ) : (
          <AlertCircle size={14} className="text-amber-300" />
        )}
        {props.label}
      </div>
      <p className="text-xs text-muted-foreground">{props.description}</p>
      <div className="flex flex-wrap gap-2">
        {props.actions.map((action, index) => (
          <Button key={index} variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={action.onClick} disabled={action.disabled}>
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
