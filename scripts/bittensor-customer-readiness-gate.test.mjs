#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "bittensor-customer-readiness-gate.mjs");

function run(args) {
  const child = spawn("node", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const dir = await mkdtemp(join(tmpdir(), "matterhorn-customer-gate-"));
const bittensorPath = join(dir, "bittensor.json");
const agentPath = join(dir, "agent.json");
const ciPath = join(dir, "ci.json");
const schedulerPath = join(dir, "watch-scheduler.json");
const outputPath = join(dir, "readiness.md");

const stages = [
  { id: "bittensor.readiness", label: "Readiness", status: "pass" },
  { id: "bittensor.wallet.missing_address", label: "Show my TAO missing address", status: "pass" },
  { id: "bittensor.wallet.change_baseline", label: "Wallet change baseline", status: "pass" },
  { id: "bittensor.validators.compare", label: "Compare validators", status: "pass" },
  { id: "bittensor.stake.unsigned_preview", label: "Unsigned staking preview", status: "pass" },
  { id: "bittensor.subnet.invocation_preview", label: "Subnet adapter preview", status: "pass" },
  { id: "bittensor.monitoring.watch_check", label: "Watch check", status: "pass" },
];

await writeFile(bittensorPath, JSON.stringify({
  ready: true,
  summary: { pass: stages.length, warn: 0, fail: 0, skip: 0 },
  stages,
}), "utf8");
await writeFile(agentPath, JSON.stringify({
  ready: true,
  summary: { pass: 3, warn: 0, fail: 0, skip: 0 },
  stages: [{ id: "agent.health", label: "Health", status: "pass" }],
}), "utf8");
await writeFile(ciPath, JSON.stringify({
  workflow_runs: [
    { name: "Matterhorn Desks Tests", conclusion: "success" },
    { name: "i18n Audit", conclusion: "success" },
    { name: "Alpha Channel macOS arm64", conclusion: "success" },
  ],
}), "utf8");
await writeFile(schedulerPath, JSON.stringify({
  ok: true,
  source: "matterhorn_bittensor_watch_autopilot_scheduler",
  iterations: 6,
  totalEvaluations: 12,
  totalAlerts: 1,
  failedChecks: 0,
  notificationSummary: {
    totalNotifications: 1,
    intents: { review_wallet: 1 },
    promptSamples: [{
      intent: "review_wallet",
      label: "Wallet exposure",
      prompt: "Bittensor Agent task: review public Bittensor wallet 5Ek9...",
    }],
    safety: "read_only_agent_tasks",
  },
  safety: {
    custody: "none",
    acceptsCredentialMaterial: false,
    signsOrBroadcasts: false,
    submitsTransactions: false,
    invokesSubnetServices: false,
  },
}), "utf8");

const ok = await run([
  "--bittensor-live-qa", bittensorPath,
  "--agent-control-live-qa", agentPath,
  "--ci", ciPath,
  "--watch-autopilot-scheduler", schedulerPath,
  "--require-watch-autopilot-scheduler",
  "--output", outputPath,
  "--skip-doc-check",
  "--strict",
]);
assert.equal(ok.code, 0, ok.stderr || ok.stdout);
const markdown = await readFile(outputPath, "utf8");
assert.ok(markdown.includes("READY_FOR_TEST_CUSTOMERS"));
assert.ok(markdown.includes("Matterhorn Desks Tests passed."));
assert.ok(markdown.includes("Covered validator comparison."));
assert.ok(markdown.includes("Scheduled watch autopilot reported ready."));
assert.ok(markdown.includes("Completed 6 scheduled watch checks."));
assert.ok(markdown.includes("Prepared 1 read-only Bittensor Agent task"));
assert.equal(/seed phrase|private key|wallet export/i.test(markdown), false);

const missingWalletPath = join(dir, "bittensor-missing-wallet.json");
await writeFile(missingWalletPath, JSON.stringify({
  ready: true,
  summary: { pass: 1, warn: 0, fail: 0, skip: 1 },
  stages: [{ id: "bittensor.readiness", label: "Readiness", status: "pass" }],
}), "utf8");
const strictWallet = await run([
  "--bittensor-live-qa", missingWalletPath,
  "--agent-control-live-qa", agentPath,
  "--ci", ciPath,
  "--skip-doc-check",
  "--require-wallet",
  "--strict",
]);
assert.equal(strictWallet.code, 1);
assert.ok(strictWallet.stdout.includes("NOT_READY"));
assert.ok(strictWallet.stdout.includes("Bittensor stages were skipped"));

const missingScheduler = await run([
  "--bittensor-live-qa", bittensorPath,
  "--agent-control-live-qa", agentPath,
  "--ci", ciPath,
  "--skip-doc-check",
  "--require-watch-autopilot-scheduler",
  "--strict",
]);
assert.equal(missingScheduler.code, 1);
assert.ok(missingScheduler.stdout.includes("Missing scheduled watch autopilot summary evidence."));

const unsafeSchedulerPath = join(dir, "watch-scheduler-unsafe.json");
await writeFile(unsafeSchedulerPath, JSON.stringify({
  ok: true,
  iterations: 1,
  totalEvaluations: 1,
  totalAlerts: 0,
  failedChecks: 0,
  safety: { signsOrBroadcasts: true },
}), "utf8");
const unsafeScheduler = await run([
  "--bittensor-live-qa", bittensorPath,
  "--agent-control-live-qa", agentPath,
  "--ci", ciPath,
  "--watch-autopilot-scheduler", unsafeSchedulerPath,
  "--skip-doc-check",
  "--strict",
]);
assert.equal(unsafeScheduler.code, 1);
assert.ok(unsafeScheduler.stdout.includes("Scheduled watch evidence is not read-only safe."));

const forbiddenPath = join(dir, "forbidden.json");
await writeFile(forbiddenPath, JSON.stringify({
  ready: true,
  summary: { pass: 1, warn: 0, fail: 0, skip: 0 },
  stages: [],
  artifacts: { privateKey: "never" },
}), "utf8");
const forbidden = await run(["--bittensor-live-qa", forbiddenPath]);
assert.notEqual(forbidden.code, 0);
assert.match(forbidden.stderr, /forbidden secret-shaped field/i);

console.log("Matterhorn Bittensor customer readiness gate test passed.");
