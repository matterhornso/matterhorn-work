#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const workflow = read("docs/agent-crypto-operator-loop.md");
const matrix = read("docs/agent-control-coverage-matrix.md");
const mcp = read("packages/matterhorn-work-mcp/index.mjs");
const cli = read("apps/orchestrator/src/cli.ts");
const pkg = JSON.parse(read("package.json"));

assert.equal(
  pkg.scripts?.["test:agent-crypto-operator-loop"],
  "node scripts/agent-crypto-operator-loop.test.mjs",
  "package.json should expose the crypto agent operator loop gate",
);

for (const phrase of [
  "/api/crypto/chat/execute",
  "Authorization: Bearer",
  "sharedCards",
  "matterhorn.crypto.shared-card.v1",
  "matterhorn_crypto_chat",
  "matterhorn_bittensor_chat",
  "matterhorn_hyperliquid_chat",
  "matterhorn_polymarket_chat",
  "matterhorn-work crypto chat",
  "matterhorn-work bittensor chat",
  "matterhorn-work hyperliquid chat",
  "matterhorn-work polymarket chat",
  "matterhorn-work crypto customer-smoke",
  "--json-output /tmp/matterhorn-crypto-smoke.json",
  "matterhorn-work crypto sdk-loop",
  "matterhorn-work crypto sdk-manifest-check",
  "matterhorn-work crypto evidence-bundle",
  "matterhorn-work crypto evidence-verify",
  "matterhorn-work crypto bittensor-evidence-verify",
  "matterhorn-work crypto customer-packet",
  "canSubmit: false",
  "pnpm test:crypto-cli-fallback",
  "pnpm test:market-official-sdk-validation-track",
  "pnpm test:market-official-sdk-validation-capture",
  "pnpm test:market-sdk-run-manifest-check",
  "pnpm test:market-customer-evidence-bundle",
  "pnpm test:market-customer-evidence-verify",
  "pnpm test:crypto-customer-packet",
  "pnpm test:bittensor-customer-evidence-verify",
  "pnpm test:market-execution-safety-gate",
  "pnpm test:bittensor-customer-readiness-gate",
]) {
  assert.ok(workflow.includes(phrase), `operator loop doc should include ${phrase}`);
}

for (const phrase of [
  "Unified crypto chat router",
  "Hyperliquid read/preview chat",
  "Polymarket read/preview chat",
  "test:agent-crypto-operator-loop",
  "test:unified-crypto-chat",
  "test:crypto-cli-fallback",
  "test:market-official-sdk-validation-track",
  "test:market-official-sdk-validation-capture",
  "test:market-sdk-run-manifest-check",
  "test:market-customer-evidence-bundle",
  "test:market-customer-evidence-verify",
  "test:crypto-customer-packet",
  "test:bittensor-customer-evidence-verify",
]) {
  assert.ok(matrix.includes(phrase), `coverage matrix should include ${phrase}`);
}

for (const toolName of [
  "matterhorn_crypto_chat",
  "matterhorn_bittensor_chat",
  "matterhorn_hyperliquid_chat",
  "matterhorn_polymarket_chat",
  "matterhorn_hyperliquid_prepare_handoff",
  "matterhorn_polymarket_prepare_handoff",
  "matterhorn_hyperliquid_verify_receipt",
  "matterhorn_polymarket_verify_receipt",
]) {
  assert.ok(mcp.includes(toolName), `MCP server should expose ${toolName}`);
}

for (const command of [
  "crypto chat",
  "bittensor chat",
  "hyperliquid chat",
  "polymarket chat",
  "hyperliquid preview-order",
  "polymarket preview-order",
  "hyperliquid receipt",
  "polymarket receipt",
]) {
  assert.ok(cli.includes(command), `CLI should expose ${command}`);
}

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "> /tmp/matterhorn-crypto-smoke.json",
  "privateKey =",
  "apiSecret =",
  "seedPhrase =",
  "mnemonic =",
]) {
  assert.equal(workflow.includes(forbidden), false, `operator loop doc must not include ${forbidden}`);
}

console.log("Matterhorn crypto agent operator loop static check passed.");
