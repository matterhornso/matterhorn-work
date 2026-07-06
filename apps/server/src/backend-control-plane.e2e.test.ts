import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_backend_control_plane_token";
const HOST_TOKEN = "owt_backend_control_plane_host_token";
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  openworkDataDir: process.env.OPENWORK_DATA_DIR,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
  opencodeDb: process.env.OPENCODE_DB,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function restoreEnv(key: keyof typeof priorEnv, envName: string) {
  const value = priorEnv[key];
  if (value === undefined) delete process.env[envName];
  else process.env[envName] = value;
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
      id: "ws_backend",
      name: "Backend control plane test workspace",
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
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-backend-control-plane-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
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

function record(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-07-06T00:00:00.000Z").toISOString();
  return {
    id: "mem_backend_control_plane_tao_wallet",
    kind: "protocol_address",
    scope: "workspace",
    title: "Backend control plane TAO wallet",
    summary: "Public SS58 address label for backend control plane tests.",
    body: {
      ss58Address: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1backend",
      netuid: 14,
    },
    tags: ["bittensor", "tao", "wallet"],
    links: [],
    provenance: {
      source: "user_confirmed",
      capturedAt: now,
      capturedBy: "user",
      confidence: 0.95,
      reasonRemembered: "The user confirmed this public address can be reused for TAO read workflows.",
    },
    sensitivity: "public",
    createdAt: now,
    updatedAt: now,
    canUseInChat: true,
    canExport: true,
    canDelete: true,
    ...overrides,
  };
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  restoreEnv("envStore", "OPENWORK_ENV_STORE");
  restoreEnv("openworkDataDir", "OPENWORK_DATA_DIR");
  restoreEnv("tokenStore", "OPENWORK_TOKEN_STORE");
  restoreEnv("memoryRoot", "MATTERHORN_WORK_MEMORY_ROOT");
  restoreEnv("opencodeDb", "OPENCODE_DB");
});

describe("backend control plane routes", () => {
  test("GET /api/backend/capabilities reports truthful backend status without secrets", async () => {
    const { base } = await boot();

    const result = await jsonFetch(base, "/api/backend/capabilities");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.capabilities.v1");
    expect(result.payload.models.defaultModel).toEqual({ providerId: "opencode", modelId: "big-pickle" });
    expect(result.payload.models.providerListSource).toBe("opencode");
    expect(result.payload.models.routing.answerPath).toBe("opencode_session_prompt_async");
    expect(result.payload.models.routing.modelListTool).toBe("opencode_provider_list");
    expect(result.payload.models.routing.userSelectable).toBe(true);
    expect(result.payload.memory.scope).toBe("machine_global");
    expect(result.payload.wallets.families.evm.status).toBe("working");
    expect(result.payload.wallets.families.bittensor.signing).toBe("external_signer");
    expect(result.payload.wallets.families.sui.status).toBe("unsupported");
    expect(result.payload.wallets.families.sui.details.recommendedPackages).toContain("@mysten/dapp-kit-react");
    expect(result.payload.wallets.families.sui.actions[0].href).toBe("https://sdk.mystenlabs.com/dapp-kit/getting-started/react");
    expect(result.payload.security.cors.status).toBe("needs_setup");
    expect(result.payload.security.memoryWriteGuards.status).toBe("working");
    expect(result.payload.settings.map((section: { section: string }) => section.section)).toContain("wallet");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
  });

  test("GET /workspace/:id/backend/data-map returns sanitized storage locations", async () => {
    const { base, dir } = await boot();

    const result = await jsonFetch(base, "/workspace/ws_backend/backend/data-map");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.version).toBe("matterhorn.backend.data-map.v1");
    expect(result.payload.workspace.id).toBe("ws_backend");
    expect(result.payload.stores.notes.scope).toBe("workspace");
    expect(result.payload.stores.notes.paths).toContain(join(dir, "notes"));
    expect(result.payload.stores.memory.scope).toBe("machine_global");
    expect(result.payload.stores.memory.paths[0]).toBe(join(dir, "memory"));
    expect(result.payload.stores.chat.scope).toBe("opencode_runtime");
    expect(result.payload.stores.outputs.path).toBe(join(dir, "outputs"));
    expect(result.payload.stores.feedback.scope).toBe("machine_global");
    expect(result.payload.stores.feedback.path).toBe(join(dir, "openwork-data", "feedback", "ws_backend.jsonl"));
    expect(result.payload.stores.feedback.containsSecrets).toBe("redacted");
    expect(result.payload.policy.trainingUse).toBe("none_by_default");

    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);
    expect(serialized).not.toMatch(/privateKey|seed phrase|mnemonic|wallet export/i);
  });

  test("memory write routes require collaborator scope and audit successful writes", async () => {
    const { base } = await boot();
    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Read-only tester" }),
    });
    expect(viewer.response.status).toBe(201);

    const denied = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws_backend", record: record({ id: "mem_backend_denied" }) }),
    }, viewer.payload.token);
    expect(denied.response.status).toBe(403);
    expect(denied.payload.code).toBe("forbidden");

    const captured = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws_backend", record: record() }),
    });
    expect(captured.response.status).toBe(200);
    expect(captured.payload.success).toBe(true);

    const audit = await jsonFetch(base, "/workspace/ws_backend/audit?limit=5");
    expect(audit.response.status).toBe(200);
    expect(audit.payload.items.map((item: { action: string }) => item.action)).toContain("memory.capture");
  });

  test("memory writes are blocked when the server is read-only", async () => {
    const { base } = await boot({ readOnly: true });

    const captured = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "ws_backend", record: record({ id: "mem_backend_read_only" }) }),
    });
    expect(captured.response.status).toBe(403);
    expect(captured.payload.code).toBe("read_only");
  });
});
