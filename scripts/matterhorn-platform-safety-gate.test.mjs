#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const scriptPath = "scripts/matterhorn-platform-safety-gate.mjs";

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
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
assert.equal(
  packageJson.scripts?.["test:matterhorn-platform-safety"],
  "node scripts/matterhorn-platform-safety-gate.mjs",
  "package.json should expose the platform safety gate",
);
assert.equal(
  packageJson.scripts?.["test:matterhorn-platform-safety-gate"],
  "node scripts/matterhorn-platform-safety-gate.test.mjs",
  "package.json should expose the platform safety gate contract",
);
assert.equal(
  packageJson.scripts?.["test:production-launch-environment"],
  "node scripts/production-launch-environment.test.mjs",
  "package.json should expose the production launch environment contract",
);

const source = readFileSync(scriptPath, "utf8");
for (const required of [
  "matterhorn.platform-safety-gate.v1",
  "T1 approval surface as control",
  "T2 two-codebase seam",
  "T3 behavioral wallet QA",
  "T4 billing and entitlement integrity",
  "T5 local control perimeter",
  "T6 design contract enforcement",
  "T7 depth-first desk lanes",
  "T8 reliability and graceful degradation",
  "wallet.approval.behavior",
  "money.path.security",
  "desk.depth",
  "billing.integrity",
  "local.router.perimeter",
  "daemon.electron.perimeter",
  "observability.error_boundaries",
  "design.contract",
  "browser.smoke.contracts",
  "product.readiness",
  "wallet-approval-security-contract.test.ts",
  "wallet-send-behavior.test.ts",
  "wallet-approval-render-behavior.test.tsx",
  "wallet-runtime-connectors-contract.test.ts",
  "wallet-security-log-reporter.test.ts",
  "wallet-address-book-contract.test.ts",
  "transaction-simulation-safety.test.ts",
  "wallet-safety-policy-routes.e2e.test.ts",
  "backend-security.e2e.test.ts",
  "notes-routes.e2e.test.ts",
  "matterhorn-desk-agent-contract.test.mjs",
  "customer-ready-crypto-smoke.test.mjs",
  "workflow-stage-card.test.ts",
  "customer-workflow-templates.test.ts",
  "project-evidence-routes.e2e.test.ts",
  "wellness-creator-workflow.test.mjs",
  "billing-routes.e2e.test.ts",
  "apps/opencode-router/test/health-send.test.js",
  '"--filter",\n      "opencode-router",\n      "build"',
  "orchestrator-daemon-security.test.mjs",
  "electron-packaging-sources.test.mjs",
  "electron-updater-first-run.test.mjs",
  "alpha-macos-tester-artifact.test.mjs",
  "deep-link-runtime-contract.test.ts",
  "managed-opencode.test.ts",
  "app-error-boundary-contract.test.ts",
  "app-observability-contract.test.ts",
  "shared-primitives-ui-contract.test.ts",
  "outputs-panel-contract.test.ts",
  "matterhorn-design-system.test.mjs",
  "matterhorn-product-browser-smoke.test.mjs",
  "matterhorn-full-platform-browser-audit.test.mjs",
  "generated-media-browser-smoke.test.mjs",
  "generated-media-e2e-smoke.test.mjs",
  "wallet-approval-browser-smoke.test.mjs",
  "billing-browser-smoke.test.mjs",
  "notes-memory-browser-smoke.test.mjs",
  "outputs-browser-smoke.test.mjs",
  "production-cors-readiness.test.mjs",
  "production-launch-environment.test.mjs",
  "production-cors-readiness.mjs",
  "generated-media-diagnostics.test.ts",
  "generated-media-production-readiness.test.mjs",
  "product-readiness-smoke.test.mjs",
  "public-beta-owner-acceptance.test.mjs",
]) {
  assert.ok(source.includes(required), `platform safety gate missing ${required}`);
}

for (const forbidden of [
  "smoke:wallet-approval-browser",
  "smoke:matterhorn-product-browser",
  "smoke:generated-media-browser",
  "orders/submit",
  "orders/sign",
  "privateKey",
  "seedPhrase",
  "mnemonic",
]) {
  assert.equal(source.includes(forbidden), false, `platform safety gate should not run or expose ${forbidden}`);
}

const workflow = readFileSync(".github/workflows/ci-tests.yml", "utf8");
assert.ok(workflow.includes("matterhorn-platform-safety"), "CI should include a Matterhorn platform safety job");
assert.ok(workflow.includes("pnpm test:matterhorn-platform-safety"), "CI should run the platform safety package script");
assert.ok(workflow.includes("oven-sh/setup-bun@v2"), "CI should install Bun for focused server/app tests");
assert.ok(
  workflow.includes("pnpm rebuild better-sqlite3"),
  "CI should explicitly build the approved SQLite binding after the script-free install",
);
assert.ok(workflow.includes("pnpm test:production-cors-readiness"), "CI should validate production CORS readiness wiring");
assert.ok(workflow.includes("pnpm smoke:production-cors-readiness"), "CI should run production CORS readiness");
assert.ok(workflow.includes("pnpm test:product-readiness-smoke"), "CI should validate product readiness smoke wiring");

const dryRun = await run(["--dry-run", "--json"]);
assert.equal(dryRun.code, 0, dryRun.stderr || dryRun.stdout);
const report = JSON.parse(dryRun.stdout);
assert.equal(report.version, "matterhorn.platform-safety-gate.v1");
assert.equal(report.stageCount, 10);
assert.deepEqual(report.stages.map((stage) => stage.id), [
  "wallet.approval.behavior",
  "money.path.security",
  "desk.depth",
  "billing.integrity",
  "local.router.perimeter",
  "daemon.electron.perimeter",
  "observability.error_boundaries",
  "design.contract",
  "browser.smoke.contracts",
  "product.readiness",
]);
assert.ok(report.stages.every((stage) => Array.isArray(stage.command) && stage.command.length > 0));
assert.ok(
  report.stages.every((stage) => Array.isArray(stage.themes) && stage.themes.length >= 2),
  "every platform safety stage should declare assessment-theme coverage",
);
assert.ok(
  report.stages.some((stage) => stage.themes.includes("T1 approval surface as control")),
  "platform safety report should show approval-control coverage",
);
assert.ok(
  report.stages.some((stage) => stage.themes.includes("T5 local control perimeter")),
  "platform safety report should show local-perimeter coverage",
);
assert.ok(
  report.stages.some((stage) => stage.themes.includes("T8 reliability and graceful degradation")),
  "platform safety report should show observability/reliability coverage",
);

const only = await run(["--dry-run", "--json", "--only", "billing.integrity,design.contract"]);
assert.equal(only.code, 0, only.stderr || only.stdout);
const onlyReport = JSON.parse(only.stdout);
assert.deepEqual(onlyReport.stages.map((stage) => stage.id), ["billing.integrity", "design.contract"]);

const help = await run(["--help"]);
assert.equal(help.code, 0, help.stderr || help.stdout);
for (const text of [
  "Matterhorn platform safety gate",
  "--dry-run",
  "--only",
  "money paths",
  "local control surfaces",
]) {
  assert.ok(help.stdout.includes(text), `help missing ${text}`);
}

console.log("Matterhorn platform safety gate contract passed.");
