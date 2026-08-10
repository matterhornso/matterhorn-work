import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

type JsonResult = {
  response: Response;
  payload: any;
};

const TOKEN = "owt_auth_test_token";
const HOST_TOKEN = "owt_auth_test_host_token";
const PASSWORD = "matterhorn-test-password";
const roots: string[] = [];
const stops: Array<() => void | Promise<void>> = [];
const priorAuthDb = process.env.MATTERHORN_AUTH_DB;
const priorDataDir = process.env.MATTERHORN_WORK_DATA_DIR;
const priorSignupsEnabled = process.env.MATTERHORN_SIGNUPS_ENABLED;
const priorSignupCapacity = process.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS;

function config(port: number, root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["http://127.0.0.1:5173"],
    workspaces: [{
      id: "ws_auth",
      name: "Auth acceptance workspace",
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

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

async function boot(root?: string) {
  const resolvedRoot =
    root ?? mkdtempSync(join(tmpdir(), "matterhorn-auth-e2e-"));
  if (!root) roots.push(resolvedRoot);
  process.env.MATTERHORN_WORK_DATA_DIR = join(resolvedRoot, "data");
  delete process.env.MATTERHORN_AUTH_DB;
  const server = await startServer(
    config(await getFreePort(), resolvedRoot),
  ) as Served;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await server.stop(true);
  };
  stops.push(stop);
  return {
    base: `http://127.0.0.1:${server.port}`,
    root: resolvedRoot,
    authDb: join(resolvedRoot, "data", "auth", "accounts.db"),
    stop,
  };
}

async function jsonRequest(
  base: string,
  path: string,
  options: {
    body?: Record<string, unknown>;
    cookie?: string;
    bearer?: string;
    forwardedProto?: "http" | "https";
    origin?: string;
  } = {},
): Promise<JsonResult> {
  const headers = new Headers();
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.bearer) headers.set("Authorization", `Bearer ${options.bearer}`);
  if (options.forwardedProto) {
    headers.set("X-Forwarded-Proto", options.forwardedProto);
  }
  if (options.origin) headers.set("Origin", options.origin);
  const response = await fetch(`${base}${path}`, {
    method: options.body ? "POST" : "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return {
    response,
    payload: await response.json().catch(() => null),
  };
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0]?.trim() ?? "";
  if (!cookie.startsWith("mh_session=")) {
    throw new Error(`Matterhorn session cookie missing: ${setCookie}`);
  }
  return cookie;
}

function cookieToken(cookie: string): string {
  return decodeURIComponent(cookie.slice("mh_session=".length));
}

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) {
    rmSync(roots.pop()!, { force: true, recursive: true });
  }
  if (priorAuthDb === undefined) delete process.env.MATTERHORN_AUTH_DB;
  else process.env.MATTERHORN_AUTH_DB = priorAuthDb;
  if (priorDataDir === undefined) delete process.env.MATTERHORN_WORK_DATA_DIR;
  else process.env.MATTERHORN_WORK_DATA_DIR = priorDataDir;
  if (priorSignupsEnabled === undefined) delete process.env.MATTERHORN_SIGNUPS_ENABLED;
  else process.env.MATTERHORN_SIGNUPS_ENABLED = priorSignupsEnabled;
  if (priorSignupCapacity === undefined) delete process.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS;
  else process.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS = priorSignupCapacity;
});

describe("public account authentication", () => {
  test("pauses account creation and enforces the configured beta capacity", async () => {
    const app = await boot();
    process.env.MATTERHORN_SIGNUPS_ENABLED = "false";
    const paused = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "paused@example.com", password: PASSWORD },
    });
    expect(paused.response.status).toBe(503);
    expect(paused.payload.code).toBe("signups_paused");

    process.env.MATTERHORN_SIGNUPS_ENABLED = "true";
    process.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS = "1";
    const accepted = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "first@example.com", password: PASSWORD },
    });
    expect(accepted.response.status).toBe(200);
    const full = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "second@example.com", password: PASSWORD },
    });
    expect(full.response.status).toBe(503);
    expect(full.payload.code).toBe("signup_capacity_reached");
  });

  test("creates, restores, signs out, and signs back into an account", async () => {
    const first = await boot();
    const signup = await jsonRequest(first.base, "/api/auth/sign-up/email", {
      body: {
        email: "  NEW.USER@Example.com ",
        password: PASSWORD,
        name: "New User",
      },
      forwardedProto: "https",
    });

    expect(signup.response.status).toBe(200);
    expect(signup.payload.user.email).toBe("new.user@example.com");
    expect(signup.payload.user.name).toBe("New User");
    expect(signup.payload.organization.role).toBe("owner");
    const setCookie = signup.response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("mh_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).toContain("Secure");
    const cookie = sessionCookie(signup.response);

    const anonymousSession = await jsonRequest(
      first.base,
      "/api/den/v1/session",
    );
    expect(anonymousSession.response.status).toBe(200);
    expect(anonymousSession.payload).toEqual({ authenticated: false });

    const authenticatedSession = await jsonRequest(
      first.base,
      "/api/den/v1/session",
      { cookie },
    );
    expect(authenticatedSession.response.status).toBe(200);
    expect(authenticatedSession.payload.authenticated).toBe(true);
    expect(authenticatedSession.payload.user.email).toBe(
      "new.user@example.com",
    );
    expect(authenticatedSession.response.headers.get("cache-control")).toBe(
      "no-store",
    );

    const me = await jsonRequest(first.base, "/api/den/v1/me", { cookie });
    expect(me.response.status).toBe(200);
    expect(me.payload.user.email).toBe("new.user@example.com");
    expect(me.payload.activeOrgId).toBe(signup.payload.organization.id);

    await first.stop();
    const restarted = await boot(first.root);
    const restored = await jsonRequest(restarted.base, "/api/den/v1/me", {
      cookie,
    });
    expect(restored.response.status).toBe(200);
    expect(restored.payload.user.id).toBe(signup.payload.user.id);

    const signout = await jsonRequest(
      restarted.base,
      "/api/auth/sign-out",
      { body: {}, cookie },
    );
    expect(signout.response.status).toBe(200);
    expect(signout.response.headers.get("set-cookie") ?? "").toContain(
      "Max-Age=0",
    );
    const signedOut = await jsonRequest(restarted.base, "/api/den/v1/me", {
      cookie,
    });
    expect(signedOut.response.status).toBe(401);

    const signin = await jsonRequest(restarted.base, "/api/auth/sign-in/email", {
      body: { email: "new.user@example.com", password: PASSWORD },
    });
    expect(signin.response.status).toBe(200);
    const signedBackIn = await jsonRequest(
      restarted.base,
      "/api/den/v1/me",
      { cookie: sessionCookie(signin.response) },
    );
    expect(signedBackIn.response.status).toBe(200);
    expect(signedBackIn.payload.user.email).toBe("new.user@example.com");
  });

  test("serves the default desktop policy only to signed-in accounts", async () => {
    const app = await boot();
    const anonymous = await jsonRequest(
      app.base,
      "/api/den/v1/me/desktop-config",
    );
    expect(anonymous.response.status).toBe(401);

    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "desktop-policy@example.com",
        password: PASSWORD,
        name: "Desktop Policy",
      },
    });
    expect(signup.response.status).toBe(200);

    const desktopConfig = await jsonRequest(
      app.base,
      "/api/den/v1/me/desktop-config",
      { cookie: sessionCookie(signup.response) },
    );
    expect(desktopConfig.response.status).toBe(200);
    expect(desktopConfig.payload).toEqual({});
  });

  test("authorizes protected browser routes with the first-party session cookie", async () => {
    const app = await boot();
    const anonymous = await jsonRequest(
      app.base,
      "/api/workflows/templates",
    );
    expect(anonymous.response.status).toBe(401);

    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "browser-session@example.com",
        password: PASSWORD,
        name: "Browser Session",
      },
    });
    expect(signup.response.status).toBe(200);

    const authenticated = await jsonRequest(
      app.base,
      "/api/workflows/templates",
      { cookie: sessionCookie(signup.response) },
    );
    expect(authenticated.response.status).toBe(200);
    expect(Array.isArray(authenticated.payload.customerTemplates)).toBe(true);
    expect(authenticated.payload.customerTemplates.length).toBeGreaterThan(0);
  });

  test("does not let hosted account sessions configure or enable custom MCP execution", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "hosted-mcp@example.com",
        password: PASSWORD,
        name: "Hosted MCP",
      },
    });
    const cookie = sessionCookie(signup.response);
    const workspaces = await jsonRequest(app.base, "/workspaces", { cookie });
    expect(workspaces.response.status).toBe(200);
    expect(workspaces.payload.items).toHaveLength(1);
    const workspaceId = workspaces.payload.items[0].id as string;

    for (const config of [
      { type: "local", command: ["node", "server.js"] },
      { type: "remote", url: "https://example.com/mcp" },
    ]) {
      const added = await jsonRequest(
        app.base,
        `/workspace/${workspaceId}/mcp`,
        {
          cookie,
          body: { name: "untrusted", config },
        },
      );
      expect(added.response.status).toBe(403);
      expect(added.payload.code).toBe("custom_mcp_desktop_only");
    }

    const enabled = await jsonRequest(
      app.base,
      `/workspace/${workspaceId}/mcp/untrusted/enabled`,
      { cookie, body: { enabled: true } },
    );
    expect(enabled.response.status).toBe(403);
    expect(enabled.payload.code).toBe("custom_mcp_desktop_only");

    const localEngineAdd = await jsonRequest(
      app.base,
      "/workspace/ws_auth/mcp",
      {
        bearer: TOKEN,
        body: {
          name: "trusted-desktop-local",
          config: { type: "local", command: ["node", "server.js"] },
        },
      },
    );
    expect(localEngineAdd.response.status).toBe(200);
    expect(localEngineAdd.payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "trusted-desktop-local" }),
      ]),
    );
  });

  test("rejects invalid, duplicate, and incorrect credentials safely", async () => {
    const app = await boot();
    const invalidEmail = await jsonRequest(
      app.base,
      "/api/auth/sign-up/email",
      { body: { email: "not-an-email", password: PASSWORD } },
    );
    expect(invalidEmail.response.status).toBe(400);
    expect(invalidEmail.payload.code).toBe("invalid_email");

    const shortPassword = await jsonRequest(
      app.base,
      "/api/auth/sign-up/email",
      { body: { email: "short@example.com", password: "too-short" } },
    );
    expect(shortPassword.response.status).toBe(400);
    expect(shortPassword.payload.code).toBe("invalid_password");

    const created = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "owner@example.com", password: PASSWORD },
    });
    expect(created.response.status).toBe(200);

    const duplicate = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "OWNER@example.com", password: PASSWORD },
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.payload.code).toBe("email_taken");

    const wrongPassword = await jsonRequest(
      app.base,
      "/api/auth/sign-in/email",
      { body: { email: "owner@example.com", password: `${PASSWORD}-wrong` } },
    );
    const unknownEmail = await jsonRequest(
      app.base,
      "/api/auth/sign-in/email",
      { body: { email: "unknown@example.com", password: PASSWORD } },
    );
    expect(wrongPassword.response.status).toBe(401);
    expect(unknownEmail.response.status).toBe(401);
    expect(wrongPassword.payload.message).toBe(unknownEmail.payload.message);
  });

  test("keeps organizations isolated between separate accounts", async () => {
    const app = await boot();
    const userA = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "user-a@example.com", password: PASSWORD },
    });
    const userB = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "user-b@example.com", password: PASSWORD },
    });
    const cookieA = sessionCookie(userA.response);
    const cookieB = sessionCookie(userB.response);

    const orgsA = await jsonRequest(app.base, "/api/den/v1/me/orgs", {
      cookie: cookieA,
    });
    const orgsB = await jsonRequest(app.base, "/api/den/v1/me/orgs", {
      cookie: cookieB,
    });
    expect(orgsA.payload.orgs).toHaveLength(1);
    expect(orgsB.payload.orgs).toHaveLength(1);
    expect(orgsA.payload.orgs[0].id).not.toBe(orgsB.payload.orgs[0].id);

    const crossAccountSwitch = await jsonRequest(
      app.base,
      "/api/den/v1/me/active-organization",
      {
        body: { organizationId: orgsB.payload.orgs[0].id },
        cookie: cookieA,
      },
    );
    expect(crossAccountSwitch.response.status).toBe(400);
    expect(crossAccountSwitch.payload.code).toBe("invalid_organization");

    const createdOrg = await jsonRequest(
      app.base,
      "/api/auth/organization/create",
      {
        body: { name: "User A Team", slug: "user-a-team" },
        cookie: cookieA,
      },
    );
    expect(createdOrg.response.status).toBe(200);
    expect(createdOrg.payload.organization.role).toBe("owner");

    const updatedA = await jsonRequest(app.base, "/api/den/v1/me", {
      cookie: cookieA,
    });
    expect(updatedA.payload.activeOrgSlug).toBe("user-a-team");
    const unchangedB = await jsonRequest(app.base, "/api/den/v1/me", {
      cookie: cookieB,
    });
    expect(unchangedB.payload.activeOrgId).toBe(orgsB.payload.orgs[0].id);
  });

  test("gives each signed-in organization one durable isolated workspace", async () => {
    const app = await boot();
    const userA = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "workspace-a@example.com", password: PASSWORD },
    });
    const userB = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "workspace-b@example.com", password: PASSWORD },
    });
    const cookieA = sessionCookie(userA.response);
    const cookieB = sessionCookie(userB.response);

    const workspacesA = await jsonRequest(app.base, "/workspaces", {
      cookie: cookieA,
    });
    const workspacesB = await jsonRequest(app.base, "/workspaces", {
      cookie: cookieB,
    });
    expect(workspacesA.response.status).toBe(200);
    expect(workspacesB.response.status).toBe(200);
    expect(workspacesA.payload.items).toHaveLength(1);
    expect(workspacesB.payload.items).toHaveLength(1);
    const workspaceA = workspacesA.payload.items[0];
    const workspaceB = workspacesB.payload.items[0];
    expect(workspaceA.id).toMatch(/^ws_web_[a-f0-9]{16}$/);
    expect(workspaceB.id).toMatch(/^ws_web_[a-f0-9]{16}$/);
    expect(workspaceA.id).not.toBe(workspaceB.id);
    expect(workspaceA.path).not.toBe(workspaceB.path);
    expect(workspacesA.payload.activeId).toBe(workspaceA.id);
    expect(workspacesB.payload.activeId).toBe(workspaceB.id);

    const ownWorkspace = await jsonRequest(
      app.base,
      `/workspace/${workspaceA.id}/config`,
      { cookie: cookieA },
    );
    expect(ownWorkspace.response.status).toBe(200);
    const crossWorkspace = await jsonRequest(
      app.base,
      `/workspace/${workspaceB.id}/config`,
      { cookie: cookieA },
    );
    expect(crossWorkspace.response.status).toBe(404);
    expect(crossWorkspace.payload.code).toBe("workspace_not_found");

    const now = "2026-07-29T00:00:00.000Z";
    const capturedMemory = await jsonRequest(app.base, "/api/memory/capture", {
      cookie: cookieA,
      body: {
        record: {
          id: "mem_account_isolation",
          kind: "user_preference",
          scope: "workspace",
          title: "Private account preference",
          summary: "Visible only inside user A's organization workspace.",
          body: { responseStyle: "concise" },
          tags: ["account-isolation"],
          links: [],
          provenance: {
            source: "user_confirmed",
            capturedAt: now,
            capturedBy: "user",
            confidence: 1,
            reasonRemembered: "Explicit isolation acceptance fixture.",
          },
          sensitivity: "private",
          createdAt: now,
          updatedAt: now,
          canUseInChat: true,
          canExport: false,
          canDelete: true,
        },
      },
    });
    expect(capturedMemory.response.status).toBe(200);
    expect(capturedMemory.payload.record.id).toBe("mem_account_isolation");
    expect(capturedMemory.payload.record.tags).toContain(
      `workspace:${workspaceA.id}`,
    );

    const memoryA = await jsonRequest(
      app.base,
      "/api/memory/search?tags=account-isolation",
      { cookie: cookieA },
    );
    const memoryB = await jsonRequest(
      app.base,
      "/api/memory/search?tags=account-isolation",
      { cookie: cookieB },
    );
    expect(memoryA.response.status).toBe(200);
    expect(memoryA.payload.count).toBe(1);
    expect(memoryB.response.status).toBe(200);
    expect(memoryB.payload.count).toBe(0);

    const guessedMemory = await jsonRequest(
      app.base,
      "/api/memory/entities/mem_account_isolation",
      { cookie: cookieB },
    );
    expect(guessedMemory.response.status).toBe(404);
    expect(guessedMemory.payload.code).toBe("memory_not_found");

    const bittensorWatch = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      {
        cookie: cookieA,
        body: {
          kind: "subnet",
          label: "User A private subnet watch",
          netuid: 14,
        },
      },
    );
    expect(bittensorWatch.response.status).toBe(200);
    const bittensorWatchesA = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      { cookie: cookieA },
    );
    const bittensorWatchesB = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      { cookie: cookieB },
    );
    expect(bittensorWatchesA.payload.watches).toHaveLength(1);
    expect(bittensorWatchesB.payload.watches).toHaveLength(0);

    const bittensorChatWatch = await jsonRequest(
      app.base,
      "/api/bittensor/chat/execute",
      {
        cookie: cookieA,
        body: { message: "monitor subnet 14 emissions" },
      },
    );
    expect(bittensorChatWatch.response.status).toBe(200);
    expect(bittensorChatWatch.payload.execution).toBe("answered");
    expect(bittensorChatWatch.payload.data.watch.ownerScope).toBeUndefined();
    expect(bittensorChatWatch.payload.context.id).toMatch(/^bt-chat-/);

    const chatWatchesA = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      { cookie: cookieA },
    );
    const chatWatchesB = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      { cookie: cookieB },
    );
    expect(chatWatchesA.payload.watches).toHaveLength(2);
    expect(chatWatchesB.payload.watches).toHaveLength(0);

    const ownBittensorContext = await jsonRequest(
      app.base,
      `/api/bittensor/chat/context/${bittensorChatWatch.payload.context.id}`,
      { cookie: cookieA },
    );
    const guessedBittensorContext = await jsonRequest(
      app.base,
      `/api/bittensor/chat/context/${bittensorChatWatch.payload.context.id}`,
      { cookie: cookieB },
    );
    expect(ownBittensorContext.response.status).toBe(200);
    expect(guessedBittensorContext.response.status).toBe(404);
    expect(guessedBittensorContext.payload.code).toBe("context_not_found");

    const hyperliquidWatch = await jsonRequest(
      app.base,
      "/api/hyperliquid/watches",
      {
        cookie: cookieA,
        body: {
          asset: "BTC",
          kind: "funding_rate",
          threshold: 0.01,
          direction: "above",
        },
      },
    );
    expect(hyperliquidWatch.response.status).toBe(200);
    const hyperliquidWatchesA = await jsonRequest(
      app.base,
      "/api/hyperliquid/watches",
      { cookie: cookieA },
    );
    const hyperliquidWatchesB = await jsonRequest(
      app.base,
      "/api/hyperliquid/watches",
      { cookie: cookieB },
    );
    expect(hyperliquidWatchesA.payload.watches).toHaveLength(1);
    expect(hyperliquidWatchesB.payload.watches).toHaveLength(0);

    const desktopWorkspaces = await jsonRequest(app.base, "/workspaces", {
      bearer: TOKEN,
    });
    expect(desktopWorkspaces.response.status).toBe(200);
    expect(
      desktopWorkspaces.payload.items.some(
        (workspace: { id: string }) => workspace.id === "ws_auth",
      ),
    ).toBe(true);

    await app.stop();
    const restarted = await boot(app.root);
    const restored = await jsonRequest(restarted.base, "/workspaces", {
      cookie: cookieA,
    });
    expect(restored.response.status).toBe(200);
    expect(restored.payload.items).toHaveLength(1);
    expect(restored.payload.items[0].id).toBe(workspaceA.id);
    expect(restored.payload.items[0].path).toBe(workspaceA.path);
  });

  test("stores password derivatives and token hashes instead of raw secrets", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "secure@example.com", password: PASSWORD },
    });
    const cookie = sessionCookie(signup.response);
    const rawToken = cookieToken(cookie);
    const dbBytes = readFileSync(app.authDb);
    const dbText = dbBytes.toString("latin1");
    expect(dbText.includes(PASSWORD)).toBe(false);
    expect(dbText.includes(rawToken)).toBe(false);
    expect(statSync(app.authDb).mode & 0o777).toBe(0o600);

    const db = new Database(app.authDb, { readonly: true });
    try {
      const user = db.query(
        "SELECT password_hash, password_salt FROM users WHERE email = ?",
      ).get("secure@example.com") as {
        password_hash: string;
        password_salt: string;
      };
      const session = db.query(
        "SELECT token_hash FROM sessions WHERE user_id = ?",
      ).get(signup.payload.user.id) as { token_hash: string };
      expect(user.password_hash).toMatch(/^[a-f0-9]{128}$/);
      expect(user.password_salt).toMatch(/^[a-f0-9]{32}$/);
      expect(session.token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(session.token_hash).not.toBe(rawToken);
    } finally {
      db.close();
    }
  });

  test("rate limits repeated credential attacks without blocking a later valid sign-in", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "limited@example.com", password: PASSWORD },
    });
    expect(signup.response.status).toBe(200);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const rejected = await jsonRequest(
        app.base,
        "/api/auth/sign-in/email",
        {
          body: {
            email: "limited@example.com",
            password: `${PASSWORD}-wrong`,
          },
        },
      );
      expect(rejected.response.status).toBe(401);
    }

    const limited = await jsonRequest(
      app.base,
      "/api/auth/sign-in/email",
      {
        body: { email: "limited@example.com", password: PASSWORD },
      },
    );
    expect(limited.response.status).toBe(429);
    expect(limited.payload.code).toBe("rate_limited");

    const unaffected = await jsonRequest(
      app.base,
      "/api/auth/sign-in/email",
      {
        body: { email: "other@example.com", password: PASSWORD },
      },
    );
    expect(unaffected.response.status).toBe(401);
  });

  test("accepts bearer sessions and enforces configured browser origins", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "bearer@example.com", password: PASSWORD },
    });
    const token = cookieToken(sessionCookie(signup.response));
    const me = await jsonRequest(app.base, "/api/den/v1/me", {
      bearer: token,
    });
    expect(me.response.status).toBe(200);
    expect(me.payload.user.email).toBe("bearer@example.com");

    const allowed = await jsonRequest(app.base, "/api/den/v1/me", {
      cookie: sessionCookie(signup.response),
      origin: "http://127.0.0.1:5173",
    });
    expect(allowed.response.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5173",
    );
    expect(allowed.response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );

    const disallowed = await jsonRequest(app.base, "/api/den/v1/me", {
      cookie: sessionCookie(signup.response),
      origin: "https://attacker.example",
    });
    expect(
      disallowed.response.headers.get("access-control-allow-origin"),
    ).toBeNull();
  });

  test("blocks cross-origin browser mutations without blocking allowed origins", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "origin-guard@example.com", password: PASSWORD },
      origin: "http://127.0.0.1:5173",
    });
    expect(signup.response.status).toBe(200);
    const cookie = sessionCookie(signup.response);

    const blocked = await jsonRequest(app.base, "/api/auth/organization/create", {
      cookie,
      origin: "https://attacker.example",
      body: { name: "Attacker workspace", slug: "attacker-workspace" },
    });
    expect(blocked.response.status).toBe(403);
    expect(blocked.payload.code).toBe("untrusted_origin");

    const allowed = await jsonRequest(app.base, "/api/auth/organization/create", {
      cookie,
      origin: "http://127.0.0.1:5173",
      body: { name: "Allowed workspace", slug: "allowed-workspace" },
    });
    expect(allowed.response.status).toBe(200);
    expect(allowed.payload.organization.slug).toBe("allowed-workspace");
  });

  test("emits HSTS only for HTTPS requests", async () => {
    const app = await boot();
    const plain = await jsonRequest(app.base, "/health");
    expect(plain.response.headers.get("strict-transport-security")).toBeNull();

    const proxiedHttps = await jsonRequest(app.base, "/health", {
      forwardedProto: "https",
    });
    expect(proxiedHttps.response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });
});
