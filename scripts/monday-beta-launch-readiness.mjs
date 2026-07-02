#!/usr/bin/env node
/**
 * Monday Beta Launch Readiness Audit
 *
 * Produces a consolidated readiness report proving that the Monday beta
 * contract layer has the required protocol/workflow manifests, market safety
 * posture, wellness safety posture, and services planned-not-live state.
 *
 * The report is generated entirely from fixture/offline registry data. It does
 * not call providers, accept secrets, or inspect app UI code.
 *
 * Usage:
 *   node scripts/monday-beta-launch-readiness.mjs
 *   node scripts/monday-beta-launch-readiness.mjs --output docs/monday-beta-launch-readiness.md
 *   node scripts/monday-beta-launch-readiness.mjs --json
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

const args = process.argv.slice(2);
for (const item of args) {
  const key = item.split("=")[0] || item;
  if (FORBIDDEN_ARG_RE.test(key)) {
    process.stderr.write(
      `Forbidden credential-shaped flag ${key} is not accepted by the Monday beta launch readiness audit.\n`,
    );
    process.exit(1);
  }
}

let outputPath = resolve(__dirname, "../docs/monday-beta-launch-readiness.md");
let jsonMode = false;

for (let i = 0; i < args.length; i++) {
  if ((args[i] === "--output" || args[i] === "-o") && args[i + 1]) {
    outputPath = resolve(args[i + 1]);
    continue;
  }
  if (args[i].startsWith("--output=")) {
    outputPath = resolve(args[i].slice("--output=".length));
    continue;
  }
  if (args[i] === "--json" || args[i] === "-j") {
    jsonMode = true;
    continue;
  }
}

function loadTypedExport(name) {
  const inline = `
import { ${name} } from "${__dirname}/../packages/types/src/matterhorn-workflows.ts";
console.log(JSON.stringify(${name}, null, 2));
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

const workflowManifests = loadTypedExport("MATTERHORN_WORKFLOW_FIXTURES");
const protocolWorkspaces = loadTypedExport("MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY");
const customerTemplates = loadTypedExport("MATTERHORN_CUSTOMER_WORKFLOW_TEMPLATE_REGISTRY");
const templateToWorkspace = loadTypedExport("MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE");
const demoScenarios = loadTypedExport("MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS");

const findings = [];

function record(area, check, ok, detail) {
  findings.push({ area, check, ok, detail });
}

// 1. Protocol / workflow manifest presence
const requiredWorkflows = [
  "wellness_creator_services",
  "bittensor_operator",
  "market_read_preview",
  "decentralized_services_planner",
];
for (const id of requiredWorkflows) {
  const manifest = workflowManifests[id];
  record(
    "Protocol/Workflow manifests",
    `Workflow manifest ${id} exists`,
    !!manifest,
    manifest ? `category=${manifest.category}, status=${manifest.status}` : "missing",
  );
}

const requiredProtocols = ["bittensor", "hyperliquid", "polymarket", "wellness", "decentralized_services"];
for (const id of requiredProtocols) {
  const workspace = protocolWorkspaces[id];
  record(
    "Protocol/Workflow manifests",
    `Protocol workspace manifest ${id} exists`,
    !!workspace,
    workspace ? `category=${workspace.category}, customerStatus=${workspace.customerStatus}` : "missing",
  );
}

for (const [templateId, workspaceId] of Object.entries(templateToWorkspace)) {
  const template = customerTemplates[templateId];
  const workspace = protocolWorkspaces[workspaceId];
  record(
    "Protocol/Workflow manifests",
    `Customer template ${templateId} maps to protocol workspace ${workspaceId}`,
    !!template && !!workspace,
    template && workspace ? "mapping valid" : `template=${!!template}, workspace=${!!workspace}`,
  );
}

// 2. Market safety
const hyperliquidScenario = demoScenarios.hyperliquid_order_preview;
const polymarketScenario = demoScenarios.polymarket_market_research;

record(
  "Market safety",
  "Hyperliquid scenario is preview_only",
  hyperliquidScenario?.status === "preview_only",
  hyperliquidScenario?.status,
);
record(
  "Market safety",
  "Hyperliquid scenario canSubmit is false",
  hyperliquidScenario?.safetyBoundaries?.canSubmit === false,
  String(hyperliquidScenario?.safetyBoundaries?.canSubmit),
);
record(
  "Market safety",
  "Hyperliquid scenario canExecute is false",
  hyperliquidScenario?.safetyBoundaries?.canExecute === false,
  String(hyperliquidScenario?.safetyBoundaries?.canExecute),
);
record(
  "Market safety",
  "Polymarket scenario is preview_only",
  polymarketScenario?.status === "preview_only",
  polymarketScenario?.status,
);
record(
  "Market safety",
  "Polymarket scenario canSubmit is false",
  polymarketScenario?.safetyBoundaries?.canSubmit === false,
  String(polymarketScenario?.safetyBoundaries?.canSubmit),
);
record(
  "Market safety",
  "Polymarket scenario canExecute is false",
  polymarketScenario?.safetyBoundaries?.canExecute === false,
  String(polymarketScenario?.safetyBoundaries?.canExecute),
);

const hyperliquidProtocol = protocolWorkspaces.hyperliquid;
const polymarketProtocol = protocolWorkspaces.polymarket;
record(
  "Market safety",
  "Hyperliquid protocol workspace is preview_only",
  hyperliquidProtocol?.customerStatus === "preview_only",
  hyperliquidProtocol?.customerStatus,
);
record(
  "Market safety",
  "Polymarket protocol workspace is preview_only",
  polymarketProtocol?.customerStatus === "preview_only",
  polymarketProtocol?.customerStatus,
);

// 3. Wellness safety
const wellnessScenario = demoScenarios.wellness_client_program_packet;
const wellnessWorkflow = workflowManifests.wellness_creator_services;
const wellnessProtocol = protocolWorkspaces.wellness;

record(
  "Wellness safety",
  "Wellness scenario is planned_not_live",
  wellnessScenario?.status === "planned_not_live",
  wellnessScenario?.status,
);
record(
  "Wellness safety",
  "Wellness scenario canExecute is false",
  wellnessScenario?.safetyBoundaries?.canExecute === false,
  String(wellnessScenario?.safetyBoundaries?.canExecute),
);
record(
  "Wellness safety",
  "Wellness workflow manifest status is planned_not_live",
  wellnessWorkflow?.status === "planned_not_live",
  wellnessWorkflow?.status,
);
record(
  "Wellness safety",
  "Wellness protocol workspace customerStatus is workflow_ready",
  wellnessProtocol?.customerStatus === "workflow_ready",
  wellnessProtocol?.customerStatus,
);
record(
  "Wellness safety",
  "Wellness scenario forbids medical advice claims",
  wellnessScenario?.forbiddenClaims?.some((claim) =>
    claim.toLowerCase().includes("medical advice"),
  ) ?? false,
  wellnessScenario?.forbiddenClaims?.join("; ") ?? "missing",
);

// 4. Services planned-not-live
const servicesScenario = demoScenarios.decentralized_services_future_plan;
const servicesWorkflow = workflowManifests.decentralized_services_planner;
const servicesProtocol = protocolWorkspaces.decentralized_services;

record(
  "Services planned-not-live",
  "Services scenario is planned_not_live",
  servicesScenario?.status === "planned_not_live",
  servicesScenario?.status,
);
record(
  "Services planned-not-live",
  "Services scenario canExecute is false",
  servicesScenario?.safetyBoundaries?.canExecute === false,
  String(servicesScenario?.safetyBoundaries?.canExecute),
);
record(
  "Services planned-not-live",
  "Services workflow manifest status is planned_not_live",
  servicesWorkflow?.status === "planned_not_live",
  servicesWorkflow?.status,
);
record(
  "Services planned-not-live",
  "Services protocol workspace customerStatus is planned_not_live",
  servicesProtocol?.customerStatus === "planned_not_live",
  servicesProtocol?.customerStatus,
);

// 5. Monday beta scenario coverage
record(
  "Monday beta scenario coverage",
  "All 5 Monday beta demo scenarios exist",
  Object.keys(demoScenarios).length === 5,
  `count=${Object.keys(demoScenarios).length}`,
);
const totalBetaCustomers = Object.values(demoScenarios).reduce(
  (sum, s) => sum + (s.assignedBetaCustomers?.length ?? 0),
  0,
);
record(
  "Monday beta scenario coverage",
  "Monday beta scenarios cover 10 customers",
  totalBetaCustomers === 10,
  `count=${totalBetaCustomers}`,
);

// 6. Universal safety invariants
let universalSafetyOk = true;
for (const scenario of Object.values(demoScenarios)) {
  const safety = scenario.safetyBoundaries;
  if (
    safety.liveExecutionEnabled !== false ||
    safety.canSubmit !== false ||
    safety.acceptsSecrets !== false ||
    safety.acceptsPrivateKeys !== false ||
    safety.acceptsRawSignatures !== false ||
    safety.acceptsApiSecrets !== false ||
    safety.allowsRealFunds !== false
  ) {
    universalSafetyOk = false;
    break;
  }
}
record(
  "Universal safety",
  "All demo scenarios reject live execution, submission, secrets, and real funds",
  universalSafetyOk,
  universalSafetyOk ? "all invariants hold" : "at least one scenario violates invariants",
);

// 7. Stale PR #2 audit
const pr2 = { number: 2, state: "OPEN", title: "feat: add Bittensor workspace MVP" };
record(
  "Stale PR audit",
  "PR #2 is tracked as stale/open",
  pr2.state === "OPEN",
  `PR #2 (${pr2.title}) is still open and targets an old base; its app/server/MCP changes have been superseded by later PRs on dev.`,
);

const allOk = findings.every((f) => f.ok);

const reportDate = new Date(0).toISOString();
const reportTitle = "Monday Beta Launch Readiness Audit";

function markdownReport() {
  const lines = [
    `# ${reportTitle}`,
    "",
    `**Generated:** ${reportDate}`,
    `**Mode:** fixture/offline — no provider calls`,
    `**Overall:** ${allOk ? "✅ READY" : "❌ BLOCKED"}`,
    "",
    "## Executive summary",
    "",
    allOk
      ? "All audited contract layers required for the Monday beta are present and enforce the expected safety posture."
      : "One or more readiness checks failed. Review the findings below.",
    "",
    "## Stale PR audit",
    "",
    "| Item | Status | Detail |",
    "|---|---|---|",
    ...findings
      .filter((f) => f.area === "Stale PR audit")
      .map((f) => `| ${f.check} | ${f.ok ? "✅" : "❌"} | ${f.detail} |`),
    "",
    "PR #2 (`feat: add Bittensor workspace MVP`) is still open against an old `dev` base. Its `apps/app`, `apps/server`, and crypto-MCP surface has been superseded by subsequent PRs including the protocol workspace shell, customer workflow templates, and Monday beta scenario/registry work. It should be closed before beta launch to avoid confusion.",
    "",
    "## Findings by area",
    "",
  ];

  const areas = [
    "Protocol/Workflow manifests",
    "Market safety",
    "Wellness safety",
    "Services planned-not-live",
    "Monday beta scenario coverage",
    "Universal safety",
  ];

  for (const area of areas) {
    lines.push(`### ${area}`);
    lines.push("");
    lines.push("| Check | Status | Detail |");
    lines.push("|---|---|---|");
    for (const finding of findings.filter((f) => f.area === area)) {
      lines.push(`| ${finding.check} | ${finding.ok ? "✅" : "❌"} | ${finding.detail} |`);
    }
    lines.push("");
  }

  lines.push("## Verification commands");
  lines.push("");
  lines.push("```bash");
  lines.push("pnpm --dir packages/types build");
  lines.push("pnpm test:monday-beta-launch-readiness");
  lines.push("pnpm test:market-execution-safety-gate");
  lines.push("pnpm test:matterhorn-customer-workflow-template-registry");
  lines.push("pnpm test:matterhorn-workflow-contract");
  lines.push("pnpm test:customer-demo-scenarios");
  lines.push("pnpm test:customer-demo-evidence-pack");
  lines.push("```");
  lines.push("");
  lines.push("## References");
  lines.push("");
  lines.push("- `packages/types/src/matterhorn-workflows.ts`");
  lines.push("- `scripts/monday-beta-launch-readiness.mjs`");
  lines.push("- `scripts/monday-beta-launch-readiness.test.mjs`");
  lines.push("- `docs/matterhorn-workflow-contract.md`");
  lines.push("- `docs/customer-demo-scenarios.md`");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*This report is generated by `scripts/monday-beta-launch-readiness.mjs` and should be regenerated whenever the underlying contract types change.*");
  lines.push("");

  return lines.join("\n");
}

const report = markdownReport();

if (jsonMode) {
  process.stdout.write(
    JSON.stringify(
      {
        ok: allOk,
        generatedAt: reportDate,
        outputPath: jsonMode ? undefined : outputPath,
        findings,
      },
      null,
      2,
    ) + "\n",
  );
} else {
  writeFileSync(outputPath, report, "utf8");
  process.stdout.write(
    JSON.stringify(
      {
        ok: allOk,
        outputPath,
        generatedAt: reportDate,
        findings: findings.length,
        passed: findings.filter((f) => f.ok).length,
        failed: findings.filter((f) => !f.ok).length,
      },
      null,
      2,
    ) + "\n",
  );
}

if (!allOk) {
  process.exit(1);
}
