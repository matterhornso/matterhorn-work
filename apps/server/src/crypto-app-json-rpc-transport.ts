import { randomUUID } from "node:crypto";

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

const RESPONSE_KEYS = new Set(["jsonrpc", "id", "result"]);
const ERROR_RESPONSE_KEYS = new Set(["jsonrpc", "id", "error"]);
const ERROR_KEYS = new Set(["code", "message", "data"]);
const ENVELOPE_KEYS = new Set(["data", "source", "observedAt", "blockOrVersion"]);
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

type JsonRpcTransportOptions = {
  resolveCredentialHeaders?: MatterhornCryptoAppCredentialResolver;
  estimateCostMicros?: MatterhornCryptoAppCostEstimator;
  requestJson?: MatterhornPinnedJsonRequester;
  requestId?: () => string;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
};

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function validRequestId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 128
    && !CONTROL_CHARACTER.test(value);
}

function validMethod(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,127}$/.test(value);
}

function validNetwork(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 1
    && value.length <= 256
    && !CONTROL_CHARACTER.test(value);
}

function finiteCost(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("crypto_app_rpc_cost_invalid");
  return value;
}

function parseResponse(value: unknown, expectedId: string): {
  data: unknown;
  source: string;
  observedAt: string | null;
  blockOrVersion: string | null;
} {
  const response = record(value);
  if (!response || response.jsonrpc !== "2.0" || response.id !== expectedId || "method" in response) {
    throw new Error("crypto_app_rpc_response_invalid");
  }
  if ("error" in response) {
    const rpcError = record(response.error);
    if (Object.keys(response).some((key) => !ERROR_RESPONSE_KEYS.has(key))
      || !rpcError
      || Object.keys(rpcError).some((key) => !ERROR_KEYS.has(key))
      || !Number.isSafeInteger(rpcError.code)
      || typeof rpcError.message !== "string"
      || rpcError.message.length < 1
      || rpcError.message.length > 500
      || CONTROL_CHARACTER.test(rpcError.message)) {
      throw new Error("crypto_app_rpc_response_invalid");
    }
    // Upstream messages and data are deliberately not copied into Matterhorn
    // errors, logs, receipts, or model context.
    throw new Error("crypto_app_rpc_call_failed");
  }
  if (Object.keys(response).some((key) => !RESPONSE_KEYS.has(key))) {
    throw new Error("crypto_app_rpc_response_invalid");
  }
  const envelope = record(response.result);
  if (!envelope
    || Object.keys(envelope).some((key) => !ENVELOPE_KEYS.has(key))
    || !("data" in envelope)
    || typeof envelope.source !== "string"
    || envelope.source.length < 1
    || envelope.source.length > 200
    || CONTROL_CHARACTER.test(envelope.source)
    || (envelope.observedAt !== null && typeof envelope.observedAt !== "string")
    || (typeof envelope.observedAt === "string"
      && (envelope.observedAt.length > 100 || CONTROL_CHARACTER.test(envelope.observedAt)))
    || (envelope.blockOrVersion !== null
      && (typeof envelope.blockOrVersion !== "string"
        || envelope.blockOrVersion.length > 200
        || CONTROL_CHARACTER.test(envelope.blockOrVersion)))) {
    throw new Error("crypto_app_rpc_result_invalid");
  }
  return {
    data: envelope.data,
    source: envelope.source,
    observedAt: envelope.observedAt as string | null,
    blockOrVersion: envelope.blockOrVersion as string | null,
  };
}

/**
 * Restricted JSON-RPC 2.0 profile for certified crypto apps.
 *
 * One router-authorized call produces one request. The signed action id is the
 * exact RPC method; the already validated network and arguments are the only
 * params. Batch calls, notifications, discovery, subscriptions, callbacks,
 * caller-selected methods, and upstream cost claims do not exist here.
 */
export function createPinnedJsonRpcCryptoAppTransport(
  options: JsonRpcTransportOptions = {},
): MatterhornCryptoAppTransportExecutor {
  const requestJson = options.requestJson ?? createPinnedJsonRequester({
    maxRequestBytes: options.maxRequestBytes,
    maxResponseBytes: options.maxResponseBytes,
  });
  const requestId = options.requestId ?? randomUUID;

  return async (input): Promise<MatterhornCryptoAppAdapterExecution> => {
    if (input.signal.aborted) throw new Error("crypto_app_transport_aborted");
    if (input.approvedAddresses.length < 1) throw new Error("crypto_app_transport_address_required");
    if (!validMethod(input.action.id)) throw new Error("crypto_app_rpc_method_invalid");
    if (!validNetwork(input.network)) throw new Error("crypto_app_rpc_network_invalid");
    const id = requestId();
    if (!validRequestId(id)) throw new Error("crypto_app_rpc_request_id_invalid");
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
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      method: "POST",
      body: {
        jsonrpc: "2.0",
        id,
        method: input.action.id,
        params: { network: input.network, arguments: input.arguments },
      },
      signal: input.signal,
      headers: credentialHeaders,
    });
    const envelope = parseResponse(response.value, id);
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
