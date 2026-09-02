import type {
  MatterhornCoworkerProfile,
  MatterhornCryptoAppResult,
  MatterhornCryptoIntent,
  MatterhornPolicyDecision,
} from "@matterhorn-work/types/crypto-coworkers";
import type { ReviewedActionHandoffV2 } from "@matterhorn-work/types/reviewed-actions";

import type { MatterhornAgentCapabilityBroker } from "./agent-capability.js";
import type {
  MatterhornCryptoAppAdapterRequest,
  MatterhornCryptoAppAdapterRouter,
} from "./crypto-app-adapter-router.js";
import type {
  MatterhornPendingCryptoIntent,
  MatterhornPendingCryptoIntentStore,
} from "./crypto-pending-intent-store.js";
import {
  compileCertifiedCryptoIntent,
  cryptoIntentToReviewedActionHandoffV2,
} from "./crypto-transaction-coordinator.js";
import {
  coworkerTransactionPolicyLayer,
  evaluateMatterhornCryptoIntentPolicy,
  evaluateMatterhornPreparePolicyPreflight,
  resolveMatterhornTransactionPolicy,
  type MatterhornResolvedTransactionPolicy,
  type MatterhornTransactionEconomicFacts,
  type MatterhornTransactionPolicyLayers,
} from "./crypto-transaction-policy.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import { firstPartyCryptoAppProxyTool } from "./first-party-crypto-apps.js";

type NonCoworkerPolicyLayers = Omit<MatterhornTransactionPolicyLayers, "coworker">;

export type MatterhornCryptoTransactionRequest = MatterhornCryptoAppAdapterRequest & {
  appId: string;
  organizationId: string | null;
  ownerId: string;
  coworker: MatterhornCoworkerProfile;
  policyLayers: NonCoworkerPolicyLayers;
};

export type MatterhornCryptoTransactionResult = {
  adapterResult: MatterhornCryptoAppResult;
  intent: MatterhornCryptoIntent;
  policyDecision: MatterhornPolicyDecision;
  reviewedAction: ReviewedActionHandoffV2 | null;
  pendingIntent: MatterhornPendingCryptoIntent | null;
};

type TrustedFactsResolver = (input: {
  request: MatterhornCryptoTransactionRequest;
  adapterResult: MatterhornCryptoAppResult;
  intent: MatterhornCryptoIntent;
  policy: MatterhornResolvedTransactionPolicy;
}) => Promise<MatterhornTransactionEconomicFacts>;

type Options = {
  router: Pick<MatterhornCryptoAppAdapterRouter, "execute">;
  capabilities: MatterhornAgentCapabilityBroker;
  pendingIntents: Pick<MatterhornPendingCryptoIntentStore, "create" | "get" | "transition">;
  recordReviewedAction: (input: {
    runId: string;
    intentHash: string;
    policyHash: string;
    simulationReference: string;
  }) => Promise<void>;
  resolveTrustedFacts: TrustedFactsResolver;
  now?: () => Date;
};

export class MatterhornCryptoTransactionError extends Error {
  constructor(
    public readonly code:
      | "transaction_context_invalid"
      | "transaction_regeneration_invalid"
      | "transaction_regeneration_denied"
      | "transaction_policy_preflight_denied"
      | "transaction_proxy_tool_unavailable"
      | "transaction_capability_proof_missing"
      | "transaction_receipt_record_failed",
    public readonly reasonCodes: string[] = [],
  ) {
    super(code);
    this.name = "MatterhornCryptoTransactionError";
  }
}

function canonicalArguments(argumentsValue: Record<string, unknown>): Record<string, unknown> {
  const parsed: unknown = JSON.parse(canonicalJson(argumentsValue));
  if (!isRecord(parsed)) {
    throw new MatterhornCryptoTransactionError("transaction_context_invalid");
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class MatterhornCryptoTransactionService {
  readonly #router: Options["router"];
  readonly #capabilities: MatterhornAgentCapabilityBroker;
  readonly #pendingIntents: Options["pendingIntents"];
  readonly #recordReviewedAction: Options["recordReviewedAction"];
  readonly #resolveTrustedFacts: TrustedFactsResolver;
  readonly #now: () => Date;

  constructor(options: Options) {
    this.#router = options.router;
    this.#capabilities = options.capabilities;
    this.#pendingIntents = options.pendingIntents;
    this.#recordReviewedAction = options.recordReviewedAction;
    this.#resolveTrustedFacts = options.resolveTrustedFacts;
    this.#now = options.now ?? (() => new Date());
  }

  async prepare(
    request: MatterhornCryptoTransactionRequest,
    lineage: { previousIntentHash?: string | null } = {},
  ): Promise<MatterhornCryptoTransactionResult> {
    if (request.coworker.workspaceId !== request.workspaceId
      || request.coworker.ownerId !== request.ownerId
      || request.policyLayers.platform.subjectId !== "matterhorn"
      || request.policyLayers.user.subjectId !== request.ownerId
      || request.policyLayers.app.subjectId !== request.appId
      || request.policyLayers.run.subjectId !== request.runId
      || request.policyLayers.capability.subjectId !== request.callId
      || (request.organizationId === null) !== (request.policyLayers.organization === null)
      || (request.organizationId !== null
        && request.policyLayers.organization?.subjectId !== request.organizationId)) {
      throw new MatterhornCryptoTransactionError("transaction_context_invalid");
    }
    const policy = resolveMatterhornTransactionPolicy({
      ...request.policyLayers,
      coworker: coworkerTransactionPolicyLayer(request.coworker),
    }, this.#now());
    const preflight = evaluateMatterhornPreparePolicyPreflight({
      policy,
      appId: request.appId,
      actionId: request.actionId,
      network: request.network,
      now: this.#now(),
    });
    if (!preflight.allowed) {
      throw new MatterhornCryptoTransactionError("transaction_policy_preflight_denied", preflight.reasonCodes);
    }
    const exactArguments = canonicalArguments(request.arguments);
    const adapterResult = await this.#router.execute({
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
      runId: request.runId,
      callId: request.callId,
      connectionId: request.connectionId,
      actionId: request.actionId,
      network: request.network,
      arguments: exactArguments,
    });
    if (adapterResult.app.id !== request.appId
      || adapterResult.app.connectionId !== request.connectionId
      || adapterResult.action.id !== request.actionId
      || adapterResult.action.network !== request.network
      || (adapterResult.action.access !== "prepare" && adapterResult.action.access !== "simulate")) {
      throw new MatterhornCryptoTransactionError("transaction_context_invalid");
    }
    const intent = compileCertifiedCryptoIntent({
      workspaceId: request.workspaceId,
      runId: request.runId,
      coworkerId: request.coworker.id,
      policyHash: policy.policyHash,
      canonicalRequestArguments: exactArguments,
      result: adapterResult,
      now: this.#now(),
    });
    const proxyToolName = firstPartyCryptoAppProxyTool(adapterResult.app.id, adapterResult.action.id);
    if (!proxyToolName) throw new MatterhornCryptoTransactionError("transaction_proxy_tool_unavailable");
    const capabilityArgs = {
      appId: adapterResult.app.id,
      manifestRevision: adapterResult.app.manifestRevision,
      connectionId: adapterResult.app.connectionId,
      actionId: adapterResult.action.id,
      access: adapterResult.action.access,
      network: adapterResult.action.network,
      canonicalArgumentsHash: sha256(exactArguments),
    };
    const proof = this.#capabilities.consumedCapabilityProof({
      runId: request.runId,
      workspaceId: request.workspaceId,
      sessionId: request.sessionId,
      callId: request.callId,
      coworkerId: request.coworker.id,
      connectionId: adapterResult.app.connectionId,
      appId: adapterResult.app.id,
      manifestRevision: adapterResult.app.manifestRevision,
      actionId: adapterResult.action.id,
      network: adapterResult.action.network,
      toolName: proxyToolName,
      args: capabilityArgs,
    });
    if (!proof || proof.access !== "prepare") {
      throw new MatterhornCryptoTransactionError("transaction_capability_proof_missing");
    }
    const economicFacts = await this.#resolveTrustedFacts({ request, adapterResult, intent, policy });
    const policyDecision = evaluateMatterhornCryptoIntentPolicy({
      intent,
      policy,
      facts: {
        ...economicFacts,
        workspaceId: request.workspaceId,
        runId: request.runId,
        coworkerId: request.coworker.id,
        capability: {
          workspaceId: request.workspaceId,
          runId: request.runId,
          coworkerId: request.coworker.id,
          appId: adapterResult.app.id,
          actionId: adapterResult.action.id,
          access: "prepare",
          useState: "consumed_once",
          expiresAt: proof.expiresAt,
        },
      },
      now: this.#now(),
    });
    const reviewedAction = policyDecision.decision === "wallet_review_required"
      ? cryptoIntentToReviewedActionHandoffV2(intent, policyDecision)
      : null;
    let pendingIntent = reviewedAction
      ? this.#pendingIntents.create({
          workspaceId: request.workspaceId,
          sessionId: request.sessionId,
          ownerId: request.ownerId,
          coworkerId: request.coworker.id,
          intent,
          policyDecision,
          reviewedAction,
          previousIntentHash: lineage.previousIntentHash ?? null,
        })
      : null;
    if (reviewedAction && pendingIntent) {
      try {
        await this.#recordReviewedAction({
          runId: reviewedAction.runId,
          intentHash: reviewedAction.intentHash,
          policyHash: reviewedAction.policyHash,
          simulationReference: reviewedAction.simulation.reference,
        });
      } catch {
        try {
          pendingIntent = this.#pendingIntents.transition({
            workspaceId: request.workspaceId,
            ownerId: request.ownerId,
            coworkerId: request.coworker.id,
            id: pendingIntent.id,
            expectedRevision: pendingIntent.revision,
            nextState: "cancelled",
          });
        } catch {
          // A concurrent cancellation or expiry is already fail-closed.
        }
        throw new MatterhornCryptoTransactionError("transaction_receipt_record_failed");
      }
    }
    return {
      adapterResult,
      intent,
      policyDecision,
      reviewedAction,
      pendingIntent,
    };
  }

  async regenerate(input: {
    workspaceId: string;
    ownerId: string;
    coworkerId: string;
    pendingIntentId: string;
    expectedRevision: number;
    request: MatterhornCryptoTransactionRequest;
  }): Promise<{
    result: MatterhornCryptoTransactionResult;
    supersededIntent: MatterhornPendingCryptoIntent;
  }> {
    const current = this.#pendingIntents.get(
      input.workspaceId,
      input.ownerId,
      input.coworkerId,
      input.pendingIntentId,
    );
    const exactArguments = canonicalArguments(input.request.arguments);
    if (!current
      || current.state !== "wallet_review"
      || current.revision !== input.expectedRevision
      || input.request.workspaceId !== input.workspaceId
      || input.request.ownerId !== input.ownerId
      || input.request.coworker.id !== input.coworkerId
      || input.request.sessionId !== current.sessionId
      || input.request.runId === current.intent.runId
      || input.request.appId !== current.intent.appId
      || input.request.connectionId !== current.intent.connectionId
      || input.request.actionId !== current.intent.actionId
      || input.request.network !== current.intent.network
      || sha256(exactArguments) !== current.intent.authorizedArgumentsHash) {
      throw new MatterhornCryptoTransactionError("transaction_regeneration_invalid");
    }
    const refreshing = this.#pendingIntents.transition({
      workspaceId: input.workspaceId,
      ownerId: input.ownerId,
      coworkerId: input.coworkerId,
      id: input.pendingIntentId,
      expectedRevision: input.expectedRevision,
      nextState: "refreshing",
    });
    try {
      const result = await this.prepare(input.request, {
        previousIntentHash: current.intent.intentHash,
      });
      if (!result.pendingIntent) {
        throw new MatterhornCryptoTransactionError(
          "transaction_regeneration_denied",
          result.policyDecision.reasonCodes,
        );
      }
      const supersededIntent = this.#pendingIntents.transition({
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        coworkerId: input.coworkerId,
        id: input.pendingIntentId,
        expectedRevision: refreshing.revision,
        nextState: "regeneration_required",
      });
      return { result, supersededIntent };
    } catch (error) {
      try {
        this.#pendingIntents.transition({
          workspaceId: input.workspaceId,
          ownerId: input.ownerId,
          coworkerId: input.coworkerId,
          id: input.pendingIntentId,
          expectedRevision: refreshing.revision,
          nextState: "regeneration_required",
        });
      } catch {
        // A concurrent cancellation or expiry is already fail-closed.
      }
      throw error;
    }
  }
}
