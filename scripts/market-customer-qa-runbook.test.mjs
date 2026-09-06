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
  "## 5. Retired Sign-Request And Artifact Routes Fail Closed",
  "## 6. Receipt Evidence Smoke",
  "## 7. UI/UX Checks",
  "## 8. Security Red Lines",
  "## 9. Evidence To Report Back",
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
  "matterhorn-work hyperliquid sign-request",
  "matterhorn-work hyperliquid validate-artifact",
  "matterhorn-work polymarket sign-request",
  "matterhorn-work polymarket validate-artifact",
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
  "seed",
  "mnemonic",
  "without echoing the secret value",
  "no live funds",
  "no private keys",
  "no API secrets",
  "no raw signatures",
  "wallet_airlock_required",
  "must not create a sign request",
  "agent draft",
  "policy and simulation",
  "wallet review",
  "connected-wallet submission",
  "receipt reconciliation",
]) {
  assert.ok(doc.includes(required), `runbook missing safety/evidence text: ${required}`);
}

console.log("Market customer QA runbook check passed.");
