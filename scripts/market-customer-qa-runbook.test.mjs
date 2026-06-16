#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const doc = readFileSync("docs/market-customer-qa-runbook.md", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.equal(
  packageJson.scripts["test:market-customer-qa-runbook"],
  "node scripts/market-customer-qa-runbook.test.mjs",
  "package.json should expose the runbook check",
);

for (const section of [
  "## 1. Static Safety Gates",
  "## 2. Offline Venue QA",
  "## 3. Local Server Smoke",
  "## 4. Preview And Handoff Smoke",
  "## 5. Receipt Evidence Smoke",
  "## 6. UI/UX Checks",
  "## 7. Security Red Lines",
  "## 8. Evidence To Report Back",
]) {
  assert.ok(doc.includes(section), `runbook missing section: ${section}`);
}

for (const command of [
  "pnpm test:market-safety-contract",
  "pnpm test:market-execution-safety-gate",
  "pnpm test:market-receipt-qa",
  "pnpm test:hyperliquid-readiness-gate",
  "pnpm test:polymarket-readiness-gate",
  "pnpm test:hyperliquid-read-preview-qa",
  "pnpm test:polymarket-read-preview-qa",
  "matterhorn-work hyperliquid preview-order",
  "matterhorn-work hyperliquid handoff",
  "matterhorn-work polymarket markets",
  "matterhorn-work hyperliquid receipt",
]) {
  assert.ok(doc.includes(command), `runbook missing command: ${command}`);
}

for (const required of [
  "canSubmit: false",
  "liveSubmissionEnabled",
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "externalSignerOnly: true",
  "previewSha256",
  "handoffSha256",
  "signature",
  "privateKey",
  "apiSecret",
  "signedPayload",
  "seed",
  "mnemonic",
  "without echoing the secret value",
  "no live funds",
  "no private keys",
  "no API secrets",
  "no raw signatures",
]) {
  assert.ok(doc.includes(required), `runbook missing safety/evidence text: ${required}`);
}

console.log("Market customer QA runbook check passed.");
