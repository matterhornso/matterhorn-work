/** @jsxImportSource react */
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Determines the most likely cause from an error so we can show
 * the right user-facing message.
 */
function classifyError(error: unknown): "connection" | "server" | "unknown" {
  const msg = typeof error === "string"
    ? error.toLowerCase()
    : error instanceof Error
      ? error.message.toLowerCase()
      : "";

  if (
    msg.includes("connection") ||
    msg.includes("connect") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("offline") ||
    msg.includes("engine is offline")
  ) {
    return "connection";
  }
  if (
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("server error") ||
    msg.includes("internal error")
  ) {
    return "server";
  }
  return "unknown";
}

const COPY: Record<"connection" | "server" | "unknown", { title: string; detail: string }> = {
  connection: {
    title: "Matterhorn Work engine is offline",
    detail: "Check that Matterhorn Work is running and your workspace is connected.",
  },
  server: {
    title: "Workspace server did not respond",
    detail: "The server returned an error. Try refreshing or reconnecting the workspace.",
  },
  unknown: {
    title: "Could not load",
    detail: "Something went wrong. Try again.",
  },
};

export type ErrorStateProps = {
  /** The caught error object or friendly error string. */
  error?: unknown;
  /** Override the title text. */
  title?: string;
  /** Override the detail text. */
  detail?: string;
  /** Callback to retry / refresh. */
  onRetry?: () => void;
  /** Additional CSS class on the root element. */
  className?: string;
  /**
   * Colour variant. "default" = red-amber for general panels;
   * "memory" = amber for memory panel sections.
   */
  tone?: "default" | "memory";
};

/**
 * Consistent error state for all server-dependent panels.
 *
 * - Classifies the error as connection / server / unknown.
 * - Shows a clear, user-facing title + detail.
 * - Shows an icon-only refresh button for non-blocking refreshes
 *   (icon in a button, no heavy box).
 *
 * When `title` is explicitly provided the component skips the
 * COPY.title and shows only `detail` (or nothing if the error
 * message itself already reads like a user-facing sentence).
 */
export function ErrorState({
  error,
  title,
  detail,
  onRetry,
  className,
  tone = "default",
}: ErrorStateProps) {
  const kind = classifyError(error);
  const copy = COPY[kind];

  // If the caller already provided a title, use COPY.detail unless the
  // error message itself already reads like a user-facing sentence.
  const effectiveDetail = title
    ? detail ?? (typeof error === "string" && error.length >= 40 ? null : copy.detail)
    : detail ?? copy.detail;
  const showDetail = Boolean(effectiveDetail);

  // When a title override is given and the error is classified as
  // connection, prefer the more specific title from COPY so the user
  // sees the canonical "engine offline" wording.
  const effectiveTitle = title != null && kind !== "connection"
    ? title
    : title ?? copy.title;

  const iconClass = tone === "memory" ? "text-amber-400" : "text-amber-400";
  const textClass = tone === "memory" ? "text-amber-100" : "text-dls-text";
  const detailClass = tone === "memory" ? "text-amber-100/80" : "text-dls-secondary/90";

  return (
    <div className={cn("flex items-start gap-2 text-xs text-dls-secondary", className)}>
      <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", iconClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium", textClass)}>{effectiveTitle}</p>
        {showDetail ? (
          <p className={cn("mt-0.5 break-words", detailClass)}>{effectiveDetail}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRetry}
          aria-label="Retry"
          className={cn(
            "shrink-0 bg-transparent hover:bg-transparent",
            tone === "memory" ? "text-amber-200 hover:text-amber-50" : "text-dls-secondary hover:text-dls-text",
          )}
        >
          <RefreshCw className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Empty state for lists that have no items yet — distinct from errors.
 */
export type EmptyStateProps = {
  message: string;
  className?: string;
};

export function EmptyState({ message, className }: EmptyStateProps) {
  return (
    <p className={cn("text-xs text-dls-secondary", className)}>
      {message}
    </p>
  );
}
