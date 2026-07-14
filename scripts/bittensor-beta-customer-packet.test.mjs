#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/bittensor-beta-customer-packet.mjs", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
assert.equal(packageJson.scripts["beta:bittensor:packet"], "node scripts/bittensor-beta-customer-packet.mjs --output-dir /tmp/matterhorn-bittensor-beta-rc --fixture --json");
assert.equal(packageJson.scripts["test:bittensor-beta-customer-packet"], "node scripts/bittensor-beta-customer-packet.test.mjs");

const dir = await mkdtemp(join(tmpdir(), "matterhorn-bittensor-beta-packet-"));
const betaPath = join(dir, "beta.json");
const smokePath = join(dir, "smoke.json");
const evidencePath = join(dir, "bittensor-evidence.json");
const livePath = join(dir, "live-public.json");
const browserPath = join(dir, "browser-qa.md");
const outputDir = join(dir, "packet");

const betaStages = [
  "bittensor.beta_static_gate",
  "bittensor.customer_readiness",
  "bittensor.receipt",
  "bittensor.watch_autopilot",
  "bittensor.watch_scheduler",
  "bittensor.signing_handoff",
  "bittensor.evidence_bundle",
  "bittensor.evidence_verify",
  "bittensor.adapter_readonly_canary",
  "market.execution_safety",
  "market.execution_readiness",
  "market.submit_sign_phase0_contract",
  "market.sign_request_phase1",
  "market.artifact_validation_phase2",
].map((id) => ({ id, label: id, status: "pass" }));

await writeFile(betaPath, JSON.stringify({
  version: "matterhorn.bittensor-beta-release-gate.v1",
  ready: true,
  metadata: { generatedAt: "2026-06-18T00:00:00.000Z", gitSha: "a".repeat(40), gitBranch: "beta/bittensor" },
  safety: {
    betaScope: "bittensor",
    nonCustodial: true,
    asksForSecrets: false,
    bittensorExternalSignerRequired: true,
    marketExecutionEnabled: false,
    liveSubmissionEnabled: false,
  },
  summary: { pass: betaStages.length, fail: 0, skip: 0 },
  stages: betaStages,
}), "utf8");
await writeFile(smokePath, JSON.stringify({
  ready: true,
  safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
  summary: { pass: 45, fail: 0, skip: 0 },
}), "utf8");
await writeFile(evidencePath, JSON.stringify({
  ok: true,
  ready: true,
  status: "READY_FOR_TEST_CUSTOMERS",
  safety: { nonCustodial: true, liveSubmissionEnabled: false, signsOrBroadcasts: false, acceptsSecrets: false },
}), "utf8");
await writeFile(livePath, JSON.stringify({
  ready: true,
  status: "READY_PUBLIC_DATA_ONLY",
  stages: [{ id: "bittensor.wallet", status: "pass" }],
}), "utf8");
await writeFile(browserPath, [
  "# Bittensor Browser QA",
  "- Bittensor desk checked.",
  "- Show my TAO balance checked with public SS58 address intake.",
  "- Find useful subnets checked.",
  "- Compare validators checked.",
  "- Prepare staking preview checked.",
  "- degraded provider state checked.",
  "- external signer handoff checked.",
  "- launched session stayed visible.",
  "- mobile viewport checked.",
  "- tablet viewport checked.",
  "- desktop viewport checked.",
].join("\n"), "utf8");

const ok = await run([
  "--output-dir", outputDir,
  "--beta-gate", betaPath,
  "--customer-ready-smoke", smokePath,
  "--bittensor-evidence-verify", evidencePath,
  "--live-public-qa", livePath,
  "--browser-qa", browserPath,
  "--strict",
  "--json",
]);
assert.equal(ok.code, 0, ok.stderr || ok.stdout);
const summary = JSON.parse(ok.stdout);
assert.equal(summary.ready, true);
assert.equal(summary.status, "READY_FOR_TEST_CUSTOMER_QA");
assert.ok(existsSync(summary.files.json), "packet JSON should exist");
assert.ok(existsSync(summary.files.markdown), "packet Markdown should exist");
assert.ok(existsSync(summary.files.sha256), "packet SHA should exist");

const packet = JSON.parse(await readFile(summary.files.json, "utf8"));
assert.equal(packet.version, "matterhorn.bittensor-beta-rc-packet.v1");
assert.equal(packet.ready, true);
assert.equal(packet.safety.betaScope, "bittensor");
assert.equal(packet.safety.liveSubmissionEnabled, false);
assert.equal(packet.safety.marketExecutionEnabled, false);
assert.equal(packet.evidence.betaGate.ready, true);
assert.equal(packet.evidence.browserQa.ready, true);
const markdown = await readFile(summary.files.markdown, "utf8");
assert.ok(markdown.includes("READY_FOR_TEST_CUSTOMER_QA"));
assert.ok(markdown.includes("Bittensor is the customer-facing beta surface."));
assert.ok(markdown.includes("Hyperliquid and Polymarket remain preview/R&D-only"));
assert.ok(markdown.includes("Rollback Plan"));
assert.equal(/privateKey\s*[:=]|seedPhrase\s*[:=]|signedPayload\s*[:=]/i.test(markdown), false);

const fixtureOutput = join(dir, "fixture");
const fixture = await run(["--output-dir", fixtureOutput, "--fixture", "--json"]);
assert.equal(fixture.code, 0, fixture.stderr || fixture.stdout);
const fixtureSummary = JSON.parse(fixture.stdout);
assert.equal(fixtureSummary.ready, false);
assert.ok(fixtureSummary.warnings.some((warning) => warning.includes("Fixture mode")));
assert.ok(fixtureSummary.errors.some((error) => error.includes("Browser QA checklist is missing")));

const unsafePath = join(dir, "unsafe.json");
await writeFile(unsafePath, JSON.stringify({
  ready: true,
  privateKey: "never",
}), "utf8");
const unsafe = await run(["--output-dir", join(dir, "unsafe-output"), "--beta-gate", unsafePath, "--json"]);
assert.equal(unsafe.code, 1);
assert.ok(unsafe.stderr.includes("forbidden secret-shaped field"));

const doc = await readFile("docs/bittensor-beta-go-live-runbook.md", "utf8");
for (const required of [
  "Bittensor Beta Go-Live Runbook",
  "pnpm smoke:bittensor-beta",
  "pnpm beta:bittensor:packet",
  "VITE_MATTERHORN_BITTENSOR_BETA=1",
  "MARKETS_LIVE_SUBMIT_ENABLED=false",
  "Browser QA Checklist",
  "Rollback Plan",
]) {
  assert.ok(doc.includes(required), `go-live runbook missing ${required}`);
}

const packetScript = await readFile("scripts/bittensor-beta-customer-packet.mjs", "utf8");
for (const forbidden of ["/orders/submit", "/orders/sign", "/exchange/submit", "submitOrder(", "signOrder("]) {
  assert.equal(packetScript.includes(forbidden), false, `packet script must not include ${forbidden}`);
}
