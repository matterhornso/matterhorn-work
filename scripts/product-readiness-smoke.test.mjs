#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/product-readiness-smoke.mjs", ...args], { stdio: ["ignore", "pipe", "pipe"] });
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
assert.equal(packageJson.scripts["smoke:product-readiness"], "node scripts/product-readiness-smoke.mjs --strict --include-generated-media-flow");
assert.equal(packageJson.scripts["test:product-readiness-smoke"], "node scripts/product-readiness-smoke.test.mjs");

const dryRun = await run(["--dry-run", "--include-generated-media-flow", "--json"]);
assert.equal(dryRun.code, 0, dryRun.stderr || dryRun.stdout);
const report = JSON.parse(dryRun.stdout);
assert.equal(report.ready, true);
assert.equal(report.dryRun, true);
assert.equal(report.safety.nonCustodial, true);
assert.equal(report.safety.liveSubmissionEnabled, false);
assert.equal(report.safety.asksForSecrets, false);
assert.equal(report.safety.trainingUse, "none_by_default");
assert.match(report.metadata.generatedAt, /^\d{4}-\d{2}-\d{2}T/);

const stageIds = report.stages.map((stage) => stage.id);
for (const id of [
  "workspace.resolve",
  "production.cors_readiness",
  "backend.capabilities",
  "workspace.readiness",
  "backend.control_plane",
  "backend.support_report",
  "backend.data_map",
  "backend.data_controls",
  "team.access_summary",
  "ledger.project",
  "ledger.export",
  "billing.production_readiness",
  "generated_media.production_readiness",
  "generated_media.history",
  "generated_media.flow",
]) {
  assert.ok(stageIds.includes(id), `dry-run missing stage ${id}`);
}

const generatedMediaStage = report.stages.find((stage) => stage.id === "generated_media.flow");
assert.deepEqual(generatedMediaStage.command, ["node", "scripts/generated-media-flow-smoke.mjs", "--strict"]);
const generatedMediaProductionStage = report.stages.find((stage) => stage.id === "generated_media.production_readiness");
assert.deepEqual(generatedMediaProductionStage.command, ["node", "scripts/generated-media-production-readiness.mjs", "--json"]);
const billingProductionStage = report.stages.find((stage) => stage.id === "billing.production_readiness");
assert.deepEqual(billingProductionStage.command, ["GET", "<server>", "/workspace/<id>/billing/status"]);
const corsStage = report.stages.find((stage) => stage.id === "production.cors_readiness");
assert.deepEqual(corsStage.command, ["node", "scripts/production-cors-readiness.mjs", "--require-production"]);

const outputDir = mkdtempSync(join(tmpdir(), "matterhorn-product-readiness-smoke-"));
try {
  const jsonOutput = join(outputDir, "product-readiness.json");
  const markdownOutput = join(outputDir, "product-readiness.md");
  const outputRun = await run(["--dry-run", "--json-output", jsonOutput, "--markdown-output", markdownOutput]);
  assert.equal(outputRun.code, 0, outputRun.stderr || outputRun.stdout);
  assert.ok(outputRun.stdout.includes(`JSON report: ${jsonOutput}`));
  assert.ok(outputRun.stdout.includes(`Markdown report: ${markdownOutput}`));
  const outputReport = JSON.parse(readFileSync(jsonOutput, "utf8"));
  assert.equal(outputReport.ready, true);
  assert.equal(outputReport.dryRun, true);
  assert.ok(outputReport.stages.some((stage) => stage.id === "generated_media.history"));
  const markdown = readFileSync(markdownOutput, "utf8");
  assert.ok(markdown.includes("# Matterhorn Product Readiness"));
  assert.ok(markdown.includes("## Stages"));
  assert.ok(markdown.includes("workspace.resolve"));
  assert.ok(markdown.includes("generated_media.history"));
  assert.ok(markdown.includes("Non-custodial: yes"));
  assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(markdown));
  assert.ok(!/owt_[A-Za-z0-9._-]{16,}/.test(markdown));
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}

const source = readFileSync("scripts/product-readiness-smoke.mjs", "utf8");
for (const endpoint of [
  "/api/backend/capabilities",
  "/backend/readiness",
  "/backend/control-plane",
  "/backend/support-report",
  "/backend/data-map",
  "/backend/data-controls",
  "/backend/team-access/summary",
  "/data-ledger?limit=20",
  "/data-ledger/export?limit=20",
  "/billing/status",
  "/generated-media/history?limit=20",
  "scripts/production-cors-readiness.mjs",
  "scripts/generated-media-production-readiness.mjs",
]) {
  assert.ok(source.includes(endpoint), `product readiness smoke missing endpoint ${endpoint}`);
}

for (const required of [
  "matterhorn.backend.capabilities.v1",
  "matterhorn.backend.readiness.v1",
  "matterhorn.backend.control-plane.v1",
  "matterhorn.backend.support-report.v1",
  "matterhorn.backend.data-map.v1",
  "matterhorn.backend.data-controls.v1",
  "matterhorn.backend.team-access.v1",
  "matterhorn.project-data-ledger.v1",
  "matterhorn.project-data-ledger-export.v1",
  "matterhorn.production-cors-readiness.v1",
  "none_by_default",
  "imageOutputs",
  "scripts/generated-media-flow-smoke.mjs",
  "matterhorn.generated-media-production-readiness.v1",
  "generated_media.production_readiness",
  "billing.production_readiness",
  "billingProductionReadiness",
  "generatedMediaReadinessFailure",
  "generatedMediaFlowFailure",
  "generatedMediaProductionReadiness",
  "publicWritesDuringDiagnostics",
  "production.cors_readiness",
  "--include-generated-media-flow",
  "--require-production",
  "--markdown-output",
  "Markdown report",
  "config.strict || config.requireProduction",
]) {
  assert.ok(source.includes(required), `product readiness smoke missing contract ${required}`);
}

for (const forbidden of [
  "OPENAI_API_KEY",
  "MATTERHORN_WALRUS_PUBLISHER_BEARER_TOKEN",
  "privateKey",
  "seedPhrase",
  "mnemonic",
  "rawSignature",
  "signedPayload",
  "walletExport",
]) {
  assert.ok(source.includes(forbidden), `product readiness smoke should guard ${forbidden}`);
}

assert.ok(!source.includes("X-Matterhorn-Host-Token\": config"), "product smoke must not send host-token auth");
assert.ok(!source.includes("orders/submit"), "product smoke must not reference market submit routes");
assert.ok(!source.includes("orders/sign"), "product smoke must not reference market sign routes");

const help = await run(["--help"]);
assert.equal(help.code, 0, help.stderr || help.stdout);
for (const text of [
  "Matterhorn product-readiness smoke",
  "pnpm dev:generated-media-smoke",
  "pnpm smoke:product-readiness",
  "--include-generated-media-flow",
  "--require-production",
  "--markdown-output",
]) {
  assert.ok(help.stdout.includes(text), `help missing ${text}`);
}

const productionDryRun = await run(["--dry-run", "--require-production", "--json"]);
assert.equal(productionDryRun.code, 0, productionDryRun.stderr || productionDryRun.stdout);
const productionReport = JSON.parse(productionDryRun.stdout);
assert.equal(productionReport.metadata.requireProduction, true);
assert.deepEqual(
  productionReport.stages.find((stage) => stage.id === "generated_media.production_readiness")?.command,
  ["node", "scripts/generated-media-production-readiness.mjs", "--require-production", "--json"],
);

const stableLaunchDryRun = await run(["--dry-run", "--require-production", "--enforce-launch-scope", "--json"]);
assert.equal(stableLaunchDryRun.code, 0, stableLaunchDryRun.stderr || stableLaunchDryRun.stdout);
const stableLaunchReport = JSON.parse(stableLaunchDryRun.stdout);
assert.deepEqual(stableLaunchReport.metadata.launchScope, {
  enforced: true,
  billing: false,
  generatedMedia: false,
});
for (const stageId of [
  "billing.production_readiness",
  "generated_media.production_readiness",
  "generated_media.history",
]) {
  const stage = stableLaunchReport.stages.find((candidate) => candidate.id === stageId);
  assert.equal(stage?.status, "skip", `${stageId} should be skipped outside the stable launch scope`);
  assert.match(stage?.reason ?? "", /not included in this stable launch scope/);
}

const contradictoryScope = await run([
  "--dry-run",
  "--enforce-launch-scope",
  "--include-generated-media-flow",
  "--json",
]);
assert.equal(contradictoryScope.code, 1);
assert.match(contradictoryScope.stderr, /requires --launch-generated-media/);

const failingServer = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/workspaces") {
    response.end(JSON.stringify({ activeId: "ws_strict_inventory" }));
    return;
  }
  response.statusCode = 503;
  response.end(JSON.stringify({ error: "fixture unavailable" }));
});
await new Promise((resolve, reject) => {
  failingServer.once("error", reject);
  failingServer.listen(0, "127.0.0.1", resolve);
});
try {
  const address = failingServer.address();
  assert.ok(address && typeof address === "object");
  const strictInventory = await run([
    "--server-url",
    `http://127.0.0.1:${address.port}`,
    "--token",
    "readiness-test-token",
    "--workspace-id",
    "ws_strict_inventory",
    "--strict",
    "--json",
  ]);
  assert.equal(strictInventory.code, 1, strictInventory.stderr || strictInventory.stdout);
  const strictReport = JSON.parse(strictInventory.stdout);
  assert.ok(strictReport.summary.fail > 2, "strict mode should inventory more than the first failure");
  assert.ok(strictReport.stages.some((stage) => stage.id === "backend.capabilities" && stage.status === "fail"));
  assert.ok(strictReport.stages.some((stage) => stage.id === "generated_media.history"), "strict mode should reach the final read-only stage");
  assert.equal(strictReport.launchBlockers.length, strictReport.summary.fail);
} finally {
  await new Promise((resolve) => failingServer.close(resolve));
}

console.log("Product-readiness smoke contract passed.");
