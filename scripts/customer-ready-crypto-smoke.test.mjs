#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/customer-ready-crypto-smoke.mjs", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts["smoke:customer-ready-crypto"], "node scripts/customer-ready-crypto-smoke.mjs --offline --strict");
assert.equal(packageJson.scripts["test:customer-ready-crypto-smoke"], "node scripts/customer-ready-crypto-smoke.test.mjs");

const dryRun = await run(["--dry-run", "--json"]);
assert.equal(dryRun.code, 0, dryRun.stderr || dryRun.stdout);
const report = JSON.parse(dryRun.stdout);
assert.equal(report.ready, true);
assert.equal(report.dryRun, true);
assert.equal(report.safety.nonCustodial, true);
assert.equal(report.safety.liveSubmissionEnabled, false);
assert.equal(report.safety.asksForSecrets, false);

const stageIds = report.stages.map((stage) => stage.id);
for (const id of [
  "market.safety_contract",
  "market.execution_safety",
  "market.receipt_qa",
  "market.receipt_evidence",
  "hyperliquid.readiness",
  "polymarket.readiness",
  "hyperliquid.read_preview",
  "polymarket.read_preview",
  "hyperliquid.cli",
  "polymarket.cli",
  "market.live_readonly_self_test",
  "market.live_readonly_server",
  "bittensor.customer_readiness",
  "bittensor.receipt",
  "bittensor.watch_autopilot",
  "bittensor.watch_scheduler",
  "bittensor.signing_handoff",
  "bittensor.evidence_bundle",
]) {
  assert.ok(stageIds.includes(id), `dry-run missing stage ${id}`);
}

const commandText = report.stages.map((stage) => stage.command.join(" ")).join("\n");
for (const banned of ["/orders/submit", "/orders/sign", "/exchange/submit"]) {
  assert.ok(!commandText.includes(banned), `smoke command must not reference ${banned}`);
}
for (const required of [
  "pnpm test:market-execution-safety-gate",
  "pnpm test:hyperliquid-read-preview-qa",
  "pnpm test:polymarket-read-preview-qa",
  "pnpm test:bittensor-customer-readiness-gate",
  "pnpm test:bittensor-watch-autopilot-scheduler",
  "node scripts/market-live-readonly-smoke.mjs",
]) {
  assert.ok(commandText.includes(required), `smoke command list missing ${required}`);
}
assert.ok(!commandText.includes("client-token"), "dry-run must not expose a concrete token placeholder");

const doc = readFileSync("docs/customer-ready-crypto-smoke.md", "utf8");
for (const required of [
  "Customer-Ready Crypto Smoke",
  "pnpm smoke:customer-ready-crypto",
  "node scripts/customer-ready-crypto-smoke.mjs --dry-run --json",
  "canSubmit: false",
  "never submits",
  "never signs",
  "Bittensor",
  "Hyperliquid",
  "Polymarket",
]) {
  assert.ok(doc.includes(required), `smoke doc missing ${required}`);
}

const plan = readFileSync("docs/customer-ready-crypto-build-plan.md", "utf8");
for (const phase of [
  "Phase 1: Customer Readiness Smoke Pass",
  "Phase 2: Unified Market Chat Router",
  "Phase 3: Shared Cross-Venue Cards",
  "Phase 4: Bittensor Customer Polish",
  "Phase 5: Official SDK Validation Track",
  "Phase 6: Agent Control Surface Polish",
]) {
  assert.ok(plan.includes(phase), `build plan missing ${phase}`);
}

const script = readFileSync("scripts/customer-ready-crypto-smoke.mjs", "utf8");
for (const banned of ["/orders/submit", "/orders/sign", "/exchange/submit"]) {
  assert.ok(!script.includes(`"${banned}"`), `script must not call ${banned}`);
}

console.log("Customer-ready crypto smoke wiring test passed.");
