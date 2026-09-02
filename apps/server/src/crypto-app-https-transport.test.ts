import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { describe, expect, test } from "bun:test";

import type { MatterhornCryptoAppAction } from "@matterhorn-work/types/crypto-coworkers";

import {
  createPinnedBytesRequester,
  createPinnedFormRequester,
  createPinnedJsonCryptoAppTransport,
  createPinnedJsonRequester,
} from "./crypto-app-https-transport.js";

const action: MatterhornCryptoAppAction = {
  id: "read_market",
  title: "Read market",
  description: "Read a certified market summary.",
  access: "read",
  risk: "informational",
  inputSchema: { type: "object", additionalProperties: false },
  outputProjectionSchema: { type: "object", additionalProperties: false },
  requiredScopes: ["market:read"],
  requiresFreshness: true,
  freshnessMaxAgeMs: 30_000,
  timeoutMs: 1_000,
  simulationRequired: false,
  walletSubmissionOnly: true,
  agentMaySubmit: false,
};

function requestInput(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: new URL("https://adapter.example.test/v1/call?tenant=matterhorn"),
    approvedAddresses: ["93.184.216.34"],
    appId: "matterhorn.market-data",
    manifestRevision: "1.0.0",
    action,
    network: "sui:testnet",
    arguments: { market: "SUI" },
    credential: { type: "api_key_vault" as const, secretReference: "vault://opaque-reference" },
    signal: new AbortController().signal,
    ...overrides,
  };
}

function fakeHttps(input: {
  statusCode?: number;
  contentType?: string;
  connectedAddress?: string;
  alpnProtocol?: string | false;
  body?: unknown;
}) {
  let tlsOptions: Record<string, unknown> | null = null;
  let requestOptions: Record<string, unknown> | null = null;
  let requestBody = "";
  let socketDestroyed = false;
  const socket = new EventEmitter() as EventEmitter & {
    remoteAddress: string;
    alpnProtocol: string | false;
    destroy: (error?: Error) => void;
  };
  Object.defineProperties(socket, {
    remoteAddress: { value: input.connectedAddress ?? "93.184.216.34" },
    alpnProtocol: { value: input.alpnProtocol ?? "http/1.1" },
  });
  socket.destroy = () => { socketDestroyed = true; };
  const tlsConnect = ((options: Record<string, unknown>) => {
    tlsOptions = options;
    queueMicrotask(() => socket.emit("secureConnect"));
    return socket;
  }) as never;
  const request = ((options: Record<string, unknown>, callback: (response: IncomingMessage) => void) => {
    requestOptions = options;
    expect((options.createConnection as () => unknown)()).toBe(socket);
    const client = new EventEmitter() as EventEmitter & {
      end: (body?: string) => void;
      destroy: (error?: Error) => ClientRequest;
    };
    client.destroy = (error?: Error) => {
      if (error) queueMicrotask(() => client.emit("error", error));
      return client as unknown as ClientRequest;
    };
    client.end = (body?: string) => {
      requestBody = body ?? "";
      const encoded = typeof input.body === "string" ? input.body : JSON.stringify(input.body ?? {
        data: { market: "SUI", price: 3.25 },
        source: "test-adapter",
        observedAt: "2026-09-01T12:00:00.000Z",
        blockOrVersion: "checkpoint-100",
      });
      const response = Readable.from([Buffer.from(encoded)]) as IncomingMessage;
      Object.defineProperties(response, {
        statusCode: { value: input.statusCode ?? 200 },
        headers: { value: { "content-type": input.contentType ?? "application/json; charset=utf-8" } },
        socket: { value: socket },
      });
      queueMicrotask(() => callback(response));
    };
    return client as unknown as ClientRequest;
  }) as never;
  return {
    request,
    tlsConnect,
    tlsOptions: () => tlsOptions as Record<string, unknown>,
    options: () => requestOptions as Record<string, unknown>,
    body: () => requestBody,
    socketDestroyed: () => socketDestroyed,
  };
}

describe("pinned JSON crypto app transport", () => {
  test("supports an exact bodyless GET without weakening DNS or TLS pinning", async () => {
    const fake = fakeHttps({
      body: { markets: [{ id: "market-1", question: "Will SUI rise?" }] },
    });
    const requester = createPinnedJsonRequester({
      request: fake.request,
      tlsConnect: fake.tlsConnect,
    });
    const result = await requester({
      endpoint: new URL("https://adapter.example.test/v1/markets?active=true&limit=10"),
      approvedAddresses: ["93.184.216.34"],
      method: "GET",
      signal: new AbortController().signal,
    });
    expect(fake.options()).toMatchObject({
      method: "GET",
      path: "/v1/markets?active=true&limit=10",
      hostname: "adapter.example.test",
      servername: "adapter.example.test",
      rejectUnauthorized: true,
      agent: false,
    });
    expect(fake.tlsOptions()).toMatchObject({
      host: "93.184.216.34",
      servername: "adapter.example.test",
      rejectUnauthorized: true,
      ALPNProtocols: ["http/1.1"],
    });
    expect(fake.options().headers).not.toHaveProperty("content-type");
    expect(fake.options().headers).not.toHaveProperty("content-length");
    expect(fake.body()).toBe("");
    expect(result).toMatchObject({
      value: { markets: [{ id: "market-1", question: "Will SUI rise?" }] },
      connectedAddress: "93.184.216.34",
      requestBytes: 0,
    });
  });

  test("rejects unsupported methods, GET bodies, missing POST bodies, and ambiguous URLs before dialing", async () => {
    let connected = false;
    let requested = false;
    const requester = createPinnedJsonRequester({
      request: (() => { requested = true; throw new Error("must not request"); }) as never,
      tlsConnect: (() => { connected = true; throw new Error("must not connect"); }) as never,
    });
    const base = {
      endpoint: new URL("https://adapter.example.test/v1/markets"),
      approvedAddresses: ["93.184.216.34"],
      signal: new AbortController().signal,
    };
    await expect(requester({ ...base, method: "PUT" as never, body: {} }))
      .rejects.toThrow("crypto_app_transport_method_invalid");
    await expect(requester({ ...base, method: "GET", body: {} }))
      .rejects.toThrow("crypto_app_transport_body_forbidden");
    await expect(requester({ ...base, method: "GET", body: null }))
      .rejects.toThrow("crypto_app_transport_body_forbidden");
    await expect(requester({ ...base, method: "POST" }))
      .rejects.toThrow("crypto_app_transport_body_required");
    await expect(requester({
      ...base,
      endpoint: new URL("http://adapter.example.test/v1/markets"),
      method: "GET",
    })).rejects.toThrow("crypto_app_transport_endpoint_invalid");
    await expect(requester({
      ...base,
      endpoint: new URL("https://user:pass@adapter.example.test/v1/markets"),
      method: "GET",
    })).rejects.toThrow("crypto_app_transport_endpoint_invalid");
    await expect(requester({
      ...base,
      endpoint: new URL("https://adapter.example.test/v1/markets#ignored-control"),
      method: "GET",
    })).rejects.toThrow("crypto_app_transport_endpoint_invalid");
    await expect(requester({
      ...base,
      endpoint: new URL(`https://adapter.example.test/${"x".repeat(8_192)}`),
      method: "GET",
    })).rejects.toThrow("crypto_app_transport_endpoint_invalid");
    expect(requested).toBe(false);
    expect(connected).toBe(false);
  });

  test("bounds JSON POST requests before dialing", async () => {
    let connected = false;
    let requested = false;
    const requester = createPinnedJsonRequester({
      maxRequestBytes: 1_024,
      request: (() => { requested = true; throw new Error("must not request"); }) as never,
      tlsConnect: (() => { connected = true; throw new Error("must not connect"); }) as never,
    });
    await expect(requester({
      endpoint: new URL("https://adapter.example.test/v1/call"),
      approvedAddresses: ["93.184.216.34"],
      method: "POST",
      body: { value: "x".repeat(2_000) },
      signal: new AbortController().signal,
    })).rejects.toThrow("crypto_app_transport_request_too_large");
    expect(requested).toBe(false);
    expect(connected).toBe(false);
  });

  test("accepts JSON media types but rejects deceptive JSON prefixes", async () => {
    const deceptive = fakeHttps({ contentType: "application/jsonp", body: {} });
    const deceptiveRequester = createPinnedJsonRequester({
      request: deceptive.request,
      tlsConnect: deceptive.tlsConnect,
    });
    await expect(deceptiveRequester({
      endpoint: new URL("https://adapter.example.test/v1/markets"),
      approvedAddresses: ["93.184.216.34"],
      method: "GET",
      signal: new AbortController().signal,
    })).rejects.toThrow("crypto_app_transport_content_type_invalid");

    const vendor = fakeHttps({
      contentType: "application/problem+json; charset=utf-8",
      body: { type: "about:blank", status: 200 },
    });
    const vendorRequester = createPinnedJsonRequester({
      request: vendor.request,
      tlsConnect: vendor.tlsConnect,
    });
    await expect(vendorRequester({
      endpoint: new URL("https://adapter.example.test/v1/markets"),
      approvedAddresses: ["93.184.216.34"],
      method: "GET",
      signal: new AbortController().signal,
    })).resolves.toMatchObject({ value: { type: "about:blank", status: 200 } });
  });

  test("pins DNS and TLS hostname while keeping opaque credential references out of the request", async () => {
    const fake = fakeHttps({});
    const executor = createPinnedJsonCryptoAppTransport({
      request: fake.request,
      tlsConnect: fake.tlsConnect,
      resolveCredentialHeaders: async ({ credential }) => {
        expect(credential).toEqual({ type: "api_key_vault", secretReference: "vault://opaque-reference" });
        return { authorization: "Bearer resolved-secret" };
      },
      estimateCostMicros: ({ requestBytes, responseBytes }) => requestBytes + responseBytes,
    });
    const result = await executor(requestInput());
    const options = fake.options();
    expect(fake.tlsOptions()).toMatchObject({
      host: "93.184.216.34",
      port: 443,
      servername: "adapter.example.test",
      rejectUnauthorized: true,
      ALPNProtocols: ["http/1.1"],
    });
    expect(options).toMatchObject({
      protocol: "https:",
      hostname: "adapter.example.test",
      servername: "adapter.example.test",
      method: "POST",
      path: "/v1/call?tenant=matterhorn",
      rejectUnauthorized: true,
      agent: false,
    });
    expect(options.headers).toMatchObject({ authorization: "Bearer resolved-secret" });
    expect(fake.body()).not.toContain("vault://opaque-reference");
    expect(fake.body()).not.toContain("resolved-secret");
    expect(JSON.parse(fake.body())).toMatchObject({
      version: "matterhorn.crypto-app-call.v1",
      actionId: "read_market",
      network: "sui:testnet",
      arguments: { market: "SUI" },
    });
    expect(result).toMatchObject({
      data: { market: "SUI", price: 3.25 },
      connectedAddress: "93.184.216.34",
      costMicros: expect.any(Number),
    });
    expect(fake.socketDestroyed()).toBe(true);
  });

  test("rejects forbidden credential headers before creating a socket", async () => {
    let requested = false;
    let connected = false;
    const executor = createPinnedJsonCryptoAppTransport({
      request: (() => { requested = true; throw new Error("must not connect"); }) as never,
      tlsConnect: (() => { connected = true; throw new Error("must not connect"); }) as never,
      resolveCredentialHeaders: async () => ({ host: "attacker.invalid" }),
    });
    await expect(executor(requestInput())).rejects.toThrow("crypto_app_credential_header_forbidden");
    expect(requested).toBe(false);
    expect(connected).toBe(false);
  });

  test("rejects redirects, non-JSON bodies, oversized responses, peer changes and wrong ALPN", async () => {
    for (const [fake, code] of [
      [fakeHttps({ statusCode: 302 }), "crypto_app_transport_status_invalid"],
      [fakeHttps({ contentType: "text/html" }), "crypto_app_transport_content_type_invalid"],
      [fakeHttps({ connectedAddress: "93.184.216.35" }), "crypto_app_connected_address_mismatch"],
      [fakeHttps({ alpnProtocol: "h2" }), "crypto_app_transport_http1_required"],
      [fakeHttps({ body: "x".repeat(2_000) }), "crypto_app_transport_response_too_large"],
    ] as const) {
      const executor = createPinnedJsonCryptoAppTransport({
        request: fake.request,
        tlsConnect: fake.tlsConnect,
        maxResponseBytes: 1_024,
        resolveCredentialHeaders: async () => ({}),
      });
      await expect(executor(requestInput())).rejects.toThrow(code);
    }
  });

  test("does not trust upstream cost fields or unknown envelope controls", async () => {
    const fake = fakeHttps({
      body: {
        data: { market: "SUI" },
        source: "adapter",
        observedAt: null,
        blockOrVersion: null,
        costMicros: 999_999_999,
      },
    });
    const executor = createPinnedJsonCryptoAppTransport({
      request: fake.request,
      tlsConnect: fake.tlsConnect,
      resolveCredentialHeaders: async () => ({}),
    });
    await expect(executor(requestInput())).rejects.toThrow("crypto_app_transport_envelope_invalid");
  });

  test("requires a server credential resolver for credentialed connections", async () => {
    const fake = fakeHttps({});
    const executor = createPinnedJsonCryptoAppTransport({ request: fake.request, tlsConnect: fake.tlsConnect });
    await expect(executor(requestInput())).rejects.toThrow("crypto_app_credential_resolver_unavailable");
  });

  test("does not resolve credentials or create a socket for an already-aborted call", async () => {
    let resolvedCredential = false;
    let requested = false;
    let connected = false;
    const controller = new AbortController();
    controller.abort();
    const executor = createPinnedJsonCryptoAppTransport({
      request: (() => { requested = true; throw new Error("must not connect"); }) as never,
      tlsConnect: (() => { connected = true; throw new Error("must not connect"); }) as never,
      resolveCredentialHeaders: async () => {
        resolvedCredential = true;
        return {};
      },
    });
    await expect(executor(requestInput({ signal: controller.signal }))).rejects.toThrow("crypto_app_transport_aborted");
    expect(resolvedCredential).toBe(false);
    expect(requested).toBe(false);
    expect(connected).toBe(false);
  });
});

describe("pinned OAuth token transport", () => {
  test("posts only an encoded form through the pinned TLS peer", async () => {
    const fake = fakeHttps({
      body: {
        access_token: "server-only-access-token",
        token_type: "Bearer",
        expires_in: 3_600,
      },
    });
    const requester = createPinnedFormRequester({ request: fake.request, tlsConnect: fake.tlsConnect });
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "matterhorn-client",
      code: "one-time-code",
      code_verifier: "v".repeat(64),
    });
    const response = await requester({
      endpoint: new URL("https://auth.example.test/oauth/token"),
      approvedAddresses: ["93.184.216.34"],
      body,
      signal: new AbortController().signal,
    });
    expect(fake.tlsOptions()).toMatchObject({
      host: "93.184.216.34",
      servername: "auth.example.test",
      rejectUnauthorized: true,
      ALPNProtocols: ["http/1.1"],
    });
    expect(fake.options()).toMatchObject({
      method: "POST",
      path: "/oauth/token",
      hostname: "auth.example.test",
      agent: false,
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
    });
    expect(fake.body()).toBe(body.toString());
    expect(response.value).toEqual({
      access_token: "server-only-access-token",
      token_type: "Bearer",
      expires_in: 3_600,
    });
    expect(response.connectedAddress).toBe("93.184.216.34");
    expect(fake.socketDestroyed()).toBe(true);
  });

  test("rejects redirects, non-JSON, oversized requests and responses, peer changes, and aborted calls", async () => {
    for (const [fake, code] of [
      [fakeHttps({ statusCode: 302 }), "crypto_app_oauth_status_invalid"],
      [fakeHttps({ contentType: "text/html" }), "crypto_app_oauth_content_type_invalid"],
      [fakeHttps({ connectedAddress: "93.184.216.35" }), "crypto_app_connected_address_mismatch"],
      [fakeHttps({ body: "x".repeat(2_000) }), "crypto_app_oauth_response_too_large"],
    ] as const) {
      const requester = createPinnedFormRequester({
        request: fake.request,
        tlsConnect: fake.tlsConnect,
        maxResponseBytes: 1_024,
      });
      await expect(requester({
        endpoint: new URL("https://auth.example.test/token"),
        approvedAddresses: ["93.184.216.34"],
        body: new URLSearchParams({ grant_type: "authorization_code" }),
        signal: new AbortController().signal,
      })).rejects.toThrow(code);
    }

    let connected = false;
    let requested = false;
    const requester = createPinnedFormRequester({
      request: (() => { requested = true; throw new Error("must not request"); }) as never,
      tlsConnect: (() => { connected = true; throw new Error("must not connect"); }) as never,
      maxRequestBytes: 1_024,
    });
    await expect(requester({
      endpoint: new URL("https://auth.example.test/token"),
      approvedAddresses: ["93.184.216.34"],
      body: new URLSearchParams({ code: "x".repeat(2_000) }),
      signal: new AbortController().signal,
    })).rejects.toThrow("crypto_app_oauth_request_too_large");
    const controller = new AbortController();
    controller.abort();
    await expect(requester({
      endpoint: new URL("https://auth.example.test/token"),
      approvedAddresses: ["93.184.216.34"],
      body: new URLSearchParams({ code: "one-time-code" }),
      signal: controller.signal,
    })).rejects.toThrow("crypto_app_oauth_transport_aborted");
    expect(connected).toBe(false);
    expect(requested).toBe(false);
  });
});

describe("pinned binary evidence transport", () => {
  test("pins the HTTPS peer and sends only the fixed encrypted-evidence request", async () => {
    const fake = fakeHttps({ contentType: "application/json", body: { stored: true } });
    const requester = createPinnedBytesRequester({ request: fake.request, tlsConnect: fake.tlsConnect });
    const response = await requester({
      endpoint: new URL("https://publisher.example.test/v1/blobs?epochs=5"),
      approvedAddresses: ["93.184.216.34"],
      method: "PUT",
      body: Buffer.from("ciphertext"),
      signal: new AbortController().signal,
      headers: {
        accept: "application/json",
        authorization: "Bearer server-only",
        "content-type": "application/vnd.matterhorn.walrus-ciphertext.v1+json",
        "x-matterhorn-ciphertext-sha256": "a".repeat(64),
      },
      acceptedResponseTypes: ["application/json"],
    });
    expect(fake.tlsOptions()).toMatchObject({
      host: "93.184.216.34",
      servername: "publisher.example.test",
      rejectUnauthorized: true,
    });
    expect(fake.options()).toMatchObject({
      method: "PUT",
      path: "/v1/blobs?epochs=5",
      headers: {
        authorization: "Bearer server-only",
        "content-type": "application/vnd.matterhorn.walrus-ciphertext.v1+json",
      },
    });
    expect(Buffer.from(fake.body()).toString("utf8")).toBe("ciphertext");
    expect(response.bytes.toString("utf8")).toBe(JSON.stringify({ stored: true }));
    expect(fake.socketDestroyed()).toBe(true);
  });

  test("rejects redirects, response type changes, oversized bodies and peer changes", async () => {
    for (const [fake, code] of [
      [fakeHttps({ statusCode: 302, contentType: "application/json" }), "crypto_app_binary_status_invalid"],
      [fakeHttps({ contentType: "text/html" }), "crypto_app_binary_content_type_invalid"],
      [fakeHttps({ connectedAddress: "93.184.216.35", contentType: "application/json" }), "crypto_app_connected_address_mismatch"],
      [fakeHttps({ body: "x".repeat(2_000), contentType: "application/json" }), "crypto_app_binary_response_too_large"],
    ] as const) {
      const requester = createPinnedBytesRequester({
        request: fake.request,
        tlsConnect: fake.tlsConnect,
        maxResponseBytes: 1_024,
      });
      await expect(requester({
        endpoint: new URL("https://publisher.example.test/v1/blobs"),
        approvedAddresses: ["93.184.216.34"],
        method: "PUT",
        body: Buffer.from("ciphertext"),
        signal: new AbortController().signal,
        headers: { "content-type": "application/vnd.matterhorn.walrus-ciphertext.v1+json" },
        acceptedResponseTypes: ["application/json"],
      })).rejects.toThrow(code);
    }
  });

  test("rejects arbitrary headers and GET bodies before creating a socket", async () => {
    let connected = false;
    const requester = createPinnedBytesRequester({
      request: (() => { throw new Error("must not request"); }) as never,
      tlsConnect: (() => { connected = true; throw new Error("must not connect"); }) as never,
    });
    const base = {
      endpoint: new URL("https://aggregator.example.test/v1/blobs/by-object-id/0x1"),
      approvedAddresses: ["93.184.216.34"],
      method: "GET" as const,
      signal: new AbortController().signal,
      acceptedResponseTypes: ["application/octet-stream"],
    };
    await expect(requester({ ...base, body: Buffer.from("forbidden") }))
      .rejects.toThrow("crypto_app_binary_body_forbidden");
    await expect(requester({ ...base, body: null, headers: { host: "attacker.example" } }))
      .rejects.toThrow("crypto_app_binary_header_invalid");
    expect(connected).toBe(false);
  });
});
