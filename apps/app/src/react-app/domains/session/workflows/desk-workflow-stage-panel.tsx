import { Check, ChevronRight, FileOutput, FileText, Info, PencilLine } from "lucide-react";
import { t } from "@/i18n";
import type { MatterhornWorkflowArtifact, MatterhornWorkflowManifest, MatterhornWorkflowStep } from "@matterhorn-work/types/matterhorn-workflows";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deskToneStyle, getCustomerProtocolDeskVisual, getDeskWorkflowManifest, type CustomerProtocolDeskId } from "./protocol-desk-ui";
import { ProtocolDeskMark } from "./protocol-brand-logo";
import { WorkflowStageCard, type WorkflowStageStatus } from "./workflow-stage-card";

export type DeskWorkflowStagePanelProps = {
  deskId: CustomerProtocolDeskId | string;
  presentation?: "default" | "guided";
  showAgentHeader?: boolean;
  currentStageId?: string;
  taskStatus?: "idle" | "staged" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  stageActionDisabled?: boolean;
  stageActionLabel?: string;
  stageActionTitle?: string;
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
  if (deskId === "sui") {
    return `${stage.name} on Sui`;
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
  if (serviceHook === "sui") {
    return ["reads: public Sui account and receipt context"];
  }
  return [];
}

export function DeskWorkflowStagePanel({
  deskId,
  presentation = "default",
  showAgentHeader = true,
  currentStageId,
  taskStatus = "idle",
  stageActionDisabled = false,
  stageActionLabel = "Task unavailable",
  stageActionTitle,
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
  const activeStageIndex = currentStageIndex >= 0 ? currentStageIndex : 0;
  const guidedSequence = presentation === "guided";

  return (
    <div className="w-full space-y-3 px-2 py-3 sm:px-3 sm:py-4" style={deskToneStyle(deskId)}>
      {/* Agent header */}
      {showAgentHeader ? (
      <div className="flex min-w-0 items-start gap-3 rounded-lg bg-[rgb(var(--matterhorn-desk-rgb)/0.06)] px-3.5 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--matterhorn-desk-rgb)/0.14)] text-[var(--matterhorn-desk-color)]">
          <ProtocolDeskMark id={deskId} size={30} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-dls-text">{visual.agentName}</span>
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label={`${visual.displayName} safety info`}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-dls-muted transition-colors hover:bg-dls-surface-muted/40 hover:text-dls-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dls-text/35"
                  >
                    <Info className="size-3.5" strokeWidth={1.55} aria-hidden="true" />
                  </button>
                }
              />
              <PopoverContent
                side="right"
                align="start"
                className="w-72 rounded-lg border border-dls-border bg-dls-surface px-3 py-2 text-left text-xs leading-5 text-dls-secondary shadow-none"
              >
                <p>{visual.sessionBoundary}</p>
              </PopoverContent>
            </Popover>
            {taskStatus !== "idle" ? (
              <span className={`text-[11px] font-semibold ${STATUS_TONE[taskStatus] ?? STATUS_TONE.idle}`}>
                {STATUS_LABELS[taskStatus] ?? taskStatus}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-5 text-dls-secondary">{visual.agentDescription}</p>
          <p className="mt-1 text-[11px] leading-4 text-dls-muted">
            {manifest.steps.length} stages
          </p>
        </div>
      </div>
      ) : null}

      {/* Workflow stages */}
      <section className="matterhorn-desk-workflow-stages space-y-2" aria-label={`${visual.displayName} workflow stages`}>
        {guidedSequence ? (
          <div className="flex items-center justify-between gap-3 px-1">
            <div>
              <h3 className="text-[13px] font-semibold text-dls-text">Program workstream</h3>
              <p className="mt-0.5 text-[11px] leading-5 text-dls-secondary">
                Complete the current stage, review its output, then continue.
              </p>
            </div>
            <span className="shrink-0 text-[11px] font-medium text-dls-secondary">
              {taskStatus === "completed"
                ? `${manifest.steps.length} of ${manifest.steps.length}`
                : `${activeStageIndex + 1} of ${manifest.steps.length}`}
            </span>
          </div>
        ) : null}
        <div className={guidedSequence ? "space-y-1.5" : "space-y-2"}>
          {manifest.steps.map((step, index) => {
            const isCurrent = taskStatus !== "completed" && index === activeStageIndex;
            const rawPrompt = buildStagePrompt(deskId, step, manifest);
            const stepStatus = cardStatus(index, currentStageIndex, taskStatus);
            if (guidedSequence && !isCurrent) {
              const completed = stepStatus === "completed";
              return (
                <div
                  key={step.id}
                  className="grid min-h-12 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-dls-surface-muted/[0.12] px-3 py-2"
                  aria-label={`${step.name}: ${completed ? "Completed" : "Next"}`}
                >
                  <span className={completed
                    ? "flex size-7 items-center justify-center rounded-full bg-green-3 text-green-10"
                    : "flex size-7 items-center justify-center rounded-full bg-dls-surface-muted/25 text-[11px] font-semibold text-dls-secondary"}
                  >
                    {completed ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold text-dls-text">{step.name}</p>
                    <p className="line-clamp-1 text-[11px] leading-4 text-dls-secondary">{step.description}</p>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-medium text-dls-secondary">
                    {completed ? "Completed" : "Next"}
                    {!completed ? <ChevronRight className="size-3" aria-hidden="true" /> : null}
                  </span>
                </div>
              );
            }
            return (
              <div key={step.id} className={guidedSequence ? "rounded-lg bg-[rgb(var(--matterhorn-desk-rgb)/0.055)] p-2" : undefined}>
                {guidedSequence ? (
                  <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--matterhorn-desk-color)]">
                      Current stage
                    </span>
                    <span className="text-[10px] font-medium text-dls-secondary">Stage {index + 1}</span>
                  </div>
                ) : null}
              <WorkflowStageCard
                title={step.name}
                objective={step.description}
                status={stepStatus}
                outputs={outputArtifactsForStep(step, manifest)}
                evidenceHints={evidenceHintForStep(step)}
                requiresExternalSigner={step.requiresExternalSigner}
                requiresCustomerConfirmation={step.requiresCustomerConfirmation}
                isCurrent={isCurrent}
                actionLabel={stageActionDisabled ? stageActionLabel : "Run in chat"}
                actionDisabled={stageActionDisabled}
                actionTitle={stageActionTitle}
                onAction={onStartStage ? () => onStartStage(step.id, rawPrompt) : undefined}
              />
              </div>
            );
          })}
        </div>
      </section>

      {requiredInputs.length || optionalInputs.length ? (
        <details className="group rounded-md bg-dls-surface-muted/15 px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-medium text-dls-secondary marker:hidden hover:text-dls-text">
            <span>Inputs and context</span>
            <span className="transition-transform group-open:rotate-90" aria-hidden="true">{">"}</span>
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {requiredInputs.length ? (
              <div>
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
              <div>
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
        </details>
      ) : null}

      {/* Expected outputs */}
      <details className="group rounded-md bg-dls-surface-muted/15 px-3 py-2.5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-semibold text-dls-text marker:hidden hover:text-dls-text">
          <span className="flex items-center gap-1.5">
          <FileOutput className="size-3.5" />
          Expected outputs
          </span>
          <span className="text-dls-secondary transition-transform group-open:rotate-90" aria-hidden="true">{">"}</span>
        </summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
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
      </details>

      {/* Next action */}
      <div className="flex items-center justify-between rounded-lg bg-dls-surface-muted/10 px-3 py-2.5">
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
              className="text-[11px] font-semibold text-[var(--matterhorn-desk-color)] bg-[rgb(var(--matterhorn-desk-rgb)/0.14)] hover:bg-[rgb(var(--matterhorn-desk-rgb)/0.22)] focus-visible:ring-[var(--matterhorn-desk-color)]"
            >
              Next action
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
