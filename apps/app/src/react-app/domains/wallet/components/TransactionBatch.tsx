/** @jsxImportSource react */
import { useState, useEffect } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type BatchStepView = {
  id: string;
  type: string;
  description: string;
  to: string;
  data?: string;
  value?: string;
  dependsOn?: string;
  /** Estimated gas for this step (optional, computed later). */
  estimatedGas?: string | null;
  /** Estimated cost in ETH for this step. */
  estimatedCostEth?: string | null;
};

export type BatchPlanView = {
  steps: BatchStepView[];
  totalEstimatedGas: string;
  totalEstimatedCostEth: string | null;
  chainId: number;
  from: string;
};

export type BatchResultView =
  | { status: "success"; stepId: string; txHash: string }
  | { status: "failed"; stepId: string; error: string };

export type BatchExecutionStateView = {
  results: BatchResultView[];
  currentStepIndex: number;
  allDone: boolean;
};

export type TransactionBatchProps = {
  plan: BatchPlanView;
  onExecute: (stepIndex: number) => Promise<string>;
  onDismiss: () => void;
};

export function TransactionBatch({
  plan,
  onExecute,
  onDismiss,
}: TransactionBatchProps) {
  const [state, setState] = useState<BatchExecutionStateView>({
    results: [],
    currentStepIndex: 0,
    allDone: false,
  });
  const [busy, setBusy] = useState(false);

  // Auto-advance to next pending step when current completes
  useEffect(() => {
    if (busy || state.allDone) return;

    const next = getNextStep(plan, state);
    if (!next) {
      setState((s) => ({ ...s, allDone: true }));
      return;
    }

    // If next step is ready (dependencies met), set current cursor
    setState((s) => ({ ...s, currentStepIndex: next.index }));
  }, [state.results.length, busy, state.allDone, plan]);

  async function handleExecuteCurrent() {
    const next = getNextStep(plan, state);
    if (!next || busy) return;

    setBusy(true);
    try {
      const txHash = await onExecute(next.index);
      addResult({ status: "success", stepId: next.step.id, txHash });
    } catch (err) {
      addResult({
        status: "failed",
        stepId: next.step.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  function addResult(result: BatchResultView) {
    setState((s) => ({
      ...s,
      results: [...s.results, result],
      currentStepIndex: s.currentStepIndex + 1,
    }));
  }

  function handleRetryFailed() {
    // Remove failed results so nextPendingStep will pick them up again
    setState((s) => ({
      ...s,
      results: s.results.filter(
        (r) => !("stepId" in r && r.status === "failed"),
      ),
      allDone: false,
    }));
  }

  const completedCount = state.results.filter(
    (r): r is BatchResultView => "status" in r,
  ).length;
  const failedCount = state.results.filter(
    (r) => "status" in r && r.status === "failed",
  ).length;

  return (
    <div className="mx-auto w-full max-w-lg rounded-lg border border-dls-border bg-dls-sidebar p-6 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10">
            <ArrowRightLeft className="size-5 text-violet-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-dls-text">
              Transaction Batch
            </h2>
            <p className="text-xs text-dls-secondary">
              Step {Math.min(completedCount + 1, plan.steps.length)} / {plan.steps.length}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text transition-colors"
          onClick={onDismiss}
        >
          <XCircle className="size-4" />
        </button>
      </div>

      {/* Summary bar */}
      <div className="mb-5 flex items-center gap-3 rounded-lg bg-dls-surface px-3 py-2.5">
        <div className="flex-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">
            Total Steps
          </div>
          <div className="font-mono text-sm text-dls-text">
            {completedCount}/{plan.steps.length} complete
            {failedCount > 0 && (
              <span className="ml-1 text-red-400">({failedCount} failed)</span>
            )}
          </div>
        </div>
        {plan.totalEstimatedCostEth && (
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dls-secondary">
              Est. Cost
            </div>
            <div className="font-mono text-sm text-dls-text">
              {Number(plan.totalEstimatedCostEth).toFixed(6)} ETH
            </div>
          </div>
        )}
      </div>

      {/* Steps list */}
      <div className="mb-6 space-y-2">
        {plan.steps.map((step, idx) => {
          const result = state.results.find(
            (r) => "stepId" in r && r.stepId === step.id,
          );
          return (
            <BatchStepCard
              key={step.id}
              index={idx + 1}
              step={step}
              result={result}
              isActive={idx === state.currentStepIndex && !state.allDone}
            />
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        {!state.allDone ? (
          <>
            <Button
              variant="outline"
              className="flex-1 gap-1.5 h-11"
              onClick={onDismiss}
              disabled={busy}
            >
              Cancel Remaining
            </Button>
            <Button
              className="flex-1 gap-1.5 h-11 bg-violet-500 hover:bg-violet-600 text-white shadow-lg shadow-violet-500/20"
              disabled={busy || getNextStep(plan, state) === null}
              onClick={handleExecuteCurrent}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ChevronRight className="size-4" />
              )}
              {busy
                ? "Submitting..."
                : `Execute Step ${getNextStep(plan, state)?.index ?? 0 + 1}`}
            </Button>
          </>
        ) : (
          <>
            {failedCount > 0 && (
              <Button
                variant="outline"
                className="flex-1 gap-1.5 h-11"
                onClick={handleRetryFailed}
              >
                <RotateCcw className="size-4" />
                Retry Failed
              </Button>
            )}
            <Button
              className="flex-1 gap-1.5 h-11 bg-violet-500 hover:bg-violet-600 text-white shadow-lg shadow-violet-500/20"
              onClick={onDismiss}
            >
              <CheckCircle2 className="size-4" />
              Done
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function BatchStepCard({
  index,
  step,
  result,
  isActive,
}: {
  index: number;
  step: BatchPlanView["steps"][number];
  result: BatchResultView | undefined;
  isActive: boolean;
}) {
  const isSuccess = result && "status" in result && result.status === "success";
  const isFailed = result && "status" in result && result.status === "failed";
  const isPending = !result;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        isActive
          ? "border-violet-500/40 bg-violet-500/5"
          : "border-transparent bg-dls-surface",
        isSuccess && "border-green-500/30 bg-green-500/5",
        isFailed && "border-red-500/30 bg-red-500/5",
      )}
    >
      <div className="flex items-center gap-3">
        {/* Status icon */}
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            isSuccess
              ? "bg-green-500/20 text-green-400"
              : isFailed
                ? "bg-red-500/20 text-red-400"
                : isActive
                  ? "bg-violet-500/20 text-violet-400"
                  : "bg-dls-hover text-dls-secondary",
          )}
        >
          {isSuccess ? (
            <CheckCircle2 className="size-4" />
          ) : isFailed ? (
            <XCircle className="size-4" />
          ) : (
            index
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-dls-text truncate">
            {step.description}
          </div>
          <div className="flex items-center gap-2 text-xs text-dls-secondary">
            <span className="capitalize">{step.type}</span>
            {step.dependsOn && (
              <span className="text-dls-muted">→ after {step.dependsOn}</span>
            )}
          </div>
        </div>

        {/* Right */}
        {isActive && (
          <Loader2 className="size-4 animate-spin text-violet-500" />
        )}
      </div>

      {/* Error detail */}
      {isFailed && "error" in result && result.error && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          {result.error}
        </div>
      )}

      {/* Tx hash */}
      {isSuccess && "txHash" in result && result.txHash && (
        <div className="mt-2 font-mono text-xs text-green-400 truncate">
          {result.txHash}
        </div>
      )}
    </div>
  );
}

function getNextStep(
  plan: BatchPlanView,
  state: BatchExecutionStateView,
): { step: BatchPlanView["steps"][number]; index: number } | null {
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const already = state.results.find(
      (r: BatchResultView) => "stepId" in r && r.stepId === step.id,
    );
    if (already) continue;

    if (step.dependsOn) {
      const dep = state.results.find(
        (r: BatchResultView) => "stepId" in r && r.stepId === step.dependsOn,
      );
      if (!dep) return null;
      if (dep.status === "failed") {
        // Auto-mark as failed
        continue;
      }
    }
    return { step, index: i };
  }
  return null;
}
