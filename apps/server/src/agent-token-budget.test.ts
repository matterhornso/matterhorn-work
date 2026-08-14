import { describe, expect, test } from "bun:test";

import {
  MATTERHORN_DESK_AGENT_MANIFESTS,
  buildMatterhornDeskAgentSystemPrompt,
  buildMatterhornDeskRequestOverlay,
} from "@matterhorn-work/types/desk-agents";
import { handleManagedOpencodeMcp } from "./managed-opencode-mcp.js";

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
});
