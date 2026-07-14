import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleManagedOpencodeMcp, managedOpencodeMcpToolNames } from "./managed-opencode-mcp.js";
import { buildManagedOpencodeRuntimeConfig } from "./managed-opencode-runtime-config.js";
import { ensureWorkspaceFiles } from "./workspace-init.js";

describe("managed OpenCode Matterhorn MCP", () => {
  test("injects an authenticated runtime-only remote MCP config", () => {
    const content = buildManagedOpencodeRuntimeConfig({
      serverUrl: "http://127.0.0.1:4130/",
      clientToken: "test-client-token",
    });
    const config = JSON.parse(content);
    expect(config.mcp["matterhorn-work"]).toEqual({
      type: "remote",
      url: "http://127.0.0.1:4130/mcp/opencode",
      headers: { Authorization: "Bearer test-client-token" },
      enabled: true,
    });
    expect(config.plugin).toContain("opencode-chrome-devtools");
  });

  test("keeps the authenticated MCP config out of workspace files", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-managed-mcp-"));
    try {
      const runtimeContent = buildManagedOpencodeRuntimeConfig({
        serverUrl: "http://127.0.0.1:4130",
        clientToken: "memory-only-token",
      });
      await ensureWorkspaceFiles(root, "starter");

      const workspaceConfig = await readFile(join(root, "opencode.jsonc"), "utf8");
      expect(runtimeContent).toContain("memory-only-token");
      expect(runtimeContent).toContain("/mcp/opencode");
      expect(workspaceConfig).not.toContain("memory-only-token");
      expect(workspaceConfig).not.toContain("/mcp/opencode");
      expect(workspaceConfig).not.toContain("matterhorn-work");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("lists the bounded launch desk tools", async () => {
    const result = await handleManagedOpencodeMcp({
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      serverUrl: "http://127.0.0.1:4130",
      clientToken: "test-client-token",
    });
    expect(result.status).toBe(200);
    const body = result.body as { result: { tools: Array<{ name: string }> } };
    expect(body.result.tools.map((tool) => tool.name)).toEqual(managedOpencodeMcpToolNames());
    expect(managedOpencodeMcpToolNames()).toContain("matterhorn_hyperliquid_get_orderbook");
    expect(managedOpencodeMcpToolNames()).toContain("matterhorn_polymarket_check_compliance");
    expect(managedOpencodeMcpToolNames()).toContain("matterhorn_sui_preview_transfer");
  });

  test("forwards tool calls with the local client token", async () => {
    let observedUrl = "";
    let observedAuth = "";
    const result = await handleManagedOpencodeMcp({
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "matterhorn_hyperliquid_get_orderbook", arguments: { asset: "BTC" } },
      },
      serverUrl: "http://127.0.0.1:4130",
      clientToken: "test-client-token",
      fetchImpl: (async (url, init) => {
        observedUrl = String(url);
        observedAuth = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(JSON.stringify({ success: true, orderbook: { asset: "BTC" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    });
    expect(observedUrl).toBe("http://127.0.0.1:4130/api/hyperliquid/orderbook/BTC");
    expect(observedAuth).toBe("Bearer test-client-token");
    expect(result).toMatchObject({ status: 200 });
  });

  test("acknowledges notifications without a response body", async () => {
    const result = await handleManagedOpencodeMcp({
      payload: { jsonrpc: "2.0", method: "notifications/initialized" },
      serverUrl: "http://127.0.0.1:4130",
      clientToken: "test-client-token",
    });
    expect(result).toEqual({ status: 202, body: null });
  });
});
