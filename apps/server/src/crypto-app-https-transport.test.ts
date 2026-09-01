import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { describe, expect, test } from "bun:test";

import type { MatterhornCryptoAppAction } from "@matterhorn-work/types/crypto-coworkers";

import { createPinnedJsonCryptoAppTransport } from "./crypto-app-https-transport.js";

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
  body?: unknown;
}) {
  let requestOptions: Record<string, unknown> | null = null;
  let requestBody = "";
  const request = ((options: Record<string, unknown>, callback: (response: IncomingMessage) => void) => {
    requestOptions = options;
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
        socket: { value: { remoteAddress: input.connectedAddress ?? "93.184.216.34" } },
      });
      queueMicrotask(() => callback(response));
    };
    return client as unknown as ClientRequest;
  }) as never;
  return {
    request,
    options: () => requestOptions as Record<string, unknown>,
    body: () => requestBody,
  };
}

describe("pinned JSON crypto app transport", () => {
  test("pins DNS and TLS hostname while keeping opaque credential references out of the request", async () => {
    const fake = fakeHttps({});
    const executor = createPinnedJsonCryptoAppTransport({
      request: fake.request,
      resolveCredentialHeaders: async ({ credential }) => {
        expect(credential).toEqual({ type: "api_key_vault", secretReference: "vault://opaque-reference" });
        return { authorization: "Bearer resolved-secret" };
      },
      estimateCostMicros: ({ requestBytes, responseBytes }) => requestBytes + responseBytes,
    });
    const result = await executor(requestInput());
    const options = fake.options();
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
    const lookup = options.lookup as (
      hostname: string,
      options: Record<string, unknown>,
      callback: (error: Error | null, address: string, family: number) => void,
    ) => void;
    let pinned: unknown[] = [];
    lookup("adapter.example.test", {}, (error, address, family) => { pinned = [error, address, family]; });
    expect(pinned).toEqual([null, "93.184.216.34", 4]);
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
  });

  test("rejects forbidden credential headers before creating a socket", async () => {
    let requested = false;
    const executor = createPinnedJsonCryptoAppTransport({
      request: (() => { requested = true; throw new Error("must not connect"); }) as never,
      resolveCredentialHeaders: async () => ({ host: "attacker.invalid" }),
    });
    await expect(executor(requestInput())).rejects.toThrow("crypto_app_credential_header_forbidden");
    expect(requested).toBe(false);
  });

  test("rejects redirects, non-JSON bodies, oversized responses, and peer-address changes", async () => {
    for (const [fake, code] of [
      [fakeHttps({ statusCode: 302 }), "crypto_app_transport_status_invalid"],
      [fakeHttps({ contentType: "text/html" }), "crypto_app_transport_content_type_invalid"],
      [fakeHttps({ connectedAddress: "93.184.216.35" }), "crypto_app_connected_address_mismatch"],
      [fakeHttps({ body: "x".repeat(2_000) }), "crypto_app_transport_response_too_large"],
    ] as const) {
      const executor = createPinnedJsonCryptoAppTransport({
        request: fake.request,
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
      resolveCredentialHeaders: async () => ({}),
    });
    await expect(executor(requestInput())).rejects.toThrow("crypto_app_transport_envelope_invalid");
  });

  test("requires a server credential resolver for credentialed connections", async () => {
    const executor = createPinnedJsonCryptoAppTransport({ request: fakeHttps({}).request });
    await expect(executor(requestInput())).rejects.toThrow("crypto_app_credential_resolver_unavailable");
  });

  test("does not resolve credentials or create a socket for an already-aborted call", async () => {
    let resolvedCredential = false;
    let requested = false;
    const controller = new AbortController();
    controller.abort();
    const executor = createPinnedJsonCryptoAppTransport({
      request: (() => { requested = true; throw new Error("must not connect"); }) as never,
      resolveCredentialHeaders: async () => {
        resolvedCredential = true;
        return {};
      },
    });
    await expect(executor(requestInput({ signal: controller.signal }))).rejects.toThrow("crypto_app_transport_aborted");
    expect(resolvedCredential).toBe(false);
    expect(requested).toBe(false);
  });
});
