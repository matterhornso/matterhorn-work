#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const fixtureDir = "qa-fixtures/market-official-sdk";
const generatedAt = new Date(0).toISOString();
const exchangeAddress = "0x0000000000000000000000000000000000000001";
const chainId = "80002";

function fixture(name) {
  return join(root, fixtureDir, name);
}

function node(args, options = {}) {
  return execFileSync("node", args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
}

function runNode(args) {
  return spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
  });
}

const tempDir = mkdtempSync(join(tmpdir(), "matterhorn-sdk-fixtures-"));
const captureOutput = join(tempDir, "official-sdk-capture.json");
const smokeOutput = join(tempDir, "customer-ready-smoke.json");
const bundleMarkdown = join(tempDir, "customer-evidence.md");
const bundleJson = join(tempDir, "customer-evidence.json");

node([
  "scripts/market-official-sdk-validation-capture.mjs",
  "--generated-at", generatedAt,
  "--validated-at", generatedAt,
  "--hyperliquid-normalized", fixture("hyperliquid-normalized-action.fixture.json"),
  "--hyperliquid-package-version", "fixture-hyperliquid-python-sdk",
  "--polymarket-normalized", fixture("polymarket-normalized-typed-data.fixture.json"),
  "--polymarket-package-version", "fixture-@polymarket/clob-client-v2",
  "--polymarket-exchange-address", exchangeAddress,
  "--polymarket-chain-id", chainId,
  "--output", captureOutput,
]);

const capture = JSON.parse(readFileSync(captureOutput, "utf8"));
assert.equal(capture.ok, true, `capture should validate: ${capture.errors?.join("; ")}`);
assert.equal(capture.evidence.version, "matterhorn.market.official-sdk-validation.v1");
assert.equal(capture.evidence.safety.nonCustodial, true);
assert.equal(capture.evidence.safety.liveSubmissionEnabled, false);
assert.deepEqual(capture.evidence.venues.map((venue) => venue.status), ["validated", "validated"]);
assert.ok(capture.evidence.venues[0].validation.officialClientNormalized.sha256, "Hyperliquid fixture capture should hash content");
assert.ok(capture.evidence.venues[1].validation.officialClientNormalized.sha256, "Polymarket fixture capture should hash content");

const evidenceReport = JSON.parse(node([
  "scripts/market-official-sdk-validation-evidence.mjs",
  "--evidence-file", captureOutput,
  "--json",
]));
assert.equal(evidenceReport.ok, true, `wrapper evidence should validate: ${evidenceReport.errors?.join("; ")}`);
assert.equal(evidenceReport.evidence.venues[0].status, "validated");

writeFileSync(smokeOutput, JSON.stringify({
  ready: true,
  summary: { pass: 25, fail: 0, skip: 0 },
  stages: [
    { id: "crypto.unified_chat", label: "Unified crypto chat router", status: "pass" },
    { id: "crypto.direct_prompt_safety", label: "Direct venue credential prompt safety", status: "pass" },
    { id: "crypto.shared_card_contract", label: "Unified crypto shared-card contract", status: "pass" },
    { id: "market.execution_safety", label: "Market execution safety gate", status: "pass" },
    { id: "market.official_sdk_validation", label: "Market official SDK validation track", status: "pass" },
    { id: "market.official_sdk_fixtures", label: "Market official SDK fixture capture", status: "pass" },
    { id: "market.customer_evidence_bundle", label: "Market customer evidence bundle", status: "pass" },
    { id: "hyperliquid.readiness", label: "Hyperliquid readiness gate", status: "pass" },
    { id: "polymarket.readiness", label: "Polymarket readiness gate", status: "pass" },
    { id: "bittensor.customer_readiness", label: "Bittensor customer readiness gate", status: "pass" },
  ],
  safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
}, null, 2));

node([
  "scripts/market-customer-evidence-bundle.mjs",
  "--customer-ready-smoke", smokeOutput,
  "--official-sdk-validation", captureOutput,
  "--require-official-sdk-validated",
  "--strict",
  "--output", bundleMarkdown,
  "--json-output", bundleJson,
]);
const bundleSummary = JSON.parse(readFileSync(bundleJson, "utf8"));
assert.equal(bundleSummary.ready, true);
assert.equal(bundleSummary.officialSdkValidation.allValidated, true);
const bundleText = readFileSync(bundleMarkdown, "utf8");
assert.match(bundleText, /READY_FOR_TEST_CUSTOMER_QA/);
assert.match(bundleText, /fixture-hyperliquid-python-sdk/);
assert.match(bundleText, /fixture-@polymarket\/clob-client-v2/);
assert.doesNotMatch(bundleText, /rawSignature|privateKey|apiSecret|signedPayload/);

const rawSignature = runNode([
  "scripts/market-official-sdk-validation-capture.mjs",
  "--generated-at", generatedAt,
  "--hyperliquid-normalized", fixture("hyperliquid-forbidden-raw-signature.fixture.json"),
  "--hyperliquid-package-version", "fixture-hyperliquid-python-sdk",
  "--json",
]);
assert.notEqual(rawSignature.status, 0, "rawSignature fixture must be rejected");
assert.match(`${rawSignature.stdout}\n${rawSignature.stderr}`, /rawSignature/);

const mismatchedDomain = runNode([
  "scripts/market-official-sdk-validation-capture.mjs",
  "--generated-at", generatedAt,
  "--hyperliquid-normalized", fixture("hyperliquid-normalized-action.fixture.json"),
  "--hyperliquid-package-version", "fixture-hyperliquid-python-sdk",
  "--polymarket-normalized", fixture("polymarket-mismatched-domain.fixture.json"),
  "--polymarket-package-version", "fixture-@polymarket/clob-client-v2",
  "--polymarket-exchange-address", exchangeAddress,
  "--polymarket-chain-id", chainId,
  "--json",
]);
assert.notEqual(mismatchedDomain.status, 0, "mismatched Polymarket domain fixture must be rejected");
assert.match(`${mismatchedDomain.stdout}\n${mismatchedDomain.stderr}`, /verifyingContract/);

process.stdout.write("Market official SDK validation fixture tests passed.\n");
