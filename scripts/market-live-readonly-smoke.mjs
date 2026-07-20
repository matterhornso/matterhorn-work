#!/usr/bin/env node

/**
 * Market live read-only smoke harness.
 *
 * Drives a LIVE local Matterhorn Desks server across the Hyperliquid and
 * Polymarket read / preview / external-signer-handoff routes only. It never
 * submits an order, never signs, never sends funds, and never accepts or echoes
 * signing material. Every preview/handoff must report `canSubmit: false`.
 *
 *   node scripts/market-live-readonly-smoke.mjs --server-url http://localhost:8787 --token <t> --strict --json
 *   node scripts/market-live-readonly-smoke.mjs --self-test --strict --json   # offline, mocked server
 */

import { createServer } from "node:http";

const FORBIDDEN_PAYLOAD_KEY_RE =
  /^(seed|seedPhrase|seed_phrase|mnemonic|privateKey|private_key|apiSecret|api_secret|passphrase|walletExport|wallet_export|rawSignature|raw_signature|signedPayload|signed_payload|signedOrder|signed_order|signature)$/i;
const FORBIDDEN_PAYLOAD_ASSIGNMENT_RE =
  /\b(seed|seedPhrase|seed_phrase|mnemonic|privateKey|private_key|apiSecret|api_secret|passphrase|walletExport|wallet_export|rawSignature|raw_signature|signedPayload|signed_payload|signedOrder|signed_order|signature)\b[ \t]*[:=][ \t]*\S+/i;

function containsForbiddenPayload(value) {
  if (typeof value === "string") return FORBIDDEN_PAYLOAD_ASSIGNMENT_RE.test(value);
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenPayload);
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_PAYLOAD_KEY_RE.test(key) || containsForbiddenPayload(child),
  );
}

function containsCanSubmitTrue(value) {
  return /"canSubmit"\s*:\s*true/.test(JSON.stringify(value));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const arg = (name, fallback) => {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1]) return args[index + 1];
    const inline = args.find((item) => item.startsWith(`${name}=`));
    return inline ? inline.slice(name.length + 1) : fallback;
  };
  return {
    serverUrl: arg("--server-url", process.env.MATTERHORN_WORK_SERVER_URL || ""),
    token: arg("--token", process.env.MATTERHORN_WORK_TOKEN || ""),
    asset: arg("--asset", "BTC"),
    query: arg("--query", "ai"),
    timeoutMs: Number(arg("--timeout-ms", "15000")),
    strict: args.includes("--strict"),
    json: args.includes("--json"),
    selfTest: args.includes("--self-test"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

function printHelp() {
  process.stdout.write([
    "Matterhorn Desks market live read-only smoke harness",
    "",
    "Usage:",
    "  node scripts/market-live-readonly-smoke.mjs --server-url <url> --token <token> [--strict] [--json]",
    "  node scripts/market-live-readonly-smoke.mjs --self-test --strict --json",
    "",
    "Read/preview/handoff-only checks (never submits, never signs):",
    "  GET  /api/hyperliquid/markets?limit=3",
    "  POST /api/hyperliquid/chat/execute        (read-only request)",
    "  POST /api/hyperliquid/orders/preview      (toy params; canSubmit:false)",
    "  POST /api/hyperliquid/orders/handoff      (toy params; externalSignerOnly:true)",
    "  GET  /api/polymarket/markets?q=ai&limit=3",
    "  GET  /api/polymarket/compliance",
    "  POST /api/polymarket/chat/execute         (discovery / read-only request)",
    "  POST /api/polymarket/orders/handoff       (tiny toy amount; skipped if no market)",
    "",
  ].join("\n"));
}

// ---------------------------------------------------------------------------
// Self-test mock server (offline). Mirrors the live server's read/preview
// /handoff response shapes. Never returns a submit route or canSubmit:true.
// ---------------------------------------------------------------------------

function jsonResponse(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

async function createMockServer(token, options = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = await readBody(req);
    if (req.headers.authorization !== "Bearer " + token) return jsonResponse(res, 401, { error: "unauthorized" });

    // Hyperliquid
    if (req.method === "GET" && url.pathname === "/api/hyperliquid/markets") {
      return jsonResponse(res, 200, { success: true, markets: [{ asset: "BTC", markPx: 65000, index: 0, source: { source: "hyperliquid.info", freshness: "live" } }] });
    }
    if (req.method === "POST" && url.pathname === "/api/hyperliquid/chat/execute") {
      return jsonResponse(res, 200, { success: true, venue: "hyperliquid", execution: "read_only", responseText: "Hyperliquid markets listed.", warnings: [] });
    }
    if (req.method === "POST" && url.pathname === "/api/hyperliquid/orders/preview") {
      if (containsForbiddenPayload(body)) return jsonResponse(res, 400, { error: "market_secret_rejected" });
      return jsonResponse(res, 200, { success: true, preview: { venue: "hyperliquid", asset: body.asset, side: body.side, size: body.size, price: body.price, signerPolicy: "api_wallet_required", canSubmit: false, previewSha256: "a".repeat(64) } });
    }
    if (req.method === "POST" && url.pathname === "/api/hyperliquid/orders/handoff") {
      if (containsForbiddenPayload(body)) return jsonResponse(res, 400, { error: "market_secret_rejected" });
      return jsonResponse(res, 200, { success: true, handoff: { venue: "hyperliquid", signerPolicy: "external_signer_required", externalSignerOnly: true, canSubmit: false, signingPayload: { requiresClientValidation: true, clientMustCompute: ["signature"] }, warnings: ["Matterhorn never receives raw signatures or signed payloads."], previewSha256: "a".repeat(64), handoffSha256: "h".repeat(64) } });
    }

    // Polymarket
    if (req.method === "GET" && url.pathname === "/api/polymarket/markets") {
      const markets = options.noMarkets ? [] : [{ id: "0xmarket-ai", question: "Will an AI model pass the bar exam?", outcomes: ["Yes", "No"] }];
      return jsonResponse(res, 200, { success: true, markets });
    }
    if (req.method === "GET" && url.pathname === "/api/polymarket/compliance") {
      return jsonResponse(res, 200, { success: true, compliance: { status: options.blocked ? "blocked" : "allowed", reason: options.blocked ? "geoblocked" : null } });
    }
    if (req.method === "POST" && url.pathname === "/api/polymarket/chat/execute") {
      return jsonResponse(res, 200, { success: true, venue: "polymarket", execution: "read_only", responseText: "Found Polymarket markets.", warnings: [] });
    }
    if (req.method === "POST" && url.pathname === "/api/polymarket/orders/handoff") {
      if (containsForbiddenPayload(body)) return jsonResponse(res, 400, { error: "market_secret_rejected" });
      if (options.blocked) {
        return jsonResponse(res, 200, { success: true, blocked: true, preview: { venue: "polymarket", execution: "blocked_by_compliance", price: null, size: null, estimatedShares: null, canSubmit: false } });
      }
      return jsonResponse(res, 200, { success: true, handoff: { venue: "polymarket", signerPolicy: "external_signer_required", externalSignerOnly: true, canSubmit: false, previewSha256: "p".repeat(64), handoffSha256: "h".repeat(64) } });
    }

    return jsonResponse(res, 404, { error: "not_found", path: url.pathname });
  });
  const port = await listen(server);
  return { server, url: "http://127.0.0.1:" + port };
}

// ---------------------------------------------------------------------------
// Harness.
// ---------------------------------------------------------------------------

export async function runMarketLiveReadonlySmoke(options) {
  const baseUrl = options.serverUrl.replace(/\/+$/, "");
  const stages = [];

  async function call(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
    try {
      const response = await fetch(baseUrl + path, {
        method,
        headers: { authorization: "Bearer " + options.token, ...(body ? { "content-type": "application/json" } : {}) },
        signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let payload = null;
      try { payload = await response.json(); } catch { payload = { raw: await response.text().catch(() => "") }; }
      return { response, payload };
    } finally {
      clearTimeout(timer);
    }
  }

  async function stage(id, label, fn) {
    try {
      const extra = (await fn()) || {};
      stages.push({ id, label, status: extra.status || "pass", ...extra });
      return extra;
    } catch (error) {
      stages.push({ id, label, status: "fail", error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  // Shared safety assertion run on every response.
  function assertSafe(payload, label) {
    if (containsForbiddenPayload(payload)) throw new Error(label + " response contained secret-shaped data");
    if (containsCanSubmitTrue(payload)) throw new Error(label + " response contained canSubmit:true");
  }

  // --- Hyperliquid ---
  await stage("hl.markets", "Hyperliquid markets read", async () => {
    const { response, payload } = await call("GET", "/api/hyperliquid/markets?limit=3");
    if (!response.ok) throw new Error("HTTP " + response.status);
    assertSafe(payload, "hl.markets");
    if (!Array.isArray(payload.markets) || payload.markets.length === 0) throw new Error("markets array missing");
    return { count: payload.markets.length };
  });

  await stage("hl.chat", "Hyperliquid read-only chat", async () => {
    const { response, payload } = await call("POST", "/api/hyperliquid/chat/execute", { message: "list markets" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    assertSafe(payload, "hl.chat");
    if (payload.venue !== "hyperliquid") throw new Error("venue mismatch");
    return { execution: payload.execution };
  });

  await stage("hl.preview", "Hyperliquid non-submittable preview", async () => {
    const { response, payload } = await call("POST", "/api/hyperliquid/orders/preview", { asset: options.asset, side: "buy", size: 0.001, price: 65000 });
    if (!response.ok) throw new Error("HTTP " + response.status);
    assertSafe(payload, "hl.preview");
    if (payload.preview?.canSubmit !== false) throw new Error("preview must be canSubmit=false");
    return { canSubmit: payload.preview.canSubmit, previewSha256: payload.preview.previewSha256 };
  });

  await stage("hl.handoff", "Hyperliquid external-signer handoff", async () => {
    const { response, payload } = await call("POST", "/api/hyperliquid/orders/handoff", { asset: options.asset, side: "buy", size: 0.001, price: 65000 });
    if (!response.ok) throw new Error("HTTP " + response.status);
    assertSafe(payload, "hl.handoff");
    if (payload.handoff?.externalSignerOnly !== true) throw new Error("handoff must be externalSignerOnly=true");
    if (payload.handoff?.canSubmit !== false) throw new Error("handoff must be canSubmit=false");
    return { handoffSha256: payload.handoff.handoffSha256 };
  });

  // --- Polymarket ---
  const pmDiscover = await stage("pm.markets", "Polymarket markets read", async () => {
    const { response, payload } = await call("GET", "/api/polymarket/markets?q=" + encodeURIComponent(options.query) + "&limit=3");
    if (!response.ok) throw new Error("HTTP " + response.status);
    assertSafe(payload, "pm.markets");
    if (!Array.isArray(payload.markets)) throw new Error("markets array missing");
    return { count: payload.markets.length, marketId: payload.markets[0]?.id ?? null };
  });

  await stage("pm.compliance", "Polymarket compliance read", async () => {
    const { response, payload } = await call("GET", "/api/polymarket/compliance");
    if (!response.ok) throw new Error("HTTP " + response.status);
    assertSafe(payload, "pm.compliance");
    if (!payload.compliance?.status) throw new Error("compliance status missing");
    return { complianceStatus: payload.compliance.status };
  });

  await stage("pm.chat", "Polymarket read-only chat", async () => {
    const { response, payload } = await call("POST", "/api/polymarket/chat/execute", { message: "find markets about " + options.query });
    if (!response.ok) throw new Error("HTTP " + response.status);
    assertSafe(payload, "pm.chat");
    if (payload.venue !== "polymarket") throw new Error("venue mismatch");
    return { execution: payload.execution };
  });

  const marketId = pmDiscover?.marketId ?? null;
  if (!marketId) {
    stages.push({ id: "pm.handoff", label: "Polymarket external-signer handoff", status: "skip", reason: "No market id available from discovery." });
  } else {
    await stage("pm.handoff", "Polymarket external-signer handoff", async () => {
      const { response, payload } = await call("POST", "/api/polymarket/orders/handoff", { marketId, side: "yes", amountUsdc: 1 });
      if (!response.ok) throw new Error("HTTP " + response.status);
      assertSafe(payload, "pm.handoff");
      if (payload.blocked) {
        // Compliance gating: a blocked region must produce no executable params.
        const p = payload.preview ?? {};
        if (p.price !== null || p.size !== null || (p.estimatedShares !== null && p.estimatedShares !== undefined)) {
          throw new Error("blocked preview must not carry executable price/size/shares");
        }
        return { status: "pass", blocked: true };
      }
      if (payload.handoff?.externalSignerOnly !== true) throw new Error("handoff must be externalSignerOnly=true");
      if (payload.handoff?.canSubmit !== false) throw new Error("handoff must be canSubmit=false");
      return { handoffSha256: payload.handoff.handoffSha256 };
    });
  }

  const summary = {
    pass: stages.filter((s) => s.status === "pass").length,
    fail: stages.filter((s) => s.status === "fail").length,
    skip: stages.filter((s) => s.status === "skip").length,
  };
  return {
    ready: summary.fail === 0,
    strict: Boolean(options.strict),
    completedAt: new Date().toISOString(),
    serverUrl: baseUrl,
    summary,
    stages,
    safety: { custody: "none", submitsOrders: false, acceptsSigningMaterial: false, previewsCanSubmit: false },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); return; }

  let mock = null;
  if (args.selfTest) {
    args.token = args.token || "mwm_smoke_self_test";
    mock = await createMockServer(args.token);
    args.serverUrl = mock.url;
  }
  if (!args.serverUrl || !args.token) {
    process.stderr.write("Missing --server-url/--token, or run with --self-test.\n");
    process.exitCode = 2;
    return;
  }

  try {
    const report = await runMarketLiveReadonlySmoke(args);
    if (args.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    } else {
      process.stdout.write("Market live read-only smoke: " + (report.ready ? "PASS" : "FAIL") + "\n");
      for (const s of report.stages) process.stdout.write("- " + s.status.toUpperCase() + " " + s.id + ": " + s.label + (s.error ? " (" + s.error + ")" : "") + "\n");
    }
    if (args.strict && !report.ready) process.exitCode = 1;
  } finally {
    if (mock) await new Promise((resolve) => mock.server.close(resolve));
  }
}

export { createMockServer };

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.stack || error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
