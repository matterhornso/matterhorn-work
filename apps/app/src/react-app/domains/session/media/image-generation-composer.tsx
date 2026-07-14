/** @jsxImportSource react */
import { useState } from "react";
import { Image, Loader2, Wand2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MatterhornImageGenerationInput } from "@matterhorn-work/types/generated-media";

export interface ImageGenerationComposerProps {
  capabilityStatus?: "working" | "needs_setup" | "preview" | "unsupported" | "error";
  onGenerate: (input: MatterhornImageGenerationInput) => void;
  isGenerating?: boolean;
  setupHref?: string;
  suggestedPrompt?: string;
}

export function ImageGenerationComposer(props: ImageGenerationComposerProps) {
  const [prompt, setPrompt] = useState("");
  const suggestedPrompt = props.suggestedPrompt?.trim() ?? "";
  const trimmedPrompt = prompt.trim();
  const canUseSuggestedPrompt = Boolean(suggestedPrompt && suggestedPrompt !== trimmedPrompt);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = trimmedPrompt;
    if (!trimmed) return;
    props.onGenerate({ prompt: trimmed });
    setPrompt("");
  };

  if (props.capabilityStatus === "needs_setup" || props.capabilityStatus === "unsupported" || props.capabilityStatus === "error") {
    const label = props.capabilityStatus === "needs_setup"
      ? "requires Matterhorn setup"
      : props.capabilityStatus === "unsupported"
        ? "is not supported here"
        : "is temporarily unavailable";
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-dls-surface-muted/[0.10] px-2.5 py-2 text-[12px] leading-5 text-dls-secondary">
        <Image size={14} className="shrink-0 text-dls-text/75" />
        <span className="min-w-0 flex-1">Image generation {label}. Review its status in Settings.</span>
        {props.setupHref ? (
          <a
            href={props.setupHref}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "h-7 shrink-0 bg-transparent px-2 text-[11px] font-semibold text-dls-text hover:bg-dls-hover/45",
            )}
          >
            Review status
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {canUseSuggestedPrompt ? (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-dls-secondary">
          <span>Use chat draft</span>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-semibold text-dls-text transition-colors hover:bg-dls-hover/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--matterhorn-blue-rgb),0.28)]"
            disabled={props.isGenerating}
            onClick={() => setPrompt(suggestedPrompt)}
          >
            Use draft
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-2 rounded-md bg-dls-surface-muted/[0.10] p-1">
        <div className="relative flex-1">
          <Input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image..."
            className="h-8 border-transparent bg-transparent px-2 pr-8 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
            disabled={props.isGenerating}
          />
        </div>
        <Button type="submit" size="sm" className="h-8 gap-1 text-xs" disabled={!trimmedPrompt || props.isGenerating}>
          {props.isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
          Create image
        </Button>
      </div>
    </form>
  );
}
