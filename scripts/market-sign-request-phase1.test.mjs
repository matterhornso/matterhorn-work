#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.scripts["test:market-sign-request-phase1"], "node scripts/market-sign-request-phase1.test.mjs");

const types = read("packages/types/src/markets.ts");
const doc = read("docs/market-sign-request-phase1.md");
const server = read("apps/server/src/server.ts");
const hyperliquid = read("apps/server/src/tools/hyperliquid.ts");
const hyperliquidLiveExecution = read("apps/server/src/tools/hyperliquid-live-execution.ts");
const polymarket = read("apps/server/src/tools/polymarket.ts");
const mcp = read("packages/matterhorn-work-mcp/index.mjs");
const cli = read("apps/orchestrator/src/cli.ts");
const smoke = read("scripts/customer-ready-crypto-smoke.mjs");
const smokeTest = read("scripts/customer-ready-crypto-smoke.test.mjs");
const matrix = read("docs/agent-control-coverage-matrix.md");

for (const required of [
  "MarketExternalSignRequest",
  "matterhorn.market.external-sign-request.v1",
  "readyToSign: boolean",
  "signedArtifactAccepted: false",
  "submitSignedAllowedByContract: false",
  "liveSubmissionEnabled: false",
]) {
  assert.ok(types.includes(required), `shared market types missing ${required}`);
}

for (const required of [
  "Market Sign Request Phase 1",
  "/api/hyperliquid/orders/external-sign-request",
  "/api/polymarket/orders/external-sign-request",
  "matterhorn_hyperliquid_create_sign_request",
  "matterhorn_polymarket_create_sign_request",
  "matterhorn-work hyperliquid sign-request --execution-mode testnet_external_signer",
  "matterhorn-work polymarket sign-request --execution-mode testnet_external_signer",
  "executionMode=testnet_external_signer",
  "canSubmit: false",
  "liveSubmissionEnabled: false",
  "submitSignedAllowedByContract: false",
  "signedArtifactAccepted: false",
  "Phase 2 can add signed-artifact envelope validation only after these gates stay green.",
]) {
  assert.ok(doc.includes(required), `Phase 1 doc missing ${required}`);
}

for (const required of [
  "prepareHyperliquidExternalSignRequestFromRequest",
  "buildHyperliquidExternalSignRequest",
  "matterhorn.market.external-sign-request.v1",
  "executionMode=testnet_external_signer",
  "submitSignedAllowedByContract: false",
  "signedArtifactAccepted: false",
]) {
  assert.ok(hyperliquid.includes(required), `Hyperliquid tool missing ${required}`);
}

for (const required of [
  "preparePolymarketExternalSignRequestFromRequest",
  "buildPolymarketExternalSignRequest",
  "matterhorn.market.external-sign-request.v1",
  "executionMode=testnet_external_signer",
  "submitSignedAllowedByContract: false",
  "signedArtifactAccepted: false",
]) {
  assert.ok(polymarket.includes(required), `Polymarket tool missing ${required}`);
}

for (const required of [
  "/api/hyperliquid/orders/external-sign-request",
  "/api/polymarket/orders/external-sign-request",
  "wallet_airlock_required",
]) {
  assert.ok(server.includes(required), `server missing ${required}`);
}

const hyperliquidRouteStart = server.indexOf('"/api/hyperliquid/orders/external-sign-request"');
const hyperliquidRouteEnd = server.indexOf('"/api/hyperliquid/orders/external-artifact/validate"', hyperliquidRouteStart);
const hyperliquidRoute = hyperliquidRouteStart >= 0 ? server.slice(hyperliquidRouteStart, hyperliquidRouteEnd > hyperliquidRouteStart ? hyperliquidRouteEnd : server.length) : "";
const polymarketRouteStart = server.indexOf('"/api/polymarket/orders/external-sign-request"');
const polymarketRouteEnd = server.indexOf('"/api/polymarket/orders/external-artifact/validate"', polymarketRouteStart);
const polymarketRoute = polymarketRouteStart >= 0 ? server.slice(polymarketRouteStart, polymarketRouteEnd > polymarketRouteStart ? polymarketRouteEnd : server.length) : "";

for (const [label, route] of [
  ["Hyperliquid", hyperliquidRoute],
  ["Polymarket", polymarketRoute],
]) {
  assert.ok(route.includes('"client", async () =>'), `${label} legacy route must not read or process the request body`);
  assert.ok(route.includes('ApiError(409, "wallet_airlock_required"'), `${label} legacy route must fail closed behind the wallet airlock`);
  assert.match(route, /connected[^.]*wallet/i, `${label} legacy route should direct users to connected-wallet review`);
  for (const forbidden of ["readJsonBody", "prepareHyperliquidExternalSignRequestFromRequest", "preparePolymarketExternalSignRequestFromRequest", "/orders/submit", "/orders/sign", "/exchange/submit", "signedArtifact", "rawSignature"]) {
    assert.ok(!route.includes(forbidden), `${label} sign-request route must not include ${forbidden}`);
  }
}

for (const required of [
  "matterhorn_hyperliquid_create_sign_request",
  "matterhorn_polymarket_create_sign_request",
  "wallet_airlock_required",
  "connected-wallet ticket",
]) {
  assert.ok(mcp.includes(required), `MCP compatibility stub missing ${required}`);
}
for (const retired of [
  "matterhorn_hyperliquid_create_sign_request",
  "matterhorn_polymarket_create_sign_request",
]) {
  assert.equal(mcp.split(retired).length - 1, 1, `${retired} must exist only as an unadvertised compatibility switch case`);
}

for (const required of [
  "matterhorn-work hyperliquid sign-request --execution-mode testnet_external_signer",
  "matterhorn-work polymarket sign-request --execution-mode testnet_external_signer",
  "/api/hyperliquid/orders/external-sign-request",
  "/api/polymarket/orders/external-sign-request",
]) {
  assert.ok(cli.includes(required), `CLI missing ${required}`);
}

for (const [label, text] of [
  ["MCP", mcp],
  ["CLI", cli],
]) {
  for (const forbidden of [
    "/api/hyperliquid/orders/sign",
    "/api/polymarket/orders/sign",
    "/api/hyperliquid/orders/submit",
    "/api/polymarket/orders/submit",
    "/api/hyperliquid/exchange/submit",
    "/api/polymarket/exchange/submit",
  ]) {
    assert.ok(!text.includes(forbidden), `${label} must not contain ${forbidden}`);
  }
}

for (const forbidden of [
  "/api/hyperliquid/orders/sign",
  "/api/polymarket/orders/sign",
  "/api/polymarket/orders/submit",
  "/api/hyperliquid/exchange/submit",
  "/api/polymarket/exchange/submit",
]) {
  assert.ok(!server.includes(forbidden), `server must not contain ${forbidden}`);
}

for (const required of [
  'addRoute(routes, "POST", "/api/hyperliquid/orders/submit", "client"',
  "isHyperliquidExecutionEnabled()",
  "hyperliquid_execution_disabled",
  "hyperliquidExecutionIntentStore.submit",
]) {
  assert.ok(server.includes(required), `manual Hyperliquid submit route missing ${required}`);
}

for (const required of [
  'new Set(["intentId", "signerAddress", "signature", "liveConfirmation"])',
  "Execution intent was not found or has expired",
  "This execution intent is already being submitted",
  "Execution intent expired",
  "recoverTypedDataAddress",
  "Wallet signature does not authorize this exact action intent",
  "input.liveConfirmation !== intent.confirmation.phrase",
  'stored.state = "submitting"',
  'stored.state = "complete"',
  "signatureStored: false",
]) {
  assert.ok(hyperliquidLiveExecution.includes(required), `manual Hyperliquid execution safety missing ${required}`);
}

for (const required of [
  "market.sign_request_phase1",
  "test:market-sign-request-phase1",
]) {
  assert.ok(smoke.includes(required), `customer-ready smoke missing ${required}`);
  assert.ok(smokeTest.includes(required), `customer-ready smoke test missing ${required}`);
  assert.ok(matrix.includes(required), `coverage matrix missing ${required}`);
}

console.log("Market sign-request Phase 1 gate passed.");
