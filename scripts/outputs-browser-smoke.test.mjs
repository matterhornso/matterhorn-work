#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("scripts/outputs-browser-smoke.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.equal(packageJson.scripts["smoke:outputs-browser"], "node scripts/outputs-browser-smoke.mjs --strict");
assert.equal(packageJson.scripts["test:outputs-browser-smoke"], "node scripts/outputs-browser-smoke.test.mjs");

for (const required of [
  "Matterhorn Outputs browser smoke",
  "seed_preview_output",
  "open_output",
  "copy_and_download",
  "add_linked_note",
  "delete_linked_note",
  "delete_output",
  "wallet-reviewed Sui output",
  "Selected output actions",
  "Browse outputs",
  "File details",
  "never holds keys or submits without wallet approval",
  "client_wallet_required",
  "sui_wallet_standard",
  "sign_and_execute_in_wallet",
  "Never written to the report",
  "page.on(\"console\"",
  "page.on(\"pageerror\"",
  "page.on(\"response\"",
  "noteButton.waitFor({ state: \"visible\"",
]) {
  assert.ok(source.includes(required), `Outputs browser smoke missing ${required}`);
}

for (const forbidden of ["privateKey", "seedPhrase", "mnemonic", "signedPayload", "transactions/receipt"]) {
  assert.equal(source.includes(forbidden), false, `Outputs browser smoke must not contain ${forbidden}`);
}

console.log("Matterhorn Outputs browser smoke contract passed.");
