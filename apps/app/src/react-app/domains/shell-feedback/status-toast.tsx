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

  const iconClass =
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "error"
          ? "text-red-300"
          : "text-sky-300";

  const Icon =
    tone === "success"
      ? CheckCircle2
      : tone === "warning"
        ? AlertTriangle
        : tone === "error"
          ? CircleAlert
          : Info;
  const liveRole = tone === "warning" || tone === "error" ? "alert" : "status";

  return (
    <div
      className="w-full max-w-[23rem] overflow-hidden rounded-lg border border-dls-border/45 bg-dls-surface shadow-[var(--dls-shell-shadow)] animate-in fade-in slide-in-from-top-2 duration-200"
      role={liveRole}
      aria-live={liveRole === "alert" ? "assertive" : "polite"}
    >
      <div className="flex items-start gap-2.5 p-3">
        <Icon className={`mt-0.5 size-4 shrink-0 ${iconClass}`.trim()} aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium leading-5 text-dls-text">
                {props.title}
              </div>
              {props.description?.trim() ? (
                <p className="mt-1 text-xs leading-5 text-dls-secondary">
                  {props.description}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={props.onDismiss}
              className="rounded-md p-1 text-dls-secondary transition-colors hover:bg-dls-hover/35 hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35"
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
                className="h-7 px-2.5 text-xs"
                onClick={() => props.onAction?.()}
              >
                {props.actionLabel}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 bg-transparent px-2.5 text-xs text-dls-secondary hover:bg-dls-hover/35 hover:text-dls-text"
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
