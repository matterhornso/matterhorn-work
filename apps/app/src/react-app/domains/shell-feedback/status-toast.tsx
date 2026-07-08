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
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "error"
          ? "text-red-300"
          : "text-sky-300";

  const semanticRole = tone === "error" || tone === "warning" ? "alert" : "status";

  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? AlertTriangle
        : tone === "error"
        ? CircleAlert
        : Info;

  return (
    <div
      role={semanticRole}
      aria-live={semanticRole === "alert" ? "assertive" : "polite"}
      aria-atomic="true"
      className="w-full max-w-[23rem] overflow-hidden rounded-lg border border-dls-border/70 bg-dls-surface px-3 py-3 shadow-sm animate-in fade-in slide-in-from-top-3 duration-200"
    >
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 size-4 shrink-0 ${tileClass}`.trim()} aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium leading-5 text-dls-text">
                {props.title}
              </div>
              {props.description?.trim() ? (
                <p className="mt-0.5 text-xs leading-5 text-dls-secondary">
                  {props.description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={props.onDismiss}
              className="rounded-md p-1 text-dls-secondary transition hover:bg-dls-hover hover:text-dls-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dls-border"
              aria-label={props.dismissLabel ?? "Dismiss"}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          {props.actionLabel && props.onAction ? (
            <div className="mt-3 flex items-center gap-2">
              <Button
                type="button"
                variant="default"
                size="xs"
                onClick={() => props.onAction?.()}
              >
                {props.actionLabel}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
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
