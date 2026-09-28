import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";
import { StmCredentials, StmError, type Binding } from "@matterhorn-work/stm-credentials";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const HOST_TOKEN = "owt_env_host_token";
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];
const priorEnvStore = process.env.OPENWORK_ENV_STORE;
const priorTokenStore = process.env.OPENWORK_TOKEN_STORE;
const priorOpenAiApiKey = process.env.OPENAI_API_KEY;
const priorOpenAiRealtimeApiKey = process.env.OPENAI_REALTIME_API_KEY;
const priorOpenWorkOpenAiRealtimeApiKey = process.env.OPENWORK_OPENAI_REALTIME_API_KEY;
const priorBuildCommit = process.env.MATTERHORN_BUILD_COMMIT;
const isolatedEnvironment = ["MATTERHORN_WORK_DATA_DIR", "MATTERHORN_AUTH_DB", "MATTERHORN_WORK_RATE_LIMIT_DB", "MATTERHORN_WORK_ENV_STORE", "MATTERHORN_WORK_STM_ENABLED"];
const priorIsolatedEnvironment = new Map(isolatedEnvironment.map(key => [key, process.env[key]]));
const nativeFetch = globalThis.fetch;

function baseConfig(input: Partial<Pick<ServerConfig, "corsOrigins">> = {}): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    token: "owt_env_client_token",
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: input.corsOrigins ?? ["*"],
    workspaces: [],
    authorizedRoots: [],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  } as ServerConfig;
}

async function boot(input: Partial<Pick<ServerConfig, "corsOrigins">> = {}) {
  const server = await startServer(baseConfig(input)) as Served;
  stops.push(() => server.stop());
  return {
    server,
    base: `http://127.0.0.1:${server.port}`,
  };
}

function hostAuth(headerName: "x-matterhorn-host-token" | "x-openwork-host-token" = "x-openwork-host-token") {
  return { [headerName]: HOST_TOKEN, "content-type": "application/json" };
}

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "openwork-env-routes-"));
  dirs.push(dir);
  // Redirect the shared env.json path into a throwaway dir so the test never
  // touches the developer's real ~/.config/openwork/env.json.
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.MATTERHORN_WORK_ENV_STORE = join(dir, "env.json");
  delete process.env.MATTERHORN_WORK_STM_ENABLED;
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_DATA_DIR = dir;
  process.env.MATTERHORN_AUTH_DB = join(dir, "auth.db");
  process.env.MATTERHORN_WORK_RATE_LIMIT_DB = join(dir, "rate-limit.db");
});

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  if (priorEnvStore === undefined) {
    delete process.env.OPENWORK_ENV_STORE;
  } else {
    process.env.OPENWORK_ENV_STORE = priorEnvStore;
  }
  if (priorTokenStore === undefined) {
    delete process.env.OPENWORK_TOKEN_STORE;
  } else {
    process.env.OPENWORK_TOKEN_STORE = priorTokenStore;
  }
  if (priorOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = priorOpenAiApiKey;
  }
  if (priorOpenAiRealtimeApiKey === undefined) {
    delete process.env.OPENAI_REALTIME_API_KEY;
  } else {
    process.env.OPENAI_REALTIME_API_KEY = priorOpenAiRealtimeApiKey;
  }
  if (priorOpenWorkOpenAiRealtimeApiKey === undefined) {
    delete process.env.OPENWORK_OPENAI_REALTIME_API_KEY;
  } else {
    process.env.OPENWORK_OPENAI_REALTIME_API_KEY = priorOpenWorkOpenAiRealtimeApiKey;
  }
  if (priorBuildCommit === undefined) {
    delete process.env.MATTERHORN_BUILD_COMMIT;
  } else {
    process.env.MATTERHORN_BUILD_COMMIT = priorBuildCommit;
  }
  globalThis.fetch = nativeFetch;
  for (const key of isolatedEnvironment) {
    const value = priorIsolatedEnvironment.get(key);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

class FixtureStm extends StmCredentials {
  saves = 0;
  failSave = false;
  bindings: Binding[] = [{ id: "fixture-id", envName: "EXAMPLE_API_KEY", tool: "example", label: "default", consumer: "mcp:example", updatedAt: "2026-09-28", storageBackend: "test fixture", credentialRevision: null, restartRequired: true }];
  override async listBindings() { return this.bindings; }
  override async status() { return { state: "connected", version: 1, backend: "test fixture" }; }
  override async inventory() { return [{ tool: "example", label: "default", status: "active", updatedAt: "2026-09-28", revision: "d".repeat(64) }]; }
  override async unlink(id: string) { this.bindings = this.bindings.filter(b => b.id !== id); }
  override async saveCredential(input: { tool: string; label: string; value: string; expectedRevision: string | null; consent: boolean }) {
    if (!input.consent) throw new StmError("consent_required");
    this.saves++;
    if (this.failSave) throw new StmError("credential_update_uncertain");
    return { key: { tool: input.tool, label: input.label, status: "active", updatedAt: "2026-09-28", revision: "e".repeat(64) }, oldValueCleanupPending: false, restartRequired: true };
  }
}

test("secret replacement is host-only, explicitly consented and returns metadata only", async () => {
  const stm = new FixtureStm();
  const server = await startServer(baseConfig(), { stmCredentials: stm }); stops.push(() => server.stop());
  const base = `http://127.0.0.1:${server.port}`;
  const body = { tool: "example", label: "default", value: "do-not-return-this-fixture", expectedRevision: "d".repeat(64), consent: true };
  const update = (headers: Record<string, string>, payload: unknown = body) => fetch(`${base}/env/stm/credential`, { method: "PUT", headers, body: JSON.stringify(payload) });
  expect((await update({})).status).toBe(401);
  const issued = await fetch(`${base}/tokens`, { method: "POST", headers: hostAuth(), body: JSON.stringify({ scope: "owner", label: "write fixture owner" }) });
  const owner = await issued.json();
  expect((await update({ authorization: `Bearer ${owner.token}` })).status).toBe(401);
  expect((await update(hostAuth(), { ...body, consent: false })).status).toBe(409);
  expect(stm.saves).toBe(0);
  const response = await update(hostAuth()); expect(response.status).toBe(200);
  expect(await response.text()).not.toContain(body.value);
  expect(stm.saves).toBe(1);
  stm.failSave = true;
  const uncertain = await update(hostAuth()); expect(uncertain.status).toBe(409);
  expect(await uncertain.text()).toContain("do not automatically retry");
  expect(stm.saves).toBe(2);
  const config = baseConfig(); config.readOnly = true;
  const readOnly = await startServer(config, { stmCredentials: stm }); stops.push(() => readOnly.stop());
  expect((await fetch(`http://127.0.0.1:${readOnly.port}/env/stm/credential`, { method: "PUT", headers: hostAuth(), body: JSON.stringify(body) })).status).toBe(403);
  expect(stm.saves).toBe(2);
});

class FixtureVoiceStm extends FixtureStm {
  override bindings: Binding[] = [{ id: "voice-fixture", envName: "OPENAI_REALTIME_API_KEY", tool: "fixture", label: "default", consumer: "voice:realtime", updatedAt: "2026-09-28", storageBackend: "test fixture", credentialRevision: null, restartRequired: true }];
  reads = 0;
  override async resolveKeyForConsumer(): Promise<string> {
    this.reads++;
    throw new StmError("connection_failed");
  }
}

test("bound voice requires host token and does not fall back when STM is offline", async () => {
  const stm = new FixtureVoiceStm();
  const server = await startServer(baseConfig(), { stmCredentials: stm });
  stops.push(() => server.stop());
  const base = `http://127.0.0.1:${server.port}`;
  const issued = await fetch(`${base}/tokens`, { method: "POST", headers: hostAuth(), body: JSON.stringify({ scope: "owner", label: "voice fixture owner" }) });
  expect(issued.status).toBe(201);
  const owner = await issued.json();
  const denied = await fetch(`${base}/voice/realtime/session`, { method: "POST", headers: { authorization: `Bearer ${owner.token}`, "content-type": "application/json" }, body: "{}" });
  expect(denied.status).toBe(401);
  expect(stm.reads).toBe(0);
  process.env.OPENAI_API_KEY = "must-not-use-fallback-fixture";
  const failed = await fetch(`${base}/voice/realtime/session`, { method: "POST", headers: hostAuth(), body: "{}" });
  expect(failed.status).toBe(409);
  expect(await failed.text()).not.toContain("must-not-use-fallback-fixture");
  expect(stm.reads).toBe(1);
});

test("STM control routes are host-token-only, metadata-only, and preserve names contract", async () => {
  const server = await startServer(baseConfig(), { stmCredentials: new FixtureStm(), stmConsumers: ["mcp:example"] });
  stops.push(() => server.stop());
  const base = `http://127.0.0.1:${server.port}`;
  const issued = await fetch(`${base}/tokens`, { method: "POST", headers: hostAuth(), body: JSON.stringify({ scope: "owner", label: "stm fixture owner" }) });
  expect(issued.status).toBe(201);
  const owner = await issued.json();
  for (const path of ["status", "bindings", "inventory"]) {
    expect((await fetch(`${base}/env/stm/${path}`)).status).toBe(401);
    expect((await fetch(`${base}/env/stm/${path}`, { headers: { authorization: `Bearer ${owner.token}` } })).status).toBe(401);
    const response = await fetch(`${base}/env/stm/${path}`, { headers: hostAuth() });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('"value":');
  }
  expect((await fetch(`${base}/env`, { headers: hostAuth() })).status).toBe(409);
  const keys = await fetch(`${base}/env/keys`, { headers: hostAuth() });
  expect(await keys.json()).toEqual({ keys: ["EXAMPLE_API_KEY"] });
  expect((await fetch(`${base}/env`, { method: "PUT", headers: hostAuth(), body: JSON.stringify({ key: "EXAMPLE_API_KEY", value: "stale-fixture" }) })).status).toBe(409);
  expect((await fetch(`${base}/env/EXAMPLE_API_KEY`, { method: "DELETE", headers: hostAuth() })).status).toBe(409);
  expect((await fetch(`${base}/env/stm/resolve`, { method: "POST", headers: hostAuth(), body: "{}" })).status).toBe(404);
  expect((await fetch(`${base}/env/stm/bindings/fixture-id`, { method: "DELETE", headers: hostAuth() })).status).toBe(200);
  expect(await (await fetch(`${base}/env/keys`, { headers: hostAuth() })).json()).toEqual({ keys: [] });
});

test("STM is disabled by default and read-only mode rejects changes", async () => {
  const { base } = await boot();
  expect(await (await fetch(`${base}/env/stm/status`, { headers: hostAuth() })).json()).toEqual({ state: "unavailable", code: "disabled" });
  expect((await fetch(`${base}/env/stm/connect`, { method: "POST", headers: hostAuth(), body: '{"consent":true}' })).status).toBe(409);
  const config = baseConfig(); config.readOnly = true;
  const server = await startServer(config, { stmCredentials: new FixtureStm() });
  stops.push(() => server.stop());
  expect((await fetch(`http://127.0.0.1:${server.port}/env/stm/bindings/fixture-id`, { method: "DELETE", headers: hostAuth() })).status).toBe(403);
});

describe("env routes", () => {
  test("rejects unauthenticated requests", async () => {
    const { base } = await boot();
    const response = await fetch(`${base}/env`);
    expect(response.status).toBe(401);
  });

  test("rejects owner bearer tokens", async () => {
    const { base } = await boot();
    const issued = await fetch(`${base}/tokens`, {
      method: "POST",
      headers: hostAuth(),
      body: JSON.stringify({ scope: "owner", label: "test owner" }),
    });
    expect(issued.status).toBe(201);
    const body = (await issued.json()) as { token: string };

    const response = await fetch(`${base}/env`, {
      headers: { authorization: `Bearer ${body.token}` },
    });
    expect(response.status).toBe(401);
  });

  test("accepts the Matterhorn host token header alias", async () => {
    const { base } = await boot();
    const response = await fetch(`${base}/env/keys`, {
      headers: hostAuth("x-matterhorn-host-token"),
    });

    expect(response.status).toBe(200);
  });

  test("CORS preflight allows PUT", async () => {
    const { base } = await boot();
    const response = await fetch(`${base}/env`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "PUT",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("PUT");
  });

  test("loopback CORS allows local web app ports without wildcarding the internet", async () => {
    const { base } = await boot({ corsOrigins: ["loopback"] });
    const allowed = await fetch(`${base}/env`, {
      method: "OPTIONS",
      headers: {
        origin: "http://127.0.0.1:5175",
        "access-control-request-method": "PUT",
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://127.0.0.1:5175");

    const denied = await fetch(`${base}/env`, {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "PUT",
      },
    });
    expect(denied.status).toBe(204);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("all responses include defensive browser security headers", async () => {
    const buildCommit = "a".repeat(40);
    process.env.MATTERHORN_BUILD_COMMIT = buildCommit;
    const { base } = await boot({ corsOrigins: ["https://app.matterhorn.example"] });
    const response = await fetch(`${base}/health`, {
      headers: { origin: "https://app.matterhorn.example" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://app.matterhorn.example");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-matterhorn-build-commit")).toBe(buildCommit);
    expect(response.headers.get("access-control-expose-headers")).toContain("X-Matterhorn-Build-Commit");
  });

  test("PUT + GET round-trips a single entry and returns raw values", async () => {
    const { base } = await boot();
    const put = await fetch(`${base}/env`, {
      method: "PUT",
      headers: hostAuth(),
      body: JSON.stringify({ key: "ANTHROPIC_API_KEY", value: "sk-ant-abc" }),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ ok: true, count: 1 });

    const list = await fetch(`${base}/env`, { headers: hostAuth() });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { items: Array<{ key: string; value: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ key: "ANTHROPIC_API_KEY", value: "sk-ant-abc" });
  });

  test("GET /env/keys returns names without values", async () => {
    const { base } = await boot();
    await fetch(`${base}/env`, {
      method: "PUT",
      headers: hostAuth(),
      body: JSON.stringify({
        entries: [
          { key: "ANTHROPIC_API_KEY", value: "sk-ant-abc" },
          { key: "NBA_LIVE_KEY", value: "secret-value" },
        ],
      }),
    });

    const list = await fetch(`${base}/env/keys`, { headers: hostAuth() });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ keys: ["ANTHROPIC_API_KEY", "NBA_LIVE_KEY"] });
  });

  test("invalid env store returns 409 instead of overwriting on PUT", async () => {
    writeFileSync(process.env.OPENWORK_ENV_STORE!, "{ this is not json");
    const { base } = await boot();

    const put = await fetch(`${base}/env`, {
      method: "PUT",
      headers: hostAuth(),
      body: JSON.stringify({ key: "SAFE", value: "new" }),
    });

    expect(put.status).toBe(409);
    const body = (await put.json()) as { code: string; message: string };
    expect(body.code).toBe("invalid_env_store");
  });

  test("PUT accepts a batch via entries[]", async () => {
    const { base } = await boot();
    const put = await fetch(`${base}/env`, {
      method: "PUT",
      headers: hostAuth(),
      body: JSON.stringify({
        entries: [
          { key: "A", value: "1" },
          { key: "B", value: "2" },
        ],
      }),
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ ok: true, count: 2 });

    const body = (await (await fetch(`${base}/env`, { headers: hostAuth() })).json()) as {
      items: Array<{ key: string }>;
    };
    expect(body.items.map((i) => i.key)).toEqual(["A", "B"]);
  });

  test("PUT rejects invalid keys with 400", async () => {
    const { base } = await boot();
    const put = await fetch(`${base}/env`, {
      method: "PUT",
      headers: hostAuth(),
      body: JSON.stringify({ key: "bad-key", value: "x" }),
    });
    expect(put.status).toBe(400);
    const body = (await put.json()) as { code: string; message: string };
    expect(body.code).toBe("invalid_env_key");
    expect(body.message).toBe("Invalid environment variable name");
    expect(body.message).not.toContain("bad-key");
  });

  test("PUT rejects reserved keys with 400", async () => {
    const { base } = await boot();
    const put = await fetch(`${base}/env`, {
      method: "PUT",
      headers: hostAuth(),
      body: JSON.stringify({ key: "OPENWORK_TOKEN", value: "x" }),
    });
    expect(put.status).toBe(400);
    const body = (await put.json()) as { code: string; message: string };
    expect(body.code).toBe("reserved_env_key");
    expect(body.message).toBe("Environment variable name is reserved for Matterhorn Desks internals");
    expect(body.message).not.toContain("OPENWORK_TOKEN");
  });

  test("PUT with no entries returns 400", async () => {
    const { base } = await boot();
    const put = await fetch(`${base}/env`, {
      method: "PUT",
      headers: hostAuth(),
      body: JSON.stringify({ entries: [] }),
    });
    expect(put.status).toBe(400);
  });

  test("DELETE removes an existing entry", async () => {
    const { base } = await boot();
    await fetch(`${base}/env`, {
      method: "PUT",
      headers: hostAuth(),
      body: JSON.stringify({ key: "FOO", value: "bar" }),
    });

    const del = await fetch(`${base}/env/FOO`, { method: "DELETE", headers: hostAuth() });
    expect(del.status).toBe(200);

    const list = (await (await fetch(`${base}/env`, { headers: hostAuth() })).json()) as {
      items: unknown[];
    };
    expect(list.items).toHaveLength(0);
  });

  test("DELETE on missing key returns 404", async () => {
    const { base } = await boot();
    const del = await fetch(`${base}/env/MISSING`, { method: "DELETE", headers: hostAuth() });
    expect(del.status).toBe(404);
  });

  test("voice realtime session accepts owner bearer token", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.OPENAI_REALTIME_API_KEY;
    delete process.env.OPENWORK_OPENAI_REALTIME_API_KEY;
    let observedSessionRequest: unknown = null;
    globalThis.fetch = ((input, init) => {
      const url = String(input);
      if (url === "https://api.openai.com/v1/realtime/client_secrets") {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer sk-test" });
        observedSessionRequest = JSON.parse(String(init?.body ?? "{}"));
        return Promise.resolve(new Response(JSON.stringify({ client_secret: { value: "rt-secret", expires_at: 123 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      }
      return nativeFetch(input, init);
    }) as typeof fetch;

    const { base } = await boot();
    const issued = await fetch(`${base}/tokens`, {
      method: "POST",
      headers: hostAuth(),
      body: JSON.stringify({ scope: "owner", label: "voice owner" }),
    });
    const tokenBody = (await issued.json()) as { token: string };

    const response = await fetch(`${base}/voice/realtime/session`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokenBody.token}`, "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      clientSecret: "rt-secret",
      expiresAt: 123,
    });
    expect(JSON.stringify(observedSessionRequest)).toContain("Matterhorn Desks Voice Mode");
    expect(JSON.stringify(observedSessionRequest)).toContain("semantic Matterhorn Desks UI tools");
    expect(JSON.stringify(observedSessionRequest)).toContain("openwork_snapshot");
    expect(JSON.stringify(observedSessionRequest)).toContain("compatibility tool IDs control Matterhorn Desks");
    expect(JSON.stringify(observedSessionRequest)).not.toContain("OpenWork Voice Mode");
    expect(JSON.stringify(observedSessionRequest)).not.toContain("semantic OpenWork UI tools");
  });

  test("voice realtime missing key error uses Matterhorn copy", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_REALTIME_API_KEY;
    delete process.env.OPENWORK_OPENAI_REALTIME_API_KEY;

    const { base } = await boot();
    const response = await fetch(`${base}/voice/realtime/session`, {
      method: "POST",
      headers: hostAuth(),
      body: JSON.stringify({}),
    });
    const body = await response.json() as { message?: string };

    expect(response.status).toBe(400);
    expect(body.message).toContain("Matterhorn Desks environment variables");
    expect(body.message).not.toContain("OpenWork Environment Variables");
  });

  test("values persist across server restart", async () => {
    const first = await boot();
    await fetch(`${first.base}/env`, {
      method: "PUT",
      headers: hostAuth(),
      body: JSON.stringify({ key: "PERSISTED", value: "yes" }),
    });
    await first.server.stop(true);
    stops.pop();

    const second = await boot();
    const body = (await (await fetch(`${second.base}/env`, { headers: hostAuth() })).json()) as {
      items: Array<{ key: string; value: string }>;
    };
    expect(body.items).toEqual([expect.objectContaining({ key: "PERSISTED", value: "yes" })]);
  });
});
