import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MatterhornAgentCapabilityBroker } from "./agent-capability.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

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
      runId: "run_1",
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
      runId: "run_1",
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
      runId: "run_1",
      workspaceId: "ws_1",
      sessionId: "ses_other",
      callId: "call_3",
      toolName: "matterhorn_sui_get_balance",
      args,
    })).toThrow("capability_scope_mismatch");
    expect(() => broker.issue({
      runId: "run_1",
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
      runId: "run_1",
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
      runId: "run_narrow",
      workspaceId: "ws_1",
      sessionId: "ses_narrow",
      callId: "call_cross_desk",
      agentId: "matterhorn-sui",
      toolName: "matterhorn_hyperliquid_preview_order",
      args: { asset: "BTC", side: "buy", size: 1 },
    })).toThrow("capability_tool_not_in_run_grant");
  });

  test("binds coworker authority to its exact active revision, app, action, network and budget", () => {
    let active = true;
    const broker = new MatterhornAgentCapabilityBroker("enforce");
    broker.setCoworkerResolver((binding) => active
      && binding.id === "cw_sui"
      && binding.revision === 4
      && binding.policyVersion === "coworker-policy-2");
    broker.createRunGrant({
      runId: "run_coworker",
      workspaceId: "ws_1",
      sessionId: "ses_coworker",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
      coworker: {
        id: "cw_sui",
        workspaceId: "ws_1",
        ownerId: "account_1",
        revision: 4,
        policyVersion: "coworker-policy-2",
        allowedAppIds: ["matterhorn.sui-testnet"],
        allowedActionIds: ["sui_account_read"],
        allowedNetworks: ["sui:testnet"],
        automaticAuthorities: ["read"],
        actionBindings: [{
          appId: "matterhorn.sui-testnet",
          actionId: "sui_account_read",
          proxyToolName: "matterhorn_sui_get_balance",
          access: "read",
        }],
        allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
        maxReadCallsPerRun: 1,
        maxPrepareCallsPerFamily: 0,
      },
    });
    const args = {
      appId: "matterhorn.sui-testnet",
      actionId: "sui_account_read",
      access: "read",
      network: "sui:testnet",
      canonicalArgumentsHash: "a".repeat(64),
    };
    const capability = broker.issue({
      runId: "run_coworker",
      workspaceId: "ws_1",
      sessionId: "ses_coworker",
      callId: "call_coworker",
      toolName: "matterhorn_sui_get_balance",
      args,
    });
    expect(capability.claims.coworker).toEqual({
      id: "cw_sui",
      ownerId: "account_1",
      revision: 4,
      policyVersion: "coworker-policy-2",
    });
    expect(broker.consume({ token: capability.token, toolName: "matterhorn_sui_get_balance", args }).runId)
      .toBe("run_coworker");
    expect(broker.consumedCapabilityProof({
      runId: "run_coworker",
      workspaceId: "ws_1",
      sessionId: "ses_coworker",
      callId: "call_coworker",
      coworkerId: "cw_sui",
      toolName: "matterhorn_sui_get_balance",
      args,
    })).toMatchObject({ access: "read" });
    expect(broker.consumedCapabilityProof({
      runId: "run_coworker",
      workspaceId: "ws_1",
      sessionId: "ses_coworker",
      callId: "call_coworker",
      coworkerId: "cw_sui",
      toolName: "matterhorn_sui_get_balance",
      args: { ...args, network: "sui:mainnet" },
    })).toBeNull();
    expect(() => broker.issue({
      runId: "run_coworker",
      workspaceId: "ws_1",
      sessionId: "ses_coworker",
      callId: "call_budget",
      toolName: "matterhorn_sui_get_balance",
      args,
    })).toThrow("capability_read_budget_exhausted");
    expect(broker.runIdsForCoworker({ workspaceId: "ws_1", ownerId: "account_1", coworkerId: "cw_sui" }))
      .toEqual(["run_coworker"]);

    active = false;
    expect(() => broker.issue({
      runId: "run_coworker",
      workspaceId: "ws_1",
      sessionId: "ses_coworker",
      callId: "call_inactive",
      toolName: "matterhorn_sui_get_balance",
      args,
    })).toThrow("capability_coworker_inactive");
  });

  test("refuses coworker capabilities on legacy direct tools or broadened app scopes", () => {
    const broker = new MatterhornAgentCapabilityBroker("enforce");
    broker.setCoworkerResolver(() => true);
    broker.createRunGrant({
      runId: "run_coworker_scope",
      workspaceId: "ws_1",
      sessionId: "ses_coworker_scope",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
      coworker: {
        id: "cw_scope",
        workspaceId: "ws_1",
        ownerId: "account_1",
        revision: 1,
        policyVersion: "coworker-policy-1",
        allowedAppIds: ["matterhorn.sui-testnet"],
        allowedActionIds: ["sui_account_read"],
        allowedNetworks: ["sui:testnet"],
        automaticAuthorities: ["read"],
        actionBindings: [{
          appId: "matterhorn.sui-testnet",
          actionId: "sui_account_read",
          proxyToolName: "matterhorn_sui_get_balance",
          access: "read",
        }],
        allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
        maxReadCallsPerRun: 4,
        maxPrepareCallsPerFamily: 0,
      },
    });
    expect(() => broker.issue({
      runId: "run_coworker_scope",
      workspaceId: "ws_1",
      sessionId: "ses_coworker_scope",
      callId: "call_legacy",
      toolName: "matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}` },
    })).toThrow("capability_coworker_app_binding_required");
    expect(() => broker.issue({
      runId: "run_coworker_scope",
      workspaceId: "ws_1",
      sessionId: "ses_coworker_scope",
      callId: "call_broadened",
      toolName: "matterhorn_sui_get_balance",
      args: {
        appId: "malicious.app",
        actionId: "sui_account_read",
        access: "read",
        network: "sui:testnet",
      },
    })).toThrow("capability_coworker_scope_mismatch");
  });

  test("workspace purge revokes grants and already-issued capabilities", () => {
    const broker = brokerWithRun();
    const args = { address: `0x${"1".repeat(64)}`, network: "testnet" };
    const capability = broker.issue({
      runId: "run_1",
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
      runId: "run_1",
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

  test("accounts prepare budgets from the resolved protocol instead of a static registry prefix", () => {
    const broker = new MatterhornAgentCapabilityBroker("enforce");
    broker.createRunGrant({
      runId: "run_protocol_family",
      workspaceId: "ws_1",
      sessionId: "ses_protocol_family",
      agentId: "matterhorn",
      executionMode: "work",
      requestToolProfiles: [{
        "*": false,
        "matterhorn-work_matterhorn_crypto_chat": true,
        "matterhorn-work_matterhorn_hyperliquid_preview_order": true,
        "matterhorn-work_matterhorn_polymarket_preview_order": true,
      }],
    });
    const autoArgs = { message: "Prepare the reviewed action I described" };
    const automatic = broker.issue({
      runId: "run_protocol_family",
      workspaceId: "ws_1",
      sessionId: "ses_protocol_family",
      callId: "call_auto_hyperliquid",
      toolName: "matterhorn_crypto_chat",
      args: autoArgs,
    });
    broker.consume({ token: automatic.token, toolName: "matterhorn_crypto_chat", args: autoArgs });
    broker.recordToolOutcome(
      "run_protocol_family",
      "call_auto_hyperliquid",
      "matterhorn_crypto_chat",
      "success",
      "hyperliquid",
    );
    expect(() => broker.issue({
      runId: "run_protocol_family",
      workspaceId: "ws_1",
      sessionId: "ses_protocol_family",
      callId: "call_duplicate_hyperliquid",
      toolName: "matterhorn_hyperliquid_preview_order",
      args: { asset: "BTC", side: "buy", size: "0.01" },
    })).toThrow("capability_prepare_family_already_completed");
    expect(broker.issue({
      runId: "run_protocol_family",
      workspaceId: "ws_1",
      sessionId: "ses_protocol_family",
      callId: "call_distinct_polymarket",
      toolName: "matterhorn_polymarket_preview_order",
      args: { marketId: "market_1", outcome: "YES", amountUsdc: "5" },
    }).claims.access).toBe("prepare");
  });

  test("persists grants and rejects replay atomically across broker instances", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-capability-state-"));
    const path = join(root, "state.db");
    const firstState = new MatterhornGuardedRuntimeStateStore(path);
    const first = new MatterhornAgentCapabilityBroker("enforce", firstState);
    first.createRunGrant({
      runId: "run_durable",
      workspaceId: "ws_durable",
      sessionId: "ses_durable",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
    });
    const args = { address: `0x${"2".repeat(64)}`, network: "testnet" };
    const capability = first.issue({
      runId: "run_durable",
      workspaceId: "ws_durable",
      sessionId: "ses_durable",
      callId: "call_durable",
      toolName: "matterhorn_sui_get_balance",
      args,
    });

    const secondState = new MatterhornGuardedRuntimeStateStore(path);
    const second = new MatterhornAgentCapabilityBroker("enforce", secondState);
    expect(second.activeRun("ses_durable")).toBe("run_durable");
    expect(second.consume({ token: capability.token, toolName: "matterhorn_sui_get_balance", args }).runId).toBe("run_durable");
    expect(() => first.consume({ token: capability.token, toolName: "matterhorn_sui_get_balance", args })).toThrow("capability_replayed");
    firstState.close();
    secondState.close();
  });
});
