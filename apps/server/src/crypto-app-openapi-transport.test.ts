import { describe, expect, test } from "bun:test";

import type { MatterhornCryptoAppAction } from "@matterhorn-work/types/crypto-coworkers";

import { createPinnedOpenApiCryptoAppTransport } from "./crypto-app-openapi-transport.js";
import type { MatterhornPinnedJsonRequest } from "./crypto-app-https-transport.js";

const action: MatterhornCryptoAppAction = {
  id: "read_market",
  title: "Read market",
  description: "Read one certified market.",
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

function input(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: new URL("https://api.example.test"),
    approvedAddresses: ["93.184.216.34"],
    workspaceId: "ws-1",
    connectionId: "connection-1",
    appId: "partner.market-data",
    manifestRevision: "1.0.0",
    action,
    network: "sui:testnet",
    arguments: { market: "SUI" },
    credential: { type: "api_key_vault" as const, secretReference: "vault://partner-key" },
    openApiOperation: { actionId: "read_market", method: "POST" as const, path: "/v1/markets/read" },
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("restricted pinned OpenAPI action transport", () => {
  test("calls only the exact signed POST path with isolated credentials", async () => {
    const requests: MatterhornPinnedJsonRequest[] = [];
    const executor = createPinnedOpenApiCryptoAppTransport({
      requestJson: async (request) => {
        requests.push(request);
        return {
          value: {
            data: { market: "SUI", price: 3.25 },
            source: "certified-openapi",
            observedAt: "2026-09-05T12:00:00.000Z",
            blockOrVersion: "checkpoint-101",
          },
          connectedAddress: "93.184.216.34",
          requestBytes: 40,
          responseBytes: 60,
        };
      },
      resolveCredentialHeaders: async () => ({ authorization: "Bearer server-only-secret" }),
      estimateCostMicros: ({ requestBytes, responseBytes }) => requestBytes + responseBytes,
    });

    const result = await executor(input());
    expect(requests).toHaveLength(1);
    expect(requests[0]?.endpoint.href).toBe("https://api.example.test/v1/markets/read");
    expect(requests[0]).toMatchObject({
      method: "POST",
      body: {
        version: "matterhorn.openapi-action-call.v1",
        appId: "partner.market-data",
        manifestRevision: "1.0.0",
        actionId: "read_market",
        network: "sui:testnet",
        arguments: { market: "SUI" },
      },
    });
    expect(JSON.stringify(requests[0]?.body)).not.toContain("server-only-secret");
    expect(JSON.stringify(requests[0]?.body)).not.toContain("vault://partner-key");
    expect(result.costMicros).toBe(100);
  });

  test("rejects missing, substituted, non-POST, traversal, query, and non-origin bindings before credentials", async () => {
    const invalid = [
      { openApiOperation: undefined },
      { openApiOperation: { actionId: "prepare_order", method: "POST", path: "/v1/markets/read" } },
      { openApiOperation: { actionId: "read_market", method: "GET", path: "/v1/markets/read" } },
      { openApiOperation: { actionId: "read_market", method: "POST", path: "/v1/../submit" } },
      { openApiOperation: { actionId: "read_market", method: "POST", path: "/v1/read?submit=true" } },
      { endpoint: new URL("https://api.example.test/base") },
    ];
    for (const override of invalid) {
      let resolved = false;
      let requested = false;
      const executor = createPinnedOpenApiCryptoAppTransport({
        resolveCredentialHeaders: async () => { resolved = true; return {}; },
        requestJson: async () => { requested = true; throw new Error("must not request"); },
      });
      await expect(executor(input(override))).rejects.toThrow("crypto_app_openapi_operation_invalid");
      expect(resolved).toBe(false);
      expect(requested).toBe(false);
    }
  });

  test("rejects response extensions, malformed evidence, and upstream cost claims", async () => {
    for (const value of [
      { data: {}, source: "rpc", observedAt: null, blockOrVersion: null, nextAction: "submit" },
      { data: {}, source: "rpc\nforged", observedAt: null, blockOrVersion: null },
      { data: {}, source: "rpc", observedAt: null, blockOrVersion: null, costMicros: 1 },
      [{ data: {}, source: "rpc", observedAt: null, blockOrVersion: null }],
    ]) {
      const executor = createPinnedOpenApiCryptoAppTransport({
        requestJson: async () => ({
          value,
          connectedAddress: "93.184.216.34",
          requestBytes: 1,
          responseBytes: 1,
        }),
      });
      await expect(executor(input({ credential: { type: "none" } })))
        .rejects.toThrow("crypto_app_openapi_response_invalid");
    }
  });

  test("cancellation performs no credential or network work", async () => {
    const controller = new AbortController();
    controller.abort();
    let resolved = false;
    let requested = false;
    const executor = createPinnedOpenApiCryptoAppTransport({
      resolveCredentialHeaders: async () => { resolved = true; return {}; },
      requestJson: async () => { requested = true; throw new Error("must not request"); },
    });
    await expect(executor(input({ signal: controller.signal })))
      .rejects.toThrow("crypto_app_transport_aborted");
    expect(resolved).toBe(false);
    expect(requested).toBe(false);
  });
});
