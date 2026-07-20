#!/usr/bin/env node
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const DEFAULT_ADDRESS = "0x0000000000000000000000000000000000000001";

function parseArgs(argv) {
  const args = {
    serverUrl: process.env.MATTERHORN_WORK_SERVER_URL || "",
    token: process.env.MATTERHORN_WORK_TOKEN || "",
    asset: "BTC",
    side: "buy",
    size: 0.1,
    price: 65000,
    limit: 2,
    address: "",
    strict: false,
    json: false,
    output: "",
    selfTest: false,
    requireAccount: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index] ?? "";
    if (arg === "--server-url") args.serverUrl = next();
    else if (arg === "--token") args.token = next();
    else if (arg === "--asset") args.asset = next();
    else if (arg === "--side") args.side = next();
    else if (arg === "--size") args.size = Number(next());
    else if (arg === "--price") args.price = Number(next());
    else if (arg === "--limit") args.limit = Number(next());
    else if (arg === "--address") args.address = next();
    else if (arg === "--output") args.output = next();
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--require-account") args.requireAccount = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
  }
  return args;
}

function printHelp() {
  console.log([
    "Matterhorn Desks Hyperliquid read/preview QA",
    "",
    "Usage:",
    "  node scripts/hyperliquid-read-preview-qa.mjs --server-url <url> --token <token> --asset BTC --side buy --size 0.1 --price 65000 --json --strict",
    "  node scripts/hyperliquid-read-preview-qa.mjs --self-test --strict --json",
    "",
    "Checks:",
    "  - GET /api/hyperliquid/markets",
    "  - GET /api/hyperliquid/orderbook/:asset",
    "  - optional GET /api/hyperliquid/account/:address",
    "  - optional GET /api/hyperliquid/account/:address/positions",
    "  - optional GET /api/hyperliquid/account/:address/open-orders",
    "  - GET /api/hyperliquid/funding/:asset",
    "  - POST /api/hyperliquid/orders/preview",
    "  - POST /api/hyperliquid/chat/execute",
    "  - credential-shaped preview rejection",
  ].join("\n"));
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function createMockServer(token) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readJson(req);
    requests.push({ method: req.method, path: url.pathname, body });

    if (req.headers.authorization !== "Bearer " + token) {
      return json(res, 401, { error: "unauthorized" });
    }
    if (req.method === "GET" && url.pathname === "/api/hyperliquid/markets") {
      return json(res, 200, {
        success: true,
        markets: [
          { asset: "BTC", markPx: 65000, source: { source: "hyperliquid.info", freshness: "live" } },
          { asset: "ETH", markPx: 3500, source: { source: "hyperliquid.info", freshness: "live" } },
        ],
      });
    }
    if (req.method === "GET" && url.pathname === "/api/hyperliquid/orderbook/BTC") {
      return json(res, 200, {
        success: true,
        orderbook: { asset: "BTC", bids: [{ price: 64999, size: 1 }], asks: [{ price: 65001, size: 1 }], warnings: [] },
      });
    }
    if (req.method === "GET" && url.pathname === "/api/hyperliquid/account/" + DEFAULT_ADDRESS) {
      return json(res, 200, {
        success: true,
        account: { address: DEFAULT_ADDRESS, positionCount: 1, openOrderCount: 1, warnings: [] },
      });
    }
    if (req.method === "GET" && url.pathname === "/api/hyperliquid/account/" + DEFAULT_ADDRESS + "/positions") {
      return json(res, 200, {
        success: true,
        address: DEFAULT_ADDRESS,
        positions: [{ asset: "BTC", side: "long", size: 0.1, positionValue: 6500 }],
        notionalExposure: 6500,
        unrealizedPnl: 100,
        warnings: [],
      });
    }
    if (req.method === "GET" && url.pathname === "/api/hyperliquid/account/" + DEFAULT_ADDRESS + "/open-orders") {
      return json(res, 200, {
        success: true,
        address: DEFAULT_ADDRESS,
        orders: [{ asset: "BTC", side: "buy", size: 0.05, limitPx: 63000 }],
        warnings: [],
      });
    }
    if (req.method === "GET" && url.pathname === "/api/hyperliquid/funding/BTC") {
      return json(res, 200, {
        success: true,
        funding: { asset: "BTC", fundingRate: 0.0001, openInterest: 1234, markPx: 65000, warnings: [] },
        cards: [],
      });
    }
    if (req.method === "POST" && url.pathname === "/api/hyperliquid/orders/preview") {
      if ("apiSecret" in body) return json(res, 400, { error: "market_secret_rejected" });
      return json(res, 200, {
        success: true,
        preview: { venue: "hyperliquid", asset: body.asset, side: body.side, size: body.size, price: body.price, canSubmit: false, previewSha256: "a".repeat(64) },
      });
    }
    if (req.method === "POST" && url.pathname === "/api/hyperliquid/chat/execute") {
      return json(res, 200, {
        success: true,
        venue: "hyperliquid",
        execution: "unsigned_preview",
        responseText: "Hyperliquid preview ready.",
        preview: { venue: "hyperliquid", canSubmit: false, previewSha256: "b".repeat(64) },
        warnings: [],
      });
    }
    return json(res, 404, { error: "not_found", path: url.pathname });
  });
  const port = await listen(server);
  return { server, requests, url: "http://127.0.0.1:" + port };
}

function containsForbiddenPayload(value) {
  return /(seed|mnemonic|privateKey|private_key|apiSecret|api_secret|signedPayload|signed_payload)/i.test(JSON.stringify(value));
}

async function runQa(options) {
  const stages = [];
  const startedAt = new Date().toISOString();
  const baseUrl = options.serverUrl.replace(/\/+$/, "");

  async function call(stageId, method, path, body, expectOk = true) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: {
        authorization: "Bearer " + options.token,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = { raw: await response.text().catch(() => "") };
    }
    if (expectOk && !response.ok) {
      throw new Error(stageId + " failed with HTTP " + response.status + ": " + JSON.stringify(payload));
    }
    return { response, payload };
  }

  async function stage(id, label, fn) {
    try {
      const data = await fn();
      stages.push({ id, label, status: "pass", data });
    } catch (err) {
      stages.push({ id, label, status: "fail", error: err instanceof Error ? err.message : String(err) });
    }
  }

  await stage("markets", "List Hyperliquid markets", async () => {
    const { payload } = await call("markets", "GET", "/api/hyperliquid/markets?limit=" + encodeURIComponent(String(options.limit)));
    if (!Array.isArray(payload.markets) || payload.markets.length === 0) throw new Error("markets array missing");
    return { count: payload.markets.length, firstAsset: payload.markets[0]?.asset };
  });

  await stage("orderbook", "Read Hyperliquid orderbook", async () => {
    const { payload } = await call("orderbook", "GET", "/api/hyperliquid/orderbook/" + encodeURIComponent(options.asset));
    if (payload.orderbook?.asset !== options.asset) throw new Error("orderbook asset mismatch");
    return { asset: payload.orderbook.asset, bids: payload.orderbook.bids?.length ?? 0, asks: payload.orderbook.asks?.length ?? 0 };
  });

  if (options.address || options.requireAccount) {
    await stage("account", "Read public Hyperliquid account", async () => {
      const address = options.address || DEFAULT_ADDRESS;
      const { payload } = await call("account", "GET", "/api/hyperliquid/account/" + encodeURIComponent(address));
      if (payload.account?.address !== address) throw new Error("account address mismatch");
      return { address, positionCount: payload.account.positionCount, openOrderCount: payload.account.openOrderCount };
    });
    await stage("positions", "Read normalized Hyperliquid positions", async () => {
      const address = options.address || DEFAULT_ADDRESS;
      const { payload } = await call("positions", "GET", "/api/hyperliquid/account/" + encodeURIComponent(address) + "/positions");
      if (!Array.isArray(payload.positions)) throw new Error("positions array missing");
      return { address, count: payload.positions.length, notionalExposure: payload.notionalExposure ?? null };
    });
    await stage("open.orders", "Read normalized Hyperliquid open orders", async () => {
      const address = options.address || DEFAULT_ADDRESS;
      const { payload } = await call("open.orders", "GET", "/api/hyperliquid/account/" + encodeURIComponent(address) + "/open-orders");
      if (!Array.isArray(payload.orders)) throw new Error("orders array missing");
      return { address, count: payload.orders.length };
    });
  } else {
    stages.push({ id: "account", label: "Read public Hyperliquid account", status: "skip", reason: "No --address provided." });
    stages.push({ id: "positions", label: "Read normalized Hyperliquid positions", status: "skip", reason: "No --address provided." });
    stages.push({ id: "open.orders", label: "Read normalized Hyperliquid open orders", status: "skip", reason: "No --address provided." });
  }

  await stage("funding", "Read Hyperliquid funding context", async () => {
    const { payload } = await call("funding", "GET", "/api/hyperliquid/funding/" + encodeURIComponent(options.asset));
    if (payload.funding?.asset !== options.asset) throw new Error("funding asset mismatch");
    return { asset: payload.funding.asset, fundingRate: payload.funding.fundingRate ?? null, openInterest: payload.funding.openInterest ?? null };
  });

  await stage("order.preview", "Prepare non-submittable order preview", async () => {
    const { payload } = await call("order.preview", "POST", "/api/hyperliquid/orders/preview", {
      asset: options.asset,
      side: options.side,
      size: options.size,
      price: options.price,
    });
    if (payload.preview?.venue !== "hyperliquid") throw new Error("preview venue mismatch");
    if (payload.preview?.canSubmit !== false) throw new Error("preview must be canSubmit=false");
    if (containsForbiddenPayload(payload)) throw new Error("preview echoed forbidden credential-shaped data");
    return { asset: payload.preview.asset, side: payload.preview.side, canSubmit: payload.preview.canSubmit, previewSha256: payload.preview.previewSha256 };
  });

  await stage("chat.execute", "Run Hyperliquid chat read/preview workflow", async () => {
    const { payload } = await call("chat.execute", "POST", "/api/hyperliquid/chat/execute", {
      message: "preview " + options.side + "ing " + options.size + " " + options.asset + " at " + options.price,
      asset: options.asset,
      side: options.side,
      size: options.size,
      price: options.price,
    });
    if (payload.venue !== "hyperliquid") throw new Error("chat venue mismatch");
    if (payload.preview && payload.preview.canSubmit !== false) throw new Error("chat preview must be canSubmit=false");
    if (containsForbiddenPayload(payload)) throw new Error("chat echoed forbidden credential-shaped data");
    return { execution: payload.execution, canSubmit: payload.preview?.canSubmit ?? null };
  });

  await stage("secret.rejection", "Reject credential-shaped preview input", async () => {
    const { response, payload } = await call("secret.rejection", "POST", "/api/hyperliquid/orders/preview", {
      asset: options.asset,
      side: options.side,
      size: options.size,
      apiSecret: "must-not-pass",
    }, false);
    if (response.ok) throw new Error("credential-shaped input was accepted");
    return { status: response.status, error: payload.error ?? payload.message ?? "rejected" };
  });

  const summary = {
    pass: stages.filter((item) => item.status === "pass").length,
    fail: stages.filter((item) => item.status === "fail").length,
    skip: stages.filter((item) => item.status === "skip").length,
  };
  return {
    ready: summary.fail === 0 && (!options.strict || summary.skip === 0 || !options.requireAccount),
    strict: options.strict,
    startedAt,
    completedAt: new Date().toISOString(),
    serverUrl: baseUrl,
    summary,
    stages,
    safety: {
      custody: "none",
      acceptsApiSecrets: false,
      submitsExchangeOrders: false,
      previewsCanSubmit: false,
    },
  };
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

let mock = null;
if (args.selfTest) {
  args.token = args.token || "mwhl_self_test";
  args.address = args.address || DEFAULT_ADDRESS;
  args.requireAccount = true;
  mock = await createMockServer(args.token);
  args.serverUrl = mock.url;
}

if (!args.serverUrl || !args.token) {
  console.error("Missing --server-url/--token, or run with --self-test.");
  process.exit(2);
}

try {
  const report = await runQa(args);
  if (args.output) writeFileSync(args.output, JSON.stringify(report, null, 2) + "\n");
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log("Hyperliquid read/preview QA: " + (report.ready ? "PASS" : "FAIL"));
    for (const item of report.stages) console.log("- " + item.status.toUpperCase() + " " + item.id + ": " + item.label);
  }
  if (args.strict && !report.ready) process.exit(1);
} finally {
  if (mock) mock.server.close();
}
