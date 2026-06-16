#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertNoForbiddenSecrets, runPolymarketLiveQa } from "./polymarket-live-qa.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

// ---------------------------------------------------------------------------
// Mocked Polymarket endpoints.
// ---------------------------------------------------------------------------

const MARKET = {
  id: "0xmarket-ai",
  question: "Will an AI model pass the bar exam by 2027?",
  outcomes: JSON.stringify(["Yes", "No"]),
  outcomePrices: JSON.stringify(["0.62", "0.38"]),
  clobTokenIds: JSON.stringify(["token-yes", "token-no"]),
  active: true,
  closed: false,
};

const BOOK = {
  market: "0xmarket-ai",
  bids: [{ price: "0.61", size: "100" }],
  asks: [{ price: "0.63", size: "200" }],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function makeFetch({ geoblockBlocked = false } = {}) {
  return async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/geoblock")) return jsonResponse({ blocked: geoblockBlocked, country: "US" });
    if (url.includes("/markets/")) return jsonResponse(MARKET);
    if (url.includes("/markets")) return jsonResponse([MARKET]);
    if (url.includes("/book")) return jsonResponse(BOOK);
    return new Response("not found", { status: 404 });
  };
}

function stage(report, id) {
  return report.stages.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Geoblock allowed: full read + unsigned preview path.
// ---------------------------------------------------------------------------

{
  const report = await runPolymarketLiveQa({ fetchImpl: makeFetch({ geoblockBlocked: false }), query: "AI" });
  assert.equal(report.summary.ok, true, "allowed run should pass all stages");
  assert.equal(report.summary.liveTradingImplemented, false);

  assert.equal(stage(report, "discover").status, "pass", "market search stage");
  assert.equal(stage(report, "detail").status, "pass", "market detail stage");

  const ob = stage(report, "orderbook");
  assert.equal(ob.status, "pass", "orderbook read stage");
  assert.ok(Math.abs(ob.midpoint - 0.62) < 1e-9, "midpoint shaped from book");

  assert.equal(stage(report, "geoblock").status, "pass", "geoblock allowed stage");

  const preview = stage(report, "preview");
  assert.equal(preview.status, "pass", "preview stage");
  assert.equal(preview.preview.canSubmit, false, "allowed preview canSubmit is false");
  assert.equal(preview.preview.execution, "unsigned_preview", "allowed preview is unsigned");
  assert.ok(preview.preview.price !== null, "allowed preview has an estimated price");

  assert.equal(stage(report, "secret-rejection").status, "pass", "secret rejection self-check");
}

// ---------------------------------------------------------------------------
// Geoblock blocked: no executable preview.
// ---------------------------------------------------------------------------

{
  const report = await runPolymarketLiveQa({ fetchImpl: makeFetch({ geoblockBlocked: true }), query: "AI" });
  const compliance = stage(report, "geoblock");
  assert.equal(compliance.compliance.status, "blocked", "geoblock blocked stage");

  const preview = stage(report, "preview");
  assert.equal(preview.status, "pass", "blocked preview stage still passes its assertions");
  assert.equal(preview.preview.execution, "blocked_by_compliance", "blocked preview execution");
  assert.equal(preview.preview.price, null, "blocked preview has no price");
  assert.equal(preview.preview.size, null, "blocked preview has no size");
  assert.equal(preview.preview.canSubmit, false, "blocked preview canSubmit is false");
  assert.equal(report.summary.liveTradingImplemented, false);
}

// ---------------------------------------------------------------------------
// Secret-field rejection (direct).
// ---------------------------------------------------------------------------

{
  for (const field of ["privateKey", "mnemonic", "apiSecret", "passphrase", "rawSignature", "signedPayload", "wallet_export"]) {
    assert.throws(() => assertNoForbiddenSecrets({ [field]: "x" }, "probe"), /forbidden secret-shaped field/, `rejects ${field}`);
  }
  assert.throws(() => assertNoForbiddenSecrets({ note: `0x${"a".repeat(64)}` }, "probe"), /private key/, "rejects hex private key value");

  // Error must not echo the offending value.
  const secret = `0x${"d".repeat(64)}`;
  try {
    assertNoForbiddenSecrets({ data: secret }, "probe");
    assert.fail("expected rejection");
  } catch (error) {
    assert.ok(!String(error.message).includes(secret), "error must not echo the secret value");
  }

  assert.doesNotThrow(() => assertNoForbiddenSecrets({ message: "find markets about AI", marketId: "0xmarket-ai" }, "probe"), "safe payload allowed");
}

// ---------------------------------------------------------------------------
// Static proof: no live order submission / signing route exists.
// ---------------------------------------------------------------------------

{
  const qaSource = readFileSync(path.join(repoRoot, "scripts/polymarket-live-qa.mjs"), "utf8");
  const toolSource = readFileSync(path.join(repoRoot, "apps/server/src/tools/polymarket.ts"), "utf8");

  for (const [name, source] of [["live-qa", qaSource], ["tool", toolSource]]) {
    assert.ok(!/method:\s*["']POST["']/.test(source), `${name} must not issue HTTP POST`);
    // No order-submission path used as a string literal (e.g. "/order", '/orders').
    assert.ok(!/["'`]\/orders?\b/.test(source), `${name} must not reference an order-submission path`);
    for (const banned of ["submitOrder", "placeOrder", "signOrder", "postOrder", "sendOrder"]) {
      assert.ok(!source.includes(banned), `${name} must not reference ${banned}`);
    }
    assert.ok(!/privateKey\s*=/.test(source), `${name} must not assign a private key`);
  }

  // canSubmit literal false in the tool preview shapes.
  assert.ok(toolSource.includes("canSubmit: false"), "tool previews are non-submittable");
  assert.ok(!toolSource.includes("canSubmit: true"), "no submittable preview path exists");
}

// ---------------------------------------------------------------------------
// Contract alignment: the local forbidden-credential mirror matches the
// canonical shared contract in packages/types/src/markets.ts.
// ---------------------------------------------------------------------------

{
  const markets = readFileSync(path.join(repoRoot, "packages/types/src/markets.ts"), "utf8");
  const canonicalMatch = markets.match(/MARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN\s*=\s*\n?\s*"([^"]+)"/);
  assert.ok(canonicalMatch, "canonical forbidden pattern found in markets.ts");
  const canonical = canonicalMatch[1];

  const toolSource = readFileSync(path.join(repoRoot, "apps/server/src/tools/polymarket.ts"), "utf8");
  assert.ok(toolSource.includes(canonical), "tool mirror matches canonical forbidden-credential pattern");

  const qaSource = readFileSync(path.join(repoRoot, "scripts/polymarket-live-qa.mjs"), "utf8");
  // The QA harness inlines the same alternation as a regex literal.
  for (const token of ["private", "mnemonic", "apiSecret", "rawSignature", "signedPayload", "wallet_export"]) {
    assert.ok(canonical.includes(token), `canonical pattern includes ${token}`);
    assert.ok(qaSource.includes(token), `qa pattern includes ${token}`);
  }
}

console.log("Polymarket live QA checks passed.");
