import { expect, test } from "bun:test";
import { createCipheriv } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MatterhornAuthStore } from "./auth-store.js";
import { startServer } from "./server.js";
import { TokenService } from "./tokens.js";
import type { ServerConfig } from "./types.js";

test("real Google routes deny shared-account identities and readonly refresh before provider or vault effects", async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-google-access-http-"));
  const overrides: Record<string, string | undefined> = {
    MATTERHORN_WORK_DATA_DIR: join(root, "data"),
    OPENWORK_DATA_DIR: join(root, "data"),
    MATTERHORN_WORK_MEMORY_ROOT: join(root, "memory"),
    MATTERHORN_AUTH_DB: join(root, "auth.db"),
    MATTERHORN_WORK_TOKEN_STORE: join(root, "tokens.json"),
    OPENWORK_TOKEN_STORE: join(root, "tokens.json"),
    MATTERHORN_ENCRYPTION_KEY: undefined,
    OPENWORK_ENCRYPTION_KEY: undefined,
    MATTERHORN_GOOGLE_WORKSPACE_ALLOW_PLAINTEXT_VAULT: undefined,
    OPENWORK_GOOGLE_WORKSPACE_ALLOW_PLAINTEXT_VAULT: undefined,
    MATTERHORN_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID: "synthetic-client",
    MATTERHORN_GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET: "synthetic-secret",
    MATTERHORN_GOOGLE_WORKSPACE_TOKEN_BROKER_URL: undefined,
  };
  const prior = new Map(Object.keys(overrides).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const config: ServerConfig = {
    host: "127.0.0.1", port: 0,
    token: "synthetic-collaborator", hostToken: "synthetic-host",
    configPath: join(root, "server.json"),
    approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: [],
    workspaces: [{ id: "synthetic-workspace", name: "Test", path: root, preset: "starter", workspaceType: "local" }],
    authorizedRoots: [root], readOnly: false, startedAt: Date.now(),
    tokenSource: "generated", hostTokenSource: "generated", logFormat: "json", logRequests: false,
    reloadWatchers: false,
  };
  const nativeFetch = globalThis.fetch;
  let base = "";
  let externalCalls = 0;
  const guardedFetch: typeof fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (base && new URL(url).origin === base) return nativeFetch(input, init);
    externalCalls += 1;
    throw new Error("Unexpected external request in isolated Google authorization test");
  }, { preconnect: nativeFetch.preconnect });
  globalThis.fetch = guardedFetch;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    const key = Buffer.alloc(32, 9);
    const iv = Buffer.alloc(12, 5);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify({ token: { accessToken: "synthetic-fixture-token", expiresAt: 1 } }), "utf8"), cipher.final()]);
    const vaultDir = join(root, "extensions", "google-workspace");
    await mkdir(vaultDir, { recursive: true });
    const vaultPath = join(vaultDir, "oauth.vault");
    const vault = JSON.stringify({ iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") });
    await writeFile(vaultPath, vault);
    await writeFile(join(root, "vault-key"), key.toString("base64"));
    const tokens = new TokenService(config);
    const viewer = await tokens.create("viewer");
    const owner = await tokens.create("owner");
    const accounts = new MatterhornAuthStore(join(root, "auth.db"));
    const session = accounts.createAccount({ email: "synthetic@example.test", password: "synthetic-test-password", emailVerified: true });
    accounts.close();
    server = await startServer(config, { evidenceKeyManager: null });
    base = `http://127.0.0.1:${server.port}`;
    const routes = [
      { path: "/experimental/google-workspace/status", method: "GET" },
      { path: "/experimental/google-workspace/smoke-test", method: "POST" },
      { path: "/experimental/extensions/call", method: "POST", body: JSON.stringify({ extensionId: "google-workspace", action: "gmail_create_draft", args: { to: ["synthetic@example.test"], subject: "test", body: "fixture" } }) },
    ];
    const identities: Record<string, string>[] = [
      { Authorization: `Bearer ${viewer.token}` },
      { Authorization: `Bearer ${config.token}` },
      { Cookie: `mh_session=${encodeURIComponent(session.token)}` },
    ];
    for (const headers of identities) {
      for (const route of routes) {
        const response = await fetch(`${base}${route.path}`, {
          method: route.method, body: route.body, headers: { ...headers, "Content-Type": "application/json" },
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: "forbidden", message: "Google Workspace requires a local owner token" });
      }
    }
    config.readOnly = true;
    for (const route of [routes[1], routes[2], { path: "/experimental/google-workspace/test", method: "POST" }]) {
      const response = await fetch(`${base}${route.path}`, {
        method: route.method, body: route.body, headers: { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" },
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "read_only" });
    }
    const status = await fetch(`${base}/experimental/google-workspace/status`, { headers: { Authorization: `Bearer ${owner.token}` } });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({ connected: true });
    expect(externalCalls).toBe(0);
    expect(await readFile(vaultPath, "utf8")).toBe(vault);
    expect(await readFile(join(root, "vault-key"), "utf8")).toBe(key.toString("base64"));
    expect(await readdir(vaultDir)).toEqual(["oauth.vault"]);
  } finally {
    await server?.stop();
    globalThis.fetch = nativeFetch;
    for (const [key, value] of prior) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
