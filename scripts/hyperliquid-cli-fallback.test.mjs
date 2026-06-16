#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const token = "test-client-token";
const address = "0x0000000000000000000000000000000000000001";
const cliPath = join(repoRoot, "apps/orchestrator/src/cli.ts");

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
}

async function createMockServer() {
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJson(req);
    requests.push({ method: req.method, path: url.pathname, query: url.search, body });

    if (req.headers.authorization !== `Bearer ${token}`) {
      return writeJson(res, 401, { error: "unauthorized" });
    }

    if (req.method === "GET" && url.pathname === "/api/hyperliquid/markets") {
      return writeJson(res, 200, {
        success: true,
        markets: [
          { asset: "BTC", markPx: 65000, source: { source: "hyperliquid.info", freshness: "mock" } },
          { asset: "ETH", markPx: 3500, source: { source: "hyperliquid.info", freshness: "mock" } },
        ],
      });
    }

    if (req.method === "GET" && url.pathname === `/api/hyperliquid/account/${address}`) {
      return writeJson(res, 200, {
        success: true,
        account: { address, positionCount: 1, openOrderCount: 0, warnings: [] },
      });
    }

    if (req.method === "GET" && url.pathname === "/api/hyperliquid/orderbook/BTC") {
      return writeJson(res, 200, {
        success: true,
        orderbook: {
          asset: "BTC",
          bids: [{ price: 64999, size: 1 }],
          asks: [{ price: 65001, size: 1 }],
          warnings: [],
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/hyperliquid/orders/preview") {
      if ("apiSecret" in body || "privateKey" in body || "signedPayload" in body) {
        return writeJson(res, 400, { error: "credential_rejected" });
      }
      return writeJson(res, 200, {
        success: true,
        preview: {
          venue: "hyperliquid",
          asset: body.asset,
          side: body.side,
          size: body.size,
          price: body.price,
          reduceOnly: body.reduceOnly === true,
          canSubmit: false,
          previewSha256: "a".repeat(64),
        },
      });
    }

    if (req.method === "POST" && url.pathname === "/api/hyperliquid/chat/execute") {
      return writeJson(res, 200, {
        success: true,
        venue: "hyperliquid",
        execution: "unsigned_preview",
        responseText: "Hyperliquid preview ready.",
        preview: {
          venue: "hyperliquid",
          asset: body.asset ?? "BTC",
          canSubmit: false,
          previewSha256: "b".repeat(64),
        },
      });
    }

    return writeJson(res, 404, { error: "not_found", path: url.pathname });
  });
  const port = await listen(server);
  return { server, requests, url: `http://127.0.0.1:${port}` };
}

function runCli(serverUrl, args) {
  const bun = process.env.BUN_BIN || "bun";
  const cliArgs = [
    cliPath,
    ...args,
    "--openwork-url",
    serverUrl,
    "--token",
    token,
    "--json",
  ];
  return new Promise((resolve) => {
    const child = spawn(bun, cliArgs, {
      cwd: repoRoot,
      env: { ...process.env, OPENWORK_DEV_MODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
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
  if (result.code !== 0) {
    throw new Error(`${label} exited ${result.code}. stdout=${result.stdout} stderr=${result.stderr}`);
  }
  const payload = parseJsonOutput(result);
  validate(payload);
  console.log(`PASS ${label}`);
  return payload;
}

async function main() {
  if (!existsSync(cliPath)) {
    throw new Error(`CLI source not found at ${cliPath}`);
  }

  const mock = await createMockServer();
  try {
    await expectCli("hyperliquid markets", mock.url, ["hyperliquid", "markets", "--limit", "2"], (payload) => {
      if (!Array.isArray(payload.markets) || payload.markets[0]?.asset !== "BTC") {
        throw new Error("markets payload missing BTC");
      }
    });

    await expectCli("hyperliquid account", mock.url, ["hyperliquid", "account", "--address", address], (payload) => {
      if (payload.account?.address !== address) throw new Error("account address mismatch");
    });

    await expectCli("hyperliquid orderbook", mock.url, ["hyperliquid", "orderbook", "--asset", "BTC"], (payload) => {
      if (payload.orderbook?.asset !== "BTC") throw new Error("orderbook asset mismatch");
    });

    await expectCli(
      "hyperliquid preview-order",
      mock.url,
      ["hyperliquid", "preview-order", "--asset", "BTC", "--side", "buy", "--size", "0.1", "--price", "65000"],
      (payload) => {
        if (payload.preview?.venue !== "hyperliquid") throw new Error("preview venue mismatch");
        if (payload.preview?.canSubmit !== false) throw new Error("preview must be canSubmit=false");
      },
    );

    await expectCli(
      "hl chat alias",
      mock.url,
      ["hl", "chat", "--message", "preview buying 0.1 BTC at 65000", "--asset", "BTC", "--side", "buy", "--size", "0.1", "--price", "65000"],
      (payload) => {
        if (payload.venue !== "hyperliquid") throw new Error("chat venue mismatch");
        if (payload.preview?.canSubmit !== false) throw new Error("chat preview must be canSubmit=false");
      },
    );

    const secretResult = await runCli(mock.url, [
      "hyperliquid",
      "preview-order",
      "--asset",
      "BTC",
      "--side",
      "buy",
      "--size",
      "0.1",
      "--api-secret",
      "do-not-accept",
    ]);
    if (secretResult.code === 0) {
      throw new Error("credential-shaped hyperliquid CLI flag was accepted");
    }
    const secretPayload = parseJsonOutput(secretResult);
    if (!/not accepted/i.test(String(secretPayload.error ?? ""))) {
      throw new Error(`unexpected credential rejection output: ${JSON.stringify(secretPayload)}`);
    }
    console.log("PASS hyperliquid secret flag rejection");
  } finally {
    await new Promise((resolve) => mock.server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
