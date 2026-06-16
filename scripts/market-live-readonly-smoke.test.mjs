#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createMockServer, runMarketLiveReadonlySmoke } from "./market-live-readonly-smoke.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const TOKEN = "mwm_smoke_test";

async function withServer(options, fn) {
  const mock = await createMockServer(TOKEN, options);
  try {
    return await fn(mock);
  } finally {
    await new Promise((resolve) => mock.server.close(resolve));
  }
}

// ---------------------------------------------------------------------------
// 1. Allowed path: all read/preview/handoff stages pass, nothing submits.
// ---------------------------------------------------------------------------
await withServer({}, async (mock) => {
  const report = await runMarketLiveReadonlySmoke({ serverUrl: mock.url, token: TOKEN, asset: "BTC", query: "ai", strict: true });
  assert.equal(report.ready, true, "allowed run should be ready");
  assert.equal(report.summary.fail, 0, "no failures");
  assert.equal(report.summary.skip, 0, "no skips when a market is available");
  assert.equal(report.safety.submitsOrders, false);
  assert.equal(report.safety.previewsCanSubmit, false);
  const ids = report.stages.map((s) => s.id);
  for (const id of ["hl.markets", "hl.chat", "hl.preview", "hl.handoff", "pm.markets", "pm.compliance", "pm.chat", "pm.handoff"]) {
    assert.ok(ids.includes(id), `stage ${id} present`);
  }
  const handoff = report.stages.find((s) => s.id === "hl.handoff");
  assert.equal(handoff.status, "pass", "hl handoff passes");
  console.log("PASS allowed path (8 stages, no submit)");
});

// ---------------------------------------------------------------------------
// 2. Geoblocked: polymarket handoff returns a blocked, non-executable preview.
// ---------------------------------------------------------------------------
await withServer({ blocked: true }, async (mock) => {
  const report = await runMarketLiveReadonlySmoke({ serverUrl: mock.url, token: TOKEN, strict: true });
  assert.equal(report.ready, true, "blocked run still ready (handoff blocked, not failed)");
  const pmHandoff = report.stages.find((s) => s.id === "pm.handoff");
  assert.equal(pmHandoff.status, "pass");
  assert.equal(pmHandoff.blocked, true, "polymarket handoff is compliance-blocked");
  const pmCompliance = report.stages.find((s) => s.id === "pm.compliance");
  assert.equal(pmCompliance.complianceStatus, "blocked");
  console.log("PASS geoblocked path (no executable params in blocked preview)");
});

// ---------------------------------------------------------------------------
// 3. No markets: polymarket handoff is skipped, not failed.
// ---------------------------------------------------------------------------
await withServer({ noMarkets: true }, async (mock) => {
  const report = await runMarketLiveReadonlySmoke({ serverUrl: mock.url, token: TOKEN, strict: true });
  const pmHandoff = report.stages.find((s) => s.id === "pm.handoff");
  assert.equal(pmHandoff.status, "skip", "polymarket handoff skipped when no market id");
  assert.equal(report.summary.fail, 0, "skip is not a failure");
  console.log("PASS no-market path (handoff skipped, not failed)");
});

// ---------------------------------------------------------------------------
// 4. Secret-shaped input is rejected by the (mock) server; harness flags it.
// ---------------------------------------------------------------------------
await withServer({}, async (mock) => {
  const response = await fetch(mock.url + "/api/hyperliquid/orders/handoff", {
    method: "POST",
    headers: { authorization: "Bearer " + TOKEN, "content-type": "application/json" },
    body: JSON.stringify({ asset: "BTC", side: "buy", size: 0.001, apiSecret: "nope" }),
  });
  assert.equal(response.ok, false, "secret-shaped handoff input rejected");
  const payload = await response.json();
  assert.equal(payload.error, "market_secret_rejected");
  console.log("PASS secret-shaped input rejected");
});

// ---------------------------------------------------------------------------
// 5. Static wiring: script, docs, and package.json are correctly wired.
// ---------------------------------------------------------------------------
{
  const script = readFileSync(path.join(repoRoot, "scripts/market-live-readonly-smoke.mjs"), "utf8");
  for (const needle of [
    "/api/hyperliquid/markets",
    "/api/hyperliquid/chat/execute",
    "/api/hyperliquid/orders/preview",
    "/api/hyperliquid/orders/handoff",
    "/api/polymarket/markets",
    "/api/polymarket/compliance",
    "/api/polymarket/chat/execute",
    "/api/polymarket/orders/handoff",
    "canSubmit:true",
    "externalSignerOnly !== true",
    "blocked preview must not carry executable price/size/shares",
  ]) {
    assert.ok(script.includes(needle), `script references ${needle}`);
  }
  // Never tests a submit/sign route.
  for (const banned of ["/orders/submit", "/orders/sign", "/exchange/submit"]) {
    assert.ok(!script.includes(banned), `script must not reference ${banned}`);
  }

  const doc = readFileSync(path.join(repoRoot, "docs/market-live-readonly-smoke.md"), "utf8");
  for (const needle of ["read-only", "canSubmit: false", "never submits", "external-signer", "--self-test"]) {
    assert.ok(doc.includes(needle), `doc covers ${needle}`);
  }

  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(pkg.scripts["test:market-live-readonly-smoke"], "node scripts/market-live-readonly-smoke.test.mjs", "package.json wires the test script");
  console.log("PASS static wiring (script/docs/package.json)");
}

console.log("Market live read-only smoke test passed.");
