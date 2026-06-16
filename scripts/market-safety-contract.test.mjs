#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const markets = readFileSync("packages/types/src/markets.ts", "utf8");
const index = readFileSync("packages/types/src/index.ts", "utf8");
const typesPackage = JSON.parse(readFileSync("packages/types/package.json", "utf8"));
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const roadmap = readFileSync("docs/parallel-agent-market-roadmap.md", "utf8");

for (const token of [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "order_preview",
  "cancel_preview",
  "blocked_by_compliance",
  "external_signer_required",
  "api_wallet_required",
  "MARKET_FORBIDDEN_CREDENTIAL_KEY_PATTERN",
  "requiresPreviewBeforeAction",
  "requiresComplianceBeforePreview",
  "canSubmit: false",
]) {
  assert.ok(markets.includes(token), `market contract missing token: ${token}`);
  if (!token.startsWith("MARKET_") && !token.startsWith("requires") && token !== "canSubmit: false") {
    assert.ok(roadmap.includes(token), `roadmap missing market token: ${token}`);
  }
}

assert.ok(index.includes('export * from "./markets"'), "types index should export markets");
assert.ok(typesPackage.exports["./markets"], "types package should export ./markets");
assert.equal(rootPackage.scripts["test:market-safety-contract"], "node scripts/market-safety-contract.test.mjs");

for (const forbiddenProperty of [
  "privateKey:",
  "apiSecret:",
  "mnemonic:",
  "seedPhrase:",
  "rawSignature:",
  "signedPayload:",
  "walletExport:",
]) {
  assert.equal(markets.includes(forbiddenProperty), false, `market contract must not define secret field ${forbiddenProperty}`);
}

assert.ok(markets.includes("liveSubmissionEnabled: false"), "live submission must default off");
assert.ok(markets.includes("allowsPrivateKeyImport: false"), "private key import must default off");
assert.ok(markets.includes("allowsApiSecretStorage: false"), "API secret storage must default off");

console.log("Market safety contract static check passed.");
