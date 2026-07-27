import {
  MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE,
  MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY,
  MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS,
  type CustomerBetaDemoScenario,
  type MatterhornProtocolWorkspaceId,
  type MatterhornProtocolWorkspaceLaunchBehavior,
} from "@matterhorn-work/types/matterhorn-workflows";
import {
  LONGEVITY_PRIMARY_GOAL_OPTIONS,
  matterhornDeskAgentIdForDesk,
} from "@matterhorn-work/types/desk-agents";
import {
  getCustomerProtocolDeskVisual,
  protocolDeskIdForChatMode,
  protocolDeskIdForWorkspace,
  type CustomerProtocolDeskVisual,
} from "./protocol-desk-ui";

export type CustomerWorkflowIconHint =
  | "bittensor"
  | "hyperliquid"
  | "polymarket"
  | "sui"
  | "wellness"
  | "services"
  | "blank";

export type CustomerWorkflowTemplate = {
  id: string;
  name: string;
  summary: string;
  promise: string;
  category: "bittensor" | "markets" | "wellness" | "decentralized_services" | "future" | "web3";
  status: "live" | "beta_ready" | "preview_only" | "planned_not_live" | "workflow_ready" | "blank";
  examplePrompts: string[];
  launch: {
    primaryCta: string;
    secondaryCta: string;
    defaultPrompt: string;
    handoffContextLabel: string;
    recommendedSurface: "protocol_desk" | "workflow_chat" | "future_service";
  };
  ui: {
    iconHint: CustomerWorkflowIconHint;
    accent: "matterhorn_blue" | "neutral" | "caution";
    shortDescription: string;
  };
  routing: {
    chatMode: "bittensor" | "hyperliquid" | "polymarket" | "sui" | "wellness" | "services" | "general";
    opensPanel?: "bittensor" | "hyperliquid" | "polymarket" | "sui";
    startsSession: true;
  };
  safetyBoundaries: {
    acceptsSecrets: false;
    acceptsPrivateKeys: false;
    acceptsApiSecrets: false;
    acceptsRawSignatures: false;
    canSubmit: boolean;
    liveExecutionEnabled: boolean;
    canExecute: boolean;
    requiresExternalSigner: boolean;
    allowsRealFunds: boolean;
  };
  protocolWorkspace?: {
    id: MatterhornProtocolWorkspaceId;
    displayName: string;
    customerStatus: "live" | "beta_ready" | "preview_only" | "workflow_ready" | "planned_not_live";
    launchBehavior: MatterhornProtocolWorkspaceLaunchBehavior;
    primaryPanelRouteId: string;
    allowedIntents: string[];
    supportedCardKinds: string[];
    cliHint?: string;
    mcpHint?: string;
  };
  protocolDesk?: CustomerProtocolDeskVisual;
};

export type CustomerWorkflowStarterCard = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  agentId?: string;
  iconHint: CustomerWorkflowIconHint;
  panel?: "bittensor" | "hyperliquid" | "polymarket" | "sui";
  recommendedSurface: CustomerWorkflowTemplate["launch"]["recommendedSurface"];
  statusLabel: string;
  safetySummary: string;
  workspaceDisplayName?: string;
  launchBehavior?: MatterhornProtocolWorkspaceLaunchBehavior;
  protocolDesk?: CustomerProtocolDeskVisual;
};

export type CustomerBetaDemoStarterCard = {
  id: string;
  title: string;
  persona: string;
  customers: string;
  prompt: string;
  agentId?: string;
  iconHint: CustomerWorkflowIconHint;
  panel?: "bittensor" | "hyperliquid" | "polymarket" | "sui";
  statusLabel: string;
  safetySummary: string;
  protocolDesk?: CustomerProtocolDeskVisual;
  artifactSummary: string;
  evidenceCommand: string;
  mapsToCustomerTemplateId: string;
};

type CustomerWorkflowTemplateResponse = {
  ok?: boolean;
  version?: string;
  customerTemplates?: unknown[];
};

const MARKET_HANDOFF_SUFFIX =
  "Prepare exact order terms when asked. The Agent draft cannot submit. An eligible EOA BUY order can continue in the separate connected-wallet ticket after compliance passes and the user authorizes the exact order. Sell orders, proxy accounts, watches, and agents cannot submit. Matterhorn never signs or holds keys.";

const HYPERLIQUID_EXECUTION_SUFFIX =
  "Research and prepare an exact order draft, but never claim the Agent placed it. The user must review it in the separate trade ticket and authorize its short-lived intent with a connected wallet before Matterhorn submits it. Agents and watches cannot submit. Never request keys, raw signatures, or API secrets.";

const BITTENSOR_SUFFIX =
  "Use public wallet context only. TAO transfers can continue in the separate transfer ticket after exact review and connected Bittensor-wallet authorization. Staking, unstaking, delegation, and advanced calls remain external-signer previews. Do not ask for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.";

const SUI_SUFFIX =
  "Use public Sui account context only. Prepare non-custodial previews, and keep signing inside the user's Sui wallet or external client. Do not ask for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.";

const WELLNESS_SUFFIX =
  "Use the standalone Longevity workflow, not a Web3 or market desk. Keep this educational and client-safe. Include a non-medical disclaimer and do not diagnose, prescribe, or claim live payments, hosting, email, or token gating. Expected outputs should save under outputs/longevity/<session-slug>/.";

const LONGEVITY_WORKFLOW_STAGES =
  "Run this as a visible 7-stage workflow: 1. client/audience intake, 2. goals and constraints, 3. training, mobility, and yoga plan, 4. nutrition education plan, 5. weekly schedule and check-ins, 6. client artifacts and handouts, 7. service package and creator business handoff.";

const SERVICES_SUFFIX =
  "Treat service hooks as planned-not-live future contracts. Do not claim live hosting, storage, email, payment, identity, custody, or provider execution.";

const CUSTOMER_VISIBLE_TEMPLATE_IDS = new Set([
  "bittensor_operator",
  "hyperliquid_trader",
  "polymarket_researcher",
  "sui_wallet_workflow",
  "wellness_creator_workflow",
  "blank_chat_workflow",
]);

const CUSTOMER_VISIBLE_DEMO_TEMPLATE_IDS = new Set([
  "bittensor_operator",
  "hyperliquid_trader",
  "polymarket_researcher",
  "sui_wallet_workflow",
  "wellness_creator_workflow",
]);

const PANEL_BY_PROTOCOL_WORKSPACE: Partial<Record<MatterhornProtocolWorkspaceId, CustomerWorkflowTemplate["routing"]["opensPanel"]>> = {
  bittensor: "bittensor",
  hyperliquid: "hyperliquid",
  polymarket: "polymarket",
  sui: "sui",
};

const CHAT_MODE_BY_PROTOCOL_WORKSPACE: Record<MatterhornProtocolWorkspaceId, CustomerWorkflowTemplate["routing"]["chatMode"]> = {
  bittensor: "bittensor",
  hyperliquid: "hyperliquid",
  polymarket: "polymarket",
  sui: "sui",
  wellness: "wellness",
  decentralized_services: "services",
};

function statusLabel(status: CustomerWorkflowTemplate["status"] | undefined): string {
  switch (status) {
    case "live":
      return "Working";
    case "beta_ready":
      return "Read and preview";
    case "preview_only":
      return "Preview only";
    case "workflow_ready":
      return "Workflow-ready";
    case "planned_not_live":
      return "Planned, not live";
    case "blank":
      return "Chat";
    default:
      return "Available";
  }
}

function starterStatusLabel(template: CustomerWorkflowTemplate): string {
  if (template.status === "blank") {
    return "";
  }
  if (template.routing.chatMode === "services" && template.status === "planned_not_live") {
    return "Coming soon";
  }
  return statusLabel(template.status);
}

function starterCardStatusLabel(
  template: CustomerWorkflowTemplate,
  protocolDesk: CustomerProtocolDeskVisual | null,
): string {
  if (template.status === "workflow_ready" || protocolDesk?.status === "workflow_ready") {
    return "";
  }
  return protocolDesk?.statusLabel ?? starterStatusLabel(template);
}

function demoStatusLabel(status: CustomerBetaDemoScenario["status"]): string {
  switch (status) {
    case "demo_ready":
      return "Demo-ready";
    case "preview_only":
      return "Preview only";
    case "planned_not_live":
      return "Planned, not live";
    default:
      return "Available";
  }
}

function safetySummary(template: CustomerWorkflowTemplate): string {
  if (template.routing.chatMode === "bittensor") {
    return "TAO transfers require exact connected-wallet review. Staking and advanced calls stay external-signer previews. No secrets.";
  }
  if (template.routing.chatMode === "hyperliquid") {
    return "Read and preview tasks with external-client handoff.";
  }
  if (template.routing.chatMode === "polymarket") {
    return "Market research and compliance checks with external-wallet handoff.";
  }
  if (template.routing.chatMode === "sui") {
    return "Wallet signing stays in your Sui wallet. Matterhorn stores previews and public receipts only.";
  }
  if (template.routing.chatMode === "wellness") {
    return "Standalone business workflow. Not Web3, not markets, no medical advice, and no live payments/email/hosting.";
  }
  if (template.routing.chatMode === "services") {
    return "Future-contract planning only. No provider execution or credentials.";
  }
  return "Matterhorn Desks never needs secrets in starter prompts.";
}

function buildCustomerWorkflowPromptFromText(template: CustomerWorkflowTemplate, prompt: string): string {
  const intentContext = template.protocolWorkspace?.allowedIntents.length
    ? `Allowed workspace intents: ${template.protocolWorkspace.allowedIntents.join(", ")}.`
    : "";
  switch (template.routing.chatMode) {
    case "bittensor":
      return `Bittensor task: ${prompt}. Scope: TAO, SS58 public addresses, coldkeys, hotkeys, subnets, validators, wallet reads, staking previews, watches, and receipts. ${BITTENSOR_SUFFIX} ${intentContext}`.trim();
    case "hyperliquid":
      return `Hyperliquid task: ${prompt}. Scope: markets, orderbooks, account exposure, funding, open orders, order previews, watches, and receipts. ${HYPERLIQUID_EXECUTION_SUFFIX} ${intentContext}`.trim();
    case "polymarket":
      return `Polymarket task: ${prompt}. Scope: market discovery, outcomes, probabilities, liquidity, compliance checks, external trade handoffs, watches, and receipts. ${MARKET_HANDOFF_SUFFIX} ${intentContext}`.trim();
    case "sui":
      return `Sui task: ${prompt}. Scope: Sui public addresses, wallet-standard account reads, balance reads, transfer previews, wallet signing handoffs, public transaction digests, explorer links, and receipt evidence. ${SUI_SUFFIX} ${intentContext}`.trim();
    case "wellness": {
      const task = /build the full 7-stage longevity workflow/i.test(prompt)
        ? "Start the Longevity workflow for my clients"
        : prompt.replace(/\.+$/, "");
      const goalChoices = LONGEVITY_PRIMARY_GOAL_OPTIONS.map((option) => option.label).join(", ");
      return `${task}. Ask me for missing audience, goal, constraints, schedule, and output details before creating the workflow. When asking Program Goal, include these distinct choices: ${goalChoices}. Allow a custom goal.`;
    }
    case "services":
      return `${prompt}. ${SERVICES_SUFFIX} ${intentContext}`.trim();
    default:
      return prompt;
  }
}

function enrichCustomerWorkflowTemplate(template: CustomerWorkflowTemplate): CustomerWorkflowTemplate {
  const workspaceId = MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE[template.id] as MatterhornProtocolWorkspaceId | undefined;
  if (!workspaceId) return template;
  const manifest = MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY[workspaceId];
  if (!manifest) return template;
  const opensPanel = PANEL_BY_PROTOCOL_WORKSPACE[workspaceId];
  const protocolDesk = getCustomerProtocolDeskVisual(protocolDeskIdForWorkspace(workspaceId));
  return {
    ...template,
    category: manifest.category,
    status: manifest.customerStatus,
    launch: {
      ...template.launch,
      defaultPrompt: manifest.demoPrompt || template.launch.defaultPrompt,
      recommendedSurface:
        manifest.launchBehavior === "opens_desk"
          ? "protocol_desk"
          : manifest.launchBehavior === "planned_not_live"
            ? "future_service"
            : "workflow_chat",
    },
    routing: {
      ...template.routing,
      chatMode: CHAT_MODE_BY_PROTOCOL_WORKSPACE[workspaceId],
      opensPanel,
    },
    safetyBoundaries: {
      ...manifest.safetyBoundaries,
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: manifest.safetyBoundaries.canSubmit,
      liveExecutionEnabled: manifest.safetyBoundaries.liveExecutionEnabled,
      allowsRealFunds: manifest.safetyBoundaries.allowsRealFunds,
    },
    protocolWorkspace: {
      id: manifest.id,
      displayName: manifest.displayName,
      customerStatus: manifest.customerStatus,
      launchBehavior: manifest.launchBehavior,
      primaryPanelRouteId: manifest.primaryPanelRouteId,
      allowedIntents: manifest.allowedIntents,
      supportedCardKinds: manifest.supportedCardKinds,
      cliHint: manifest.mcpCliHints.cli,
      mcpHint: manifest.mcpCliHints.mcp,
    },
    protocolDesk: protocolDesk ?? template.protocolDesk,
  };
}

const RAW_FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES: CustomerWorkflowTemplate[] = [
  {
    id: "bittensor_operator",
    name: "Use Bittensor",
    summary: "Read TAO and subnet context, compare validators, and prepare reviewed Bittensor transactions.",
    promise: "TAO transfers can be authorized in a connected Bittensor wallet. Staking and advanced calls remain external handoffs.",
    category: "bittensor",
    status: "beta_ready",
    examplePrompts: ["Show my TAO", "Which subnet is useful for image generation?", "Compare validators on subnet 14"],
    launch: {
      primaryCta: "Open Bittensor desk",
      secondaryCta: "Preview a stake handoff",
      defaultPrompt: "Show my TAO",
      handoffContextLabel: "Public wallet address",
      recommendedSurface: "protocol_desk",
    },
    ui: {
      iconHint: "bittensor",
      accent: "matterhorn_blue",
      shortDescription: "Read TAO and subnet context, compare validators, and review wallet-approved transfers.",
    },
    routing: { chatMode: "bittensor", opensPanel: "bittensor", startsSession: true },
    safetyBoundaries: {
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: true,
      liveExecutionEnabled: true,
      canExecute: true,
      requiresExternalSigner: false,
      allowsRealFunds: true,
    },
  },
  {
    id: "hyperliquid_trader",
    name: "Use Hyperliquid",
    summary: "Read Hyperliquid markets, check exposure, and prepare perpetual order previews.",
    promise: "Prepare exact orders here, then review and authorize submission in the separate connected-wallet ticket.",
    category: "markets",
    status: "beta_ready",
    examplePrompts: ["Preview a Hyperliquid BTC-PERP order", "Show my Hyperliquid exposure"],
    launch: {
      primaryCta: "Open Hyperliquid desk",
      secondaryCta: "Prepare preview",
      defaultPrompt: "Preview a Hyperliquid BTC-PERP order",
      handoffContextLabel: "Public wallet address",
      recommendedSurface: "protocol_desk",
    },
    ui: {
      iconHint: "hyperliquid",
      accent: "matterhorn_blue",
      shortDescription: "Read markets, review exposure, and authorize exact wallet-approved orders.",
    },
    routing: { chatMode: "hyperliquid", opensPanel: "hyperliquid", startsSession: true },
    safetyBoundaries: {
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: true,
      liveExecutionEnabled: true,
      canExecute: true,
      requiresExternalSigner: false,
      allowsRealFunds: true,
    },
  },
  {
    id: "polymarket_researcher",
    name: "Use Polymarket",
    summary: "Research Polymarket outcomes, liquidity, and eligibility before preparing exact trade terms.",
    promise: "Eligible EOA BUY orders can be authorized in a connected Polygon wallet after compliance passes.",
    category: "markets",
    status: "preview_only",
    examplePrompts: ["Summarize this Polymarket market", "Check Polymarket compliance"],
    launch: {
      primaryCta: "Open Polymarket desk",
      secondaryCta: "Prepare handoff",
      defaultPrompt: "Summarize this Polymarket market",
      handoffContextLabel: "Public wallet address",
      recommendedSurface: "protocol_desk",
    },
    ui: {
      iconHint: "polymarket",
      accent: "matterhorn_blue",
      shortDescription: "Research markets and compliance, then review eligible wallet-approved BUY orders.",
    },
    routing: { chatMode: "polymarket", opensPanel: "polymarket", startsSession: true },
    safetyBoundaries: {
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: true,
      liveExecutionEnabled: true,
      canExecute: true,
      requiresExternalSigner: false,
      allowsRealFunds: true,
    },
  },
  {
    id: "sui_wallet_workflow",
    name: "Use Sui",
    summary: "Read public Sui account context, prepare transfer previews, and save public transaction receipts.",
    promise: "Sui signing stays in your wallet. Matterhorn never asks for seed phrases, private keys, raw signatures, signed payloads, or wallet exports.",
    category: "web3",
    status: "preview_only",
    examplePrompts: ["Show my Sui wallet", "Prepare a Sui transfer preview", "Import a Sui transaction receipt"],
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
      shortDescription: "Read Sui accounts, prepare transfer previews, and import public receipts. Signing stays in your wallet.",
    },
    routing: { chatMode: "sui", opensPanel: "sui", startsSession: true },
    safetyBoundaries: {
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: false,
      liveExecutionEnabled: false,
      canExecute: false,
      requiresExternalSigner: false,
      allowsRealFunds: false,
    },
  },
  {
    id: "wellness_creator_workflow",
    name: "Build a Longevity Creator service workflow",
    summary: "Build a 7-stage offline Longevity workflow for human optimization: intake, goals, movement, nutrition education, schedule, handouts, and service packaging.",
    promise: "Offline human-optimization workflow. No medical advice, diagnosis, prescriptions, Web3 trading, or live payment/email/hosting claims. Outputs go under outputs/longevity/<session-slug>/; payment/email/hosting hooks stay planned-not-live.",
    category: "wellness",
    status: "workflow_ready",
    examplePrompts: [
      "Build the full 7-stage Longevity workflow for my clients",
      "Stage 1: run a client intake and redacted goals summary",
      "Stage 2: define goals, constraints, and non-medical boundaries",
      "Stage 3: draft a training, mobility, or yoga plan",
      "Stage 4: build a nutrition education plan without prescribing",
      "Stage 5: create a weekly schedule and check-in workflow",
      "Stage 6: generate client handouts, FAQ, and a progress tracker",
      "Stage 7: package the service with offer copy, tiers, and disclaimers",
      "Create a client onboarding questionnaire, weekly check-in workflow, and handout packet",
    ],
    launch: {
      primaryCta: "Start Longevity workflow",
      secondaryCta: "Plan a service",
      defaultPrompt: "Start a Longevity workflow for my clients",
      handoffContextLabel: "Audience and goal",
      recommendedSurface: "workflow_chat",
    },
    ui: {
      iconHint: "wellness",
      accent: "neutral",
      shortDescription: "Intake, goals, training, nutrition education, schedule, handouts, and service packaging.",
    },
    routing: { chatMode: "wellness", startsSession: true },
    safetyBoundaries: {
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: false,
      liveExecutionEnabled: false,
      canExecute: false,
      requiresExternalSigner: false,
      allowsRealFunds: false,
    },
  },
  {
    id: "decentralized_services_operator",
    name: "Explore future decentralized services",
    summary: "Plan future decentralized service actions across storage, hosting, email, payments, and identity.",
    promise: "Future-contract planning only. No live provider execution.",
    category: "decentralized_services",
    status: "planned_not_live",
    examplePrompts: ["Plan a decentralized storage upload", "Compare provider fixtures for hosting"],
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
      shortDescription: "Plan future decentralized services across storage, hosting, email, payments, and identity.",
    },
    routing: { chatMode: "services", startsSession: true },
    safetyBoundaries: {
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: false,
      liveExecutionEnabled: false,
      canExecute: false,
      requiresExternalSigner: false,
      allowsRealFunds: false,
    },
  },
  {
    id: "blank_chat_workflow",
    name: "Chat",
    summary: "Start a flexible session with the default Matterhorn Agent.",
    promise: "Open-ended assistance. You choose the goal.",
    category: "future",
    status: "blank",
    examplePrompts: ["What can you do?"],
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
      shortDescription: "Start a flexible chat with the default Matterhorn Agent.",
    },
    routing: { chatMode: "general", startsSession: true },
    safetyBoundaries: {
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: false,
      liveExecutionEnabled: false,
      canExecute: false,
      requiresExternalSigner: false,
      allowsRealFunds: false,
    },
  },
];

export const FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES: CustomerWorkflowTemplate[] =
  RAW_FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES.map(enrichCustomerWorkflowTemplate);

function isTemplate(value: unknown): value is CustomerWorkflowTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as CustomerWorkflowTemplate;
  return (
    typeof template.id === "string" &&
    typeof template.name === "string" &&
    typeof template.launch?.defaultPrompt === "string" &&
    typeof template.ui?.iconHint === "string" &&
    typeof template.routing?.chatMode === "string" &&
    template.safetyBoundaries?.acceptsSecrets === false &&
    template.safetyBoundaries?.liveExecutionEnabled === false &&
    template.safetyBoundaries?.canSubmit === false
  );
}

export function normalizeCustomerWorkflowTemplates(input: CustomerWorkflowTemplateResponse): CustomerWorkflowTemplate[] {
  const templates = Array.isArray(input.customerTemplates)
    ? input.customerTemplates.filter(isTemplate)
    : [];
  return (templates.length ? templates.map(enrichCustomerWorkflowTemplate) : FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES)
    .map(normalizeWorkflowTemplateCopy);
}

function normalizeWorkflowTemplateCopy(template: CustomerWorkflowTemplate): CustomerWorkflowTemplate {
  if (template.id !== "blank_chat_workflow") return template;

  return {
    ...template,
    name: "Chat",
    summary: "Start a flexible session with the default Matterhorn Agent.",
    launch: {
      ...template.launch,
      primaryCta: "Start chat",
    },
    ui: {
      ...template.ui,
      shortDescription: "Start a flexible chat with the default Matterhorn Agent.",
    },
  };
}

export async function fetchCustomerWorkflowTemplates(): Promise<CustomerWorkflowTemplate[]> {
  const response = await fetch("/api/workflows/templates");
  if (!response.ok) throw new Error(`Could not load workflow templates (${response.status})`);
  const json = await response.json() as CustomerWorkflowTemplateResponse;
  return normalizeCustomerWorkflowTemplates(json);
}

export function buildCustomerWorkflowPrompt(template: CustomerWorkflowTemplate): string {
  const prompt = template.launch.defaultPrompt || template.examplePrompts[0] || template.name;
  return buildCustomerWorkflowPromptFromText(template, prompt);
}

export function buildCustomerWorkflowStarterCards(
  templates: CustomerWorkflowTemplate[] = FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES,
): CustomerWorkflowStarterCard[] {
  return templates.filter((template) => CUSTOMER_VISIBLE_TEMPLATE_IDS.has(template.id)).map((template) => {
    const protocolDesk =
      template.protocolDesk ??
      getCustomerProtocolDeskVisual(protocolDeskIdForChatMode(template.routing.chatMode));
    return {
      id: template.id,
      title: template.launch.primaryCta || template.name,
      description: protocolDesk?.shortDescription ?? template.ui.shortDescription ?? template.summary,
      prompt: buildCustomerWorkflowPrompt(template),
      agentId: matterhornDeskAgentIdForDesk(protocolDesk?.id ?? protocolDeskIdForChatMode(template.routing.chatMode)),
      iconHint: template.ui.iconHint,
      panel: template.routing.opensPanel,
      recommendedSurface: template.launch.recommendedSurface,
      statusLabel: starterCardStatusLabel(template, protocolDesk),
      safetySummary: protocolDesk?.safetySummary ?? safetySummary(template),
      workspaceDisplayName: protocolDesk?.displayName ?? template.protocolWorkspace?.displayName,
      launchBehavior: template.protocolWorkspace?.launchBehavior,
      protocolDesk: protocolDesk ?? undefined,
    };
  });
}

export function buildCustomerBetaDemoStarterCards(
  templates: CustomerWorkflowTemplate[] = FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES,
): CustomerBetaDemoStarterCard[] {
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  return Object.values(MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS)
    .filter((scenario) => CUSTOMER_VISIBLE_DEMO_TEMPLATE_IDS.has(scenario.mapsToCustomerTemplateId))
    .map((scenario) => {
    const template =
      templatesById.get(scenario.mapsToCustomerTemplateId) ??
      FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES.find((item) => item.id === scenario.mapsToCustomerTemplateId) ??
      FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES.find((item) => item.id === "blank_chat_workflow")!;

    const artifactNames = scenario.expectedArtifacts
      .slice(0, 3)
      .map((artifact) => artifact.name)
      .join(", ");

    return {
      id: scenario.id,
      title: scenario.displayName,
      persona: scenario.targetCustomerPersona,
      customers: scenario.assignedBetaCustomers.join(", "),
      prompt: buildCustomerWorkflowPromptFromText(template, scenario.entryPrompt),
      agentId: matterhornDeskAgentIdForDesk(template.protocolDesk?.id ?? protocolDeskIdForChatMode(template.routing.chatMode)),
      iconHint: template.ui.iconHint,
      panel: template.routing.opensPanel,
      statusLabel: template.protocolDesk?.statusLabel ?? demoStatusLabel(scenario.status),
      safetySummary: template.protocolDesk?.safetySummary ?? safetySummary(template),
      protocolDesk: template.protocolDesk,
      artifactSummary: artifactNames,
      evidenceCommand: `node scripts/customer-demo-evidence-pack.mjs --scenario ${scenario.id} --output-dir ./tmp/monday-beta-evidence`,
      mapsToCustomerTemplateId: scenario.mapsToCustomerTemplateId,
    };
  });
}
