import { describe, expect, test } from "bun:test";

import {
  getMatterhornCryptoTool,
  listMatterhornCryptoTools,
} from "@matterhorn-work/types/crypto-action-registry";
import { getDeskActionManifest } from "@matterhorn-work/types/desk-actions";
import { MATTERHORN_DESK_AGENT_MANIFESTS } from "@matterhorn-work/types/desk-agents";

import { handleManagedOpencodeMcp } from "./managed-opencode-mcp.js";

describe("canonical crypto action registry", () => {
  test("owns every hosted crypto MCP schema and risk contract", async () => {
    const definitions = listMatterhornCryptoTools();
    expect(definitions.length).toBeGreaterThan(10);
    expect(new Set(definitions.map((tool) => tool.name)).size).toBe(definitions.length);

    for (const tool of definitions) {
      expect(tool.name).toMatch(/^matterhorn_[a-z0-9_]+$/);
      expect(tool.timeoutMs).toBeGreaterThanOrEqual(1_000);
      expect(tool.timeoutMs).toBeLessThanOrEqual(30_000);
      expect(tool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
      });
      expect(tool.deskIds.length).toBeGreaterThan(0);
      expect(tool.actionIds.length).toBeGreaterThan(0);
      for (const actionId of tool.actionIds) {
        expect(
          tool.deskIds.some((deskId) => getDeskActionManifest(deskId, actionId) !== undefined),
          `${tool.name} references unknown action ${actionId}`,
        ).toBe(true);
      }
    }

    const response = await handleManagedOpencodeMcp({
      payload: { jsonrpc: "2.0", id: "registry", method: "tools/list" },
      serverUrl: "http://127.0.0.1:4130",
      clientToken: "test-client-token",
    });
    const body = response.body as {
      result: { tools: Array<{ name: string; title: string; description: string; inputSchema: unknown }> };
    };
    for (const definition of definitions) {
      expect(body.result.tools.find((tool) => tool.name === definition.name)).toEqual({
        name: definition.name,
        title: definition.title,
        description: definition.description,
        inputSchema: definition.inputSchema,
      });
    }
  });

  test("covers every crypto tool exposed to a managed desk agent", () => {
    for (const deskId of ["bittensor", "hyperliquid", "polymarket", "sui"] as const) {
      const manifest = MATTERHORN_DESK_AGENT_MANIFESTS[deskId];
      for (const runtimeName of manifest.toolPolicy.work) {
        const toolName = runtimeName.replace(/^matterhorn-work_/, "");
        const definition = getMatterhornCryptoTool(toolName);
        expect(definition, `${runtimeName} is missing from the canonical crypto registry`).toBeDefined();
        expect(definition?.deskIds).toContain(deskId);
      }
    }
  });
});
