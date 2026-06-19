#!/usr/bin/env node

const VERSION = "matterhorn.workflow.catalog.v1";

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

const WELLNESS_PROMPTS = [
  "Start a new wellness program - here is my audience, goal, constraints, session type, duration, equipment, and level",
  "Design the program with safety disclaimers",
  "Generate the client artifacts: weekly plan, video script, checklist, FAQ, and progress tracker",
  "Package this as a service: offer page copy, pricing-package draft, onboarding questionnaire, and terms/disclaimer text",
  "Draft the delivery plan: storage/hosting, email updates, payments, and client access",
  "Set up customer management: follow-up cadence, feedback form, and renewal/up-sell prompts",
  "Export this as a Matterhorn workflow / MCP artifact",
];

const COMMON_SAFETY = {
  acceptsSecrets: false,
  acceptsPrivateKeys: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  canSubmit: false,
  liveExecutionEnabled: false,
};

const WORKFLOWS = [
  {
    workflowId: "wellness_creator_workflow",
    name: "Wellness Creator Workflow",
    category: "wellness",
    status: "live_local",
    source: "offline_helper",
    targetUserPersona: "personal trainer, gym instructor, yoga instructor, or dietician",
    summary:
      "Runs a seven-stage chat workflow for creating wellness programs, client artifacts, service packaging, customer management, and MCP/artifact export.",
    localArtifactsAvailable: true,
    canExecuteLocalWorkflow: true,
    canExecuteProviderActions: false,
    canonicalPrompts: WELLNESS_PROMPTS,
    generatedArtifacts: [
      "intake_summary",
      "program_design_plan",
      "weekly_plan",
      "video_script",
      "checklist",
      "faq",
      "progress_tracker",
      "offer_page_copy",
      "pricing_package_draft",
      "onboarding_questionnaire",
      "terms_disclaimer_text",
      "follow_up_cadence",
      "feedback_form",
      "renewal_upsell_prompts",
      "matterhorn_workflow_mcp_export",
    ],
    serviceHooks: [
      { hook: "storage", status: "planned_not_live" },
      { hook: "hosting", status: "planned_not_live" },
      { hook: "email", status: "planned_not_live" },
      { hook: "payments", status: "planned_not_live" },
      { hook: "identity", status: "planned_not_live" },
    ],
    commands: {
      inspect: "node scripts/wellness-creator-workflow.mjs --json",
      check: "node scripts/wellness-creator-workflow.mjs --check",
      gate: "pnpm test:wellness-creator-workflow",
    },
    references: [
      "docs/wellness-creator-workflow.md",
      "docs/handoffs/hermes-wellness-creator-workflow-qa.md",
      "scripts/wellness-creator-workflow.mjs",
    ],
    safety: {
      ...COMMON_SAFETY,
      givesMedicalAdvice: false,
      movesFunds: false,
      canSubmit: false,
      liveExecutionEnabled: false,
      plannedHooksOnly: true,
    },
  },
  {
    workflowId: "wellness_creator_services",
    name: "Wellness Creator Services",
    category: "wellness",
    status: "planned_not_live",
    source: "typed_fixture",
    targetUserPersona: "wellness creator or coach",
    summary:
      "Plans future service hooks for wellness creators without executing live storage, hosting, email, payment, or access-provider actions.",
    localArtifactsAvailable: false,
    canExecuteLocalWorkflow: false,
    canExecuteProviderActions: false,
    canonicalPrompts: ["Plan a wellness creator service with content, audience, and delivery format"],
    generatedArtifacts: ["service_plan", "content_calendar"],
    serviceHooks: [
      { hook: "email", status: "planned_not_live" },
      { hook: "payments", status: "planned_not_live" },
      { hook: "hosting", status: "planned_not_live" },
    ],
    commands: {
      inspect: "matterhorn-work workflows catalog --workflow wellness_creator_services --json",
      gate: "pnpm test:matterhorn-workflow-contract",
    },
    references: ["packages/types/src/matterhorn-workflows.ts", "docs/matterhorn-workflow-contract.md"],
    safety: { ...COMMON_SAFETY, canExecuteProviderActions: false },
  },
  {
    workflowId: "bittensor_operator",
    name: "Bittensor Operator",
    category: "bittensor",
    status: "live_local",
    source: "typed_fixture",
    targetUserPersona: "TAO operator or delegator",
    summary:
      "Guides TAO wallet reads, subnet monitoring, staking previews, and external-signer handoffs without taking custody or submitting transactions.",
    localArtifactsAvailable: true,
    canExecuteLocalWorkflow: true,
    canExecuteProviderActions: false,
    canonicalPrompts: [
      "show my TAO",
      "where am I staked?",
      "which subnet is useful for image generation?",
      "compare validators on subnet 14",
      "prepare staking 1 TAO",
    ],
    generatedArtifacts: ["stake_preview", "external_signer_handoff", "watch_digest", "receipt_evidence"],
    serviceHooks: [{ hook: "bittensor", status: "live_local" }],
    commands: {
      chat: 'matterhorn-work crypto chat --message "show my TAO" --json',
      gate: "pnpm test:bittensor-customer-readiness-gate",
    },
    references: ["docs/bittensor-operator-playbook.md", "docs/bittensor-built-vs-remaining-vision.md"],
    safety: {
      ...COMMON_SAFETY,
      requiresExternalSigner: true,
      canExecuteLocalWorkflow: true,
      canExecuteProviderActions: false,
    },
  },
  {
    workflowId: "market_read_preview",
    name: "Market Read / Preview",
    category: "markets",
    status: "preview_only",
    source: "typed_fixture",
    targetUserPersona: "trader or market watcher",
    summary:
      "Reads Hyperliquid and Polymarket data, builds non-submittable previews, and prepares external-signer handoffs without live market submission.",
    localArtifactsAvailable: true,
    canExecuteLocalWorkflow: true,
    canExecuteProviderActions: false,
    canonicalPrompts: [
      "show my Hyperliquid exposure",
      "summarize this Polymarket market",
      "preview a Hyperliquid order",
      "preview a Polymarket order",
    ],
    generatedArtifacts: ["market_preview", "signing_handoff", "watch_alert", "receipt_status"],
    serviceHooks: [
      { hook: "hyperliquid", status: "preview_only" },
      { hook: "polymarket", status: "preview_only" },
    ],
    commands: {
      chat: 'matterhorn-work crypto chat --message "show Hyperliquid BTC orderbook" --json',
      gate: "pnpm test:market-execution-safety-gate",
    },
    references: ["docs/hyperliquid-read-preview.md", "docs/polymarket-read-preview.md"],
    safety: {
      ...COMMON_SAFETY,
      canExecuteLocalWorkflow: true,
      canExecuteProviderActions: false,
      canSubmit: false,
    },
  },
  {
    workflowId: "decentralized_services_planner",
    name: "Decentralized Services Planner",
    category: "decentralized_services",
    status: "planned_not_live",
    source: "typed_fixture",
    targetUserPersona: "builder or operator needing hosting, storage, email, payments, or identity",
    summary:
      "Plans future decentralized-service actions across hosting, storage, email, payments, and identity without executing any live provider action.",
    localArtifactsAvailable: true,
    canExecuteLocalWorkflow: true,
    canExecuteProviderActions: false,
    canonicalPrompts: [
      "host this app",
      "store this file",
      "send emails to my customers",
      "collect payments for my program",
      "gate access to this artifact",
    ],
    generatedArtifacts: ["service_preview", "provider_comparison", "handoff_plan", "public_receipt_shape"],
    serviceHooks: [
      { hook: "hosting", status: "planned_not_live" },
      { hook: "storage", status: "planned_not_live" },
      { hook: "email", status: "planned_not_live" },
      { hook: "payments", status: "planned_not_live" },
      { hook: "identity", status: "planned_not_live" },
    ],
    commands: {
      capabilities: "matterhorn-work services capabilities --json",
      chat: 'matterhorn-work services chat --message "create a paid fitness program with customer emails" --json',
      gate: "pnpm test:decentralized-services-contract",
    },
    references: ["docs/decentralized-services-capability-contract.md", "packages/types/src/decentralized-services.ts"],
    safety: {
      ...COMMON_SAFETY,
      canExecuteLocalWorkflow: true,
      canExecuteProviderActions: false,
    },
  },
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const value = (name, fallback = "") => {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1]) return args[index + 1];
    const inline = args.find((item) => item.startsWith(`${name}=`));
    return inline ? inline.slice(name.length + 1) : fallback;
  };
  return {
    args,
    json: args.includes("--json"),
    help: args.includes("--help") || args.includes("-h"),
    includePrompts: args.includes("--include-prompts"),
    workflow: value("--workflow", value("--workflow-id", "")).trim(),
    category: value("--category", "").trim(),
    status: value("--status", "").trim(),
  };
}

function assertNoForbiddenArgs(args) {
  for (const item of args) {
    const key = item.split("=")[0] || item;
    if (FORBIDDEN_ARG_RE.test(key)) {
      throw new Error(`Forbidden credential-shaped flag ${key} is not accepted by the Matterhorn workflow catalog.`);
    }
  }
}

function filterWorkflows(config) {
  let workflows = WORKFLOWS;
  if (config.workflow) {
    workflows = workflows.filter((workflow) => workflow.workflowId === config.workflow);
    if (workflows.length === 0) throw new Error(`Unknown Matterhorn workflow: ${config.workflow}`);
  }
  if (config.category) {
    workflows = workflows.filter((workflow) => workflow.category === config.category);
    if (workflows.length === 0) throw new Error(`No Matterhorn workflows found for category: ${config.category}`);
  }
  if (config.status) {
    workflows = workflows.filter((workflow) => workflow.status === config.status);
    if (workflows.length === 0) throw new Error(`No Matterhorn workflows found for status: ${config.status}`);
  }
  return workflows;
}

function redactForDefaultOutput(workflow, includePrompts) {
  if (includePrompts) return workflow;
  return {
    ...workflow,
    canonicalPrompts: workflow.canonicalPrompts.slice(0, 3),
    promptCount: workflow.canonicalPrompts.length,
  };
}

function buildCatalog(config) {
  const workflows = filterWorkflows(config).map((workflow) =>
    redactForDefaultOutput(workflow, config.includePrompts),
  );
  return {
    ok: true,
    version: VERSION,
    status: "catalog_only",
    generatedAt: new Date(0).toISOString(),
    summary:
      "Safe, chat-first Matterhorn Work workflow catalog across wellness, Bittensor, markets, decentralized services, and future verticals.",
    commands: {
      catalog: "matterhorn-work workflows catalog --json",
      workflowFilter: "matterhorn-work workflows catalog --workflow wellness_creator_workflow --include-prompts --json",
      categoryFilter: "matterhorn-work workflows catalog --category wellness --json",
      contractGate: "pnpm test:matterhorn-workflow-contract",
      catalogGate: "pnpm test:matterhorn-workflow-catalog",
    },
    safety: {
      ...COMMON_SAFETY,
      catalogOnly: true,
      noProviderExecution: true,
      noCustody: true,
      noLiveMarketSubmit: true,
      plannedServicesOnly: true,
    },
    counts: {
      total: workflows.length,
      byCategory: workflows.reduce((acc, workflow) => {
        acc[workflow.category] = (acc[workflow.category] ?? 0) + 1;
        return acc;
      }, {}),
      byStatus: workflows.reduce((acc, workflow) => {
        acc[workflow.status] = (acc[workflow.status] ?? 0) + 1;
        return acc;
      }, {}),
    },
    workflows,
    references: [
      "docs/matterhorn-workflow-contract.md",
      "docs/wellness-creator-workflow.md",
      "docs/decentralized-services-capability-contract.md",
      "docs/agent-control-coverage-matrix.md",
    ],
  };
}

function printText(catalog) {
  process.stdout.write(`${catalog.summary}\n\n`);
  process.stdout.write("Safety: catalog only; no custody; no provider execution; no market submission.\n\n");
  for (const workflow of catalog.workflows) {
    process.stdout.write(`${workflow.name} (${workflow.workflowId})\n`);
    process.stdout.write(`  Category: ${workflow.category}\n`);
    process.stdout.write(`  Status: ${workflow.status}\n`);
    process.stdout.write(`  Persona: ${workflow.targetUserPersona}\n`);
    process.stdout.write(`  Summary: ${workflow.summary}\n`);
    process.stdout.write(`  Gate: ${workflow.commands.gate ?? workflow.commands.check ?? "n/a"}\n\n`);
  }
}

function printHelp() {
  process.stdout.write([
    "Matterhorn Work workflow catalog",
    "",
    "Usage:",
    "  node scripts/matterhorn-workflow-catalog.mjs [--json] [--include-prompts]",
    "  node scripts/matterhorn-workflow-catalog.mjs --workflow wellness_creator_workflow --json",
    "  node scripts/matterhorn-workflow-catalog.mjs --category wellness --json",
    "  matterhorn-work workflows catalog --json",
    "",
    "This helper is catalog-only. It never accepts secrets, signs, submits, moves funds, or executes provider actions.",
    "",
  ].join("\n"));
}

try {
  const config = parseArgs(process.argv);
  if (config.help) {
    printHelp();
  } else {
    assertNoForbiddenArgs(config.args);
    const catalog = buildCatalog(config);
    if (config.json) {
      process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
    } else {
      printText(catalog);
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
