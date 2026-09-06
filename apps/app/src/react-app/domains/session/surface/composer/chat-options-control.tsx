/** @jsxImportSource react */
import {
  Check,
  ChevronDown,
  Hammer,
  ListChecks,
  MessageCircle,
  SlidersHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  MATTERHORN_EXECUTION_MODE_OPTIONS,
  type MatterhornExecutionMode,
} from "../../modes/execution-mode";
import {
  RESPONSE_PERSPECTIVE_OPTIONS,
  type ResponsePerspective,
} from "../../perspectives/response-perspective";

export type ChatOptionsControlProps = {
  busy: boolean;
  executionMode: MatterhornExecutionMode;
  executionModesEnabled: boolean;
  onExecutionModeChange: (mode: MatterhornExecutionMode) => void;
  responsePerspective: ResponsePerspective;
  onResponsePerspectiveChange: (perspective: ResponsePerspective) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function ExecutionModeIcon({ mode, size = 13 }: { mode: MatterhornExecutionMode; size?: number }) {
  if (mode === "discuss") return <MessageCircle size={size} />;
  if (mode === "plan") return <ListChecks size={size} />;
  return <Hammer size={size} />;
}

export function ChatOptionsControl(props: ChatOptionsControlProps) {
  const executionMode = MATTERHORN_EXECUTION_MODE_OPTIONS.find(
    (option) => option.value === props.executionMode,
  );
  const perspective = RESPONSE_PERSPECTIVE_OPTIONS.find(
    (option) => option.value === props.responsePerspective,
  );

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-dls-secondary transition-colors duration-150 hover:bg-dls-surface-muted/[0.2] hover:text-dls-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.3)] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none"
        onClick={() => props.onOpenChange(!props.open)}
        disabled={props.busy}
        aria-haspopup="dialog"
        aria-expanded={props.open}
        title={`Chat options: ${executionMode?.label ?? "Work"}, ${perspective?.label ?? "Balanced"}`}
      >
        <SlidersHorizontal size={12} strokeWidth={1.7} aria-hidden="true" />
        <span>Chat options</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {props.open ? (
        <div
          role="dialog"
          aria-label="Chat options"
          className="absolute bottom-full left-0 z-40 mb-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-dls-border bg-dls-surface p-2 shadow-[var(--dls-shell-shadow)]"
        >
          {props.executionModesEnabled ? (
            <div>
              <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold text-dls-text">
                How Matterhorn should help
              </p>
              <div role="radiogroup" aria-label="Execution mode" className="space-y-0.5">
                {MATTERHORN_EXECUTION_MODE_OPTIONS.map((option) => {
                  const active = props.executionMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={props.busy}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.3)] motion-reduce:transition-none",
                        active ? "bg-dls-surface-muted/[0.3]" : "hover:bg-dls-surface-muted/[0.2]",
                      )}
                      onClick={() => props.onExecutionModeChange(option.value)}
                    >
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-dls-secondary">
                        <ExecutionModeIcon mode={option.value} size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-3 text-[12px] font-semibold text-dls-text">
                          {option.label}
                          {active ? <Check size={13} className="shrink-0 text-dls-secondary" aria-hidden="true" /> : null}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-dls-secondary">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className={props.executionModesEnabled ? "mt-2 border-t border-dls-border pt-2" : ""}>
            <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold text-dls-text">
              Response style
            </p>
            <div role="radiogroup" aria-label="Response perspective" className="space-y-0.5">
              {RESPONSE_PERSPECTIVE_OPTIONS.map((option) => {
                const active = props.responsePerspective === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={option.description}
                    disabled={props.busy}
                    className={cn(
                      "flex min-h-9 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-[12px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--dls-accent-rgb)/0.3)] motion-reduce:transition-none",
                      active ? "bg-dls-surface-muted/[0.3] font-semibold text-dls-text" : "text-dls-secondary hover:bg-dls-surface-muted/[0.2] hover:text-dls-text",
                    )}
                    onClick={() => props.onResponsePerspectiveChange(option.value)}
                  >
                    <span>{option.label}</span>
                    {active ? <Check size={13} className="shrink-0 text-dls-secondary" aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
