#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const helper = readFileSync("scripts/matterhorn-workflow-catalog.mjs", "utf8");
const cli = readFileSync("apps/orchestrator/src/cli.ts", "utf8");
const contractDoc = readFileSync("docs/matterhorn-workflow-contract.md", "utf8");
const wellnessDoc = readFileSync("docs/wellness-creator-workflow.md", "utf8");
const coverageMatrix = readFileSync("docs/agent-control-coverage-matrix.md", "utf8");

assert.equal(
  pkg.scripts["test:matterhorn-workflow-catalog"],
  "node scripts/matterhorn-workflow-catalog.test.mjs",
  "package.json should expose the workflow catalog gate",
);

for (const phrase of [
  "matterhorn.workflow.catalog.v1",
  "wellness_creator_workflow",
  "wellness_creator_services",
  "bittensor_operator",
  "market_read_preview",
  "decentralized_services_planner",
  "matterhorn-work workflows catalog --json",
  "pnpm test:matterhorn-workflow-catalog",
]) {
  assert.ok(helper.includes(phrase) || contractDoc.includes(phrase), `helper/doc missing phrase: ${phrase}`);
}

for (const phrase of [
  "matterhorn-work workflows catalog",
  "workflows catalog",
  "runWorkflows",
  "assertNoWorkflowSecrets",
  "matterhorn-workflow-catalog.mjs",
]) {
  assert.ok(cli.includes(phrase), `CLI missing workflow catalog phrase: ${phrase}`);
}

const result = spawnSync(process.execPath, ["scripts/matterhorn-workflow-catalog.mjs", "--json"], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(result.status, 0, `workflow catalog should exit 0. stderr=${result.stderr}`);
const catalog = JSON.parse(result.stdout);
assert.equal(catalog.version, "matterhorn.workflow.catalog.v1");
assert.equal(catalog.status, "catalog_only");
assert.equal(catalog.ok, true);
assert.equal(catalog.safety.catalogOnly, true);
assert.equal(catalog.safety.noProviderExecution, true);
assert.equal(catalog.safety.noCustody, true);
assert.equal(catalog.safety.noLiveMarketSubmit, true);
assert.equal(catalog.safety.acceptsSecrets, false);
assert.equal(catalog.safety.acceptsPrivateKeys, false);
assert.equal(catalog.safety.acceptsApiSecrets, false);
assert.equal(catalog.safety.acceptsRawSignatures, false);
assert.equal(catalog.safety.canSubmit, false);
assert.equal(catalog.safety.liveExecutionEnabled, false);

const ids = catalog.workflows.map((workflow) => workflow.workflowId);
assert.deepEqual(ids, [
  "wellness_creator_workflow",
  "wellness_creator_services",
  "bittensor_operator",
  "market_read_preview",
  "decentralized_services_planner",
]);
assert.equal(catalog.counts.total, 5);
assert.equal(catalog.counts.byCategory.wellness, 2);
assert.equal(catalog.counts.byCategory.bittensor, 1);
assert.equal(catalog.counts.byCategory.markets, 1);
assert.equal(catalog.counts.byCategory.decentralized_services, 1);

for (const workflow of catalog.workflows) {
  assert.equal(workflow.safety.acceptsSecrets, false, `${workflow.workflowId} must reject secrets`);
  assert.equal(workflow.safety.acceptsPrivateKeys, false, `${workflow.workflowId} must reject private keys`);
  assert.equal(workflow.safety.acceptsApiSecrets, false, `${workflow.workflowId} must reject API secrets`);
  assert.equal(workflow.safety.acceptsRawSignatures, false, `${workflow.workflowId} must reject raw signatures`);
  assert.equal(workflow.safety.canSubmit, false, `${workflow.workflowId} must not submit`);
  assert.equal(workflow.safety.liveExecutionEnabled, false, `${workflow.workflowId} must not enable live execution`);
  assert.ok(Array.isArray(workflow.serviceHooks), `${workflow.workflowId} should include service hooks`);
  assert.ok(Array.isArray(workflow.generatedArtifacts), `${workflow.workflowId} should include artifact names`);
}

const wellness = catalog.workflows.find((workflow) => workflow.workflowId === "wellness_creator_workflow");
assert.ok(wellness, "catalog should include the full Wellness Creator Workflow");
assert.equal(wellness.localArtifactsAvailable, true);
assert.equal(wellness.canExecuteProviderActions, false);
assert.equal(wellness.safety.givesMedicalAdvice, false);
assert.equal(wellness.safety.movesFunds, false);
assert.ok(wellnessDoc.includes("full Matterhorn Work workflow"), "wellness doc should remain full workflow");

const promptResult = spawnSync(process.execPath, [
  "scripts/matterhorn-workflow-catalog.mjs",
  "--workflow",
  "wellness_creator_workflow",
  "--include-prompts",
  "--json",
], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(promptResult.status, 0, `workflow filter should exit 0. stderr=${promptResult.stderr}`);
const promptCatalog = JSON.parse(promptResult.stdout);
assert.deepEqual(promptCatalog.workflows.map((workflow) => workflow.workflowId), ["wellness_creator_workflow"]);
assert.equal(promptCatalog.workflows[0].canonicalPrompts.length, 7);

const categoryResult = spawnSync(process.execPath, [
  "scripts/matterhorn-workflow-catalog.mjs",
  "--category",
  "markets",
  "--json",
], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.equal(categoryResult.status, 0, `category filter should exit 0. stderr=${categoryResult.stderr}`);
const categoryCatalog = JSON.parse(categoryResult.stdout);
assert.deepEqual(categoryCatalog.workflows.map((workflow) => workflow.workflowId), ["market_read_preview"]);

const reject = spawnSync(process.execPath, [
  "scripts/matterhorn-workflow-catalog.mjs",
  "--json",
  "--private-key",
  "redacted",
], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.notEqual(reject.status, 0, "workflow catalog should reject credential-shaped flags");
assert.match(reject.stderr, /Forbidden credential-shaped flag --private-key/);

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "/api/services/execute",
  "/api/services/submit",
  "submitRoute",
  "signRoute",
  "liveExecutionEnabled: true",
  "canSubmit: true",
  "acceptsSecrets: true",
  "acceptsPrivateKeys: true",
  "acceptsApiSecrets: true",
  "acceptsRawSignatures: true",
]) {
  assert.equal(helper.includes(forbidden), false, `workflow catalog helper must not expose ${forbidden}`);
  assert.equal(cli.includes(forbidden), false, `workflow catalog CLI must not expose ${forbidden}`);
}

for (const phrase of [
  "Workflow Catalog",
  "matterhorn-work workflows catalog --json",
  "test:matterhorn-workflow-catalog",
]) {
  assert.ok(contractDoc.includes(phrase) || coverageMatrix.includes(phrase), `docs should cover ${phrase}`);
}

console.log("Matterhorn workflow catalog check passed.");
