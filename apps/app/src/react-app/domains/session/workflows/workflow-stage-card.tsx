/** @jsxImportSource react */
import {
  AlertCircle,
  ArrowRight,
  FileOutput,
  Lightbulb,
  Lock,
  Shield,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkflowStageStatus =
  | "idle"
  | "staged"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkflowStageCardProps {
  /** Stage title - shown prominently. */
  title: string;
  /** Compact objective or description - shown below title. */
  objective?: string;
  /** Stage runtime status. */
  status?: WorkflowStageStatus;
  /** Expected output artifact names. */
  outputs?: Array<{ name: string; description?: string }>;
  /** What the user needs to do at this stage, if anything. */
  userActionHint?: string;
  /** Evidence or source hints, e.g. "reads: public SS58", "requires: external signer". */
  evidenceHints?: string[];
  /** Whether external signer is required for this stage. */
  requiresExternalSigner?: boolean;
  /** Whether customer confirmation is required before proceeding. */
  requiresCustomerConfirmation?: boolean;
  /** Safety policy copy to show when required. */
  safetyBoundary?: string;
  /** Whether this is the active/next stage. */
  isCurrent?: boolean;
  /** Action button label (e.g. "Run in chat"). */
  actionLabel?: string;
  /** Disables the action button while preserving the visible task affordance. */
  actionDisabled?: boolean;
  /** Tooltip/title copy for the action button. */
  actionTitle?: string;
  /** Places the action on its own row when launcher copy needs the full card width. */
  actionPlacement?: "inline" | "below";
  /** Callback when the action button is clicked. */
  onAction?: () => void;
  /** Callback when a listed output artifact is clicked. */
  onOutputClick?: (artifactName: string) => void;
  /** Optional CSS tone class - uses desk color by default. */
  toneClass?: string;
}

/** Compact icon+label for status. */
function StatusBadge(props: { status: WorkflowStageStatus }) {
  const { status } = props;
  if (status === "idle") return null;

  const meta: Record<WorkflowStageStatus, { label: string; tone: string }> = {
    idle: { label: "Ready", tone: "text-dls-secondary" },
    staged: { label: "Staged", tone: "text-[var(--matterhorn-desk-color)]" },
    running: { label: "Running", tone: "text-amber-300" },
    waiting: { label: "Awaiting you", tone: "text-sky-300" },
    completed: { label: "Done", tone: "text-emerald-300" },
    failed: { label: "Failed", tone: "text-rose-300" },
    cancelled: { label: "Cancelled", tone: "text-muted-foreground" },
  };
  const m = meta[status];
  return (
    <span className={cn("text-[11px] font-medium leading-5", m.tone)}>
      {m.label}
    </span>
  );
}

/**
 * WorkflowStageCard - compact, self-contained stage card.
 *
 * Shows: title, status, objective, expected outputs, user action hint,
 * evidence hints, and action state without exposing the underlying prompt.
 *
 * Used by both the desk workflow stage panel and the protocol desk
 * empty state for task buttons.
 */
export function WorkflowStageCard(props: WorkflowStageCardProps) {
  const {
    title,
    objective,
    status = "idle",
    outputs,
    userActionHint,
    evidenceHints,
    requiresExternalSigner,
    requiresCustomerConfirmation,
    safetyBoundary,
    isCurrent = false,
    actionLabel,
    actionDisabled = false,
    actionTitle,
    actionPlacement = "inline",
    onAction,
    onOutputClick,
    toneClass,
  } = props;

  const hasOutputs = Boolean(outputs && outputs.length > 0);
  const hasHints = Boolean(evidenceHints && evidenceHints.length > 0);
  const hasActionHint = Boolean(userActionHint);
  const hasSafety = Boolean(safetyBoundary);

  const showDetails = hasOutputs || hasActionHint || hasSafety || (hasHints && status !== "idle");

  return (
    <div
      role="group"
      aria-label={title}
      data-workflow-stage={title}
      className={cn(
        "rounded-md bg-dls-surface-muted/[0.20] px-3.5 py-3 transition-colors hover:bg-dls-surface-muted/[0.30] focus-within:bg-dls-surface-muted/[0.30]",
        isCurrent ? "bg-dls-surface-muted/[0.28]" : null,
      )}
    >
      {/* Header row: title + status + action */}
      <div className={cn(
        "grid grid-cols-1 items-start gap-x-2 gap-y-2",
        actionPlacement === "inline" ? "sm:flex" : null,
      )}>
        <div className={cn(
          "col-start-1 row-start-1 min-w-0",
          actionPlacement === "inline" ? "sm:flex-1" : null,
        )}>
          <p className="text-[13px] font-semibold leading-5 text-dls-text">{title}</p>
          {objective ? (
            <p className="mt-0.5 text-xs leading-[18px] text-dls-secondary">{objective}</p>
          ) : null}
        </div>
        <div className={cn(
          "col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5",
          actionPlacement === "inline" ? "sm:ml-auto sm:shrink-0" : null,
        )}>
          <StatusBadge status={status} />
          {onAction ? (
            <Button
              type="button"
              onClick={onAction}
              variant="ghost"
              size="xs"
              disabled={actionDisabled}
              title={actionTitle}
              className={cn(
                "h-8 gap-1 rounded-md bg-dls-surface-muted/[0.38] px-2.5 text-xs font-semibold hover:bg-dls-surface-muted/[0.52]",
                toneClass ?? "text-[var(--matterhorn-desk-color)]",
                "hover:text-[var(--matterhorn-desk-color)]",
                "disabled:cursor-not-allowed disabled:opacity-45",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]",
              )}
            >
              {actionLabel ?? "Start"}
              <ArrowRight className="size-3" />
            </Button>
          ) : null}
        </div>
      </div>

      {showDetails ? (
        <details className="group mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium leading-[18px] text-dls-secondary transition-colors hover:text-dls-text marker:hidden">
            Details
            <span className="transition-transform group-open:rotate-90" aria-hidden="true">{">"}</span>
          </summary>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 rounded-md bg-dls-background/20 px-2.5 py-2">
            {hasOutputs ? (
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <FileOutput className="size-3 shrink-0 text-dls-muted" />
                <span className="min-w-0 text-xs leading-[18px] text-dls-secondary">
                  <span className="font-medium text-dls-text">Outputs:</span>{" "}
                  {outputs!.map((out, i) => (
                    <span key={out.name}>
                      {onOutputClick ? (
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-dls-text"
                          onClick={() => onOutputClick(out.name)}
                        >
                          {out.name}
                        </button>
                      ) : (
                        <span className="text-dls-text">{out.name}</span>
                      )}
                      {out.description ? <span className="ml-1 text-dls-muted">- {out.description}</span> : null}
                      {i < outputs!.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </span>
              </li>
            ) : null}
            {hasHints ? (
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <Lightbulb className="size-3 shrink-0 text-dls-muted" />
                <span className="min-w-0 text-xs leading-[18px] text-dls-secondary">
                  <span className="font-medium text-dls-text">Evidence:</span>{" "}
                  {evidenceHints!.join(" / ")}
                </span>
              </li>
            ) : null}
            {hasActionHint ? (
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <ArrowRight className="size-3 shrink-0 text-dls-muted" />
                <span className="min-w-0 text-xs leading-[18px] text-dls-secondary">
                  <span className="font-medium text-dls-text">You:</span> {userActionHint}
                </span>
              </li>
            ) : null}
            {requiresExternalSigner ? (
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <Lock className="size-3 shrink-0 text-dls-muted" />
                <span className="min-w-0 text-xs leading-[18px] text-dls-secondary">
                  <span className="font-medium text-dls-text">External signer required</span> - unsigned handoff only
                </span>
              </li>
            ) : null}
            {requiresCustomerConfirmation ? (
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <AlertCircle className="size-3 shrink-0 text-dls-muted" />
                <span className="min-w-0 text-xs leading-[18px] text-dls-secondary">
                  <span className="font-medium text-dls-text">Confirmation required</span> before continuing
                </span>
              </li>
            ) : null}
            {hasSafety ? (
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <Shield className="size-3 shrink-0 text-dls-muted" />
                <span className="min-w-0 text-xs leading-[18px] text-dls-secondary">
                  {safetyBoundary}
                </span>
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
