import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { MatterhornDurableStateAuthority } from "./durable-state-authority.js";
import { MatterhornGuardedAgentRuntime } from "./guarded-agent-runtime.js";
import { MatterhornGuardedRuntimeStateStore } from "./guarded-runtime-state-store.js";

const original = {
  mode: process.env.MATTERHORN_GUARDED_RUNTIME_MODE,
  runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET,
  signingSecret: process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET,
  dataDir: process.env.OPENWORK_DATA_DIR,
};
const PROJECTION_HASH = "a".repeat(64);
const OBSERVATION_HASH = "b".repeat(64);
const SIGNING_SECRET = "capability-signing-secret-with-at-least-32-characters";
let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "matterhorn-crypto-app-auth-"));
  process.env.MATTERHORN_GUARDED_RUNTIME_MODE = "enforce";
  process.env.MATTERHORN_AGENT_RUNTIME_SECRET = "runtime-secret-that-never-enters-app-arguments";
  process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = SIGNING_SECRET;
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
  const authorization = runtime.createCryptoAppAuthorization({
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

async function consumedInteractiveFixture(name: string, callId: string) {
  const stateStore = new MatterhornGuardedRuntimeStateStore(join(root, `${name}.db`));
  const runtime = new MatterhornGuardedAgentRuntime(stateStore);
  runtime.setCoworkerResolver(() => true);
  const workspaceId = "ws_sui";
  const sessionId = `ses_${name}`;
  const coworkerId = `cw_${name}`;
  const connectionId = "cxc_sui";
  const appId = "matterhorn.sui-testnet";
  const actionId = "sui_account_read";
  const toolName = "matterhorn_sui_get_balance";
  const binding = {
    id: coworkerId,
    workspaceId,
    ownerId: "account_alpha",
    revision: 1,
    policyVersion: "coworker-policy-1",
    allowedAppIds: [appId],
    allowedActionIds: [actionId],
    allowedNetworks: ["sui:testnet"],
    automaticAuthorities: ["read" as const],
    actionBindings: [{
      connectionId,
      appId,
      manifestRevision: "1.0.0",
      actionId,
      network: "sui:testnet",
      proxyToolName: toolName,
      access: "read" as const,
    }],
    allowedDataLabels: ["public" as const, "untrusted_external" as const],
    allowUnverifiedProviderConsent: false,
    maxReadCallsPerRun: 1,
    maxPrepareCallsPerFamily: 0,
  };
  const accepted = await runtime.startDeterministicCoworkerRun({
    workspaceId,
    sessionId,
    coworker: binding,
    requestToolProfiles: [{ "*": false, [toolName]: true }],
    maxReadCalls: 1,
  });
  const rawArgs = { address: `0x${"1".repeat(64)}`, network: "testnet" };
  runtime.stageRuntimeTool({
    runtimeSecret: process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
    workspaceId,
    sessionId,
    runId: accepted.runId,
    callId,
    toolName,
    args: rawArgs,
  });
  const consumed = runtime.authorizeMcpTool({
    toolName,
    args: { ...rawArgs, _matterhornCallId: callId },
  });
  const authorization = runtime.createCryptoAppAuthorization({
    bindings: [{ appId, manifestRevision: "1.0.0", actionId, proxyToolName: toolName }],
  });
  return {
    runtime,
    stateStore,
    authorization,
    consumed,
    input: {
      workspaceId,
      sessionId,
      runId: accepted.runId,
      callId,
      connectionId,
      appId,
      manifestRevision: "1.0.0",
      actionId,
      access: "read" as const,
      network: "sui:testnet",
      canonicalArgumentsHash: "a".repeat(64),
      consumedCapability: { coworkerId, toolName, arguments: rawArgs },
    },
  };
}

function rewriteReservation(
  store: MatterhornGuardedRuntimeStateStore,
  reservationId: string,
  mutate: (value: Record<string, unknown>) => Record<string, unknown>,
  metadata: { workspaceId?: string; sessionId?: string; expiresAtMs?: number } = {},
): void {
  const record = store.getRecord<unknown>("crypto_app_reservation", reservationId);
  if (!record) throw new Error("test_reservation_missing");
  const authority = new MatterhornDurableStateAuthority(SIGNING_SECRET);
  try {
    const value = authority.open<Record<string, unknown>>(
      record,
      "crypto_app_persisted_reservation_invalid",
    );
    if (!value) throw new Error("test_reservation_missing");
    const workspaceId = metadata.workspaceId ?? record.workspaceId;
    const sessionId = metadata.sessionId ?? record.sessionId;
    const expiresAtMs = metadata.expiresAtMs ?? record.expiresAtMs;
    store.put({
      kind: "crypto_app_reservation",
      key: reservationId,
      workspaceId,
      sessionId,
      value: authority.seal({
        kind: "crypto_app_reservation",
        key: reservationId,
        workspaceId,
        sessionId,
        expiresAtMs,
        updatedAtMs: record.updatedAtMs,
        value: mutate(value),
      }),
      expiresAtMs,
      nowMs: record.updatedAtMs,
    });
  } finally {
    authority.close();
  }
}

function readReservation(
  store: MatterhornGuardedRuntimeStateStore,
  reservationId: string,
): Record<string, unknown> {
  const record = store.getRecord<unknown>("crypto_app_reservation", reservationId);
  if (!record) throw new Error("test_reservation_missing");
  const authority = new MatterhornDurableStateAuthority(SIGNING_SECRET);
  try {
    const value = authority.open<Record<string, unknown>>(
      record,
      "crypto_app_persisted_reservation_invalid",
    );
    if (!value) throw new Error("test_reservation_missing");
    return value;
  } finally {
    authority.close();
  }
}

describe("guarded crypto app authorization bridge", () => {
  test("accepts one already-consumed interactive coworker capability without issuing a second token", async () => {
    const app = await consumedInteractiveFixture("interactive_consumed", "call_interactive");
    expect(app.consumed.coworker).toMatchObject({
      connectionId: "cxc_sui",
      actionId: "sui_account_read",
    });
    const reserved = await app.authorization.authorize(app.input);
    expect(reserved.reservationId).toStartWith("crypto_app_reservation_");
    const dispatchRecord = app.stateStore.getRecord<unknown>(
      "crypto_app_consumed_dispatch",
      "call_interactive",
    );
    if (!dispatchRecord) throw new Error("test_dispatch_record_missing");
    const authority = new MatterhornDurableStateAuthority(SIGNING_SECRET);
    const dispatch = authority.open<Record<string, unknown>>(
      dispatchRecord,
      "crypto_app_persisted_dispatch_invalid",
    );
    expect(dispatch).toMatchObject({
      version: "matterhorn.crypto-app-consumed-dispatch.v1",
      workspaceId: "ws_sui",
      sessionId: app.input.sessionId,
      runId: app.input.runId,
      callId: "call_interactive",
      appId: "matterhorn.sui-testnet",
      actionId: "sui_account_read",
      requestAccess: "read",
      access: "read",
    });
    await expect(app.authorization.authorize(app.input)).rejects.toThrow(
      "crypto_app_capability_already_dispatched",
    );
    app.stateStore.put({
      kind: "crypto_app_consumed_dispatch",
      key: "call_interactive",
      workspaceId: dispatchRecord.workspaceId,
      sessionId: dispatchRecord.sessionId,
      value: authority.seal({
        kind: "crypto_app_consumed_dispatch",
        key: "call_interactive",
        workspaceId: dispatchRecord.workspaceId,
        sessionId: dispatchRecord.sessionId,
        expiresAtMs: dispatchRecord.expiresAtMs,
        updatedAtMs: dispatchRecord.updatedAtMs,
        value: { ...dispatch, submitAuthority: true },
      }),
      expiresAtMs: dispatchRecord.expiresAtMs,
      nowMs: dispatchRecord.updatedAtMs,
    });
    await expect(app.authorization.authorize(app.input)).rejects.toThrow(
      "crypto_app_persisted_dispatch_invalid",
    );
    app.stateStore.put({
      kind: "crypto_app_consumed_dispatch",
      key: "call_interactive",
      workspaceId: dispatchRecord.workspaceId,
      sessionId: dispatchRecord.sessionId,
      value: dispatch,
      expiresAtMs: dispatchRecord.expiresAtMs,
      nowMs: dispatchRecord.updatedAtMs,
    });
    await expect(app.authorization.authorize(app.input)).rejects.toThrow(
      "crypto_app_persisted_dispatch_invalid",
    );
    const wrongAuthority = new MatterhornDurableStateAuthority(
      "wrong-crypto-app-dispatch-authority-secret-at-least-32-bytes",
    );
    app.stateStore.put({
      kind: "crypto_app_consumed_dispatch",
      key: "call_interactive",
      workspaceId: dispatchRecord.workspaceId,
      sessionId: dispatchRecord.sessionId,
      value: wrongAuthority.seal({
        kind: "crypto_app_consumed_dispatch",
        key: "call_interactive",
        workspaceId: dispatchRecord.workspaceId,
        sessionId: dispatchRecord.sessionId,
        expiresAtMs: dispatchRecord.expiresAtMs,
        updatedAtMs: dispatchRecord.updatedAtMs,
        value: dispatch,
      }),
      expiresAtMs: dispatchRecord.expiresAtMs,
      nowMs: dispatchRecord.updatedAtMs,
    });
    await expect(app.authorization.authorize(app.input)).rejects.toThrow(
      "crypto_app_persisted_dispatch_invalid",
    );
    wrongAuthority.close();
    authority.close();
    app.runtime.close();
  });

  test("atomically rolls back a consumed dispatch marker when reservation persistence fails", async () => {
    const app = await consumedInteractiveFixture("dispatch_rollback", "call_dispatch_rollback");
    const originalPutIfAbsent = app.stateStore.putIfAbsent.bind(app.stateStore);
    let failReservation = true;
    app.stateStore.putIfAbsent = ((input: Parameters<typeof app.stateStore.putIfAbsent>[0]) => {
      if (input.kind === "crypto_app_reservation" && failReservation) {
        failReservation = false;
        return false;
      }
      return originalPutIfAbsent(input);
    }) as typeof app.stateStore.putIfAbsent;
    await expect(app.authorization.authorize(app.input)).rejects.toThrow(
      "crypto_app_reservation_conflict",
    );
    expect(app.stateStore.getRecord<unknown>(
      "crypto_app_consumed_dispatch",
      app.input.callId,
    )).toBeNull();
    const reserved = await app.authorization.authorize(app.input);
    expect(reserved.reservationId).toStartWith("crypto_app_reservation_");
    expect(app.stateStore.getRecord<unknown>(
      "crypto_app_consumed_dispatch",
      app.input.callId,
    )).not.toBeNull();
    app.runtime.close();
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
        projectionHash: PROJECTION_HASH,
        observationHash: OBSERVATION_HASH,
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
        projectionHash: PROJECTION_HASH,
        observationHash: OBSERVATION_HASH,
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
        projectionHash: PROJECTION_HASH,
        observationHash: OBSERVATION_HASH,
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
        projectionHash: PROJECTION_HASH,
        observationHash: OBSERVATION_HASH,
        query: "must never enter a receipt",
      } as unknown as Parameters<typeof app.authorization.reconcile>[0]["evidence"],
    })).rejects.toThrow("crypto_app_reconciliation_invalid");

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
        projectionHash: "not-a-proof",
        observationHash: OBSERVATION_HASH,
      },
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
        projectionHash: PROJECTION_HASH,
        observationHash: OBSERVATION_HASH,
      },
    });
    const receipt = await app.runtime.receipts.get("ws_sui", app.runId);
    expect(JSON.stringify(receipt)).not.toContain("must never enter a receipt");
    expect(receipt?.tools).toContainEqual(expect.objectContaining({
      evidence: expect.objectContaining({
        delivery: "live",
        ageMs: 100,
        projectionHash: PROJECTION_HASH,
        observationHash: OBSERVATION_HASH,
      }),
    }));
    app.reservationStore.close();
    app.runtime.close();
  });

  test("destroys malformed, cross-tenant, extended, or mutated durable reservations before receipt admission", async () => {
    const cases: Array<{
      name: string;
      expected: string;
      mutate: (value: Record<string, unknown>) => Record<string, unknown>;
      metadata?: (value: Record<string, unknown>) => {
        workspaceId?: string;
        sessionId?: string;
        expiresAtMs?: number;
      };
    }> = [
      {
        name: "unknown-field",
        expected: "crypto_app_persisted_reservation_invalid",
        mutate: (value) => ({ ...value, submitAuthority: true }),
      },
      {
        name: "tenant-row",
        expected: "crypto_app_persisted_reservation_invalid",
        mutate: (value) => value,
        metadata: () => ({ workspaceId: "ws_other" }),
      },
      {
        name: "arguments-hash",
        expected: "crypto_app_reservation_capability_mismatch",
        mutate: (value) => ({ ...value, canonicalArgumentsHash: "f".repeat(64) }),
      },
      {
        name: "app-substitution",
        expected: "crypto_app_reservation_capability_mismatch",
        mutate: (value) => ({ ...value, appId: "matterhorn.attacker" }),
      },
      {
        name: "expiry-extension",
        expected: "crypto_app_reservation_capability_mismatch",
        mutate: (value) => {
          const capabilityExpiresAtMs = Date.parse(String(value.capabilityExpiresAt)) + 60_000;
          const reconciliationExpiresAtMs = Date.parse(String(value.reconciliationExpiresAt)) + 60_000;
          return {
            ...value,
            capabilityExpiresAt: new Date(capabilityExpiresAtMs).toISOString(),
            reconciliationExpiresAt: new Date(reconciliationExpiresAtMs).toISOString(),
          };
        },
        metadata: (value) => ({
          expiresAtMs: Date.parse(String(value.reconciliationExpiresAt)) + 60_000,
        }),
      },
    ];

    for (const item of cases) {
      const app = await fixture(`reservation-${item.name}`);
      const reserved = await app.authorization.authorize(request(app.runId, app.sessionId, {
        callId: `call_${item.name}`,
      }));
      const before = readReservation(app.reservationStore, reserved.reservationId);
      rewriteReservation(
        app.reservationStore,
        reserved.reservationId,
        item.mutate,
        item.metadata?.(before),
      );
      await expect(app.authorization.reconcile({
        reservationId: reserved.reservationId,
        outcome: "success",
        costMicros: 0,
        durationMs: 5,
      })).rejects.toThrow(item.expected);
      await expect(app.authorization.reconcile({
        reservationId: reserved.reservationId,
        outcome: "success",
        costMicros: 0,
        durationMs: 5,
      })).rejects.toThrow("crypto_app_reservation_unknown_or_replayed");
      const receipt = await app.runtime.receipts.get("ws_sui", app.runId);
      expect(receipt?.tools.some((tool) => tool.name.startsWith("crypto_app:"))).toBe(false);
      app.reservationStore.close();
      app.runtime.close();
    }
  });

  test("rejects unsealed and wrong-key reservation rows before receipt admission", async () => {
    for (const mode of ["unsealed", "wrong-key"] as const) {
      const app = await fixture(`reservation-${mode}`);
      const reserved = await app.authorization.authorize(request(app.runId, app.sessionId, {
        callId: `call_reservation_${mode}`,
      }));
      const stored = app.reservationStore.getRecord<unknown>(
        "crypto_app_reservation",
        reserved.reservationId,
      );
      if (!stored) throw new Error("test_reservation_missing");
      const authority = new MatterhornDurableStateAuthority(SIGNING_SECRET);
      const reservation = authority.open<Record<string, unknown>>(
        stored,
        "crypto_app_persisted_reservation_invalid",
      );
      if (!reservation) throw new Error("test_reservation_missing");
      const wrongAuthority = new MatterhornDurableStateAuthority(
        "wrong-crypto-app-reservation-authority-secret-at-least-32-bytes",
      );
      app.reservationStore.put({
        kind: "crypto_app_reservation",
        key: reserved.reservationId,
        workspaceId: stored.workspaceId,
        sessionId: stored.sessionId,
        value: mode === "unsealed"
          ? reservation
          : wrongAuthority.seal({
            kind: "crypto_app_reservation",
            key: reserved.reservationId,
            workspaceId: stored.workspaceId,
            sessionId: stored.sessionId,
            expiresAtMs: stored.expiresAtMs,
            updatedAtMs: stored.updatedAtMs,
            value: reservation,
          }),
        expiresAtMs: stored.expiresAtMs,
        nowMs: stored.updatedAtMs,
      });
      await expect(app.authorization.reconcile({
        reservationId: reserved.reservationId,
        outcome: "success",
        costMicros: 0,
        durationMs: 5,
      })).rejects.toThrow("crypto_app_persisted_reservation_invalid");
      await expect(app.authorization.reconcile({
        reservationId: reserved.reservationId,
        outcome: "success",
        costMicros: 0,
        durationMs: 5,
      })).rejects.toThrow("crypto_app_reservation_unknown_or_replayed");
      const receipt = await app.runtime.receipts.get("ws_sui", app.runId);
      expect(receipt?.tools.some((tool) => tool.name.startsWith("crypto_app:"))).toBe(false);
      wrongAuthority.close();
      authority.close();
      app.reservationStore.close();
      app.runtime.close();
    }
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
    const authorization = runtime.createCryptoAppAuthorization({
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

  test("refuses to construct Crypto App authority without the server integrity key", () => {
    const previous = process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
    delete process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
    const runtime = new MatterhornGuardedAgentRuntime(
      new MatterhornGuardedRuntimeStateStore(join(root, "missing-authority.db")),
    );
    try {
      let failure: unknown;
      try {
        runtime.createCryptoAppAuthorization({
          bindings: [{
            appId: "matterhorn.sui",
            manifestRevision: "1.0.0",
            actionId: "read_balance",
            proxyToolName: "matterhorn_sui_get_balance",
          }],
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({
        status: 503,
        code: "durable_state_integrity_unavailable",
      });
    } finally {
      runtime.close();
      if (previous === undefined) delete process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET;
      else process.env.MATTERHORN_CAPABILITY_SIGNING_SECRET = previous;
    }
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
    const firstAuthorization = first.createCryptoAppAuthorization({
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
    const secondAuthorization = second.createCryptoAppAuthorization({
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
