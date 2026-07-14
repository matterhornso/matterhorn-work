import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MATTERHORN_WALLET_SAFETY_POLICY_VERSION } from "@matterhorn-work/types/wallet-safety-policy";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_wallet_safety_policy_token";
const HOST_TOKEN = "owt_wallet_safety_policy_host_token";
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  dataDir: process.env.OPENWORK_DATA_DIR,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
  memoryScope: process.env.MATTERHORN_WORK_MEMORY_SCOPE,
  opencodeDb: process.env.OPENCODE_DB,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function restoreEnv() {
  const entries: Array<[keyof typeof priorEnv, string]> = [
    ["envStore", "OPENWORK_ENV_STORE"],
    ["tokenStore", "OPENWORK_TOKEN_STORE"],
    ["dataDir", "OPENWORK_DATA_DIR"],
    ["memoryRoot", "MATTERHORN_WORK_MEMORY_ROOT"],
    ["memoryScope", "MATTERHORN_WORK_MEMORY_SCOPE"],
    ["opencodeDb", "OPENCODE_DB"],
  ];
  for (const [key, envName] of entries) {
    const value = priorEnv[key];
    if (value === undefined) delete process.env[envName];
    else process.env[envName] = value;
  }
}

function baseConfig(port: number, root: string, readOnly = false): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [{
      id: "ws_wallet_policy",
      name: "Wallet safety policy workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
    }],
    authorizedRoots: [root],
    readOnly,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  } as ServerConfig;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function boot(options: { readOnly?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-wallet-policy-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
  delete process.env.MATTERHORN_WORK_MEMORY_SCOPE;
  process.env.OPENCODE_DB = join(dir, "opencode.db");
  const server = await startServer(baseConfig(await getFreePort(), dir, options.readOnly ?? false)) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
}

async function jsonFetch(
  base: string,
  path: string,
  init: RequestInit = {},
  token = TOKEN,
): Promise<{ response: Response; payload: any }> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function hostFetch(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-Matterhorn-Host-Token": HOST_TOKEN,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  restoreEnv();
});

describe("Matterhorn wallet safety policy routes", () => {
  test("GET returns a workspace-scoped default policy and storage map", async () => {
    const { base, dir } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_wallet_policy/wallet/safety-policy");

    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe(MATTERHORN_WALLET_SAFETY_POLICY_VERSION);
    expect(result.payload.workspace).toMatchObject({
      id: "ws_wallet_policy",
      name: "Wallet safety policy workspace",
      type: "local",
    });
    expect(result.payload.storage).toMatchObject({
      path: join(dir, ".matterhorn-work", "wallet", "safety-policy.json"),
      exists: false,
    });
    expect(result.payload.policy).toMatchObject({
      version: MATTERHORN_WALLET_SAFETY_POLICY_VERSION,
      maxPerTransactionUSD: 50,
      maxDailySpendUSD: 100,
      mainnetEnabled: false,
      maxSlippageBps: 100,
      preferredNetwork: 84532,
    });
    expect(result.payload.controls).toMatchObject({
      writable: true,
      ledgerRoute: "/workspace/ws_wallet_policy/data-ledger?kind=wallet",
      settingsRoute: "/workspace/ws_wallet_policy/settings/wallet",
    });
  });

  test("PATCH persists collaborator-owned policy updates and exports an audit ledger event", async () => {
    const { base, dir } = await boot();

    const update = await jsonFetch(base, "/workspace/ws_wallet_policy/wallet/safety-policy", {
      method: "PATCH",
      body: JSON.stringify({
        maxPerTransactionUSD: 125,
        maxDailySpendUSD: 500,
        mainnetEnabled: true,
        maxSlippageBps: 75,
        preferredNetwork: 8453,
      }),
    });

    expect(update.response.status).toBe(200);
    expect(update.payload.success).toBe(true);
    expect(update.payload.storage.exists).toBe(true);
    expect(update.payload.policy).toMatchObject({
      maxPerTransactionUSD: 125,
      maxDailySpendUSD: 500,
      mainnetEnabled: true,
      maxSlippageBps: 75,
      preferredNetwork: 8453,
    });

    const policyPath = join(dir, ".matterhorn-work", "wallet", "safety-policy.json");
    expect(existsSync(policyPath)).toBe(true);
    const persisted = JSON.parse(readFileSync(policyPath, "utf8"));
    expect(persisted).toMatchObject(update.payload.policy);

    const after = await jsonFetch(base, "/workspace/ws_wallet_policy/wallet/safety-policy");
    expect(after.response.status).toBe(200);
    expect(after.payload.policy).toMatchObject(update.payload.policy);

    const ledger = await jsonFetch(base, "/workspace/ws_wallet_policy/data-ledger?kind=wallet&limit=10");
    expect(ledger.response.status).toBe(200);
    expect(ledger.payload.items).toContainEqual(expect.objectContaining({
      kind: "wallet",
      source: "audit",
      title: "Wallet safety policy updated",
      eventType: "workspace.wallet.safety_policy.update",
      href: "/workspace/ws_wallet_policy/settings/wallet",
      metadata: expect.objectContaining({
        maxPerTransactionUSD: 125,
        maxDailySpendUSD: 500,
        mainnetEnabled: true,
        maxSlippageBps: 75,
        preferredNetwork: 8453,
      }),
    }));
  });

  test("PATCH rejects viewer tokens and secret-shaped payloads", async () => {
    const { base } = await boot();

    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Wallet policy viewer" }),
    });
    expect(viewer.response.status).toBe(201);

    const viewerWrite = await jsonFetch(base, "/workspace/ws_wallet_policy/wallet/safety-policy", {
      method: "PATCH",
      body: JSON.stringify({ maxPerTransactionUSD: 250 }),
    }, viewer.payload.token);
    expect(viewerWrite.response.status).toBe(403);

    const secret = await jsonFetch(base, "/workspace/ws_wallet_policy/wallet/safety-policy", {
      method: "PATCH",
      body: JSON.stringify({
        maxPerTransactionUSD: 250,
        privateKey: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    });
    expect(secret.response.status).toBe(400);
    expect(secret.payload.code).toBe("wallet_safety_policy_secret_rejected");
  });

  test("PATCH rejects read-only servers while preserving read access", async () => {
    const readOnly = await boot({ readOnly: true });
    const blocked = await jsonFetch(readOnly.base, "/workspace/ws_wallet_policy/wallet/safety-policy", {
      method: "PATCH",
      body: JSON.stringify({ maxPerTransactionUSD: 250 }),
    });
    expect(blocked.response.status).toBe(403);

    const readOnlyGet = await jsonFetch(readOnly.base, "/workspace/ws_wallet_policy/wallet/safety-policy");
    expect(readOnlyGet.response.status).toBe(200);
    expect(readOnlyGet.payload.controls.writable).toBe(false);
  });
});
