#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const token = "test-client-token";
const cliPath = join(repoRoot, "apps/orchestrator/src/cli.ts");

const FORBIDDEN_ROUTE_RE = /\/orders\/(submit|sign)|\/exchange\/submit/i;

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

/** Infer a venue from the prompt when the caller asked the router to decide (venue=auto). */
function inferVenue(message, venue) {
  if (venue && venue !== "auto") return venue;
  const text = String(message || "").toLowerCase();
  if (/hyperliquid|funding|btc|perp/.test(text)) return "hyperliquid";
  if (/polymarket|prediction|election/.test(text)) return "polymarket";
  if (/bittensor|tao|subnet/.test(text)) return "bittensor";
  return "auto";
}

async function createMockServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJson(req);
    requests.push({ method: req.method, path: url.pathname, body });

    if (req.headers.authorization !== `Bearer ${token}`) return writeJson(res, 401, { error: "unauthorized" });

    if (req.method === "POST" && url.pathname === "/api/crypto/chat/execute") {
      if ("apiSecret" in body || "privateKey" in body || "signedPayload" in body || "walletExport" in body) {
        return writeJson(res, 400, { error: "market_secret_rejected" });
      }
      const venue = inferVenue(body.message, body.venue);
      return writeJson(res, 200, {
        success: true,
        venue,
        execution: "read_only",
        responseText: `Unified crypto router handled venue=${venue}.`,
        cards: [],
        sharedCards: [
          {
            version: "matterhorn.crypto.shared-card.v1",
            kind: "discovery",
            venue,
            title: `${venue} discovery`,
            summary: `Read-only discovery context from ${venue}.`,
            status: "success",
            originalKind: `${venue}_market_list`,
            source: { source: `mock.${venue}` },
            warnings: [],
            data: { kind: `${venue}_market_list`, title: `${venue} discovery` },
            safety: { nonCustodial: true, liveSubmissionEnabled: false, canSubmit: false },
          },
        ],
        warnings: [],
      });
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
    // 1. crypto chat routes an auto prompt to Hyperliquid and stays read-only.
    await expectCli(
      "crypto chat auto -> hyperliquid",
      mock.url,
      ["crypto", "chat", "--message", "show BTC Hyperliquid funding", "--venue", "auto", "--asset", "BTC"],
      (payload) => {
        if (payload.venue !== "hyperliquid") throw new Error(`expected venue hyperliquid, got ${payload.venue}`);
        if (payload.execution !== "read_only") throw new Error(`expected execution read_only, got ${payload.execution}`);
        if (!Array.isArray(payload.sharedCards) || payload.sharedCards.length === 0) throw new Error("expected sharedCards in response");
        if (payload.sharedCards[0].version !== "matterhorn.crypto.shared-card.v1") throw new Error("expected versioned sharedCards");
        if (payload.sharedCards[0].kind !== "discovery") throw new Error("expected sharedCards kind discovery");
        if (payload.sharedCards[0].safety?.canSubmit !== false) throw new Error("expected sharedCards safety.canSubmit=false");
      },
    );

    // 2. market alias + ask subcommand routes an explicit Polymarket venue.
    await expectCli(
      "market ask -> polymarket",
      mock.url,
      ["market", "ask", "--message", "find Polymarket markets about AI", "--venue", "polymarket", "--limit", "5"],
      (payload) => {
        if (payload.venue !== "polymarket") throw new Error(`expected venue polymarket, got ${payload.venue}`);
      },
    );

    // 3. Credential-shaped flags are rejected before the CLI ever calls the server.
    const requestsBefore = mock.requests.length;
    const secretResult = await runCli(mock.url, ["crypto", "chat", "--message", "show BTC funding", "--api-secret", "do-not-accept"]);
    if (secretResult.code === 0) throw new Error("credential-shaped crypto CLI flag was accepted");
    const secretPayload = parseJsonOutput(secretResult);
    if (!/not accepted/i.test(String(secretPayload.error ?? ""))) {
      throw new Error(`unexpected credential rejection output: ${JSON.stringify(secretPayload)}`);
    }
    if (mock.requests.length !== requestsBefore) throw new Error("secret-flag request reached the server; rejection must happen client-side first");
    console.log("PASS crypto secret flag rejection (no server call)");

    // 4. No request touched a submit/sign/exchange route.
    for (const entry of mock.requests) {
      if (FORBIDDEN_ROUTE_RE.test(entry.path)) throw new Error(`crypto CLI reached a forbidden route: ${entry.path}`);
      if (entry.path !== "/api/crypto/chat/execute") throw new Error(`crypto CLI reached an unexpected route: ${entry.path}`);
    }
    console.log("PASS crypto CLI never touched submit/sign/exchange routes");
  } finally {
    await new Promise((resolveClose) => mock.server.close(resolveClose));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
