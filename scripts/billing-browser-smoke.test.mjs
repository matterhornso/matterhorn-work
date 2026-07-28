#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/billing-browser-smoke.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.equal(packageJson.scripts["smoke:billing-browser"], "node scripts/billing-browser-smoke.mjs --strict");
assert.equal(packageJson.scripts["test:billing-browser-smoke"], "node scripts/billing-browser-smoke.test.mjs");

for (const required of [
  "Matterhorn Billing browser smoke",
  "local_preview_truth",
  "preview_plan",
  "clear_pending",
  "readiness_disclosure",
  "Hidden by launch policy",
  "settings/overview",
  "still exposes a Billing navigation link",
  "/billing/checkout",
  "/billing/pending-checkout",
  "Expected mock checkout mode",
  "Local preview incorrectly granted the pending plan",
  "Local plan preview opened an external payment page",
  "No raw card data is handled by Matterhorn",
  "Live payments are disabled in this build",
  "page.on(\"console\"",
  "page.on(\"pageerror\"",
  "page.on(\"response\"",
  "shouldRecordConsoleError",
  "failureCleanupAttempted",
]) {
  assert.ok(source.includes(required), `Billing browser smoke missing ${required}`);
}

for (const forbidden of ["cardNumber", "paymentMethod", "privateKey", "seedPhrase", "signedPayload"]) {
  assert.equal(source.includes(forbidden), false, `Billing browser smoke must not handle ${forbidden}`);
}

console.log("Matterhorn Billing browser smoke contract passed.");
