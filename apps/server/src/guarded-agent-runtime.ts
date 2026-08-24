import { randomUUID } from "node:crypto";
import type {
  MatterhornAgentPrivacyMode,
  MatterhornAgentPrivacyPart,
  MatterhornAgentPrivacyPreflightResponse,
  MatterhornAgentRunReceipt,
} from "@matterhorn-work/types/guarded-agent-runtime";
import type { MatterhornExecutionMode } from "@matterhorn-work/types/execution-mode";
import type { ManagedMcpToolCallMetric } from "./managed-opencode-mcp.js";
import type { GuardedRuntimeObservationMetric } from "./operational-metrics.js";
import {
  MATTERHORN_CAPABILITY_CALL_ARGUMENT,
  MatterhornAgentCapabilityBroker,
  capabilityArgsHash,
  guardedCapabilityEnforcementActive,
  stripCapabilityArgument,
} from "./agent-capability.js";
import { MatterhornPrivacyFirewall } from "./agent-privacy.js";
import { MatterhornAgentRunReceiptStore } from "./agent-run-receipts.js";
import { equalDigest, sha256 } from "./guarded-runtime-crypto.js";

export class GuardedRuntimeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export type GuardedPromptInput = {
  workspaceId: string;
  sessionId: string;
  parts: MatterhornAgentPrivacyPart[];
  providerId: string;
  providerName?: string;
  modelId: string;
  agentId?: string;
  attachmentIds?: string[];
  memoryIds?: string[];
  privacyMode?: MatterhornAgentPrivacyMode;
  privacyConsentToken?: string;
  executionMode: MatterhornExecutionMode;
  requestToolProfiles?: readonly Record<string, boolean>[];
};

export type GuardedPromptAcceptance = {
  runId: string;
  preflight: MatterhornAgentPrivacyPreflightResponse;
  consentUsed: boolean;
};

const GUARDED_OBSERVATION_REASONS = new Set([
  "capability_agent_mismatch",
  "capability_argument_mutation",
  "capability_call_reissued",
  "capability_expired",
  "capability_invalid_signature",
  "capability_prepare_budget_exhausted",
  "capability_prepare_family_already_completed",
  "capability_prepare_family_resolution_required",
  "capability_prepare_requires_work_mode",
  "capability_read_budget_exhausted",
  "capability_replayed",
  "capability_run_or_tool_not_found",
  "capability_scope_mismatch",
  "capability_signing_secret_missing",
  "capability_tool_not_in_run_grant",
  "capability_wrong_desk",
  "capability_wrong_tool",
  "missing_call_id",
  "policy_allowed",
  "rollout_not_enforced",
  "unknown_or_replayed_call_id",
]);

function guardedObservationReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return GUARDED_OBSERVATION_REASONS.has(message) ? message : "capability_denied";
}

export class MatterhornGuardedAgentRuntime {
  readonly privacy = new MatterhornPrivacyFirewall();
  readonly capabilities = new MatterhornAgentCapabilityBroker();
  readonly receipts = new MatterhornAgentRunReceiptStore();
  private readonly stagedCapabilities = new Map<string, { token: string; expiresAtMs: number; runId: string }>();
  private readonly rolloutBypassCallIds = new Map<string, {
    expiresAtMs: number;
    reason: string;
    runId: string | null;
    toolName: string;
    argsHash: string;
  }>();
  private readonly observations = new Map<string, GuardedRuntimeObservationMetric>();
  private readonly userMessageRunIds = new Map<string, { runId: string; sessionId: string }>();
  private readonly assistantMessageRunIds = new Map<string, { runId: string; sessionId: string }>();

  ready(): boolean {
    return this.capabilities.ready();
  }

  preflight(input: Omit<GuardedPromptInput, "executionMode" | "requestToolProfiles" | "privacyConsentToken">): MatterhornAgentPrivacyPreflightResponse {
    return this.privacy.preflight(input).response;
  }

  confirmConsent(input: {
    challengeId: string;
    requestHash: string;
    workspaceId: string;
    sessionId: string;
  }) {
    try {
      return this.privacy.confirm(input);
    } catch {
      throw new GuardedRuntimeError(
        409,
        "privacy_consent_challenge_invalid",
        "This privacy consent request expired or no longer matches the exact prompt. Run privacy preflight again.",
      );
    }
  }

  async acceptPrompt(input: GuardedPromptInput): Promise<GuardedPromptAcceptance> {
    const evaluation = this.privacy.preflight(input);
    let consentUsed = false;
    if (evaluation.response.decision === "blocked") {
      throw new GuardedRuntimeError(
        422,
        "agent_privacy_blocked",
        evaluation.response.reason,
        evaluation.response,
      );
    }
    if (evaluation.response.decision === "consent_required") {
      const token = input.privacyConsentToken?.trim() ?? "";
      consentUsed = Boolean(token) && this.privacy.consumeConsent({
        token,
        requestHash: evaluation.response.requestHash,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
      });
      if (!consentUsed) {
        throw new GuardedRuntimeError(
          409,
          "agent_privacy_consent_required",
          evaluation.response.reason,
          evaluation.response,
        );
      }
    }

    // Privacy is an account-facing dispatch boundary, not a guarded-tool
    // rollout flag. `off` disables capability grants and receipts only; it
    // must never disable secret blocking or exact-request consent.
    if (this.capabilities.mode === "off") {
      return {
        runId: `agent_run_off_${randomUUID()}`,
        preflight: evaluation.response,
        consentUsed,
      };
    }

    const previousRunId = this.capabilities.activeRun(input.sessionId);
    if (previousRunId) await this.finishRun(previousRunId, "cancelled");
    const runId = `agent_run_${randomUUID()}`;
    this.capabilities.createRunGrant({
      runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      agentId: input.agentId,
      executionMode: input.executionMode,
      requestToolProfiles: input.requestToolProfiles,
    });
    await this.receipts.start({
      runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      preflight: evaluation.response,
      consentUsed,
      memoryReadIds: input.memoryIds,
    });
    return { runId, preflight: evaluation.response, consentUsed };
  }

  bindUserMessage(input: { runId: string; sessionId: string; messageId: string }): void {
    if (this.capabilities.mode === "off") return;
    const activeRunId = this.capabilities.activeRun(input.sessionId);
    if (activeRunId !== input.runId) {
      throw new GuardedRuntimeError(409, "agent_run_not_active", "The message no longer belongs to the active guarded run.");
    }
    this.userMessageRunIds.set(input.messageId, { runId: input.runId, sessionId: input.sessionId });
  }

  bindRuntimeMessage(input: {
    runtimeSecret: string;
    sessionId: string;
    userMessageId: string;
    assistantMessageId: string;
  }): { runId: string } {
    this.assertRuntimeSecret(input.runtimeSecret);
    const bound = this.userMessageRunIds.get(input.userMessageId);
    if (!bound || bound.sessionId !== input.sessionId) {
      throw new GuardedRuntimeError(409, "agent_run_message_not_bound", "The assistant message is not bound to an accepted Matterhorn run.");
    }
    this.assistantMessageRunIds.set(input.assistantMessageId, bound);
    return { runId: bound.runId };
  }

  stageRuntimeTool(input: {
    runtimeSecret: string;
    runId: string;
    workspaceId: string;
    sessionId: string;
    callId: string;
    agentId?: string;
    toolName: string;
    args: Record<string, unknown>;
  }): { accepted: true; callId: string; expiresAt: string } {
    this.assertRuntimeSecret(input.runtimeSecret);
    this.cleanupStagedCapabilities();
    const runId = input.runId.trim();
    const toolName = input.toolName.replace(/^matterhorn-work_/, "").trim();
    const argsHash = capabilityArgsHash(input.args);
    if (this.capabilities.mode === "enforce" && !guardedCapabilityEnforcementActive({
      toolName: input.toolName,
      agentId: input.agentId,
    })) {
      const expiresAtMs = Date.now() + 60_000;
      this.rolloutBypassCallIds.set(input.callId, {
        expiresAtMs,
        reason: "rollout_not_enforced",
        runId,
        toolName,
        argsHash,
      });
      this.observe("issue", "bypassed", "rollout_not_enforced");
      return { accepted: true, callId: input.callId, expiresAt: new Date(expiresAtMs).toISOString() };
    }
    try {
      const capability = this.capabilities.issue(input);
      const expiresAtMs = Date.parse(capability.claims.expiresAt);
      this.stagedCapabilities.set(capability.claims.callId, {
        token: capability.token,
        expiresAtMs,
        runId: capability.claims.runId,
      });
      this.observe("issue", this.capabilities.mode === "shadow" ? "would_allow" : "allowed", "policy_allowed");
      return { accepted: true, callId: capability.claims.callId, expiresAt: capability.claims.expiresAt };
    } catch (error) {
      const reason = guardedObservationReason(error);
      if (this.capabilities.mode === "shadow") {
        const expiresAtMs = Date.now() + 60_000;
        this.rolloutBypassCallIds.set(input.callId, {
          expiresAtMs,
          reason,
          runId,
          toolName,
          argsHash,
        });
        this.observe("issue", "would_deny", reason);
        return { accepted: true, callId: input.callId, expiresAt: new Date(expiresAtMs).toISOString() };
      }
      this.observe("issue", "denied", reason);
      throw error;
    }
  }

  authorizeMcpTool(input: {
    toolName: string;
    args: Record<string, unknown>;
  }): { args: Record<string, unknown>; runId: string | null; callId: string | null; workspaceId: string | null } {
    this.cleanupStagedCapabilities();
    const callIdValue = input.args[MATTERHORN_CAPABILITY_CALL_ARGUMENT];
    const callId = typeof callIdValue === "string" ? callIdValue.trim() : "";
    const args = stripCapabilityArgument(input.args);
    if (this.capabilities.mode === "off") return { args, runId: null, callId: null, workspaceId: null };
    const bypass = callId ? this.rolloutBypassCallIds.get(callId) : undefined;
    if (callId && bypass) {
      this.rolloutBypassCallIds.delete(callId);
      const exactTool = input.toolName.replace(/^matterhorn-work_/, "").trim() === bypass.toolName;
      const exactArgs = equalDigest(capabilityArgsHash(args), bypass.argsHash);
      if (!exactTool || !exactArgs) {
        this.observe("consume", this.capabilities.mode === "shadow" ? "would_deny" : "denied", "capability_argument_mutation");
        if (this.capabilities.mode === "enforce") {
          throw new GuardedRuntimeError(
            403,
            "agent_capability_denied",
            "Matterhorn rejected a staged rollout call that no longer matches its exact tool and arguments.",
          );
        }
        return { args, runId: null, callId: null, workspaceId: null };
      }
      this.observe("consume", "bypassed", bypass.reason);
      return { args, runId: null, callId: null, workspaceId: null };
    }
    if (this.capabilities.mode === "enforce" && !callId && !guardedCapabilityEnforcementActive({
      toolName: input.toolName,
    })) {
      this.observe("consume", "bypassed", "rollout_not_enforced");
      return { args, runId: null, callId: null, workspaceId: null };
    }
    if (!callId && this.capabilities.mode === "shadow") {
      this.observe("consume", "would_deny", "missing_call_id");
      return { args, runId: null, callId: null, workspaceId: null };
    }
    if (!callId) {
      this.observe("consume", "denied", "missing_call_id");
      throw new GuardedRuntimeError(403, "agent_capability_required", "This crypto tool call did not include a Matterhorn run capability.");
    }
    const staged = this.stagedCapabilities.get(callId);
    this.stagedCapabilities.delete(callId);
    if (!staged) {
      if (this.capabilities.mode === "shadow") {
        this.observe("consume", "would_deny", "unknown_or_replayed_call_id");
        return { args, runId: null, callId: null, workspaceId: null };
      }
      this.observe("consume", "denied", "unknown_or_replayed_call_id");
      throw new GuardedRuntimeError(403, "agent_capability_denied", "Matterhorn rejected an unknown, expired, or replayed tool call.");
    }
    try {
      const claims = this.capabilities.consume({ token: staged.token, toolName: input.toolName, args });
      this.observe("consume", this.capabilities.mode === "shadow" ? "would_allow" : "allowed", "policy_allowed");
      return { args, runId: claims.runId, callId: claims.callId, workspaceId: claims.workspaceId };
    } catch (error) {
      const reason = guardedObservationReason(error);
      if (this.capabilities.mode === "shadow") {
        this.observe("consume", "would_deny", reason);
        return { args, runId: null, callId: null, workspaceId: null };
      }
      this.observe("consume", "denied", reason);
      throw new GuardedRuntimeError(
        403,
        "agent_capability_denied",
        error instanceof Error ? error.message : "Matterhorn rejected the crypto tool capability.",
      );
    }
  }

  async recordMcpTool(input: {
    runId: string | null;
    callId: string | null;
    metric: ManagedMcpToolCallMetric;
    source?: string | null;
    freshness?: string | null;
  }): Promise<void> {
    if (!input.runId) return;
    if (!input.callId) throw new GuardedRuntimeError(409, "agent_tool_outcome_not_bound", "The tool result is missing its exact guarded call binding.");
    this.capabilities.recordToolOutcome(
      input.runId,
      input.callId,
      input.metric.tool,
      input.metric.outcome,
      input.metric.reviewedAction?.protocol,
    );
    await this.receipts.recordTool({
      runId: input.runId,
      tool: {
        name: input.metric.tool,
        access: input.metric.access === "prepare" ? "prepare" : "read",
        outcome: input.metric.outcome,
        latencyMs: input.metric.durationMs,
        source: input.source ?? input.metric.source ?? null,
        freshness: input.freshness ?? input.metric.freshness ?? null,
        trust: "untrusted_external",
      },
      capabilityDecisions: this.capabilities.decisionsForRun(input.runId),
    });
    if (input.metric.reviewedAction) {
      await this.receipts.addReviewedAction({
        runId: input.runId,
        intentHash: input.metric.reviewedAction.intentHash,
        policyHash: input.metric.reviewedAction.policyHash,
        simulationReference: input.metric.reviewedAction.simulation.reference,
      });
    }
  }

  async completeRun(input: {
    runtimeSecret: string;
    runId: string;
    status: Exclude<MatterhornAgentRunReceipt["status"], "pending">;
    usage?: Partial<Omit<MatterhornAgentRunReceipt["usage"], "toolCallBudget">>;
  }): Promise<void> {
    this.assertRuntimeSecret(input.runtimeSecret);
    await this.finishRun(input.runId, input.status, input.usage);
  }

  async failRun(runId: string, status: "cancelled" | "error" = "error"): Promise<void> {
    await this.finishRun(runId, status);
  }

  runtimeSecretFingerprint(): string | null {
    const secret = process.env.MATTERHORN_AGENT_RUNTIME_SECRET?.trim();
    return secret ? sha256(secret).slice(0, 12) : null;
  }

  observationSnapshot(): GuardedRuntimeObservationMetric[] {
    return [...this.observations.values()].map((observation) => ({ ...observation }));
  }

  purgeWorkspace(workspaceId: string) {
    const privacy = this.privacy.purgeWorkspace(workspaceId);
    const capabilities = this.capabilities.purgeWorkspace(workspaceId);
    for (const callId of capabilities.callIds) this.stagedCapabilities.delete(callId);
    for (const [messageId, bound] of this.userMessageRunIds) {
      if (bound.runId && capabilities.runIds.includes(bound.runId)) this.userMessageRunIds.delete(messageId);
    }
    for (const [messageId, bound] of this.assistantMessageRunIds) {
      if (bound.runId && capabilities.runIds.includes(bound.runId)) this.assistantMessageRunIds.delete(messageId);
    }
    return {
      privacy,
      capabilities: {
        runs: capabilities.runIds.length,
        consumed: capabilities.consumed,
      },
    };
  }

  private assertRuntimeSecret(supplied: string): void {
    const expected = process.env.MATTERHORN_AGENT_RUNTIME_SECRET?.trim() ?? "";
    if (expected.length < 32 || !supplied || !equalDigest(sha256(expected), sha256(supplied))) {
      throw new GuardedRuntimeError(401, "agent_runtime_unauthorized", "The guarded runtime credential is missing or invalid.");
    }
  }

  private cleanupStagedCapabilities(nowMs = Date.now()): void {
    for (const [callId, staged] of this.stagedCapabilities) {
      if (staged.expiresAtMs <= nowMs) this.stagedCapabilities.delete(callId);
    }
    for (const [callId, bypass] of this.rolloutBypassCallIds) {
      if (bypass.expiresAtMs <= nowMs) this.rolloutBypassCallIds.delete(callId);
    }
  }

  private revokeRun(runId: string): void {
    this.capabilities.closeRun(runId);
    for (const [callId, staged] of this.stagedCapabilities) {
      if (staged.runId === runId) this.stagedCapabilities.delete(callId);
    }
    for (const [callId, bypass] of this.rolloutBypassCallIds) {
      if (bypass.runId === runId) this.rolloutBypassCallIds.delete(callId);
    }
    for (const [messageId, bound] of this.userMessageRunIds) {
      if (bound.runId === runId) this.userMessageRunIds.delete(messageId);
    }
    for (const [messageId, bound] of this.assistantMessageRunIds) {
      if (bound.runId === runId) this.assistantMessageRunIds.delete(messageId);
    }
  }

  private async finishRun(
    runId: string,
    status: Exclude<MatterhornAgentRunReceipt["status"], "pending">,
    usage?: Partial<Omit<MatterhornAgentRunReceipt["usage"], "toolCallBudget">>,
  ): Promise<void> {
    const capabilityDecisions = this.capabilities.decisionsForRun(runId);
    try {
      await this.receipts.complete({ runId, status, usage, capabilityDecisions });
    } finally {
      this.revokeRun(runId);
    }
  }

  private observe(
    stage: GuardedRuntimeObservationMetric["stage"],
    decision: GuardedRuntimeObservationMetric["decision"],
    reason: string,
  ): void {
    if (this.capabilities.mode === "off") return;
    const mode = this.capabilities.mode;
    const boundedReason = GUARDED_OBSERVATION_REASONS.has(reason) ? reason : "capability_denied";
    const key = `${mode}\u0000${stage}\u0000${decision}\u0000${boundedReason}`;
    const current = this.observations.get(key);
    if (current) current.count += 1;
    else this.observations.set(key, { mode, stage, decision, reason: boundedReason, count: 1 });
  }
}
