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
const sharedCardRenderer = read("apps/app/src/react-app/domains/session/surface/message-list.tsx");
const fixturePack = JSON.parse(read("qa-fixtures/crypto-shared-cards.v1.json"));

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
  "readiness_report",
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

for (const rendererPhrase of [
  "sharedCardDisplayTitle",
  "sharedCardMissingContext",
  "sharedCardHighlightedStep",
  "sharedCardSdkValidationItems",
  "External signer",
  "Focused step",
  "Step command",
  "SDK doctor",
  "Fixture validation",
  "Freshness",
  "Block",
  "Can submit",
  "Live submission",
  "Missing context",
  "slice(0, 8)",
]) {
  assert.ok(sharedCardRenderer.includes(rendererPhrase), `transcript renderer should include card polish: ${rendererPhrase}`);
}

for (const previewPhrase of [
  "Preview Only",
  "wallet/client decides whether anything is signed externally",
]) {
  assert.ok(cryptoChat.includes(previewPhrase), `shared-card implementation should include preview-only copy: ${previewPhrase}`);
  assert.ok(cryptoChatTest.includes(previewPhrase), `shared-card tests should lock preview-only copy: ${previewPhrase}`);
}

assert.equal(fixturePack.version, "matterhorn.crypto.shared-card.fixtures.v1", "fixture pack should be versioned");
assert.ok(Array.isArray(fixturePack.cards), "fixture pack should contain cards");

for (const card of fixturePack.cards) {
  assert.equal(card.version, version, "fixture card should use the shared-card envelope");
  assert.ok(kinds.includes(card.kind), `fixture card kind should be known: ${card.kind}`);
  assert.ok(["auto", "bittensor", "hyperliquid", "polymarket"].includes(card.venue), `fixture venue should be known: ${card.venue}`);
  assert.ok(statuses.includes(card.status), `fixture status should be known: ${card.status}`);
  assert.equal(card.safety?.nonCustodial, true, "fixture card should be non-custodial");
  assert.equal(card.safety?.liveSubmissionEnabled, false, "fixture card should keep live submission off");
  assert.equal(card.safety?.canSubmit, false, "fixture card should keep canSubmit false");
  assert.ok(card.source?.source, "fixture card should expose source");
  assert.ok(card.source?.freshness, "fixture card should expose freshness");
}

for (const required of [
  ["auto", "readiness_report"],
  ["bittensor", "account_snapshot"],
  ["bittensor", "action_preview"],
  ["hyperliquid", "account_snapshot"],
  ["hyperliquid", "orderbook_context"],
  ["hyperliquid", "action_preview"],
  ["polymarket", "market_context"],
  ["polymarket", "compliance_block"],
  ["polymarket", "action_preview"],
  ["hyperliquid", "receipt_status"],
  ["polymarket", "watch_alert"],
]) {
  assert.ok(
    fixturePack.cards.some((card) => card.venue === required[0] && card.kind === required[1]),
    `fixture pack should include ${required[0]} ${required[1]}`,
  );
}

const hyperliquidAccount = fixturePack.cards.find((card) => card.venue === "hyperliquid" && card.kind === "account_snapshot")?.data?.account;
assert.equal(hyperliquidAccount?.accountValue, 1000, "Hyperliquid account fixture should expose account value");
assert.equal(hyperliquidAccount?.withdrawableUsd, 500, "Hyperliquid account fixture should expose withdrawable");
assert.ok(hyperliquidAccount?.fundingExposure, "Hyperliquid account fixture should expose funding exposure");

const polymarketContext = fixturePack.cards.find((card) => card.venue === "polymarket" && card.originalKind === "polymarket_market_context")?.data?.context;
assert.equal(polymarketContext?.previewAvailability, "available", "Polymarket context fixture should expose preview availability");
assert.equal(polymarketContext?.compliance?.status, "allowed", "Polymarket context fixture should expose compliance status");

const sdkValidationGuide = fixturePack.cards.find((card) => card.originalKind === "market_sdk_validation")?.data?.data?.guide;
assert.ok(sdkValidationGuide, "fixture pack should include the market SDK-validation card");
assert.ok(sdkValidationGuide.modes?.includes("operator_owned_testnet"), "SDK-validation fixture should expose operator-owned testnet mode");
assert.ok(sdkValidationGuide.networks?.hyperliquid?.includes("hyperliquid-testnet"), "SDK-validation fixture should expose Hyperliquid testnet");
assert.ok(sdkValidationGuide.networks?.polymarket?.includes("polygon-amoy"), "SDK-validation fixture should expose Polygon Amoy");
assert.match(sdkValidationGuide.commands?.doctor || "", /matterhorn-work crypto sdk-doctor/, "SDK-validation fixture should expose the doctor command");
assert.match(sdkValidationGuide.commands?.fixtureValidation || "", /matterhorn-work crypto sdk-validate-public/, "SDK-validation fixture should expose fixture validation command");

const blockedPolymarketPreview = fixturePack.cards.find((card) => card.venue === "polymarket" && card.kind === "action_preview")?.data?.preview;
assert.equal(blockedPolymarketPreview?.canSubmit, false, "blocked Polymarket preview must keep canSubmit=false");
assert.equal(blockedPolymarketPreview?.price, null, "blocked Polymarket preview must not expose executable price");
assert.equal(blockedPolymarketPreview?.size, null, "blocked Polymarket preview must not expose executable size");
assert.equal(blockedPolymarketPreview?.estimatedShares, null, "blocked Polymarket preview must not expose executable shares");
for (const venue of ["hyperliquid", "polymarket"]) {
  const previewCard = fixturePack.cards.find((card) => card.venue === venue && card.kind === "action_preview");
  assert.ok(previewCard?.title.includes("Preview Only"), `${venue} preview fixture should show Preview Only`);
  assert.ok(
    previewCard?.summary.includes("wallet/client decides whether anything is signed externally"),
    `${venue} preview fixture should explain wallet/client external signing`,
  );
}

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
