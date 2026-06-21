#!/usr/bin/env node
/**
 * Monday Beta Customer Demo Evidence Pack
 *
 * Reads the typed MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS registry and writes:
 *   - one markdown runbook per scenario
 *   - one consolidated JSON manifest
 *   - one SHA256 hash file for the manifest
 *
 * This helper is fixture/offline only. It never calls a provider, never accepts
 * secrets, and never produces signing material.
 *
 * Usage:
 *   node scripts/customer-demo-evidence-pack.mjs --output-dir ./tmp/monday-beta-evidence
 *   node scripts/customer-demo-evidence-pack.mjs --scenario bittensor_tao_staking_preview --output-dir ./tmp/evidence
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

const args = process.argv.slice(2);
for (const item of args) {
  const key = item.split("=")[0] || item;
  if (FORBIDDEN_ARG_RE.test(key)) {
    process.stderr.write(
      `Forbidden credential-shaped flag ${key} is not accepted by the Monday beta customer demo evidence pack.\n`,
    );
    process.exit(1);
  }
}

let scenarioFilter = "";
let outputDir = "./tmp/monday-beta-evidence";

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--scenario" || args[i] === "-s") && args[i + 1]) {
    scenarioFilter = args[i + 1];
    continue;
  }
  if (args[i].startsWith("--scenario=")) {
    scenarioFilter = args[i].slice("--scenario=".length);
    continue;
  }
  if ((args[i] === "--output-dir" || args[i] === "-o") && args[i + 1]) {
    outputDir = args[i + 1];
    continue;
  }
  if (args[i].startsWith("--output-dir=")) {
    outputDir = args[i].slice("--output-dir=".length);
    continue;
  }
}

function loadScenarios() {
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

  return JSON.parse(runner.stdout);
}

function sanitizeFilename(id) {
  return id.replace(/[^a-z0-9_-]/gi, "_");
}

function buildRunbook(scenario) {
  const lines = [
    `# ${scenario.displayName}`,
    "",
    `**Scenario ID:** \`${scenario.id}\``,
    "",
    `**Status:** ${scenario.status}`,
    "",
    `**Target persona:** ${scenario.targetCustomerPersona}`,
    "",
    `**Monday beta customers:** ${scenario.assignedBetaCustomers.join(", ")}`,
    "",
    "## Entry prompt",
    "",
    "> " + scenario.entryPrompt,
    "",
    "## Expected artifacts",
    "",
    ...scenario.expectedArtifacts.map((artifact) => `- **${artifact.name}** (\`${artifact.id}\`, ${artifact.mimeType}) — ${artifact.description ?? "No description"}`),
    "",
    "## Readiness commands",
    "",
    ...scenario.readinessCommands.map((command) => `- \`\`\`\n  ${command}\n  \`\`\``),
    "",
    "## Safety boundaries",
    "",
    "| Boundary | Value |",
    "|---|---|",
    `| liveExecutionEnabled | ${scenario.safetyBoundaries.liveExecutionEnabled} |`,
    `| canExecute | ${scenario.safetyBoundaries.canExecute} |`,
    `| canSubmit | ${scenario.safetyBoundaries.canSubmit} |`,
    `| acceptsSecrets | ${scenario.safetyBoundaries.acceptsSecrets} |`,
    `| acceptsPrivateKeys | ${scenario.safetyBoundaries.acceptsPrivateKeys} |`,
    `| acceptsRawSignatures | ${scenario.safetyBoundaries.acceptsRawSignatures} |`,
    `| acceptsApiSecrets | ${scenario.safetyBoundaries.acceptsApiSecrets} |`,
    `| requiresExternalSigner | ${scenario.safetyBoundaries.requiresExternalSigner} |`,
    `| allowsRealFunds | ${scenario.safetyBoundaries.allowsRealFunds} |`,
    "",
    "## Forbidden claims",
    "",
    ...scenario.forbiddenClaims.map((claim) => `- ${claim}`),
    "",
    "## Forbidden inputs",
    "",
    ...scenario.forbiddenInputs.map((input) => `- ${input}`),
    "",
    "## Pass criteria",
    "",
    ...scenario.passFailCriteria.pass.map((criterion) => `- ${criterion}`),
    "",
    "## Fail criteria",
    "",
    ...scenario.passFailCriteria.fail.map((criterion) => `- ${criterion}`),
    "",
    "## Evidence output path",
    "",
    `\`${scenario.evidenceOutputPath}\``,
    "",
    "## Mapping",
    "",
    `- **Workflow manifest:** \`${scenario.mapsToWorkflowId}\``,
    `- **Customer template:** \`${scenario.mapsToCustomerTemplateId}\``,
    "",
    "---",
    "",
    "*Generated by Matterhorn Monday Beta Customer Demo Evidence Pack. Fixture/offline mode only; no provider calls.*",
    "",
  ];
  return lines.join("\n");
}

function buildManifest(scenarios) {
  return {
    ok: true,
    version: "matterhorn.customer.beta.demo.evidence-pack.v1",
    generatedAt: new Date(0).toISOString(),
    mode: "fixture_offline",
    summary: "Monday beta customer demo evidence pack for Bittensor, Hyperliquid, Polymarket, Wellness, and decentralized services.",
    counts: {
      scenarios: scenarios.length,
      betaCustomers: scenarios.reduce((sum, s) => sum + (s.assignedBetaCustomers?.length ?? 0), 0),
      runbooks: scenarios.length,
    },
    outputDir,
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      displayName: scenario.displayName,
      status: scenario.status,
      targetCustomerPersona: scenario.targetCustomerPersona,
      assignedBetaCustomers: scenario.assignedBetaCustomers,
      entryPrompt: scenario.entryPrompt,
      expectedArtifacts: scenario.expectedArtifacts,
      readinessCommands: scenario.readinessCommands,
      safetyBoundaries: scenario.safetyBoundaries,
      forbiddenClaims: scenario.forbiddenClaims,
      forbiddenInputs: scenario.forbiddenInputs,
      passFailCriteria: scenario.passFailCriteria,
      evidenceOutputPath: scenario.evidenceOutputPath,
      mapsToWorkflowId: scenario.mapsToWorkflowId,
      mapsToCustomerTemplateId: scenario.mapsToCustomerTemplateId,
      runbookFile: `${sanitizeFilename(scenario.id)}-runbook.md`,
    })),
    references: [
      "packages/types/src/matterhorn-workflows.ts",
      "scripts/customer-demo-scenarios.mjs",
      "scripts/customer-demo-evidence-pack.mjs",
      "docs/customer-demo-scenarios.md",
    ],
  };
}

function assertNoCredentialMaterial(scenarios) {
  const forbidden = [
    "private key",
    "seed phrase",
    "mnemonic",
    "api secret",
    "raw signature",
    "signed payload",
    "signed order",
    "wallet export",
  ];

  for (const scenario of scenarios) {
    // Scan only the actual prompts/commands/artifact descriptions that the
    // customer or operator would see. Forbidden-input lists are intentionally
    // allowed to name the credential so they can state what must not be requested.
    const scan = [
      scenario.entryPrompt,
      ...scenario.readinessCommands,
      ...scenario.expectedArtifacts.map((a) => `${a.id} ${a.name} ${a.description ?? ""}`),
    ]
      .join(" ")
      .toLowerCase();

    for (const term of forbidden) {
      if (scan.includes(term)) {
        throw new Error(
          `Credential-shaped material "${term}" found in scenario ${scenario.id}. The evidence pack must not emit credential requests.`,
        );
      }
    }
  }
}

function assertSafetyInvariants(scenarios) {
  for (const scenario of scenarios) {
    const safety = scenario.safetyBoundaries;
    if (safety.liveExecutionEnabled !== false) {
      throw new Error(`${scenario.id} must set liveExecutionEnabled: false`);
    }
    if (safety.canSubmit !== false) {
      throw new Error(`${scenario.id} must set canSubmit: false`);
    }
    if (safety.acceptsSecrets !== false || safety.acceptsPrivateKeys !== false || safety.acceptsRawSignatures !== false || safety.acceptsApiSecrets !== false) {
      throw new Error(`${scenario.id} must not accept secrets or signing material`);
    }
    if (safety.allowsRealFunds !== false) {
      throw new Error(`${scenario.id} must not allow real funds`);
    }

    if (["hyperliquid_order_preview", "polymarket_market_research"].includes(scenario.id)) {
      if (scenario.status !== "preview_only" || safety.canExecute !== false) {
        throw new Error(`${scenario.id} must be preview_only with canExecute: false`);
      }
    }

    if (scenario.id === "decentralized_services_future_plan") {
      if (scenario.status !== "planned_not_live" || safety.canExecute !== false) {
        throw new Error(`${scenario.id} must be planned_not_live with canExecute: false`);
      }
    }

    if (scenario.id === "bittensor_tao_staking_preview") {
      if (scenario.status !== "demo_ready" || safety.requiresExternalSigner !== true) {
        throw new Error(`${scenario.id} must be demo_ready with requiresExternalSigner: true`);
      }
    }
  }
}

const scenarios = loadScenarios();
assertNoCredentialMaterial(scenarios);
assertSafetyInvariants(scenarios);

mkdirSync(outputDir, { recursive: true });

for (const scenario of scenarios) {
  const runbook = buildRunbook(scenario);
  const runbookPath = join(outputDir, `${sanitizeFilename(scenario.id)}-runbook.md`);
  writeFileSync(runbookPath, runbook, "utf8");
}

const manifest = buildManifest(scenarios);
const manifestJson = JSON.stringify(manifest, null, 2);
const manifestPath = join(outputDir, "monday-beta-evidence-manifest.json");
const manifestFileContent = `${manifestJson}\n`;
writeFileSync(manifestPath, manifestFileContent, "utf8");

const hash = createHash("sha256").update(manifestFileContent).digest("hex");
const hashPath = join(outputDir, "monday-beta-evidence-manifest.json.sha256");
writeFileSync(hashPath, `${hash}  monday-beta-evidence-manifest.json\n`, "utf8");

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      outputDir,
      scenarioCount: scenarios.length,
      betaCustomerCount: manifest.counts.betaCustomers,
      manifest: manifestPath,
      hash: hashPath,
      sha256: hash,
    },
    null,
    2,
  ) + "\n",
);
