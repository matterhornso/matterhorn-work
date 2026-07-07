/** @jsxImportSource react */
import { useCallback, useState } from "react";
import { AlertCircle, Image, Loader2, Palette, RefreshCw, Save, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatterhornGeneratedImage } from "@matterhorn-work/types/generated-media";

export interface GeneratedImageCardProps {
  image: MatterhornGeneratedImage;
  imageUrl?: string;
  isGenerating?: boolean;
  onEditPrompt?: () => void;
  onGenerateVariant?: () => void;
  onSaveToOutputs?: () => void;
  onMakeNft?: () => void;
}

export function GeneratedImageCard(props: GeneratedImageCardProps) {
  const [imageError, setImageError] = useState(false);
  const { image, imageUrl } = props;

  const handleVariant = useCallback(() => {
    props.onGenerateVariant?.();
  }, [props.onGenerateVariant]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dls-border/45 bg-dls-surface p-3">
      <div className="flex items-center gap-2 text-xs text-dls-secondary">
        <Image size={14} />
        <span className="font-medium text-dls-text">Generated image</span>
        <span className="ml-auto">{image.provider}</span>
        <span>·</span>
        <span>{image.model}</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex aspect-square size-40 shrink-0 items-center justify-center overflow-hidden rounded-md bg-dls-surface-muted">
          {imageError || !imageUrl ? (
            <div className="flex flex-col items-center gap-1 p-2 text-center text-xs text-muted-foreground">
              <Image size={20} />
              <span>Image preview</span>
            </div>
          ) : (
            <img
              src={imageUrl}
              alt={image.prompt}
              className="h-full w-full object-contain"
              onError={() => setImageError(true)}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-3 text-sm leading-5 text-dls-text">{image.prompt}</p>
          {image.promptRevised ? (
            <p className="mt-1 text-xs text-muted-foreground">Revised: {image.promptRevised}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1 text-xs text-dls-secondary">
            <span className="rounded bg-dls-surface-muted px-1.5 py-0.5">{image.size}</span>
            <span className="rounded bg-dls-surface-muted px-1.5 py-0.5">{image.quality}</span>
            <span className="rounded bg-dls-surface-muted px-1.5 py-0.5">{image.format}</span>
          </div>
          {image.safety.secretsRejected ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
              <AlertCircle size={12} />
              Secret-shaped input was redacted.
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={props.onEditPrompt}>
          <Palette size={12} />
          Edit prompt
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={handleVariant} disabled={props.isGenerating}>
          {props.isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Generate variant
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={props.onSaveToOutputs}>
          <Save size={12} />
          Save to outputs
        </Button>
        <Button variant="secondary" size="sm" className="h-7 gap-1 text-xs" onClick={props.onMakeNft}>
          <Shapes size={12} />
          Make NFT
        </Button>
      </div>
    </div>
  );
}

export function GeneratedImageLoadingCard() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dls-border/45 bg-dls-surface p-3 text-sm text-dls-secondary">
      <Loader2 size={16} className="animate-spin" />
      Generating image…
    </div>
  );
}

export function GeneratedImageErrorCard(props: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dls-border/45 bg-dls-surface p-3">
      <div className="flex items-center gap-2 text-sm text-red-300">
        <AlertCircle size={16} />
        {props.message}
      </div>
      {props.onRetry ? (
        <Button variant="outline" size="sm" className="h-7 w-fit gap-1 text-xs" onClick={props.onRetry}>
          <RefreshCw size={12} />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
