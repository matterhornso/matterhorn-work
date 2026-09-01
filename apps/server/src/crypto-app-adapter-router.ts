import {
  MATTERHORN_CRYPTO_APP_RESULT_VERSION,
  type MatterhornCryptoAppAction,
  type MatterhornCryptoAppConnectionCredential,
  type MatterhornCryptoAppResult,
  type MatterhornCryptoAppTransportKind,
} from "@matterhorn-work/types/crypto-coworkers";

import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
import {
  assertCryptoAdapterConnectedAddress,
  resolvePublicCryptoAdapterEndpoint,
  type MatterhornAdapterDnsResolver,
  type MatterhornResolvedAdapterEndpoint,
} from "./crypto-app-egress.js";
import { projectCryptoAppOutput, validateCryptoAppInput } from "./crypto-app-json-schema.js";
import { MatterhornCryptoAppRegistry } from "./crypto-app-registry.js";
import { canonicalJson, sha256 } from "./guarded-runtime-crypto.js";
import { quarantineUntrustedContent, untrustedContentChanged } from "./untrusted-data-quarantine.js";

export type MatterhornCryptoAppAdapterRequest = {
  workspaceId: string;
  sessionId: string;
  runId: string;
  callId: string;
  connectionId: string;
  actionId: string;
  network: string;
  arguments: Record<string, unknown>;
};

export type MatterhornCryptoAppAuthorization = {
  authorize(input: {
    workspaceId: string;
    sessionId: string;
    runId: string;
    callId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    actionId: string;
    access: MatterhornCryptoAppAction["access"];
    network: string;
    canonicalArgumentsHash: string;
  }): Promise<{ reservationId: string }>;
  reconcile(input: {
    reservationId: string;
    outcome: "success" | "error" | "timeout";
    costMicros: number;
    durationMs: number;
  }): Promise<void>;
};

export type MatterhornCryptoAppAdapterExecution = {
  data: unknown;
  source: string;
  observedAt: string | null;
  blockOrVersion: string | null;
  costMicros: number;
  connectedAddress: string;
};

export type MatterhornCryptoAppTransportExecutor = (input: {
  endpoint: URL;
  approvedAddresses: string[];
  appId: string;
  manifestRevision: string;
  action: MatterhornCryptoAppAction;
  network: string;
  arguments: Record<string, unknown>;
  credential: MatterhornCryptoAppConnectionCredential;
  signal: AbortSignal;
}) => Promise<MatterhornCryptoAppAdapterExecution>;

export class MatterhornCryptoAppAdapterError extends Error {
  constructor(
    public readonly code:
      | "adapter_request_invalid"
      | "adapter_connection_unavailable"
      | "adapter_action_not_allowed"
      | "adapter_network_not_allowed"
      | "adapter_arguments_invalid"
      | "adapter_authorization_denied"
      | "adapter_transport_unavailable"
      | "adapter_endpoint_blocked"
      | "adapter_circuit_open"
      | "adapter_timeout"
      | "adapter_upstream_failed"
      | "adapter_connected_address_invalid"
      | "adapter_output_invalid"
      | "adapter_output_stale"
      | "adapter_result_too_large"
      | "adapter_usage_reconciliation_failed",
    public readonly issues: string[] = [],
  ) {
    super(code);
    this.name = "MatterhornCryptoAppAdapterError";
  }
}

type RouterOptions = {
  registry: MatterhornCryptoAppRegistry;
  connections: MatterhornCryptoAppConnections;
  authorization: MatterhornCryptoAppAuthorization;
  executors: Partial<Record<MatterhornCryptoAppTransportKind, MatterhornCryptoAppTransportExecutor>>;
  resolveDns?: MatterhornAdapterDnsResolver;
  now?: () => Date;
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
  timeout?: (milliseconds: number, abort: () => void) => { promise: Promise<never>; cancel: () => void };
};

type CircuitState = { consecutiveFailures: number; openUntilMs: number };

const MAX_ARGUMENT_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 256 * 1024;

function nonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function executionEnvelopeValid(value: unknown): value is MatterhornCryptoAppAdapterExecution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const execution = value as Partial<MatterhornCryptoAppAdapterExecution>;
  return nonEmpty(execution.source ?? "")
    && (execution.source?.length ?? 0) <= 200
    && typeof execution.connectedAddress === "string"
    && Number.isSafeInteger(execution.costMicros)
    && Number(execution.costMicros) >= 0
    && (execution.observedAt === null || typeof execution.observedAt === "string")
    && (execution.blockOrVersion === null
      || (typeof execution.blockOrVersion === "string" && execution.blockOrVersion.length <= 200));
}

function timer(milliseconds: number, abort: () => void): { promise: Promise<never>; cancel: () => void } {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<never>((_resolve, reject) => {
    handle = setTimeout(() => {
      abort();
      reject(new MatterhornCryptoAppAdapterError("adapter_timeout"));
    }, milliseconds);
  });
  return {
    promise,
    cancel: () => {
      if (handle) clearTimeout(handle);
      handle = null;
    },
  };
}

export class MatterhornCryptoAppAdapterRouter {
  readonly #registry: MatterhornCryptoAppRegistry;
  readonly #connections: MatterhornCryptoAppConnections;
  readonly #authorization: MatterhornCryptoAppAuthorization;
  readonly #executors: Partial<Record<MatterhornCryptoAppTransportKind, MatterhornCryptoAppTransportExecutor>>;
  readonly #resolveDns: MatterhornAdapterDnsResolver | undefined;
  readonly #now: () => Date;
  readonly #circuitFailureThreshold: number;
  readonly #circuitCooldownMs: number;
  readonly #timeout: NonNullable<RouterOptions["timeout"]>;
  readonly #circuits = new Map<string, CircuitState>();

  constructor(options: RouterOptions) {
    this.#registry = options.registry;
    this.#connections = options.connections;
    this.#authorization = options.authorization;
    this.#executors = options.executors;
    this.#resolveDns = options.resolveDns;
    this.#now = options.now ?? (() => new Date());
    this.#circuitFailureThreshold = Math.max(1, options.circuitFailureThreshold ?? 3);
    this.#circuitCooldownMs = Math.max(1_000, options.circuitCooldownMs ?? 30_000);
    this.#timeout = options.timeout ?? timer;
  }

  async execute(request: MatterhornCryptoAppAdapterRequest): Promise<MatterhornCryptoAppResult> {
    if (![request.workspaceId, request.sessionId, request.runId, request.callId, request.connectionId, request.actionId, request.network]
      .every(nonEmpty)) throw new MatterhornCryptoAppAdapterError("adapter_request_invalid");
    if (!request.arguments || typeof request.arguments !== "object" || Array.isArray(request.arguments)) {
      throw new MatterhornCryptoAppAdapterError("adapter_request_invalid");
    }
    if (Buffer.byteLength(canonicalJson(request.arguments), "utf8") > MAX_ARGUMENT_BYTES) {
      throw new MatterhornCryptoAppAdapterError("adapter_arguments_invalid", ["arguments_size_exceeded"]);
    }

    const connection = this.#connections.resolveActive(request.workspaceId, request.connectionId);
    if (!connection) throw new MatterhornCryptoAppAdapterError("adapter_connection_unavailable");
    const registryEntry = this.#registry.resolve(connection.appId);
    if (!registryEntry || registryEntry.manifestRevision !== connection.manifestRevision) {
      throw new MatterhornCryptoAppAdapterError("adapter_connection_unavailable");
    }
    const action = registryEntry.manifest.actions.find((item) => item.id === request.actionId);
    if (!action || !connection.grantedActionIds.includes(action.id)) {
      throw new MatterhornCryptoAppAdapterError("adapter_action_not_allowed");
    }
    if (!connection.grantedNetworks.includes(request.network)
      || !registryEntry.manifest.networks.some((network) => network.chainId === request.network)) {
      throw new MatterhornCryptoAppAdapterError("adapter_network_not_allowed");
    }
    if (action.requiredScopes.some((scope) => !connection.grantedScopes.includes(scope))) {
      throw new MatterhornCryptoAppAdapterError("adapter_action_not_allowed");
    }

    const validated = validateCryptoAppInput(action.inputSchema, request.arguments);
    if (!validated.ok || !validated.value || typeof validated.value !== "object" || Array.isArray(validated.value)) {
      throw new MatterhornCryptoAppAdapterError("adapter_arguments_invalid", validated.issues);
    }
    const canonicalArguments = validated.value as Record<string, unknown>;
    const argumentsHash = sha256(canonicalArguments);
    const circuitKey = `${request.workspaceId}\u0000${connection.id}\u0000${connection.appId}\u0000${connection.manifestRevision}\u0000${action.id}`;
    if (this.#circuitOpen(circuitKey)) throw new MatterhornCryptoAppAdapterError("adapter_circuit_open");

    let resolved: MatterhornResolvedAdapterEndpoint;
    try {
      resolved = await resolvePublicCryptoAdapterEndpoint(registryEntry.manifest.transport.endpoint, this.#resolveDns);
    } catch {
      this.#recordFailure(circuitKey);
      throw new MatterhornCryptoAppAdapterError("adapter_endpoint_blocked");
    }

    const executor = this.#executors[registryEntry.manifest.transport.kind];
    if (!executor) throw new MatterhornCryptoAppAdapterError("adapter_transport_unavailable");

    let reservationId: string;
    try {
      const authorization = await this.#authorization.authorize({
        workspaceId: request.workspaceId,
        sessionId: request.sessionId,
        runId: request.runId,
        callId: request.callId,
        connectionId: request.connectionId,
        appId: connection.appId,
        manifestRevision: connection.manifestRevision,
        actionId: action.id,
        access: action.access,
        network: request.network,
        canonicalArgumentsHash: argumentsHash,
      });
      if (!nonEmpty(authorization.reservationId)) throw new Error("reservation_required");
      reservationId = authorization.reservationId;
    } catch {
      throw new MatterhornCryptoAppAdapterError("adapter_authorization_denied");
    }

    const startedAt = this.#now();
    const controller = new AbortController();
    const timeout = this.#timeout(action.timeoutMs, () => controller.abort());
    let execution: MatterhornCryptoAppAdapterExecution;
    try {
      execution = await Promise.race([
        executor({
          endpoint: resolved.endpoint,
          approvedAddresses: [...resolved.approvedAddresses],
          appId: connection.appId,
          manifestRevision: connection.manifestRevision,
          action,
          network: request.network,
          arguments: canonicalArguments,
          credential: structuredClone(connection.credential),
          signal: controller.signal,
        }),
        timeout.promise,
      ]);
    } catch (error) {
      timeout.cancel();
      const completedAt = this.#now();
      const outcome = error instanceof MatterhornCryptoAppAdapterError && error.code === "adapter_timeout"
        ? "timeout"
        : "error";
      this.#recordFailure(circuitKey);
      await this.#reconcile(reservationId, outcome, 0, completedAt.getTime() - startedAt.getTime());
      if (outcome === "timeout") throw error;
      throw new MatterhornCryptoAppAdapterError("adapter_upstream_failed");
    } finally {
      timeout.cancel();
    }

    const completedAt = this.#now();
    const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
    if (!executionEnvelopeValid(execution)) {
      this.#recordFailure(circuitKey);
      await this.#reconcile(reservationId, "error", 0, durationMs);
      throw new MatterhornCryptoAppAdapterError("adapter_output_invalid");
    }
    try {
      assertCryptoAdapterConnectedAddress(resolved.approvedAddresses, execution.connectedAddress);
    } catch {
      this.#recordFailure(circuitKey);
      await this.#reconcile(reservationId, "error", 0, durationMs);
      throw new MatterhornCryptoAppAdapterError("adapter_connected_address_invalid");
    }
    const projected = projectCryptoAppOutput(action.outputProjectionSchema, execution.data);
    if (!projected.ok) {
      this.#recordFailure(circuitKey);
      await this.#reconcile(reservationId, "error", execution.costMicros, durationMs);
      throw new MatterhornCryptoAppAdapterError("adapter_output_invalid", projected.issues);
    }
    const quarantined = quarantineUntrustedContent(projected.value);
    if (Buffer.byteLength(canonicalJson(quarantined), "utf8") > MAX_RESULT_BYTES) {
      this.#recordFailure(circuitKey);
      await this.#reconcile(reservationId, "error", execution.costMicros, durationMs);
      throw new MatterhornCryptoAppAdapterError("adapter_result_too_large");
    }

    let observedAt: Date | null = null;
    let ageMs: number | null = null;
    if (execution.observedAt) {
      observedAt = new Date(execution.observedAt);
      if (!Number.isFinite(observedAt.getTime())) observedAt = null;
      else ageMs = completedAt.getTime() - observedAt.getTime();
    }
    if (action.requiresFreshness && (!observedAt
      || ageMs === null
      || ageMs < -60_000
      || action.freshnessMaxAgeMs === null
      || ageMs > action.freshnessMaxAgeMs)) {
      this.#recordFailure(circuitKey);
      await this.#reconcile(reservationId, "error", execution.costMicros, durationMs);
      throw new MatterhornCryptoAppAdapterError("adapter_output_stale");
    }

    await this.#reconcile(reservationId, "success", execution.costMicros, durationMs);
    this.#recordSuccess(circuitKey);
    const safeSource = quarantineUntrustedContent(execution.source);
    const safeBlockOrVersion = execution.blockOrVersion === null
      ? null
      : quarantineUntrustedContent(execution.blockOrVersion);
    return {
      version: MATTERHORN_CRYPTO_APP_RESULT_VERSION,
      app: {
        id: connection.appId,
        manifestRevision: connection.manifestRevision,
        connectionId: connection.id,
      },
      action: { id: action.id, access: action.access, network: request.network },
      timing: {
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
      },
      observation: {
        source: typeof safeSource === "string" ? safeSource : "[Matterhorn quarantined external source]",
        observedAt: observedAt?.toISOString() ?? null,
        blockOrVersion: typeof safeBlockOrVersion === "string" ? safeBlockOrVersion : null,
        ageMs,
        freshnessMaxAgeMs: action.freshnessMaxAgeMs,
      },
      provenance: {
        trust: "untrusted_external",
        sanitization: untrustedContentChanged(projected.value, quarantined) ? "quarantined" : "typed_projection",
        evidenceReference: `sha256:${sha256(execution.data)}`,
      },
      metering: { costMicros: execution.costMicros, reservationId },
      result: quarantined,
    };
  }

  #circuitOpen(key: string): boolean {
    const state = this.#circuits.get(key);
    if (!state) return false;
    const nowMs = this.#now().getTime();
    if (state.openUntilMs > nowMs) return true;
    if (state.openUntilMs > 0) this.#circuits.delete(key);
    return false;
  }

  #recordFailure(key: string): void {
    const state = this.#circuits.get(key) ?? { consecutiveFailures: 0, openUntilMs: 0 };
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= this.#circuitFailureThreshold) {
      state.openUntilMs = this.#now().getTime() + this.#circuitCooldownMs;
    }
    this.#circuits.set(key, state);
  }

  #recordSuccess(key: string): void {
    this.#circuits.delete(key);
  }

  async #reconcile(
    reservationId: string,
    outcome: "success" | "error" | "timeout",
    costMicros: number,
    durationMs: number,
  ): Promise<void> {
    try {
      await this.#authorization.reconcile({ reservationId, outcome, costMicros, durationMs: Math.max(0, durationMs) });
    } catch {
      throw new MatterhornCryptoAppAdapterError("adapter_usage_reconciliation_failed");
    }
  }
}
