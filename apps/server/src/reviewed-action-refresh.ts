import type {
  ReviewedActionAirlockIssue,
  ReviewedActionDraftHandoff,
  ReviewedActionHandoffV2,
  ReviewedActionValidationResponse,
} from "@matterhorn-work/types/reviewed-actions";
import {
  isReviewedActionDraftHandoff,
  isReviewedActionHandoffV2,
} from "@matterhorn-work/types/reviewed-actions";
import {
  REVIEWED_ACTION_MAX_SIMULATION_AGE_MS,
  buildReviewedActionHandoffV2,
  validateReviewedActionHandoffV2,
} from "./reviewed-action-airlock.js";

export type ReviewedActionRefreshEvidence = {
  reference: string;
  block?: string | null;
  observedAt?: Date;
  materialChangeReasons?: string[];
};

export type ReviewedActionRefreshAdapter = (input: {
  handoff: ReviewedActionHandoffV2;
  currentDraft: ReviewedActionDraftHandoff;
}) => Promise<ReviewedActionRefreshEvidence>;

const RECOVERABLE_BY_REFRESH = new Set<ReviewedActionAirlockIssue>(["simulation_stale"]);

/**
 * Revalidates an existing review against current protocol state. Static
 * tampering, expiry and user-edited terms fail before a network call. A
 * successful refresh returns a newly hash-bound v2 handoff; callers must use
 * that handoff for wallet signing and receipt reconciliation.
 */
export async function refreshReviewedActionHandoffV2(input: {
  handoff: ReviewedActionHandoffV2;
  currentDraft: ReviewedActionDraftHandoff;
  refresh: ReviewedActionRefreshAdapter;
  now?: Date;
  maximumAgeMs?: number;
}): Promise<ReviewedActionValidationResponse> {
  const now = input.now ?? new Date();
  const maximumAgeMs = Math.max(1, input.maximumAgeMs ?? REVIEWED_ACTION_MAX_SIMULATION_AGE_MS);
  const unavailableFreshness = {
    status: "unavailable" as const,
    observedAt: now.toISOString(),
    maximumAgeMs,
  };
  if (!isReviewedActionHandoffV2(input.handoff) || !isReviewedActionDraftHandoff(input.currentDraft)) {
    return {
      success: true,
      valid: false,
      issues: ["invalid"],
      validatedAt: now.toISOString(),
      requiresRegeneration: true,
      refreshedHandoff: null,
      refreshedSimulation: null,
      freshness: unavailableFreshness,
      invalidationReasons: ["The reviewed action payload is invalid."],
    };
  }
  if (input.handoff.protocol !== input.currentDraft.protocol) {
    return {
      success: true,
      valid: false,
      issues: ["protocol_mismatch"],
      validatedAt: now.toISOString(),
      requiresRegeneration: true,
      refreshedHandoff: null,
      refreshedSimulation: null,
      freshness: unavailableFreshness,
      invalidationReasons: ["The wallet draft protocol differs from the reviewed action."],
    };
  }

  const staticIssues = validateReviewedActionHandoffV2({
    handoff: input.handoff,
    currentDraft: input.currentDraft,
    now,
    maxSimulationAgeMs: maximumAgeMs,
  });
  const blockingIssues = staticIssues.filter((issue) => !RECOVERABLE_BY_REFRESH.has(issue));
  if (blockingIssues.length > 0) {
    return {
      success: true,
      valid: false,
      issues: blockingIssues,
      validatedAt: now.toISOString(),
      requiresRegeneration: true,
      refreshedHandoff: null,
      refreshedSimulation: null,
      freshness: unavailableFreshness,
      invalidationReasons: blockingIssues.map((issue) => `Static wallet review check failed: ${issue}.`),
    };
  }

  try {
    const evidence = await input.refresh({ handoff: input.handoff, currentDraft: input.currentDraft });
    const reference = evidence.reference.trim();
    if (!reference) throw new Error("Protocol refresh returned no simulation reference.");
    const materialChangeReasons = (evidence.materialChangeReasons ?? []).map((reason) => reason.trim()).filter(Boolean);
    if (materialChangeReasons.length > 0) {
      return {
        success: true,
        valid: false,
        issues: ["simulation_state_changed"],
        validatedAt: now.toISOString(),
        requiresRegeneration: true,
        refreshedHandoff: null,
        refreshedSimulation: null,
        freshness: {
          status: "fresh",
          observedAt: (evidence.observedAt ?? now).toISOString(),
          maximumAgeMs,
        },
        invalidationReasons: materialChangeReasons,
      };
    }
    const observedAt = evidence.observedAt ?? now;
    const refreshedHandoff = buildReviewedActionHandoffV2({
      handoff: input.currentDraft,
      runId: input.handoff.runId,
      signer: input.handoff.signer,
      simulation: {
        reference,
        block: evidence.block ?? null,
        simulatedAt: observedAt,
      },
      preparedAt: observedAt,
      expiresAt: new Date(observedAt.getTime() + 5 * 60_000),
      policy: { refreshedFromIntentHash: input.handoff.intentHash },
    });
    return {
      success: true,
      valid: true,
      issues: [],
      validatedAt: now.toISOString(),
      requiresRegeneration: false,
      refreshedHandoff,
      refreshedSimulation: refreshedHandoff.simulation,
      freshness: { status: "fresh", observedAt: observedAt.toISOString(), maximumAgeMs },
      invalidationReasons: [],
    };
  } catch (error) {
    return {
      success: true,
      valid: false,
      issues: ["simulation_refresh_failed"],
      validatedAt: now.toISOString(),
      requiresRegeneration: true,
      refreshedHandoff: null,
      refreshedSimulation: null,
      freshness: unavailableFreshness,
      invalidationReasons: [
        error instanceof Error && error.message.trim()
          ? error.message.trim().slice(0, 500)
          : "Matterhorn could not refresh current protocol state.",
      ],
    };
  }
}
