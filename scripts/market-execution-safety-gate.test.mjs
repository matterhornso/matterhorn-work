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
    if (text.includes(needle)) pass(`${path} contains ${needle}`);
    else fail(`${path} contains ${needle}`, "missing");
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

function assertNoSecretSchemaFields(label, text) {
  for (const forbidden of ["apiSecret", "api_secret", "privateKey", "private_key", "seed", "mnemonic", "signedPayload", "signed_payload"]) {
    if (text.includes(forbidden)) fail(`${label} excludes schema field ${forbidden}`, "present");
    else pass(`${label} excludes schema field ${forbidden}`);
  }
}

function assertNoSubmitRoute(label, text) {
  for (const forbidden of ["/orders/submit", "/orders/sign", "/exchange/submit"]) {
    if (text.includes(forbidden)) fail(`${label} excludes ${forbidden}`, "present");
    else pass(`${label} excludes ${forbidden}`);
  }
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["test:market-execution-safety-gate"] === "node scripts/market-execution-safety-gate.test.mjs") {
  pass("package.json exposes test:market-execution-safety-gate");
} else {
  fail("package.json exposes test:market-execution-safety-gate", "missing or mismatched script");
}

const sharedMarketContract = mustContain("packages/types/src/markets.ts", [
  "liveSubmissionEnabled: false",
  "allowsPrivateKeyImport: false",
  "allowsApiSecretStorage: false",
  "external_signer_required",
  "matterhorn.market.receipt.v1",
  "MARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN",
]);

if (/liveSubmissionEnabled:\s*true/.test(sharedMarketContract)) {
  fail("shared market contract never enables live submission", "found liveSubmissionEnabled: true");
} else {
  pass("shared market contract never enables live submission");
}

const hyperliquidTool = mustContain("apps/server/src/tools/hyperliquid.ts", [
  "findForbiddenHyperliquidCredentialInput",
  "buildHyperliquidSigningHandoff",
  "verifyHyperliquidReceipt",
  "signerPolicy: \"external_signer_required\"",
  "canSubmit: false",
  "externalSignerOnly: true",
  "matterhorn.market.receipt.v1",
  "requiresClientValidation: true",
  "clientMustCompute",
  "Matterhorn does not sign, submit, or hold keys",
  "Rejects any signing material and never accepts a signature",
]);

if (/canSubmit:\s*true/.test(hyperliquidTool)) fail("Hyperliquid tool never enables canSubmit", "found canSubmit: true");
else pass("Hyperliquid tool never enables canSubmit");
assertNoSubmitRoute("Hyperliquid tool", hyperliquidTool);
for (const forbidden of ["submitOrder(", "signOrder(", "privateKey =", "apiSecret ="]) {
  if (hyperliquidTool.includes(forbidden)) fail(`Hyperliquid tool excludes ${forbidden}`, "present");
  else pass(`Hyperliquid tool excludes ${forbidden}`);
}

const polymarketTool = mustContain("apps/server/src/tools/polymarket.ts", [
  "findForbiddenPolymarketCredentialInput",
  "buildPolymarketSigningHandoff",
  "verifyPolymarketReceipt",
  "signerPolicy: \"external_signer_required\"",
  "canSubmit: false",
  "externalSignerOnly: true",
  "matterhorn.market.receipt.v1",
  "requiresClientValidation: true",
  "walletMustSet",
  "Matterhorn does not sign, submit, or hold keys",
  "Rejects any signing material in the receipt and never accepts a signature",
]);

if (/canSubmit:\s*true/.test(polymarketTool)) fail("Polymarket tool never enables canSubmit", "found canSubmit: true");
else pass("Polymarket tool never enables canSubmit");
assertNoSubmitRoute("Polymarket tool", polymarketTool);
for (const forbidden of ["submitOrder(", "signOrder(", "privateKey =", "apiSecret ="]) {
  if (polymarketTool.includes(forbidden)) fail(`Polymarket tool excludes ${forbidden}`, "present");
  else pass(`Polymarket tool excludes ${forbidden}`);
}

// `signatureType` is a legitimate Polymarket EIP-712 order field. The safety
// gate rejects secret fields and raw signatures without blocking this template.
if (polymarketTool.includes("signatureType")) pass("Polymarket typed-data may include signatureType as public EIP-712 metadata");
else fail("Polymarket typed-data may include signatureType as public EIP-712 metadata", "missing");

const server = mustContain("apps/server/src/server.ts", [
  "/api/hyperliquid/orders/handoff",
  "/api/hyperliquid/orders/receipt",
  "/api/polymarket/orders/handoff",
  "/api/polymarket/orders/receipt",
  "findForbiddenHyperliquidCredentialInput",
  "findForbiddenPolymarketCredentialInput",
  "market_secret_rejected",
  "/api/hyperliquid/orders/execution-intent",
  "/api/hyperliquid/orders/submit",
  "isHyperliquidExecutionEnabled",
  "hyperliquid_execution_disabled",
]);

mustNotContain("apps/server/src/server.ts", [
  "/api/polymarket/orders/submit",
  "/api/polymarket/orders/sign",
]);

const hyperliquidRoutes = sectionBetween(server, '"/api/hyperliquid/markets"', '"/api/polymarket/markets"');
mustContain("apps/server/src/server.ts", [
  "Hyperliquid handoff input must not contain API secrets, private keys, signatures, or signed payloads",
  "Hyperliquid receipt must contain only public status",
  "verifyHyperliquidReceipt",
]);
for (const required of [
  "/api/hyperliquid/orders/execution-intent",
  "/api/hyperliquid/orders/submit",
  "Unexpected execution-intent field",
  "requireClientScope(ctx, \"collaborator\")",
  "hyperliquidExecutionOwnerKey(ctx)",
]) {
  if (hyperliquidRoutes.includes(required)) pass(`Hyperliquid server routes contain ${required}`);
  else fail(`Hyperliquid server routes contain ${required}`, "missing");
}

const polymarketRoutes = sectionBetween(server, '"/api/polymarket/markets"', '"/api/bittensor/subnets"');
mustContain("apps/server/src/server.ts", [
  "Polymarket handoff input must not contain API secrets, private keys, signatures, or signed payloads",
  "Polymarket receipt must contain only public status",
  "verifyPolymarketReceipt",
]);
assertNoSubmitRoute("Polymarket server routes", polymarketRoutes);

const hyperliquidExecution = mustContain("apps/server/src/tools/hyperliquid-live-execution.ts", [
  "recoverTypedDataAddress",
  "Wallet signature does not authorize this exact action intent",
  "oneTimeSubmission: true",
  "privateKeysAccepted: false",
  "apiSecretsAccepted: false",
  "expiresAfter: Date.parse(intent.expiresAt)",
  "hashHyperliquidAction(action, nonce, null, expiresAtMs)",
  "This execution intent is already being submitted",
  "SUBMIT LIVE ORDER",
  "MATTERHORN_HYPERLIQUID_MAX_ORDER_USDC",
  "MAX_PENDING_INTENTS_PER_OWNER",
  "MAX_STORED_INTENTS",
  "Too many pending action confirmations",
  "action-review queue is temporarily full",
  "different signed-in session",
  "this.lastNonce + 1",
]);
for (const forbidden of ["privateKey =", "apiSecret =", "seedPhrase", "mnemonic"]) {
  if (hyperliquidExecution.includes(forbidden)) fail(`Hyperliquid execution excludes ${forbidden}`, "present");
  else pass(`Hyperliquid execution excludes ${forbidden}`);
}

const mcp = mustContain("packages/matterhorn-work-mcp/index.mjs", [
  "matterhorn_hyperliquid_prepare_handoff",
  "matterhorn_hyperliquid_verify_receipt",
  "matterhorn_polymarket_prepare_handoff",
  "matterhorn_polymarket_verify_receipt",
  "/api/hyperliquid/orders/handoff",
  "/api/hyperliquid/orders/receipt",
  "/api/polymarket/orders/handoff",
  "/api/polymarket/orders/receipt",
]);

const hyperliquidMcpSection = sectionBetween(mcp, "matterhorn_hyperliquid_chat", "matterhorn_polymarket_chat");
assertNoSecretSchemaFields("Hyperliquid MCP section", hyperliquidMcpSection);
assertNoSubmitRoute("Hyperliquid MCP section", hyperliquidMcpSection);

const polymarketMcpSection = sectionBetween(mcp, "matterhorn_polymarket_chat", "matterhorn_bittensor_chat");
assertNoSecretSchemaFields("Polymarket MCP section", polymarketMcpSection);
assertNoSubmitRoute("Polymarket MCP section", polymarketMcpSection);

const cli = mustContain("apps/orchestrator/src/cli.ts", [
  "matterhorn-work hyperliquid handoff",
  "matterhorn-work hyperliquid receipt",
  "matterhorn-work polymarket handoff",
  "matterhorn-work polymarket receipt",
  "assertNoHyperliquidSecrets",
  "assertNoPolymarketSecrets",
  "/api/hyperliquid/orders/handoff",
  "/api/hyperliquid/orders/receipt",
  "/api/polymarket/orders/handoff",
  "/api/polymarket/orders/receipt",
]);

assertNoSubmitRoute("market CLI sections", sectionBetween(cli, "matterhorn-work hyperliquid", "matterhorn-work bittensor"));

mustContain("docs/hyperliquid-read-preview.md", [
  "Agent Draft And Wallet Handoff",
  "Matterhorn does **not** compute",
  "Private keys, API secrets, signatures, signed actions, or signed payloads",
  "It does not accept API secrets, private keys, signatures, or signed payloads",
  "canSubmit: false",
  "requiresClientValidation",
]);

mustContain("docs/market-execution-readiness-security-gate.md", [
  "Connected-Wallet Hyperliquid Execution",
  "MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED",
  "SUBMIT LIVE ORDER",
  "Connected-Wallet Polymarket Ticket",
  "SUBMIT POLYMARKET ORDER",
  "Polymarket has no agent-facing server submit route",
  "eligible EOA buy, sell, and cancel actions",
]);

mustContain("docs/polymarket-read-preview.md", [
  "Agent Draft And Wallet Handoff",
  "Separate browser-wallet buy, sell, and cancel ticket",
  "The agent handoff itself cannot become an order",
  "Private keys, API secrets, signatures, signed actions, or signed payloads",
  "canSubmit: false",
  "requiresClientValidation",
]);

if (failures > 0) {
  console.error(`Market execution safety gate failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("Market execution safety gate passed.");
