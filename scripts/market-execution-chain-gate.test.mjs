#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const server = read("apps/server/src/server.ts");
const cryptoChat = read("apps/server/src/tools/crypto-chat.ts");
const cryptoChatTest = read("apps/server/src/tools/crypto-chat.test.ts");
const mcp = read("packages/matterhorn-work-mcp/index.mjs");
const cli = read("apps/orchestrator/src/cli.ts");
const panel = read("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx");
const matrix = read("docs/agent-control-coverage-matrix.md");
const apiDoc = read("docs/agent-control-api.md");
const readinessDoc = read("docs/market-execution-readiness-security-gate.md");
const smoke = read("scripts/customer-ready-crypto-smoke.mjs");
const smokeTest = read("scripts/customer-ready-crypto-smoke.test.mjs");
const marketsTypes = read("packages/types/src/markets.ts");

assert.equal(
  packageJson.scripts?.["test:market-execution-chain-gate"],
  "node scripts/market-execution-chain-gate.test.mjs",
  "package.json should expose the aggregate market execution-chain gate",
);

for (const [id, command] of [
  ["market.sign_request_phase1", "test:market-sign-request-phase1"],
  ["market.artifact_validation_phase2", "test:market-artifact-validation-phase2"],
  ["market.artifact_reconciliation", "test:market-artifact-reconciliation"],
  ["market.receipt_qa", "test:market-receipt-qa"],
  ["market.execution_chain_gate", "test:market-execution-chain-gate"],
]) {
  assert.ok(smoke.includes(id), `customer smoke should include ${id}`);
  assert.ok(smoke.includes(command), `customer smoke should run ${command}`);
  assert.ok(smokeTest.includes(id), `customer smoke test should assert ${id}`);
  assert.ok(smokeTest.includes(command), `customer smoke test should assert ${command}`);
}

for (const required of [
  "/api/crypto/market-execution-chain",
  "buildMarketExecutionChainResponse",
  "/api/hyperliquid/orders/handoff",
  "/api/hyperliquid/orders/external-sign-request",
  "/api/hyperliquid/orders/external-artifact/validate",
  "/api/hyperliquid/orders/receipt",
  "/api/hyperliquid/orders/submit",
  "isHyperliquidExecutionEnabled()",
  "/api/polymarket/orders/handoff",
  "/api/polymarket/orders/external-sign-request",
  "/api/polymarket/orders/external-artifact/validate",
  "/api/polymarket/orders/receipt",
  "findForbiddenHyperliquidCredentialInput(body)",
  "findForbiddenPolymarketCredentialInput(body)",
  "market_secret_rejected",
  "verifyHyperliquidReceipt",
  "verifyPolymarketReceipt",
]) {
  assert.ok(server.includes(required), `server should expose/protect chain surface: ${required}`);
}

for (const required of [
  "market_execution_chain",
  "matterhorn.market.execution-chain-guide.v1",
  "preview or handoff",
  "artifact reconciliation",
  "public receipt import",
  "Can submit: No",
  "Live submission: Off",
]) {
  assert.ok(cryptoChat.includes(required) || cryptoChatTest.includes(required), `unified crypto chat should expose safe execution-chain context: ${required}`);
}

for (const required of [
  "MARKET_EXECUTION_CHAIN_STEP_IDS",
  "export type MarketExecutionChainStepId",
  "export interface MarketExecutionChainSafety",
  "export interface MarketExecutionChainStep",
  "export interface MarketExecutionChainGuide",
  "matterhorn.market.execution-chain-guide.v1",
  "export interface MarketExecutionChainCard",
  "kind: \"market_execution_chain\"",
  "export interface MarketExecutionChainResponse",
  "canSubmit: false",
  "liveSubmissionEnabled: false",
  "acceptsRawSignatures: false",
  "acceptsSignedPayloads: false",
]) {
  assert.ok(marketsTypes.includes(required), `shared market types should expose execution-chain contract: ${required}`);
}

for (const required of [
  "matterhorn_market_execution_chain",
  "matterhorn_hyperliquid_create_sign_request",
  "matterhorn_polymarket_create_sign_request",
  "matterhorn_hyperliquid_validate_external_artifact",
  "matterhorn_polymarket_validate_external_artifact",
  "matterhorn_market_artifact_reconcile",
  "matterhorn_hyperliquid_verify_receipt",
  "matterhorn_polymarket_verify_receipt",
]) {
  assert.ok(mcp.includes(required), `MCP should expose public/redacted chain tool ${required}`);
}

for (const required of [
  "matterhorn-work crypto execution-chain",
  "/api/crypto/market-execution-chain",
  "matterhorn-work hyperliquid sign-request",
  "matterhorn-work polymarket sign-request",
  "matterhorn-work hyperliquid validate-artifact",
  "matterhorn-work polymarket validate-artifact",
  "matterhorn-work hyperliquid receipt",
  "matterhorn-work polymarket receipt",
  "testnet_external_signer",
]) {
  assert.ok(cli.includes(required) || panel.includes(required), `CLI or demo UI should expose safe chain command ${required}`);
}

for (const required of [
  "Market execution chain gate",
  "preview/handoff",
  "explicit testnet external sign-request",
  "public/redacted artifact validation",
  "artifact reconciliation",
  "public receipt import",
  "test:market-execution-chain-gate",
  "GET /api/crypto/market-execution-chain",
  "test:agent-control-mcp",
  "test:crypto-cli-fallback",
]) {
  assert.ok(matrix.includes(required), `coverage matrix should describe aggregate chain: ${required}`);
}

for (const required of [
  "Connected-Wallet Hyperliquid Execution",
  "Legacy Preview And Evidence Chain",
  "matterhorn.market.external-sign-request.v1",
  "matterhorn.market.execution-chain-guide.v1",
  "matterhorn.market.redacted-signed-artifact-envelope.v1",
  "matterhorn.market.artifact-validation.v1",
  "This legacy chain remains deliberately incomplete for agent and operator automation",
]) {
  assert.ok(readinessDoc.includes(required), `security gate doc should describe safe chain: ${required}`);
}

const smokeDoc = read("docs/customer-ready-crypto-smoke.md");
for (const required of [
  "matterhorn-work crypto execution-chain --json",
  "GET /api/crypto/market-execution-chain",
  "matterhorn.market.execution-chain-guide.v1",
]) {
  assert.ok(smokeDoc.includes(required), `customer-ready smoke doc should describe execution-chain helper: ${required}`);
}

for (const required of [
  "GET /api/crypto/market-execution-chain",
  "matterhorn.market.execution-chain-guide.v1",
  "canSubmit: false",
  "liveSubmissionEnabled: false",
]) {
  assert.ok(apiDoc.includes(required), `agent-control API doc should describe execution-chain route: ${required}`);
}

for (const required of [
  "Execution chain",
  "Testnet-only path: preview",
  "external sign request",
  "redacted artifact validation",
  "public receipt import",
  "hash-bound",
  "Can submit: No",
  "Live submission: Off",
  "Chain API",
]) {
  assert.ok(panel.includes(required), `Demo tab should explain safe execution chain: ${required}`);
}

for (const forbidden of [
  "/api/polymarket/orders/submit",
  "/orders/sign",
  "/exchange/submit",
  "submitSigned(",
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
]) {
  for (const [label, surface] of [
    ["server", server],
    ["Demo panel", panel],
    ["coverage matrix", matrix],
  ]) {
    assert.equal(surface.includes(forbidden), false, `${label} must not expose forbidden chain surface ${forbidden}`);
  }
}

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "/orders/submit",
  "/orders/sign",
  "/exchange/submit",
  "submitSigned(",
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
]) {
  for (const [label, surface] of [
    ["MCP", mcp],
    ["CLI", cli],
  ]) {
    assert.equal(surface.includes(forbidden), false, `${label} must not expose forbidden chain surface ${forbidden}`);
  }
}

assert.ok(
  server.includes('addRoute(routes, "POST", "/api/hyperliquid/orders/submit", "client"'),
  "server should expose only a client-authenticated Hyperliquid submit route",
);
assert.ok(panel.includes('"/api/hyperliquid/orders/submit"'), "web Hyperliquid ticket should call the guarded submit route");
assert.ok(panel.includes("signTypedData"), "web Hyperliquid ticket should require connected-wallet typed-data approval");
assert.ok(
  matrix.includes("submit requires a matching connected-wallet signature and deployment kill switch"),
  "coverage matrix should document the manual Hyperliquid execution exception",
);

console.log("Market execution chain aggregate gate passed.");
