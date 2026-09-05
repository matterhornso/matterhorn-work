import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { MatterhornGuardedCryptoAppAuthorization } from "./crypto-app-guarded-authorization.js";
import { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const original = {
  mode: process.env.MATTERHORN_GUARDED_RUNTIME_MODE,
  runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET,
  signingSecret: process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET,
  dataDir: process.env.OPENWORK_DATA_DIR,
};
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "matterhorn-crypto-app-auth-"));
  process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  process.env.MATTERHORN_AGENT_RUNTIME_SECRET = "runtime-secret-that-never-enters-app-arguments";
  process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = "capability-signing-secret-with-at-least-32-characters";
  process.env.OPENWORK_DATA_DIR = root;
});

afterAll(async () => {
  for (const [key, value] of Object.entries({
    MATTERHORN_GUARDED_RUNTIME_MODE: original.mode,
    MATTERHORN_AGENT_RUNTIME_SECRET: original.runtimeSecret,
    MATTERHORN_CAPABILITY_SIGNING_SECRET: original.signingSecret,
    OPENWORK_DATA_DIR: original.dataDir,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(root, { recursive: true, force: true });
});

async function fixture(name: string) {
  const path = join(root, `${name}.db`);
  const runtime = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
  const accepted = await runtime.acceptPrompt({
    workspaceId: "ws_sui",
    sessionId: `ses_${name}`,
    parts: [{ type: "text", text: "Read the public Sui balance" }],
    providerId: "cudos",
    modelId: "asi1-mini",
    agentId: "matterhorn-sui",
    executionMode: "work",
  });
  const reservationStore = new MatterhornGuardedRuntimeStateStore(path);
  const authorization = new MatterhornGuardedCryptoAppAuthorization({
    runtime,
    stateStore: reservationStore,
    bindings: [{
      appId: "matterhorn.sui",
      manifestRevision: "1.0.0",
      actionId: "read_balance",
      proxyToolName: "matterhorn_sui_get_balance",
    }],
  });
  return { runtime, reservationStore, authorization, runId: accepted.runId, sessionId: `ses_${name}` };
}

function request(runId: string, sessionId: string, overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "ws_sui",
    sessionId,
    runId,
    callId: "call_sui_balance",
    connectionId: "cxc_sui",
    appId: "matterhorn.sui",
    manifestRevision: "1.0.0",
    actionId: "read_balance",
    access: "read" as const,
    network: "sui:testnet",
    canonicalArgumentsHash: "a".repeat(64),
    ...overrides,
  };
}

describe("guarded crypto app authorization bridge", () => {
  test("accepts one already-consumed interactive coworker capability without issuing a second token", async () => {
    const path = join(root, "interactive-consumed.db");
    const runtime = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
    runtime.setCoworkerResolver(() => true);
    const sessionId = "ses_interactive_consumed";
    const binding = {
      id: "cw_interactive",
      workspaceId: "ws_sui",
      ownerId: "account_alpha",
      revision: 1,
      policyVersion: "coworker-policy-1",
      allowedAppIds: ["matterhorn.sui-testnet"],
      allowedActionIds: ["sui_account_read"],
      allowedNetworks: ["sui:testnet"],
      automaticAuthorities: ["read" as const],
      actionBindings: [{
        connectionId: "cxc_sui",
        appId: "matterhorn.sui-testnet",
        manifestRevision: "1.0.0",
        actionId: "sui_account_read",
        network: "sui:testnet",
        proxyToolName: "matterhorn_sui_get_balance",
        access: "read" as const,
      }],
      allowedDataLabels: ["public" as const, "untrusted_external" as const],
      allowUnverifiedProviderConsent: false,
      maxReadCallsPerRun: 1,
      maxPrepareCallsPerFamily: 0,
    };
    const accepted = await runtime.startDeterministicCoworkerRun({
      workspaceId: "ws_sui",
      sessionId,
      coworker: binding,
      requestToolProfiles: [{ "*": false, matterhorn_sui_get_balance: true }],
      maxReadCalls: 1,
    });
    const rawArgs = { address: `0x${"1".repeat(64)}`, network: "testnet" };
    runtime.stageRuntimeTool({
      runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
      workspaceId: "ws_sui",
      sessionId,
      runId: accepted.runId,
      callId: "call_interactive",
      toolName: "matterhorn_sui_get_balance",
      args: rawArgs,
    });
    const consumed = runtime.authorizeMcpTool({
      toolName: "matterhorn_sui_get_balance",
      args: { ...rawArgs, _matterhornCallId: "call_interactive" },
    });
    expect(consumed.coworker).toMatchObject({ connectionId: "cxc_sui", actionId: "sui_account_read" });
    const store = new MatterhornGuardedRuntimeStateStore(path);
    const authorization = runtime.createCryptoAppAuthorization({
      bindings: [{
        appId: "matterhorn.sui-testnet",
        manifestRevision: "1.0.0",
        actionId: "sui_account_read",
        proxyToolName: "matterhorn_sui_get_balance",
      }],
    });
    const reserved = await authorization.authorize({
      workspaceId: "ws_sui",
      sessionId,
      runId: accepted.runId,
      callId: "call_interactive",
      connectionId: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionId: "sui_account_read",
      access: "read",
      network: "sui:testnet",
      canonicalArgumentsHash: "a".repeat(64),
      consumedCapability: {
        coworkerId: "cw_interactive",
        toolName: "matterhorn_sui_get_balance",
        arguments: rawArgs,
      },
    });
    expect(reserved.reservationId).toStartWith("crypto_app_reservation_");
    store.close();
    runtime.close();
  });

  test("starts a model-free coworker watch run with one exact dynamic read binding", async () => {
    const path = join(root, "deterministic-watch.db");
    const runtime = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
    runtime.setCoworkerResolver(() => true);
    const binding = {
      id: "cw_sui_watch",
      workspaceId: "ws_sui",
      ownerId: "account_alpha",
      revision: 1,
      policyVersion: "coworker-policy-1",
      allowedAppIds: ["matterhorn.sui-testnet"],
      allowedActionIds: ["sui_account_read"],
      allowedNetworks: ["sui:testnet"],
      automaticAuthorities: ["read", "watch"] as Array<"read" | "watch">,
      actionBindings: [{
        connectionId: "cxc_sui",
        appId: "matterhorn.sui-testnet",
        manifestRevision: "1.0.0",
        actionId: "sui_account_read",
        network: "sui:testnet",
        proxyToolName: "matterhorn_sui_get_balance",
        access: "read" as const,
      }],
      allowedDataLabels: ["public", "untrusted_external"] as Array<"public" | "untrusted_external">,
      allowUnverifiedProviderConsent: false,
      maxReadCallsPerRun: 1,
      maxPrepareCallsPerFamily: 0,
    };
    const accepted = await runtime.startDeterministicCoworkerRun({
      workspaceId: "ws_sui",
      sessionId: "ses_sui_watch",
      coworker: binding,
      requestToolProfiles: [{ "*": false, matterhorn_sui_get_balance: true }],
      maxReadCalls: 1,
    });
    const authorization = runtime.createCryptoAppAuthorization({
      resolveBinding: (input) => input.appId === "matterhorn.sui-testnet"
        && input.manifestRevision === "1.0.0"
        && input.actionId === "sui_account_read"
        ? { ...input, proxyToolName: "matterhorn_sui_get_balance" }
        : null,
    });
    const reserved = await authorization.authorize({
      workspaceId: "ws_sui",
      sessionId: "ses_sui_watch",
      runId: accepted.runId,
      callId: "call_sui_watch",
      connectionId: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionId: "sui_account_read",
      access: "read",
      network: "sui:testnet",
      canonicalArgumentsHash: "a".repeat(64),
    });
    await authorization.reconcile({
      reservationId: reserved.reservationId,
      outcome: "success",
      costMicros: 0,
      durationMs: 15,
    });
    const receipt = await runtime.receipts.get("ws_sui", accepted.runId);
    expect(receipt).toMatchObject({
      provider: { id: "matterhorn-deterministic-runtime", modelId: "none", trainingUse: "none" },
      usage: { toolCallBudget: { reads: 1, preparesPerFamily: 0, submits: 0 } },
      privacy: { dataLeavesMatterhorn: false },
    });
    expect(receipt?.tools).toContainEqual(expect.objectContaining({
      name: "crypto_app:matterhorn.sui-testnet:sui_account_read",
      access: "read",
      outcome: "success",
    }));
    runtime.close();
  });

  test("consumes one exact guarded capability and records the certified app action in the receipt", async () => {
    const app = await fixture("happy");
    const reserved = await app.authorization.authorize(request(app.runId, app.sessionId));
    expect(reserved.reservationId).toStartWith("crypto_app_reservation_");
    await app.authorization.reconcile({
      reservationId: reserved.reservationId,
      outcome: "success",
      costMicros: 25,
      durationMs: 12,
      evidence: {
        delivery: "certified_cache",
        observedAt: "2026-09-01T12:00:00.000Z",
        ageMs: 750,
        freshnessMaxAgeMs: 30_000,
      },
    });
    const receipt = await app.runtime.receipts.get("ws_sui", app.runId);
    expect(receipt?.tools).toContainEqual(expect.objectContaining({
      name: "crypto_app:matterhorn.sui:read_balance",
      access: "read",
      outcome: "success",
      source: "crypto_app:matterhorn.sui",
      evidence: {
        delivery: "certified_cache",
        observedAt: "2026-09-01T12:00:00.000Z",
        ageMs: 750,
        freshnessMaxAgeMs: 30_000,
      },
    }));
    expect(receipt?.capabilities.some((decision) => decision.callId === "call_sui_balance" && decision.decision === "allowed")).toBe(true);
    await expect(app.authorization.reconcile({
      reservationId: reserved.reservationId,
      outcome: "success",
      costMicros: 25,
      durationMs: 12,
      evidence: {
        delivery: "certified_cache",
        observedAt: "2026-09-01T12:00:00.000Z",
        ageMs: 750,
        freshnessMaxAgeMs: 30_000,
      },
    })).rejects.toThrow("crypto_app_reservation_unknown_or_replayed");
    app.reservationStore.close();
    app.runtime.close();
  });

  test("rejects forged cache provenance without consuming the valid reconciliation", async () => {
    const app = await fixture("forged-evidence");
    const reserved = await app.authorization.authorize(request(app.runId, app.sessionId));
    await expect(app.authorization.reconcile({
      reservationId: reserved.reservationId,
      outcome: "success",
      costMicros: 0,
      durationMs: 3,
      evidence: {
        delivery: "certified_cache",
        observedAt: "2026-09-01T12:00:00.000Z",
        ageMs: 100,
        freshnessMaxAgeMs: 30_000,
        query: "must never enter a receipt",
      } as Parameters<typeof app.authorization.reconcile>[0]["evidence"],
    })).rejects.toThrow("crypto_app_reconciliation_invalid");

    await app.authorization.reconcile({
      reservationId: reserved.reservationId,
      outcome: "success",
      costMicros: 0,
      durationMs: 3,
      evidence: {
        delivery: "live",
        observedAt: "2026-09-01T12:00:00.000Z",
        ageMs: 100,
        freshnessMaxAgeMs: 30_000,
      },
    });
    const receipt = await app.runtime.receipts.get("ws_sui", app.runId);
    expect(JSON.stringify(receipt)).not.toContain("must never enter a receipt");
    expect(receipt?.tools).toContainEqual(expect.objectContaining({
      evidence: expect.objectContaining({ delivery: "live", ageMs: 100 }),
    }));
    app.reservationStore.close();
    app.runtime.close();
  });

  test("fails binding, access, tenant and call replay before adapter authority can be reused", async () => {
    const missing = await fixture("missing");
    await expect(missing.authorization.authorize(request(missing.runId, missing.sessionId, {
      actionId: "read_objects",
      callId: "call_missing",
    }))).rejects.toThrow("crypto_app_capability_binding_missing");
    missing.reservationStore.close();
    missing.runtime.close();

    const hash = await fixture("hash");
    await expect(hash.authorization.authorize(request(hash.runId, hash.sessionId, {
      canonicalArgumentsHash: "not-a-digest",
      callId: "call_hash",
    }))).rejects.toThrow("crypto_app_arguments_hash_invalid");
    hash.reservationStore.close();
    hash.runtime.close();

    const access = await fixture("access");
    await expect(access.authorization.authorize(request(access.runId, access.sessionId, {
      access: "prepare",
      callId: "call_access",
    }))).rejects.toThrow("crypto_app_capability_access_mismatch");
    access.reservationStore.close();
    access.runtime.close();

    const tenant = await fixture("tenant");
    await expect(tenant.authorization.authorize(request(tenant.runId, tenant.sessionId, {
      workspaceId: "ws_other",
      callId: "call_tenant",
    }))).rejects.toThrow("capability_scope_mismatch");
    tenant.reservationStore.close();
    tenant.runtime.close();

    const replay = await fixture("replay");
    await replay.authorization.authorize(request(replay.runId, replay.sessionId));
    await expect(replay.authorization.authorize(request(replay.runId, replay.sessionId))).rejects.toThrow("capability_call_reissued");
    replay.reservationStore.close();
    replay.runtime.close();
  });

  test("refuses to bridge capabilities unless guarded enforcement is active", async () => {
    const previous = process.env.MATTERHORN_GUARDED_RUNTIME_MODE;
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "off";
    const path = join(root, "off.db");
    const runtime = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
    const store = new MatterhornGuardedRuntimeStateStore(path);
    const authorization = new MatterhornGuardedCryptoAppAuthorization({
      runtime,
      stateStore: store,
      bindings: [{
        appId: "matterhorn.sui",
        manifestRevision: "1.0.0",
        actionId: "read_balance",
        proxyToolName: "matterhorn_sui_get_balance",
      }],
    });
    await expect(authorization.authorize(request("run_off", "ses_off"))).rejects.toThrow(
      "crypto_app_guarded_runtime_enforcement_required",
    );
    store.close();
    runtime.close();
    process.env.MATTERHORN_GUARDED_RUNTIME_MODE = previous;
  });

  test("restores a pending reservation and appends its receipt after a runtime restart", async () => {
    const path = join(root, "restart.db");
    const first = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
    const accepted = await first.acceptPrompt({
      workspaceId: "ws_sui",
      sessionId: "ses_restart",
      parts: [{ type: "text", text: "Read the public Sui balance" }],
      providerId: "cudos",
      modelId: "asi1-mini",
      agentId: "matterhorn-sui",
      executionMode: "work",
    });
    const firstStore = new MatterhornGuardedRuntimeStateStore(path);
    const firstAuthorization = new MatterhornGuardedCryptoAppAuthorization({
      runtime: first,
      stateStore: firstStore,
      bindings: [{
        appId: "matterhorn.sui",
        manifestRevision: "1.0.0",
        actionId: "read_balance",
        proxyToolName: "matterhorn_sui_get_balance",
      }],
    });
    const reserved = await firstAuthorization.authorize(request(accepted.runId, "ses_restart", {
      callId: "call_restart",
    }));
    firstStore.close();
    first.close();

    const second = new MatterhornGuardedAgentRuntime(new MatterhornGuardedRuntimeStateStore(path));
    const secondStore = new MatterhornGuardedRuntimeStateStore(path);
    const secondAuthorization = new MatterhornGuardedCryptoAppAuthorization({
      runtime: second,
      stateStore: secondStore,
      bindings: [{
        appId: "matterhorn.sui",
        manifestRevision: "1.0.0",
        actionId: "read_balance",
        proxyToolName: "matterhorn_sui_get_balance",
      }],
    });
    await secondAuthorization.reconcile({
      reservationId: reserved.reservationId,
      outcome: "success",
      costMicros: 0,
      durationMs: 20,
    });
    const receipt = await second.receipts.get("ws_sui", accepted.runId);
    expect(receipt?.tools).toContainEqual(expect.objectContaining({
      name: "crypto_app:matterhorn.sui:read_balance",
      outcome: "success",
    }));
    secondStore.close();
    second.close();
  });

  test("run completion invalidates any unreconciled adapter reservation", async () => {
    const app = await fixture("closed");
    const reserved = await app.authorization.authorize(request(app.runId, app.sessionId, {
      callId: "call_closed",
    }));
    await app.runtime.failRun(app.runId, "cancelled");
    await expect(app.authorization.reconcile({
      reservationId: reserved.reservationId,
      outcome: "success",
      costMicros: 0,
      durationMs: 10,
    })).rejects.toThrow("crypto_app_reservation_unknown_or_replayed");
    app.reservationStore.close();
    app.runtime.close();
  });
});
