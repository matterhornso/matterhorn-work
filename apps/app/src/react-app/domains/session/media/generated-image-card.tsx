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
  const hasActions = Boolean(
    props.onEditPrompt ||
      props.onGenerateVariant ||
      props.onSaveToOutputs ||
      props.onMakeNft,
  );

  const handleVariant = useCallback(() => {
    props.onGenerateVariant?.();
  }, [props.onGenerateVariant]);

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-dls-surface-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs text-dls-secondary">
        <Image size={14} />
        <span className="font-medium text-dls-text">Image saved to outputs</span>
        <span className="ml-auto">{image.provider}</span>
        <span>·</span>
        <span>{image.model}</span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex aspect-square size-40 shrink-0 items-center justify-center overflow-hidden rounded-md bg-dls-surface-muted/40">
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
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-dls-secondary">
            <span>{image.size}</span>
            <span aria-hidden="true">·</span>
            <span>{image.quality}</span>
            <span aria-hidden="true">·</span>
            <span>{image.format}</span>
          </div>
          {image.safety.secretsRejected ? (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
              <AlertCircle size={12} />
              Secret-shaped input was redacted.
            </div>
          ) : null}
        </div>
      </div>

      {hasActions ? (
        <div className="flex flex-wrap gap-2">
          {props.onEditPrompt ? (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={props.onEditPrompt}>
              <Palette size={12} />
              Edit prompt
            </Button>
          ) : null}
          {props.onGenerateVariant ? (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={handleVariant} disabled={props.isGenerating}>
              {props.isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Generate variant
            </Button>
          ) : null}
          {props.onSaveToOutputs ? (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={props.onSaveToOutputs}>
              <Save size={12} />
              Save to outputs
            </Button>
          ) : null}
          {props.onMakeNft ? (
            <Button variant="secondary" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={props.onMakeNft}>
              <Shapes size={12} />
              Make NFT
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function GeneratedImageLoadingCard() {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-dls-surface-muted/20 p-3 text-sm text-dls-secondary">
      <Loader2 size={16} className="animate-spin" />
      Generating image...
    </div>
  );
}

export function GeneratedImageErrorCard(props: { message: string; description?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-red-3/15 p-3">
      <div className="flex items-center gap-2 text-sm text-red-300">
        <AlertCircle size={16} />
        {props.message}
      </div>
      {props.description ? (
        <p className="text-xs leading-5 text-dls-secondary">{props.description}</p>
      ) : null}
      {props.onRetry ? (
        <Button variant="ghost" size="sm" className="h-7 w-fit gap-1 bg-transparent text-xs hover:bg-dls-hover/35" onClick={props.onRetry}>
          <RefreshCw size={12} />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
