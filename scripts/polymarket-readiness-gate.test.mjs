#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = process.cwd();
let failures = 0;

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function pass(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL ${label}`);
  if (detail) console.error(`  ${detail}`);
}

function mustContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (!text.includes(needle)) fail(`${path} contains ${needle}`, "missing");
    else pass(`${path} contains ${needle}`);
  }
  return text;
}

function mustNotContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (text.includes(needle)) fail(`${path} excludes ${needle}`, "present");
    else pass(`${path} excludes ${needle}`);
  }
  return text;
}

const tool = mustContain("apps/server/src/tools/polymarket.ts", [
  "findForbiddenPolymarketCredentialInput",
  "canSubmit: false",
  "signerPolicy: \"api_wallet_required\"",
  "checkCompliance",
  "blocked_by_compliance",
  "buildBlockedPolymarketPreview",
  "estimatePolymarketFill",
  "PolymarketActionPreview",
  "encodeURIComponent",
  // Preview risk polish (prediction-market framing).
  "PolymarketRiskContext",
  "breakevenProbability",
  "buildPolymarketResolution",
  "buildPolymarketPriceContext",
  "gapVsImpliedPct",
  // Read-only watchlist/monitor flow.
  "buildPolymarketWatchDescriptor",
  "matterhorn.polymarket.watch.v1",
  "polymarket_watch",
  // Events (grouped-market) discovery.
  "searchEvents",
  "mapEventRecord",
  "polymarket_event_list",
]);

// No execution / submission / signing path may exist.
if (/canSubmit:\s*true/.test(tool)) fail("Polymarket tool never enables canSubmit", "found canSubmit: true");
else pass("Polymarket tool never enables canSubmit");
for (const forbidden of ["method: \"POST\"", "/orders/submit", "submitOrder", "placeOrder", "signOrder", "postOrder", "sendOrder"]) {
  if (tool.includes(forbidden)) fail(`Polymarket tool excludes ${forbidden}`, "present");
  else pass(`Polymarket tool excludes ${forbidden}`);
}

// Credential rejection must cover the full forbidden vocabulary.
for (const token of ["private", "mnemonic", "apiSecret", "api_secret", "passphrase", "rawSignature", "signedPayload", "wallet_export"]) {
  if (tool.includes(token)) pass(`Polymarket forbidden pattern includes ${token}`);
  else fail(`Polymarket forbidden pattern includes ${token}`, "missing");
}

mustContain("apps/server/src/tools/polymarket.test.ts", [
  "findForbiddenPolymarketCredentialInput",
  "blocked_by_compliance",
  "canSubmit",
]);

// Server routes (read/preview-only; mirror the Hyperliquid pattern).
mustContain("apps/server/src/server.ts", [
  "/api/polymarket/markets",
  "/api/polymarket/events",
  "/api/polymarket/markets/:id",
  "/api/polymarket/orderbook/:tokenId",
  "/api/polymarket/compliance",
  "/api/polymarket/orders/preview",
  "/api/polymarket/chat/execute",
  "findForbiddenPolymarketCredentialInput",
  "market_secret_rejected",
]);
mustNotContain("apps/server/src/server.ts", [
  "/api/polymarket/orders/submit",
  "/api/polymarket/exchange",
]);

// MCP tools (read/preview-only; no secret fields in any schema).
const mcp = mustContain("packages/matterhorn-work-mcp/index.mjs", [
  "matterhorn_polymarket_chat",
  "matterhorn_polymarket_search_markets",
  "matterhorn_polymarket_search_events",
  "matterhorn_polymarket_get_market",
  "matterhorn_polymarket_get_orderbook",
  "matterhorn_polymarket_check_compliance",
  "matterhorn_polymarket_preview_order",
]);
const polymarketMcpSection = (() => {
  const start = mcp.indexOf("matterhorn_polymarket_chat");
  const end = mcp.indexOf("matterhorn_bittensor_chat", start);
  return start < 0 ? "" : mcp.slice(start, end < 0 ? mcp.length : end);
})();
for (const forbidden of ["apiSecret", "api_secret", "privateKey", "private_key", "seed", "mnemonic", "signature", "signedPayload", "/orders/submit"]) {
  if (polymarketMcpSection.includes(forbidden)) fail(`Polymarket MCP schema excludes ${forbidden}`, "present");
  else pass(`Polymarket MCP schema excludes ${forbidden}`);
}

mustContain("docs/polymarket-read-preview.md", [
  "read-only plus preview-only",
  "Compliance Gate",
  "blocked_by_compliance",
  "canSubmit: false",
  "Private keys, API secrets, signatures, signed actions, or signed payloads.",
  "geoblock",
]);

mustContain("scripts/polymarket-read-preview-qa.mjs", [
  "discover",
  "market.detail",
  "orderbook",
  "geoblock",
  "order.preview",
  "secret.rejection",
  "previewsCanSubmit: false",
]);

if (failures > 0) {
  console.error(`Polymarket readiness gate failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("Polymarket readiness gate passed.");
