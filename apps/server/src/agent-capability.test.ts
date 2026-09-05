import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MatterhornAgentCapabilityBroker } from "./agent-capability.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";
import { evaluatePolymarketOpenPositionJurisdiction } from "./polymarket-jurisdiction-policy.js";
import type { MatterhornTrustedJurisdiction } from "./trusted-jurisdiction.js";

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

function resignCapability(token: string, mutate: (claims: Record<string, unknown>) => void): string {
  const [payload] = token.split(".");
  if (!payload) throw new Error("test_capability_payload_missing");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  mutate(claims);
  const nextPayload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET!)
    .update(nextPayload)
    .digest("base64url");
  return `${nextPayload}.${signature}`;
}

const JURISDICTION_NOW = new Date("2026-09-04T12:00:00.000Z");

function polymarketJurisdiction(country: string): MatterhornTrustedJurisdiction {
  return {
    version: "matterhorn.edge-jurisdiction.v2",
    source: "vercel_ip_country",
    country,
    region: null,
    observedAt: "2026-09-04T11:59:59.000Z",
    expiresAt: "2026-09-04T12:00:59.000Z",
    evidenceHash: country === "CH" ? "c".repeat(64) : "b".repeat(64),
  };
}

function polymarketPolicyContext(country: string) {
  const evaluated = evaluatePolymarketOpenPositionJurisdiction(
    polymarketJurisdiction(country),
    JURISDICTION_NOW,
  );
  if (!evaluated.jurisdictionEvidenceHash || !evaluated.validUntil) {
    throw new Error("test_jurisdiction_context_missing");
  }
  return {
    evidenceHash: evaluated.jurisdictionEvidenceHash,
    policyVersion: evaluated.policyVersion,
    policyHash: evaluated.policyHash,
    decisionHash: evaluated.decisionHash,
    validUntil: evaluated.validUntil,
    polymarketOpenPositionAllowed: evaluated.canOpenPosition,
  };
}

function polymarketPrepareBroker(input: { appId?: string; country?: string; includePolicy?: boolean } = {}) {
  const broker = new MatterhornAgentCapabilityBroker("enforce");
  broker.setCoworkerResolver(() => true);
  const context = polymarketPolicyContext(input.country ?? "CH");
  const appId = input.appId ?? "matterhorn.polymarket-wallet-preview";
  broker.createRunGrant({
    runId: "run_polymarket_prepare",
    workspaceId: "ws_1",
    sessionId: "ses_polymarket_prepare",
    agentId: "matterhorn-polymarket",
    executionMode: "work",
    requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_polymarket_preview_order": true }],
    coworker: {
      id: "cw_polymarket",
      workspaceId: "ws_1",
      ownerId: "account_1",
      revision: 1,
      policyVersion: "coworker-policy-1",
      allowedAppIds: [appId],
      allowedActionIds: ["polymarket_preview_trade"],
      allowedNetworks: ["polygon:mainnet"],
      automaticAuthorities: ["prepare"],
      actionBindings: [{
        connectionId: "cxc_polymarket",
        appId,
        manifestRevision: "1.0.0",
        actionId: "polymarket_preview_trade",
        network: "polygon:mainnet",
        proxyToolName: "matterhorn_polymarket_preview_order",
        access: "prepare",
      }],
      allowedDataLabels: ["public", "wallet_private", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
      maxReadCallsPerRun: 0,
      maxPrepareCallsPerFamily: 1,
    },
    jurisdictionEvidenceHash: context.evidenceHash,
    ...(input.includePolicy === false ? {} : { jurisdictionPolicy: context }),
    now: JURISDICTION_NOW,
  });
  return { broker, context };
}

describe("agent capability broker", () => {
  test("bounds persisted run-grant expiry to the exact accepted run", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-capability-expiry-"));
    const state = new MatterhornGuardedRuntimeStateStore(join(root, "state.db"));
    const broker = new MatterhornAgentCapabilityBroker("enforce", state);
    const now = new Date("2026-09-02T12:00:00.000Z");
    const expiresAtMs = now.getTime() + 10 * 60_000;
    broker.createRunGrant({
      runId: "run_short_lived",
      workspaceId: "ws_short_lived",
      sessionId: "ses_short_lived",
      agentId: "matterhorn-sui",
      executionMode: "work",
      expiresAtMs,
      now,
    });
    expect(state.list<{ expiresAtMs: number }>("run_grant", { nowMs: now.getTime() })).toEqual([
      expect.objectContaining({ expiresAtMs }),
    ]);
    expect(() => broker.createRunGrant({
      runId: "run_too_long",
      workspaceId: "ws_short_lived",
      sessionId: "ses_too_long",
      agentId: "matterhorn-sui",
      executionMode: "work",
      expiresAtMs: now.getTime() + 6 * 60 * 60 * 1_000 + 1,
      now,
    })).toThrow("capability_run_expiry_invalid");
    state.close();
  });

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

  test("rejects correctly signed capabilities with open or invalid claim contracts", () => {
    const broker = brokerWithRun();
    const args = { address: `0x${"1".repeat(64)}`, network: "testnet" };
    const capability = broker.issue({
      runId: "run_1",
      workspaceId: "ws_1",
      sessionId: "ses_1",
      callId: "call_closed_claims",
      agentId: "matterhorn-sui",
      toolName: "matterhorn_sui_get_balance",
      args,
    });
    const withSubmitAuthority = resignCapability(capability.token, (claims) => {
      claims.submit = true;
    });
    expect(() => broker.consume({ token: withSubmitAuthority, toolName: "matterhorn_sui_get_balance", args }))
      .toThrow("capability_invalid_signature");
    const withUnboundedExpiry = resignCapability(capability.token, (claims) => {
      claims.expiresAt = "2999-01-01T00:00:00.000Z";
    });
    expect(() => broker.consume({ token: withUnboundedExpiry, toolName: "matterhorn_sui_get_balance", args }))
      .toThrow("capability_invalid_signature");
  });

  test("does not let a repeated run or session reset guarded budgets", () => {
    const broker = brokerWithRun();
    expect(() => broker.createRunGrant({
      runId: "run_1",
      workspaceId: "ws_1",
      sessionId: "ses_new",
      agentId: "matterhorn-sui",
      executionMode: "work",
    })).toThrow("capability_run_already_exists");
    expect(() => broker.createRunGrant({
      runId: "run_new",
      workspaceId: "ws_1",
      sessionId: "ses_1",
      agentId: "matterhorn-sui",
      executionMode: "work",
    })).toThrow("capability_session_already_active");
  });

  test("binds capabilities to the server-owned jurisdiction evidence hash", () => {
    const broker = new MatterhornAgentCapabilityBroker("enforce");
    const jurisdictionEvidenceHash = "a".repeat(64);
    broker.createRunGrant({
      runId: "run_jurisdiction",
      workspaceId: "ws_1",
      sessionId: "ses_jurisdiction",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_sui_get_balance": true }],
      jurisdictionEvidenceHash,
    });
    const args = { address: `0x${"1".repeat(64)}`, network: "testnet" };
    const capability = broker.issue({
      runId: "run_jurisdiction",
      workspaceId: "ws_1",
      sessionId: "ses_jurisdiction",
      callId: "call_jurisdiction",
      toolName: "matterhorn_sui_get_balance",
      args,
    });
    expect(capability.claims.jurisdictionEvidenceHash).toBe(jurisdictionEvidenceHash);
    expect(broker.consume({ token: capability.token, toolName: "matterhorn_sui_get_balance", args }))
      .toMatchObject({ jurisdictionEvidenceHash });
    expect(() => broker.createRunGrant({
      runId: "run_bad_jurisdiction",
      workspaceId: "ws_1",
      sessionId: "ses_bad_jurisdiction",
      executionMode: "work",
      jurisdictionEvidenceHash: "not-a-digest",
    })).toThrow("capability_jurisdiction_binding_invalid");
  });

  test("binds an allowed Polymarket prepare capability to the current server policy", () => {
    const { broker, context } = polymarketPrepareBroker();
    const args = { marketId: "market_1", outcome: "YES", side: "buy", amountUsdc: "5" };
    const capability = broker.issue({
      runId: "run_polymarket_prepare",
      workspaceId: "ws_1",
      sessionId: "ses_polymarket_prepare",
      callId: "call_polymarket_allowed",
      toolName: "matterhorn_polymarket_preview_order",
      args,
      now: JURISDICTION_NOW,
    });
    expect(capability.claims.jurisdictionPolicy).toEqual(context);
    expect(Date.parse(capability.claims.expiresAt)).toBeLessThanOrEqual(Date.parse(context.validUntil));
    expect(broker.consume({
      token: capability.token,
      toolName: "matterhorn_polymarket_preview_order",
      args,
      now: JURISDICTION_NOW,
    })).toMatchObject({ jurisdictionPolicy: context });
    expect(broker.consumedCapabilityProof({
      runId: "run_polymarket_prepare",
      workspaceId: "ws_1",
      sessionId: "ses_polymarket_prepare",
      callId: "call_polymarket_allowed",
      coworkerId: "cw_polymarket",
      connectionId: "cxc_polymarket",
      appId: "matterhorn.polymarket-wallet-preview",
      manifestRevision: "1.0.0",
      actionId: "polymarket_preview_trade",
      network: "polygon:mainnet",
      toolName: "matterhorn_polymarket_preview_order",
      args,
    })).toMatchObject({ jurisdictionPolicy: context });
  });

  test("fails closed for missing, blocked, expired, or substituted Polymarket policy context", () => {
    const args = { marketId: "market_1", outcome: "YES", side: "buy", amountUsdc: "5" };
    const missing = polymarketPrepareBroker({ includePolicy: false }).broker;
    expect(() => missing.issue({
      runId: "run_polymarket_prepare",
      workspaceId: "ws_1",
      sessionId: "ses_polymarket_prepare",
      callId: "call_missing_policy",
      toolName: "matterhorn_polymarket_preview_order",
      args,
      now: JURISDICTION_NOW,
    })).toThrow("capability_polymarket_jurisdiction_denied");

    const thirdParty = polymarketPrepareBroker({
      appId: "acme.prediction-market",
      includePolicy: false,
    }).broker;
    expect(() => thirdParty.issue({
      runId: "run_polymarket_prepare",
      workspaceId: "ws_1",
      sessionId: "ses_polymarket_prepare",
      callId: "call_third_party_missing_policy",
      toolName: "matterhorn_polymarket_preview_order",
      args,
      now: JURISDICTION_NOW,
    })).toThrow("capability_polymarket_jurisdiction_denied");

    const blocked = polymarketPrepareBroker({ country: "GB" }).broker;
    expect(() => blocked.issue({
      runId: "run_polymarket_prepare",
      workspaceId: "ws_1",
      sessionId: "ses_polymarket_prepare",
      callId: "call_blocked_policy",
      toolName: "matterhorn_polymarket_preview_order",
      args,
      now: JURISDICTION_NOW,
    })).toThrow("capability_polymarket_jurisdiction_denied");

    const expired = polymarketPrepareBroker().broker;
    expect(() => expired.issue({
      runId: "run_polymarket_prepare",
      workspaceId: "ws_1",
      sessionId: "ses_polymarket_prepare",
      callId: "call_expired_policy",
      toolName: "matterhorn_polymarket_preview_order",
      args,
      now: new Date("2026-09-04T12:05:00.000Z"),
    })).toThrow("capability_polymarket_jurisdiction_denied");

    const context = polymarketPolicyContext("CH");
    const broker = new MatterhornAgentCapabilityBroker("enforce");
    expect(() => broker.createRunGrant({
      runId: "run_substituted_policy",
      workspaceId: "ws_1",
      sessionId: "ses_substituted_policy",
      executionMode: "work",
      jurisdictionEvidenceHash: context.evidenceHash,
      jurisdictionPolicy: { ...context, policyHash: "f".repeat(64) },
      now: JURISDICTION_NOW,
    })).toThrow("capability_jurisdiction_policy_invalid");
  });

  test("does not let a generic agent bypass Polymarket transaction jurisdiction", () => {
    const broker = new MatterhornAgentCapabilityBroker("enforce");
    broker.createRunGrant({
      runId: "run_generic_polymarket_prepare",
      workspaceId: "ws_1",
      sessionId: "ses_generic_polymarket_prepare",
      agentId: "matterhorn",
      executionMode: "work",
      requestToolProfiles: [{
        "*": false,
        "matterhorn-work_matterhorn_polymarket_preview_order": true,
      }],
      now: JURISDICTION_NOW,
    });
    expect(() => broker.issue({
      runId: "run_generic_polymarket_prepare",
      workspaceId: "ws_1",
      sessionId: "ses_generic_polymarket_prepare",
      callId: "call_generic_polymarket_prepare",
      toolName: "matterhorn_polymarket_preview_order",
      args: { marketId: "market_1", outcome: "YES", side: "buy", amountUsdc: "5" },
      now: JURISDICTION_NOW,
    })).toThrow("capability_polymarket_jurisdiction_denied");
  });

  test("keeps certified Polymarket public reads available without transaction jurisdiction", () => {
    const broker = new MatterhornAgentCapabilityBroker("enforce");
    broker.setCoworkerResolver(() => true);
    broker.createRunGrant({
      runId: "run_polymarket_read",
      workspaceId: "ws_1",
      sessionId: "ses_polymarket_read",
      agentId: "matterhorn-polymarket",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, "matterhorn-work_matterhorn_polymarket_search_markets": true }],
      coworker: {
        id: "cw_polymarket_read",
        workspaceId: "ws_1",
        ownerId: "account_1",
        revision: 1,
        policyVersion: "coworker-policy-1",
        allowedAppIds: ["matterhorn.polymarket-research"],
        allowedActionIds: ["polymarket_market_search"],
        allowedNetworks: ["polymarket:public"],
        automaticAuthorities: ["read"],
        actionBindings: [{
          connectionId: "cxc_polymarket_read",
          appId: "matterhorn.polymarket-research",
          manifestRevision: "1.0.0",
          actionId: "polymarket_market_search",
          network: "polymarket:public",
          proxyToolName: "matterhorn_polymarket_search_markets",
          access: "read",
        }],
        allowedDataLabels: ["public", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
        maxReadCallsPerRun: 1,
        maxPrepareCallsPerFamily: 0,
      },
      now: JURISDICTION_NOW,
    });
    expect(broker.issue({
      runId: "run_polymarket_read",
      workspaceId: "ws_1",
      sessionId: "ses_polymarket_read",
      callId: "call_polymarket_read",
      toolName: "matterhorn_polymarket_search_markets",
      args: { query: "election", limit: 5 },
      now: JURISDICTION_NOW,
    }).claims.access).toBe("read");
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
          connectionId: "cxc_sui",
          appId: "matterhorn.sui-testnet",
          manifestRevision: "1.0.0",
          actionId: "sui_account_read",
          network: "sui:testnet",
          proxyToolName: "matterhorn_sui_get_balance",
          access: "read",
        }],
        allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
        maxReadCallsPerRun: 1,
        maxPrepareCallsPerFamily: 0,
      },
    });
    const args = { address: `0x${"1".repeat(64)}`, network: "testnet" };
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
      connectionId: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionId: "sui_account_read",
      network: "sui:testnet",
    });
    expect(broker.consume({ token: capability.token, toolName: "matterhorn_sui_get_balance", args }).runId)
      .toBe("run_coworker");
    expect(broker.consumedCapabilityProof({
      runId: "run_coworker",
      workspaceId: "ws_1",
      sessionId: "ses_coworker",
      callId: "call_coworker",
      coworkerId: "cw_sui",
      connectionId: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionId: "sui_account_read",
      network: "sui:testnet",
      toolName: "matterhorn_sui_get_balance",
      args,
    })).toMatchObject({ access: "read" });
    expect(broker.consumedCapabilityProof({
      runId: "run_coworker",
      workspaceId: "ws_1",
      sessionId: "ses_coworker",
      callId: "call_coworker",
      coworkerId: "cw_sui",
      connectionId: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionId: "sui_account_read",
      network: "sui:testnet",
      toolName: "matterhorn_sui_get_balance",
      args: { ...args, network: "sui:mainnet" },
    })).toBeNull();
    expect(broker.consumedCapabilityProof({
      runId: "run_coworker",
      workspaceId: "ws_1",
      sessionId: "ses_coworker",
      callId: "call_coworker",
      coworkerId: "cw_sui",
      connectionId: "cxc_other",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionId: "sui_account_read",
      network: "sui:testnet",
      toolName: "matterhorn_sui_get_balance",
      args,
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
    expect(broker.runIdsForConnection({ workspaceId: "ws_1", connectionId: "cxc_sui" }))
      .toEqual(["run_coworker"]);
    expect(broker.runIdsForConnection({ workspaceId: "ws_other", connectionId: "cxc_sui" }))
      .toEqual([]);
    expect(broker.runIdsForConnection({ workspaceId: "ws_1", connectionId: "cxc_other" }))
      .toEqual([]);

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
          connectionId: "cxc_sui",
          appId: "matterhorn.sui-testnet",
          manifestRevision: "1.0.0",
          actionId: "sui_account_read",
          network: "sui:testnet",
          proxyToolName: "matterhorn_sui_get_balance",
          access: "read",
        }],
        allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
        allowUnverifiedProviderConsent: false,
        maxReadCallsPerRun: 4,
        maxPrepareCallsPerFamily: 0,
      },
    });
    const derived = broker.issue({
      runId: "run_coworker_scope",
      workspaceId: "ws_1",
      sessionId: "ses_coworker_scope",
      callId: "call_legacy",
      toolName: "matterhorn_sui_get_balance",
      args: { address: `0x${"1".repeat(64)}`, network: "testnet" },
    });
    expect(derived.claims.coworker?.connectionId).toBe("cxc_sui");
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
    })).toThrow("capability_coworker_connection_resolution_required");
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
    const jurisdictionPolicy = polymarketPolicyContext("CH");
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
      jurisdictionEvidenceHash: jurisdictionPolicy.evidenceHash,
      jurisdictionPolicy,
      now: JURISDICTION_NOW,
    });
    const autoArgs = { message: "Prepare the reviewed action I described" };
    const automatic = broker.issue({
      runId: "run_protocol_family",
      workspaceId: "ws_1",
      sessionId: "ses_protocol_family",
      callId: "call_auto_hyperliquid",
      toolName: "matterhorn_crypto_chat",
      args: autoArgs,
      now: JURISDICTION_NOW,
    });
    broker.consume({
      token: automatic.token,
      toolName: "matterhorn_crypto_chat",
      args: autoArgs,
      now: JURISDICTION_NOW,
    });
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
      now: JURISDICTION_NOW,
    })).toThrow("capability_prepare_family_already_completed");
    expect(broker.issue({
      runId: "run_protocol_family",
      workspaceId: "ws_1",
      sessionId: "ses_protocol_family",
      callId: "call_distinct_polymarket",
      toolName: "matterhorn_polymarket_preview_order",
      args: { marketId: "market_1", outcome: "YES", amountUsdc: "5" },
      now: JURISDICTION_NOW,
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

  test("fails closed when a restored run grant broadens its persisted tool authority", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-capability-corrupt-grant-"));
    const path = join(root, "state.db");
    const state = new MatterhornGuardedRuntimeStateStore(path);
    const broker = new MatterhornAgentCapabilityBroker("enforce", state);
    broker.createRunGrant({
      runId: "run_corrupt",
      workspaceId: "ws_corrupt",
      sessionId: "ses_corrupt",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, matterhorn_sui_get_balance: true }],
    });
    const stored = state.get<Record<string, unknown>>("run_grant", "run_corrupt");
    expect(stored).not.toBeNull();
    state.put({
      kind: "run_grant",
      key: "run_corrupt",
      workspaceId: "ws_corrupt",
      sessionId: "ses_corrupt",
      value: { ...stored, allowedTools: ["matterhorn_sui_get_balance", "matterhorn_unknown_submit"] },
      expiresAtMs: Date.now() + 60_000,
    });
    expect(() => new MatterhornAgentCapabilityBroker("enforce", state))
      .toThrow("capability_persisted_grant_invalid");
    state.close();
  });

  test("fails closed when a consumed capability row disagrees with its claims", () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-capability-corrupt-consumption-"));
    const path = join(root, "state.db");
    const state = new MatterhornGuardedRuntimeStateStore(path);
    const broker = new MatterhornAgentCapabilityBroker("enforce", state);
    broker.createRunGrant({
      runId: "run_consumed",
      workspaceId: "ws_consumed",
      sessionId: "ses_consumed",
      agentId: "matterhorn-sui",
      executionMode: "work",
      requestToolProfiles: [{ "*": false, matterhorn_sui_get_balance: true }],
    });
    const args = { address: `0x${"2".repeat(64)}`, network: "testnet" };
    const capability = broker.issue({
      runId: "run_consumed",
      workspaceId: "ws_consumed",
      sessionId: "ses_consumed",
      callId: "call_consumed",
      toolName: "matterhorn_sui_get_balance",
      args,
    });
    const expiresAtMs = Date.parse(capability.claims.expiresAt);
    expect(state.consumeCapability({
      jti: "cap_wrong_row",
      runId: capability.claims.runId,
      callId: capability.claims.callId,
      workspaceId: capability.claims.workspaceId,
      sessionId: capability.claims.sessionId,
      claims: capability.claims,
      consumedAtMs: Date.now(),
      expiresAtMs: expiresAtMs + 60_000,
    })).toBe(true);
    expect(() => new MatterhornAgentCapabilityBroker("enforce", state))
      .toThrow("capability_persisted_consumption_invalid");
    state.close();
  });
});
