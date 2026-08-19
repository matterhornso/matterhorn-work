import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { MatterhornAgentCapabilityBroker } from "./agent-capability.js";

const originalSigningSecret = process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
const originalRuntimeSecret = process.env.MATTERHORN_AGENT_RUNTIME_SECRET;

beforeEach(() => {
  process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = "capability-test-secret-at-least-32-characters";
  process.env.MATTERHORN_AGENT_RUNTIME_SECRET = "runtime-test-secret-at-least-32-characters";
});

afterEach(() => {
  if (originalSigningSecret === undefined) delete process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
  else process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = originalSigningSecret;
  if (originalRuntimeSecret === undefined) delete process.env.MATTERHORN_AGENT_RUNTIME_SECRET;
  else process.env.MATTERHORN_AGENT_RUNTIME_SECRET = originalRuntimeSecret;
});

function brokerWithRun() {
  const broker = new MatterhornAgentCapabilityBroker("enforce");
  broker.createRunGrant({
    runId: "run_1",
    workspaceId: "ws_1",
    sessionId: "ses_1",
    agentId: "matterhorn-sui",
    executionMode: "work",
    requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
  });
  return broker;
}

describe("agent capability broker", () => {
  test("binds a single-use capability to scope, tool and canonical arguments", () => {
    const broker = brokerWithRun();
    const args = { address: `0x${"1".repeat(64)}`, network: "testnet" };
    const capability = broker.issue({
      workspaceId: "ws_1",
      sessionId: "ses_1",
      callId: "call_1",
      agentId: "matterhorn-sui",
      toolName: "matterhorn-work_matterhorn_sui_get_balance",
      args,
    });
    const claims = broker.consume({ token: capability.token, toolName: "matterhorn_sui_get_balance", args });
    expect(claims.workspaceId).toBe("ws_1");
    expect(() => broker.consume({ token: capability.token, toolName: "matterhorn_sui_get_balance", args })).toThrow("capability_replayed");
  });

  test("fails closed for argument mutation, wrong tools and wrong sessions", () => {
    const broker = brokerWithRun();
    const args = { address: `0x${"1".repeat(64)}`, network: "testnet" };
    const capability = broker.issue({
      workspaceId: "ws_1",
      sessionId: "ses_1",
      callId: "call_2",
      toolName: "matterhorn_sui_get_balance",
      args,
    });
    expect(() => broker.consume({
      token: capability.token,
      toolName: "matterhorn_sui_get_balance",
      args: { ...args, network: "mainnet" },
    })).toThrow("capability_argument_mutation");
    expect(() => broker.issue({
      workspaceId: "ws_1",
      sessionId: "ses_other",
      callId: "call_3",
      toolName: "matterhorn_sui_get_balance",
      args,
    })).toThrow("capability_run_or_tool_not_found");
    expect(() => broker.issue({
      workspaceId: "ws_1",
      sessionId: "ses_1",
      callId: "call_4",
      toolName: "matterhorn_sui_preview_transfer",
      args,
    })).toThrow("capability_tool_not_in_run_grant");
  });

  test("never exposes a submit access class", () => {
    const broker = brokerWithRun();
    const capability = broker.issue({
      workspaceId: "ws_1",
      sessionId: "ses_1",
      callId: "call_5",
      toolName: "matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}` },
    });
    expect(capability.claims.access).toBe("read");
    expect(JSON.stringify(capability.claims)).not.toContain("submit");
  });

  test("request profiles only narrow and cannot broaden a selected desk", () => {
    const broker = new MatterhornAgentCapabilityBroker("enforce");
    broker.createRunGrant({
      runId: "run_narrow",
      workspaceId: "ws_1",
      sessionId: "ses_narrow",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{
        "*": false,
        "matterhorn-work_matterhorn_sui_get_balance": true,
        "matterhorn-work_matterhorn_hyperliquid_preview_order": true,
      }],
    });
    expect(() => broker.issue({
      workspaceId: "ws_1",
      sessionId: "ses_narrow",
      callId: "call_cross_desk",
      agentId: "matterhorn-sui",
      toolName: "matterhorn_hyperliquid_preview_order",
      args: { asset: "BTC", side: "buy", size: 1 },
    })).toThrow("capability_tool_not_in_run_grant");
  });

  test("workspace purge revokes grants and already-issued capabilities", () => {
    const broker = brokerWithRun();
    const args = { address: `0x${"1".repeat(64)}`, network: "testnet" };
    const capability = broker.issue({
      workspaceId: "ws_1",
      sessionId: "ses_1",
      callId: "call_purge",
      toolName: "matterhorn_sui_get_balance",
      args,
    });
    const purged = broker.purgeWorkspace("ws_1");
    expect(purged.runIds).toEqual(["run_1"]);
    expect(purged.callIds).toEqual(["call_purge"]);
    expect(broker.activeRun("ses_1")).toBeNull();
    expect(() => broker.consume({
      token: capability.token,
      toolName: "matterhorn_sui_get_balance",
      args,
    })).toThrow("capability_scope_mismatch");
  });

  test("closing a run revokes its grant and every unconsumed capability", () => {
    const broker = brokerWithRun();
    const args = { address: `0x${"1".repeat(64)}`, network: "testnet" };
    const capability = broker.issue({
      workspaceId: "ws_1",
      sessionId: "ses_1",
      callId: "call_close",
      toolName: "matterhorn_sui_get_balance",
      args,
    });
    expect(broker.closeRun("run_1")).toEqual({ callIds: ["call_close"] });
    expect(broker.activeRun("ses_1")).toBeNull();
    expect(() => broker.consume({
      token: capability.token,
      toolName: "matterhorn_sui_get_balance",
      args,
    })).toThrow("capability_scope_mismatch");
    expect(broker.closeRun("run_1")).toEqual({ callIds: [] });
  });
});
