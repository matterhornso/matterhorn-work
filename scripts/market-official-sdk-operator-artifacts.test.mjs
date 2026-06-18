#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const exampleDir = join(root, "qa-fixtures/market-official-sdk/operator-owned-testnet-example");
const doc = readFileSync("docs/market-official-sdk-operator-artifacts.md", "utf8");

for (const phrase of [
  "hyperliquid-official-public.json",
  "polymarket-official-public.json",
  "operator_owned_testnet",
  "hyperliquid-python-sdk",
  "@polymarket/clob-client-v2",
  "matterhorn-work crypto sdk-validate-public",
  "matterhorn-market-sdk-public-validation.sha256",
  "does not run private SDK signing",
  "does not run private SDK signing, compute final signatures, or submit orders",
]) {
  assert.ok(doc.includes(phrase), `operator artifact doc should include ${phrase}`);
}

for (const forbidden of [
  "privateKey =",
  "apiSecret =",
  "seedPhrase =",
  "mnemonic =",
  "rawSignature =",
  "signedPayload =",
]) {
  assert.equal(doc.includes(forbidden), false, `operator artifact doc must not include ${forbidden}`);
}

const combinedFixtureText = [
  readFileSync(join(exampleDir, "README.md"), "utf8"),
  readFileSync(join(exampleDir, "hyperliquid-official-public.json"), "utf8"),
  readFileSync(join(exampleDir, "polymarket-official-public.json"), "utf8"),
].join("\n");
for (const forbidden of [
  "privateKey",
  "apiSecret",
  "seedPhrase",
  "mnemonic",
  "rawSignature",
  "signedPayload",
  "walletExport",
]) {
  assert.equal(combinedFixtureText.includes(forbidden), false, `operator example must not include ${forbidden}`);
}

const outputDir = mkdtempSync(join(tmpdir(), "matterhorn-sdk-operator-artifacts-"));
const validation = spawnSync("node", [
  "scripts/market-official-sdk-validate-public.mjs",
  "--mode", "operator_owned_testnet",
  "--input-dir", exampleDir,
  "--output-dir", outputDir,
  "--hyperliquid-network", "hyperliquid-testnet",
  "--hyperliquid-package-version", "fixture-hyperliquid-python-sdk",
  "--polymarket-network", "polygon-amoy",
  "--polymarket-chain-id", "80002",
  "--polymarket-exchange-address", "0x0000000000000000000000000000000000000001",
  "--polymarket-package-version", "fixture-@polymarket/clob-client-v2",
  "--strict",
  "--json",
], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(validation.status, 0, validation.stderr || validation.stdout);
const report = JSON.parse(validation.stdout);
assert.equal(report.mode, "operator_owned_testnet");
assert.equal(report.ready, true);
assert.equal(report.safety.nonCustodial, true);
assert.equal(report.safety.liveSubmissionEnabled, false);
assert.equal(report.safety.signsOrSubmits, false);
assert.equal(report.safety.acceptsSecrets, false);
assert.equal(report.officialSdkValidation.allValidated, true);
assert.ok(existsSync(report.files.publicValidationJson), "public validation JSON should exist");
assert.ok(existsSync(report.files.publicValidationMarkdown), "public validation Markdown should exist");
assert.ok(existsSync(report.files.publicValidationSha256), "public validation SHA-256 should exist");

const outputText = JSON.stringify(report) + readFileSync(report.files.publicValidationJson, "utf8");
assert.equal(/privateKey|apiSecret|seedPhrase|mnemonic|rawSignature|signedPayload|walletExport/i.test(outputText), false);

console.log("Market official SDK operator artifact example tests passed.");
