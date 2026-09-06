import { describe, expect, test } from "bun:test";

import type { MatterhornCryptoAppAction } from "@matterhorn-work/types/crypto-coworkers";

import { createPinnedJsonRpcCryptoAppTransport } from "./crypto-app-json-rpc-transport.js";
import type {
  MatterhornPinnedJsonRequest,
  MatterhornPinnedJsonResponse,
} from "./crypto-app-https-transport.js";

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

function executorInput(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: new URL("https://rpc.example.test/v1"),
    approvedAddresses: ["93.184.216.34"],
    workspaceId: "ws-1",
    connectionId: "connection-1",
    appId: "partner.market-data",
    manifestRevision: "1.0.0",
    action,
    network: "sui:testnet",
    arguments: { market: "SUI" },
    credential: { type: "api_key_vault" as const, secretReference: "vault://partner-key" },
    signal: new AbortController().signal,
    ...overrides,
  };
}

function response(value: unknown): MatterhornPinnedJsonResponse {
  return {
    value,
    connectedAddress: "93.184.216.34",
    requestBytes: 40,
    responseBytes: 60,
  };
}

describe("restricted pinned JSON-RPC crypto app transport", () => {
  test("calls only the signed action with the authorized network and arguments", async () => {
    const calls: MatterhornPinnedJsonRequest[] = [];
    const executor = createPinnedJsonRpcCryptoAppTransport({
      requestId: () => "request-1",
      requestJson: async (request) => {
        calls.push(request);
        return response({
          jsonrpc: "2.0",
          id: "request-1",
          result: {
            data: { market: "SUI", price: 3.25 },
            source: "certified-rpc",
            observedAt: "2026-09-05T12:00:00.000Z",
            blockOrVersion: "checkpoint-101",
          },
        });
      },
      resolveCredentialHeaders: async ({ credential }) => {
        expect(credential).toEqual({ type: "api_key_vault", secretReference: "vault://partner-key" });
        return { authorization: "Bearer server-only-secret" };
      },
      estimateCostMicros: ({ requestBytes, responseBytes }) => requestBytes + responseBytes,
    });

    const result = await executor(executorInput());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "POST",
      body: {
        jsonrpc: "2.0",
        id: "request-1",
        method: "read_market",
        params: { network: "sui:testnet", arguments: { market: "SUI" } },
      },
    });
    expect(JSON.stringify(calls[0]?.body)).not.toContain("server-only-secret");
    expect(JSON.stringify(calls[0]?.body)).not.toContain("vault://partner-key");
    expect(result).toEqual({
      data: { market: "SUI", price: 3.25 },
      source: "certified-rpc",
      observedAt: "2026-09-05T12:00:00.000Z",
      blockOrVersion: "checkpoint-101",
      costMicros: 100,
      connectedAddress: "93.184.216.34",
    });
  });

  test("fails closed on id substitution, peer requests, batches, extra fields, and malformed evidence", async () => {
    const invalid: Array<[unknown, string]> = [
      [{ jsonrpc: "2.0", id: "wrong", result: {} }, "crypto_app_rpc_response_invalid"],
      [{ jsonrpc: "2.0", id: "request-1", method: "wallet/sign", params: {} }, "crypto_app_rpc_response_invalid"],
      [[{ jsonrpc: "2.0", id: "request-1", result: {} }], "crypto_app_rpc_response_invalid"],
      [{ jsonrpc: "2.0", id: "request-1", result: {}, nextMethod: "submit" }, "crypto_app_rpc_response_invalid"],
      [{ jsonrpc: "2.0", id: "request-1", result: { data: {}, source: "rpc", observedAt: null } }, "crypto_app_rpc_result_invalid"],
      [{
        jsonrpc: "2.0",
        id: "request-1",
        result: { data: {}, source: "rpc\nforged", observedAt: null, blockOrVersion: null },
      }, "crypto_app_rpc_result_invalid"],
      [{
        jsonrpc: "2.0",
        id: "request-1",
        result: { data: {}, source: "rpc", observedAt: null, blockOrVersion: null, costMicros: 1 },
      }, "crypto_app_rpc_result_invalid"],
    ];
    for (const [value, code] of invalid) {
      const executor = createPinnedJsonRpcCryptoAppTransport({
        requestId: () => "request-1",
        requestJson: async () => response(value),
      });
      await expect(executor(executorInput({ credential: { type: "none" } }))).rejects.toThrow(code);
    }
  });

  test("redacts upstream JSON-RPC errors behind one stable failure", async () => {
    const executor = createPinnedJsonRpcCryptoAppTransport({
      requestId: () => "request-1",
      requestJson: async () => response({
        jsonrpc: "2.0",
        id: "request-1",
        error: { code: -32_000, message: "secret upstream details", data: { instruction: "submit" } },
      }),
    });
    await expect(executor(executorInput({ credential: { type: "none" } })))
      .rejects.toThrow("crypto_app_rpc_call_failed");
  });

  test("rejects malformed JSON-RPC error objects without exposing their values", async () => {
    for (const error of [
      {},
      { code: -32_000, message: "" },
      { code: 1.5, message: "bad" },
      { code: -32_000, message: "bad\nforged" },
      { code: -32_000, message: "bad", nextMethod: "submit" },
    ]) {
      const executor = createPinnedJsonRpcCryptoAppTransport({
        requestId: () => "request-1",
        requestJson: async () => response({ jsonrpc: "2.0", id: "request-1", error }),
      });
      await expect(executor(executorInput({ credential: { type: "none" } })))
        .rejects.toThrow("crypto_app_rpc_response_invalid");
    }
  });

  test("does not resolve credentials or contact the adapter after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    let resolved = false;
    let requested = false;
    const executor = createPinnedJsonRpcCryptoAppTransport({
      resolveCredentialHeaders: async () => { resolved = true; return {}; },
      requestJson: async () => { requested = true; throw new Error("must not request"); },
    });
    await expect(executor(executorInput({ signal: controller.signal })))
      .rejects.toThrow("crypto_app_transport_aborted");
    expect(resolved).toBe(false);
    expect(requested).toBe(false);
  });

  test("rejects invalid request ids before credential or network work", async () => {
    let resolved = false;
    let requested = false;
    const executor = createPinnedJsonRpcCryptoAppTransport({
      requestId: () => "request\nforged",
      resolveCredentialHeaders: async () => { resolved = true; return {}; },
      requestJson: async () => { requested = true; throw new Error("must not request"); },
    });
    await expect(executor(executorInput())).rejects.toThrow("crypto_app_rpc_request_id_invalid");
    expect(resolved).toBe(false);
    expect(requested).toBe(false);
  });

  test("rejects non-canonical methods and network controls before resolving credentials", async () => {
    let resolved = false;
    let requested = false;
    const executor = createPinnedJsonRpcCryptoAppTransport({
      resolveCredentialHeaders: async () => { resolved = true; return {}; },
      requestJson: async () => { requested = true; throw new Error("must not request"); },
    });
    await expect(executor(executorInput({ action: { ...action, id: "rpc.submit" } })))
      .rejects.toThrow("crypto_app_rpc_method_invalid");
    await expect(executor(executorInput({ network: "sui:testnet\nsubmit" })))
      .rejects.toThrow("crypto_app_rpc_network_invalid");
    expect(resolved).toBe(false);
    expect(requested).toBe(false);
  });
});
