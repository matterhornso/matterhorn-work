import { describe, expect, test } from "bun:test";

import {
  getSessionAgent,
  saveSessionAgent,
  sessionAgentScopeKey,
} from "../src/react-app/domains/session/sync/agent-store";

describe("session agent store", () => {
  test("scopes desk agents to their workspace chat", () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const workspaceId = `ws-${suffix}`;
    const hyperliquidSessionId = `ses-hyperliquid-${suffix}`;
    const bittensorSessionId = `ses-bittensor-${suffix}`;

    saveSessionAgent(workspaceId, hyperliquidSessionId, "hyperliquid-agent");
    saveSessionAgent(workspaceId, bittensorSessionId, "bittensor-agent");

    expect(getSessionAgent(workspaceId, hyperliquidSessionId)).toBe("hyperliquid-agent");
    expect(getSessionAgent(workspaceId, bittensorSessionId)).toBe("bittensor-agent");
  });

  test("clears only the selected chat agent", () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const workspaceId = `ws-${suffix}`;
    const firstSessionId = `ses-first-${suffix}`;
    const secondSessionId = `ses-second-${suffix}`;

    saveSessionAgent(workspaceId, firstSessionId, "polymarket-agent");
    saveSessionAgent(workspaceId, secondSessionId, "sui-agent");
    saveSessionAgent(workspaceId, firstSessionId, null);

    expect(getSessionAgent(workspaceId, firstSessionId)).toBeNull();
    expect(getSessionAgent(workspaceId, secondSessionId)).toBe("sui-agent");
  });

  test("rejects incomplete chat scopes", () => {
    expect(sessionAgentScopeKey("ws-1", null)).toBe("");
    expect(sessionAgentScopeKey("", "ses-1")).toBe("");
  });
});
