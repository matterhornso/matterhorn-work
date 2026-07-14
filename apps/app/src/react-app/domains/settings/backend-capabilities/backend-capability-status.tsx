/** @jsxImportSource react */
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, CircleHelp, Clock3, FlaskConical, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CapabilityUiStatus, CapabilityUiTone } from "./backend-capability-helpers";
import { capabilityStatusLabel, capabilityStatusTone } from "./backend-capability-helpers";

const toneClasses: Record<CapabilityUiTone, string> = {
  ready: "text-emerald-300",
  setup: "text-sky-300",
  preview: "text-amber-300",
  neutral: "text-dls-secondary",
  error: "text-red-300",
};

function StatusIcon(props: { status: CapabilityUiStatus; className?: string }) {
  const className = cn("size-3 shrink-0", props.className);
  switch (props.status) {
    case "working":
      return <CheckCircle2 className={className} />;
    case "needs_setup":
      return <Wrench className={className} />;
    case "preview":
      return <FlaskConical className={className} />;
    case "unsupported":
      return <CircleHelp className={className} />;
    case "error":
      return <AlertCircle className={className} />;
    case "unavailable":
    default:
      return <Clock3 className={className} />;
  }
}

export interface BackendCapabilityStatusBadgeProps {
  status: CapabilityUiStatus;
  label?: string;
  className?: string;
}

export function BackendCapabilityStatusBadge(props: BackendCapabilityStatusBadgeProps) {
  const tone = capabilityStatusTone(props.status);
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-xs font-medium",
        toneClasses[tone],
        props.className,
      )}
    >
      <StatusIcon status={props.status} />
      <span className="min-w-0 break-words">{props.label ?? capabilityStatusLabel(props.status)}</span>
    </span>
  );
}

export interface BackendCapabilityStatusRowProps {
  label: ReactNode;
  status: CapabilityUiStatus;
  hint?: ReactNode;
  value?: ReactNode;
}

export function BackendCapabilityStatusRow(props: BackendCapabilityStatusRowProps) {
  return (
    <div className="grid gap-2 rounded-lg bg-dls-surface-muted/[0.045] px-3 py-2.5 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-dls-text">{props.label}</p>
        {props.hint ? <p className="mt-0.5 break-words text-xs leading-5 text-dls-secondary">{props.hint}</p> : null}
      </div>
      <div className="min-w-0 max-w-full text-xs text-dls-secondary">
        {props.value ?? <BackendCapabilityStatusBadge status={props.status} />}
      </div>
    </div>
  );
}
