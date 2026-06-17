#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyMarketCustomerEvidenceBundle } from "./market-customer-evidence-verify.mjs";

const tmp = mkdtempSync(join(tmpdir(), "matterhorn-market-evidence-verify-"));

const requiredStages = [
  "crypto.unified_chat",
  "crypto.shared_card_contract",
  "market.execution_safety",
  "market.official_sdk_validation",
  "market.customer_evidence_bundle",
  "hyperliquid.readiness",
  "polymarket.readiness",
  "bittensor.customer_readiness",
].map((id) => ({ id, label: id, status: "pass" }));

function writeJson(name, value) {
  const path = join(tmp, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function run(args) {
  return spawnSync("node", ["scripts/market-customer-evidence-verify.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

const goodSummary = {
  ready: true,
  customerReadySmoke: {
    ready: true,
    requiredStages,
  },
  officialSdkValidation: {
    ready: true,
    allValidated: false,
    validation: { ok: true, errors: [], warnings: [] },
  },
  sdkManifestCheck: {
    present: true,
    ready: true,
    ok: true,
    fileCount: 4,
    venueCount: 2,
  },
  receiptCheck: {
    present: true,
    ready: true,
    ok: true,
    matchesHandoff: true,
  },
  warnings: [],
  errors: [],
  safety: {
    nonCustodial: true,
    liveSubmissionEnabled: false,
    asksForSecrets: false,
    storesSecrets: false,
  },
};

const goodMarkdown = [
  "# Matterhorn Work Market Customer Evidence Bundle",
  "",
  "Result: READY_FOR_TEST_CUSTOMER_QA",
  "",
  "## Safety Posture",
  "",
  "## Official SDK Validation Evidence",
  "",
  "## SDK Run Manifest Evidence",
  "",
  "## Public Receipt Evidence",
  "",
  "## Red Lines",
  "",
].join("\n");

try {
  const direct = verifyMarketCustomerEvidenceBundle({
    summary: goodSummary,
    markdown: goodMarkdown,
    options: { requireSdkManifestCheck: true, requireReceiptCheck: true },
  });
  assert.equal(direct.ok, true);
  assert.equal(direct.ready, true);
  assert.equal(direct.safety.liveSubmissionEnabled, false);

  const summaryPath = writeJson("bundle.json", goodSummary);
  const markdownPath = join(tmp, "bundle.md");
  writeFileSync(markdownPath, goodMarkdown);
  const outputPath = join(tmp, "verification.json");
  const happy = run([
    "--bundle-json",
    summaryPath,
    "--bundle-md",
    markdownPath,
    "--require-sdk-manifest-check",
    "--require-receipt-check",
    "--output",
    outputPath,
    "--strict",
    "--json",
  ]);
  assert.equal(happy.status, 0, happy.stderr || happy.stdout);
  const happyJson = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(happyJson.ok, true);
  assert.equal(happyJson.ready, true);
  assert.ok(happyJson.checks.some((check) => check.id === "sdk_manifest.accepted"));
  assert.ok(happyJson.checks.some((check) => check.id === "receipt.accepted"));

  const missingStrict = writeJson("missing-strict.json", {
    ...goodSummary,
    sdkManifestCheck: { present: false },
    receiptCheck: { present: false },
  });
  const missing = run([
    "--bundle-json",
    missingStrict,
    "--require-sdk-manifest-check",
    "--require-receipt-check",
    "--strict",
    "--json",
  ]);
  assert.notEqual(missing.status, 0, "strict verifier should fail when required evidence is absent");
  assert.match(missing.stdout, /sdk_manifest\.required/);
  assert.match(missing.stdout, /receipt\.required/);

  const badMarkdownPath = join(tmp, "bad-bundle.md");
  writeFileSync(badMarkdownPath, goodMarkdown.replace("READY_FOR_TEST_CUSTOMER_QA", "NOT_READY"));
  const badMarkdown = run(["--bundle-json", summaryPath, "--bundle-md", badMarkdownPath, "--strict", "--json"]);
  assert.notEqual(badMarkdown.status, 0, "strict verifier should fail NOT_READY Markdown");
  assert.match(badMarkdown.stdout, /markdown\.ready_result/);

  const badSecretPath = writeJson("bad-secret.json", {
    ...goodSummary,
    rawSignature: "0xdeadbeef",
  });
  const badSecret = run(["--bundle-json", badSecretPath, "--strict", "--json"]);
  assert.notEqual(badSecret.status, 0, "verifier should reject secret-shaped JSON fields");
  assert.match(badSecret.stderr, /rawSignature/);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts?.["test:market-customer-evidence-verify"], "node scripts/market-customer-evidence-verify.test.mjs");

  console.log("Market customer evidence verifier test passed.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
