import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
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
const POLYMARKET_EXCHANGE_ADDRESS = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";

const priorEnv = {
  hyperliquidInfoUrl: process.env.HYPERLIQUID_INFO_URL,
  polymarketGammaUrl: process.env.POLYMARKET_GAMMA_URL,
  polymarketClobUrl: process.env.POLYMARKET_CLOB_URL,
  polymarketGeoblockUrl: process.env.POLYMARKET_GEOBLOCK_URL,
  polymarketExchangeAddress: process.env.POLYMARKET_EXCHANGE_ADDRESS,
  polymarketChainId: process.env.POLYMARKET_CHAIN_ID,
  envStore: process.env.OPENWORK_ENV_STORE,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
};

const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];
let mockProvider: { base: string; stop: () => Promise<void> };
let startServer: StartServer;

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
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

async function createMockProvider(): Promise<{ base: string; stop: () => Promise<void> }> {
  const server = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "POST" && url.pathname === "/hyperliquid/info") {
      const body = await readJson(req);
      if (body.type === "meta") {
        return jsonResponse(res, 200, { universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 50, onlyIsolated: false }] });
      }
      if (body.type === "allMids") {
        return jsonResponse(res, 200, { BTC: "65100" });
      }
      if (body.type === "l2Book") {
        return jsonResponse(res, 200, {
          levels: [
            [{ px: "65000", sz: "1.2" }],
            [{ px: "65100", sz: "1.1" }],
          ],
        });
      }
      if (body.type === "metaAndAssetCtxs") {
        return jsonResponse(res, 200, [
          { universe: [{ name: "BTC", szDecimals: 5, maxLeverage: 50, onlyIsolated: false }] },
          [{ funding: "0.001", premium: "0", openInterest: "1000", oraclePx: "65000", markPx: "65100", prevDayPx: "64000", dayNtlVlm: "1000000" }],
        ]);
      }
      return jsonResponse(res, 400, { error: "unknown_hyperliquid_info_type", type: body.type });
    }

    if (req.method === "GET" && url.pathname === "/gamma/markets/pm-test") {
      return jsonResponse(res, 200, {
        id: "pm-test",
        question: "Will test AI adoption exceed expectations?",
        slug: "test-ai-adoption",
        outcomes: JSON.stringify(["Yes", "No"]),
        outcomePrices: JSON.stringify(["0.6", "0.4"]),
        clobTokenIds: JSON.stringify(["yes-token", "no-token"]),
        volume: "50000",
        liquidity: "10000",
        active: true,
        closed: false,
        endDate: "2027-01-01T00:00:00.000Z",
      });
    }

    if (req.method === "GET" && url.pathname === "/clob/book") {
      return jsonResponse(res, 200, {
        market: "pm-test",
        bids: [{ price: "0.59", size: "100" }],
        asks: [{ price: "0.61", size: "120" }],
      });
    }

    if (req.method === "GET" && url.pathname === "/geoblock") {
      return jsonResponse(res, 200, { blocked: false, country: "TEST" });
    }

    return jsonResponse(res, 404, { error: "not_found", path: url.pathname });
  });
  const port = await listen(server);
  return {
    base: `http://127.0.0.1:${port}`,
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
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-market-sign-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  const server = await startServer(baseConfig(await getFreePort()));
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}` };
}

async function post(base: string, path: string, body: Record<string, unknown>): Promise<{ status: number; payload: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as Record<string, unknown>;
  return { status: response.status, payload };
}

function publicArtifact(signRequest: Record<string, unknown>, venue: "hyperliquid" | "polymarket"): Record<string, unknown> {
  return {
    version: "matterhorn.market.redacted-signed-artifact-envelope.v1",
    venue,
    routeName: signRequest.routeName,
    validationMode: "public_redacted_metadata",
    executionMode: "testnet_external_signer",
    network: signRequest.network,
    action: signRequest.action,
    signRequestSha256: signRequest.signRequestSha256,
    previewSha256: signRequest.previewSha256,
    handoffSha256: signRequest.handoffSha256,
    unsignedPayloadSha256: signRequest.unsignedPayloadSha256,
    signedArtifactPublicHash: "c".repeat(64),
    signedArtifactRedacted: true,
    signerAddress: "0x0000000000000000000000000000000000000001",
    artifactKind: venue === "hyperliquid" ? "wallet_signed_action" : "clob_order",
    producedAt: new Date().toISOString(),
    canSubmit: false,
    liveSubmissionEnabled: false,
    warnings: [],
  };
}

function expectSignRequest(payload: Record<string, unknown>, venue: "hyperliquid" | "polymarket"): Record<string, unknown> {
  expect(payload.success).toBe(true);
  const signRequest = payload.signRequest as Record<string, unknown>;
  expect(signRequest.version).toBe("matterhorn.market.external-sign-request.v1");
  expect(signRequest.venue).toBe(venue);
  expect(signRequest.executionMode).toBe("testnet_external_signer");
  expect(signRequest.network).toBe("testnet");
  expect(signRequest.canSubmit).toBe(false);
  expect(signRequest.liveSubmissionEnabled).toBe(false);
  expect(signRequest.submitSignedAllowedByContract).toBe(false);
  expect(signRequest.signedArtifactAccepted).toBe(false);
  expect(JSON.stringify(payload)).not.toMatch(/"canSubmit"\s*:\s*true|rawSignature|apiSecret|privateKey/i);
  return signRequest;
}

function expectAcceptedValidation(payload: Record<string, unknown>, venue: "hyperliquid" | "polymarket"): void {
  expect(payload.success).toBe(true);
  const validation = payload.validation as Record<string, unknown>;
  expect(validation.status).toBe("accepted_public_metadata");
  expect(validation.venue).toBe(venue);
  expect(validation.matchesSignRequest).toBe(true);
  expect(validation.canSubmit).toBe(false);
  expect(validation.signedArtifactAccepted).toBe(false);
  expect(validation.submitSignedAllowedByContract).toBe(false);
  expect((payload.receiptCandidate as { version?: string }).version).toBe("matterhorn.market.receipt.v1");
  expect(JSON.stringify(payload)).not.toMatch(/"canSubmit"\s*:\s*true|rawSignature|apiSecret|privateKey/i);
}

beforeAll(async () => {
  mockProvider = await createMockProvider();
  process.env.HYPERLIQUID_INFO_URL = `${mockProvider.base}/hyperliquid/info`;
  process.env.POLYMARKET_GAMMA_URL = `${mockProvider.base}/gamma`;
  process.env.POLYMARKET_CLOB_URL = `${mockProvider.base}/clob`;
  process.env.POLYMARKET_GEOBLOCK_URL = `${mockProvider.base}/geoblock`;
  process.env.POLYMARKET_EXCHANGE_ADDRESS = POLYMARKET_EXCHANGE_ADDRESS;
  process.env.POLYMARKET_CHAIN_ID = "80002";
  ({ startServer } = await import("./server.js"));
});

afterAll(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  await mockProvider?.stop();
  for (const [key, value] of Object.entries({
    HYPERLIQUID_INFO_URL: priorEnv.hyperliquidInfoUrl,
    POLYMARKET_GAMMA_URL: priorEnv.polymarketGammaUrl,
    POLYMARKET_CLOB_URL: priorEnv.polymarketClobUrl,
    POLYMARKET_GEOBLOCK_URL: priorEnv.polymarketGeoblockUrl,
    POLYMARKET_EXCHANGE_ADDRESS: priorEnv.polymarketExchangeAddress,
    POLYMARKET_CHAIN_ID: priorEnv.polymarketChainId,
    OPENWORK_ENV_STORE: priorEnv.envStore,
    OPENWORK_TOKEN_STORE: priorEnv.tokenStore,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("market sign-request and artifact validation routes", () => {
  test("creates testnet external sign requests and validates only public/redacted artifact metadata", async () => {
    const { base } = await boot();

    const hyperliquidSign = await post(base, "/api/hyperliquid/orders/external-sign-request", {
      asset: "BTC",
      side: "buy",
      size: 0.1,
      price: 65000,
      executionMode: "testnet_external_signer",
    });
    expect(hyperliquidSign.status).toBe(200);
    const hyperliquidSignRequest = expectSignRequest(hyperliquidSign.payload, "hyperliquid");
    const hyperliquidValidation = await post(base, "/api/hyperliquid/orders/external-artifact/validate", {
      signRequest: hyperliquidSignRequest,
      artifact: publicArtifact(hyperliquidSignRequest, "hyperliquid"),
    });
    expect(hyperliquidValidation.status).toBe(200);
    expectAcceptedValidation(hyperliquidValidation.payload, "hyperliquid");

    const hyperliquidMismatch = await post(base, "/api/hyperliquid/orders/external-artifact/validate", {
      signRequest: hyperliquidSignRequest,
      artifact: { ...publicArtifact(hyperliquidSignRequest, "hyperliquid"), previewSha256: "e".repeat(64) },
    });
    expect(hyperliquidMismatch.status).toBe(200);
    expect(hyperliquidMismatch.payload.success).toBe(false);
    expect((hyperliquidMismatch.payload.validation as { status?: string }).status).toBe("rejected");
    expect((hyperliquidMismatch.payload.receiptCandidate ?? null)).toBeNull();

    const hyperliquidRaw = await post(base, "/api/hyperliquid/orders/external-artifact/validate", {
      signRequest: hyperliquidSignRequest,
      artifact: { ...publicArtifact(hyperliquidSignRequest, "hyperliquid"), signature: "0x" + "a".repeat(130) },
    });
    expect(hyperliquidRaw.status).toBe(400);
    expect(JSON.stringify(hyperliquidRaw.payload)).toContain("market_secret_rejected");

    const polymarketSign = await post(base, "/api/polymarket/orders/external-sign-request", {
      marketId: "pm-test",
      side: "yes",
      amountUsdc: 10,
      executionMode: "testnet_external_signer",
    });
    expect(polymarketSign.status).toBe(200);
    const polymarketSignRequest = expectSignRequest(polymarketSign.payload, "polymarket");
    const polymarketValidation = await post(base, "/api/polymarket/orders/external-artifact/validate", {
      signRequest: polymarketSignRequest,
      artifact: publicArtifact(polymarketSignRequest, "polymarket"),
    });
    expect(polymarketValidation.status).toBe(200);
    expectAcceptedValidation(polymarketValidation.payload, "polymarket");

    const polymarketMismatch = await post(base, "/api/polymarket/orders/external-artifact/validate", {
      signRequest: polymarketSignRequest,
      artifact: { ...publicArtifact(polymarketSignRequest, "polymarket"), handoffSha256: "e".repeat(64) },
    });
    expect(polymarketMismatch.status).toBe(200);
    expect(polymarketMismatch.payload.success).toBe(false);
    expect((polymarketMismatch.payload.validation as { status?: string }).status).toBe("rejected");
    expect((polymarketMismatch.payload.receiptCandidate ?? null)).toBeNull();

    const polymarketSecretSignRequest = await post(base, "/api/polymarket/orders/external-sign-request", {
      marketId: "pm-test",
      side: "yes",
      amountUsdc: 10,
      executionMode: "testnet_external_signer",
      privateKey: "redacted-test-private-key",
    });
    expect(polymarketSecretSignRequest.status).toBe(400);
    expect(JSON.stringify(polymarketSecretSignRequest.payload)).toContain("market_secret_rejected");

    const polymarketRaw = await post(base, "/api/polymarket/orders/external-artifact/validate", {
      signRequest: polymarketSignRequest,
      artifact: { ...publicArtifact(polymarketSignRequest, "polymarket"), signedPayload: "0x" + "a".repeat(130) },
    });
    expect(polymarketRaw.status).toBe(400);
    expect(JSON.stringify(polymarketRaw.payload)).toContain("market_secret_rejected");
  });
});
