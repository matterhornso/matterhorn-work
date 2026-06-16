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

function sectionBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = text.indexOf(end, startIndex + start.length);
  return text.slice(startIndex, endIndex < 0 ? text.length : endIndex);
}

const serverTool = mustContain("apps/server/src/tools/hyperliquid.ts", [
  "findForbiddenHyperliquidCredentialInput",
  "canSubmit: false",
  "signerPolicy: \"api_wallet_required\"",
  "getFunding(asset",
  "HyperliquidPositionSummary",
  "HyperliquidOpenOrderSummary",
  "HyperliquidFundingSnapshot",
  // Preview risk polish fields (read/preview-only context).
  "notionalUsd",
  "HyperliquidMarketabilityEstimate",
  "HyperliquidLeverageContext",
  "requiresAccountContext",
  "closeContext",
  "estimateHyperliquidMarketability",
]);
if (/canSubmit:\s*true/.test(serverTool)) fail("Hyperliquid provider never enables canSubmit", "found canSubmit: true");
else pass("Hyperliquid provider never enables canSubmit");
for (const forbidden of ["orders/submit", "exchangeRequest", "signOrder", "placeOrder", "submitOrder"]) {
  if (serverTool.includes(forbidden)) fail(`Hyperliquid tool excludes ${forbidden}`, "present");
  else pass(`Hyperliquid tool excludes ${forbidden}`);
}

mustContain("docs/hyperliquid-read-preview.md", [
  "Preview Risk Fields",
  "requiresAccountContext",
  "marketability",
  "annualizedFundingPct",
  "requires account context",
]);

mustContain("apps/server/src/server.ts", [
  "/api/hyperliquid/markets",
  "/api/hyperliquid/account/:address",
  "/api/hyperliquid/account/:address/positions",
  "/api/hyperliquid/account/:address/open-orders",
  "/api/hyperliquid/funding/:asset",
  "/api/hyperliquid/orderbook/:asset",
  "/api/hyperliquid/orders/preview",
  "/api/hyperliquid/chat/execute",
  "market_secret_rejected",
]);
mustNotContain("apps/server/src/server.ts", [
  "/api/hyperliquid/orders/submit",
  "/api/hyperliquid/exchange",
]);

const mcp = mustContain("packages/matterhorn-work-mcp/index.mjs", [
  "matterhorn_hyperliquid_chat",
  "matterhorn_hyperliquid_list_markets",
  "matterhorn_hyperliquid_get_account",
  "matterhorn_hyperliquid_get_positions",
  "matterhorn_hyperliquid_get_open_orders",
  "matterhorn_hyperliquid_get_funding",
  "matterhorn_hyperliquid_get_orderbook",
  "matterhorn_hyperliquid_preview_order",
]);
const hyperliquidMcpSection = sectionBetween(mcp, "matterhorn_hyperliquid_chat", "matterhorn_bittensor_chat");
for (const forbidden of ["apiSecret", "api_secret", "privateKey", "private_key", "seed", "mnemonic", "signature", "signedPayload"]) {
  if (hyperliquidMcpSection.includes(forbidden)) fail(`Hyperliquid MCP schema excludes ${forbidden}`, "present");
  else pass(`Hyperliquid MCP schema excludes ${forbidden}`);
}

mustContain("apps/orchestrator/src/cli.ts", [
  "matterhorn-work hyperliquid markets",
  "matterhorn-work hyperliquid positions",
  "matterhorn-work hyperliquid open-orders",
  "matterhorn-work hyperliquid funding",
  "assertNoHyperliquidSecrets",
]);

mustContain("scripts/hyperliquid-read-preview-qa.mjs", [
  "Read normalized Hyperliquid positions",
  "Read normalized Hyperliquid open orders",
  "Read Hyperliquid funding context",
  "credential-shaped preview input",
  "previewsCanSubmit: false",
]);

mustContain("scripts/hyperliquid-cli-fallback.test.mjs", [
  "hyperliquid positions",
  "hyperliquid open-orders",
  "hyperliquid funding",
  "hyperliquid secret flag rejection",
]);

mustContain("docs/hyperliquid-read-preview.md", [
  "preview-only",
  "API wallet creation or storage.",
  "Private keys, API secrets, signatures, signed actions, or signed payloads.",
  "does not accept API secrets, private keys, signatures, or signed payloads",
  "matterhorn-work hyperliquid funding",
  "/api/hyperliquid/funding/BTC",
]);

mustContain("docs/hyperliquid-read-preview-qa.md", [
  "positions",
  "open.orders",
  "funding",
  "No exchange submission.",
]);

if (failures > 0) {
  console.error(`Hyperliquid readiness gate failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("Hyperliquid readiness gate passed.");
