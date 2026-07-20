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
  "Matterhorn Desks Launch RC Pack",
  "pnpm --silent beta:monday-rc",
  "matterhorn-monday-beta-rc.json",
  "matterhorn-monday-beta-rc.md",
  "matterhorn-monday-beta-rc.sha256",
  "--release-profile controlled-beta",
  "production services remain disabled",
  "Can submit: No",
  "Live submission: Off",
  "Do not put any of the following into command flags",
]) {
  assert.ok(docs.includes(phrase), `RC pack docs should include ${phrase}`);
}

const script = readFileSync("scripts/monday-beta-rc-pack.mjs", "utf8");
for (const phrase of [
  "matterhorn.launch-rc-pack.v3",
  "electron:tester-artifact",
  "desktop:beta-doctor",
  "smoke:desktop-packaged-clean-profile",
  "smoke:customer-ready-crypto",
  "test:market-execution-safety-gate",
  "test:matterhorn-customer-onboarding-ui",
  "test:crypto-panel-ux",
  "test:customer-readiness-ui",
  "test:wellness-creator-workflow",
  "customer-demo-evidence-pack.mjs",
  "bittensor-beta-customer-packet.mjs",
  "test:matterhorn-platform-safety",
  "product-readiness-smoke.mjs",
  "matterhorn-product-browser-smoke.mjs",
  "--require-production",
  "--include-generated-media-flow",
  "--workspace-id",
  "--app-url",
  "missingConfiguration",
  "--bittensor-beta-gate",
  "--customer-ready-smoke",
  "--bittensor-evidence-verify",
  "--bittensor-browser-qa",
  "controlled_beta_exclusions",
  "CONTROLLED_BETA_BLOCKER_IDS",
  "--require-desk-results",
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
  "--server-url",
  "https://backend.example.test",
  "--token",
  "rc-pack-test-token",
  "--workspace-id",
  "ws_release_test",
  "--app-url",
  "https://app.example.test/workspace/ws_release_test/session",
  "--dry-run",
  "--skip-electron-build",
  "--json",
], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });

assert.equal(result.status, 0, result.stderr || result.stdout);
const report = JSON.parse(result.stdout);
assert.equal(report.version, "matterhorn.launch-rc-pack.v3");
assert.equal(report.dryRun, true);
assert.equal(report.releaseProfile, "production");
assert.equal(report.ready, false);
assert.equal(report.automationPassed, true);
assert.equal(report.productionEvidence.backendProbeConfigured, true);
assert.equal(report.productionEvidence.browserProbeConfigured, true);
assert.equal(report.productionEvidence.complete, false);
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
  "platform.safety",
  "ui.onboarding",
  "ui.protocol_panel",
  "ui.customer_readiness",
  "app.typecheck",
  "crypto.customer_smoke",
  "market.execution_safety",
  "wellness.workflow",
  "customer.demo_evidence",
  "bittensor.beta_packet",
  "production.product_readiness",
  "browser.product_smoke",
  "desktop.artifact",
  "desktop.doctor",
  "desktop.clean_profile",
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
  "# Matterhorn Desks Launch Release Candidate Pack",
  "Production evidence complete: `false`",
  "Bittensor: beta-ready",
  "Hyperliquid: preview/external-signer/public-receipt only",
  "Polymarket: preview/external-signer/public-receipt only",
  "Wellness: educational workflow artifacts only",
  "Services: planned hooks only",
]) {
  assert.ok(markdown.includes(phrase), `RC Markdown should include ${phrase}`);
}

const productReadinessStage = report.stages.find((stage) => stage.id === "production.product_readiness");
assert.ok(productReadinessStage, "RC pack should include production product readiness");
assert.ok(productReadinessStage.command.includes("--require-production"));
assert.ok(productReadinessStage.command.includes("--include-generated-media-flow"));
assert.ok(productReadinessStage.command.includes("ws_release_test"));
assert.ok(!productReadinessStage.command.includes("rc-pack-test-token"), "RC report must redact the client token");

const productBrowserStage = report.stages.find((stage) => stage.id === "browser.product_smoke");
assert.ok(productBrowserStage, "RC pack should include deployed product browser smoke");
assert.ok(productBrowserStage.command.includes("https://app.example.test/workspace/ws_release_test/session"));

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

assert.ok(
  script.includes("requireReadyOutput") && script.includes("semanticReady"),
  "RC pack must treat a child evidence report with ready=false as a failed stage",
);

const controlledBetaResult = spawnSync("node", [
  "scripts/monday-beta-rc-pack.mjs",
  "--output-dir",
  `${outputDir}-controlled-beta`,
  "--release-profile",
  "controlled-beta",
  "--server-url",
  "https://backend.example.test",
  "--token",
  "rc-pack-test-token",
  "--workspace-id",
  "ws_release_test",
  "--app-url",
  "https://app.example.test/workspace/ws_release_test/session",
  "--dry-run",
  "--skip-electron-build",
  "--json",
], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
assert.equal(controlledBetaResult.status, 0, controlledBetaResult.stderr || controlledBetaResult.stdout);
const controlledBetaReport = JSON.parse(controlledBetaResult.stdout);
assert.equal(controlledBetaReport.releaseProfile, "controlled-beta");
assert.ok(
  controlledBetaReport.stages.find((stage) => stage.id === "browser.product_smoke")?.command.includes("--require-desk-results"),
  "Controlled beta must require completed desk results in the browser smoke",
);
assert.ok(
  script.indexOf("parseJsonOutput(result.stdout)") < script.indexOf("const stdout = redact(result.stdout, config)"),
  "RC pack must parse complete child JSON before redacting and truncating report output",
);

const partialEvidenceResult = spawnSync("node", [
  "scripts/monday-beta-rc-pack.mjs",
  "--output-dir",
  `${outputDir}-partial-evidence`,
  "--dry-run",
  "--bittensor-beta-gate",
  "/tmp/beta.json",
  "--json",
], { encoding: "utf8" });
assert.notEqual(partialEvidenceResult.status, 0, "Partial real Bittensor evidence must be rejected");
assert.ok(
  partialEvidenceResult.stderr.includes("requires --bittensor-beta-gate"),
  "Partial evidence failure should name the required input group",
);

console.log("Monday beta RC pack static/dry-run check passed.");
