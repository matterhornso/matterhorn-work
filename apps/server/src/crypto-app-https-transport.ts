import { request as requestHttps, type RequestOptions } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import {
  connect as connectTls,
  type ConnectionOptions as TlsConnectionOptions,
  type TLSSocket,
} from "node:tls";

import type { MatterhornCryptoAppConnectionCredential } from "@matterhorn-work/types/crypto-coworkers";

import type {
  MatterhornCryptoAppAdapterExecution,
  MatterhornCryptoAppTransportExecutor,
} from "./crypto-app-adapter-router.js";
import { assertCryptoAdapterConnectedAddress } from "./crypto-app-egress.js";

type JsonObject = Record<string, unknown>;

export type MatterhornCryptoAppCredentialResolver = (input: {
  workspaceId?: string;
  connectionId?: string;
  appId: string;
  manifestRevision: string;
  credential: MatterhornCryptoAppConnectionCredential;
}) => Promise<Record<string, string>>;

export type MatterhornCryptoAppCostEstimator = (input: {
  appId: string;
  manifestRevision: string;
  actionId: string;
  requestBytes: number;
  responseBytes: number;
}) => number;

type HttpsRequest = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ClientRequest;

type TlsConnector = (options: TlsConnectionOptions) => TLSSocket;

type TransportOptions = {
  resolveCredentialHeaders?: MatterhornCryptoAppCredentialResolver;
  estimateCostMicros?: MatterhornCryptoAppCostEstimator;
  request?: HttpsRequest;
  tlsConnect?: TlsConnector;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
};

export type MatterhornPinnedJsonRequest = {
  endpoint: URL;
  approvedAddresses: readonly string[];
  /** Deliberately closed to the two JSON methods needed by certified adapters. */
  method?: "GET" | "POST";
  /** GET requests must omit the body. POST requests must provide JSON. */
  body?: unknown;
  signal: AbortSignal;
  headers?: Record<string, string>;
  /**
   * Server-owned MCP protocol metadata. Kept separate from credential headers
   * so an adapter credential can never spoof the negotiated protocol/session.
   */
  mcp?: {
    protocolVersion?: "2025-11-25";
    sessionId?: string;
    expectNotificationAccepted?: boolean;
  };
};

export type MatterhornPinnedJsonResponse = {
  value: unknown;
  connectedAddress: string;
  requestBytes: number;
  responseBytes: number;
  /** Present for MCP requests; optional keeps non-MCP requester test doubles source-compatible. */
  mcpSessionId?: string | null;
};

export type MatterhornPinnedJsonRequester = (
  input: MatterhornPinnedJsonRequest,
) => Promise<MatterhornPinnedJsonResponse>;

export type MatterhornPinnedFormRequest = {
  endpoint: URL;
  approvedAddresses: readonly string[];
  body: URLSearchParams;
  signal: AbortSignal;
};

export type MatterhornPinnedFormResponse = {
  value: unknown;
  connectedAddress: string;
  requestBytes: number;
  responseBytes: number;
};

export type MatterhornPinnedFormRequester = (
  input: MatterhornPinnedFormRequest,
) => Promise<MatterhornPinnedFormResponse>;

export type MatterhornPinnedBytesRequest = {
  endpoint: URL;
  approvedAddresses: readonly string[];
  method: "GET" | "PUT";
  body: Uint8Array | null;
  signal: AbortSignal;
  headers?: Record<string, string>;
  acceptedResponseTypes: readonly string[];
};

export type MatterhornPinnedBytesResponse = {
  bytes: Buffer;
  connectedAddress: string;
  requestBytes: number;
  responseBytes: number;
  headers: Headers;
};

export type MatterhornPinnedBytesRequester = (
  input: MatterhornPinnedBytesRequest,
) => Promise<MatterhornPinnedBytesResponse>;

const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_MAX_REQUEST_BYTES = 64 * 1024;
const FORBIDDEN_HEADERS = new Set([
  "accept",
  "connection",
  "content-type",
  "content-length",
  "expect",
  "forwarded",
  "host",
  "mcp-protocol-version",
  "mcp-session-id",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "user-agent",
  "via",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
]);
const ENVELOPE_KEYS = new Set(["data", "source", "observedAt", "blockOrVersion"]);
const SAFE_BYTES_HEADERS = new Set([
  "accept",
  "authorization",
  "content-type",
  "x-matterhorn-ciphertext-sha256",
]);

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function safeCredentialHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.trim().toLowerCase();
    if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name)
      || FORBIDDEN_HEADERS.has(name)
      || name.startsWith("sec-")
      || name.startsWith("x-forwarded-")) throw new Error("crypto_app_credential_header_forbidden");
    if (typeof rawValue !== "string" || /[\r\n\0]/.test(rawValue) || rawValue.length > 16_384) {
      throw new Error("crypto_app_credential_header_invalid");
    }
    result[name] = rawValue;
  }
  return result;
}

function safeBytesHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.trim().toLowerCase();
    if (!SAFE_BYTES_HEADERS.has(name)
      || typeof rawValue !== "string"
      || /[\r\n\0]/.test(rawValue)
      || rawValue.length > 16_384) {
      throw new Error("crypto_app_binary_header_invalid");
    }
    result[name] = rawValue;
  }
  return result;
}

function parseEnvelope(value: unknown): {
  data: unknown;
  source: string;
  observedAt: string | null;
  blockOrVersion: string | null;
} {
  const envelope = record(value);
  if (!envelope || Object.keys(envelope).some((key) => !ENVELOPE_KEYS.has(key)) || !("data" in envelope)) {
    throw new Error("crypto_app_transport_envelope_invalid");
  }
  if (typeof envelope.source !== "string" || envelope.source.length < 1 || envelope.source.length > 200) {
    throw new Error("crypto_app_transport_source_invalid");
  }
  if (envelope.observedAt !== null && typeof envelope.observedAt !== "string") {
    throw new Error("crypto_app_transport_observed_at_invalid");
  }
  if (envelope.blockOrVersion !== null
    && (typeof envelope.blockOrVersion !== "string" || envelope.blockOrVersion.length > 200)) {
    throw new Error("crypto_app_transport_block_invalid");
  }
  return {
    data: envelope.data,
    source: envelope.source,
    observedAt: envelope.observedAt,
    blockOrVersion: envelope.blockOrVersion,
  };
}

function finiteCost(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("crypto_app_transport_cost_invalid");
  return value;
}

function isJsonContentType(value: string | string[] | undefined): boolean {
  const mediaType = String(value ?? "").split(";", 1)[0]!.trim().toLowerCase();
  return mediaType === "application/json"
    || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(mediaType);
}

function safeMcpSessionId(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  if (Array.isArray(value)
    || value.length < 1
    || value.length > 1_024
    || /[^\x21-\x7e]/.test(value)) {
    throw new Error("crypto_app_mcp_session_invalid");
  }
  return value;
}

async function securePinnedSocket(input: {
  endpoint: URL;
  pinnedAddress: string;
  approvedAddresses: readonly string[];
  signal: AbortSignal;
  tlsConnect: TlsConnector;
}): Promise<TLSSocket> {
  const socket = input.tlsConnect({
    host: input.pinnedAddress,
    port: Number(input.endpoint.port || 443),
    servername: input.endpoint.hostname,
    rejectUnauthorized: true,
    ALPNProtocols: ["http/1.1"],
  });
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.removeListener("secureConnect", onSecure);
      socket.removeListener("error", onError);
      input.signal.removeEventListener("abort", onAbort);
    };
    const onSecure = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onAbort = () => {
      cleanup();
      socket.destroy(new Error("crypto_app_transport_aborted"));
      reject(new Error("crypto_app_transport_aborted"));
    };
    socket.once("secureConnect", onSecure);
    socket.once("error", onError);
    input.signal.addEventListener("abort", onAbort, { once: true });
    if (input.signal.aborted) onAbort();
  });
  try {
    assertCryptoAdapterConnectedAddress(input.approvedAddresses, socket.remoteAddress ?? "");
  } catch (error) {
    socket.destroy();
    throw error;
  }
  if (socket.alpnProtocol && socket.alpnProtocol !== "http/1.1") {
    socket.destroy();
    throw new Error("crypto_app_transport_http1_required");
  }
  return socket;
}

export function createPinnedJsonRequester(options: {
  request?: HttpsRequest;
  tlsConnect?: TlsConnector;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
} = {}): MatterhornPinnedJsonRequester {
  const request = options.request ?? requestHttps;
  const tlsConnect = options.tlsConnect ?? connectTls;
  const maxRequestBytes = Math.max(1_024, options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES);
  const maxResponseBytes = Math.max(1_024, options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);

  return async (input): Promise<MatterhornPinnedJsonResponse> => {
    if (input.signal.aborted) throw new Error("crypto_app_transport_aborted");
    if (input.endpoint.protocol !== "https:"
      || input.endpoint.username
      || input.endpoint.password
      || input.endpoint.hash
      || input.endpoint.href.length > 8_192) {
      throw new Error("crypto_app_transport_endpoint_invalid");
    }
    if (input.approvedAddresses.length < 1) throw new Error("crypto_app_transport_address_required");
    const method = input.method ?? "POST";
    if (method !== "GET" && method !== "POST") {
      throw new Error("crypto_app_transport_method_invalid");
    }
    if (method === "GET" && input.body !== undefined) {
      throw new Error("crypto_app_transport_body_forbidden");
    }
    if (method === "POST" && input.body === undefined) {
      throw new Error("crypto_app_transport_body_required");
    }
    if (input.mcp?.sessionId !== undefined) safeMcpSessionId(input.mcp.sessionId);
    if (input.mcp?.expectNotificationAccepted && method !== "POST") {
      throw new Error("crypto_app_mcp_notification_invalid");
    }
    const pinnedAddress = input.approvedAddresses[0]!;
    assertCryptoAdapterConnectedAddress(input.approvedAddresses, pinnedAddress);
    const headers = safeCredentialHeaders(input.headers ?? {});
    const body = method === "GET" ? "" : JSON.stringify(input.body);
    if (typeof body !== "string") throw new Error("crypto_app_transport_body_invalid");
    const requestBytes = Buffer.byteLength(body, "utf8");
    if (requestBytes > maxRequestBytes) throw new Error("crypto_app_transport_request_too_large");
    const socket = await securePinnedSocket({
      endpoint: input.endpoint,
      pinnedAddress,
      approvedAddresses: input.approvedAddresses,
      signal: input.signal,
      tlsConnect,
    });

    return new Promise<MatterhornPinnedJsonResponse>((resolve, reject) => {
      let settled = false;
      let client: ClientRequest | null = null;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", abort);
        socket.destroy();
        callback();
      };
      const abort = () => {
        client?.destroy(new Error("crypto_app_transport_aborted"));
        finish(() => reject(new Error("crypto_app_transport_aborted")));
      };
      try {
        client = request({
          protocol: "https:",
          hostname: input.endpoint.hostname,
          port: input.endpoint.port || 443,
          method,
          path: `${input.endpoint.pathname}${input.endpoint.search}`,
          servername: input.endpoint.hostname,
          rejectUnauthorized: true,
          agent: false,
          createConnection: () => socket,
          headers: {
            accept: input.mcp ? "application/json, text/event-stream" : "application/json",
            "user-agent": "Matterhorn-Crypto-App-Gateway/1",
            ...(method === "POST" ? {
              "content-type": "application/json",
              "content-length": String(requestBytes),
            } : {}),
            ...headers,
            ...(input.mcp?.protocolVersion
              ? { "mcp-protocol-version": input.mcp.protocolVersion }
              : {}),
            ...(input.mcp?.sessionId ? { "mcp-session-id": input.mcp.sessionId } : {}),
          },
          signal: input.signal,
        }, (response) => {
          const connectedAddress = socket.remoteAddress ?? "";
          let mcpSessionId: string | null;
          try {
            mcpSessionId = input.mcp ? safeMcpSessionId(response.headers["mcp-session-id"]) : null;
          } catch (error) {
            response.destroy();
            finish(() => reject(error));
            return;
          }
          if (input.mcp?.expectNotificationAccepted) {
            if (response.statusCode !== 202) {
              response.resume();
              finish(() => reject(new Error("crypto_app_mcp_notification_status_invalid")));
              return;
            }
            let responseBytes = 0;
            response.on("data", (chunk: Buffer | string) => {
              responseBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
              if (responseBytes > 0) response.destroy(new Error("crypto_app_mcp_notification_body_invalid"));
            });
            response.on("error", (error) => finish(() => reject(error)));
            response.on("end", () => finish(() => resolve({
              value: null,
              connectedAddress,
              requestBytes,
              responseBytes,
              mcpSessionId,
            })));
            return;
          }
          if (!isJsonContentType(response.headers["content-type"])) {
            response.destroy();
            finish(() => reject(new Error("crypto_app_transport_content_type_invalid")));
            return;
          }
          if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
            response.resume();
            finish(() => reject(new Error("crypto_app_transport_status_invalid")));
            return;
          }
          const chunks: Buffer[] = [];
          let responseBytes = 0;
          response.on("data", (chunk: Buffer | string) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            responseBytes += bytes.length;
            if (responseBytes > maxResponseBytes) {
              response.destroy(new Error("crypto_app_transport_response_too_large"));
              return;
            }
            chunks.push(bytes);
          });
          response.on("error", (error) => finish(() => reject(error)));
          response.on("end", () => {
            try {
              const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              finish(() => resolve({ value, connectedAddress, requestBytes, responseBytes, mcpSessionId }));
            } catch (error) {
              finish(() => reject(error));
            }
          });
        });
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      client.on("error", (error) => finish(() => reject(error)));
      if (input.signal.aborted) {
        abort();
        return;
      }
      input.signal.addEventListener("abort", abort, { once: true });
      if (method === "GET") client.end();
      else client.end(body);
    });
  };
}

/**
 * Closed OAuth token-endpoint transport. It only sends an encoded POST body,
 * accepts JSON, pins the TLS peer to the DNS result selected by Matterhorn,
 * follows no redirects, and never accepts caller-controlled headers.
 */
export function createPinnedFormRequester(options: {
  request?: HttpsRequest;
  tlsConnect?: TlsConnector;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
} = {}): MatterhornPinnedFormRequester {
  const request = options.request ?? requestHttps;
  const tlsConnect = options.tlsConnect ?? connectTls;
  const maxRequestBytes = Math.max(1_024, options.maxRequestBytes ?? 32 * 1_024);
  const maxResponseBytes = Math.max(1_024, options.maxResponseBytes ?? 64 * 1_024);

  return async (input): Promise<MatterhornPinnedFormResponse> => {
    if (input.signal.aborted) throw new Error("crypto_app_oauth_transport_aborted");
    if (input.endpoint.protocol !== "https:"
      || input.endpoint.username
      || input.endpoint.password
      || input.endpoint.hash
      || input.endpoint.href.length > 8_192) {
      throw new Error("crypto_app_oauth_endpoint_invalid");
    }
    if (input.approvedAddresses.length < 1) throw new Error("crypto_app_oauth_address_required");
    const pinnedAddress = input.approvedAddresses[0]!;
    assertCryptoAdapterConnectedAddress(input.approvedAddresses, pinnedAddress);
    const body = input.body.toString();
    const requestBytes = Buffer.byteLength(body, "utf8");
    if (requestBytes > maxRequestBytes) throw new Error("crypto_app_oauth_request_too_large");
    const socket = await securePinnedSocket({
      endpoint: input.endpoint,
      pinnedAddress,
      approvedAddresses: input.approvedAddresses,
      signal: input.signal,
      tlsConnect,
    });

    return new Promise<MatterhornPinnedFormResponse>((resolve, reject) => {
      let settled = false;
      let client: ClientRequest | null = null;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", abort);
        socket.destroy();
        callback();
      };
      const abort = () => {
        client?.destroy(new Error("crypto_app_oauth_transport_aborted"));
        finish(() => reject(new Error("crypto_app_oauth_transport_aborted")));
      };
      try {
        client = request({
          protocol: "https:",
          hostname: input.endpoint.hostname,
          port: input.endpoint.port || 443,
          method: "POST",
          path: `${input.endpoint.pathname}${input.endpoint.search}`,
          servername: input.endpoint.hostname,
          rejectUnauthorized: true,
          agent: false,
          createConnection: () => socket,
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
            "content-length": String(requestBytes),
            "user-agent": "Matterhorn-Crypto-App-OAuth/1",
          },
          signal: input.signal,
        }, (response) => {
          const connectedAddress = socket.remoteAddress ?? "";
          if (!isJsonContentType(response.headers["content-type"])) {
            response.destroy();
            finish(() => reject(new Error("crypto_app_oauth_content_type_invalid")));
            return;
          }
          if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
            response.resume();
            finish(() => reject(new Error("crypto_app_oauth_status_invalid")));
            return;
          }
          const chunks: Buffer[] = [];
          let responseBytes = 0;
          response.on("data", (chunk: Buffer | string) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            responseBytes += bytes.length;
            if (responseBytes > maxResponseBytes) {
              response.destroy(new Error("crypto_app_oauth_response_too_large"));
              return;
            }
            chunks.push(bytes);
          });
          response.on("error", (error) => finish(() => reject(error)));
          response.on("end", () => {
            try {
              const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
              finish(() => resolve({ value, connectedAddress, requestBytes, responseBytes }));
            } catch {
              finish(() => reject(new Error("crypto_app_oauth_response_invalid")));
            }
          });
        });
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      client.on("error", (error) => finish(() => reject(error)));
      if (input.signal.aborted) {
        abort();
        return;
      }
      input.signal.addEventListener("abort", abort, { once: true });
      client.end(body);
    });
  };
}

/**
 * Minimal binary HTTPS requester for first-party encrypted evidence transport.
 * It retains the gateway's DNS/TLS peer pinning and deliberately supports only
 * GET and PUT, a closed header set, bounded responses, and no redirect path.
 */
export function createPinnedBytesRequester(options: {
  request?: HttpsRequest;
  tlsConnect?: TlsConnector;
  maxResponseBytes?: number;
} = {}): MatterhornPinnedBytesRequester {
  const request = options.request ?? requestHttps;
  const tlsConnect = options.tlsConnect ?? connectTls;
  const maxResponseBytes = Math.max(1_024, options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);

  return async (input): Promise<MatterhornPinnedBytesResponse> => {
    if (input.signal.aborted) throw new Error("crypto_app_transport_aborted");
    if (input.approvedAddresses.length < 1) throw new Error("crypto_app_transport_address_required");
    if (input.method === "GET" && input.body !== null) throw new Error("crypto_app_binary_body_forbidden");
    const acceptedTypes = input.acceptedResponseTypes.map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (acceptedTypes.length < 1 || acceptedTypes.some((value) => /[\r\n\0]/.test(value))) {
      throw new Error("crypto_app_binary_response_type_invalid");
    }
    const pinnedAddress = input.approvedAddresses[0]!;
    assertCryptoAdapterConnectedAddress(input.approvedAddresses, pinnedAddress);
    const headers = safeBytesHeaders(input.headers ?? {});
    const body = input.body === null ? Buffer.alloc(0) : Buffer.from(input.body);
    const socket = await securePinnedSocket({
      endpoint: input.endpoint,
      pinnedAddress,
      approvedAddresses: input.approvedAddresses,
      signal: input.signal,
      tlsConnect,
    });

    return new Promise<MatterhornPinnedBytesResponse>((resolve, reject) => {
      let settled = false;
      let client: ClientRequest | null = null;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener("abort", abort);
        socket.destroy();
        callback();
      };
      const abort = () => {
        client?.destroy(new Error("crypto_app_transport_aborted"));
        finish(() => reject(new Error("crypto_app_transport_aborted")));
      };
      try {
        client = request({
          protocol: "https:",
          hostname: input.endpoint.hostname,
          port: input.endpoint.port || 443,
          method: input.method,
          path: `${input.endpoint.pathname}${input.endpoint.search}`,
          servername: input.endpoint.hostname,
          rejectUnauthorized: true,
          agent: false,
          createConnection: () => socket,
          headers: {
            "content-length": String(body.length),
            "user-agent": "Matterhorn-Encrypted-Evidence/1",
            ...headers,
          },
          signal: input.signal,
        }, (response) => {
          const connectedAddress = socket.remoteAddress ?? "";
          const contentType = String(response.headers["content-type"] ?? "").split(";", 1)[0]!.trim().toLowerCase();
          if ((response.statusCode ?? 0) < 200 || (response.statusCode ?? 0) >= 300) {
            response.resume();
            finish(() => reject(new Error("crypto_app_binary_status_invalid")));
            return;
          }
          if (!acceptedTypes.includes(contentType)) {
            response.destroy();
            finish(() => reject(new Error("crypto_app_binary_content_type_invalid")));
            return;
          }
          const chunks: Buffer[] = [];
          let responseBytes = 0;
          response.on("data", (chunk: Buffer | string) => {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            responseBytes += bytes.length;
            if (responseBytes > maxResponseBytes) {
              response.destroy(new Error("crypto_app_binary_response_too_large"));
              return;
            }
            chunks.push(bytes);
          });
          response.on("error", (error) => finish(() => reject(error)));
          response.on("end", () => finish(() => resolve({
            bytes: Buffer.concat(chunks),
            connectedAddress,
            requestBytes: body.length,
            responseBytes,
            headers: new Headers(Object.entries(response.headers).flatMap(([name, value]) => {
              if (Array.isArray(value)) return value.map((item) => [name, item] as [string, string]);
              return value === undefined ? [] : [[name, String(value)] as [string, string]];
            })),
          })));
        });
      } catch (error) {
        finish(() => reject(error));
        return;
      }
      client.on("error", (error) => finish(() => reject(error)));
      if (input.signal.aborted) {
        abort();
        return;
      }
      input.signal.addEventListener("abort", abort, { once: true });
      client.end(body);
    });
  };
}

export function createPinnedJsonCryptoAppTransport(
  options: TransportOptions = {},
): MatterhornCryptoAppTransportExecutor {
  const requestJson = createPinnedJsonRequester({
    request: options.request,
    tlsConnect: options.tlsConnect,
    maxRequestBytes: options.maxRequestBytes,
    maxResponseBytes: options.maxResponseBytes,
  });

  return async (input): Promise<MatterhornCryptoAppAdapterExecution> => {
    if (input.signal.aborted) throw new Error("crypto_app_transport_aborted");
    if (input.approvedAddresses.length < 1) throw new Error("crypto_app_transport_address_required");
    const credentialHeaders = input.credential.type === "none"
      ? {}
      : safeCredentialHeaders(await (options.resolveCredentialHeaders
        ? options.resolveCredentialHeaders({
          workspaceId: input.workspaceId,
          connectionId: input.connectionId,
          appId: input.appId,
          manifestRevision: input.manifestRevision,
          credential: input.credential,
        })
        : Promise.reject(new Error("crypto_app_credential_resolver_unavailable"))));

    const requestBody = {
      version: "matterhorn.crypto-app-call.v1",
      appId: input.appId,
      manifestRevision: input.manifestRevision,
      actionId: input.action.id,
      network: input.network,
      arguments: input.arguments,
    };
    const response = await requestJson({
      endpoint: input.endpoint,
      approvedAddresses: input.approvedAddresses,
      body: requestBody,
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
