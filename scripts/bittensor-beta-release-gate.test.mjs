#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function read(path) {
  return readFileSync(path, "utf8");
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/bittensor-beta-release-gate.mjs", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.scripts["smoke:bittensor-beta"], "node scripts/bittensor-beta-release-gate.mjs --offline --strict");
assert.equal(packageJson.scripts["test:bittensor-beta-release-gate"], "node scripts/bittensor-beta-release-gate.test.mjs");

const dryRun = await run(["--dry-run", "--json"]);
assert.equal(dryRun.code, 0, dryRun.stderr || dryRun.stdout);
const report = JSON.parse(dryRun.stdout);
assert.equal(report.version, "matterhorn.bittensor-beta-release-gate.v1");
assert.equal(report.ready, true);
assert.equal(report.dryRun, true);
assert.match(report.metadata.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
assert.match(report.metadata.gitSha, /^[a-f0-9]{40}$/i);
assert.equal(report.safety.betaScope, "bittensor");
assert.equal(report.safety.nonCustodial, true);
assert.equal(report.safety.asksForSecrets, false);
assert.equal(report.safety.bittensorExternalSignerRequired, true);
assert.equal(report.safety.marketExecutionEnabled, false);
assert.equal(report.safety.liveSubmissionEnabled, false);
assert.equal(report.safety.hyperliquidPolymarketStatus, "preview_r_and_d_only");

const outputDir = mkdtempSync(join(tmpdir(), "matterhorn-bittensor-beta-json-output-"));
try {
  const jsonOutput = join(outputDir, "beta.json");
  const outputRun = await run(["--dry-run", "--json-output", jsonOutput]);
  assert.equal(outputRun.code, 0, outputRun.stderr || outputRun.stdout);
  const outputReport = JSON.parse(read(jsonOutput));
  assert.equal(outputReport.ready, true);
  assert.equal(outputReport.safety.marketExecutionEnabled, false);
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}

const stageIds = report.stages.map((stage) => stage.id);
for (const id of [
  "bittensor.beta_static_gate",
  "bittensor.customer_readiness",
  "bittensor.receipt",
  "bittensor.watch_autopilot",
  "bittensor.watch_scheduler",
  "bittensor.signing_handoff",
  "bittensor.evidence_bundle",
  "bittensor.evidence_verify",
  "bittensor.adapter_readonly_canary",
  "crypto.customer_readiness_ui",
  "crypto.direct_prompt_safety",
  "market.execution_safety",
  "market.execution_readiness",
  "market.submit_sign_phase0_contract",
  "market.sign_request_phase1",
  "market.artifact_validation_phase2",
]) {
  assert.ok(stageIds.includes(id), `dry-run missing stage ${id}`);
}

const commandText = report.stages.map((stage) => stage.command.join(" ")).join("\n");
for (const required of [
  "pnpm test:bittensor-customer-readiness-gate",
  "pnpm test:bittensor-receipt-check",
  "pnpm test:bittensor-watch-autopilot",
  "pnpm test:bittensor-watch-autopilot-scheduler",
  "pnpm test:bittensor-signing-handoff-check",
  "pnpm test:bittensor-customer-evidence-bundle",
  "pnpm test:bittensor-customer-evidence-verify",
  "pnpm test:bittensor-adapter-readonly-canary",
  "pnpm test:market-execution-safety-gate",
  "pnpm test:market-execution-readiness-gate",
  "pnpm test:market-submit-sign-contract-phase0",
  "pnpm test:market-sign-request-phase1",
  "pnpm test:market-artifact-validation-phase2",
]) {
  assert.ok(commandText.includes(required), `beta command list missing ${required}`);
}
for (const banned of ["/orders/submit", "/orders/sign", "/exchange/submit"]) {
  assert.ok(!commandText.includes(banned), `beta gate command must not reference ${banned}`);
}

const gateScript = read("scripts/bittensor-beta-release-gate.mjs");
for (const required of [
  "bittensor",
  "marketExecutionEnabled: false",
  "liveSubmissionEnabled: false",
  "preview_r_and_d_only",
  "Bittensor beta release gate",
]) {
  assert.ok(gateScript.includes(required), `beta gate script missing ${required}`);
}

const betaDoc = read("docs/bittensor-beta-launch.md");
for (const required of [
  "Bittensor Beta Launch",
  "smoke:bittensor-beta",
  "BITTENSOR_BETA_ENABLED=true",
  "VITE_MATTERHORN_BITTENSOR_BETA=1",
  "MARKETS_LIVE_SUBMIT_ENABLED=false",
  "Hyperliquid and Polymarket are not part of the Bittensor beta launch promise",
  "No seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, custody, or live market submission",
  "No P0/P1/P2 issues",
]) {
  assert.ok(betaDoc.includes(required), `beta launch doc missing ${required}`);
}

const panel = read("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx");
for (const required of [
  "VITE_MATTERHORN_BITTENSOR_BETA",
  "Bittensor Beta",
  "Market previews are hidden in Bittensor beta mode",
  "preview/R&amp;D only",
  "Bittensor beta boundary",
]) {
  assert.ok(panel.includes(required), `Bittensor panel missing ${required}`);
}

const customerSmoke = read("scripts/customer-ready-crypto-smoke.mjs");
assert.ok(customerSmoke.includes("bittensor.beta_release_gate"), "customer smoke should include Bittensor beta release gate stage");
assert.ok(customerSmoke.includes("test:bittensor-beta-release-gate"), "customer smoke should run the static beta gate");

const customerSmokeTest = read("scripts/customer-ready-crypto-smoke.test.mjs");
assert.ok(customerSmokeTest.includes("bittensor.beta_release_gate"), "customer smoke test should expect the beta release gate stage");

const smokeDoc = read("docs/customer-ready-crypto-smoke.md");
for (const required of [
  "Bittensor Beta Gate",
  "pnpm smoke:bittensor-beta",
  "Hyperliquid and Polymarket remain preview/R&D-only",
]) {
  assert.ok(smokeDoc.includes(required), `customer smoke doc missing ${required}`);
}

const matrix = read("docs/agent-control-coverage-matrix.md");
for (const required of [
  "Bittensor beta release gate",
  "smoke:bittensor-beta",
  "test:bittensor-beta-release-gate",
]) {
  assert.ok(matrix.includes(required), `coverage matrix missing ${required}`);
}
