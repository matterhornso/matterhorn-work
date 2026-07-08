/** @jsxImportSource react */
import { AlertTriangle, Check, CircleX, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReactComposerNotice = {
  title: string;
  description?: string | null;
  tone?: "info" | "success" | "warning" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

export function ReactComposerNotice(props: { notice: ReactComposerNotice | null }) {
  const tone = props.notice?.tone ?? "info";
  if (!props.notice) return null;

  const toneClass =
    tone === "success"
      ? "bg-emerald-4 text-emerald-11"
      : tone === "warning"
        ? "bg-amber-4 text-amber-11"
        : tone === "error"
          ? "bg-red-4 text-red-11"
          : "bg-sky-4 text-sky-11";
  const ToneIcon = tone === "success" ? Check : tone === "warning" ? AlertTriangle : tone === "error" ? CircleX : Info;

  return (
    <div className="absolute bottom-full right-0 z-30 mb-3 w-[min(26rem,calc(100vw-2rem))] max-w-full overflow-hidden rounded-lg bg-dls-surface px-4 py-3 shadow-lg ring-1 ring-dls-border/35">
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md", toneClass)}>
          <ToneIcon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium leading-relaxed text-dls-text">{props.notice.title}</div>
          {props.notice.description?.trim() ? (
            <p className="mt-1 text-[12px] leading-relaxed text-dls-secondary">{props.notice.description}</p>
          ) : null}
          {props.notice.actionLabel && props.notice.onAction ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3 h-7 px-2.5 text-xs"
              onClick={() => props.notice?.onAction?.()}
            >
              {props.notice.actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
