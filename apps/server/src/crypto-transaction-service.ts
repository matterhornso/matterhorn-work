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
  resolveTrustedFacts: TrustedFactsResolver;
  now?: () => Date;
};

export class MatterhornCryptoTransactionError extends Error {
  constructor(
    public readonly code:
      | "transaction_context_invalid"
      | "transaction_policy_preflight_denied"
      | "transaction_proxy_tool_unavailable"
      | "transaction_capability_proof_missing",
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
  readonly #resolveTrustedFacts: TrustedFactsResolver;
  readonly #now: () => Date;

  constructor(options: Options) {
    this.#router = options.router;
    this.#capabilities = options.capabilities;
    this.#resolveTrustedFacts = options.resolveTrustedFacts;
    this.#now = options.now ?? (() => new Date());
  }

  async prepare(request: MatterhornCryptoTransactionRequest): Promise<MatterhornCryptoTransactionResult> {
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
    const adapterResult = await this.#router.execute(request);
    if (adapterResult.app.id !== request.appId
      || adapterResult.app.connectionId !== request.connectionId
      || adapterResult.action.id !== request.actionId
      || adapterResult.action.network !== request.network
      || (adapterResult.action.access !== "prepare" && adapterResult.action.access !== "simulate")) {
      throw new MatterhornCryptoTransactionError("transaction_context_invalid");
    }
    const exactArguments = canonicalArguments(request.arguments);
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
    return {
      adapterResult,
      intent,
      policyDecision,
      reviewedAction: policyDecision.decision === "wallet_review_required"
        ? cryptoIntentToReviewedActionHandoffV2(intent, policyDecision)
        : null,
    };
  }
}
