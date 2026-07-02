import { FileOutput, FileText, Shield } from "lucide-react";
import type { MatterhornWorkflowManifest, MatterhornWorkflowStep } from "@matterhorn-work/types/matterhorn-workflows";
import { deskToneStyle, getCustomerProtocolDeskVisual, getDeskWorkflowManifest, type CustomerProtocolDeskId } from "./protocol-desk-ui";
import { ProtocolBrandLogo } from "./protocol-brand-logo";

export type DeskWorkflowStagePanelProps = {
  deskId: CustomerProtocolDeskId | string;
  currentStageId?: string;
  taskStatus?: "idle" | "staged" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  onStartStage?: (stageId: string, prompt: string) => void;
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Ready",
  staged: "Staged",
  running: "Running",
  waiting: "Waiting for you",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<string, string> = {
  idle: "text-dls-secondary",
  staged: "text-[var(--matterhorn-desk-color)]",
  running: "text-amber-300",
  waiting: "text-sky-300",
  completed: "text-emerald-300",
  failed: "text-rose-300",
  cancelled: "text-dls-secondary",
};

function buildStagePrompt(deskId: string, stage: MatterhornWorkflowStep, manifest: MatterhornWorkflowManifest): string {
  if (deskId === "wellness") {
    return `Start the ${stage.name.toLowerCase()} stage of my Longevity program`;
  }
  if (deskId === "bittensor") {
    return `${stage.name} on Bittensor`;
  }
  if (deskId === "hyperliquid") {
    return `${stage.name} on Hyperliquid`;
  }
  if (deskId === "polymarket") {
    return `${stage.name} on Polymarket`;
  }
  return `${stage.name} in ${manifest.name}`;
}

export function DeskWorkflowStagePanel({
  deskId,
  currentStageId,
  taskStatus = "idle",
  onStartStage,
}: DeskWorkflowStagePanelProps) {
  const visual = getCustomerProtocolDeskVisual(deskId);
  const manifest = getDeskWorkflowManifest(deskId);

  if (!visual || !manifest) {
    return null;
  }

  const requiredInputs = manifest.inputPrompts.filter((input) => input.required);
  const optionalInputs = manifest.inputPrompts.filter((input) => !input.required);
  const currentStageIndex = currentStageId
    ? manifest.steps.findIndex((step) => step.id === currentStageId)
    : -1;

  return (
    <div className="w-full space-y-3 px-2 py-3 sm:px-3 sm:py-4" style={deskToneStyle(deskId)}>
      {/* Agent header */}
      <div className="flex min-w-0 items-start gap-3 rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.08)] px-3.5 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--matterhorn-desk-rgb),0.14)] text-[var(--matterhorn-desk-color)]">
          <ProtocolBrandLogo id={deskId} size={30} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-dls-text">{visual.agentName}</span>
            <span className={`text-[11px] font-semibold ${STATUS_TONE[taskStatus] ?? STATUS_TONE.idle}`}>
              {STATUS_LABELS[taskStatus] ?? taskStatus}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-dls-secondary">{visual.agentDescription}</p>
          <p className="mt-1 text-[11px] leading-4 text-dls-muted">
            Workflow: {manifest.name} · {manifest.steps.length} stages · {visual.statusLabel}
          </p>
        </div>
      </div>

      {/* Workflow stages */}
      <section
        className="matterhorn-desk-workflow-stages overflow-hidden rounded-xl bg-dls-surface/44 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
        aria-label={`${visual.displayName} workflow stages`}
      >
        <div className="border-b border-dls-border/35 px-3.5 py-3">
          <p className="text-[13px] font-semibold text-dls-text">Standardized workflow</p>
          <p className="mt-0.5 text-[11px] leading-4 text-dls-secondary">
            The agent runs these stages. The composer only carries your public context.
          </p>
        </div>
        <div className="divide-y divide-dls-border/30">
          {manifest.steps.map((step, index) => {
            const isCurrent = currentStageId === step.id || (currentStageId === undefined && index === 0 && taskStatus === "idle");
            return (
              <div
                key={step.id}
                className={`grid gap-1 px-3.5 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:gap-3 ${
                  isCurrent ? "bg-[rgba(var(--matterhorn-desk-rgb),0.06)]" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-dls-surface-muted text-[10px] font-semibold text-dls-secondary">
                    {index + 1}
                  </span>
                  <span className="text-[12px] font-semibold text-dls-text">{step.name}</span>
                </div>
                <span className="text-[11px] leading-4 text-dls-secondary">{step.description}</span>
                {onStartStage ? (
                  <button
                    type="button"
                    onClick={() => onStartStage(step.id, buildStagePrompt(deskId, step, manifest))}
                    className="rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--matterhorn-desk-color)] transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb),0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
                  >
                    {isCurrent ? "Start" : "Stage task"}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Inputs */}
      <div className="grid gap-3 sm:grid-cols-2">
        {requiredInputs.length ? (
          <div className="rounded-xl bg-dls-surface-muted/30 px-3 py-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-dls-text">Required inputs</p>
            <ul className="space-y-1.5">
              {requiredInputs.map((input) => (
                <li key={input.id} className="text-[11px] leading-4 text-dls-secondary">
                  <span className="font-medium text-dls-text">{input.label}</span>
                  {input.helpText ? <span className="block text-dls-muted">{input.helpText}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {optionalInputs.length ? (
          <div className="rounded-xl bg-dls-surface-muted/30 px-3 py-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-dls-text">Optional context</p>
            <ul className="space-y-1.5">
              {optionalInputs.map((input) => (
                <li key={input.id} className="text-[11px] leading-4 text-dls-secondary">
                  <span className="font-medium text-dls-text">{input.label}</span>
                  {input.helpText ? <span className="block text-dls-muted">{input.helpText}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Expected outputs */}
      <div className="rounded-xl bg-dls-surface-muted/30 px-3 py-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-dls-text">
          <FileOutput className="size-3.5" />
          Expected outputs
        </p>
        <ul className="grid gap-1 sm:grid-cols-2">
          {manifest.generatedArtifacts.map((artifact) => (
            <li key={artifact.id} className="flex items-start gap-1.5 text-[11px] leading-4 text-dls-secondary">
              <FileText className="mt-0.5 size-3 shrink-0 text-dls-muted" />
              <span>
                <span className="font-medium text-dls-text">{artifact.name}</span>
                {artifact.description ? <span className="block text-dls-muted">{artifact.description}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-4 text-dls-muted">
          Outputs save under <span className="font-medium text-dls-text">outputs/{visual.outputDeskId}/&lt;session-slug&gt;/</span>.
        </p>
      </div>

      {/* Safety boundary */}
      <div className="rounded-lg border border-[rgba(var(--matterhorn-desk-rgb),0.24)] bg-[rgba(var(--matterhorn-desk-rgb),0.06)] px-3 py-2.5">
        <p className="flex items-start gap-1.5 text-[11px] leading-4 text-dls-secondary">
          <Shield className="mt-0.5 size-3.5 shrink-0 text-[var(--matterhorn-desk-color)]" />
          <span>
            <span className="font-semibold text-dls-text">Safety boundary:</span>{" "}
            {visual.sessionBoundary}
          </span>
        </p>
      </div>

      {/* Next action */}
      <div className="flex items-center justify-between rounded-lg border border-dls-border/45 bg-dls-surface/50 px-3 py-2.5">
        <span className="text-[11px] text-dls-secondary">
          {taskStatus === "completed"
            ? "Workflow complete. Start a new task or refine the outputs."
            : taskStatus === "waiting"
              ? "Review the stage output, then confirm or edit before continuing."
              : "Add your public context in the composer and send to run the current stage."}
        </span>
        {onStartStage && currentStageId ? (
          <button
            type="button"
            onClick={() => {
              const stage = manifest.steps.find((s) => s.id === currentStageId);
              if (stage) onStartStage(stage.id, buildStagePrompt(deskId, stage, manifest));
            }}
            className="rounded-md bg-[rgba(var(--matterhorn-desk-rgb),0.14)] px-2.5 py-1 text-[11px] font-semibold text-[var(--matterhorn-desk-color)] transition-colors hover:bg-[rgba(var(--matterhorn-desk-rgb),0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--matterhorn-desk-color)]"
          >
            Next action
          </button>
        ) : null}
      </div>
    </div>
  );
}
