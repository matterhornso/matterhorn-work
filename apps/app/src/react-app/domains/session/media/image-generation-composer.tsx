/** @jsxImportSource react */
import { useState } from "react";
import { Image, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MatterhornImageGenerationInput } from "@matterhorn-work/types/generated-media";

export interface ImageGenerationComposerProps {
  capabilityStatus?: "working" | "needs_setup" | "preview" | "unsupported" | "error";
  onGenerate: (input: MatterhornImageGenerationInput) => void;
  isGenerating?: boolean;
}

export function ImageGenerationComposer(props: ImageGenerationComposerProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;
    props.onGenerate({ prompt: trimmed });
    setPrompt("");
  };

  if (props.capabilityStatus === "needs_setup" || props.capabilityStatus === "unsupported" || props.capabilityStatus === "error") {
    const label = props.capabilityStatus === "needs_setup"
      ? "needs setup"
      : props.capabilityStatus === "unsupported"
        ? "is not supported here"
        : "is unavailable";
    return (
      <div className="flex items-center gap-2 rounded-md bg-dls-surface-muted/30 px-3 py-2 text-[12px] leading-5 text-dls-secondary">
        <Image size={14} />
        Image generation {label}. Add an image provider in Settings.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-2">
      <div className="relative flex-1">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image..."
          className="h-9 pr-8 text-sm"
          disabled={props.isGenerating}
        />
      </div>
      <Button type="submit" size="sm" className="h-9 gap-1 text-xs" disabled={!prompt.trim() || props.isGenerating}>
        {props.isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
        Create image
      </Button>
    </form>
  );
}
