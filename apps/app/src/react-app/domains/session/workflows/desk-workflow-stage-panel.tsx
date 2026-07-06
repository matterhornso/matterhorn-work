import { FileOutput, FileText, PencilLine, Shield } from "lucide-react";
import { t } from "@/i18n";
import type { MatterhornWorkflowArtifact, MatterhornWorkflowManifest, MatterhornWorkflowStep } from "@matterhorn-work/types/matterhorn-workflows";
import { Button } from "@/components/ui/button";
import { deskToneStyle, getCustomerProtocolDeskVisual, getDeskWorkflowManifest, type CustomerProtocolDeskId } from "./protocol-desk-ui";
import { ProtocolBrandLogo } from "./protocol-brand-logo";
import { WorkflowStageCard, type WorkflowStageStatus } from "./workflow-stage-card";

export type DeskWorkflowStagePanelProps = {
  deskId: CustomerProtocolDeskId | string;
  currentStageId?: string;
  taskStatus?: "idle" | "staged" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  onStartStage?: (stageId: string, prompt: string) => void;
  onJotNote?: () => void;
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

function cardStatus(
  index: number,
  currentStageIndex: number,
  taskStatus: NonNullable<DeskWorkflowStagePanelProps["taskStatus"]>,
): WorkflowStageStatus {
  const activeIndex = currentStageIndex >= 0 ? currentStageIndex : 0;
  if (taskStatus === "completed") return "completed";
  if (index < activeIndex) return "completed";
  if (index > activeIndex) return "idle";
  if (taskStatus === "failed") return "failed";
  if (taskStatus === "cancelled") return "cancelled";
  if (taskStatus === "running") return "running";
  if (taskStatus === "waiting") return "waiting";
  if (taskStatus === "staged") return "staged";
  return "idle";
}

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

function outputArtifactsForStep(
  step: MatterhornWorkflowStep,
  manifest: MatterhornWorkflowManifest,
): Array<{ name: string; description?: string }> {
  return step.outputArtifactIds
    .map((id) => manifest.generatedArtifacts.find((artifact) => artifact.id === id))
    .filter((artifact): artifact is MatterhornWorkflowArtifact => Boolean(artifact))
    .map((artifact) => ({ name: artifact.name, description: artifact.description }));
}

function evidenceHintForStep(step: MatterhornWorkflowStep): string[] {
  const serviceHook = String(step.serviceHook ?? "");
  if (serviceHook === "bittensor") {
    return ["reads: public SS58, subnet, validator context"];
  }
  if (serviceHook === "hyperliquid") {
    return ["reads: public market and account context"];
  }
  if (serviceHook === "polymarket") {
    return ["reads: public market, outcome, and compliance context"];
  }
  return [];
}

export function DeskWorkflowStagePanel({
  deskId,
  currentStageId,
  taskStatus = "idle",
  onStartStage,
  onJotNote,
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
      <div className="flex min-w-0 items-start gap-3 rounded-lg bg-[rgba(var(--matterhorn-desk-rgb),0.08)] px-3.5 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[rgba(var(--matterhorn-desk-rgb),0.14)] text-[var(--matterhorn-desk-color)]">
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
      <section className="matterhorn-desk-workflow-stages space-y-2" aria-label={`${visual.displayName} workflow stages`}>
        <p className="px-1 text-[11px] text-[var(--matterhorn-desk-color)]">
          {manifest.steps.length} stages
        </p>
        <div className="space-y-2">
          {manifest.steps.map((step, index) => {
            const isCurrent = currentStageId === step.id || (currentStageId === undefined && index === 0 && taskStatus === "idle");
            const rawPrompt = buildStagePrompt(deskId, step, manifest);
            return (
              <WorkflowStageCard
                key={step.id}
                title={step.name}
                objective={step.description}
                status={cardStatus(index, currentStageIndex, taskStatus)}
                outputs={outputArtifactsForStep(step, manifest)}
                evidenceHints={evidenceHintForStep(step)}
                requiresExternalSigner={step.requiresExternalSigner}
                requiresCustomerConfirmation={step.requiresCustomerConfirmation}
                safetyBoundary={isCurrent ? visual.sessionBoundary : undefined}
                isCurrent={isCurrent}
                actionLabel={isCurrent ? "Start" : "Stage task"}
                onAction={onStartStage ? () => onStartStage(step.id, rawPrompt) : undefined}
              />
            );
          })}
        </div>
      </section>

      {/* Inputs */}
      <div className="grid gap-3 sm:grid-cols-2">
        {requiredInputs.length ? (
          <div className="rounded-lg bg-dls-surface-muted/30 px-3 py-3">
            <p className="mb-1.5 text-[11px] font-semibold text-dls-text">Required inputs</p>
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
          <div className="rounded-lg bg-dls-surface-muted/30 px-3 py-3">
            <p className="mb-1.5 text-[11px] font-semibold text-dls-text">Optional context</p>
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
      <div className="rounded-lg bg-dls-surface-muted/30 px-3 py-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-dls-text">
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
        <div className="flex items-center gap-2">
          {onJotNote ? (
            <Button
              type="button"
              onClick={onJotNote}
              variant="ghost"
              size="xs"
              className="gap-1 text-[11px] font-semibold text-dls-secondary hover:bg-dls-hover"
            >
              <PencilLine className="size-3" />
              {t("notes.quick_jot_button_title")}
            </Button>
          ) : null}
          {onStartStage && currentStageId ? (
            <Button
              type="button"
              onClick={() => {
                const stage = manifest.steps.find((s) => s.id === currentStageId);
                if (stage) onStartStage(stage.id, buildStagePrompt(deskId, stage, manifest));
              }}
              variant="secondary"
              size="xs"
              className="text-[11px] font-semibold text-[var(--matterhorn-desk-color)] bg-[rgba(var(--matterhorn-desk-rgb),0.14)] hover:bg-[rgba(var(--matterhorn-desk-rgb),0.22)] focus-visible:ring-[var(--matterhorn-desk-color)]"
            >
              Next action
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
