import {
  MATTERHORN_CRYPTO_APP_RESULT_VERSION,
  type MatterhornCryptoAppAction,
  type MatterhornCryptoAppConnectionCredential,
  type MatterhornCryptoAppOpenApiOperation,
  type MatterhornCryptoAppResult,
  type MatterhornCryptoAppTransportKind,
} from "@matterhorn-work/types/crypto-coworkers";
import type { MatterhornAgentToolReceipt } from "@matterhorn-work/types/guarded-agent-runtime";

import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";
import { MatterhornBlockEvidenceCache } from "./crypto-context-compiler.js";
import {
  assertCryptoAdapterConnectedAddress,
  resolvePublicCryptoAdapterEndpoint,
  type MatterhornAdapterDnsResolver,
  type MatterhornResolvedAdapterEndpoint,
} from "./crypto-app-egress.js";
import { projectCryptoAppOutput, validateCryptoAppInput } from "./crypto-app-json-schema.js";
import {
  MatterhornCryptoAppOperationalPolicyError,
  type MatterhornCryptoAppOperationalPolicy,
} from "./crypto-app-operational-policy.js";
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
  consumedCapability?: {
    coworkerId: string;
    toolName: string;
    arguments: Record<string, unknown>;
  };
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
    consumedCapability?: MatterhornCryptoAppAdapterRequest["consumedCapability"];
  }): Promise<{ reservationId: string }>;
  reconcile(input: {
    reservationId: string;
    outcome: "success" | "error" | "timeout";
    costMicros: number;
    durationMs: number;
    evidence?: MatterhornAgentToolReceipt["evidence"];
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
  workspaceId?: string;
  connectionId?: string;
  appId: string;
  manifestRevision: string;
  action: MatterhornCryptoAppAction;
  network: string;
  arguments: Record<string, unknown>;
  credential: MatterhornCryptoAppConnectionCredential;
  openApiOperation?: MatterhornCryptoAppOpenApiOperation;
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
      | "adapter_quota_exceeded"
      | "adapter_cost_limit_exceeded"
      | "adapter_policy_unavailable"
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
  operationalPolicy?: MatterhornCryptoAppOperationalPolicy;
  publicEvidenceCache?: MatterhornBlockEvidenceCache<MatterhornCachedPublicCryptoAppEvidence>;
  validateCredential?: (input: {
    workspaceId: string;
    connectionId: string;
    appId: string;
    manifestRevision: string;
    credential: MatterhornCryptoAppConnectionCredential;
  }) => Promise<void>;
  resolveDns?: MatterhornAdapterDnsResolver;
  now?: () => Date;
  circuitFailureThreshold?: number;
  circuitCooldownMs?: number;
  timeout?: (milliseconds: number, abort: () => void) => { promise: Promise<never>; cancel: () => void };
};

type CircuitState = { consecutiveFailures: number; openUntilMs: number };
type OperationalReservation = { reservationId: string; reservedCostMicros: number };
export type MatterhornCachedPublicCryptoAppEvidence = Pick<
  MatterhornCryptoAppResult,
  "observation" | "provenance" | "result"
>;

const MAX_ARGUMENT_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 256 * 1024;

function nonEmpty(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function boundedIdentifier(value: string): boolean {
  return nonEmpty(value) && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}

function publicEvidenceCacheEligible(input: {
  action: MatterhornCryptoAppAction;
  manifestAuthentication: MatterhornCryptoAppConnectionCredential["type"];
  manifestScopes: string[];
  grantedScopes: string[];
  credential: MatterhornCryptoAppConnectionCredential;
}): boolean {
  return input.action.access === "read"
    && input.action.risk === "informational"
    && input.action.cachePolicy === "block_bound_public"
    && input.action.requiresFreshness
    && input.action.freshnessMaxAgeMs !== null
    && Number.isSafeInteger(input.action.freshnessMaxAgeMs)
    && input.action.freshnessMaxAgeMs > 0
    && input.action.requiredScopes.length === 0
    && input.manifestAuthentication === "none"
    && input.manifestScopes.length === 0
    && input.grantedScopes.length === 0
    && input.credential.type === "none";
}

function evidenceReceiptMetadata(input: {
  delivery: "live" | "certified_cache";
  appId: string;
  manifestRevision: string;
  actionId: string;
  network: string;
  result: unknown;
  observation: MatterhornCryptoAppResult["observation"];
}): NonNullable<MatterhornAgentToolReceipt["evidence"]> {
  const projectionHash = sha256({
    domain: "matterhorn:crypto-app-projection:v1",
    appId: input.appId,
    manifestRevision: input.manifestRevision,
    actionId: input.actionId,
    network: input.network,
    result: input.result,
  });
  return {
    delivery: input.delivery,
    observedAt: input.observation.observedAt,
    ageMs: input.observation.ageMs,
    freshnessMaxAgeMs: input.observation.freshnessMaxAgeMs,
    projectionHash,
    observationHash: sha256({
      domain: "matterhorn:crypto-app-observation:v1",
      appId: input.appId,
      manifestRevision: input.manifestRevision,
      actionId: input.actionId,
      network: input.network,
      observation: {
        source: input.observation.source,
        observedAt: input.observation.observedAt,
        blockOrVersion: input.observation.blockOrVersion,
      },
      projectionHash,
    }),
  };
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
  readonly #operationalPolicy: MatterhornCryptoAppOperationalPolicy | undefined;
  readonly #publicEvidenceCache: MatterhornBlockEvidenceCache<MatterhornCachedPublicCryptoAppEvidence>;
  readonly #validateCredential: RouterOptions["validateCredential"];
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
    this.#operationalPolicy = options.operationalPolicy;
    this.#publicEvidenceCache = options.publicEvidenceCache ?? new MatterhornBlockEvidenceCache();
    this.#validateCredential = options.validateCredential;
    this.#resolveDns = options.resolveDns;
    this.#now = options.now ?? (() => new Date());
    this.#circuitFailureThreshold = Math.max(1, options.circuitFailureThreshold ?? 3);
    this.#circuitCooldownMs = Math.max(1_000, options.circuitCooldownMs ?? 30_000);
    this.#timeout = options.timeout ?? timer;
  }

  async execute(request: MatterhornCryptoAppAdapterRequest): Promise<MatterhornCryptoAppResult> {
    if (![request.workspaceId, request.sessionId, request.runId, request.callId, request.connectionId, request.actionId, request.network]
      .every(boundedIdentifier)) throw new MatterhornCryptoAppAdapterError("adapter_request_invalid");
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
    if (connection.credential.type === "wallet_connection" && !this.#validateCredential) {
      throw new MatterhornCryptoAppAdapterError("adapter_connection_unavailable");
    }
    try {
      await this.#validateCredential?.({
        workspaceId: request.workspaceId,
        connectionId: connection.id,
        appId: connection.appId,
        manifestRevision: connection.manifestRevision,
        credential: structuredClone(connection.credential),
      });
    } catch {
      throw new MatterhornCryptoAppAdapterError("adapter_connection_unavailable");
    }
    const transportCredential: MatterhornCryptoAppConnectionCredential = connection.credential.type === "wallet_connection"
      ? { type: "none" }
      : structuredClone(connection.credential);

    const validated = validateCryptoAppInput(action.inputSchema, request.arguments);
    if (!validated.ok || !validated.value || typeof validated.value !== "object" || Array.isArray(validated.value)) {
      throw new MatterhornCryptoAppAdapterError("adapter_arguments_invalid", validated.issues);
    }
    const canonicalArguments = validated.value as Record<string, unknown>;
    const argumentsHash = sha256(canonicalArguments);
    const cacheEligible = publicEvidenceCacheEligible({
      action,
      manifestAuthentication: registryEntry.manifest.authentication.type,
      manifestScopes: registryEntry.manifest.authentication.scopes,
      grantedScopes: connection.grantedScopes,
      credential: connection.credential,
    });
    const cacheQuery = {
      workspaceId: request.workspaceId,
      connectionId: connection.id,
      connectionUpdatedAt: connection.updatedAt,
      grantedActionIds: [...connection.grantedActionIds].sort(),
      grantedNetworks: [...connection.grantedNetworks].sort(),
      appId: connection.appId,
      manifestRevision: connection.manifestRevision,
      manifestHash: registryEntry.manifestHash,
      certification: {
        state: registryEntry.certification.state,
        reportHash: registryEntry.certification.reportHash,
        runtimeReportHash: registryEntry.certification.runtimeReportHash,
        policyVersion: registryEntry.certification.policyVersion,
      },
      actionId: action.id,
      network: request.network,
      argumentsHash,
      outputProjectionSchemaHash: sha256(action.outputProjectionSchema),
    };
    const cached = cacheEligible
      ? this.#publicEvidenceCache.getLatest({
        venue: connection.appId,
        network: request.network,
        query: cacheQuery,
        now: this.#now(),
        maxAgeMs: Math.min(action.freshnessMaxAgeMs ?? 0, 60 * 60 * 1000),
      })
      : null;
    const circuitKey = `${request.workspaceId}\u0000${connection.id}\u0000${connection.appId}\u0000${connection.manifestRevision}\u0000${action.id}`;
    if (!cached && this.#circuitOpen(request.workspaceId, circuitKey)) {
      throw new MatterhornCryptoAppAdapterError("adapter_circuit_open");
    }

    let resolved: MatterhornResolvedAdapterEndpoint | null = null;
    let executor: MatterhornCryptoAppTransportExecutor | undefined;
    if (!cached) {
      try {
        resolved = await resolvePublicCryptoAdapterEndpoint(registryEntry.manifest.transport.endpoint, this.#resolveDns);
      } catch {
        if (!this.#recordFailure(request.workspaceId, circuitKey)) {
          throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
        }
        throw new MatterhornCryptoAppAdapterError("adapter_endpoint_blocked");
      }

      executor = this.#executors[registryEntry.manifest.transport.kind];
      if (!executor) throw new MatterhornCryptoAppAdapterError("adapter_transport_unavailable");
    }

    let operationalReservation: OperationalReservation | null = null;
    if (this.#operationalPolicy) {
      try {
        operationalReservation = this.#operationalPolicy.reserve({
          workspaceId: request.workspaceId,
          connectionId: request.connectionId,
          appId: connection.appId,
          manifestRevision: connection.manifestRevision,
          actionId: action.id,
          runId: request.runId,
          callId: request.callId,
          reservationClass: cached ? "public_block_cache" : "upstream",
        });
      } catch (error) {
        if (error instanceof MatterhornCryptoAppOperationalPolicyError
          && error.code === "crypto_app_daily_quota_exceeded") {
          throw new MatterhornCryptoAppAdapterError("adapter_quota_exceeded");
        }
        throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      }
    }

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
        consumedCapability: request.consumedCapability,
      });
      if (!nonEmpty(authorization.reservationId)) throw new Error("reservation_required");
      reservationId = authorization.reservationId;
    } catch {
      if (operationalReservation && this.#reconcileOperationalOnly(operationalReservation, "error", 0) !== "ok") {
        throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      }
      throw new MatterhornCryptoAppAdapterError("adapter_authorization_denied");
    }

    const startedAt = this.#now();
    if (cached) {
      const completedAt = this.#now();
      const observedAtMs = cached.value.observation.observedAt
        ? Date.parse(cached.value.observation.observedAt)
        : Number.NaN;
      const ageMs = completedAt.getTime() - observedAtMs;
      if (!Number.isFinite(observedAtMs)
        || ageMs < -60_000
        || action.freshnessMaxAgeMs === null
        || ageMs > action.freshnessMaxAgeMs) {
        await this.#reconcile(
          reservationId,
          operationalReservation,
          "error",
          0,
          Math.max(0, completedAt.getTime() - startedAt.getTime()),
        );
        throw new MatterhornCryptoAppAdapterError("adapter_output_stale");
      }
      const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
      const observation = {
        ...structuredClone(cached.value.observation),
        ageMs,
        freshnessMaxAgeMs: action.freshnessMaxAgeMs,
      };
      await this.#reconcile(
        reservationId,
        operationalReservation,
        "success",
        0,
        durationMs,
        evidenceReceiptMetadata({
          delivery: "certified_cache",
          appId: connection.appId,
          manifestRevision: connection.manifestRevision,
          actionId: action.id,
          network: request.network,
          result: cached.value.result,
          observation,
        }),
      );
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
        observation,
        provenance: {
          ...structuredClone(cached.value.provenance),
          delivery: "certified_cache",
        },
        metering: { costMicros: 0, reservationId },
        result: structuredClone(cached.value.result),
      };
    }

    if (!resolved || !executor) throw new MatterhornCryptoAppAdapterError("adapter_transport_unavailable");
    const controller = new AbortController();
    const timeout = this.#timeout(action.timeoutMs, () => controller.abort());
    let execution: MatterhornCryptoAppAdapterExecution;
    try {
      execution = await Promise.race([
        executor({
          endpoint: resolved.endpoint,
          approvedAddresses: [...resolved.approvedAddresses],
          workspaceId: request.workspaceId,
          connectionId: connection.id,
          appId: connection.appId,
          manifestRevision: connection.manifestRevision,
          action,
          network: request.network,
          arguments: canonicalArguments,
          credential: transportCredential,
          openApiOperation: registryEntry.manifest.transport.kind === "openapi"
            ? structuredClone(registryEntry.manifest.transport.operations?.find((operation) => operation.actionId === action.id))
            : undefined,
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
      const circuitRecorded = this.#recordFailure(request.workspaceId, circuitKey);
      await this.#reconcile(
        reservationId,
        operationalReservation,
        outcome,
        0,
        completedAt.getTime() - startedAt.getTime(),
      );
      if (!circuitRecorded) throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      if (outcome === "timeout") throw error;
      throw new MatterhornCryptoAppAdapterError("adapter_upstream_failed");
    } finally {
      timeout.cancel();
    }

    const completedAt = this.#now();
    const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
    if (!executionEnvelopeValid(execution)) {
      const circuitRecorded = this.#recordFailure(request.workspaceId, circuitKey);
      await this.#reconcile(reservationId, operationalReservation, "error", 0, durationMs);
      if (!circuitRecorded) throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      throw new MatterhornCryptoAppAdapterError("adapter_output_invalid");
    }
    try {
      assertCryptoAdapterConnectedAddress(resolved.approvedAddresses, execution.connectedAddress);
    } catch {
      const circuitRecorded = this.#recordFailure(request.workspaceId, circuitKey);
      await this.#reconcile(reservationId, operationalReservation, "error", 0, durationMs);
      if (!circuitRecorded) throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      throw new MatterhornCryptoAppAdapterError("adapter_connected_address_invalid");
    }
    if (operationalReservation && execution.costMicros > operationalReservation.reservedCostMicros) {
      const circuitRecorded = this.#recordFailure(request.workspaceId, circuitKey);
      await this.#reconcile(
        reservationId,
        operationalReservation,
        "error",
        execution.costMicros,
        durationMs,
      );
      if (!circuitRecorded) throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      throw new MatterhornCryptoAppAdapterError("adapter_cost_limit_exceeded");
    }
    const projected = projectCryptoAppOutput(action.outputProjectionSchema, execution.data);
    if (!projected.ok) {
      const circuitRecorded = this.#recordFailure(request.workspaceId, circuitKey);
      await this.#reconcile(reservationId, operationalReservation, "error", execution.costMicros, durationMs);
      if (!circuitRecorded) throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      throw new MatterhornCryptoAppAdapterError("adapter_output_invalid", projected.issues);
    }
    const quarantined = quarantineUntrustedContent(projected.value);
    if (Buffer.byteLength(canonicalJson(quarantined), "utf8") > MAX_RESULT_BYTES) {
      const circuitRecorded = this.#recordFailure(request.workspaceId, circuitKey);
      await this.#reconcile(reservationId, operationalReservation, "error", execution.costMicros, durationMs);
      if (!circuitRecorded) throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
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
      const circuitRecorded = this.#recordFailure(request.workspaceId, circuitKey);
      await this.#reconcile(reservationId, operationalReservation, "error", execution.costMicros, durationMs);
      if (!circuitRecorded) throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      throw new MatterhornCryptoAppAdapterError("adapter_output_stale");
    }

    const safeSource = quarantineUntrustedContent(execution.source);
    const safeBlockOrVersion = execution.blockOrVersion === null
      ? null
      : quarantineUntrustedContent(execution.blockOrVersion);
    const observation: MatterhornCryptoAppResult["observation"] = {
      source: typeof safeSource === "string" ? safeSource : "[Matterhorn quarantined external source]",
      observedAt: observedAt?.toISOString() ?? null,
      blockOrVersion: typeof safeBlockOrVersion === "string" ? safeBlockOrVersion : null,
      ageMs,
      freshnessMaxAgeMs: action.freshnessMaxAgeMs,
    };
    await this.#reconcile(
      reservationId,
      operationalReservation,
      "success",
      execution.costMicros,
      durationMs,
      evidenceReceiptMetadata({
        delivery: "live",
        appId: connection.appId,
        manifestRevision: connection.manifestRevision,
        actionId: action.id,
        network: request.network,
        result: quarantined,
        observation,
      }),
    );
    if (!this.#recordSuccess(request.workspaceId, circuitKey)) {
      throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
    }
    const result: MatterhornCryptoAppResult = {
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
      observation,
      provenance: {
        trust: "untrusted_external",
        sanitization: untrustedContentChanged(projected.value, quarantined) ? "quarantined" : "typed_projection",
        evidenceReference: `sha256:${sha256(execution.data)}`,
        delivery: "live",
      },
      metering: { costMicros: execution.costMicros, reservationId },
      result: quarantined,
    };
    if (cacheEligible && result.observation.observedAt && result.observation.blockOrVersion) {
      try {
        this.#publicEvidenceCache.put({
          venue: connection.appId,
          network: request.network,
          block: sha256({
            appId: connection.appId,
            network: request.network,
            blockOrVersion: execution.blockOrVersion,
          }),
          query: cacheQuery,
          value: {
            observation: structuredClone(result.observation),
            provenance: structuredClone(result.provenance),
            result: structuredClone(result.result),
          },
          observedAt: observedAt ?? undefined,
        });
      } catch {
        // Cache admission is a bounded optimization. A validated live result
        // remains authoritative when an entry is too large or otherwise unsafe.
      }
    }
    return result;
  }

  #circuitOpen(workspaceId: string, key: string): boolean {
    if (this.#operationalPolicy) {
      try {
        return this.#operationalPolicy.circuitOpen({ workspaceId, circuitKey: key });
      } catch {
        throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      }
    }
    const state = this.#circuits.get(key);
    if (!state) return false;
    const nowMs = this.#now().getTime();
    if (state.openUntilMs > nowMs) return true;
    if (state.openUntilMs > 0) this.#circuits.delete(key);
    return false;
  }

  #recordFailure(workspaceId: string, key: string): boolean {
    if (this.#operationalPolicy) {
      try {
        this.#operationalPolicy.recordFailure({ workspaceId, circuitKey: key });
        return true;
      } catch {
        return false;
      }
    }
    const state = this.#circuits.get(key) ?? { consecutiveFailures: 0, openUntilMs: 0 };
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= this.#circuitFailureThreshold) {
      state.openUntilMs = this.#now().getTime() + this.#circuitCooldownMs;
    }
    this.#circuits.set(key, state);
    return true;
  }

  #recordSuccess(workspaceId: string, key: string): boolean {
    if (this.#operationalPolicy) {
      try {
        this.#operationalPolicy.recordSuccess({ workspaceId, circuitKey: key });
        return true;
      } catch {
        return false;
      }
    }
    this.#circuits.delete(key);
    return true;
  }

  async #reconcile(
    reservationId: string,
    operationalReservation: OperationalReservation | null,
    outcome: "success" | "error" | "timeout",
    costMicros: number,
    durationMs: number,
    evidence?: MatterhornAgentToolReceipt["evidence"],
  ): Promise<void> {
    let authorizationFailed = false;
    try {
      await this.#authorization.reconcile({
        reservationId,
        outcome,
        costMicros,
        durationMs: Math.max(0, durationMs),
        ...(evidence ? { evidence: structuredClone(evidence) } : {}),
      });
    } catch {
      authorizationFailed = true;
    }
    if (operationalReservation) {
      const operational = this.#reconcileOperationalOnly(operationalReservation, outcome, costMicros);
      if (operational === "failed") throw new MatterhornCryptoAppAdapterError("adapter_policy_unavailable");
      if (operational === "over_limit") {
        throw new MatterhornCryptoAppAdapterError("adapter_cost_limit_exceeded");
      }
    }
    if (authorizationFailed) {
      throw new MatterhornCryptoAppAdapterError("adapter_usage_reconciliation_failed");
    }
  }

  #reconcileOperationalOnly(
    reservation: OperationalReservation,
    outcome: "success" | "error" | "timeout",
    costMicros: number,
  ): "ok" | "over_limit" | "failed" {
    try {
      const result = this.#operationalPolicy?.reconcile({
        reservationId: reservation.reservationId,
        outcome,
        actualCostMicros: costMicros,
      });
      if (!result) return "failed";
      return result.overCallLimit ? "over_limit" : "ok";
    } catch {
      return "failed";
    }
  }
}
