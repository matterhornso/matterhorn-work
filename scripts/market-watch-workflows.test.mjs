#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.scripts["test:market-watch-workflows"], "node scripts/market-watch-workflows.test.mjs");

const server = read("apps/server/src/server.ts");
const hyperliquid = read("apps/server/src/tools/hyperliquid.ts");
const polymarket = read("apps/server/src/tools/polymarket.ts");
const cryptoChat = read("apps/server/src/tools/crypto-chat.ts");
const cli = read("apps/orchestrator/src/cli.ts");
const mcp = read("packages/matterhorn-work-mcp/index.mjs");
const smoke = read("scripts/customer-ready-crypto-smoke.mjs");

for (const route of [
  "/api/hyperliquid/watches",
  "/api/hyperliquid/watches/check",
  "/api/hyperliquid/watches/digest",
  "/api/polymarket/watches",
  "/api/polymarket/watches/check",
  "/api/polymarket/watches/digest",
]) {
  assert.ok(server.includes(route), `server missing ${route}`);
}

for (const symbol of [
  "buildHyperliquidWatchDescriptor",
  "checkHyperliquidWatchDescriptor",
  "buildHyperliquidWatchDigest",
  "HyperliquidWatchCheckResult",
]) {
  assert.ok(hyperliquid.includes(symbol), `Hyperliquid watch tool missing ${symbol}`);
}

for (const symbol of [
  "buildPolymarketWatchDescriptor",
  "checkPolymarketWatchDescriptor",
  "buildPolymarketWatchDigest",
  "PolymarketWatchCheckResult",
]) {
  assert.ok(polymarket.includes(symbol), `Polymarket watch tool missing ${symbol}`);
}

for (const tool of [
  "matterhorn_hyperliquid_create_watch",
  "matterhorn_hyperliquid_check_watches",
  "matterhorn_hyperliquid_watch_digest",
  "matterhorn_hyperliquid_act_on_watch_alert",
  "matterhorn_polymarket_create_watch",
  "matterhorn_polymarket_check_watches",
  "matterhorn_polymarket_watch_digest",
  "matterhorn_polymarket_act_on_watch_alert",
]) {
  assert.ok(mcp.includes(`name: "${tool}"`), `MCP missing ${tool}`);
}

for (const phrase of [
  "deterministic read-only crypto-chat review",
  "Do not sign, submit, broadcast, auto-execute",
  "matterhorn_hyperliquid_act_on_watch_alert",
  "matterhorn_polymarket_act_on_watch_alert",
]) {
  assert.ok(mcp.includes(phrase), `MCP watch alert action contract missing ${phrase}`);
}

for (const command of [
  "matterhorn-work hyperliquid watch create|list|check|digest",
  "matterhorn-work polymarket watch create|list|check|digest",
  "hyperliquid watch requires create|list|check|digest",
  "polymarket watch requires create|list|check|digest",
]) {
  assert.ok(cli.includes(command), `CLI missing ${command}`);
}

assert.ok(cryptoChat.includes('case "hyperliquid_watch":'), "unified crypto cards should map Hyperliquid watches to watch_alert");
assert.ok(cryptoChat.includes('case "polymarket_watch":'), "unified crypto cards should map Polymarket watches to watch_alert");
assert.ok(smoke.includes("test:market-watch-workflows"), "customer-ready crypto smoke should include market watch workflows");

for (const text of [server, hyperliquid, polymarket, cli, mcp].join("\n").matchAll(/\/api\/(?:hyperliquid|polymarket)[^\s"'`]+/g)) {
  assert.ok(!/\/(?:orders\/)?(?:submit|sign)|exchange\/submit/i.test(text[0]), `forbidden submit/sign path leaked into watch work: ${text[0]}`);
}

for (const secret of ["seed phrase", "private key", "api secret", "raw signature", "signed payload", "wallet export"]) {
  assert.ok(
    server.includes("market_secret_rejected") || !server.toLowerCase().includes(secret),
    `server must reject secret-shaped watch inputs mentioning ${secret}`,
  );
}

console.log("Market watch workflow contract test passed.");
