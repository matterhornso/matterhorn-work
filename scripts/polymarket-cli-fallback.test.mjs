#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const token = "test-client-token";
const marketId = "0xmarket-ai";
const tokenId = "token-yes";
const cliPath = join(repoRoot, "apps/orchestrator/src/cli.ts");

const MARKET = { id: marketId, question: "Will an AI model pass the bar exam by 2027?", outcomes: ["Yes", "No"], outcomePrices: { Yes: 0.62, No: 0.38 }, tokenIds: { Yes: tokenId, No: "token-no" } };

function readJson(req) {
  return new Promise((resolveBody) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolveBody(raw ? JSON.parse(raw) : {}); } catch { resolveBody({}); }
    });
  });
}

function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function listen(server) {
  return new Promise((resolvePort) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolvePort(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
}

async function createMockServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJson(req);
    requests.push({ method: req.method, path: url.pathname, query: url.search, body });

    if (req.headers.authorization !== `Bearer ${token}`) return writeJson(res, 401, { error: "unauthorized" });

    if (req.method === "GET" && url.pathname === "/api/polymarket/markets") {
      return writeJson(res, 200, { success: true, markets: [MARKET] });
    }
    if (req.method === "GET" && url.pathname === "/api/polymarket/events") {
      return writeJson(res, 200, { success: true, events: [{ id: "evt-ai", title: "AI milestones", marketCount: 1, markets: [MARKET] }] });
    }
    if (req.method === "GET" && url.pathname === `/api/polymarket/markets/${marketId}`) {
      return writeJson(res, 200, { success: true, market: MARKET });
    }
    if (req.method === "GET" && url.pathname === `/api/polymarket/orderbook/${tokenId}`) {
      return writeJson(res, 200, { success: true, orderbook: { tokenId, outcome: "Yes", bestBid: 0.61, bestAsk: 0.63, midpoint: 0.62, warnings: [] } });
    }
    if (req.method === "GET" && url.pathname === "/api/polymarket/compliance") {
      return writeJson(res, 200, { success: true, compliance: { status: "allowed", reason: null } });
    }
    if (req.method === "POST" && url.pathname === "/api/polymarket/orders/preview") {
      if ("apiSecret" in body || "privateKey" in body || "signedPayload" in body) return writeJson(res, 400, { error: "market_secret_rejected" });
      return writeJson(res, 200, { success: true, preview: { venue: "polymarket", marketId: body.marketId, side: body.side, size: body.amountUsdc, canSubmit: false, previewSha256: "a".repeat(64) } });
    }
    if (req.method === "POST" && url.pathname === "/api/polymarket/chat/execute") {
      return writeJson(res, 200, { success: true, venue: "polymarket", execution: "read_only", responseText: "Polymarket read ready.", cards: [] });
    }
    return writeJson(res, 404, { error: "not_found", path: url.pathname });
  });
  const port = await listen(server);
  return { server, requests, url: `http://127.0.0.1:${port}` };
}

function runCli(serverUrl, args) {
  const bun = process.env.BUN_BIN || "bun";
  const cliArgs = [cliPath, ...args, "--openwork-url", serverUrl, "--token", token, "--json"];
  return new Promise((resolveResult) => {
    const child = spawn(bun, cliArgs, { cwd: repoRoot, env: { ...process.env, OPENWORK_DEV_MODE: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolveResult({ code, stdout, stderr }));
  });
}

function parseJsonOutput(result) {
  try {
    return JSON.parse(result.stdout.trim());
  } catch (error) {
    throw new Error(`Could not parse CLI JSON. stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)} error=${error.message}`);
  }
}

async function expectCli(label, serverUrl, args, validate) {
  const result = await runCli(serverUrl, args);
  if (result.code !== 0) throw new Error(`${label} exited ${result.code}. stdout=${result.stdout} stderr=${result.stderr}`);
  const payload = parseJsonOutput(result);
  validate(payload);
  console.log(`PASS ${label}`);
  return payload;
}

async function main() {
  if (!existsSync(cliPath)) throw new Error(`CLI source not found at ${cliPath}`);
  const mock = await createMockServer();
  try {
    await expectCli("polymarket markets", mock.url, ["polymarket", "markets", "--query", "AI", "--limit", "5"], (payload) => {
      if (!Array.isArray(payload.markets) || payload.markets[0]?.id !== marketId) throw new Error("markets payload missing market");
    });

    await expectCli("polymarket events", mock.url, ["polymarket", "events", "--query", "AI"], (payload) => {
      if (!Array.isArray(payload.events) || payload.events[0]?.marketCount !== 1) throw new Error("events payload missing event");
    });

    await expectCli("polymarket market", mock.url, ["polymarket", "market", "--market-id", marketId], (payload) => {
      if (payload.market?.id !== marketId) throw new Error("market detail mismatch");
    });

    await expectCli("polymarket orderbook", mock.url, ["polymarket", "orderbook", "--token-id", tokenId], (payload) => {
      if (payload.orderbook?.tokenId !== tokenId) throw new Error("orderbook token mismatch");
    });

    await expectCli("polymarket compliance", mock.url, ["polymarket", "compliance"], (payload) => {
      if (payload.compliance?.status !== "allowed") throw new Error("compliance status mismatch");
    });

    await expectCli("polymarket preview-order", mock.url, ["polymarket", "preview-order", "--market-id", marketId, "--side", "yes", "--amount-usdc", "10"], (payload) => {
      if (payload.preview?.venue !== "polymarket") throw new Error("preview venue mismatch");
      if (payload.preview?.canSubmit !== false) throw new Error("preview must be canSubmit=false");
    });

    await expectCli("pm chat alias", mock.url, ["pm", "chat", "--message", "find markets about AI"], (payload) => {
      if (payload.venue !== "polymarket") throw new Error("chat venue mismatch");
    });

    const secretResult = await runCli(mock.url, ["polymarket", "preview-order", "--market-id", marketId, "--amount-usdc", "10", "--api-secret", "do-not-accept"]);
    if (secretResult.code === 0) throw new Error("credential-shaped polymarket CLI flag was accepted");
    const secretPayload = parseJsonOutput(secretResult);
    if (!/not accepted/i.test(String(secretPayload.error ?? ""))) throw new Error(`unexpected credential rejection output: ${JSON.stringify(secretPayload)}`);
    console.log("PASS polymarket secret flag rejection");
  } finally {
    await new Promise((resolveClose) => mock.server.close(resolveClose));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
