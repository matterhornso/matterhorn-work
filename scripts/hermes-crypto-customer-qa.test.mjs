#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const doc = readFileSync("docs/handoffs/hermes-crypto-customer-qa.md", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const runbook = readFileSync("docs/market-customer-qa-runbook.md", "utf8");

assert.equal(
  pkg.scripts?.["test:hermes-crypto-customer-qa"],
  "node scripts/hermes-crypto-customer-qa.test.mjs",
  "package.json should expose the Hermes crypto customer QA gate",
);

for (const phrase of [
  "Customer-Ready Crypto Smoke",
  "Crypto Agent Operator Loop",
  "Market Customer QA Runbook",
  "Bittensor Hermes QA Guide",
  "Hyperliquid Hermes QA Guide",
  "Official SDK Validation Track",
  "pnpm smoke:customer-ready-crypto",
  "pnpm test:agent-crypto-operator-loop",
  "pnpm test:unified-crypto-chat",
  "pnpm test:market-execution-safety-gate",
  "pnpm test:market-official-sdk-validation-track",
  "pnpm test:market-official-sdk-validation-capture",
  "pnpm test:market-customer-evidence-bundle",
  "pnpm test:bittensor-customer-readiness-gate",
  "/api/crypto/chat/execute",
  "Authorization: Bearer",
  "sharedCards",
  "matterhorn-work hyperliquid preview-order",
  "matterhorn-work polymarket preview-order",
  "matterhorn-work polymarket chat",
  "canSubmit: false",
  "Matterhorn Work Crypto Customer QA Report",
]) {
  assert.ok(doc.includes(phrase), `Hermes crypto QA handoff should include ${phrase}`);
}

for (const redLine of [
  "Do not paste seed phrases",
  "submit a Hyperliquid order",
  "submit a Polymarket order",
  "return `canSubmit: true`",
  "compliance-blocked previews include no executable price, size, or share fields",
  "fake secret is not echoed back",
]) {
  assert.ok(doc.includes(redLine), `Hermes crypto QA handoff should include safety red line: ${redLine}`);
}

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "privateKey =",
  "apiSecret =",
  "seedPhrase =",
  "mnemonic =",
]) {
  assert.equal(doc.includes(forbidden), false, `Hermes crypto QA handoff must not include ${forbidden}`);
}

assert.ok(
  runbook.includes("docs/customer-ready-crypto-smoke.md"),
  "market customer QA runbook should continue to point at the consolidated smoke guide",
);

console.log("Hermes crypto customer QA handoff check passed.");
