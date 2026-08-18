#!/usr/bin/env node
import { spawn } from "node:child_process";

const STAGES = [
  {
    id: "wallet.approval.behavior",
    label: "Wallet approval behavior",
    summary: "Approval requests, chain gates, normalized values, address book, and wallet security logs.",
    themes: [
      "T1 approval surface as control",
      "T3 behavioral wallet QA",
      "Safety ledger visibility",
    ],
    command: [
      "bun",
      "test",
      "apps/app/tests/wallet-approval-security-contract.test.ts",
      "apps/app/tests/wallet-send-behavior.test.ts",
      "apps/app/tests/wallet-approval-render-behavior.test.tsx",
      "apps/app/tests/wallet-runtime-connectors-contract.test.ts",
      "apps/app/tests/wallet-security-log-reporter.test.ts",
      "apps/app/tests/wallet-address-book-contract.test.ts",
    ],
  },
  {
    id: "money.path.security",
    label: "Money-path backend security",
    summary: "Transaction simulation sanitization, Notes and Memory write guards, scopes, and backend security regressions.",
    themes: [
      "T1 transaction simulation and policy enforcement",
      "T3 adversarial backend tests",
      "Security data hygiene",
    ],
    command: [
      "bun",
      "test",
      "apps/server/src/transaction-simulation-safety.test.ts",
      "apps/server/src/wallet-safety-policy-routes.e2e.test.ts",
      "apps/server/src/backend-security.e2e.test.ts",
      "apps/server/src/notes-routes.e2e.test.ts",
    ],
  },
  {
    id: "desk.depth",
    label: "Desk depth",
    summary: "Bittensor, Hyperliquid, Polymarket, Sui, Longevity, and desk-agent task-launch contracts.",
    themes: [
      "T7 depth-first desk lanes",
      "Desk launch consistency",
      "No raw prompt surface",
    ],
    command: [
      "node",
      "scripts/matterhorn-desk-agent-contract.test.mjs",
      "&&",
      "node",
      "scripts/matterhorn-crypto-mcp-polymarket.test.mjs",
      "&&",
      "node",
      "scripts/customer-ready-crypto-smoke.test.mjs",
      "&&",
      "node",
      "packages/matterhorn-work-crypto-mcp/test-bittensor.mjs",
      "&&",
      "bun",
      "test",
      "apps/app/tests/workflow-stage-card.test.ts",
      "apps/app/tests/customer-workflow-templates.test.ts",
      "&&",
      "bun",
      "test",
      "apps/server/src/project-evidence-routes.e2e.test.ts",
      "&&",
      "node",
      "scripts/wellness-creator-workflow.test.mjs",
    ],
    shell: true,
  },
  {
    id: "billing.integrity",
    label: "Billing integrity",
    summary: "Checkout, portal, webhook signatures, replay safety, payment status, and subscription lifecycle.",
    themes: [
      "T4 billing and entitlement integrity",
      "Payment replay and lifecycle safety",
      "Live-payments gate",
    ],
    command: ["bun", "test", "apps/server/src/billing-routes.e2e.test.ts"],
  },
  {
    id: "local.router.perimeter",
    label: "Local router perimeter",
    summary: "Loopback CORS, write-token checks, health route behavior, and workspace file-part limits.",
    themes: [
      "T5 local control perimeter",
      "Loopback-only CORS",
      "Workspace file access bounds",
    ],
    command: [
      "pnpm",
      "--filter",
      "opencode-router",
      "build",
      "&&",
      "bun",
      "test",
      "apps/opencode-router/test/health-send.test.js",
    ],
    shell: true,
  },
  {
    id: "daemon.electron.perimeter",
    label: "Agent runtime and Electron perimeter",
    summary: "OpenWork/OpenCode compatibility, daemon token/CORS guards, trusted IPC, desktop fetch restrictions, packaging, and remote debugging gates.",
    themes: [
      "T5 desktop daemon perimeter",
      "Trusted Electron IPC",
      "Packaged-build hardening",
    ],
    command: [
      "node",
      "scripts/orchestrator-daemon-security.test.mjs",
      "&&",
      "node",
      "scripts/orchestrator-workspace-redaction-contract.test.mjs",
      "&&",
      "node",
      "scripts/electron-packaging-sources.test.mjs",
      "&&",
      "node",
      "scripts/electron-updater-first-run.test.mjs",
      "&&",
      "node",
      "scripts/alpha-macos-tester-artifact.test.mjs",
      "&&",
      "node",
      "scripts/release-workflow-safety.test.mjs",
      "&&",
      "node",
      "scripts/opencode-runtime-compatibility.test.mjs",
      "&&",
      "bun",
      "test",
      "apps/app/tests/deep-link-runtime-contract.test.ts",
      "&&",
      "bun",
      "test",
      "apps/server/src/managed-opencode.test.ts",
    ],
    shell: true,
  },
  {
    id: "observability.error_boundaries",
    label: "Observability and error boundaries",
    summary: "Route boundaries, panel boundaries, debug redaction, stalled fetch handling, and shared UI primitives.",
    themes: [
      "T8 reliability and graceful degradation",
      "T3 degraded-mode tests",
      "Crash redaction",
    ],
    command: [
      "bun",
      "test",
      "apps/app/tests/app-error-boundary-contract.test.ts",
      "apps/app/tests/app-observability-contract.test.ts",
      "apps/app/tests/public-trust-routes-contract.test.ts",
      "apps/app/tests/shared-primitives-ui-contract.test.ts",
      "apps/app/tests/outputs-panel-contract.test.ts",
      "apps/server/src/operational-metrics.e2e.test.ts",
    ],
  },
  {
    id: "design.contract",
    label: "Matterhorn design contract",
    summary: "Desk-first UI rules, token coverage, no harsh dividers, no oversized radii, no raw shader imports.",
    themes: [
      "T2 two-codebase seam",
      "T6 design contract enforcement",
      "WCAG-oriented primitives",
    ],
    command: ["node", "scripts/matterhorn-design-system.test.mjs"],
  },
  {
    id: "browser.smoke.contracts",
    label: "Browser smoke contracts",
    summary: "Static contracts for product, full-surface, generated-media, Billing, Notes/Memory, and wallet-approval browser smokes.",
    themes: [
      "T3 behavioral browser QA",
      "T8 runtime resilience",
      "Customer smoke reproducibility",
    ],
    command: [
      "node",
      "scripts/matterhorn-product-browser-smoke.test.mjs",
      "&&",
      "node",
      "scripts/matterhorn-full-platform-browser-audit.test.mjs",
      "&&",
      "node",
      "scripts/generated-media-browser-smoke.test.mjs",
      "&&",
      "node",
      "scripts/generated-media-e2e-smoke.test.mjs",
      "&&",
      "node",
      "scripts/wallet-approval-browser-smoke.test.mjs",
      "&&",
      "node",
      "scripts/billing-browser-smoke.test.mjs",
      "&&",
      "node",
      "scripts/notes-memory-browser-smoke.test.mjs",
      "&&",
      "node",
      "scripts/outputs-browser-smoke.test.mjs",
    ],
    shell: true,
  },
  {
    id: "product.readiness",
    label: "Product readiness",
    summary: "Production environment, CORS defaults, backend control-plane/data-policy contracts, and product-readiness smoke wiring.",
    themes: [
      "T5 production CORS posture",
      "Backend capability truthfulness",
      "Release-readiness gate",
    ],
    command: [
      "node",
      "scripts/production-cors-readiness.test.mjs",
      "&&",
      "node",
      "scripts/production-launch-environment.test.mjs",
      "&&",
      "node",
      "scripts/production-cors-readiness.mjs",
      "--require-production",
      "&&",
      "bun",
      "test",
      "apps/server/src/generated-media-diagnostics.test.ts",
      "apps/server/src/google-workspace-launch-gate.test.ts",
      "&&",
      "node",
      "scripts/generated-media-production-readiness.test.mjs",
      "&&",
      "node",
      "scripts/product-readiness-smoke.test.mjs",
      "&&",
      "node",
      "scripts/public-beta-candidate-certifier.test.mjs",
      "&&",
      "node",
      "scripts/release-candidate-manifest.test.mjs",
      "&&",
      "node",
      "scripts/workspace-user-data-recovery.test.mjs",
      "&&",
      "node",
      "scripts/product-hunt-operations-evidence.test.mjs",
      "&&",
      "node",
      "scripts/guarded-runtime-shadow-evidence.test.mjs",
      "&&",
      "node",
      "scripts/product-hunt-acceptance-evidence.test.mjs",
      "&&",
      "node",
      "scripts/public-beta-owner-acceptance.test.mjs",
      "&&",
      "node",
      "scripts/product-hunt-evidence-packet.test.mjs",
    ],
    shell: true,
  },
];

function usage() {
  return [
    "Matterhorn platform safety gate",
    "",
    "Runs the focused backend/frontend checks that protect money paths, local control surfaces,",
    "billing, observability, and the product design contract.",
    "",
    "Usage:",
    "  node scripts/matterhorn-platform-safety-gate.mjs",
    "  node scripts/matterhorn-platform-safety-gate.mjs --dry-run",
    "  node scripts/matterhorn-platform-safety-gate.mjs --json --dry-run",
    "  node scripts/matterhorn-platform-safety-gate.mjs --only wallet.approval.behavior,billing.integrity",
    "",
    "Options:",
    "  --dry-run       Print stages without running them.",
    "  --json          Emit JSON instead of readable text for dry-run/list output.",
    "  --list          Alias for --dry-run.",
    "  --only <ids>    Comma-separated stage ids to run.",
    "  --help          Show this help.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    json: false,
    only: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run" || arg === "--list") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--only") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--only requires a comma-separated value");
      }
      options.only = value.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function selectStages(options) {
  if (!options.only?.length) return STAGES;
  const known = new Set(STAGES.map((stage) => stage.id));
  for (const id of options.only) {
    if (!known.has(id)) {
      throw new Error(`Unknown stage "${id}". Known stages: ${[...known].join(", ")}`);
    }
  }
  const selected = new Set(options.only);
  return STAGES.filter((stage) => selected.has(stage.id));
}

function commandText(stage) {
  return stage.command.join(" ");
}

function dryRunReport(stages) {
  return {
    version: "matterhorn.platform-safety-gate.v1",
    stageCount: stages.length,
    stages: stages.map((stage) => ({
      id: stage.id,
      label: stage.label,
      summary: stage.summary,
      themes: stage.themes,
      command: stage.command,
      shell: Boolean(stage.shell),
    })),
  };
}

function runStage(stage) {
  return new Promise((resolve) => {
    const command = stage.shell ? stage.command.join(" ") : stage.command[0];
    const args = stage.shell ? [] : stage.command.slice(1);
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: Boolean(stage.shell),
      env: process.env,
    });

    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`[${stage.id}] failed to start: ${error.message}`);
      resolve(1);
    });
  });
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  console.error("");
  console.error(usage());
  process.exit(1);
}

if (options.help) {
  console.log(usage());
  process.exit(0);
}

let stages;
try {
  stages = selectStages(options);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (options.dryRun) {
  const report = dryRunReport(stages);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Matterhorn platform safety gate");
    for (const [index, stage] of stages.entries()) {
      console.log(`${index + 1}. ${stage.id}`);
      console.log(`   ${stage.summary}`);
      console.log(`   ${commandText(stage)}`);
    }
  }
  process.exit(0);
}

console.log(`Matterhorn platform safety gate: ${stages.length} stages`);
for (const [index, stage] of stages.entries()) {
  console.log("");
  console.log(`[${index + 1}/${stages.length}] ${stage.label}`);
  console.log(stage.summary);
  console.log(`$ ${commandText(stage)}`);
  const code = await runStage(stage);
  if (code !== 0) {
    console.error("");
    console.error(`Matterhorn platform safety gate failed at ${stage.id} with exit code ${code}.`);
    process.exit(code);
  }
}

console.log("");
console.log("Matterhorn platform safety gate passed.");
