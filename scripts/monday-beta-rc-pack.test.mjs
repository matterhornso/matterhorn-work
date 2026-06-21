#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const outputDir = "/tmp/matterhorn-monday-beta-rc-pack-test";
rmSync(outputDir, { recursive: true, force: true });

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts?.["beta:monday-rc"], "node scripts/monday-beta-rc-pack.mjs");
assert.equal(packageJson.scripts?.["test:monday-beta-rc-pack"], "node scripts/monday-beta-rc-pack.test.mjs");

const docs = readFileSync("docs/monday-beta-rc-pack.md", "utf8");
for (const phrase of [
  "Matterhorn Work Monday Beta RC Pack",
  "pnpm --silent beta:monday-rc",
  "matterhorn-monday-beta-rc.json",
  "matterhorn-monday-beta-rc.md",
  "matterhorn-monday-beta-rc.sha256",
  "Can submit: No",
  "Live submission: Off",
  "Do not put any of the following into command flags",
]) {
  assert.ok(docs.includes(phrase), `RC pack docs should include ${phrase}`);
}

const script = readFileSync("scripts/monday-beta-rc-pack.mjs", "utf8");
for (const phrase of [
  "matterhorn.monday-beta-rc-pack.v1",
  "electron:tester-artifact",
  "desktop:beta-doctor",
  "smoke:customer-ready-crypto",
  "test:market-execution-safety-gate",
  "test:matterhorn-customer-onboarding-ui",
  "test:crypto-panel-ux",
  "test:customer-readiness-ui",
  "test:wellness-creator-workflow",
  "customer-demo-evidence-pack.mjs",
  "bittensor-beta-customer-packet.mjs",
  "Can submit: No",
  "Live submission: Off",
  "planned hooks only",
]) {
  assert.ok(script.includes(phrase), `RC pack script should include ${phrase}`);
}

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "/orders/submit",
  "/orders/sign",
  "/exchange/submit",
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
  "walletExport:",
]) {
  assert.equal(script.includes(forbidden), false, `RC pack must not include forbidden surface ${forbidden}`);
}

assert.ok(script.includes("[ \\t]*[:=][ \\t]*\\S+"), "Secret assignment detector should not cross line breaks");
assert.equal(script.includes("\\s*[:=]\\s*\\S+"), false, "Secret assignment detector must not treat a newline after '=' as a secret value");

const result = spawnSync("node", [
  "scripts/monday-beta-rc-pack.mjs",
  "--output-dir",
  outputDir,
  "--dry-run",
  "--skip-electron-build",
  "--json",
], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });

assert.equal(result.status, 0, result.stderr || result.stdout);
const report = JSON.parse(result.stdout);
assert.equal(report.version, "matterhorn.monday-beta-rc-pack.v1");
assert.equal(report.dryRun, true);
assert.equal(report.ready, true);
assert.equal(report.safety.nonCustodial, true);
assert.equal(report.safety.marketCanSubmit, false);
assert.equal(report.safety.marketLiveSubmissionEnabled, false);
assert.equal(report.safety.acceptsPrivateKeys, false);
assert.equal(report.safety.acceptsApiSecrets, false);
assert.equal(report.betaScope.bittensor, "beta_ready_external_signer");
assert.equal(report.betaScope.hyperliquid, "preview_only_external_signer");
assert.equal(report.betaScope.polymarket, "preview_only_external_signer");
assert.equal(report.betaScope.wellness, "workflow_ready_educational");
assert.equal(report.betaScope.decentralizedServices, "planned_not_live");

for (const id of [
  "ui.onboarding",
  "ui.protocol_panel",
  "ui.customer_readiness",
  "app.typecheck",
  "crypto.customer_smoke",
  "market.execution_safety",
  "wellness.workflow",
  "customer.demo_evidence",
  "bittensor.beta_packet",
  "desktop.artifact",
  "desktop.doctor",
]) {
  assert.ok(report.stages.some((stage) => stage.id === id), `RC pack should include stage ${id}`);
}

const jsonPath = join(outputDir, "matterhorn-monday-beta-rc.json");
const mdPath = join(outputDir, "matterhorn-monday-beta-rc.md");
const shaPath = join(outputDir, "matterhorn-monday-beta-rc.sha256");
assert.ok(existsSync(jsonPath), "RC pack should write JSON evidence");
assert.ok(existsSync(mdPath), "RC pack should write Markdown evidence");
assert.ok(existsSync(shaPath), "RC pack should write SHA evidence");

const markdown = readFileSync(mdPath, "utf8");
for (const phrase of [
  "# Matterhorn Work Monday Beta Release Candidate Pack",
  "Bittensor: beta-ready",
  "Hyperliquid: preview/external-signer/public-receipt only",
  "Polymarket: preview/external-signer/public-receipt only",
  "Wellness: educational workflow artifacts only",
  "Services: planned hooks only",
]) {
  assert.ok(markdown.includes(phrase), `RC Markdown should include ${phrase}`);
}

const combined = `${result.stdout}\n${markdown}\n${readFileSync(jsonPath, "utf8")}`;
for (const forbidden of [
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
  "walletExport:",
]) {
  assert.equal(combined.includes(forbidden), false, `RC pack output must not include ${forbidden}`);
}

console.log("Monday beta RC pack static/dry-run check passed.");
