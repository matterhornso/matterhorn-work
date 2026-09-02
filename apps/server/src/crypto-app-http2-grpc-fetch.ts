import {
  connect as connectHttp2,
  constants as http2Constants,
  type ClientHttp2Session,
  type ClientHttp2Stream,
  type ClientSessionOptions,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
  type SecureClientSessionOptions,
} from "node:http2";
import {
  connect as connectTls,
  type ConnectionOptions as TlsConnectionOptions,
  type TLSSocket,
} from "node:tls";

import { assertCryptoAdapterConnectedAddress } from "./crypto-app-egress.js";

export type MatterhornGrpcTransportObservation = {
  connectedAddress: string;
  requestBytes: number;
  responseBytes: number;
  path: string;
};

type TlsConnector = (options: TlsConnectionOptions) => TLSSocket;
type Http2Connector = (
  authority: string | URL,
  options: ClientSessionOptions | SecureClientSessionOptions,
) => ClientHttp2Session;

type PinnedGrpcFetchOptions = {
  endpoint: URL;
  approvedAddresses: readonly string[];
  outerSignal: AbortSignal;
  onObservation?: (observation: MatterhornGrpcTransportObservation) => void;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  tlsConnect?: TlsConnector;
  http2Connect?: Http2Connector;
};

const GET_BALANCE_PATH = "/sui.rpc.v2.StateService/GetBalance";
const GET_COIN_INFO_PATH = "/sui.rpc.v2.StateService/GetCoinInfo";
const LIST_OWNED_OBJECTS_PATH = "/sui.rpc.v2.StateService/ListOwnedObjects";
const GET_SERVICE_INFO_PATH = "/sui.rpc.v2.LedgerService/GetServiceInfo";
const BATCH_GET_OBJECTS_PATH = "/sui.rpc.v2.LedgerService/BatchGetObjects";
const GET_TRANSACTION_PATH = "/sui.rpc.v2.LedgerService/GetTransaction";
const GET_MOVE_FUNCTION_PATH = "/sui.rpc.v2.MovePackageService/GetFunction";
const SIMULATE_TRANSACTION_PATH = "/sui.rpc.v2.TransactionExecutionService/SimulateTransaction";
const ALLOWED_GRPC_PATHS = new Set([
  GET_BALANCE_PATH,
  GET_COIN_INFO_PATH,
  LIST_OWNED_OBJECTS_PATH,
  GET_SERVICE_INFO_PATH,
  BATCH_GET_OBJECTS_PATH,
  GET_TRANSACTION_PATH,
  GET_MOVE_FUNCTION_PATH,
  SIMULATE_TRANSACTION_PATH,
]);
const DEFAULT_MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const ALLOWED_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "grpc-timeout",
  "x-grpc-web",
  "x-user-agent",
]);

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return new URL(input.href);
  if (typeof input === "string") return new URL(input);
  if (typeof Request !== "undefined" && input instanceof Request) return new URL(input.url);
  throw new Error("crypto_app_grpc_url_invalid");
}

function bodyBytes(body: BodyInit | null | undefined): Buffer {
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body, "utf8");
  throw new Error("crypto_app_grpc_body_invalid");
}

function assertUnaryGrpcWebFrame(body: Buffer, maxRequestBytes: number): void {
  if (body.length < 5 || body.length > maxRequestBytes) {
    throw new Error("crypto_app_grpc_request_size_invalid");
  }
  // A unary gRPC-web request is one uncompressed data frame. Its protobuf
  // payload may legitimately be empty (for example GetServiceInfo), but the
  // five-byte frame header must always be present and internally consistent.
  if (body[0] !== 0 || body.readUInt32BE(1) !== body.length - 5) {
    throw new Error("crypto_app_grpc_request_frame_invalid");
  }
}

function mergeSignals(primary: AbortSignal, secondary?: AbortSignal | null): AbortSignal {
  if (!secondary || secondary === primary) return primary;
  return AbortSignal.any([primary, secondary]);
}

function validateEndpoint(endpoint: URL): string {
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("crypto_app_grpc_endpoint_invalid");
  }
  return endpoint.pathname === "/" ? "" : endpoint.pathname.replace(/\/$/, "");
}

function isAllowedGrpcUrl(endpoint: URL, basePath: string, target: URL): boolean {
  if (target.origin !== endpoint.origin || target.search || target.hash) return false;
  for (const path of ALLOWED_GRPC_PATHS) {
    if (target.pathname === `${basePath}${path}`) return true;
  }
  return false;
}

function requestHeaders(input?: HeadersInit): Record<string, string> {
  const headers = new Headers(input);
  const result: Record<string, string> = {};
  for (const [rawName, value] of headers.entries()) {
    const name = rawName.toLowerCase();
    if (!ALLOWED_REQUEST_HEADERS.has(name) || /[\r\n\0]/.test(value)) {
      throw new Error("crypto_app_grpc_header_forbidden");
    }
    result[name] = value;
  }
  if (result["content-type"] !== "application/grpc-web+proto" || result["x-grpc-web"] !== "1") {
    throw new Error("crypto_app_grpc_header_invalid");
  }
  if (result["grpc-timeout"] && !/^[1-9][0-9]{0,7}[HMSmun]$/.test(result["grpc-timeout"])) {
    throw new Error("crypto_app_grpc_timeout_invalid");
  }
  return result;
}

function responseHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (name.startsWith(":")) continue;
    if (Array.isArray(value)) value.forEach((item) => result.append(name, item));
    else if (value !== undefined) result.set(name, String(value));
  }
  return result;
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
    ALPNProtocols: ["h2"],
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
      socket.destroy(new Error("crypto_app_grpc_aborted"));
      reject(new Error("crypto_app_grpc_aborted"));
    };
    socket.once("secureConnect", onSecure);
    socket.once("error", onError);
    input.signal.addEventListener("abort", onAbort, { once: true });
    if (input.signal.aborted) onAbort();
  });
  const connectedAddress = socket.remoteAddress ?? "";
  try {
    assertCryptoAdapterConnectedAddress(input.approvedAddresses, connectedAddress);
  } catch (error) {
    socket.destroy();
    throw error;
  }
  if (socket.alpnProtocol !== "h2") {
    socket.destroy();
    throw new Error("crypto_app_grpc_http2_required");
  }
  return socket;
}

function performRequest(input: {
  session: ClientHttp2Session;
  headers: OutgoingHttpHeaders;
  body: Buffer;
  signal: AbortSignal;
  maxResponseBytes: number;
}): Promise<{ status: number; headers: Headers; body: Buffer }> {
  return new Promise((resolve, reject) => {
    let stream: ClientHttp2Stream;
    let settled = false;
    let status = 0;
    let headers = new Headers();
    const chunks: Buffer[] = [];
    let responseBytes = 0;
    const cleanup = () => {
      input.signal.removeEventListener("abort", onAbort);
      input.session.removeListener("error", onSessionError);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onSessionError = (error: Error) => finish(() => reject(error));
    const onAbort = () => {
      stream?.close(http2Constants.NGHTTP2_CANCEL);
      finish(() => reject(new Error("crypto_app_grpc_aborted")));
    };
    try {
      stream = input.session.request(input.headers, { endStream: false });
    } catch (error) {
      reject(error);
      return;
    }
    stream.on("response", (incoming) => {
      status = Number(incoming[http2Constants.HTTP2_HEADER_STATUS] ?? 0);
      headers = responseHeaders(incoming);
    });
    stream.on("data", (chunk: Buffer | Uint8Array) => {
      const bytes = Buffer.from(chunk);
      responseBytes += bytes.length;
      if (responseBytes > input.maxResponseBytes) {
        stream.close(http2Constants.NGHTTP2_CANCEL);
        finish(() => reject(new Error("crypto_app_grpc_response_too_large")));
        return;
      }
      chunks.push(bytes);
    });
    stream.on("error", (error) => finish(() => reject(error)));
    stream.on("end", () => finish(() => resolve({ status, headers, body: Buffer.concat(chunks) })));
    input.session.once("error", onSessionError);
    input.signal.addEventListener("abort", onAbort, { once: true });
    if (input.signal.aborted) {
      onAbort();
      return;
    }
    stream.end(input.body);
  });
}

export function createPinnedSuiGrpcWebFetch(options: PinnedGrpcFetchOptions): typeof fetch {
  if (options.approvedAddresses.length < 1) throw new Error("crypto_app_grpc_address_required");
  const basePath = validateEndpoint(options.endpoint);
  const pinnedAddress = options.approvedAddresses[0]!;
  assertCryptoAdapterConnectedAddress(options.approvedAddresses, pinnedAddress);
  const maxRequestBytes = Math.max(1_024, options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES);
  const maxResponseBytes = Math.max(1_024, options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
  const tlsConnect = options.tlsConnect ?? connectTls;
  const http2Connect = options.http2Connect ?? (connectHttp2 as Http2Connector);

  return (async (requestInput: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if ((init?.method ?? "GET").toUpperCase() !== "POST") throw new Error("crypto_app_grpc_method_invalid");
    const target = requestUrl(requestInput);
    if (!isAllowedGrpcUrl(options.endpoint, basePath, target)) {
      throw new Error("crypto_app_grpc_method_not_allowed");
    }
    const headers = requestHeaders(init?.headers);
    const body = bodyBytes(init?.body);
    assertUnaryGrpcWebFrame(body, maxRequestBytes);
    const signal = mergeSignals(options.outerSignal, init?.signal);
    if (signal.aborted) throw new Error("crypto_app_grpc_aborted");
    const socket = await securePinnedSocket({
      endpoint: options.endpoint,
      pinnedAddress,
      approvedAddresses: options.approvedAddresses,
      signal,
      tlsConnect,
    });
    const connectedAddress = socket.remoteAddress ?? "";
    let session: ClientHttp2Session;
    try {
      session = http2Connect(options.endpoint.origin, {
        createConnection: () => socket,
      });
    } catch (error) {
      socket.destroy();
      throw error;
    }
    try {
      const result = await performRequest({
        session,
        headers: {
          [http2Constants.HTTP2_HEADER_METHOD]: "POST",
          [http2Constants.HTTP2_HEADER_SCHEME]: "https",
          [http2Constants.HTTP2_HEADER_AUTHORITY]: options.endpoint.host,
          [http2Constants.HTTP2_HEADER_PATH]: `${target.pathname}${target.search}`,
          ...headers,
          "content-length": String(body.length),
        },
        body,
        signal,
        maxResponseBytes,
      });
      options.onObservation?.({
        connectedAddress,
        requestBytes: body.length,
        responseBytes: result.body.length,
        path: target.pathname,
      });
      const responseBody = new ArrayBuffer(result.body.length);
      new Uint8Array(responseBody).set(result.body);
      return new Response(responseBody, {
        status: result.status,
        headers: result.headers,
      });
    } finally {
      session.close();
      socket.destroy();
    }
  }) as typeof fetch;
}

export const MATTERHORN_SUI_SIMULATE_GRPC_PATH = SIMULATE_TRANSACTION_PATH;
export const MATTERHORN_SUI_GET_BALANCE_GRPC_PATH = GET_BALANCE_PATH;
export const MATTERHORN_SUI_GET_COIN_INFO_GRPC_PATH = GET_COIN_INFO_PATH;
export const MATTERHORN_SUI_LIST_OWNED_OBJECTS_GRPC_PATH = LIST_OWNED_OBJECTS_PATH;
export const MATTERHORN_SUI_GET_SERVICE_INFO_GRPC_PATH = GET_SERVICE_INFO_PATH;
export const MATTERHORN_SUI_BATCH_GET_OBJECTS_GRPC_PATH = BATCH_GET_OBJECTS_PATH;
export const MATTERHORN_SUI_GET_TRANSACTION_GRPC_PATH = GET_TRANSACTION_PATH;
export const MATTERHORN_SUI_GET_MOVE_FUNCTION_GRPC_PATH = GET_MOVE_FUNCTION_PATH;
