/** @jsxImportSource react */
import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type StatusToastProps = {
  open: boolean;
  title: string;
  description?: string | null;
  tone?: "success" | "info" | "warning" | "error";
  actionLabel?: string;
  onAction?: () => void;
  dismissLabel?: string;
  onDismiss: () => void;
};

export function StatusToast(props: StatusToastProps) {
  if (!props.open) return null;
  const tone = props.tone ?? "info";

  const tileClass =
    tone === "success"
      ? "border-emerald-6/40 bg-emerald-4/80 text-emerald-11"
      : tone === "warning"
        ? "border-amber-6/40 bg-amber-4/80 text-amber-11"
        : tone === "error"
          ? "border-red-6/40 bg-red-4/80 text-red-11"
          : "border-sky-6/40 bg-sky-4/80 text-sky-11";

  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? AlertTriangle
        : tone === "error"
          ? CircleAlert
          : Info;

  return (
    <div className="w-full max-w-[24rem] overflow-hidden rounded-lg border border-dls-border/65 bg-dls-surface shadow-[var(--dls-shell-shadow)] animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex items-start gap-3 p-3.5">
        <div
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border ${tileClass}`.trim()}
        >
          <Icon size={16} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-gray-12">
                {props.title}
              </div>
              {props.description?.trim() ? (
                <p className="mt-1 text-sm leading-relaxed text-gray-10">
                  {props.description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={props.onDismiss}
              className="rounded-md p-1 text-gray-9 transition hover:bg-gray-3 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
              aria-label={props.dismissLabel ?? "Dismiss"}
            >
              <X size={16} />
            </button>
          </div>

          {props.actionLabel && props.onAction ? (
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => props.onAction?.()}
              >
                {props.actionLabel}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 bg-transparent px-3 text-xs hover:bg-dls-hover"
                onClick={props.onDismiss}
              >
                {props.dismissLabel ?? "Dismiss"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
