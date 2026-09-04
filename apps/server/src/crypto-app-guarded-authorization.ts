import { randomUUID } from "node:crypto";

import type { MatterhornCryptoAppActionAccess } from "@matterhorn-work/types/crypto-coworkers";
import { getMatterhornCryptoTool } from "@matterhorn-work/types/crypto-action-registry";

import { MATTERHORN_CAPABILITY_CALL_ARGUMENT } from "./agent-capability.js";
import type { MatterhornCryptoAppAuthorization } from "./crypto-app-adapter-router.js";
import type { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

export type MatterhornCryptoAppCapabilityBinding = {
  appId: string;
  manifestRevision: string;
  actionId: string;
  proxyToolName: string;
};

type StoredReservation = {
  reservationId: string;
  workspaceId: string;
  sessionId: string;
  runId: string;
  callId: string;
  appId: string;
  actionId: string;
  proxyToolName: string;
  access: "read" | "prepare";
};

type Options = {
  runtime: MatterhornGuardedAgentRuntime;
  stateStore: MatterhornGuardedRuntimeStateStore;
  bindings?: MatterhornCryptoAppCapabilityBinding[];
  resolveBinding?: (
    input: { appId: string; manifestRevision: string; actionId: string },
  ) => MatterhornCryptoAppCapabilityBinding | null;
  runtimeSecret?: () => string;
  now?: () => Date;
};

const RESERVATION_TTL_MS = 5 * 60_000;

function capabilityAccess(access: MatterhornCryptoAppActionAccess): "read" | "prepare" {
  return access === "read" || access === "watch" ? "read" : "prepare";
}

function bindingKey(input: { appId: string; manifestRevision: string; actionId: string }): string {
  return `${input.appId}\u0000${input.manifestRevision}\u0000${input.actionId}`;
}

function receiptToolName(appId: string, actionId: string): string {
  return `crypto_app:${appId}:${actionId}`;
}

export class MatterhornGuardedCryptoAppAuthorization implements MatterhornCryptoAppAuthorization {
  readonly #runtime: MatterhornGuardedAgentRuntime;
  readonly #stateStore: MatterhornGuardedRuntimeStateStore;
  readonly #bindings = new Map<string, MatterhornCryptoAppCapabilityBinding>();
  readonly #resolveBinding: Options["resolveBinding"];
  readonly #runtimeSecret: () => string;
  readonly #now: () => Date;

  constructor(options: Options) {
    this.#runtime = options.runtime;
    this.#stateStore = options.stateStore;
    this.#runtimeSecret = options.runtimeSecret
      ?? (() => process.env.MATTERHORN_AGENT_RUNTIME_SECRET?.trim() ?? "");
    this.#now = options.now ?? (() => new Date());
    this.#resolveBinding = options.resolveBinding;
    for (const binding of options.bindings ?? []) {
      const tool = getMatterhornCryptoTool(binding.proxyToolName);
      if (!tool) throw new Error("crypto_app_proxy_tool_unknown");
      const key = bindingKey(binding);
      if (this.#bindings.has(key)) throw new Error("crypto_app_capability_binding_duplicate");
      this.#bindings.set(key, { ...binding, proxyToolName: tool.name });
    }
  }

  async authorize(input: Parameters<MatterhornCryptoAppAuthorization["authorize"]>[0]): Promise<{ reservationId: string }> {
    if (this.#runtime.capabilities.mode !== "enforce" || !this.#runtime.ready()) {
      throw new Error("crypto_app_guarded_runtime_enforcement_required");
    }
    const binding = this.#bindings.get(bindingKey(input)) ?? this.#resolveBinding?.(input) ?? null;
    if (!binding) throw new Error("crypto_app_capability_binding_missing");
    if (binding.appId !== input.appId
      || binding.manifestRevision !== input.manifestRevision
      || binding.actionId !== input.actionId) {
      throw new Error("crypto_app_capability_binding_mismatch");
    }
    if (!/^[a-f0-9]{64}$/.test(input.canonicalArgumentsHash)) {
      throw new Error("crypto_app_arguments_hash_invalid");
    }
    const tool = getMatterhornCryptoTool(binding.proxyToolName);
    if (!tool || tool.access !== capabilityAccess(input.access)) {
      throw new Error("crypto_app_capability_access_mismatch");
    }
    const args = {
      appId: input.appId,
      manifestRevision: input.manifestRevision,
      connectionId: input.connectionId,
      actionId: input.actionId,
      access: input.access,
      network: input.network,
      canonicalArgumentsHash: input.canonicalArgumentsHash,
    };
    if (input.consumedCapability) {
      if (input.consumedCapability.toolName.replace(/^matterhorn-work_/, "") !== tool.name) {
        throw new Error("crypto_app_capability_binding_mismatch");
      }
      const proof = this.#runtime.capabilities.consumedCapabilityProof({
        runId: input.runId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        callId: input.callId,
        coworkerId: input.consumedCapability.coworkerId,
        connectionId: input.connectionId,
        appId: input.appId,
        manifestRevision: input.manifestRevision,
        actionId: input.actionId,
        network: input.network,
        toolName: tool.name,
        args: input.consumedCapability.arguments,
      });
      if (!proof || proof.access !== tool.access) {
        throw new Error("crypto_app_capability_scope_mismatch");
      }
      if (!this.#stateStore.putIfAbsent({
        kind: "crypto_app_consumed_dispatch",
        key: input.callId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        value: {
          runId: input.runId,
          callId: input.callId,
          connectionId: input.connectionId,
          appId: input.appId,
          manifestRevision: input.manifestRevision,
          actionId: input.actionId,
          network: input.network,
        },
        expiresAtMs: Date.parse(proof.expiresAt) + RESERVATION_TTL_MS,
        nowMs: this.#now().getTime(),
      })) {
        throw new Error("crypto_app_capability_already_dispatched");
      }
    } else {
      this.#runtime.stageRuntimeTool({
        runtimeSecret: this.#runtimeSecret(),
        runId: input.runId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        callId: input.callId,
        toolName: tool.name,
        args,
      });
      const authorized = this.#runtime.authorizeMcpTool({
        toolName: tool.name,
        args: { ...args, [MATTERHORN_CAPABILITY_CALL_ARGUMENT]: input.callId },
      });
      if (authorized.runId !== input.runId
        || authorized.callId !== input.callId
        || authorized.workspaceId !== input.workspaceId) {
        throw new Error("crypto_app_capability_scope_mismatch");
      }
    }
    const reservationId = `crypto_app_reservation_${randomUUID()}`;
    const reservation: StoredReservation = {
      reservationId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      runId: input.runId,
      callId: input.callId,
      appId: input.appId,
      actionId: input.actionId,
      proxyToolName: tool.name,
      access: tool.access,
    };
    const nowMs = this.#now().getTime();
    this.#stateStore.put({
      kind: "crypto_app_reservation",
      key: reservationId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      value: reservation,
      expiresAtMs: nowMs + RESERVATION_TTL_MS,
      nowMs,
    });
    return { reservationId };
  }

  async reconcile(input: Parameters<MatterhornCryptoAppAuthorization["reconcile"]>[0]): Promise<void> {
    if (!Number.isSafeInteger(input.costMicros) || input.costMicros < 0
      || !Number.isFinite(input.durationMs) || input.durationMs < 0) {
      throw new Error("crypto_app_reconciliation_invalid");
    }
    const reservation = this.#stateStore.take<StoredReservation>("crypto_app_reservation", input.reservationId);
    if (!reservation || reservation.reservationId !== input.reservationId) {
      throw new Error("crypto_app_reservation_unknown_or_replayed");
    }
    await this.#runtime.recordMcpTool({
      runId: reservation.runId,
      callId: reservation.callId,
      metric: {
        tool: reservation.proxyToolName,
        access: reservation.access,
        outcome: input.outcome,
        durationMs: Math.round(input.durationMs),
        source: `crypto_app:${reservation.appId}`,
      },
      receiptToolName: receiptToolName(reservation.appId, reservation.actionId),
      source: `crypto_app:${reservation.appId}`,
    });
  }
}
