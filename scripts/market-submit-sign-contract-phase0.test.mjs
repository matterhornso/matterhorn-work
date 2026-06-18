#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(
  packageJson.scripts["test:market-submit-sign-contract-phase0"],
  "node scripts/market-submit-sign-contract-phase0.test.mjs",
);

const types = read("packages/types/src/markets.ts");
const doc = read("docs/market-submit-sign-phase0-contract.md");
const smoke = read("scripts/customer-ready-crypto-smoke.mjs");
const smokeTest = read("scripts/customer-ready-crypto-smoke.test.mjs");
const matrix = read("docs/agent-control-coverage-matrix.md");

for (const required of [
  "MARKET_EXECUTION_MODES",
  "testnet_external_signer",
  "mainnet_external_signer",
  "MARKET_SUBMIT_SIGN_PHASE0_CONTROLS",
  "MarketSignedSubmissionEnvelope",
  "matterhorn.market.signed-submission-envelope.v1",
  "MarketExecutionAuditRecord",
  "matterhorn.market.execution-audit.v1",
  "MARKET_ALWAYS_FORBIDDEN_EXECUTION_FIELDS",
  "MARKET_SIGNED_ARTIFACT_FIELDS_REQUIRE_ENVELOPE",
  "MARKET_FUTURE_EXECUTION_ROUTE_NAMES",
]) {
  assert.ok(types.includes(required), `shared market types missing ${required}`);
}

for (const control of [
  "explicit_execution_mode",
  "route_level_kill_switch",
  "network_allowlist",
  "preview_hash_binding",
  "handoff_hash_binding",
  "signed_artifact_hash_binding",
  "stale_preview_rejection",
  "operator_confirmation",
  "external_signer_only",
  "no_custody",
  "no_secret_storage",
  "compliance_recheck",
  "audit_log_redaction",
  "public_receipt_only",
]) {
  assert.ok(types.includes(control), `types missing Phase 0 control ${control}`);
}

for (const forbiddenField of [
  "seedPhrase",
  "mnemonic",
  "privateKey",
  "walletExport",
  "apiSecret",
  "apiKeySecret",
  "passphrase",
]) {
  assert.ok(types.includes(forbiddenField), `types missing forbidden field ${forbiddenField}`);
}

for (const required of [
  "Market Submit/Sign Phase 0 Contract",
  "does not enable live submission",
  "https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint",
  "https://docs.polymarket.com/trading/orders/create",
  "https://docs.polymarket.com/api-reference/authentication",
  "testnet_external_signer",
  "mainnet_external_signer",
  "submit-signed",
  "no private key",
  "no seed phrase",
  "no stored API secret",
  "stale preview",
  "hash mismatch",
  "kill switch",
  "Matterhorn-submit signed order",
  "client-submit receipt-only",
  "matterhorn.market.signed-submission-envelope.v1",
  "matterhorn.market.execution-audit.v1",
]) {
  assert.ok(doc.includes(required), `Phase 0 contract doc missing ${required}`);
}

for (const routeName of [
  "hyperliquid.orders.sign_request",
  "hyperliquid.orders.submit_signed",
  "hyperliquid.orders.cancel_sign_request",
  "hyperliquid.orders.cancel_submit_signed",
  "polymarket.orders.sign_request",
  "polymarket.orders.submit_signed",
  "polymarket.orders.cancel_sign_request",
  "polymarket.orders.cancel_submit_signed",
]) {
  assert.ok(types.includes(routeName), `types missing future route name ${routeName}`);
  assert.ok(doc.includes(routeName), `doc missing future route name ${routeName}`);
}

const activeCodeSurfaces = [
  ["server", read("apps/server/src/server.ts")],
  ["Hyperliquid tool", read("apps/server/src/tools/hyperliquid.ts")],
  ["Polymarket tool", read("apps/server/src/tools/polymarket.ts")],
  ["MCP", read("packages/matterhorn-work-mcp/index.mjs")],
  ["CLI", read("apps/orchestrator/src/cli.ts")],
];

for (const [label, text] of activeCodeSurfaces) {
  for (const forbidden of [
    "/api/hyperliquid/orders/submit-signed",
    "/api/polymarket/orders/submit-signed",
    "/api/hyperliquid/orders/sign-request",
    "/api/polymarket/orders/sign-request",
    "/api/hyperliquid/orders/cancel-submit-signed",
    "/api/polymarket/orders/cancel-submit-signed",
    "submitSignedOrder(",
    "signRequest(",
    "createMarketSubmission(",
  ]) {
    assert.ok(!text.includes(forbidden), `${label} must not contain active ${forbidden}`);
  }
}

for (const required of [
  "market.submit_sign_phase0_contract",
  "test:market-submit-sign-contract-phase0",
]) {
  assert.ok(smoke.includes(required), `customer-ready smoke missing ${required}`);
  assert.ok(smokeTest.includes(required), `customer-ready smoke test missing ${required}`);
  assert.ok(matrix.includes(required), `coverage matrix missing ${required}`);
}

const commandText = smoke.match(/offlineStages = \[[\s\S]*?\];/)?.[0] || "";
for (const banned of ["/orders/submit", "/orders/sign", "/exchange/submit"]) {
  assert.ok(!commandText.includes(banned), `offline smoke command list must not reference ${banned}`);
}

console.log("Market submit/sign Phase 0 contract gate passed.");
