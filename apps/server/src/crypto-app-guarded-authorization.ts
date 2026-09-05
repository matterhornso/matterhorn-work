import { randomUUID } from "node:crypto";

import type { MatterhornCryptoAppActionAccess } from "@matterhorn-work/types/crypto-coworkers";
import { getMatterhornCryptoTool } from "@matterhorn-work/types/crypto-action-registry";
import type { MatterhornAgentToolReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import { MATTERHORN_CAPABILITY_CALL_ARGUMENT } from "./agent-capability.js";
import type { MatterhornCryptoAppAuthorization } from "./crypto-app-adapter-router.js";
import type { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";
import {
  MatterhornGuardedRuntimeStateStore,
  type GuardedRuntimeStateRecord,
} from "./guarded-runtime-state-store.js";

export type MatterhornCryptoAppCapabilityBinding = {
  appId: string;
  manifestRevision: string;
  actionId: string;
  proxyToolName: string;
};

type ReservationContext = {
  reservationId: string;
  workspaceId: string;
  sessionId: string;
  runId: string;
  callId: string;
  connectionId: string;
  appId: string;
  manifestRevision: string;
  actionId: string;
  requestAccess: MatterhornCryptoAppActionAccess;
  network: string;
  canonicalArgumentsHash: string;
  proxyToolName: string;
  access: "read" | "prepare";
  capabilityArgsHash: string;
  capabilityExpiresAt: string;
  reconciliationExpiresAt: string;
};

type StoredReservation = ReservationContext & { bindingSeal: string };

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

const RECONCILIATION_GRACE_MS = 60_000;
const RESERVATION_KEYS = new Set([
  "reservationId", "workspaceId", "sessionId", "runId", "callId", "connectionId",
  "appId", "manifestRevision", "actionId", "requestAccess", "network",
  "canonicalArgumentsHash", "proxyToolName", "access", "capabilityArgsHash",
  "capabilityExpiresAt", "reconciliationExpiresAt", "bindingSeal",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedId(value: unknown, max = 256): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= max
    && /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value);
}

function exactIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function reservationContext(value: StoredReservation): ReservationContext {
  const { bindingSeal: _bindingSeal, ...context } = value;
  return context;
}

function validReservationRecord(
  record: GuardedRuntimeStateRecord<unknown>,
  reservationId: string,
): record is GuardedRuntimeStateRecord<StoredReservation> {
  if (record.kind !== "crypto_app_reservation"
    || record.key !== reservationId
    || !isRecord(record.value)
    || Object.keys(record.value).length !== RESERVATION_KEYS.size
    || Object.keys(record.value).some((key) => !RESERVATION_KEYS.has(key))) return false;
  const value = record.value;
  const capabilityExpiresAtMs = typeof value.capabilityExpiresAt === "string"
    ? Date.parse(value.capabilityExpiresAt)
    : Number.NaN;
  const reconciliationExpiresAtMs = typeof value.reconciliationExpiresAt === "string"
    ? Date.parse(value.reconciliationExpiresAt)
    : Number.NaN;
  const tool = typeof value.proxyToolName === "string"
    ? getMatterhornCryptoTool(value.proxyToolName)
    : undefined;
  return typeof value.reservationId === "string"
    && /^crypto_app_reservation_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.reservationId)
    && value.reservationId === reservationId
    && boundedId(value.workspaceId)
    && boundedId(value.sessionId)
    && boundedId(value.runId)
    && boundedId(value.callId)
    && boundedId(value.connectionId)
    && boundedId(value.appId)
    && boundedId(value.manifestRevision, 128)
    && boundedId(value.actionId, 160)
    && (value.requestAccess === "read" || value.requestAccess === "watch"
      || value.requestAccess === "prepare" || value.requestAccess === "simulate")
    && boundedId(value.network, 160)
    && typeof value.canonicalArgumentsHash === "string"
    && /^[a-f0-9]{64}$/.test(value.canonicalArgumentsHash)
    && boundedId(value.proxyToolName)
    && Boolean(tool)
    && (value.access === "read" || value.access === "prepare")
    && tool?.access === value.access
    && capabilityAccess(value.requestAccess) === value.access
    && typeof value.capabilityArgsHash === "string"
    && /^[a-f0-9]{64}$/.test(value.capabilityArgsHash)
    && exactIso(value.capabilityExpiresAt)
    && exactIso(value.reconciliationExpiresAt)
    && reconciliationExpiresAtMs - capabilityExpiresAtMs === RECONCILIATION_GRACE_MS
    && typeof value.bindingSeal === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(value.bindingSeal)
    && record.workspaceId === value.workspaceId
    && record.sessionId === value.sessionId
    && record.expiresAtMs === reconciliationExpiresAtMs
    && Number.isSafeInteger(record.updatedAtMs)
    && record.updatedAtMs <= reconciliationExpiresAtMs;
}

function capabilityAccess(access: MatterhornCryptoAppActionAccess): "read" | "prepare" {
  return access === "read" || access === "watch" ? "read" : "prepare";
}

function bindingKey(input: { appId: string; manifestRevision: string; actionId: string }): string {
  return `${input.appId}\u0000${input.manifestRevision}\u0000${input.actionId}`;
}

function receiptToolName(appId: string, actionId: string): string {
  return `crypto_app:${appId}:${actionId}`;
}

function validEvidenceMetadata(value: MatterhornAgentToolReceipt["evidence"]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).some((key) => ![
    "delivery",
    "observedAt",
    "ageMs",
    "freshnessMaxAgeMs",
    "projectionHash",
    "observationHash",
  ].includes(key))) return false;
  if (value.delivery !== "live" && value.delivery !== "certified_cache") return false;
  if (value.observedAt !== null) {
    if (typeof value.observedAt !== "string") return false;
    const observedAtMs = Date.parse(value.observedAt);
    if (!Number.isFinite(observedAtMs) || new Date(observedAtMs).toISOString() !== value.observedAt) return false;
  }
  if (value.ageMs !== null
    && (!Number.isSafeInteger(value.ageMs) || value.ageMs < -60_000)) return false;
  if (value.freshnessMaxAgeMs !== null
    && (!Number.isSafeInteger(value.freshnessMaxAgeMs) || value.freshnessMaxAgeMs < 1)) return false;
  if (typeof value.projectionHash !== "string"
    || typeof value.observationHash !== "string"
    || !/^[a-f0-9]{64}$/.test(value.projectionHash)
    || !/^[a-f0-9]{64}$/.test(value.observationHash)) return false;
  return true;
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
        now: this.#now(),
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
        expiresAtMs: Date.parse(proof.expiresAt) + RECONCILIATION_GRACE_MS,
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
    const proof = this.#runtime.capabilities.consumedToolProof({
      runId: input.runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      callId: input.callId,
      toolName: tool.name,
      now: this.#now(),
    });
    if (!proof || proof.access !== tool.access) {
      throw new Error("crypto_app_capability_scope_mismatch");
    }
    const context: ReservationContext = {
      reservationId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      runId: input.runId,
      callId: input.callId,
      connectionId: input.connectionId,
      appId: input.appId,
      manifestRevision: input.manifestRevision,
      actionId: input.actionId,
      requestAccess: input.access,
      network: input.network,
      canonicalArgumentsHash: input.canonicalArgumentsHash,
      proxyToolName: tool.name,
      access: tool.access,
      capabilityArgsHash: proof.argsHash,
      capabilityExpiresAt: proof.expiresAt,
      reconciliationExpiresAt: proof.reconciliationExpiresAt,
    };
    const sealed = this.#runtime.capabilities.sealConsumedToolContext({
      runId: input.runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      callId: input.callId,
      toolName: tool.name,
      context,
      now: this.#now(),
    });
    if (!sealed
      || sealed.proof.access !== context.access
      || sealed.proof.argsHash !== context.capabilityArgsHash
      || sealed.proof.expiresAt !== context.capabilityExpiresAt
      || sealed.proof.reconciliationExpiresAt !== context.reconciliationExpiresAt) {
      throw new Error("crypto_app_capability_scope_mismatch");
    }
    const reservation: StoredReservation = { ...context, bindingSeal: sealed.seal };
    const nowMs = this.#now().getTime();
    this.#stateStore.put({
      kind: "crypto_app_reservation",
      key: reservationId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      value: reservation,
      expiresAtMs: Date.parse(context.reconciliationExpiresAt),
      nowMs,
    });
    return { reservationId };
  }

  async reconcile(input: Parameters<MatterhornCryptoAppAuthorization["reconcile"]>[0]): Promise<void> {
    if (!Number.isSafeInteger(input.costMicros) || input.costMicros < 0
      || !Number.isFinite(input.durationMs) || input.durationMs < 0) {
      throw new Error("crypto_app_reconciliation_invalid");
    }
    if (input.evidence !== undefined
      && (input.outcome !== "success" || !validEvidenceMetadata(input.evidence))) {
      throw new Error("crypto_app_reconciliation_invalid");
    }
    const record = this.#stateStore.takeRecord<unknown>("crypto_app_reservation", input.reservationId);
    if (!record) {
      throw new Error("crypto_app_reservation_unknown_or_replayed");
    }
    if (!validReservationRecord(record, input.reservationId)) {
      throw new Error("crypto_app_persisted_reservation_invalid");
    }
    const reservation = record.value;
    const proof = this.#runtime.capabilities.verifyConsumedToolContext({
      runId: reservation.runId,
      workspaceId: reservation.workspaceId,
      sessionId: reservation.sessionId,
      callId: reservation.callId,
      toolName: reservation.proxyToolName,
      context: reservationContext(reservation),
      seal: reservation.bindingSeal,
      now: this.#now(),
    });
    if (!proof
      || proof.access !== reservation.access
      || proof.argsHash !== reservation.capabilityArgsHash
      || proof.expiresAt !== reservation.capabilityExpiresAt
      || proof.reconciliationExpiresAt !== reservation.reconciliationExpiresAt) {
      throw new Error("crypto_app_reservation_capability_mismatch");
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
      ...(input.evidence ? { evidence: structuredClone(input.evidence) } : {}),
    });
  }
}
