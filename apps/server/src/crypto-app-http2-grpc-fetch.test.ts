import { EventEmitter } from "node:events";
import { constants as http2Constants } from "node:http2";

import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_SUI_BATCH_GET_OBJECTS_GRPC_PATH,
  createPinnedSuiGrpcWebFetch,
  MATTERHORN_SUI_GET_BALANCE_GRPC_PATH,
  MATTERHORN_SUI_GET_COIN_INFO_GRPC_PATH,
  MATTERHORN_SUI_GET_MOVE_FUNCTION_GRPC_PATH,
  MATTERHORN_SUI_GET_MOVE_PACKAGE_GRPC_PATH,
  MATTERHORN_SUI_GET_SERVICE_INFO_GRPC_PATH,
  MATTERHORN_SUI_GET_TRANSACTION_GRPC_PATH,
  MATTERHORN_SUI_LIST_OWNED_OBJECTS_GRPC_PATH,
  MATTERHORN_SUI_SIMULATE_GRPC_PATH,
} from "./crypto-app-http2-grpc-fetch.js";

const ENDPOINT = new URL("https://fullnode.testnet.sui.io");
const PEER = "93.184.216.34";

function harness(options: {
  connectedAddress?: string;
  alpnProtocol?: string;
  responseBody?: Uint8Array;
  sessionError?: string;
} = {}) {
  let tlsOptions: Record<string, unknown> | null = null;
  let requestHeaders: Record<string, unknown> | null = null;
  let requestBody = Buffer.alloc(0);
  let sessionClosed = false;
  let socketDestroyed = false;
  const socket = new EventEmitter() as EventEmitter & {
    remoteAddress: string;
    alpnProtocol: string;
    destroy: (error?: Error) => void;
  };
  Object.defineProperties(socket, {
    remoteAddress: { value: options.connectedAddress ?? PEER },
    alpnProtocol: { value: options.alpnProtocol ?? "h2" },
  });
  socket.destroy = () => { socketDestroyed = true; };
  const tlsConnect = ((input: Record<string, unknown>) => {
    tlsOptions = input;
    queueMicrotask(() => socket.emit("secureConnect"));
    return socket;
  }) as never;
  const http2Connect = ((authority: string, input: { createConnection: () => unknown }) => {
    expect(authority).toBe(ENDPOINT.origin);
    expect(input.createConnection()).toBe(socket);
    const session = new EventEmitter() as EventEmitter & {
      request: (headers: Record<string, unknown>) => unknown;
      close: () => void;
    };
    session.close = () => { sessionClosed = true; };
    session.request = (headers) => {
      requestHeaders = headers;
      const stream = new EventEmitter() as EventEmitter & {
        end: (body: Uint8Array) => void;
        close: (code?: number) => void;
      };
      stream.close = () => undefined;
      stream.end = (body) => {
        requestBody = Buffer.from(body);
        queueMicrotask(() => {
          if (options.sessionError) {
            session.emit("error", new Error(options.sessionError));
            return;
          }
          stream.emit("response", {
            [http2Constants.HTTP2_HEADER_STATUS]: 200,
            "content-type": "application/grpc-web+proto",
          });
          stream.emit("data", options.responseBody ?? Uint8Array.from([0, 0, 0, 0, 1, 42]));
          stream.emit("end");
        });
      };
      return stream;
    };
    return session;
  }) as never;
  return {
    tlsConnect,
    http2Connect,
    tlsOptions: () => tlsOptions as Record<string, unknown>,
    requestHeaders: () => requestHeaders as Record<string, unknown>,
    requestBody: () => requestBody,
    sessionClosed: () => sessionClosed,
    socketDestroyed: () => socketDestroyed,
  };
}

function grpcInit(body = Uint8Array.from([0, 0, 0, 0, 1, 7])): RequestInit {
  return {
    method: "POST",
    headers: {
      accept: "application/grpc-web+proto",
      "content-type": "application/grpc-web+proto",
      "x-grpc-web": "1",
      "grpc-timeout": "15000m",
    },
    body,
  };
}

describe("pinned Sui HTTP/2 gRPC-web fetch", () => {
  test("pins the TLS peer, verifies the hostname and permits simulation", async () => {
    const fake = harness();
    const observations: unknown[] = [];
    const fetcher = createPinnedSuiGrpcWebFetch({
      endpoint: ENDPOINT,
      approvedAddresses: [PEER],
      outerSignal: new AbortController().signal,
      tlsConnect: fake.tlsConnect,
      http2Connect: fake.http2Connect,
      onObservation: (observation) => observations.push(observation),
    });
    const response = await fetcher(new URL(MATTERHORN_SUI_SIMULATE_GRPC_PATH, ENDPOINT), grpcInit());
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from([0, 0, 0, 0, 1, 42]));
    expect(fake.tlsOptions()).toMatchObject({
      host: PEER,
      port: 443,
      servername: "fullnode.testnet.sui.io",
      rejectUnauthorized: true,
      ALPNProtocols: ["h2"],
    });
    expect(fake.requestHeaders()).toMatchObject({
      [http2Constants.HTTP2_HEADER_METHOD]: "POST",
      [http2Constants.HTTP2_HEADER_SCHEME]: "https",
      [http2Constants.HTTP2_HEADER_AUTHORITY]: "fullnode.testnet.sui.io",
      [http2Constants.HTTP2_HEADER_PATH]: MATTERHORN_SUI_SIMULATE_GRPC_PATH,
      "content-type": "application/grpc-web+proto",
      "x-grpc-web": "1",
    });
    expect(fake.requestBody()).toEqual(Buffer.from([0, 0, 0, 0, 1, 7]));
    expect(observations).toEqual([{
      connectedAddress: PEER,
      requestBytes: 6,
      responseBytes: 6,
      path: MATTERHORN_SUI_SIMULATE_GRPC_PATH,
    }]);
    expect(fake.sessionClosed()).toBe(true);
    expect(fake.socketDestroyed()).toBe(true);
  });

  test("permits only the exact read-only Sui balance, metadata and freshness methods", async () => {
    for (const path of [
      MATTERHORN_SUI_GET_BALANCE_GRPC_PATH,
      MATTERHORN_SUI_GET_COIN_INFO_GRPC_PATH,
      MATTERHORN_SUI_LIST_OWNED_OBJECTS_GRPC_PATH,
      MATTERHORN_SUI_GET_SERVICE_INFO_GRPC_PATH,
      MATTERHORN_SUI_BATCH_GET_OBJECTS_GRPC_PATH,
      MATTERHORN_SUI_GET_TRANSACTION_GRPC_PATH,
      MATTERHORN_SUI_GET_MOVE_FUNCTION_GRPC_PATH,
      MATTERHORN_SUI_GET_MOVE_PACKAGE_GRPC_PATH,
    ]) {
      const fake = harness();
      const fetcher = createPinnedSuiGrpcWebFetch({
        endpoint: ENDPOINT,
        approvedAddresses: [PEER],
        outerSignal: new AbortController().signal,
        tlsConnect: fake.tlsConnect,
        http2Connect: fake.http2Connect,
      });
      const response = await fetcher(new URL(path, ENDPOINT), grpcInit());
      expect(response.status).toBe(200);
      expect(fake.requestHeaders()).toMatchObject({
        [http2Constants.HTTP2_HEADER_METHOD]: "POST",
        [http2Constants.HTTP2_HEADER_PATH]: path,
      });
    }
  });

  test("accepts a framed empty protobuf request and rejects empty or malformed frames before dialing", async () => {
    const valid = harness();
    const fetcher = createPinnedSuiGrpcWebFetch({
      endpoint: ENDPOINT,
      approvedAddresses: [PEER],
      outerSignal: new AbortController().signal,
      tlsConnect: valid.tlsConnect,
      http2Connect: valid.http2Connect,
    });
    const emptyMessageFrame = Uint8Array.from([0, 0, 0, 0, 0]);
    const response = await fetcher(
      new URL(MATTERHORN_SUI_GET_SERVICE_INFO_GRPC_PATH, ENDPOINT),
      grpcInit(emptyMessageFrame),
    );
    expect(response.status).toBe(200);
    expect(valid.requestBody()).toEqual(Buffer.from(emptyMessageFrame));

    let dialed = false;
    const rejectingFetcher = createPinnedSuiGrpcWebFetch({
      endpoint: ENDPOINT,
      approvedAddresses: [PEER],
      outerSignal: new AbortController().signal,
      tlsConnect: (() => { dialed = true; throw new Error("must not dial"); }) as never,
    });
    await expect(rejectingFetcher(
      new URL(MATTERHORN_SUI_GET_SERVICE_INFO_GRPC_PATH, ENDPOINT),
      grpcInit(new Uint8Array()),
    )).rejects.toThrow("crypto_app_grpc_request_size_invalid");
    await expect(rejectingFetcher(
      new URL(MATTERHORN_SUI_GET_SERVICE_INFO_GRPC_PATH, ENDPOINT),
      grpcInit(Uint8Array.from([0, 0, 0, 0, 1])),
    )).rejects.toThrow("crypto_app_grpc_request_frame_invalid");
    await expect(rejectingFetcher(
      new URL(MATTERHORN_SUI_GET_SERVICE_INFO_GRPC_PATH, ENDPOINT),
      grpcInit(Uint8Array.from([1, 0, 0, 0, 0])),
    )).rejects.toThrow("crypto_app_grpc_request_frame_invalid");
    expect(dialed).toBe(false);
  });

  test("rejects execute, alternate origins, credentials and non-binary gRPC before dialing", async () => {
    let dialed = false;
    const fetcher = createPinnedSuiGrpcWebFetch({
      endpoint: ENDPOINT,
      approvedAddresses: [PEER],
      outerSignal: new AbortController().signal,
      tlsConnect: (() => { dialed = true; throw new Error("must not dial"); }) as never,
    });
    for (const [url, init, code] of [
      [new URL("/sui.rpc.v2.TransactionExecutionService/ExecuteTransaction", ENDPOINT), grpcInit(), "crypto_app_grpc_method_not_allowed"],
      [new URL("/sui.rpc.v2.LedgerService/BatchGetTransactions", ENDPOINT), grpcInit(), "crypto_app_grpc_method_not_allowed"],
      [new URL(MATTERHORN_SUI_SIMULATE_GRPC_PATH, "https://attacker.example"), grpcInit(), "crypto_app_grpc_method_not_allowed"],
      [new URL(MATTERHORN_SUI_SIMULATE_GRPC_PATH, ENDPOINT), {
        ...grpcInit(), headers: { ...grpcInit().headers as Record<string, string>, authorization: "Bearer secret" },
      }, "crypto_app_grpc_header_forbidden"],
      [new URL(MATTERHORN_SUI_SIMULATE_GRPC_PATH, ENDPOINT), {
        ...grpcInit(), headers: { "content-type": "application/grpc-web-text", "x-grpc-web": "1" },
      }, "crypto_app_grpc_header_invalid"],
    ] as const) {
      await expect(fetcher(url, init)).rejects.toThrow(code);
    }
    expect(dialed).toBe(false);
  });

  test("honors an already-aborted outer run before dialing", async () => {
    let dialed = false;
    const controller = new AbortController();
    controller.abort();
    const fetcher = createPinnedSuiGrpcWebFetch({
      endpoint: ENDPOINT,
      approvedAddresses: [PEER],
      outerSignal: controller.signal,
      tlsConnect: (() => { dialed = true; throw new Error("must not dial"); }) as never,
    });
    await expect(
      fetcher(new URL(MATTERHORN_SUI_SIMULATE_GRPC_PATH, ENDPOINT), grpcInit()),
    ).rejects.toThrow("crypto_app_grpc_aborted");
    expect(dialed).toBe(false);
  });

  test("rejects DNS peer changes, missing h2 and oversized responses", async () => {
    for (const [fake, extra, code] of [
      [harness({ connectedAddress: "93.184.216.35" }), {}, "crypto_app_connected_address_mismatch"],
      [harness({ alpnProtocol: "http/1.1" }), {}, "crypto_app_grpc_http2_required"],
      [harness({ responseBody: new Uint8Array(2_000) }), { maxResponseBytes: 1_024 }, "crypto_app_grpc_response_too_large"],
    ] as const) {
      const fetcher = createPinnedSuiGrpcWebFetch({
        endpoint: ENDPOINT,
        approvedAddresses: [PEER],
        outerSignal: new AbortController().signal,
        tlsConnect: fake.tlsConnect,
        http2Connect: fake.http2Connect,
        ...extra,
      });
      await expect(fetcher(new URL(MATTERHORN_SUI_SIMULATE_GRPC_PATH, ENDPOINT), grpcInit())).rejects.toThrow(code);
    }
  });

  test("closes pinned resources when the HTTP/2 session fails", async () => {
    const fake = harness({ sessionError: "http2 session lost" });
    const fetcher = createPinnedSuiGrpcWebFetch({
      endpoint: ENDPOINT,
      approvedAddresses: [PEER],
      outerSignal: new AbortController().signal,
      tlsConnect: fake.tlsConnect,
      http2Connect: fake.http2Connect,
    });
    await expect(
      fetcher(new URL(MATTERHORN_SUI_SIMULATE_GRPC_PATH, ENDPOINT), grpcInit()),
    ).rejects.toThrow("http2 session lost");
    expect(fake.sessionClosed()).toBe(true);
    expect(fake.socketDestroyed()).toBe(true);
  });
});
