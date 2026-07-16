#!/usr/bin/env node

const VERSION = "matterhorn.workflow.catalog.v1";

const FORBIDDEN_ARG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase|token)$/i;

const WELLNESS_PROMPTS = [
  "Start a new longevity program - here is my audience, goal, constraints, session type, duration, equipment, and level",
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
    name: "Longevity Creator Workflow",
    category: "wellness",
    status: "live_local",
    source: "offline_helper",
    targetUserPersona: "personal trainer, gym instructor, yoga instructor, or dietician",
    summary:
      "Runs a seven-stage chat workflow for creating longevity programs, client artifacts, service packaging, customer management, and MCP/artifact export.",
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
    name: "Longevity Creator Services",
    category: "wellness",
    status: "planned_not_live",
    source: "typed_fixture",
    targetUserPersona: "longevity creator or coach",
    summary:
      "Plans future service hooks for longevity creators without executing live storage, hosting, email, payment, or access-provider actions.",
    localArtifactsAvailable: false,
    canExecuteLocalWorkflow: false,
    canExecuteProviderActions: false,
    canonicalPrompts: ["Plan a longevity creator service with content, audience, and delivery format"],
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

const CUSTOMER_TEMPLATES = [
  {
    id: "bittensor_operator",
    name: "Use Bittensor",
    summary:
      "Read TAO balances, compare subnets and validators, and prepare external-signer staking handoffs.",
    promise:
      "You stay non-custodial. Matterhorn never holds your private key or submits a transaction.",
    category: "bittensor",
    examplePrompts: [
      "Show my TAO",
      "Which subnet is useful for image generation?",
      "Compare validators on subnet 14",
      "Prepare staking 1 TAO",
    ],
    expectedArtifacts: [
      { id: "balance_card", name: "TAO Balance Card", mimeType: "application/json", public: true },
      { id: "subnet_comparison", name: "Subnet Comparison", mimeType: "text/markdown", public: true },
      { id: "stake_preview", name: "Stake Preview", mimeType: "application/json", public: true },
      { id: "external_signer_handoff", name: "External Signer Handoff", mimeType: "application/json", public: true },
    ],
    requiredContext: [
      {
        id: "wallet_address",
        label: "Public wallet address",
        required: true,
        type: "text",
        helpText: "Only the public address. Never provide a private key or seed phrase.",
      },
    ],
    optionalContext: [
      { id: "subnet", label: "Subnet ID", required: false, type: "number" },
      { id: "stake_amount", label: "Stake amount to preview", required: false, type: "number" },
    ],
    status: "beta_ready",
    safetyBoundaries: {
      ...COMMON_SAFETY,
      canExecute: true,
      requiresExternalSigner: true,
      allowsRealFunds: false,
    },
    forbiddenInputs: ["private key", "seed phrase", "mnemonic", "raw signature", "signed payload", "wallet export"],
    handoffReceiptSupport: {
      supported: true,
      types: ["external_signer_handoff", "stake_preview_receipt"],
      description: "Produces an external-signer handoff and a public stake preview receipt.",
    },
    serviceHooks: [{ hook: "bittensor", status: "live_local" }],
    chatMode: "crypto chat",
    launch: {
      primaryCta: "Open Bittensor panel",
      secondaryCta: "Preview a stake handoff",
      defaultPrompt: "Show my TAO",
      handoffContextLabel: "Public wallet address",
      recommendedSurface: "protocol_desk",
    },
    ui: {
      iconHint: "bittensor",
      accent: "matterhorn_blue",
      shortDescription:
        "Read TAO balances and prepare external-signer staking handoffs.",
    },
    routing: {
      chatMode: "bittensor",
      opensPanel: "bittensor",
      startsSession: true,
    },
    recommendedCommands: {
      cli: ['matterhorn-work crypto chat --message "show my TAO" --json'],
      mcp: ["matterhorn_crypto_chat"],
    },
  },
  {
    id: "hyperliquid_trader",
    name: "Trade on Hyperliquid",
    summary:
      "Research Hyperliquid markets, preview orders, and manually place an exact reviewed order with a connected wallet.",
    promise: "This template never submits. Manual execution is available only in the separate wallet-approved order panel.",
    category: "markets",
    examplePrompts: [
      "Preview a Hyperliquid BTC-PERP trade",
      "Show my Hyperliquid exposure",
      "Generate a Hyperliquid signing handoff",
    ],
    expectedArtifacts: [
      { id: "market_preview", name: "Market Preview", mimeType: "application/json", public: true },
      { id: "signing_handoff", name: "Signing Handoff", mimeType: "application/json", public: true },
    ],
    requiredContext: [
      {
        id: "wallet_address",
        label: "Public wallet address",
        required: true,
        type: "text",
        helpText: "Only the public address. Never provide a private key.",
      },
    ],
    optionalContext: [
      { id: "market", label: "Market or asset", required: false, type: "text" },
      { id: "side", label: "Side", required: false, type: "select", options: ["buy", "sell", "long", "short"] },
      { id: "size", label: "Order size", required: false, type: "number" },
    ],
    status: "preview_only",
    safetyBoundaries: {
      ...COMMON_SAFETY,
      canExecute: false,
      requiresExternalSigner: true,
      allowsRealFunds: false,
    },
    forbiddenInputs: ["private key", "API secret", "raw signature", "signed payload", "signed order"],
    handoffReceiptSupport: {
      supported: true,
      types: ["market_preview", "signing_handoff"],
      description: "Produces a read-only market preview and an external-signer handoff.",
    },
    serviceHooks: [{ hook: "hyperliquid", status: "preview_only" }],
    chatMode: "crypto chat",
    launch: {
      primaryCta: "Open Hyperliquid panel",
      secondaryCta: "Review an order",
      defaultPrompt: "Preview a Hyperliquid BTC-PERP trade",
      handoffContextLabel: "Public wallet address",
      recommendedSurface: "protocol_desk",
    },
    ui: {
      iconHint: "hyperliquid",
      accent: "matterhorn_blue",
      shortDescription:
        "Research in chat, then review and approve an exact order in your connected wallet.",
    },
    routing: {
      chatMode: "hyperliquid",
      opensPanel: "hyperliquid",
      startsSession: true,
    },
    recommendedCommands: {
      cli: ['matterhorn-work crypto chat --message "preview Hyperliquid BTC-PERP" --json'],
      mcp: ["matterhorn_hyperliquid_prepare_handoff"],
    },
  },
  {
    id: "polymarket_researcher",
    name: "Bet on Polymarket",
    summary:
      "Research Polymarket markets, preview positions, and prepare compliance-aware signing handoffs without live submission.",
    promise: "Preview-only. Compliance and external signer required. No live submission by Matterhorn.",
    category: "markets",
    examplePrompts: [
      "Summarize this Polymarket market",
      "Preview a Polymarket trade",
      "Show my Polymarket positions",
    ],
    expectedArtifacts: [
      { id: "market_preview", name: "Market Preview", mimeType: "application/json", public: true },
      { id: "signing_handoff", name: "Signing Handoff", mimeType: "application/json", public: true },
    ],
    requiredContext: [
      {
        id: "wallet_address",
        label: "Public wallet address",
        required: true,
        type: "text",
        helpText: "Only the public address. Never provide a private key.",
      },
    ],
    optionalContext: [
      { id: "market_id", label: "Market ID", required: false, type: "text" },
      { id: "outcome", label: "Outcome", required: false, type: "select", options: ["yes", "no"] },
    ],
    status: "preview_only",
    safetyBoundaries: {
      ...COMMON_SAFETY,
      canExecute: false,
      requiresExternalSigner: false,
      allowsRealFunds: false,
    },
    forbiddenInputs: ["private key", "API secret", "raw signature", "signed payload", "signed order"],
    handoffReceiptSupport: {
      supported: true,
      types: ["market_preview", "signing_handoff"],
      description: "Produces a read-only market preview and an external-signer handoff.",
    },
    serviceHooks: [{ hook: "polymarket", status: "preview_only" }],
    chatMode: "crypto chat",
    launch: {
      primaryCta: "Open Polymarket panel",
      secondaryCta: "Research markets",
      defaultPrompt: "Summarize this Polymarket market",
      handoffContextLabel: "Public wallet address",
      recommendedSurface: "protocol_desk",
    },
    ui: {
      iconHint: "polymarket",
      accent: "matterhorn_blue",
      shortDescription:
        "Research Polymarket markets and prepare signing handoffs.",
    },
    routing: {
      chatMode: "polymarket",
      opensPanel: "polymarket",
      startsSession: true,
    },
    recommendedCommands: {
      cli: ['matterhorn-work crypto chat --message "preview Polymarket market" --json'],
      mcp: ["matterhorn_polymarket_prepare_handoff"],
    },
  },
  {
    id: "sui_wallet_workflow",
    name: "Use Sui",
    summary: "Read public Sui account context, prepare transfer previews, and save public transaction receipts.",
    promise: "Sui signing stays in your wallet. Matterhorn never asks for seed phrases, private keys, raw signatures, signed payloads, or wallet exports.",
    category: "web3",
    examplePrompts: ["Show my Sui wallet", "Prepare a Sui transfer preview", "Import a Sui transaction receipt"],
    expectedArtifacts: [
      { id: "wallet_card", name: "Sui Wallet Card", mimeType: "application/json", public: true },
      { id: "transfer_preview", name: "Transfer Preview", mimeType: "application/json", public: true },
      { id: "receipt_evidence", name: "Receipt Evidence", mimeType: "application/json", public: true },
    ],
    requiredContext: [
      {
        id: "wallet_address",
        label: "Public Sui address",
        required: true,
        type: "text",
        helpText: "Public Sui address only. Never provide a seed phrase, private key, or wallet export.",
      },
    ],
    optionalContext: [
      { id: "recipient_address", label: "Recipient public Sui address", required: false, type: "text" },
      { id: "amount_mist", label: "Transfer amount in MIST", required: false, type: "number" },
    ],
    status: "preview_only",
    safetyBoundaries: {
      ...COMMON_SAFETY,
      canExecute: false,
      requiresExternalSigner: false,
      allowsRealFunds: false,
    },
    forbiddenInputs: ["private key", "seed phrase", "mnemonic", "raw signature", "signed payload", "wallet export"],
    handoffReceiptSupport: {
      supported: true,
      types: ["transfer_preview", "receipt_evidence"],
      description: "Produces a non-custodial transfer preview and stores only public receipt evidence after wallet submission.",
    },
    serviceHooks: [{ hook: "sui", status: "preview_only" }],
    chatMode: "crypto chat",
    launch: {
      primaryCta: "Open Sui desk",
      secondaryCta: "Preview transfer",
      defaultPrompt: "Show my Sui wallet",
      handoffContextLabel: "Public Sui address",
      recommendedSurface: "protocol_desk",
    },
    ui: {
      iconHint: "sui",
      accent: "matterhorn_blue",
      shortDescription: "Read Sui accounts, preview transfers, and import receipts. Signing stays in your wallet.",
    },
    routing: {
      chatMode: "sui",
      opensPanel: "sui",
      startsSession: true,
    },
    recommendedCommands: {
      cli: ['matterhorn-work sui account "<public Sui address>" --json'],
    },
  },
  {
    id: "wellness_creator_workflow",
    name: "Build a Longevity Creator business workflow",
    summary:
      "Design longevity programs, service packages, and client management workflows without giving medical advice.",
    promise:
      "Plan your longevity business. No medical advice. Service hooks remain planned-not-live until you connect providers.",
    category: "wellness",
    examplePrompts: [
      "Create a longevity program for my clients",
      "Design a nutrition plan",
      "Build a yoga class schedule",
      "Package my training services",
    ],
    expectedArtifacts: [
      { id: "program_design_plan", name: "Program Design Plan", mimeType: "text/markdown", public: true },
      { id: "weekly_schedule", name: "Weekly Schedule", mimeType: "text/markdown", public: true },
      { id: "pricing_package_draft", name: "Pricing Package Draft", mimeType: "text/markdown", public: true },
      { id: "service_plan", name: "Service Plan", mimeType: "application/json", public: true },
    ],
    requiredContext: [
      { id: "audience", label: "Who is the program for?", required: true, type: "text" },
      { id: "goal", label: "What is the primary goal?", required: true, type: "text" },
    ],
    optionalContext: [
      { id: "duration_weeks", label: "Program duration in weeks", required: false, type: "number" },
      { id: "equipment", label: "Available equipment", required: false, type: "text" },
    ],
    status: "workflow_ready",
    safetyBoundaries: {
      ...COMMON_SAFETY,
      canExecute: false,
      requiresExternalSigner: false,
      allowsRealFunds: false,
    },
    forbiddenInputs: [
      "medical diagnosis",
      "prescription advice",
      "protected health information beyond redacted goals",
    ],
    handoffReceiptSupport: {
      supported: true,
      types: ["service_plan", "content_calendar"],
      description: "Produces a public/redacted service plan and workflow evidence bundle.",
    },
    serviceHooks: [
      { hook: "email", status: "planned_not_live" },
      { hook: "payments", status: "planned_not_live" },
      { hook: "hosting", status: "planned_not_live" },
    ],
    chatMode: "workflow chat",
    launch: {
      primaryCta: "Start Longevity workflow",
      secondaryCta: "Plan a service",
      defaultPrompt: "Create a longevity program for my clients",
      handoffContextLabel: "Audience and goal",
      recommendedSurface: "workflow_chat",
    },
    ui: {
      iconHint: "wellness",
      accent: "neutral",
      shortDescription:
        "Design longevity programs and service packages without medical advice.",
    },
    routing: {
      chatMode: "wellness",
      startsSession: true,
    },
    recommendedCommands: {
      cli: ["matterhorn-work workflows catalog --workflow wellness_creator_workflow --include-prompts --json"],
    },
  },
  {
    id: "decentralized_services_operator",
    name: "Explore future decentralized services",
    summary:
      "Plan future decentralized service actions across storage, hosting, email, payments, and identity.",
    promise: "Future-contract planning only. No live provider execution.",
    category: "decentralized_services",
    examplePrompts: [
      "Plan a decentralized storage upload",
      "Preview a future email campaign",
      "Compare provider fixtures for hosting",
      "Plan identity-gated access for a resource",
    ],
    expectedArtifacts: [
      { id: "service_preview", name: "Service Preview", mimeType: "application/json", public: true },
      { id: "provider_comparison", name: "Provider Comparison", mimeType: "text/markdown", public: true },
    ],
    requiredContext: [
      {
        id: "capability",
        label: "Which decentralized service?",
        required: true,
        type: "select",
        options: ["hosting", "storage", "email", "payments", "identity"],
      },
      { id: "intent_description", label: "Describe what you want to do", required: true, type: "text" },
    ],
    optionalContext: [
      { id: "provider_preference", label: "Preferred provider fixture", required: false, type: "text" },
    ],
    status: "planned_not_live",
    safetyBoundaries: {
      ...COMMON_SAFETY,
      canExecute: false,
      requiresExternalSigner: false,
      allowsRealFunds: false,
    },
    forbiddenInputs: ["private key", "API secret", "payment credential", "email password", "hosting credential"],
    handoffReceiptSupport: {
      supported: false,
      description: "Future contract; handoffs are not yet implemented.",
    },
    serviceHooks: [
      { hook: "hosting", status: "planned_not_live" },
      { hook: "storage", status: "planned_not_live" },
      { hook: "email", status: "planned_not_live" },
      { hook: "payments", status: "planned_not_live" },
      { hook: "identity", status: "planned_not_live" },
    ],
    chatMode: "services chat",
    launch: {
      primaryCta: "Plan future services",
      secondaryCta: "Compare fixtures",
      defaultPrompt: "Plan a decentralized storage upload",
      handoffContextLabel: "Capability and intent",
      recommendedSurface: "future_service",
    },
    ui: {
      iconHint: "services",
      accent: "neutral",
      shortDescription:
        "Plan future decentralized services across storage, hosting, email, payments, and identity.",
    },
    routing: {
      chatMode: "services",
      startsSession: true,
    },
    recommendedCommands: {
      cli: ["matterhorn-work services capabilities --json"],
    },
  },
  {
    id: "blank_chat_workflow",
    name: "Chat",
    summary: "Start a free-form session with the default Matterhorn Agent.",
    promise: "Open-ended assistance. You choose the goal.",
    category: "future",
    examplePrompts: ["What can you do?", "Help me think through a problem", "Draft an email"],
    expectedArtifacts: [],
    requiredContext: [],
    optionalContext: [],
    status: "blank",
    safetyBoundaries: {
      ...COMMON_SAFETY,
      canExecute: false,
      requiresExternalSigner: false,
      allowsRealFunds: false,
    },
    forbiddenInputs: [],
    handoffReceiptSupport: { supported: false },
    serviceHooks: [],
    chatMode: "free chat",
    launch: {
      primaryCta: "Start chat",
      secondaryCta: "Browse templates",
      defaultPrompt: "What can you do?",
      handoffContextLabel: "Goal",
      recommendedSurface: "workflow_chat",
    },
    ui: {
      iconHint: "blank",
      accent: "neutral",
      shortDescription:
        "Start a flexible chat with the default Matterhorn Agent.",
    },
    routing: {
      chatMode: "general",
      startsSession: true,
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
    promptPack: args.includes("--prompt-pack"),
    customerTemplates: args.includes("--customer-templates"),
    customerTemplate: value("--customer-template", "").trim(),
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

function filterCustomerTemplates(config) {
  let templates = CUSTOMER_TEMPLATES;
  if (config.customerTemplate) {
    templates = templates.filter((template) => template.id === config.customerTemplate);
    if (templates.length === 0) throw new Error(`Unknown customer workflow template: ${config.customerTemplate}`);
  }
  if (config.category) {
    templates = templates.filter((template) => template.category === config.category);
    if (templates.length === 0) throw new Error(`No customer workflow templates found for category: ${config.category}`);
  }
  if (config.status) {
    templates = templates.filter((template) => template.status === config.status);
    if (templates.length === 0) throw new Error(`No customer workflow templates found for status: ${config.status}`);
  }
  return templates;
}

function redactForDefaultOutput(workflow, includePrompts) {
  if (includePrompts) return workflow;
  return {
    ...workflow,
    canonicalPrompts: workflow.canonicalPrompts.slice(0, 3),
    promptCount: workflow.canonicalPrompts.length,
  };
}

function buildCustomerTemplatesCatalog(config) {
  const templates = filterCustomerTemplates(config);
  return {
    ok: true,
    version: "matterhorn.customer.workflow.template.v1",
    status: "catalog_only",
    generatedAt: new Date(0).toISOString(),
    summary:
      "Customer-facing Matterhorn Work workflow templates for chat-first goal selection.",
    commands: {
      customerTemplates: "node scripts/matterhorn-workflow-catalog.mjs --customer-templates --json",
      customerTemplateFilter:
        "node scripts/matterhorn-workflow-catalog.mjs --customer-template bittensor_operator --json",
      registryGate: "pnpm test:matterhorn-workflow-template-registry",
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
      total: templates.length,
      byCategory: templates.reduce((acc, template) => {
        acc[template.category] = (acc[template.category] ?? 0) + 1;
        return acc;
      }, {}),
      byStatus: templates.reduce((acc, template) => {
        acc[template.status] = (acc[template.status] ?? 0) + 1;
        return acc;
      }, {}),
    },
    customerTemplates: templates,
    references: [
      "docs/matterhorn-workflow-contract.md",
      "packages/types/src/matterhorn-workflows.ts",
    ],
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
      "Safe, chat-first Matterhorn Work workflow catalog across Longevity, Bittensor, markets, decentralized services, and future verticals.",
    commands: {
      catalog: "matterhorn-work workflows catalog --json",
      workflowFilter: "matterhorn-work workflows catalog --workflow wellness_creator_workflow --include-prompts --json",
      categoryFilter: "matterhorn-work workflows catalog --category wellness --json",
      customerTemplates: "node scripts/matterhorn-workflow-catalog.mjs --customer-templates --json",
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
    customerTemplates: filterCustomerTemplates(config),
    references: [
      "docs/matterhorn-workflow-contract.md",
      "docs/wellness-creator-workflow.md",
      "docs/decentralized-services-capability-contract.md",
      "docs/agent-control-coverage-matrix.md",
    ],
  };
}

function buildPromptPack(config) {
  const workflows = filterWorkflows({ ...config, includePrompts: true }).map((workflow) => ({
    workflowId: workflow.workflowId,
    name: workflow.name,
    category: workflow.category,
    status: workflow.status,
    targetUserPersona: workflow.targetUserPersona,
    starterPrompt: workflow.canonicalPrompts[0] ?? "",
    prompts: workflow.canonicalPrompts.map((prompt, index) => ({
      step: index + 1,
      prompt,
    })),
    commands: workflow.commands,
    references: workflow.references,
    safety: {
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: false,
      liveExecutionEnabled: false,
      promptPackOnly: true,
      noProviderExecution: true,
    },
  }));
  return {
    ok: true,
    version: "matterhorn.workflow.prompt-pack.v1",
    status: "catalog_only",
    generatedAt: new Date(0).toISOString(),
    summary:
      "Copy-pasteable Matterhorn Work workflow prompts for agents and operators. Prompt packs do not execute provider actions.",
    safety: {
      ...COMMON_SAFETY,
      promptPackOnly: true,
      noProviderExecution: true,
      noCustody: true,
      noLiveMarketSubmit: true,
      plannedServicesOnly: true,
    },
    counts: {
      total: workflows.length,
      promptTotal: workflows.reduce((sum, workflow) => sum + workflow.prompts.length, 0),
    },
    workflows,
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

function printPromptPackText(promptPack) {
  process.stdout.write(`${promptPack.summary}\n\n`);
  process.stdout.write("Safety: prompt pack only; no custody; no provider execution; no market submission.\n\n");
  for (const workflow of promptPack.workflows) {
    process.stdout.write(`${workflow.name} (${workflow.workflowId})\n`);
    process.stdout.write(`  Persona: ${workflow.targetUserPersona}\n`);
    for (const prompt of workflow.prompts) {
      process.stdout.write(`  ${prompt.step}. ${prompt.prompt}\n`);
    }
    process.stdout.write("\n");
  }
}

function printCustomerTemplatesText(catalog) {
  process.stdout.write(`${catalog.summary}\n\n`);
  process.stdout.write("Safety: customer template catalog only; no custody; no provider execution; no market submission.\n\n");
  for (const template of catalog.customerTemplates) {
    process.stdout.write(`${template.name} (${template.id})\n`);
    process.stdout.write(`  Category: ${template.category}\n`);
    process.stdout.write(`  Status: ${template.status}\n`);
    process.stdout.write(`  Promise: ${template.promise}\n`);
    process.stdout.write(`  Chat mode: ${template.chatMode}\n`);
    process.stdout.write(`  Example prompts:\n`);
    for (const prompt of template.examplePrompts.slice(0, 3)) {
      process.stdout.write(`    - ${prompt}\n`);
    }
    process.stdout.write("\n");
  }
}

function printHelp() {
  process.stdout.write([
    "Matterhorn Work workflow catalog",
    "",
    "Usage:",
    "  node scripts/matterhorn-workflow-catalog.mjs [--json] [--include-prompts]",
    "  node scripts/matterhorn-workflow-catalog.mjs --prompt-pack --workflow wellness_creator_workflow --json",
    "  node scripts/matterhorn-workflow-catalog.mjs --workflow wellness_creator_workflow --json",
    "  node scripts/matterhorn-workflow-catalog.mjs --category wellness --json",
    "  node scripts/matterhorn-workflow-catalog.mjs --customer-templates --json",
    "  node scripts/matterhorn-workflow-catalog.mjs --customer-template bittensor_operator --json",
    "  matterhorn-work workflows catalog --json",
    "  matterhorn-work workflows prompts --workflow wellness_creator_workflow --json",
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
    let catalog;
    if (config.customerTemplates || config.customerTemplate) {
      catalog = buildCustomerTemplatesCatalog(config);
    } else {
      catalog = config.promptPack ? buildPromptPack(config) : buildCatalog(config);
    }
    if (config.json) {
      process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
    } else if (config.promptPack) {
      printPromptPackText(catalog);
    } else if (config.customerTemplates || config.customerTemplate) {
      printCustomerTemplatesText(catalog);
    } else {
      printText(catalog);
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
