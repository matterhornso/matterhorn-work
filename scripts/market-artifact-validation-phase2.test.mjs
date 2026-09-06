#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.scripts["test:market-artifact-validation-phase2"], "node scripts/market-artifact-validation-phase2.test.mjs");

const types = read("packages/types/src/markets.ts");
const doc = read("docs/market-artifact-validation-phase2.md");
const server = read("apps/server/src/server.ts");
const hyperliquid = read("apps/server/src/tools/hyperliquid.ts");
const hyperliquidLiveExecution = read("apps/server/src/tools/hyperliquid-live-execution.ts");
const polymarket = read("apps/server/src/tools/polymarket.ts");
const hyperliquidTest = read("apps/server/src/tools/hyperliquid.test.ts");
const polymarketTest = read("apps/server/src/tools/polymarket.test.ts");
const mcp = read("packages/matterhorn-work-mcp/index.mjs");
const mcpSmoke = read("packages/matterhorn-work-mcp/test-smoke.mjs");
const cli = read("apps/orchestrator/src/cli.ts");
const cliSmoke = read("scripts/crypto-cli-fallback.test.mjs");
const smoke = read("scripts/customer-ready-crypto-smoke.mjs");
const smokeTest = read("scripts/customer-ready-crypto-smoke.test.mjs");
const matrix = read("docs/agent-control-coverage-matrix.md");

for (const required of [
  "MarketRedactedSignedArtifactEnvelope",
  "matterhorn.market.redacted-signed-artifact-envelope.v1",
  "MarketArtifactValidationResult",
  "matterhorn.market.artifact-validation.v1",
  "publicAuditReceiptCandidate: MarketReceipt | null",
  "signedArtifactAccepted: false",
  "submitSignedAllowedByContract: false",
  "liveSubmissionEnabled: false",
]) {
  assert.ok(types.includes(required), `shared market types missing ${required}`);
}

for (const required of [
  "Market Artifact Validation Phase 2",
  "/api/hyperliquid/orders/external-artifact/validate",
  "/api/polymarket/orders/external-artifact/validate",
  "matterhorn_hyperliquid_validate_external_artifact",
  "matterhorn_polymarket_validate_external_artifact",
  "matterhorn-work hyperliquid validate-artifact --sign-request-file <path> --artifact-file <path>",
  "matterhorn-work polymarket validate-artifact --sign-request-file <path> --artifact-file <path>",
  "matterhorn.market.redacted-signed-artifact-envelope.v1",
  "matterhorn.market.artifact-validation.v1",
  "signedArtifactRedacted: true",
  "canSubmit: false",
  "liveSubmissionEnabled: false",
  "The receipt candidate is not proof of exchange submission.",
]) {
  assert.ok(doc.includes(required), `Phase 2 doc missing ${required}`);
}

for (const required of [
  "validateHyperliquidRedactedArtifactEnvelope",
  "matterhorn.market.artifact-validation.v1",
  "accepted_public_metadata",
  "findRawHyperliquidArtifactMaterial",
  "Public audit receipt candidate only",
  "submitSignedAllowedByContract: false",
]) {
  assert.ok(hyperliquid.includes(required), `Hyperliquid tool missing ${required}`);
}

for (const required of [
  "validatePolymarketRedactedArtifactEnvelope",
  "matterhorn.market.artifact-validation.v1",
  "accepted_public_metadata",
  "findRawPolymarketArtifactMaterial",
  "Public audit receipt candidate only",
  "submitSignedAllowedByContract: false",
]) {
  assert.ok(polymarket.includes(required), `Polymarket tool missing ${required}`);
}

for (const required of [
  "/api/hyperliquid/orders/external-artifact/validate",
  "/api/polymarket/orders/external-artifact/validate",
  "wallet_airlock_required",
]) {
  assert.ok(server.includes(required), `server missing ${required}`);
}

const hyperliquidRouteStart = server.indexOf('"/api/hyperliquid/orders/external-artifact/validate"');
const hyperliquidRouteEnd = server.indexOf('"/api/hyperliquid/orders/receipt"', hyperliquidRouteStart);
const hyperliquidRoute = hyperliquidRouteStart >= 0 ? server.slice(hyperliquidRouteStart, hyperliquidRouteEnd > hyperliquidRouteStart ? hyperliquidRouteEnd : server.length) : "";
const polymarketRouteStart = server.indexOf('"/api/polymarket/orders/external-artifact/validate"');
const polymarketRouteEnd = server.indexOf('"/api/polymarket/orders/receipt"', polymarketRouteStart);
const polymarketRoute = polymarketRouteStart >= 0 ? server.slice(polymarketRouteStart, polymarketRouteEnd > polymarketRouteStart ? polymarketRouteEnd : server.length) : "";

for (const [label, route] of [
  ["Hyperliquid", hyperliquidRoute],
  ["Polymarket", polymarketRoute],
]) {
  assert.ok(route.includes('"client", async () =>'), `${label} retired artifact route must not read or process the request body`);
  assert.ok(route.includes('ApiError(409, "wallet_airlock_required"'), `${label} retired artifact route must fail closed behind the wallet airlock`);
  assert.match(route, /connected[- ](?:Polygon-)?wallet ticket/i, `${label} retired route should direct users to connected-wallet receipt import`);
  for (const forbidden of ["readJsonBody", "sanitizeMarketArtifactValidationInputForSecretScan", "validateHyperliquidRedactedArtifactEnvelope", "validatePolymarketRedactedArtifactEnvelope", "/orders/submit", "/orders/sign", "/exchange/submit", "rawSignature", "signedPayload", "submitSigned"]) {
    assert.ok(!route.includes(forbidden), `${label} artifact route must not include ${forbidden}`);
  }
}

for (const required of [
  "matterhorn_hyperliquid_validate_external_artifact",
  "matterhorn_polymarket_validate_external_artifact",
  "wallet_airlock_required",
]) {
  assert.ok(mcp.includes(required), `MCP compatibility stub missing ${required}`);
  assert.ok(mcpSmoke.includes(required), `MCP smoke missing ${required}`);
}
for (const retired of [
  "matterhorn_hyperliquid_validate_external_artifact",
  "matterhorn_polymarket_validate_external_artifact",
]) {
  assert.equal(mcp.split(retired).length - 1, 1, `${retired} must exist only as an unadvertised compatibility switch case`);
}

for (const required of [
  "matterhorn-work hyperliquid validate-artifact --sign-request-file <path> --artifact-file <path>",
  "matterhorn-work polymarket validate-artifact --sign-request-file <path> --artifact-file <path>",
  "/api/hyperliquid/orders/external-artifact/validate",
  "/api/polymarket/orders/external-artifact/validate",
]) {
  assert.ok(cli.includes(required), `CLI missing ${required}`);
}

for (const required of [
  "hyperliquid validate-artifact external metadata only",
  "polymarket validate-artifact external metadata only",
]) {
  assert.ok(cliSmoke.includes(required), `CLI fallback missing ${required}`);
}

for (const required of [
  "Phase 2 validates redacted artifact metadata",
  "Phase 2 rejects hash mismatch and raw artifact material",
]) {
  assert.ok(hyperliquidTest.includes(required), `Hyperliquid tests missing ${required}`);
  assert.ok(polymarketTest.includes(required), `Polymarket tests missing ${required}`);
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
    "submitSignedOrder(",
    "signOrder(",
    "privateKey =",
    "apiSecret =",
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
  "submitSignedOrder(",
  "signOrder(",
  "privateKey =",
  "apiSecret =",
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
assert.ok(hyperliquidLiveExecution.includes("signatureStored: false"), "manual Hyperliquid receipts must state that signatures are not stored");

for (const required of [
  "market.artifact_validation_phase2",
  "test:market-artifact-validation-phase2",
]) {
  assert.ok(smoke.includes(required), `customer-ready smoke missing ${required}`);
  assert.ok(smokeTest.includes(required), `customer-ready smoke test missing ${required}`);
  assert.ok(matrix.includes(required), `coverage matrix missing ${required}`);
}

console.log("Market artifact validation Phase 2 gate passed.");
