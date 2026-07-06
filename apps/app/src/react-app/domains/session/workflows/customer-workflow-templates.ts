import {
  MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE,
  MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY,
  MONDAY_BETA_CUSTOMER_DEMO_SCENARIOS,
  type CustomerBetaDemoScenario,
  type MatterhornProtocolWorkspaceId,
  type MatterhornProtocolWorkspaceLaunchBehavior,
} from "@matterhorn-work/types/matterhorn-workflows";
import { matterhornDeskAgentIdForDesk } from "@matterhorn-work/types/desk-agents";
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
  | "wellness"
  | "services"
  | "blank";

export type CustomerWorkflowTemplate = {
  id: string;
  name: string;
  summary: string;
  promise: string;
  category: "bittensor" | "markets" | "wellness" | "decentralized_services" | "future" | "web3";
  status: "beta_ready" | "preview_only" | "planned_not_live" | "workflow_ready" | "blank";
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
    chatMode: "bittensor" | "hyperliquid" | "polymarket" | "wellness" | "services" | "general";
    opensPanel?: "bittensor" | "hyperliquid" | "polymarket";
    startsSession: true;
  };
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
  protocolWorkspace?: {
    id: MatterhornProtocolWorkspaceId;
    displayName: string;
    customerStatus: "beta_ready" | "preview_only" | "workflow_ready" | "planned_not_live";
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
  panel?: "bittensor" | "hyperliquid" | "polymarket";
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
  panel?: "bittensor" | "hyperliquid" | "polymarket";
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
  "Prepare an external trade handoff when asked. Make clear: Can submit: No, Live submission: Off, the user executes in their own external client, and Matterhorn never signs or holds keys.";

const BITTENSOR_SUFFIX =
  "Use public wallet context only. Do not ask for seed phrases, private keys, mnemonics, raw signatures, signed payloads, or wallet exports.";

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
  "wellness_creator_workflow",
  "blank_chat_workflow",
]);

const CUSTOMER_VISIBLE_DEMO_TEMPLATE_IDS = new Set([
  "bittensor_operator",
  "hyperliquid_trader",
  "polymarket_researcher",
  "wellness_creator_workflow",
]);

const PANEL_BY_PROTOCOL_WORKSPACE: Partial<Record<MatterhornProtocolWorkspaceId, CustomerWorkflowTemplate["routing"]["opensPanel"]>> = {
  bittensor: "bittensor",
  hyperliquid: "hyperliquid",
  polymarket: "polymarket",
};

const CHAT_MODE_BY_PROTOCOL_WORKSPACE: Record<MatterhornProtocolWorkspaceId, CustomerWorkflowTemplate["routing"]["chatMode"]> = {
  bittensor: "bittensor",
  hyperliquid: "hyperliquid",
  polymarket: "polymarket",
  wellness: "wellness",
  decentralized_services: "services",
};

function statusLabel(status: CustomerWorkflowTemplate["status"] | undefined): string {
  switch (status) {
    case "beta_ready":
      return "Beta-ready";
    case "preview_only":
      return "Preview only";
    case "workflow_ready":
      return "Workflow-ready";
    case "planned_not_live":
      return "Planned, not live";
    case "blank":
      return "Blank chat";
    default:
      return "Available";
  }
}

function starterStatusLabel(template: CustomerWorkflowTemplate): string {
  if (template.routing.chatMode === "services" && template.status === "planned_not_live") {
    return "Coming soon";
  }
  return statusLabel(template.status);
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
    return template.safetyBoundaries.requiresExternalSigner
      ? "External signer required. No seed phrases, private keys, or wallet exports."
      : "Public reads only. No secrets.";
  }
  if (template.routing.chatMode === "hyperliquid") {
    return "Read and preview tasks with external-client handoff.";
  }
  if (template.routing.chatMode === "polymarket") {
    return "Market research and compliance checks with external-wallet handoff.";
  }
  if (template.routing.chatMode === "wellness") {
    return "Standalone business workflow. Not Web3, not markets, no medical advice, and no live payments/email/hosting.";
  }
  if (template.routing.chatMode === "services") {
    return "Future-contract planning only. No provider execution or credentials.";
  }
  return "Matterhorn Work never needs secrets in starter prompts.";
}

function buildCustomerWorkflowPromptFromText(template: CustomerWorkflowTemplate, prompt: string): string {
  const intentContext = template.protocolWorkspace?.allowedIntents.length
    ? `Allowed workspace intents: ${template.protocolWorkspace.allowedIntents.join(", ")}.`
    : "";
  switch (template.routing.chatMode) {
    case "bittensor":
      return `Bittensor task: ${prompt}. Scope: TAO, SS58 public addresses, coldkeys, hotkeys, subnets, validators, wallet reads, staking previews, watches, and receipts. ${BITTENSOR_SUFFIX} ${intentContext}`.trim();
    case "hyperliquid":
      return `Hyperliquid task: ${prompt}. Scope: markets, orderbooks, account exposure, funding, open orders, external trade handoffs, watches, and receipts. ${MARKET_HANDOFF_SUFFIX} ${intentContext}`.trim();
    case "polymarket":
      return `Polymarket task: ${prompt}. Scope: market discovery, outcomes, probabilities, liquidity, compliance checks, external trade handoffs, watches, and receipts. ${MARKET_HANDOFF_SUFFIX} ${intentContext}`.trim();
    case "wellness": {
      const task = /build the full 7-stage longevity workflow/i.test(prompt)
        ? "Start the Longevity workflow for my clients"
        : prompt.replace(/\.+$/, "");
      return `${task}. Ask me for missing audience, goal, constraints, schedule, and output details before creating the workflow.`;
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
      canSubmit: false,
      liveExecutionEnabled: false,
      allowsRealFunds: false,
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
    summary: "Start with a public TAO wallet, understand subnets, compare validators, and prepare external-signer previews.",
    promise: "Matterhorn explains the Bittensor concepts as you go. It never asks for seed phrases, private keys, or wallet exports.",
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
      shortDescription: "Check TAO, browse subnets, compare validators, and prepare unsigned staking or transfer previews.",
    },
    routing: { chatMode: "bittensor", opensPanel: "bittensor", startsSession: true },
    safetyBoundaries: {
      acceptsSecrets: false,
      acceptsPrivateKeys: false,
      acceptsApiSecrets: false,
      acceptsRawSignatures: false,
      canSubmit: false,
      liveExecutionEnabled: false,
      canExecute: true,
      requiresExternalSigner: true,
      allowsRealFunds: false,
    },
  },
  {
    id: "hyperliquid_trader",
    name: "Use Hyperliquid",
    summary: "Read Hyperliquid markets, check exposure, and prepare external trade handoffs for your own client.",
    promise: "Trade handoff only. No live submission, no custody, and no signing by Matterhorn.",
    category: "markets",
    status: "preview_only",
    examplePrompts: ["Prepare Hyperliquid BTC-PERP handoff", "Show my Hyperliquid exposure"],
    launch: {
      primaryCta: "Open Hyperliquid desk",
      secondaryCta: "Prepare trade handoff",
      defaultPrompt: "Prepare Hyperliquid BTC-PERP handoff",
      handoffContextLabel: "Public wallet address",
      recommendedSurface: "protocol_desk",
    },
    ui: {
      iconHint: "hyperliquid",
      accent: "matterhorn_blue",
      shortDescription: "Read orderbooks, account exposure, funding, and prepare external trade handoffs. Submission stays off.",
    },
    routing: { chatMode: "hyperliquid", opensPanel: "hyperliquid", startsSession: true },
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
    id: "polymarket_researcher",
    name: "Use Polymarket",
    summary: "Research Polymarket outcomes, liquidity, and eligibility before preparing a trade handoff.",
    promise: "Compliance-gated handoff only. No live submission by Matterhorn.",
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
      shortDescription: "Research markets, outcomes, liquidity, compliance, and prepare external trade handoffs. Bet placement stays off.",
    },
    routing: { chatMode: "polymarket", opensPanel: "polymarket", startsSession: true },
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
    name: "Blank chat",
    summary: "Start a free-form session with the default Matterhorn Agent.",
    promise: "Open-ended assistance. You choose the goal.",
    category: "future",
    status: "blank",
    examplePrompts: ["What can you do?"],
    launch: {
      primaryCta: "Start blank chat",
      secondaryCta: "Browse templates",
      defaultPrompt: "What can you do?",
      handoffContextLabel: "Goal",
      recommendedSurface: "workflow_chat",
    },
    ui: {
      iconHint: "blank",
      accent: "neutral",
      shortDescription: "Start a free-form chat with the default Matterhorn Agent.",
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
  return templates.length ? templates.map(enrichCustomerWorkflowTemplate) : FALLBACK_CUSTOMER_WORKFLOW_TEMPLATES;
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
      statusLabel: protocolDesk?.statusLabel ?? starterStatusLabel(template),
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
