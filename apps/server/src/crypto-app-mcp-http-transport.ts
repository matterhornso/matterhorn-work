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

const MCP_PROTOCOL_VERSION = "2025-11-25" as const;
const INITIALIZE_ID = "matterhorn-initialize";
const TOOL_CALL_ID = "matterhorn-tool-call";
const ENVELOPE_KEYS = new Set(["data", "source", "observedAt", "blockOrVersion"]);
const TOOL_RESULT_KEYS = new Set(["content", "structuredContent", "isError", "_meta"]);
const JSON_RPC_RESULT_KEYS = new Set(["jsonrpc", "id", "result"]);

type McpTransportOptions = {
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
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("crypto_app_mcp_cost_invalid");
  return value;
}

function responseResult(value: unknown, expectedId: string): JsonObject {
  const response = record(value);
  if (!response
    || Object.keys(response).some((key) => !JSON_RPC_RESULT_KEYS.has(key))
    || response.jsonrpc !== "2.0"
    || response.id !== expectedId
    || "method" in response
    || "error" in response
    || !record(response.result)) {
    throw new Error("crypto_app_mcp_response_invalid");
  }
  return response.result as JsonObject;
}

function validateInitialization(value: unknown): void {
  const result = responseResult(value, INITIALIZE_ID);
  const capabilities = record(result.capabilities);
  const serverInfo = record(result.serverInfo);
  if (result.protocolVersion !== MCP_PROTOCOL_VERSION
    || !capabilities
    || !record(capabilities.tools)
    || !serverInfo
    || typeof serverInfo.name !== "string"
    || serverInfo.name.length < 1
    || serverInfo.name.length > 200
    || typeof serverInfo.version !== "string"
    || serverInfo.version.length < 1
    || serverInfo.version.length > 100) {
    throw new Error("crypto_app_mcp_initialize_invalid");
  }
}

function parseToolResult(value: unknown): {
  data: unknown;
  source: string;
  observedAt: string | null;
  blockOrVersion: string | null;
} {
  const result = responseResult(value, TOOL_CALL_ID);
  if (Object.keys(result).some((key) => !TOOL_RESULT_KEYS.has(key))
    || !Array.isArray(result.content)
    || (result.isError !== undefined && typeof result.isError !== "boolean")
    || result.isError === true) {
    throw new Error("crypto_app_mcp_tool_failed");
  }
  const envelope = record(result.structuredContent);
  if (!envelope
    || Object.keys(envelope).some((key) => !ENVELOPE_KEYS.has(key))
    || !("data" in envelope)
    || typeof envelope.source !== "string"
    || envelope.source.length < 1
    || envelope.source.length > 200
    || (envelope.observedAt !== null && typeof envelope.observedAt !== "string")
    || (envelope.blockOrVersion !== null
      && (typeof envelope.blockOrVersion !== "string" || envelope.blockOrVersion.length > 200))) {
    throw new Error("crypto_app_mcp_structured_content_invalid");
  }
  return {
    data: envelope.data,
    source: envelope.source,
    observedAt: envelope.observedAt as string | null,
    blockOrVersion: envelope.blockOrVersion as string | null,
  };
}

function assertStableSession(expected: string | null, actual: string | null): void {
  if (actual !== null && actual !== expected) throw new Error("crypto_app_mcp_session_changed");
}

/**
 * Restricted MCP Streamable HTTP profile for certified crypto apps.
 *
 * The gateway performs only initialize -> initialized -> one exact tools/call.
 * It intentionally does not list or invoke model-selected tools and does not
 * support prompts, resources, sampling, elicitation, tasks, SSE, or server-
 * initiated requests. Only `structuredContent` in Matterhorn's closed evidence
 * envelope crosses into the adapter result boundary.
 */
export function createPinnedMcpHttpCryptoAppTransport(
  options: McpTransportOptions = {},
): MatterhornCryptoAppTransportExecutor {
  const requestJson = options.requestJson ?? createPinnedJsonRequester({
    maxRequestBytes: options.maxRequestBytes,
    maxResponseBytes: options.maxResponseBytes,
  });

  return async (input): Promise<MatterhornCryptoAppAdapterExecution> => {
    if (input.signal.aborted) throw new Error("crypto_app_transport_aborted");
    if (input.approvedAddresses.length < 1) throw new Error("crypto_app_transport_address_required");
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

    let requestBytes = 0;
    let responseBytes = 0;
    const initialize = await requestJson({
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      method: "POST",
      body: {
        jsonrpc: "2.0",
        id: INITIALIZE_ID,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "matterhorn-crypto-app-gateway", version: "1" },
        },
      },
      signal: input.signal,
      headers: credentialHeaders,
      mcp: {},
    });
    requestBytes += initialize.requestBytes;
    responseBytes += initialize.responseBytes;
    validateInitialization(initialize.value);
    const sessionId = initialize.mcpSessionId ?? null;

    const initialized = await requestJson({
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      method: "POST",
      body: { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
      signal: input.signal,
      headers: credentialHeaders,
      mcp: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        ...(sessionId ? { sessionId } : {}),
        expectNotificationAccepted: true,
      },
    });
    requestBytes += initialized.requestBytes;
    responseBytes += initialized.responseBytes;
    assertStableSession(sessionId, initialized.mcpSessionId ?? null);

    const toolCall = await requestJson({
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      method: "POST",
      body: {
        jsonrpc: "2.0",
        id: TOOL_CALL_ID,
        method: "tools/call",
        params: { name: input.action.id, arguments: input.arguments },
      },
      signal: input.signal,
      headers: credentialHeaders,
      mcp: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        ...(sessionId ? { sessionId } : {}),
      },
    });
    requestBytes += toolCall.requestBytes;
    responseBytes += toolCall.responseBytes;
    assertStableSession(sessionId, toolCall.mcpSessionId ?? null);
    if (initialize.connectedAddress !== initialized.connectedAddress
      || initialize.connectedAddress !== toolCall.connectedAddress) {
      throw new Error("crypto_app_mcp_peer_changed");
    }
    const envelope = parseToolResult(toolCall.value);
    const costMicros = finiteCost(options.estimateCostMicros?.({
      appId: input.appId,
      manifestRevision: input.manifestRevision,
      actionId: input.action.id,
      requestBytes,
      responseBytes,
    }) ?? 0);
    return { ...envelope, costMicros, connectedAddress: toolCall.connectedAddress };
  };
}
