#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.scripts["test:market-execution-readiness-gate"], "node scripts/market-execution-readiness-gate.test.mjs");

const types = read("packages/types/src/markets.ts");
const doc = read("docs/market-execution-readiness-security-gate.md");
const server = read("apps/server/src/server.ts");
const hyperliquid = read("apps/server/src/tools/hyperliquid.ts");
const polymarket = read("apps/server/src/tools/polymarket.ts");
const hyperliquidTest = read("apps/server/src/tools/hyperliquid.test.ts");
const polymarketTest = read("apps/server/src/tools/polymarket.test.ts");
const mcp = read("packages/matterhorn-work-mcp/index.mjs");
const cli = read("apps/orchestrator/src/cli.ts");
const smoke = read("scripts/customer-ready-crypto-smoke.mjs");

for (const required of [
  "MARKET_EXECUTION_READINESS_CONTROLS",
  "MarketExecutionReadinessChecklist",
  "futureArchitecture: \"connected_wallet_only\"",
  "liveSubmissionEnabled: boolean",
  "acceptsPrivateKeys: false",
  "acceptsApiSecrets: false",
  "acceptsRawSignatures: false",
  "acceptsSignedPayloads: false",
  "requiresSecurityReviewBeforeSubmit: true",
]) {
  assert.ok(types.includes(required), `shared market contract missing ${required}`);
}

for (const control of [
  "preview_hash_binding",
  "stale_preview_rejection",
  "policy_and_simulation",
  "wallet_review",
  "connected_wallet_only",
  "public_receipt_import",
  "audit_logging",
  "prompt_injection_rejection",
  "secret_injection_rejection",
  "compliance_bypass_rejection",
]) {
  assert.ok(types.includes(control), `types missing readiness control ${control}`);
  assert.ok(doc.includes(control), `doc missing readiness control ${control}`);
}

for (const required of [
  "Connected-Wallet Hyperliquid Execution",
  "MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED",
  "SUBMIT LIVE ORDER",
  "Polymarket has no agent-facing server submit route",
  "Reject stale previews and hash mismatches",
  "Matterhorn stores only public receipt data",
]) {
  assert.ok(doc.includes(required), `readiness doc missing ${required}`);
}

const codeSurfaces = [
  ["server", server],
  ["Hyperliquid tool", hyperliquid],
  ["Polymarket tool", polymarket],
  ["MCP", mcp],
  ["CLI", cli],
];

for (const [label, text] of codeSurfaces) {
  for (const forbidden of [
    "/api/polymarket/orders/submit",
    "/api/hyperliquid/orders/sign",
    "/api/polymarket/orders/sign",
    "/api/hyperliquid/exchange/submit",
    "/api/polymarket/exchange/submit",
    "submitOrder(",
    "signOrder(",
    "privateKey =",
    "apiSecret =",
  ]) {
    assert.ok(!text.includes(forbidden), `${label} must not contain ${forbidden}`);
  }
}

for (const required of [
  "/api/hyperliquid/orders/execution-intent",
  "/api/hyperliquid/orders/submit",
  "hyperliquid_execution_disabled",
]) {
  assert.ok(server.includes(required), `server should expose guarded Hyperliquid execution surface ${required}`);
}

const liveExecution = read("apps/server/src/tools/hyperliquid-live-execution.ts");
for (const required of [
  "recoverTypedDataAddress",
  "hashHyperliquidAction(action, nonce, null, expiresAtMs)",
  "oneTimeSubmission: true",
  "privateKeysAccepted: false",
  "apiSecretsAccepted: false",
]) {
  assert.ok(liveExecution.includes(required), `Hyperliquid live execution missing ${required}`);
}

assert.ok(
  [hyperliquid, polymarket, server, mcp, cli].join("\n").includes("canSubmit: false")
    || [hyperliquid, polymarket, server, mcp, cli].join("\n").includes("canSubmit=false"),
  "market surfaces should preserve canSubmit=false language",
);

for (const required of [
  "market_secret_rejected",
  "findForbiddenHyperliquidCredentialInput",
  "findForbiddenPolymarketCredentialInput",
  "verifyHyperliquidReceipt",
  "verifyPolymarketReceipt",
]) {
  assert.ok(server.includes(required), `server missing ${required}`);
}

for (const required of [
  "rejects credential-shaped payload keys",
  "credential-shaped prompt text is rejected",
  "never accepts signing material in a receipt",
  "rejects a receipt that does not match the handoff",
]) {
  assert.ok(hyperliquidTest.includes(required), `Hyperliquid tests missing ${required}`);
}

for (const required of [
  "rejects credential-shaped payload keys",
  "credential-shaped prompt text is rejected",
  "never accepts signing material in a receipt",
  "rejects a receipt that does not match the handoff",
  "geoblock blocked -> blocked_by_compliance with no executable preview",
  "blocked preview carries null risk context",
]) {
  assert.ok(polymarketTest.includes(required), `Polymarket tests missing ${required}`);
}

assert.ok(smoke.includes("test:market-execution-readiness-gate"), "customer-ready smoke should include execution-readiness gate");

console.log("Market execution-readiness security gate passed.");
