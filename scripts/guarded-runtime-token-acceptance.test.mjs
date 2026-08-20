#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "matterhorn-token-acceptance-"));
const baselinePath = join(directory, "baseline.json");
const candidatePath = join(directory, "candidate.json");
const version = "matterhorn.guarded-runtime-token-evidence.v1";
const quality = { citations: true, actionTerms: true, riskWarnings: true, receiptComplete: true };
const evidence = (providerInputTokens, overrides = {}) => ({
  version,
  capturedAt: "2026-08-20T00:00:00.000Z",
  scenarios: [
    { id: "sui-transfer", providerInputTokens, quality },
    { id: "bittensor-stake", providerInputTokens: providerInputTokens * 2, quality },
  ],
  policyOverheadMs: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  ...overrides,
});

function run() {
  return spawnSync(process.execPath, [
    "scripts/guarded-runtime-token-acceptance.mjs",
    "--baseline", baselinePath,
    "--candidate", candidatePath,
    "--strict",
    "--json",
  ], { encoding: "utf8" });
}

try {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["gate:guarded-runtime-tokens"], "node scripts/guarded-runtime-token-acceptance.mjs --strict");
  assert.equal(packageJson.scripts["test:guarded-runtime-token-acceptance"], "node scripts/guarded-runtime-token-acceptance.test.mjs");

  writeFileSync(baselinePath, JSON.stringify(evidence(1_000)));
  writeFileSync(candidatePath, JSON.stringify(evidence(600)));
  const passing = run();
  assert.equal(passing.status, 0, passing.stderr || passing.stdout);
  const passReport = JSON.parse(passing.stdout);
  assert.equal(passReport.ok, true);
  assert.equal(passReport.scenarios[0].reductionPct, 40);
  assert.equal(passReport.policyOverheadP95Ms, 22);

  writeFileSync(candidatePath, JSON.stringify(evidence(601)));
  const weakReduction = run();
  assert.equal(weakReduction.status, 1);
  assert.ok(JSON.parse(weakReduction.stdout).failures.some((failure) => failure.id === "tokens_sui-transfer"));

  writeFileSync(candidatePath, JSON.stringify(evidence(600, {
    scenarios: [
      { id: "sui-transfer", providerInputTokens: 600, quality: { ...quality, citations: false } },
      { id: "bittensor-stake", providerInputTokens: 1_200, quality },
    ],
  })));
  const qualityFailure = run();
  assert.equal(qualityFailure.status, 1);
  assert.ok(JSON.parse(qualityFailure.stdout).failures.some((failure) => failure.id === "quality_sui-transfer"));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
