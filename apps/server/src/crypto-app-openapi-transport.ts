import type {
  MatterhornCryptoAppAdapterExecution,
  MatterhornCryptoAppTransportExecutor,
} from "./crypto-app-adapter-router.js";
import {
  createPinnedJsonRequester,
  type MatterhornCryptoAppCostEstimator,
  type MatterhornCryptoAppCredentialResolver,
  type MatterhornPinnedJsonRequester,
} from "./crypto-app-https-transport.js";

type JsonObject = Record<string, unknown>;

const ENVELOPE_KEYS = new Set(["data", "source", "observedAt", "blockOrVersion"]);
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const SAFE_PATH = /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@-]+\/)*[A-Za-z0-9._~!$&'()*+,;=:@-]+$/;

type OpenApiTransportOptions = {
  resolveCredentialHeaders?: MatterhornCryptoAppCredentialResolver;
  estimateCostMicros?: MatterhornCryptoAppCostEstimator;
  requestJson?: MatterhornPinnedJsonRequester;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
};

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function finiteCost(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("crypto_app_openapi_cost_invalid");
  return value;
}

function exactOrigin(endpoint: URL): boolean {
  return endpoint.protocol === "https:"
    && !endpoint.username
    && !endpoint.password
    && endpoint.pathname === "/"
    && !endpoint.search
    && !endpoint.hash;
}

function exactOperation(input: Parameters<MatterhornCryptoAppTransportExecutor>[0]): URL {
  const operation = input.openApiOperation;
  if (!operation
    || operation.actionId !== input.action.id
    || operation.method !== "POST"
    || operation.path.length < 1
    || operation.path.length > 512
    || !SAFE_PATH.test(operation.path)
    || operation.path.split("/").some((segment) => segment === "." || segment === "..")
    || !exactOrigin(input.endpoint)) {
    throw new Error("crypto_app_openapi_operation_invalid");
  }
  return new URL(operation.path, input.endpoint.origin);
}

function parseEnvelope(value: unknown): {
  data: unknown;
  source: string;
  observedAt: string | null;
  blockOrVersion: string | null;
} {
  const envelope = record(value);
  if (!envelope
    || Object.keys(envelope).some((key) => !ENVELOPE_KEYS.has(key))
    || !("data" in envelope)
    || typeof envelope.source !== "string"
    || envelope.source.length < 1
    || envelope.source.length > 200
    || CONTROL_CHARACTER.test(envelope.source)
    || (envelope.observedAt !== null
      && (typeof envelope.observedAt !== "string"
        || envelope.observedAt.length > 100
        || CONTROL_CHARACTER.test(envelope.observedAt)))
    || (envelope.blockOrVersion !== null
      && (typeof envelope.blockOrVersion !== "string"
        || envelope.blockOrVersion.length > 200
        || CONTROL_CHARACTER.test(envelope.blockOrVersion)))) {
    throw new Error("crypto_app_openapi_response_invalid");
  }
  return {
    data: envelope.data,
    source: envelope.source,
    observedAt: envelope.observedAt as string | null,
    blockOrVersion: envelope.blockOrVersion as string | null,
  };
}

/**
 * Restricted OpenAPI action profile. The signed manifest—not an API document,
 * model, browser, or upstream response—selects one exact POST path per action.
 */
export function createPinnedOpenApiCryptoAppTransport(
  options: OpenApiTransportOptions = {},
): MatterhornCryptoAppTransportExecutor {
  const requestJson = options.requestJson ?? createPinnedJsonRequester({
    maxRequestBytes: options.maxRequestBytes,
    maxResponseBytes: options.maxResponseBytes,
  });

  return async (input): Promise<MatterhornCryptoAppAdapterExecution> => {
    if (input.signal.aborted) throw new Error("crypto_app_transport_aborted");
    if (input.approvedAddresses.length < 1) throw new Error("crypto_app_transport_address_required");
    const endpoint = exactOperation(input);
    const credentialHeaders = input.credential.type === "none"
      ? {}
      : await (options.resolveCredentialHeaders
        ? options.resolveCredentialHeaders({
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
          appId: input.appId,
          manifestRevision: input.manifestRevision,
          credential: input.credential,
        })
        : Promise.reject(new Error("crypto_app_credential_resolver_unavailable")));
    const response = await requestJson({
      endpoint,
      approvedAddresses: input.approvedAddresses,
      method: "POST",
      body: {
        version: "matterhorn.openapi-action-call.v1",
        appId: input.appId,
        manifestRevision: input.manifestRevision,
        actionId: input.action.id,
        network: input.network,
        arguments: input.arguments,
      },
      signal: input.signal,
      headers: credentialHeaders,
    });
    const envelope = parseEnvelope(response.value);
    const costMicros = finiteCost(options.estimateCostMicros?.({
      appId: input.appId,
      manifestRevision: input.manifestRevision,
      actionId: input.action.id,
      requestBytes: response.requestBytes,
      responseBytes: response.responseBytes,
    }) ?? 0);
    return { ...envelope, costMicros, connectedAddress: response.connectedAddress };
  };
}
