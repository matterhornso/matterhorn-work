/** @jsxImportSource react */
import { Image, Shapes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "../../../../app/utils";
import type {
  MatterhornGeneratedImage,
  MatterhornGeneratedMediaHistoryItem,
} from "@matterhorn-work/types/generated-media";

export interface GeneratedMediaHistoryProps {
  items: MatterhornGeneratedMediaHistoryItem[];
  selectedImageId?: string | null;
  onSelectImage: (image: MatterhornGeneratedImage) => void;
  onMakeNft: (image: MatterhornGeneratedImage) => void;
}

export function generatedMediaStatusLabel(item: MatterhornGeneratedMediaHistoryItem): string {
  if (item.status === "listed") return "Listed";
  if (item.status === "minted") return "Minted";
  if (item.status === "mint_preview_ready") return "Mint ready";
  if (item.status === "storage_ready") return "Stored";
  if (item.status === "draft") return "Draft";
  return "Image";
}

function generatedMediaDetail(item: MatterhornGeneratedMediaHistoryItem): string {
  const draft = item.latestDraft;
  if (!draft) return `${item.image.provider} · ${item.image.model}`;
  if (draft.listing.status === "listed") return `Sui listing · ${draft.network}`;
  if (draft.mint.status === "confirmed") return `Sui NFT · ${draft.network}`;
  if (draft.storage.status === "uploaded") return `Walrus stored · ${draft.network}`;
  return `NFT draft · ${draft.network}`;
}

export function GeneratedMediaHistory(props: GeneratedMediaHistoryProps) {
  const items = props.items.slice(0, 6);
  if (items.length === 0) return null;

  return (
    <div className="space-y-1" aria-label="Generated media history">
      <div className="flex items-center justify-between gap-2 px-1">
        <p className="text-[12px] font-medium text-dls-text">Recent images</p>
        <p className="text-[11px] text-dls-muted">{props.items.length} saved</p>
      </div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const selected = props.selectedImageId === item.image.id;
          return (
            <div
              key={item.id}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                selected ? "bg-dls-surface-muted/60" : "hover:bg-dls-hover/70",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                onClick={() => props.onSelectImage(item.image)}
              >
                <Image className="size-3.5 shrink-0 text-dls-secondary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-dls-text">{item.image.prompt}</span>
                  <span className="block truncate text-[11px] text-dls-muted">
                    {generatedMediaStatusLabel(item)} · {generatedMediaDetail(item)} · {formatRelativeTime(Date.parse(item.updatedAt))}
                  </span>
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1 px-2 text-[11px] opacity-80 group-hover:opacity-100"
                onClick={() => props.onMakeNft(item.image)}
              >
                <Shapes className="size-3" />
                NFT
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
