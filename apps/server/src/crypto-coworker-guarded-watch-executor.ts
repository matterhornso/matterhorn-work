import { randomUUID } from "node:crypto";

import type {
  MatterhornCoworkerProfile,
  MatterhornCoworkerWatch,
  MatterhornCryptoAppConnectionView,
  MatterhornCryptoAppResult,
} from "@matterhorn-work/types/crypto-coworkers";
import { getMatterhornCryptoTool } from "@matterhorn-work/types/crypto-action-registry";

import type { MatterhornCoworkerRunBinding } from "./agent-capability.js";
import { MatterhornCryptoAppAdapterError } from "./crypto-app-adapter-router.js";
import type { MatterhornCryptoAppRuntimeServices } from "./crypto-app-runtime.js";
import type { MatterhornCoworkerWatchExecutor } from "./crypto-coworker-watch-runner.js";
import type { MatterhornCoworkers } from "./crypto-coworkers.js";
import { firstPartyCryptoAppProxyTool } from "./first-party-crypto-apps.js";
import type { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";

type Options = {
  coworkers: MatterhornCoworkers;
  cryptoApps: MatterhornCryptoAppRuntimeServices;
  guardedRuntime: MatterhornGuardedAgentRuntime;
  runtimeSecret?: () => string;
  id?: () => string;
};

function runBinding(
  profile: MatterhornCoworkerProfile,
  watch: MatterhornCoworkerWatch,
  proxyToolName: string,
): MatterhornCoworkerRunBinding {
  const tool = getMatterhornCryptoTool(proxyToolName);
  if (!tool || tool.access !== "read") throw new Error("coworker_watch_read_tool_required");
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    ownerId: profile.ownerId,
    revision: profile.revision,
    policyVersion: profile.policyVersion,
    allowedAppIds: [watch.appId],
    allowedActionIds: [watch.actionId],
    allowedNetworks: [watch.network],
    // A user-granted watch authority permits the one bounded read that powers
    // that schedule; it never grants an interactive or prepare capability.
    automaticAuthorities: ["read"],
    actionBindings: [{
      appId: watch.appId,
      actionId: watch.actionId,
      proxyToolName: tool.name,
      access: "read",
    }],
    allowedDataLabels: [...profile.privacy.allowedDataLabels],
    allowUnverifiedProviderConsent: false,
    maxReadCallsPerRun: Math.min(profile.limits.maxReadCallsPerRun, watch.budgets.maxReadCallsPerCheck),
    maxPrepareCallsPerFamily: 0,
  };
}

function activeConnection(
  connections: MatterhornCryptoAppConnectionView[],
  watch: MatterhornCoworkerWatch,
): MatterhornCryptoAppConnectionView | null {
  return connections.find((connection) => connection.state === "active"
    && connection.availability === "available"
    && connection.appId === watch.appId
    && connection.grantedActionIds.includes(watch.actionId)
    && connection.grantedNetworks.includes(watch.network)) ?? null;
}

export function createGuardedCoworkerWatchExecutor(options: Options): MatterhornCoworkerWatchExecutor {
  const id = options.id ?? (() => randomUUID());
  const runtimeSecret = options.runtimeSecret
    ?? (() => process.env.MATTERHORN_AGENT_RUNTIME_SECRET?.trim() ?? "");
  return async (watch): Promise<MatterhornCryptoAppResult> => {
    if (options.cryptoApps.mode !== "enforce"
      || !options.cryptoApps.ready
      || !options.cryptoApps.router
      || !options.cryptoApps.catalog
      || options.guardedRuntime.capabilities.mode !== "enforce"
      || !options.guardedRuntime.ready()) {
      throw new Error("coworker_watch_runtime_unavailable");
    }
    const profile = options.coworkers.resolveActive(watch.workspaceId, watch.ownerId, watch.coworkerId);
    if (!profile || profile.revision !== watch.profileRevision) throw new Error("coworker_watch_profile_stale");
    const proxyToolName = firstPartyCryptoAppProxyTool(watch.appId, watch.actionId);
    if (!proxyToolName) throw new Error("coworker_watch_action_unavailable");
    const tool = getMatterhornCryptoTool(proxyToolName);
    if (!tool || tool.access !== "read") throw new Error("coworker_watch_read_tool_required");
    const connection = activeConnection(options.cryptoApps.catalog.listConnections(watch.workspaceId), watch);
    if (!connection) throw new Error("coworker_watch_connection_unavailable");
    const nonce = id().replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
    const sessionId = `cw_watch_${watch.id}_${nonce}`.slice(0, 256);
    const callId = `cw_call_${nonce}`.slice(0, 256);
    const binding = runBinding(profile, watch, proxyToolName);
    const accepted = await options.guardedRuntime.startDeterministicCoworkerRun({
      workspaceId: watch.workspaceId,
      sessionId,
      coworker: binding,
      requestToolProfiles: [{ "*": false, [tool.name]: true }],
      maxReadCalls: watch.budgets.maxReadCallsPerCheck,
    });
    try {
      const result = await options.cryptoApps.router.execute({
        workspaceId: watch.workspaceId,
        sessionId,
        runId: accepted.runId,
        callId,
        connectionId: connection.id,
        actionId: watch.actionId,
        network: watch.network,
        arguments: structuredClone(watch.parameters),
      });
      if (result.metering.costMicros > watch.budgets.maxCostMicrosPerCheck) {
        throw new MatterhornCryptoAppAdapterError("adapter_cost_limit_exceeded");
      }
      await options.guardedRuntime.completeRun({
        runtimeSecret: runtimeSecret(),
        runId: accepted.runId,
        status: "success",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          estimatedCostUsd: result.metering.costMicros / 1_000_000,
        },
      });
      return result;
    } catch (error) {
      await options.guardedRuntime.completeRun({
        runtimeSecret: runtimeSecret(),
        runId: accepted.runId,
        status: "error",
      }).catch(() => undefined);
      throw error;
    }
  };
}
