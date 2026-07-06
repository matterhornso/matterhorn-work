/** @jsxImportSource react */
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, CircleHelp, Clock3, FlaskConical, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CapabilityUiStatus, CapabilityUiTone } from "./backend-capability-helpers";
import { capabilityStatusLabel, capabilityStatusTone } from "./backend-capability-helpers";

const toneClasses: Record<CapabilityUiTone, string> = {
  ready: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  setup: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  preview: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  neutral: "border-dls-border bg-background text-dls-secondary",
  error: "border-red-500/30 bg-red-500/10 text-red-300",
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
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        props.className,
      )}
    >
      <StatusIcon status={props.status} />
      {props.label ?? capabilityStatusLabel(props.status)}
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
    <div className="flex flex-col gap-1 px-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-dls-text">{props.label}</p>
        {props.hint ? <p className="mt-0.5 break-words text-xs leading-5 text-dls-secondary">{props.hint}</p> : null}
      </div>
      <div className="shrink-0">
        {props.value ?? <BackendCapabilityStatusBadge status={props.status} />}
      </div>
    </div>
  );
}
