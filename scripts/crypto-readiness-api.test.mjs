#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const rootPackage = JSON.parse(read("package.json"));
const server = read("apps/server/src/server.ts");
const matrix = read("docs/agent-control-coverage-matrix.md");
const mcp = read("packages/matterhorn-work-mcp/index.mjs");
const cli = read("apps/orchestrator/src/cli.ts");
const routeStart = server.indexOf('"/api/crypto/readiness"');
const routeEnd = server.indexOf('"/api/crypto/chat/execute"', routeStart);
const readinessRoute = routeStart >= 0 ? server.slice(routeStart, routeEnd > routeStart ? routeEnd : server.length) : "";

assert.equal(
  rootPackage.scripts?.["test:crypto-readiness-api"],
  "node scripts/crypto-readiness-api.test.mjs",
  "package.json should expose the crypto readiness API gate",
);

for (const phrase of [
  '"/api/crypto/readiness"',
  "Bittensor readiness",
  "Hyperliquid wallet execution",
  "Polymarket wallet ticket",
  "Eligible Polymarket buy, sell, and cancel actions",
  "Market execution safety",
  "pnpm smoke:customer-ready-crypto",
  "matterhorn-work crypto customer-packet",
  "nonCustodial: true",
  "liveSubmissionEnabled: hyperliquidExecution",
  "canSubmit: hyperliquidExecution",
  "requiresWalletApproval: true",
  "autoExecutionEnabled: false",
  "Attach offline smoke/CI evidence",
]) {
  assert.ok(readinessRoute.includes(phrase), `server crypto readiness route should include ${phrase}`);
}

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "/api/hyperliquid/orders/sign",
  "/api/polymarket/orders/sign",
  "apiSecret",
  "privateKey",
  "rawSignature",
  "signedPayload",
]) {
  assert.equal(readinessRoute.includes(forbidden), false, `crypto readiness route must not introduce forbidden surface ${forbidden}`);
}

assert.ok(matrix.includes("/api/crypto/readiness"), "coverage matrix should list the crypto readiness API");
assert.ok(matrix.includes("Customer crypto readiness"), "coverage matrix should name the customer crypto readiness surface");
assert.ok(matrix.includes("matterhorn_crypto_readiness"), "coverage matrix should list the crypto readiness MCP tool");
assert.ok(matrix.includes("matterhorn-work crypto readiness"), "coverage matrix should list the crypto readiness CLI command");
assert.ok(mcp.includes("matterhorn_crypto_readiness"), "MCP package should expose the crypto readiness tool");
assert.ok(mcp.includes("/api/crypto/readiness"), "MCP package should call the crypto readiness API");
assert.ok(cli.includes("matterhorn-work crypto readiness"), "CLI help should list crypto readiness");
assert.ok(cli.includes("/api/crypto/readiness"), "CLI should call the crypto readiness API");

console.log("Crypto readiness API static check passed.");
