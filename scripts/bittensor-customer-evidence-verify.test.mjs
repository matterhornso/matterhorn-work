#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyBittensorCustomerEvidenceBundle } from "./bittensor-customer-evidence-verify.mjs";

const tmp = mkdtempSync(join(tmpdir(), "matterhorn-bittensor-evidence-verify-"));

function writeJson(name, value) {
  const path = join(tmp, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function run(args) {
  return spawnSync("node", ["scripts/bittensor-customer-evidence-verify.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

const goodSummary = {
  ready: true,
  bittensor: {
    ready: true,
    detail: "7 passed, 0 failed, 0 skipped",
    passedStages: ["Wallet snapshot", "Unsigned staking preview"],
    failedStages: [],
  },
  agentControl: { ready: true, detail: "4 passed, 0 failed" },
  ci: {
    total: 3,
    passed: ["Matterhorn Work Tests", "i18n Audit", "Alpha Channel macOS arm64"],
    failed: [],
    pending: [],
  },
  readinessGate: { ready: true, detail: "Readiness gate says ready" },
  readonlyAdapterCanary: { ready: true, invoked: true },
  receiptCheck: { ready: true, accepted: true },
  watchAutopilotScheduler: { ready: true, iterations: 6 },
};

const goodMarkdown = [
  "# Matterhorn Work Bittensor Customer Evidence Bundle",
  "",
  "## Decision",
  "",
  "- Result: READY_FOR_TEST_CUSTOMERS",
  "",
  "## Gate Summary",
  "",
  "## Before Customer Demo",
  "",
].join("\n");

try {
  const direct = verifyBittensorCustomerEvidenceBundle({
    summary: goodSummary,
    markdown: goodMarkdown,
    options: {
      requireReceiptCheck: true,
      requireReadonlyAdapterCanary: true,
      requireWatchAutopilotScheduler: true,
    },
  });
  assert.equal(direct.ok, true);
  assert.equal(direct.ready, true);
  assert.equal(direct.safety.liveSubmissionEnabled, false);

  const summaryPath = writeJson("bittensor-bundle.json", goodSummary);
  const markdownPath = join(tmp, "bittensor-bundle.md");
  writeFileSync(markdownPath, goodMarkdown);
  const outputPath = join(tmp, "bittensor-verify.json");
  const happy = run([
    "--bundle-json",
    summaryPath,
    "--bundle-md",
    markdownPath,
    "--require-receipt-check",
    "--require-readonly-adapter-canary",
    "--require-watch-autopilot-scheduler",
    "--output",
    outputPath,
    "--strict",
    "--json",
  ]);
  assert.equal(happy.status, 0, happy.stderr || happy.stdout);
  const happyJson = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(happyJson.ok, true);
  assert.equal(happyJson.ready, true);
  assert.ok(happyJson.checks.some((check) => check.id === "ci.no_failures"));

  const missingRequiredPath = writeJson("missing-required.json", {
    ...goodSummary,
    receiptCheck: null,
    readonlyAdapterCanary: null,
    watchAutopilotScheduler: null,
  });
  const missingRequired = run([
    "--bundle-json",
    missingRequiredPath,
    "--require-receipt-check",
    "--require-readonly-adapter-canary",
    "--require-watch-autopilot-scheduler",
    "--strict",
    "--json",
  ]);
  assert.notEqual(missingRequired.status, 0, "strict verifier should fail missing required optional evidence");
  assert.match(missingRequired.stdout, /optional\.receiptCheck\.required/);
  assert.match(missingRequired.stdout, /optional\.readonlyAdapterCanary\.required/);
  assert.match(missingRequired.stdout, /optional\.watchAutopilotScheduler\.required/);

  const badCiPath = writeJson("bad-ci.json", {
    ...goodSummary,
    ci: { total: 2, passed: ["i18n Audit"], failed: ["Matterhorn Work Tests"], pending: [] },
  });
  const badCi = run(["--bundle-json", badCiPath, "--strict", "--json"]);
  assert.notEqual(badCi.status, 0, "strict verifier should fail failed CI evidence");
  assert.match(badCi.stdout, /ci\.no_failures/);

  const badMarkdownPath = join(tmp, "bad-bundle.md");
  writeFileSync(badMarkdownPath, goodMarkdown.replace("READY_FOR_TEST_CUSTOMERS", "NEEDS_MORE_EVIDENCE"));
  const badMarkdown = run(["--bundle-json", summaryPath, "--bundle-md", badMarkdownPath, "--strict", "--json"]);
  assert.notEqual(badMarkdown.status, 0, "strict verifier should fail non-ready Markdown");
  assert.match(badMarkdown.stdout, /markdown\.ready_result/);

  const badSecretPath = writeJson("bad-secret.json", {
    ...goodSummary,
    signedExtrinsic: "0xdeadbeef",
  });
  const badSecret = run(["--bundle-json", badSecretPath, "--strict", "--json"]);
  assert.notEqual(badSecret.status, 0, "verifier should reject secret-shaped JSON fields");
  assert.match(badSecret.stderr, /signedExtrinsic/);

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts?.["test:bittensor-customer-evidence-verify"], "node scripts/bittensor-customer-evidence-verify.test.mjs");

  console.log("Bittensor customer evidence verifier test passed.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
