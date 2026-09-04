import { getMatterhornCryptoTool } from "@matterhorn-work/types/crypto-action-registry";
import type { MatterhornWalletSafetyPolicy } from "@matterhorn-work/types/wallet-safety-policy";

import type { MatterhornCryptoAppAdapterRouter } from "./crypto-app-adapter-router.js";
import type { MatterhornCoworkers } from "./crypto-coworkers.js";
import {
  firstPartyCryptoAppAdapterArguments,
} from "./first-party-crypto-apps.js";
import type { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";
import type { ManagedMcpCertifiedToolExecutor } from "./managed-opencode-mcp.js";
import {
  MatterhornCryptoTransactionError,
  MatterhornCryptoTransactionService,
} from "./crypto-transaction-service.js";
import {
  buildMatterhornRuntimeTransactionPolicyLayers,
  resolveMatterhornRuntimeTransactionFacts,
} from "./crypto-transaction-runtime-policy.js";
import type { WorkspaceInfo } from "./types.js";
import { readWorkspaceWalletSafetyPolicySync } from "./wallet-safety-policy.js";

export const MATTERHORN_CRYPTO_WALLET_REVIEW_RESULT_VERSION =
  "matterhorn.crypto-wallet-review-result.v1";

type Options = {
  router: Pick<MatterhornCryptoAppAdapterRouter, "execute"> | null;
  coworkers: Pick<MatterhornCoworkers, "get"> | null;
  guardedRuntime: MatterhornGuardedAgentRuntime;
  resolveWorkspace: (workspaceId: string) => Promise<WorkspaceInfo>;
  readWalletPolicy?: (workspace: WorkspaceInfo) => MatterhornWalletSafetyPolicy;
  now?: () => Date;
};

function transactionError(error: unknown): Error {
  if (!(error instanceof MatterhornCryptoTransactionError)) {
    return error instanceof Error ? error : new Error("coworker_transaction_failed");
  }
  return new Error(`${error.code}${error.reasonCodes.length ? `:${error.reasonCodes.join(",")}` : ""}`);
}

/**
 * Account-facing certified tool boundary. It derives all connection, policy,
 * tenant, and wallet-review authority from the consumed server capability;
 * model arguments supply transaction terms only.
 */
export function createMatterhornCertifiedCoworkerToolExecutor(
  options: Options,
): ManagedMcpCertifiedToolExecutor {
  const readWalletPolicy = options.readWalletPolicy ?? readWorkspaceWalletSafetyPolicySync;
  const now = options.now ?? (() => new Date());
  return async ({ toolName, args, authorization }) => {
    const capabilityCoworker = authorization.coworker;
    if (!capabilityCoworker) return null;
    const workspaceId = authorization.workspaceId;
    const sessionId = authorization.sessionId;
    const runId = authorization.runId;
    const callId = authorization.callId;
    if (!options.router || !options.coworkers || !workspaceId || !sessionId || !runId || !callId) {
      throw new Error("coworker_certified_gateway_unavailable");
    }
    const tool = getMatterhornCryptoTool(toolName);
    if (!tool) throw new Error("coworker_certified_tool_unknown");
    let adapterArguments: Record<string, unknown>;
    try {
      adapterArguments = firstPartyCryptoAppAdapterArguments({
        appId: capabilityCoworker.appId,
        actionId: capabilityCoworker.actionId,
        arguments: args,
      });
    } catch {
      throw new Error("coworker_certified_arguments_invalid");
    }
    const consumedCapability = {
      coworkerId: capabilityCoworker.id,
      toolName,
      arguments: args,
    };
    if (tool.access === "read") {
      return options.router.execute({
        workspaceId,
        sessionId,
        runId,
        callId,
        connectionId: capabilityCoworker.connectionId,
        actionId: capabilityCoworker.actionId,
        network: capabilityCoworker.network,
        arguments: adapterArguments,
        consumedCapability,
      });
    }
    if (tool.access !== "prepare") throw new Error("coworker_certified_access_denied");
    const workspace = await options.resolveWorkspace(workspaceId);
    if (workspace.id !== workspaceId) throw new Error("coworker_transaction_workspace_mismatch");
    const profile = options.coworkers.get(
      workspace.id,
      capabilityCoworker.ownerId,
      capabilityCoworker.id,
    );
    if (!profile
      || profile.state !== "active"
      || profile.revision !== capabilityCoworker.revision
      || profile.policyVersion !== capabilityCoworker.policyVersion
      || !profile.allowedAppIds.includes(capabilityCoworker.appId)
      || !profile.allowedActionIds.includes(capabilityCoworker.actionId)
      || !profile.allowedNetworks.includes(capabilityCoworker.network)
      || !profile.automaticAuthorities.includes("prepare")) {
      throw new Error("coworker_transaction_authority_changed");
    }
    const transactionService = new MatterhornCryptoTransactionService({
      router: options.router,
      capabilities: options.guardedRuntime.capabilities,
      pendingIntents: options.guardedRuntime.pendingCryptoIntents,
      recordReviewedAction: async (reviewed) => {
        await options.guardedRuntime.receipts.addReviewedAction(reviewed);
        const receipt = await options.guardedRuntime.receipts.get(reviewed.workspaceId, reviewed.runId);
        if (!receipt?.reviewedActions.some((action) => (
          action.intentHash === reviewed.intentHash
          && action.policyHash === reviewed.policyHash
          && action.simulationReference === reviewed.simulationReference
        ))) throw new Error("reviewed_action_receipt_unavailable");
      },
      resolveTrustedFacts: async ({ request, adapterResult, intent }) => (
        resolveMatterhornRuntimeTransactionFacts({
          adapterResult,
          intent,
          existingIntents: options.guardedRuntime.pendingCryptoIntents.listForOwner(
            request.workspaceId,
            request.ownerId,
          ),
          jurisdictionPolicy: authorization.jurisdictionPolicy,
          now: now(),
        })
      ),
      now,
    });
    let transaction;
    try {
      transaction = await transactionService.prepare({
        workspaceId: workspace.id,
        organizationId: null,
        ownerId: capabilityCoworker.ownerId,
        sessionId,
        runId,
        callId,
        appId: capabilityCoworker.appId,
        connectionId: capabilityCoworker.connectionId,
        actionId: capabilityCoworker.actionId,
        network: capabilityCoworker.network,
        arguments: adapterArguments,
        consumedCapability,
        coworker: profile,
        policyLayers: buildMatterhornRuntimeTransactionPolicyLayers({
          workspaceId: workspace.id,
          ownerId: capabilityCoworker.ownerId,
          organizationId: null,
          appId: capabilityCoworker.appId,
          actionId: capabilityCoworker.actionId,
          network: capabilityCoworker.network,
          runId,
          callId,
          walletPolicy: readWalletPolicy(workspace),
          now: now(),
        }),
      });
    } catch (error) {
      throw transactionError(error);
    }
    const policy = {
      decision: transaction.policyDecision.decision,
      reasonCodes: transaction.policyDecision.reasonCodes,
      limits: transaction.policyDecision.limits,
      evaluatedAt: transaction.policyDecision.evaluatedAt,
    };
    if (!transaction.reviewedAction || !transaction.pendingIntent) {
      return {
        version: MATTERHORN_CRYPTO_WALLET_REVIEW_RESULT_VERSION,
        status: "blocked",
        blocked: true,
        adapterResult: transaction.adapterResult,
        policy,
      };
    }
    return {
      version: MATTERHORN_CRYPTO_WALLET_REVIEW_RESULT_VERSION,
      status: "wallet_review_required",
      adapterResult: transaction.adapterResult,
      policy,
      reviewedAction: transaction.reviewedAction,
      pendingIntent: {
        id: transaction.pendingIntent.id,
        revision: transaction.pendingIntent.revision,
        state: transaction.pendingIntent.state,
        expiresAt: transaction.pendingIntent.expiresAt,
      },
    };
  };
}
