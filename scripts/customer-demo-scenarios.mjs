#!/usr/bin/env node
/**
 * Monday Beta Customer Demo Scenario Registry
 *
 * Emits the typed CustomerBetaDemoScenario registry defined in
 * packages/types/src/matterhorn-workflows.ts as JSON for agents, CLI tools,
 * and demo runbooks.
 *
 * Usage:
 *   node scripts/customer-demo-scenarios.mjs --json
 *   node scripts/customer-demo-scenarios.mjs --scenario bittensor_tao_staking_preview --json
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

const args = process.argv.slice(2);
for (const item of args) {
  const key = item.split("=")[0] || item;
  if (FORBIDDEN_ARG_RE.test(key)) {
    process.stderr.write(
      `Forbidden credential-shaped flag ${key} is not accepted by the Monday beta demo scenario registry.\n`,
    );
    process.exit(1);
  }
}

let scenarioFilter = "";
for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--scenario" || args[i] === "-s") && args[i + 1]) {
    scenarioFilter = args[i + 1];
    break;
  }
  if (args[i].startsWith("--scenario=")) {
    scenarioFilter = args[i].slice("--scenario=".length);
    break;
  }
}

const outputJson = args.includes("--json");

const inline = `
import { MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS } from "${__dirname}/../packages/types/src/matterhorn-workflows.ts";
const values = Object.values(MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS);
const filtered = ${scenarioFilter ? `values.filter(s => s.id === "${scenarioFilter}")` : "values"};
if (${scenarioFilter ? "true" : "false"} && filtered.length === 0) {
  console.error("Unknown Monday beta demo scenario: ${scenarioFilter}");
  process.exit(1);
}
console.log(JSON.stringify(filtered, null, 2));
`;

const runner = spawnSync("bun", ["-e", inline], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
  stdio: "pipe",
});

if (runner.status !== 0) {
  process.stderr.write(runner.stderr);
  process.exit(runner.status ?? 1);
}

const scenarios = JSON.parse(runner.stdout);

if (outputJson) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    version: "matterhorn.customer.beta.demo.scenario.v1",
    generatedAt: new Date(0).toISOString(),
    summary: "Monday beta customer demo scenarios for Bittensor, Hyperliquid, Polymarket, Wellness, and decentralized services.",
    counts: {
      total: scenarios.length,
      betaCustomers: scenarios.reduce((sum, s) => sum + (s.assignedBetaCustomers?.length ?? 0), 0),
    },
    scenarios,
    references: [
      "packages/types/src/matterhorn-workflows.ts",
      "docs/customer-demo-scenarios.md",
      "docs/handoffs/kimi-monday-beta-customer-demo-scenarios.md",
    ],
  }, null, 2)}\n`);
} else {
  process.stdout.write("Monday Beta Customer Demo Scenarios\n\n");
  for (const scenario of scenarios) {
    process.stdout.write(`${scenario.displayName} (${scenario.id})\n`);
    process.stdout.write(`  Persona: ${scenario.targetCustomerPersona}\n`);
    process.stdout.write(`  Customers: ${scenario.assignedBetaCustomers.join(", ")}\n`);
    process.stdout.write(`  Entry prompt: ${scenario.entryPrompt}\n`);
    process.stdout.write(`  Status: ${scenario.status}\n`);
    process.stdout.write(`  Maps to workflow: ${scenario.mapsToWorkflowId}\n`);
    process.stdout.write(`  Maps to customer template: ${scenario.mapsToCustomerTemplateId}\n\n`);
  }
}
