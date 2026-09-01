import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { startServer } from "./server.js";
import { MatterhornCoworkerStore } from "./crypto-coworker-store.js";
import { MatterhornCoworkers } from "./crypto-coworkers.js";
import type { ServerConfig } from "./types.js";

type Served = { port: number; stop: (closeActiveConnections?: boolean) => void | Promise<void> };

const TOKEN = "owt_coworker_route_token";
const HOST_TOKEN = "owt_coworker_route_host_token";
const PASSWORD = "matterhorn-coworker-test-password";
const ENV_KEYS = [
  "MATTERHORN_AUTH_DB",
  "MATTERHORN_WORK_DATA_DIR",
  "MATTERHORN_WORK_MEMORY_ROOT",
  "MATTERHORN_SIGNUPS_ENABLED",
  "MATTERHORN_EMAIL_VERIFICATION_REQUIRED",
  "MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED",
  "MATTERHORN_COWORKER_MODE",
  "MATTERHORN_COWORKER_POLICY_VERSION",
  "MATTERHORN_COWORKER_DB",
  "MATTERHORN_CRYPTO_APP_GATEWAY_MODE",
] as const;
const priorEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
const roots: string[] = [];
const stops: Array<() => void | Promise<void>> = [];

function config(port: number, root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1_000 },
    corsOrigins: ["http://127.0.0.1:5173"],
    workspaces: [{
      id: "ws_coworker",
      name: "Coworker acceptance workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
    }],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
    reloadWatchers: false,
  } as ServerConfig;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

async function boot(mode: "off" | "internal") {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-coworker-routes-"));
  roots.push(root);
  process.env.MATTERHORN_WORK_DATA_DIR = join(root, "data");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(root, "memory");
  process.env.MATTERHORN_AUTH_DB = join(root, "auth.db");
  process.env.MATTERHORN_SIGNUPS_ENABLED = "true";
  process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "false";
  process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED = "false";
  process.env.MATTERHORN_COWORKER_MODE = mode;
  process.env.MATTERHORN_COWORKER_POLICY_VERSION = "coworker-policy-1";
  const coworkerDb = join(root, "coworkers.db");
  process.env.MATTERHORN_COWORKER_DB = coworkerDb;
  process.env.MATTERHORN_CRYPTO_APP_GATEWAY_MODE = "off";
  const server = await startServer(config(await freePort(), root)) as Served;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await server.stop(true);
  };
  stops.push(stop);
  return { base: `http://127.0.0.1:${server.port}`, coworkerDb, stop };
}

async function request(base: string, path: string, options: {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  cookie?: string;
  bearer?: string;
} = {}) {
  const headers = new Headers();
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.bearer) headers.set("Authorization", `Bearer ${options.bearer}`);
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { response, payload: await response.json().catch(() => null) as any };
}

function cookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";")[0]?.trim() ?? "";
  if (!value.startsWith("mh_session=")) throw new Error("missing_test_session_cookie");
  return value;
}

function coworkerInput() {
  return {
    name: "Market Analyst",
    role: "market_analyst",
    mission: "Research approved public crypto evidence and cite every conclusion.",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_account_read"],
    allowedNetworks: ["sui:testnet"],
    allowedAssets: ["SUI"],
    automaticAuthorities: ["read", "write_note"],
    limits: {
      perActionUsd: 0,
      dailyUsd: 0,
      weeklyUsd: 0,
      maxSlippageBps: 0,
      maxLeverage: 1,
      minimumReserveUsd: 0,
      maxActiveWatches: 0,
      maxReadCallsPerRun: 12,
      maxPrepareCallsPerFamily: 0,
    },
    privacy: {
      allowedDataLabels: ["public", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
    },
  };
}

function workingStateInput() {
  return {
    expectedRevision: 0,
    profileRevision: 1,
    decisions: [],
    positions: [],
    unresolvedRisks: [{
      id: "risk_refresh",
      severity: "medium",
      summary: "Refresh the approved public balance before making a decision.",
      evidenceReferenceIds: ["ev_balance"],
      openedAt: "2026-09-01T12:00:00.000Z",
    }],
    pendingActions: [],
    evidenceReferences: [{
      id: "ev_balance",
      appId: "matterhorn.sui-testnet",
      actionId: "sui_account_read",
      referenceHash: "a".repeat(64),
      freshness: "fresh",
      observedAt: "2026-09-01T12:00:00.000Z",
    }],
    approvedMemoryIds: [],
  };
}

function watchCoworkerInput() {
  const profile = coworkerInput();
  return {
    ...profile,
    name: "Risk Monitor",
    role: "risk_monitor",
    automaticAuthorities: ["read", "watch"],
    limits: { ...profile.limits, maxActiveWatches: 1 },
  };
}

function watchInput() {
  return {
    profileRevision: 1,
    name: "Sui balance change",
    appId: "matterhorn.sui-testnet",
    actionId: "sui_account_read",
    network: "sui:testnet",
    parameters: { address: "0x1234" },
    schedule: { intervalMs: 300_000, maxChecksPerDay: 288 },
    budgets: { maxReadCallsPerCheck: 1, maxModelTokensPerCheck: 0, maxCostMicrosPerCheck: 10_000 },
    conditions: [{ id: "balance_changed", metric: "totalBalance", operator: "changed", value: null }],
  };
}

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    const value = priorEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("crypto coworker HTTP boundary", () => {
  test("is authenticated and disabled without touching account state", async () => {
    const server = await boot("off");
    expect((await request(server.base, "/workspace/ws_coworker/coworkers")).response.status).toBe(401);
    const disabled = await request(server.base, "/workspace/ws_coworker/coworkers", { bearer: TOKEN });
    expect(disabled.response.status).toBe(503);
    expect(disabled.payload.code).toBe("coworker_runtime_disabled");
  });

  test("creates, isolates, revisions, pauses and deletes account-owned coworkers", async () => {
    const server = await boot("internal");
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "coworker-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "coworker-b@example.com", password: PASSWORD },
    });
    expect(signupA.response.status).toBe(200);
    expect(signupB.response.status).toBe(200);
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspacesA = await request(server.base, "/workspaces", { cookie: cookieA });
    const workspacesB = await request(server.base, "/workspaces", { cookie: cookieB });
    const workspaceA = String(workspacesA.payload.items[0].id);
    const workspaceB = String(workspacesB.payload.items[0].id);

    const templates = await request(server.base, `/workspace/${workspaceA}/coworker-templates`, { cookie: cookieA });
    expect(templates.response.status).toBe(200);
    expect(templates.payload.templates.map((item: any) => item.id)).toEqual(["market_analyst", "risk_monitor"]);
    const fromTemplate = await request(server.base, `/workspace/${workspaceA}/coworkers/from-template`, {
      cookie: cookieA,
      body: { templateId: "risk_monitor", name: "My risk monitor" },
    });
    expect(fromTemplate.response.status).toBe(201);
    expect(fromTemplate.payload).toMatchObject({
      templateId: "risk_monitor",
      coworker: { name: "My risk monitor", state: "active", revision: 1 },
    });
    expect(fromTemplate.payload.coworker.automaticAuthorities).not.toContain("prepare");

    const created = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: coworkerInput(),
    });
    expect(created.response.status).toBe(201);
    expect(created.response.headers.get("cache-control")).toBe("no-store");
    expect(created.payload.mode).toBe("internal");
    expect(created.payload.coworker).toMatchObject({
      revision: 1,
      policyVersion: "coworker-policy-1",
      state: "active",
      escalation: { walletSubmission: "connected_wallet_only" },
    });
    expect(created.payload.coworker.ownerId).toBeUndefined();
    const coworkerId = String(created.payload.coworker.id);

    const storedState = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/state`, {
      method: "PUT",
      cookie: cookieA,
      body: workingStateInput(),
    });
    expect(storedState.response.status).toBe(200);
    expect(storedState.payload.state).toMatchObject({ revision: 1, profileRevision: 1 });
    expect(storedState.payload.state.ownerId).toBeUndefined();
    const ownState = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/state`, {
      cookie: cookieA,
    });
    expect(ownState.payload.state.unresolvedRisks[0].id).toBe("risk_refresh");
    const isolatedState = await request(server.base, `/workspace/${workspaceB}/coworkers/${coworkerId}/state`, {
      cookie: cookieB,
    });
    expect(isolatedState.response.status).toBe(404);
    const secretState = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/state`, {
      method: "PUT",
      cookie: cookieA,
      body: {
        ...workingStateInput(),
        expectedRevision: 1,
        unresolvedRisks: [{
          ...workingStateInput().unresolvedRisks[0],
          summary: "Remember this private key for later.",
        }],
      },
    });
    expect(secretState.response.status).toBe(400);
    expect(secretState.payload.code).toBe("coworker_working_state_invalid");

    const blockedExecution = await request(
      server.base,
      `/workspace/${workspaceA}/sessions/ses_coworker/messages/preflight`,
      {
        cookie: cookieA,
        body: {
          coworkerId,
          parts: [{ type: "text", text: "Read approved Sui state" }],
          executionMode: "work",
        },
      },
    );
    expect(blockedExecution.response.status).toBe(503);
    expect(blockedExecution.payload.code).toBe("coworker_execution_not_ready");

    const ownList = await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieA });
    const otherList = await request(server.base, `/workspace/${workspaceB}/coworkers`, { cookie: cookieB });
    expect(ownList.payload.coworkers).toHaveLength(2);
    expect(ownList.payload.coworkers.map((item: any) => item.id)).toEqual(expect.arrayContaining([
      fromTemplate.payload.coworker.id,
      coworkerId,
    ]));
    expect(otherList.payload.coworkers).toEqual([]);
    expect((await request(server.base, `/workspace/${workspaceA}/coworkers`, { cookie: cookieB })).response.status).toBe(404);
    expect((await request(server.base, `/workspace/${workspaceB}/coworkers/${coworkerId}`, { cookie: cookieB })).response.status).toBe(404);

    const injected = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: { ...coworkerInput(), ownerId: signupB.payload.user.id },
    });
    expect(injected.response.status).toBe(400);
    expect(injected.payload.code).toBe("coworker_input_invalid");

    const updated = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, {
      method: "PATCH",
      cookie: cookieA,
      body: { expectedRevision: 1, mission: "Compare Sui evidence and retain cited decisions." },
    });
    expect(updated.response.status).toBe(200);
    expect(updated.payload.coworker.revision).toBe(2);
    const reboundState = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/state`, {
      cookie: cookieA,
    });
    expect(reboundState.payload.state).toMatchObject({ revision: 2, profileRevision: 2, pendingActions: [] });
    const stale = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, {
      method: "PATCH",
      cookie: cookieA,
      body: { expectedRevision: 1, name: "Stale update" },
    });
    expect(stale.response.status).toBe(409);
    expect(stale.payload.code).toBe("coworker_revision_conflict");

    const paused = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, {
      method: "PATCH",
      cookie: cookieA,
      body: { expectedRevision: 2, state: "paused" },
    });
    expect(paused.payload.coworker).toMatchObject({ state: "paused", revision: 3 });
    const deleted = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, {
      method: "DELETE",
      cookie: cookieA,
      body: { expectedRevision: 3 },
    });
    expect(deleted.payload).toEqual({ deleted: true });
    expect((await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}`, { cookie: cookieA })).response.status).toBe(404);
  });

  test("exposes bounded watches and a tenant-scoped alert inbox without an account alert-injection route", async () => {
    const server = await boot("internal");
    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "watch-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "watch-b@example.com", password: PASSWORD },
    });
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    const workspaceA = String((await request(server.base, "/workspaces", { cookie: cookieA })).payload.items[0].id);
    const workspaceB = String((await request(server.base, "/workspaces", { cookie: cookieB })).payload.items[0].id);
    const created = await request(server.base, `/workspace/${workspaceA}/coworkers`, {
      cookie: cookieA,
      body: watchCoworkerInput(),
    });
    expect(created.response.status).toBe(201);
    const coworkerId = String(created.payload.coworker.id);

    const createdWatch = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches`, {
      cookie: cookieA,
      body: watchInput(),
    });
    expect(createdWatch.response.status).toBe(201);
    expect(createdWatch.payload.watch).toMatchObject({ state: "active", profileRevision: 1 });
    expect(createdWatch.payload.watch.ownerId).toBeUndefined();
    const watchId = String(createdWatch.payload.watch.id);
    const watchList = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches`, { cookie: cookieA });
    expect(watchList.payload.watches).toHaveLength(1);
    expect((await request(server.base, `/workspace/${workspaceB}/coworkers/${coworkerId}/watches`, { cookie: cookieB })).response.status)
      .toBe(404);
    const overLimit = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches`, {
      cookie: cookieA,
      body: { ...watchInput(), name: "Second watch" },
    });
    expect(overLimit.response.status).toBe(409);
    expect(overLimit.payload.code).toBe("coworker_watch_limit");
    const secretWatch = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches`, {
      cookie: cookieA,
      body: { ...watchInput(), parameters: { privateKey: "secret material" } },
    });
    expect(secretWatch.response.status).toBe(400);
    expect(secretWatch.payload.code).toBe("coworker_watch_invalid");

    const directStore = new MatterhornCoworkerStore(server.coworkerDb);
    try {
      const directCoworkers = new MatterhornCoworkers({
        store: directStore,
        policyVersion: "coworker-policy-1",
        now: () => new Date("2026-09-01T12:05:00.000Z"),
        inboxItemId: () => "cinbox_route_alert",
      });
      directCoworkers.createInboxItem(workspaceA, String(signupA.payload.user.id), coworkerId, {
        watchId,
        kind: "alert",
        severity: "medium",
        title: "Sui balance changed",
        summary: "The observed Sui balance changed since the previous approved check.",
        reasonCodes: ["balance_changed"],
        source: {
          appId: "matterhorn.sui-testnet",
          actionId: "sui_account_read",
          evidenceReferenceHash: "c".repeat(64),
          freshness: "fresh",
          observedAt: "2026-09-01T12:05:00.000Z",
        },
        budgetImpact: { readCallsConsumed: 1, modelTokensConsumed: 0, costMicros: 1_000 },
        nextSafeAction: { kind: "review", label: "Review the fresh balance evidence" },
      });
    } finally {
      directStore.close();
    }
    const inbox = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/inbox`, { cookie: cookieA });
    expect(inbox.response.status).toBe(200);
    expect(inbox.payload.items).toHaveLength(1);
    expect(inbox.payload.items[0]).toMatchObject({ id: "cinbox_route_alert", state: "unread", watchId });
    expect(inbox.payload.items[0].ownerId).toBeUndefined();
    expect((await request(server.base, `/workspace/${workspaceB}/coworkers/${coworkerId}/inbox`, { cookie: cookieB })).response.status)
      .toBe(404);
    expect((await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/inbox`, {
      method: "POST",
      cookie: cookieA,
      body: { title: "Injected alert" },
    })).response.status).toBe(404);

    const read = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/inbox/cinbox_route_alert`, {
      method: "PATCH",
      cookie: cookieA,
      body: { state: "read", expectedState: "unread" },
    });
    expect(read.response.status).toBe(200);
    expect(read.payload.item.state).toBe("read");
    const staleInbox = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/inbox/cinbox_route_alert`, {
      method: "PATCH",
      cookie: cookieA,
      body: { state: "dismissed", expectedState: "unread" },
    });
    expect(staleInbox.response.status).toBe(409);
    expect(staleInbox.payload.code).toBe("coworker_inbox_state_conflict");

    const paused = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches/${watchId}`, {
      method: "PATCH",
      cookie: cookieA,
      body: { state: "paused", expectedRevision: 1 },
    });
    expect(paused.payload.watch).toMatchObject({ state: "paused", pauseReason: "user_paused", revision: 2 });
    const deletedWatch = await request(server.base, `/workspace/${workspaceA}/coworkers/${coworkerId}/watches/${watchId}`, {
      method: "DELETE",
      cookie: cookieA,
      body: { expectedRevision: 2 },
    });
    expect(deletedWatch.payload).toEqual({ deleted: true });
  });

  test("purges durable coworkers before completing account deletion", async () => {
    const server = await boot("internal");
    const email = "coworker-delete@example.com";
    const signup = await request(server.base, "/api/auth/sign-up/email", {
      body: { email, password: PASSWORD },
    });
    expect(signup.response.status).toBe(200);
    const sessionCookie = cookie(signup.response);
    const workspaces = await request(server.base, "/workspaces", { cookie: sessionCookie });
    const workspaceId = String(workspaces.payload.items[0].id);
    expect((await request(server.base, `/workspace/${workspaceId}/coworkers`, {
      cookie: sessionCookie,
      body: coworkerInput(),
    })).response.status).toBe(201);

    const deleted = await request(server.base, "/api/auth/account", {
      method: "DELETE",
      cookie: sessionCookie,
      body: { confirmationEmail: email, password: PASSWORD },
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.status).toBe("deleted");

    const store = new MatterhornCoworkerStore(server.coworkerDb);
    try {
      expect(store.purgeWorkspace(workspaceId)).toBe(0);
    } finally {
      store.close();
    }
  });
});
