export type MatterhornWorkflowCatalogFilter = {
  workflow?: string | null;
  category?: string | null;
  status?: string | null;
  includePrompts?: boolean | null;
};

type MatterhornWorkflowCatalogItem = {
  workflowId: string;
  name: string;
  category: "wellness" | "bittensor" | "markets" | "decentralized_services";
  status: "live_local" | "planned_not_live" | "preview_only";
  source: "offline_helper" | "typed_fixture";
  targetUserPersona: string;
  summary: string;
  localArtifactsAvailable: boolean;
  canExecuteLocalWorkflow: boolean;
  canExecuteProviderActions: false;
  canonicalPrompts: string[];
  promptCount?: number;
  generatedArtifacts: string[];
  serviceHooks: Array<{ hook: string; status: string }>;
  commands: Record<string, string>;
  references: string[];
  safety: {
    acceptsSecrets: false;
    acceptsPrivateKeys: false;
    acceptsApiSecrets: false;
    acceptsRawSignatures: false;
    canSubmit: false;
    liveExecutionEnabled: false;
    catalogOnly?: true;
    plannedHooksOnly?: true;
    requiresExternalSigner?: boolean;
    givesMedicalAdvice?: false;
    movesFunds?: false;
    canExecuteLocalWorkflow?: boolean;
    canExecuteProviderActions?: false;
  };
};

export type MatterhornWorkflowCatalog = {
  ok: true;
  version: "matterhorn.workflow.catalog.v1";
  status: "catalog_only";
  generatedAt: string;
  source: "matterhorn_server_workflow_catalog";
  summary: string;
  commands: Record<string, string>;
  safety: {
    acceptsSecrets: false;
    acceptsPrivateKeys: false;
    acceptsApiSecrets: false;
    acceptsRawSignatures: false;
    canSubmit: false;
    liveExecutionEnabled: false;
    catalogOnly: true;
    noProviderExecution: true;
    noCustody: true;
    noLiveMarketSubmit: true;
    plannedServicesOnly: true;
  };
  counts: {
    total: number;
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
  };
  workflows: MatterhornWorkflowCatalogItem[];
  references: string[];
};

const FORBIDDEN_CREDENTIAL_KEY_PATTERN =
  /(?:seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|wallet[-_]?export)/i;

const COMMON_SAFETY = {
  acceptsSecrets: false,
  acceptsPrivateKeys: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  canSubmit: false,
  liveExecutionEnabled: false,
} as const;

const WELLNESS_PROMPTS = [
  "Start a new wellness program - here is my audience, goal, constraints, session type, duration, equipment, and level",
  "Design the program with safety disclaimers",
  "Generate the client artifacts: weekly plan, video script, checklist, FAQ, and progress tracker",
  "Package this as a service: offer page copy, pricing-package draft, onboarding questionnaire, and terms/disclaimer text",
  "Draft the delivery plan: storage/hosting, email updates, payments, and client access",
  "Set up customer management: follow-up cadence, feedback form, and renewal/up-sell prompts",
  "Export this as a Matterhorn workflow / MCP artifact",
];

const WORKFLOWS: MatterhornWorkflowCatalogItem[] = [
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
      chat: "matterhorn-work crypto chat --message \"show my TAO\" --json",
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
      chat: "matterhorn-work crypto chat --message \"show Hyperliquid BTC orderbook\" --json",
      gate: "pnpm test:market-execution-safety-gate",
    },
    references: ["docs/hyperliquid-read-preview.md", "docs/polymarket-read-preview.md"],
    safety: {
      ...COMMON_SAFETY,
      canExecuteLocalWorkflow: true,
      canExecuteProviderActions: false,
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
      chat: "matterhorn-work services chat --message \"create a paid fitness program with customer emails\" --json",
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

export function findForbiddenMatterhornWorkflowQueryKey(keys: Iterable<string>): string | null {
  for (const key of keys) {
    if (FORBIDDEN_CREDENTIAL_KEY_PATTERN.test(key)) return key;
  }
  return null;
}

function parseFilter(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

function workflowForOutput(
  workflow: MatterhornWorkflowCatalogItem,
  includePrompts: boolean,
): MatterhornWorkflowCatalogItem {
  if (includePrompts) return workflow;
  return {
    ...workflow,
    canonicalPrompts: workflow.canonicalPrompts.slice(0, 3),
    promptCount: workflow.canonicalPrompts.length,
  };
}

export function buildMatterhornWorkflowCatalog(input: MatterhornWorkflowCatalogFilter = {}): MatterhornWorkflowCatalog {
  const workflowFilter = parseFilter(input.workflow);
  const categoryFilter = parseFilter(input.category);
  const statusFilter = parseFilter(input.status);
  const includePrompts = input.includePrompts === true;
  let workflows = WORKFLOWS;

  if (workflowFilter) {
    workflows = workflows.filter((workflow) => workflow.workflowId === workflowFilter);
    if (workflows.length === 0) throw new Error(`Unknown Matterhorn workflow: ${workflowFilter}`);
  }
  if (categoryFilter) {
    workflows = workflows.filter((workflow) => workflow.category === categoryFilter);
    if (workflows.length === 0) throw new Error(`No Matterhorn workflows found for category: ${categoryFilter}`);
  }
  if (statusFilter) {
    workflows = workflows.filter((workflow) => workflow.status === statusFilter);
    if (workflows.length === 0) throw new Error(`No Matterhorn workflows found for status: ${statusFilter}`);
  }

  const outputWorkflows = workflows.map((workflow) => workflowForOutput(workflow, includePrompts));

  return {
    ok: true,
    version: "matterhorn.workflow.catalog.v1",
    status: "catalog_only",
    generatedAt: new Date(0).toISOString(),
    source: "matterhorn_server_workflow_catalog",
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
      total: outputWorkflows.length,
      byCategory: outputWorkflows.reduce<Record<string, number>>((acc, workflow) => {
        acc[workflow.category] = (acc[workflow.category] ?? 0) + 1;
        return acc;
      }, {}),
      byStatus: outputWorkflows.reduce<Record<string, number>>((acc, workflow) => {
        acc[workflow.status] = (acc[workflow.status] ?? 0) + 1;
        return acc;
      }, {}),
    },
    workflows: outputWorkflows,
    references: [
      "docs/matterhorn-workflow-contract.md",
      "docs/wellness-creator-workflow.md",
      "docs/decentralized-services-capability-contract.md",
      "docs/agent-control-coverage-matrix.md",
    ],
  };
}
