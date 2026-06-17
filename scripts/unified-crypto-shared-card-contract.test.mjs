#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function parseConstArray(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`));
  assert.ok(match, `could not find ${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

const rootPackage = JSON.parse(read("package.json"));
const cryptoChat = read("apps/server/src/tools/crypto-chat.ts");
const cryptoChatTest = read("apps/server/src/tools/crypto-chat.test.ts");
const agentLoop = read("docs/agent-crypto-operator-loop.md");
const buildPlan = read("docs/customer-ready-crypto-build-plan.md");
const matrix = read("docs/agent-control-coverage-matrix.md");
const mcpSmoke = read("packages/matterhorn-work-mcp/test-smoke.mjs");
const cliFallback = read("scripts/crypto-cli-fallback.test.mjs");
const customerSmoke = read("scripts/customer-ready-crypto-smoke.mjs");

assert.equal(
  rootPackage.scripts?.["test:unified-crypto-shared-card-contract"],
  "node scripts/unified-crypto-shared-card-contract.test.mjs",
  "package.json should expose the unified shared-card contract gate",
);

const version = "matterhorn.crypto.shared-card.v1";
const kinds = parseConstArray(cryptoChat, "UNIFIED_CRYPTO_SHARED_CARD_KINDS");
const statuses = parseConstArray(cryptoChat, "UNIFIED_CRYPTO_SHARED_CARD_STATUSES");

assert.deepEqual(statuses, ["info", "success", "warning", "danger"], "shared-card statuses should be stable");

for (const requiredKind of [
  "clarification",
  "discovery",
  "account_snapshot",
  "market_context",
  "orderbook_context",
  "action_preview",
  "compliance_block",
  "external_signer_handoff",
  "receipt_status",
  "watch_alert",
  "generic",
]) {
  assert.ok(kinds.includes(requiredKind), `shared-card kinds missing ${requiredKind}`);
}

for (const source of [cryptoChat, agentLoop, buildPlan, matrix, mcpSmoke, cliFallback]) {
  assert.ok(source.includes(version), "all shared-card surfaces should name the versioned envelope");
}
assert.ok(
  cryptoChatTest.includes("UNIFIED_CRYPTO_SHARED_CARD_VERSION"),
  "unified crypto tests should reference the shared-card version constant",
);

for (const kind of kinds) {
  assert.ok(cryptoChat.includes(`"${kind}"`), `crypto-chat mapper should define kind ${kind}`);
  assert.ok(cryptoChatTest.includes(kind), `unified crypto tests should exercise kind ${kind}`);
  assert.ok(agentLoop.includes(kind), `agent operator loop should document kind ${kind}`);
}

for (const invariant of [
  "nonCustodial: true",
  "liveSubmissionEnabled: false",
  "canSubmit: false",
]) {
  assert.ok(cryptoChat.includes(invariant), `shared-card implementation missing ${invariant}`);
  assert.ok(cryptoChatTest.includes(invariant), `shared-card tests missing ${invariant}`);
  assert.ok(agentLoop.includes(invariant), `operator loop missing ${invariant}`);
}

for (const phrase of [
  "Compliance-blocked Polymarket previews have no executable price, size, or share fields",
  "Market previews and handoffs always show `canSubmit: false`",
  "Bittensor, Hyperliquid, and Polymarket cards map into the versioned shared-card contract",
]) {
  assert.ok(buildPlan.includes(phrase), `build plan should keep the shared-card acceptance criterion: ${phrase}`);
}

assert.ok(customerSmoke.includes("test:unified-crypto-shared-card-contract"), "customer-ready smoke should include shared-card contract gate");

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
]) {
  assert.equal(agentLoop.includes(forbidden), false, `operator loop must not mention forbidden execution/secret surface ${forbidden}`);
}

console.log("Unified crypto shared-card contract static check passed.");
