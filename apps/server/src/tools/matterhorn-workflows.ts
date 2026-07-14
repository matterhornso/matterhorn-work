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

export type MatterhornWorkflowPromptPack = {
  ok: true;
  version: "matterhorn.workflow.prompt-pack.v1";
  status: "catalog_only";
  generatedAt: string;
  source: "matterhorn_server_workflow_catalog";
  summary: string;
  safety: {
    acceptsSecrets: false;
    acceptsPrivateKeys: false;
    acceptsApiSecrets: false;
    acceptsRawSignatures: false;
    canSubmit: false;
    liveExecutionEnabled: false;
    promptPackOnly: true;
    noProviderExecution: true;
    noCustody: true;
    noLiveMarketSubmit: true;
    plannedServicesOnly: true;
  };
  counts: {
    total: number;
    promptTotal: number;
  };
  workflows: Array<{
    workflowId: string;
    name: string;
    category: MatterhornWorkflowCatalogItem["category"];
    status: MatterhornWorkflowCatalogItem["status"];
    targetUserPersona: string;
    starterPrompt: string;
    prompts: Array<{ step: number; prompt: string }>;
    commands: Record<string, string>;
    references: string[];
    safety: {
      acceptsSecrets: false;
      acceptsPrivateKeys: false;
      acceptsApiSecrets: false;
      acceptsRawSignatures: false;
      canSubmit: false;
      liveExecutionEnabled: false;
      promptPackOnly: true;
      noProviderExecution: true;
    };
  }>;
};

type MatterhornCustomerWorkflowCategory =
  | "bittensor"
  | "markets"
  | "web3"
  | "wellness"
  | "decentralized_services"
  | "future";

type MatterhornCustomerWorkflowStatus =
  | "beta_ready"
  | "preview_only"
  | "planned_not_live"
  | "workflow_ready"
  | "blank";

type MatterhornCustomerWorkflowTemplate = {
  id: string;
  name: string;
  summary: string;
  promise: string;
  category: MatterhornCustomerWorkflowCategory;
  examplePrompts: string[];
  expectedArtifacts: Array<{ id: string; name: string; mimeType: string; public: true }>;
  requiredContext: Array<{
    id: string;
    label: string;
    required: boolean;
    type: string;
    helpText?: string;
    options?: string[];
  }>;
  optionalContext: Array<{
    id: string;
    label: string;
    required: boolean;
    type: string;
    helpText?: string;
    options?: string[];
  }>;
  status: MatterhornCustomerWorkflowStatus;
  safetyBoundaries: {
    acceptsSecrets: false;
    acceptsPrivateKeys: false;
    acceptsApiSecrets: false;
    acceptsRawSignatures: false;
    canSubmit: false;
    liveExecutionEnabled: false;
    canExecute: boolean;
    requiresExternalSigner: boolean;
    allowsRealFunds: false;
  };
  forbiddenInputs: string[];
  handoffReceiptSupport: {
    supported: boolean;
    types?: string[];
    description?: string;
  };
  serviceHooks: Array<{ hook: string; status: string }>;
  chatMode: string;
  launch: {
    primaryCta: string;
    secondaryCta: string;
    defaultPrompt: string;
    handoffContextLabel: string;
    recommendedSurface: "protocol_desk" | "workflow_chat" | "future_service";
  };
  ui: {
    iconHint: "bittensor" | "hyperliquid" | "polymarket" | "sui" | "wellness" | "services" | "blank";
    accent: "matterhorn_blue" | "neutral" | "caution";
    shortDescription: string;
  };
  routing: {
    chatMode: "bittensor" | "hyperliquid" | "polymarket" | "sui" | "wellness" | "services" | "general";
    opensPanel?: "bittensor" | "hyperliquid" | "polymarket" | "sui";
    startsSession: true;
  };
  recommendedCommands?: {
    cli?: string[];
    mcp?: string[];
  };
};

export type MatterhornCustomerWorkflowTemplateFilter = {
  customerTemplate?: string | null;
  category?: string | null;
  status?: string | null;
};

export type MatterhornCustomerWorkflowTemplateCatalog = {
  ok: true;
  version: "matterhorn.customer.workflow.template.v1";
  status: "catalog_only";
  generatedAt: string;
  source: "matterhorn_server_customer_workflow_templates";
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
  customerTemplates: MatterhornCustomerWorkflowTemplate[];
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
  "Stage 1 — Intake: capture audience, level, constraints, public context, and redacted client goals. When asking Program Goal, include Improve VO2 max and Train for endurance as separate options alongside body composition, strength, mobility, and general wellness. Allow a custom goal. Output: intake_summary.md",
  "Stage 2 — Goals & constraints: define outcomes, duration, equipment, schedule limits, and non-medical boundaries. Preserve VO2 max and endurance as distinct training outcomes when selected. Output: goals_constraints.md",
  "Stage 3 — Movement plan: draft educational training, mobility, or yoga sessions by level and available equipment. Output: program_design_plan.md",
  "Stage 4 — Nutrition education: build general habits, grocery ideas, and meal structure without prescribing. Output: nutrition_education_plan.md",
  "Stage 5 — Weekly schedule & check-ins: build the weekly calendar, check-in cadence, review questions, and progress tracker. Output: weekly_schedule.md + progress_tracker.md",
  "Stage 6 — Client artifacts & handouts: generate onboarding, weekly plan, video script, checklist, FAQ. Output: client_handout_packet.md",
  "Stage 7 — Service package & creator handoff: draft offer copy, package tiers, terms/disclaimer, follow-up, feedback, and renewal prompts. Output: pricing_package_draft.md + offer_page_copy.md",
];

const WORKFLOWS: MatterhornWorkflowCatalogItem[] = [
  {
    workflowId: "wellness_creator_workflow",
    name: "Longevity Creator Workflow",
    category: "wellness",
    status: "live_local",
    source: "offline_helper",
    targetUserPersona: "personal trainer, gym instructor, yoga instructor, or dietician",
    summary:
      "Runs a seven-stage offline Longevity workflow for human optimization: intake, goals, movement, nutrition education, weekly check-ins, client artifacts, and service packaging. Generated artifacts should be saved under outputs/longevity/<session-slug>/.",
    localArtifactsAvailable: true,
    canExecuteLocalWorkflow: true,
    canExecuteProviderActions: false,
    canonicalPrompts: WELLNESS_PROMPTS,
    generatedArtifacts: [
      "intake_summary",
      "goals_constraints",
      "program_design_plan",
      "nutrition_education_plan",
      "weekly_schedule",
      "client_handout_packet",
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

const CUSTOMER_TEMPLATES: MatterhornCustomerWorkflowTemplate[] = [
  {
    id: "bittensor_operator",
    name: "Use Bittensor",
    summary: "Read TAO balances, compare subnets and validators, and prepare external-signer staking handoffs.",
    promise: "You stay non-custodial. Matterhorn never holds your private key or submits a transaction.",
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
      shortDescription: "Read TAO balances and prepare external-signer staking handoffs.",
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
    summary: "Preview Hyperliquid orders, check positions, and generate external-signer handoffs without live submission.",
    promise: "Preview-only. No live submission, no custody, and no signing by Matterhorn.",
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
      requiresExternalSigner: false,
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
      secondaryCta: "Preview a trade",
      defaultPrompt: "Preview a Hyperliquid BTC-PERP trade",
      handoffContextLabel: "Public wallet address",
      recommendedSurface: "protocol_desk",
    },
    ui: {
      iconHint: "hyperliquid",
      accent: "matterhorn_blue",
      shortDescription: "Preview Hyperliquid trades and generate external-signer handoffs.",
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
    examplePrompts: ["Summarize this Polymarket market", "Preview a Polymarket trade", "Show my Polymarket positions"],
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
      shortDescription: "Research Polymarket markets and prepare signing handoffs.",
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
    summary: "Build a 7-stage offline Longevity workflow covering intake, goals, training, nutrition education, schedule, client handouts, and service packaging.",
    promise:
      "Plan your longevity business. No medical advice. Service hooks remain planned-not-live until you connect providers.",
    category: "wellness",
    examplePrompts: [
      "Build the full 7-stage Longevity workflow for my clients",
      "Create intake, goals, training, nutrition education, schedule, handouts, and service package",
      "Create a client onboarding questionnaire, weekly check-in workflow, and handout packet",
      "Package my longevity service with offer copy, tiers, disclaimer, and renewal prompts",
    ],
    expectedArtifacts: [
      { id: "intake_summary", name: "Intake Summary", mimeType: "text/markdown", public: true },
      { id: "goals_constraints", name: "Goals and Constraints", mimeType: "text/markdown", public: true },
      { id: "program_design_plan", name: "Program Design Plan", mimeType: "text/markdown", public: true },
      { id: "nutrition_education_plan", name: "Nutrition Education Plan", mimeType: "text/markdown", public: true },
      { id: "weekly_schedule", name: "Weekly Schedule", mimeType: "text/markdown", public: true },
      { id: "client_handout_packet", name: "Client Handout Packet", mimeType: "text/markdown", public: true },
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
    forbiddenInputs: ["medical diagnosis", "prescription advice", "protected health information beyond redacted goals"],
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
      defaultPrompt: "Build the full 7-stage Longevity workflow for my clients",
      handoffContextLabel: "Audience and goal",
      recommendedSurface: "workflow_chat",
    },
    ui: {
      iconHint: "wellness",
      accent: "neutral",
      shortDescription: "Intake, goals, training, nutrition education, schedule, handouts, and service packaging.",
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
    summary: "Plan future decentralized service actions across storage, hosting, email, payments, and identity.",
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
    optionalContext: [{ id: "provider_preference", label: "Preferred provider fixture", required: false, type: "text" }],
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
    summary: "Start a flexible chat session with the Matterhorn Work engine.",
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
      shortDescription: "Start a flexible chat with the Matterhorn Work engine.",
    },
    routing: {
      chatMode: "general",
      startsSession: true,
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

function filterWorkflows(input: MatterhornWorkflowCatalogFilter = {}): MatterhornWorkflowCatalogItem[] {
  const workflowFilter = parseFilter(input.workflow);
  const categoryFilter = parseFilter(input.category);
  const statusFilter = parseFilter(input.status);
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

  return workflows;
}

function filterCustomerTemplates(
  input: MatterhornCustomerWorkflowTemplateFilter = {},
): MatterhornCustomerWorkflowTemplate[] {
  const customerTemplateFilter = parseFilter(input.customerTemplate);
  const categoryFilter = parseFilter(input.category);
  const statusFilter = parseFilter(input.status);
  let templates = CUSTOMER_TEMPLATES;

  if (customerTemplateFilter) {
    templates = templates.filter((template) => template.id === customerTemplateFilter);
    if (templates.length === 0) throw new Error(`Unknown customer workflow template: ${customerTemplateFilter}`);
  }
  if (categoryFilter) {
    templates = templates.filter((template) => template.category === categoryFilter);
    if (templates.length === 0) throw new Error(`No customer workflow templates found for category: ${categoryFilter}`);
  }
  if (statusFilter) {
    templates = templates.filter((template) => template.status === statusFilter);
    if (templates.length === 0) throw new Error(`No customer workflow templates found for status: ${statusFilter}`);
  }

  return templates;
}

export function buildMatterhornWorkflowCatalog(input: MatterhornWorkflowCatalogFilter = {}): MatterhornWorkflowCatalog {
  const includePrompts = input.includePrompts === true;
  const workflows = filterWorkflows(input);
  const outputWorkflows = workflows.map((workflow) => workflowForOutput(workflow, includePrompts));

  return {
    ok: true,
    version: "matterhorn.workflow.catalog.v1",
    status: "catalog_only",
    generatedAt: new Date(0).toISOString(),
    source: "matterhorn_server_workflow_catalog",
    summary:
      "Safe, chat-first Matterhorn Work workflow catalog across longevity, Bittensor, markets, decentralized services, and future verticals.",
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

export function buildMatterhornCustomerWorkflowTemplates(
  input: MatterhornCustomerWorkflowTemplateFilter = {},
): MatterhornCustomerWorkflowTemplateCatalog {
  const customerTemplates = filterCustomerTemplates(input);
  return {
    ok: true,
    version: "matterhorn.customer.workflow.template.v1",
    status: "catalog_only",
    generatedAt: new Date(0).toISOString(),
    source: "matterhorn_server_customer_workflow_templates",
    summary: "Customer-facing Matterhorn Work workflow templates for chat-first goal selection.",
    commands: {
      customerTemplates: "matterhorn-work workflows templates --json",
      customerTemplateFilter: "matterhorn-work workflows templates --customer-template bittensor_operator --json",
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
      total: customerTemplates.length,
      byCategory: customerTemplates.reduce<Record<string, number>>((acc, template) => {
        acc[template.category] = (acc[template.category] ?? 0) + 1;
        return acc;
      }, {}),
      byStatus: customerTemplates.reduce<Record<string, number>>((acc, template) => {
        acc[template.status] = (acc[template.status] ?? 0) + 1;
        return acc;
      }, {}),
    },
    customerTemplates,
    references: ["docs/matterhorn-workflow-contract.md", "packages/types/src/matterhorn-workflows.ts"],
  };
}

export function buildMatterhornWorkflowPromptPack(
  input: MatterhornWorkflowCatalogFilter = {},
): MatterhornWorkflowPromptPack {
  const workflows = filterWorkflows(input).map((workflow) => ({
    workflowId: workflow.workflowId,
    name: workflow.name,
    category: workflow.category,
    status: workflow.status,
    targetUserPersona: workflow.targetUserPersona,
    starterPrompt: workflow.canonicalPrompts[0] ?? "",
    prompts: workflow.canonicalPrompts.map((prompt, index) => ({ step: index + 1, prompt })),
    commands: workflow.commands,
    references: workflow.references,
    safety: {
      ...COMMON_SAFETY,
      promptPackOnly: true as const,
      noProviderExecution: true as const,
    },
  }));

  return {
    ok: true,
    version: "matterhorn.workflow.prompt-pack.v1",
    status: "catalog_only",
    generatedAt: new Date(0).toISOString(),
    source: "matterhorn_server_workflow_catalog",
    summary:
      "Copy-pasteable Matterhorn Work workflow prompts for agents and operators. Prompt packs do not execute provider actions.",
    safety: {
      ...COMMON_SAFETY,
      promptPackOnly: true as const,
      noProviderExecution: true as const,
      noCustody: true as const,
      noLiveMarketSubmit: true as const,
      plannedServicesOnly: true as const,
    },
    counts: {
      total: workflows.length,
      promptTotal: workflows.reduce((sum, workflow) => sum + workflow.prompts.length, 0),
    },
    workflows,
  };
}
