#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const packageJson = JSON.parse(read("package.json"));
const server = read("apps/server/src/server.ts");
const readinessHelper = read("apps/server/src/tools/market-execution-readiness.ts");
const mcp = read("packages/matterhorn-work-mcp/index.mjs");
const cli = read("apps/orchestrator/src/cli.ts");
const matrix = read("docs/agent-control-coverage-matrix.md");
const marketsTypes = read("packages/types/src/markets.ts");
const panel = read("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx");

assert.equal(
  packageJson.scripts?.["test:market-execution-readiness-api"],
  "node scripts/market-execution-readiness-api.test.mjs",
  "package.json should expose the market execution-readiness API gate",
);

const routeStart = server.indexOf('"/api/crypto/market-execution-readiness"');
const routeEnd = server.indexOf('"/api/crypto/readiness"', routeStart);
const route = routeStart >= 0 ? server.slice(routeStart, routeEnd > routeStart ? routeEnd : server.length) : "";
assert.ok(route, "server should expose /api/crypto/market-execution-readiness");
assert.ok(route.includes("buildMarketExecutionReadinessResponse"), "server route should use the shared execution-readiness builder");

const contractSurface = `${route}\n${readinessHelper}`;

for (const phrase of [
  "matterhorn.market.execution-readiness.v1",
  "readyForLiveSubmission: false",
  'status: "disabled"',
  'venue: "hyperliquid"',
  'venue: "polymarket"',
  "external_sign_request",
  "redacted_artifact_validation",
  "public_receipt_import",
  "route_level_kill_switch",
  "live_submit_routes",
  "independent security review",
  "operator kill-switch rehearsal",
  "nonCustodial: true",
  "liveSubmissionEnabled: false",
  "canSubmit: false",
  "signsOrSubmits: false",
  "acceptsSecrets: false",
]) {
  assert.ok(contractSurface.includes(phrase), `execution-readiness contract should include ${phrase}`);
}

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "/api/hyperliquid/orders/sign",
  "/api/polymarket/orders/sign",
  "privateKey",
  "apiSecret",
  "seedPhrase",
  "signedPayload",
  "rawSignature",
]) {
  assert.equal(route.includes(forbidden), false, `execution-readiness route must not introduce forbidden surface ${forbidden}`);
}

assert.ok(mcp.includes("matterhorn_market_execution_readiness"), "MCP should expose matterhorn_market_execution_readiness");
assert.ok(mcp.includes("/api/crypto/market-execution-readiness"), "MCP tool should call the execution-readiness API");
assert.ok(cli.includes("matterhorn-work crypto execution-readiness"), "CLI help should list crypto execution-readiness");
assert.ok(cli.includes("/api/crypto/market-execution-readiness"), "CLI should call the execution-readiness API");
assert.ok(matrix.includes("/api/crypto/market-execution-readiness"), "coverage matrix should list the execution-readiness API");
assert.ok(matrix.includes("matterhorn_market_execution_readiness"), "coverage matrix should list the execution-readiness MCP tool");
assert.ok(matrix.includes("matterhorn-work crypto execution-readiness"), "coverage matrix should list the execution-readiness CLI command");

for (const phrase of [
  "export interface MarketExecutionReadinessReport",
  "readyForLiveSubmission: false",
  "export interface MarketExecutionReadinessResponse",
  "export interface MarketExecutionReadinessCard",
  "liveSubmissionEnabled: false",
  "acceptsRawSignatures: false",
  "acceptsSignedPayloads: false",
]) {
  assert.ok(marketsTypes.includes(phrase), `shared market types should expose ${phrase}`);
}

assert.ok(
  panel.includes("MarketExecutionReadinessReport"),
  "customer demo UI should consume the shared execution-readiness report contract",
);

console.log("Market execution-readiness API static check passed.");
