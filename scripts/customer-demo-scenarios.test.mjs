#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const types = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");

const expectedIds = [
  "bittensor_tao_staking_preview",
  "hyperliquid_order_preview",
  "polymarket_market_research",
  "wellness_client_program_packet",
  "decentralized_services_future_plan",
];

const expectedBetaCustomers = [
  "Alpha Node DAO",
  "TensorVault Labs",
  "Arbor Trading",
  "PerpPrime Capital",
  "Forecast Collective",
  "EdgeBet Research",
  "Summit Wellness Co",
  "FitPath Studio",
  "OpenResearch DAO",
  "StackSafe Labs",
];

const workflowManifestIds = [
  "wellness_creator_services",
  "bittensor_operator",
  "market_read_preview",
  "decentralized_services_planner",
];

const customerTemplateIds = [
  "bittensor_operator",
  "hyperliquid_trader",
  "polymarket_researcher",
  "wellness_creator_workflow",
  "decentralized_services_operator",
];

// 1. Package exposes the Monday beta demo scenario gate.
assert.equal(
  pkg.scripts["test:customer-demo-scenarios"],
  "node scripts/customer-demo-scenarios.test.mjs",
  "package.json should expose test:customer-demo-scenarios",
);

// 2. Required scenario types and constants exist.
for (const token of [
  "CustomerBetaDemoScenario",
  "CustomerBetaDemoPassFailCriteria",
  "MondayBetaCustomerDemoStatus",
  "MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS",
  "MONDAY_BETA_CUSTOMER_DEMO_STATUSES",
]) {
  assert.ok(types.includes(token), `types missing customer demo scenario token: ${token}`);
}

// 3. Scenario registry covers every expected scenario id.
const registryBlock = types.slice(types.indexOf("MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS"));
for (const id of expectedIds) {
  assert.ok(registryBlock.includes(id), `customer demo scenario registry missing: ${id}`);
}

// 4. Registry script emits a valid scenario envelope.
const run = (extraArgs = []) =>
  spawnSync(process.execPath, ["scripts/customer-demo-scenarios.mjs", ...extraArgs, "--json"], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });

const result = run();
assert.equal(result.status, 0, `customer demo scenarios should exit 0. stderr=${result.stderr}`);
const catalog = JSON.parse(result.stdout);
assert.equal(catalog.ok, true);
assert.equal(catalog.version, "matterhorn.customer.beta.demo.scenario.v1");
assert.equal(catalog.scenarios.length, expectedIds.length);
assert.equal(catalog.counts.total, expectedIds.length);
assert.equal(catalog.counts.betaCustomers, expectedBetaCustomers.length);

const ids = catalog.scenarios.map((scenario) => scenario.id);
assert.deepEqual(ids, expectedIds);

// 5. Every scenario satisfies the Monday beta demo contract.
for (const scenario of catalog.scenarios) {
  assert.ok(scenario.id, "scenario must have an id");
  assert.ok(scenario.displayName, `${scenario.id} must have a displayName`);
  assert.ok(scenario.targetCustomerPersona, `${scenario.id} must have a targetCustomerPersona`);
  assert.ok(Array.isArray(scenario.assignedBetaCustomers) && scenario.assignedBetaCustomers.length > 0,
    `${scenario.id} must assign at least one beta customer`);
  assert.ok(scenario.entryPrompt, `${scenario.id} must have an entryPrompt`);
  assert.ok(Array.isArray(scenario.expectedArtifacts) && scenario.expectedArtifacts.length > 0,
    `${scenario.id} must declare expected artifacts`);
  assert.ok(Array.isArray(scenario.readinessCommands) && scenario.readinessCommands.length > 0,
    `${scenario.id} must declare readiness commands`);
  assert.ok(scenario.safetyBoundaries, `${scenario.id} must declare safetyBoundaries`);
  assert.ok(Array.isArray(scenario.forbiddenClaims) && scenario.forbiddenClaims.length > 0,
    `${scenario.id} must declare forbidden claims`);
  assert.ok(Array.isArray(scenario.forbiddenInputs) && scenario.forbiddenInputs.length > 0,
    `${scenario.id} must declare forbidden inputs`);
  assert.ok(scenario.passFailCriteria, `${scenario.id} must declare passFailCriteria`);
  assert.ok(Array.isArray(scenario.passFailCriteria.pass) && scenario.passFailCriteria.pass.length > 0,
    `${scenario.id} must declare pass criteria`);
  assert.ok(Array.isArray(scenario.passFailCriteria.fail) && scenario.passFailCriteria.fail.length > 0,
    `${scenario.id} must declare fail criteria`);
  assert.ok(scenario.evidenceOutputPath, `${scenario.id} must declare evidenceOutputPath`);
  assert.ok(scenario.evidenceOutputPath.includes("{customer}"), `${scenario.id} evidenceOutputPath must include a {customer} placeholder`);
  assert.ok(["demo_ready", "preview_only", "planned_not_live"].includes(scenario.status),
    `${scenario.id} status must be a known demo status`);
  assert.ok(workflowManifestIds.includes(scenario.mapsToWorkflowId),
    `${scenario.id} must map to a known workflow manifest`);
  assert.ok(customerTemplateIds.includes(scenario.mapsToCustomerTemplateId),
    `${scenario.id} must map to a known customer workflow template`);

  // Safety boundaries: universal invariants for the Monday beta.
  const safety = scenario.safetyBoundaries;
  assert.equal(safety.liveExecutionEnabled, false, `${scenario.id} must not enable live execution`);
  assert.equal(safety.canSubmit, false, `${scenario.id} must not submit`);
  assert.equal(safety.acceptsSecrets, false, `${scenario.id} must not accept secrets`);
  assert.equal(safety.acceptsPrivateKeys, false, `${scenario.id} must not accept private keys`);
  assert.equal(safety.acceptsApiSecrets, false, `${scenario.id} must not accept API secrets`);
  assert.equal(safety.acceptsRawSignatures, false, `${scenario.id} must not accept raw signatures`);
  assert.equal(safety.allowsRealFunds, false, `${scenario.id} must not allow real funds`);

  // Entry prompt must be safe: one prompt and no credential requests.
  const entryText = scenario.entryPrompt.toLowerCase();
  assert.ok(scenario.entryPrompt.trim().length > 0, `${scenario.id} entry prompt must be non-empty`);
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
      entryText.includes(forbidden),
      false,
      `${scenario.id} entry prompt must not ask for ${forbidden}`,
    );
  }

  // Readiness commands must also avoid credential language. Forbidden claims
  // are intentionally allowed to name the credential so they can state what
  // Matterhorn must never request or hold.
  const commandText = scenario.readinessCommands.join(" ").toLowerCase();
  const scanText = `${entryText} ${commandText}`;
  for (const forbidden of [
    "private key",
    "seed phrase",
    "mnemonic",
    "api secret",
    "raw signature",
    "signed payload",
    "wallet export",
  ]) {
    assert.equal(
      scanText.includes(forbidden),
      false,
      `${scenario.id} entry prompt and readiness commands must not reference ${forbidden}`,
    );
  }
}

// 6. Hyperliquid and Polymarket scenarios stay preview-only and non-executing.
for (const id of ["hyperliquid_order_preview", "polymarket_market_research"]) {
  const scenario = catalog.scenarios.find((s) => s.id === id);
  assert.ok(scenario, `${id} scenario must exist`);
  assert.equal(scenario.status, "preview_only", `${id} must be preview_only`);
  assert.equal(scenario.safetyBoundaries.canExecute, false, `${id} must not execute`);
  assert.equal(scenario.safetyBoundaries.requiresExternalSigner, false, `${id} must not require external signer`);
  assert.equal(scenario.mapsToWorkflowId, "market_read_preview", `${id} must map to market_read_preview`);
}

// 7. Services scenario stays planned-not-live.
const services = catalog.scenarios.find((s) => s.id === "decentralized_services_future_plan");
assert.ok(services, "decentralized_services_future_plan scenario must exist");
assert.equal(services.status, "planned_not_live", "services scenario must be planned_not_live");
assert.equal(services.safetyBoundaries.canExecute, false, "services scenario must not execute");
assert.equal(services.safetyBoundaries.requiresExternalSigner, false, "services scenario must not require external signer");

// 8. Bittensor scenario is demo-ready and uses external signer handoffs.
const bittensor = catalog.scenarios.find((s) => s.id === "bittensor_tao_staking_preview");
assert.ok(bittensor, "bittensor_tao_staking_preview scenario must exist");
assert.equal(bittensor.status, "demo_ready", "bittensor scenario must be demo_ready");
assert.equal(bittensor.safetyBoundaries.canExecute, true, "bittensor scenario may prepare handoffs");
assert.equal(bittensor.safetyBoundaries.requiresExternalSigner, true, "bittensor scenario requires external signer");
assert.equal(bittensor.mapsToWorkflowId, "bittensor_operator", "bittensor scenario must map to bittensor_operator workflow");

// 9. Scenario filtering works.
const singleResult = run(["--scenario", "bittensor_tao_staking_preview"]);
assert.equal(singleResult.status, 0, `single scenario filter should exit 0. stderr=${singleResult.stderr}`);
const singleCatalog = JSON.parse(singleResult.stdout);
assert.deepEqual(singleCatalog.scenarios.map((s) => s.id), ["bittensor_tao_staking_preview"]);

const unknownResult = run(["--scenario", "unknown_scenario"]);
assert.notEqual(unknownResult.status, 0, "unknown scenario filter should fail");

// 10. Credential-shaped flags are rejected.
const reject = spawnSync(
  process.execPath,
  ["scripts/customer-demo-scenarios.mjs", "--json", "--private-key", "redacted"],
  { encoding: "utf8", maxBuffer: 1024 * 1024 },
);
assert.notEqual(reject.status, 0, "customer demo scenario registry should reject credential-shaped flags");
assert.match(reject.stderr, /Forbidden credential-shaped flag --private-key/);

console.log("Monday beta customer demo scenario check passed.");
