import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer as createHttpServer, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

type StartServer = (config: ServerConfig) => Promise<Served>;

const TOKEN = "owt_market_sign_route_token";
const HOST_TOKEN = "owt_market_sign_route_host_token";

const priorEnv = {
  hyperliquidInfoUrl: process.env.HYPERLIQUID_INFO_URL,
  polymarketGammaUrl: process.env.POLYMARKET_GAMMA_URL,
  polymarketClobUrl: process.env.POLYMARKET_CLOB_URL,
  polymarketGeoblockUrl: process.env.POLYMARKET_GEOBLOCK_URL,
  envStore: process.env.OPENWORK_ENV_STORE,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
};

const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];
let mockProvider: { base: string; calls: () => number; stop: () => Promise<void> };
let startServer: StartServer;

function configureMockProviderEnv(): void {
  process.env.HYPERLIQUID_INFO_URL = `${mockProvider.base}/hyperliquid/info`;
  process.env.POLYMARKET_GAMMA_URL = `${mockProvider.base}/gamma`;
  process.env.POLYMARKET_CLOB_URL = `${mockProvider.base}/clob`;
  process.env.POLYMARKET_GEOBLOCK_URL = `${mockProvider.base}/geoblock`;
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
  });
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

async function createMockProvider(): Promise<{
  base: string;
  calls: () => number;
  stop: () => Promise<void>;
}> {
  let callCount = 0;
  const server = createHttpServer((_req, res) => {
    callCount += 1;
    jsonResponse(res, 500, { error: "legacy_route_must_not_contact_provider" });
  });
  const port = await listen(server);
  return {
    base: `http://127.0.0.1:${port}`,
    calls: () => callCount,
    stop: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

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

async function boot(): Promise<{ base: string }> {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-market-airlock-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  configureMockProviderEnv();
  const server = await startServer(baseConfig(await getFreePort()));
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}` };
}

async function post(
  base: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json() as Record<string, unknown>,
  };
}

beforeAll(async () => {
  mockProvider = await createMockProvider();
  configureMockProviderEnv();
  ({ startServer } = await import("./server.js"));
});

afterAll(async () => {
  while (stops.length) await stops.pop()?.();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  await mockProvider?.stop();
  for (const [key, value] of Object.entries({
    HYPERLIQUID_INFO_URL: priorEnv.hyperliquidInfoUrl,
    POLYMARKET_GAMMA_URL: priorEnv.polymarketGammaUrl,
    POLYMARKET_CLOB_URL: priorEnv.polymarketClobUrl,
    POLYMARKET_GEOBLOCK_URL: priorEnv.polymarketGeoblockUrl,
    OPENWORK_ENV_STORE: priorEnv.envStore,
    OPENWORK_TOKEN_STORE: priorEnv.tokenStore,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("retired market external-signing routes", () => {
  test("fail closed behind the connected-wallet airlock without provider traffic", async () => {
    const { base } = await boot();
    const routes = [
      "/api/hyperliquid/orders/external-sign-request",
      "/api/hyperliquid/orders/external-artifact/validate",
      "/api/polymarket/orders/external-sign-request",
      "/api/polymarket/orders/external-artifact/validate",
    ];

    for (const path of routes) {
      const result = await post(base, path, {
        privateKey: "must-never-be-processed",
        signature: `0x${"a".repeat(130)}`,
        signedPayload: `0x${"b".repeat(130)}`,
      });
      expect(result.status).toBe(409);
      expect(result.payload.code).toBe("wallet_airlock_required");
      const serialized = JSON.stringify(result.payload);
      expect(serialized).not.toContain("must-never-be-processed");
      expect(serialized).not.toContain("a".repeat(130));
      expect(serialized).not.toContain("b".repeat(130));
    }

    expect(mockProvider.calls()).toBe(0);
  });
});
