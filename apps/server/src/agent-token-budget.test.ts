import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_DESK_AGENT_MANIFESTS,
  buildMatterhornDeskAgentSystemPrompt,
  buildMatterhornDeskRequestOverlay,
} from "@matterhorn-work/types/desk-agents";
import {
  handleManagedOpencodeMcp,
  MANAGED_MCP_MODEL_CONTENT_MAX_CHARS,
  managedOpencodeCryptoToolDefinitions,
} from "./managed-opencode-mcp.js";
import { buildMatterhornGeneralCryptoToolProfile } from "./agent-tool-routing.js";

describe("agent token budgets", () => {
  test("keeps managed desk contracts and per-turn overlays bounded", () => {
    for (const agent of Object.values(MATTERHORN_DESK_AGENT_MANIFESTS)) {
      expect(
        buildMatterhornDeskAgentSystemPrompt(agent).length,
        `${agent.agentId} runtime contract exceeded the 6.5k character budget`,
      ).toBeLessThanOrEqual(6_500);
      expect(
        buildMatterhornDeskRequestOverlay(agent).length,
        `${agent.agentId} request overlay duplicated runtime policy`,
      ).toBeLessThanOrEqual(220);
    }
  });

  test("keeps the full managed MCP schema catalog bounded", async () => {
    expect(MANAGED_MCP_MODEL_CONTENT_MAX_CHARS).toBeLessThanOrEqual(8_000);
    const result = await handleManagedOpencodeMcp({
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      serverUrl: "https://matterhorn.invalid",
      clientToken: "test-token",
    });
    const body = result.body as { result?: { tools?: unknown[] } };
    const tools = body.result?.tools ?? [];
    expect(tools.length).toBeGreaterThan(0);
    expect(JSON.stringify(tools).length).toBeLessThanOrEqual(11_000);
    for (const tool of tools) {
      const name = typeof tool === "object" && tool && "name" in tool
        ? String((tool as { name: unknown }).name)
        : "unknown";
      expect(JSON.stringify(tool).length, `${name} schema exceeded 2.5k characters`).toBeLessThanOrEqual(2_500);
    }
  });

  test("keeps venue routing materially smaller than the full crypto catalog", () => {
    const definitions = managedOpencodeCryptoToolDefinitions();
    const fullChars = JSON.stringify(definitions).length;
    const cases = [
      { text: "Latest Bittensor subnets", maxRatio: 0.35 },
      { text: "Hyperliquid funding", maxRatio: 0.60 },
      { text: "Search prediction markets", maxRatio: 0.60 },
      { text: "Sui balance", maxRatio: 0.20 },
    ];
    for (const item of cases) {
      const profile = buildMatterhornGeneralCryptoToolProfile({ text: item.text });
      const allowed = new Set(Object.entries(profile ?? {})
        .filter(([name, enabled]) => name !== "*" && enabled)
        .map(([name]) => name.replace(/^matterhorn-work_/, "")));
      const routed = definitions.filter((tool) => allowed.has(tool.name));
      expect(routed.length, `${item.text} should resolve a capability family`).toBeGreaterThan(0);
      expect(
        JSON.stringify(routed).length / fullChars,
        `${item.text} route exceeded its schema budget`,
      ).toBeLessThanOrEqual(item.maxRatio);
    }
  });
});
