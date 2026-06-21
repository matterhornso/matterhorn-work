#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// 1. Package exposes the evidence pack gate.
assert.equal(
  pkg.scripts["test:customer-demo-evidence-pack"],
  "node scripts/customer-demo-evidence-pack.test.mjs",
  "package.json should expose test:customer-demo-evidence-pack",
);

const expectedScenarioIds = [
  "bittensor_tao_staking_preview",
  "hyperliquid_order_preview",
  "polymarket_market_research",
  "wellness_client_program_packet",
  "decentralized_services_future_plan",
];

function run(extraArgs = []) {
  return spawnSync(process.execPath, ["scripts/customer-demo-evidence-pack.mjs", ...extraArgs], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
}

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "monday-beta-evidence-"));
}

// 2. Default run emits all scenarios.
const outputDir = tmpDir();
const result = run(["--output-dir", outputDir]);
assert.equal(result.status, 0, `evidence pack should exit 0. stderr=${result.stderr}`);

const summary = JSON.parse(result.stdout);
assert.equal(summary.ok, true);
assert.equal(summary.outputDir, outputDir);
assert.equal(summary.scenarioCount, expectedScenarioIds.length);
assert.equal(summary.betaCustomerCount, 10);
assert.ok(summary.sha256, "summary must include sha256");

const files = readdirSync(outputDir).sort();
assert.ok(files.includes("monday-beta-evidence-manifest.json"), "manifest file must exist");
assert.ok(files.includes("monday-beta-evidence-manifest.json.sha256"), "hash file must exist");

const expectedRunbooks = expectedScenarioIds.map((id) => `${id.replace(/[^a-z0-9_-]/gi, "_")}-runbook.md`);
for (const runbook of expectedRunbooks) {
  assert.ok(files.includes(runbook), `runbook ${runbook} must exist`);
}

// 3. Manifest content is complete and safe.
const manifest = JSON.parse(readFileSync(join(outputDir, "monday-beta-evidence-manifest.json"), "utf8"));
assert.equal(manifest.ok, true);
assert.equal(manifest.version, "matterhorn.customer.beta.demo.evidence-pack.v1");
assert.equal(manifest.mode, "fixture_offline");
assert.equal(manifest.counts.scenarios, expectedScenarioIds.length);
assert.equal(manifest.counts.betaCustomers, 10);
assert.equal(manifest.counts.runbooks, expectedScenarioIds.length);
assert.deepEqual(
  manifest.scenarios.map((s) => s.id).sort(),
  expectedScenarioIds.slice().sort(),
);

for (const scenario of manifest.scenarios) {
  assert.ok(scenario.displayName, `${scenario.id} must have displayName`);
  assert.ok(Array.isArray(scenario.assignedBetaCustomers) && scenario.assignedBetaCustomers.length > 0,
    `${scenario.id} must have assignedBetaCustomers`);
  assert.ok(scenario.entryPrompt, `${scenario.id} must have entryPrompt`);
  assert.ok(Array.isArray(scenario.expectedArtifacts) && scenario.expectedArtifacts.length > 0,
    `${scenario.id} must have expectedArtifacts`);
  assert.ok(Array.isArray(scenario.readinessCommands) && scenario.readinessCommands.length > 0,
    `${scenario.id} must have readinessCommands`);
  assert.ok(scenario.safetyBoundaries, `${scenario.id} must have safetyBoundaries`);
  assert.ok(Array.isArray(scenario.forbiddenClaims) && scenario.forbiddenClaims.length > 0,
    `${scenario.id} must have forbiddenClaims`);
  assert.ok(Array.isArray(scenario.forbiddenInputs) && scenario.forbiddenInputs.length > 0,
    `${scenario.id} must have forbiddenInputs`);
  assert.ok(scenario.passFailCriteria, `${scenario.id} must have passFailCriteria`);
  assert.ok(Array.isArray(scenario.passFailCriteria.pass) && scenario.passFailCriteria.pass.length > 0,
    `${scenario.id} must have pass criteria`);
  assert.ok(Array.isArray(scenario.passFailCriteria.fail) && scenario.passFailCriteria.fail.length > 0,
    `${scenario.id} must have fail criteria`);
  assert.ok(scenario.evidenceOutputPath, `${scenario.id} must have evidenceOutputPath`);
  assert.ok(scenario.runbookFile, `${scenario.id} must have runbookFile`);
  assert.ok(scenario.mapsToWorkflowId, `${scenario.id} must map to a workflow`);
  assert.ok(scenario.mapsToCustomerTemplateId, `${scenario.id} must map to a customer template`);
}

// 4. Hash file matches manifest content.
const manifestJson = readFileSync(join(outputDir, "monday-beta-evidence-manifest.json"), "utf8");
const expectedHash = createHash("sha256").update(manifestJson).digest("hex");
const hashLine = readFileSync(join(outputDir, "monday-beta-evidence-manifest.json.sha256"), "utf8").trim();
assert.ok(hashLine.startsWith(expectedHash), "sha256 hash file must match manifest content");
assert.equal(summary.sha256, expectedHash, "summary sha256 must match manifest hash");

// 5. Runbook files contain expected sections and are safe.
function sectionBefore(text, marker) {
  const index = text.toLowerCase().indexOf(marker.toLowerCase());
  return index < 0 ? text : text.slice(0, index);
}

for (const scenario of manifest.scenarios) {
  const runbookPath = join(outputDir, scenario.runbookFile);
  const runbook = readFileSync(runbookPath, "utf8");
  assert.ok(runbook.startsWith(`# ${scenario.displayName}`), `${scenario.runbookFile} must start with scenario title`);
  assert.ok(runbook.toLowerCase().includes("## entry prompt"), `${scenario.runbookFile} must have entry prompt section`);
  assert.ok(runbook.toLowerCase().includes("## expected artifacts"), `${scenario.runbookFile} must have expected artifacts section`);
  assert.ok(runbook.toLowerCase().includes("## readiness commands"), `${scenario.runbookFile} must have readiness commands section`);
  assert.ok(runbook.toLowerCase().includes("## safety boundaries"), `${scenario.runbookFile} must have safety boundaries section`);
  assert.ok(runbook.toLowerCase().includes("## forbidden claims"), `${scenario.runbookFile} must have forbidden claims section`);
  assert.ok(runbook.toLowerCase().includes("## forbidden inputs"), `${scenario.runbookFile} must have forbidden inputs section`);
  assert.ok(runbook.toLowerCase().includes("## pass criteria"), `${scenario.runbookFile} must have pass criteria section`);
  assert.ok(runbook.toLowerCase().includes("## fail criteria"), `${scenario.runbookFile} must have fail criteria section`);
  assert.ok(runbook.toLowerCase().includes("## evidence output path"), `${scenario.runbookFile} must have evidence output path section`);

  // Forbidden claims and forbidden inputs intentionally name credentials so they
  // can state what must not be requested. Scan only the operator/customer-facing
  // sections before the forbidden-claims block.
  const scanText = sectionBefore(runbook, "## forbidden claims").toLowerCase();
  for (const forbidden of [
    "private key",
    "seed phrase",
    "mnemonic",
    "api secret",
    "raw signature",
    "signed payload",
    "signed order",
    "wallet export",
  ]) {
    assert.equal(
      scanText.includes(forbidden),
      false,
      `${scenario.runbookFile} customer-facing sections must not reference ${forbidden}`,
    );
  }
}

// 6. Scenario filtering works.
const filteredDir = tmpDir();
const filteredResult = run(["--scenario", "bittensor_tao_staking_preview", "--output-dir", filteredDir]);
assert.equal(filteredResult.status, 0, `filtered evidence pack should exit 0. stderr=${filteredResult.stderr}`);
const filteredSummary = JSON.parse(filteredResult.stdout);
assert.equal(filteredSummary.scenarioCount, 1);
assert.ok(readdirSync(filteredDir).includes("bittensor_tao_staking_preview-runbook.md"));

const unknownResult = run(["--scenario", "unknown_scenario", "--output-dir", tmpDir()]);
assert.notEqual(unknownResult.status, 0, "unknown scenario filter should fail");

// 7. Credential-shaped flags are rejected.
const reject = spawnSync(
  process.execPath,
  ["scripts/customer-demo-evidence-pack.mjs", "--output-dir", tmpDir(), "--private-key", "redacted"],
  { encoding: "utf8", maxBuffer: 1024 * 1024 },
);
assert.notEqual(reject.status, 0, "evidence pack should reject credential-shaped flags");
assert.match(reject.stderr, /Forbidden credential-shaped flag --private-key/);

// 8. Safety invariants are reflected in manifest.
const hyperliquid = manifest.scenarios.find((s) => s.id === "hyperliquid_order_preview");
assert.ok(hyperliquid);
assert.equal(hyperliquid.status, "preview_only");
assert.equal(hyperliquid.safetyBoundaries.canExecute, false);
assert.equal(hyperliquid.safetyBoundaries.canSubmit, false);

const polymarket = manifest.scenarios.find((s) => s.id === "polymarket_market_research");
assert.ok(polymarket);
assert.equal(polymarket.status, "preview_only");
assert.equal(polymarket.safetyBoundaries.canExecute, false);
assert.equal(polymarket.safetyBoundaries.canSubmit, false);

const services = manifest.scenarios.find((s) => s.id === "decentralized_services_future_plan");
assert.ok(services);
assert.equal(services.status, "planned_not_live");
assert.equal(services.safetyBoundaries.canExecute, false);

const bittensor = manifest.scenarios.find((s) => s.id === "bittensor_tao_staking_preview");
assert.ok(bittensor);
assert.equal(bittensor.status, "demo_ready");
assert.equal(bittensor.safetyBoundaries.requiresExternalSigner, true);
assert.equal(bittensor.safetyBoundaries.canSubmit, false);

// Cleanup.
rmSync(outputDir, { recursive: true, force: true });
rmSync(filteredDir, { recursive: true, force: true });

console.log("Monday beta customer demo evidence pack check passed.");
