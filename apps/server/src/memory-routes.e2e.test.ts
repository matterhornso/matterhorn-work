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

const TOKEN = "owt_memory_routes_token";
const HOST_TOKEN = "owt_memory_routes_host_token";
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function baseConfig(port: number): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
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

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-memory-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
  const server = await startServer(baseConfig(await getFreePort())) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
}

function record(overrides: Record<string, unknown> = {}) {
  const now = new Date("2026-06-22T00:00:00.000Z").toISOString();
  return {
    id: "mem_route_tao_wallet",
    kind: "protocol_address",
    scope: "workspace",
    title: "Main TAO wallet",
    summary: "Public SS58 address label for TAO balance checks.",
    body: {
      ss58Address: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1routeFixture",
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

async function jsonFetch(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  for (const [key, value] of Object.entries(priorEnv)) {
    if (value === undefined) {
      delete process.env[key === "memoryRoot" ? "MATTERHORN_WORK_MEMORY_ROOT" : key === "envStore" ? "OPENWORK_ENV_STORE" : "OPENWORK_TOKEN_STORE"];
    }
  }
  if (priorEnv.envStore !== undefined) process.env.OPENWORK_ENV_STORE = priorEnv.envStore;
  if (priorEnv.tokenStore !== undefined) process.env.OPENWORK_TOKEN_STORE = priorEnv.tokenStore;
  if (priorEnv.memoryRoot !== undefined) process.env.MATTERHORN_WORK_MEMORY_ROOT = priorEnv.memoryRoot;
});

describe("Matterhorn memory API routes", () => {
  test("capture, search, update, export, and forget records", async () => {
    const { base, dir } = await boot();

    const captured = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({ record: record() }),
    });
    expect(captured.response.status).toBe(200);
    expect(captured.payload.success).toBe(true);
    expect(captured.payload.record.id).toBe("mem_route_tao_wallet");
    expect(captured.payload.markdownPath).toContain("Protocols/Bittensor");

    const marketCapture = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({
        record: record({
          id: "mem_route_hyperliquid_watch",
          kind: "watchlist",
          title: "Hyperliquid BTC watch",
          summary: "Watch BTC funding and price movement without enabling execution.",
          body: { market: "BTC", watch: "funding and price movement" },
          tags: ["hyperliquid", "watchlist"],
          canExport: false,
        }),
      }),
    });
    expect(marketCapture.response.status).toBe(200);

    const search = await jsonFetch(base, "/api/memory/search?q=TAO&tags=bittensor&limit=5");
    expect(search.response.status).toBe(200);
    expect(search.payload.count).toBe(1);
    expect(search.payload.records[0].title).toBe("Main TAO wallet");

    const marketSearch = await jsonFetch(base, "/api/memory/search?tags=hyperliquid&limit=5");
    expect(marketSearch.response.status).toBe(200);
    expect(marketSearch.payload.count).toBe(1);

    const marketMcpSearch = await jsonFetch(base, "/api/memory/search?tags=hyperliquid&surface=mcp&limit=5");
    expect(marketMcpSearch.response.status).toBe(200);
    expect(marketMcpSearch.payload.count).toBe(0);

    const marketMcpGet = await jsonFetch(base, "/api/memory/entities/mem_route_hyperliquid_watch?surface=mcp");
    expect(marketMcpGet.response.status).toBe(403);
    expect(marketMcpGet.payload.code).toBe("memory_policy_blocks_mcp_api");

    const fetched = await jsonFetch(base, "/api/memory/entities/mem_route_tao_wallet");
    expect(fetched.response.status).toBe(200);
    expect(fetched.payload.record.body.netuid).toBe(14);

    const updated = await jsonFetch(base, "/api/memory/entities/mem_route_tao_wallet", {
      method: "PATCH",
      body: JSON.stringify({ patch: { summary: "Updated public TAO wallet label." } }),
    });
    expect(updated.response.status).toBe(200);
    expect(updated.payload.record.summary).toContain("Updated");

    const exported = await jsonFetch(base, "/api/memory/export", {
      method: "POST",
      body: JSON.stringify({ outputDir: join(dir, "memory-export") }),
    });
    expect(exported.response.status).toBe(200);
    expect(exported.payload.export.recordCount).toBe(1);
    expect(exported.payload.export.sha256).toHaveLength(64);

    const forgotten = await jsonFetch(base, "/api/memory/forget", {
      method: "POST",
      body: JSON.stringify({ id: "mem_route_tao_wallet", reason: "test cleanup" }),
    });
    expect(forgotten.response.status).toBe(200);
    expect(forgotten.payload.forgotten).toBe(true);

    const afterForget = await jsonFetch(base, "/api/memory/entities/mem_route_tao_wallet");
    expect(afterForget.response.status).toBe(404);
  });

  test("rejects forbidden secret material before writing", async () => {
    const { base } = await boot();
    const rejected = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({
        record: record({
          id: "mem_route_secret_rejected",
          body: { privateKey: "0xabc" },
        }),
      }),
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.payload.code).toBe("memory_safety_rejected");
  });

  test("rejects records that violate desk policy flags", async () => {
    const { base } = await boot();
    const rejected = await jsonFetch(base, "/api/memory/capture", {
      method: "POST",
      body: JSON.stringify({
        record: record({
          id: "mem_route_market_export_rejected",
          kind: "watchlist",
          title: "Hyperliquid export violation",
          summary: "This market memory tries to enable export.",
          body: { market: "BTC" },
          tags: ["hyperliquid"],
          canExport: true,
        }),
      }),
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.payload.code).toBe("memory_safety_rejected");
  });
});
