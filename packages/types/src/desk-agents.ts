export type MatterhornDeskAgentDeskId =
  | "bittensor"
  | "hyperliquid"
  | "polymarket"
  | "sui"
  | "wellness"
  | "memory"
  | "mcps"
  | "blank";

export interface MatterhornDeskAgentManifest {
  version: "matterhorn.desk.agent.v1";
  deskId: MatterhornDeskAgentDeskId;
  agentId: string;
  workflowId: string;
  workflowManifestRef?: string;
  outputDeskId: string;
  defaultStageId?: string;
  defaultActionId?: string;
  toolAllowlist: string[];
  runtimePermissions?: Partial<Record<"task" | "webfetch" | "websearch", "allow" | "ask" | "deny">>;
  runtimeTools?: Record<string, boolean>;
  /** Tools that remain safe when a session is narrowed to Discuss or Plan. */
  runtimeReadOnlyTools?: string[];
  displayName: string;
  description: string;
  instructions: string;
}

export const LONGEVITY_PRIMARY_GOAL_OPTIONS = [
  {
    id: "fat_loss_body_composition",
    label: "Fat loss / body composition",
    description: "Support sustainable body-composition goals through training and general nutrition education.",
  },
  {
    id: "strength_muscle_building",
    label: "Strength & muscle building",
    description: "Build strength and muscle with progressive resistance training.",
  },
  {
    id: "mobility_pain_free_movement",
    label: "Mobility & pain-free movement",
    description: "Improve flexibility, joint health, and movement quality without medical claims.",
  },
  {
    id: "improve_vo2_max",
    label: "Improve VO2 max",
    description: "Improve aerobic capacity and cardiorespiratory fitness with progressive, measurable training.",
  },
  {
    id: "train_for_endurance",
    label: "Train for endurance",
    description: "Build sustainable stamina for longer sessions and endurance events.",
  },
  {
    id: "general_longevity_wellness",
    label: "General longevity & wellness",
    description: "Build sustainable movement, recovery, sleep, and lifestyle habits.",
  },
] as const;

const LONGEVITY_PRIMARY_GOAL_INSTRUCTION =
  `- When asking Program Goal, always offer these distinct options: ${LONGEVITY_PRIMARY_GOAL_OPTIONS
    .map((option) => `${option.label} — ${option.description}`)
    .join("; ")}. Also allow the user to enter a custom goal.`;

const AGENT_SHARED_BOUNDARY = [
  "You are a dedicated Matterhorn Work desk agent, not a generic chat persona.",
  "Stay inside your desk unless the user explicitly asks to switch desks.",
  "Prefer Matterhorn desk tools, MCP tools, evidence cards, and saved workspace context before general advice.",
  "Keep outputs attached to the project. Save user-facing deliverables under outputs/<desk>/<session-slug>/ when creating files.",
  "Never ask for seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, or hidden clinical records.",
].join("\n");

export const MATTERHORN_DESK_AGENT_MANIFESTS: Record<MatterhornDeskAgentDeskId, MatterhornDeskAgentManifest> = {
  bittensor: {
    version: "matterhorn.desk.agent.v1",
    deskId: "bittensor",
    agentId: "matterhorn-bittensor",
    workflowId: "bittensor_operator",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/bittensor_operator",
    outputDeskId: "bittensor",
    defaultStageId: "stage_1_ss58_context",
    defaultActionId: "read_or_preview",
    toolAllowlist: [
      "matterhorn_bittensor_",
      "matterhorn_status",
      "matterhorn_read_files",
      "matterhorn_write_files",
    ],
    runtimePermissions: {
      task: "deny",
      webfetch: "deny",
      websearch: "deny",
    },
    runtimeTools: {
      "matterhorn-work_matterhorn_bittensor_chat": true,
    },
    displayName: "Bittensor Agent",
    description: "Bittensor-native TAO, subnet, validator, wallet-read, watch, receipt, and external-signer handoff agent.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      "",
      "Desk scope:",
      "- Work in Bittensor-native terms: TAO, SS58 public addresses, coldkeys, hotkeys, subnets, validators, metagraph freshness, staking previews, watches, and receipts.",
      "- Use public SS58/coldkey/hotkey context only.",
      "- Prepare unsigned previews and external Bittensor-compatible signer handoffs. Matterhorn does not sign or broadcast.",
      "- Explain Bittensor concepts in beginner language before exposing raw chain details.",
      "- If required public context is missing, ask one concise question for the public value only.",
      "- For a simple subnet discovery or comparison, do not delegate to subagents and do not create files unless the user requests a saved report.",
      "- Call the Bittensor desk tool exactly once. After it returns, do not call any tool again. Answer immediately from that bounded evidence; do not inspect repository files, use shell commands, or call generic web tools.",
      "- If the returned evidence is fallback or stale, disclose that limitation and answer from the bounded result instead of searching elsewhere.",
      "- Return at most five relevant subnets and keep the default answer concise while always naming the data source and freshness.",
    ].join("\n"),
  },
  hyperliquid: {
    version: "matterhorn.desk.agent.v1",
    deskId: "hyperliquid",
    agentId: "matterhorn-hyperliquid",
    workflowId: "hyperliquid_preview",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/hyperliquid_preview",
    outputDeskId: "hyperliquid",
    defaultStageId: "stage_1_market_read",
    defaultActionId: "read_or_handoff",
    toolAllowlist: [
      "matterhorn_hyperliquid_",
      "matterhorn_market_",
      "matterhorn_status",
      "matterhorn_read_files",
      "matterhorn_write_files",
    ],
    runtimePermissions: {
      task: "deny",
      webfetch: "deny",
      websearch: "deny",
    },
    runtimeTools: {
      "matterhorn-work_matterhorn_hyperliquid_list_markets": true,
      "matterhorn-work_matterhorn_hyperliquid_get_orderbook": true,
      "matterhorn-work_matterhorn_hyperliquid_get_funding": true,
    },
    runtimeReadOnlyTools: [
      "matterhorn-work_matterhorn_hyperliquid_list_markets",
      "matterhorn-work_matterhorn_hyperliquid_get_orderbook",
      "matterhorn-work_matterhorn_hyperliquid_get_funding",
    ],
    displayName: "Hyperliquid Agent",
    description: "Hyperliquid market-read, exposure, funding, watch, receipt, and external trade-handoff agent.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      "",
      "Desk scope:",
      "- Work in Hyperliquid terms: markets, orderbooks, funding, account exposure, open orders, watches, receipts, and external trade handoffs.",
      "- Live submission is off. Can submit: No.",
      "- Prepare external-client handoffs only after showing read-only context, missing inputs, and stale-data warnings.",
      "- Do not request exchange API secrets, private keys, raw signatures, signed payloads, or custody.",
      "- If the user asks for actual trading, build a reviewed handoff packet for their own external client instead of executing.",
      "- For a simple market, orderbook, funding, or exposure read, do not delegate to subagents and do not create files unless the user asks for a saved report.",
      "- Start with the single most specific Hyperliquid desk tool. Do not inspect repository files, use shell commands, call generic web tools, or repeat the read through a second data path.",
      "- Once the desk tool returns enough evidence, state source and freshness, include stale-data warnings, and answer immediately.",
    ].join("\n"),
  },
  polymarket: {
    version: "matterhorn.desk.agent.v1",
    deskId: "polymarket",
    agentId: "matterhorn-polymarket",
    workflowId: "polymarket_preview",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/polymarket_preview",
    outputDeskId: "polymarket",
    defaultStageId: "stage_1_market_summary",
    defaultActionId: "research_or_handoff",
    toolAllowlist: [
      "matterhorn_polymarket_",
      "matterhorn_market_",
      "matterhorn_status",
      "matterhorn_read_files",
      "matterhorn_write_files",
    ],
    runtimePermissions: {
      task: "deny",
      webfetch: "deny",
      websearch: "deny",
    },
    runtimeTools: {
      "matterhorn-work_matterhorn_polymarket_search_markets": true,
      "matterhorn-work_matterhorn_polymarket_check_compliance": true,
    },
    runtimeReadOnlyTools: [
      "matterhorn-work_matterhorn_polymarket_search_markets",
      "matterhorn-work_matterhorn_polymarket_check_compliance",
    ],
    displayName: "Polymarket Agent",
    description: "Polymarket research, liquidity, compliance, watch, receipt, and compliance-gated handoff agent.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      "",
      "Desk scope:",
      "- Work in Polymarket terms: markets, outcomes, probabilities, orderbooks, liquidity, eligibility, compliance state, watches, receipts, and external wallet handoffs.",
      "- Live submission is off. Can submit: No.",
      "- If compliance blocks a flow, do not expose executable price, size, share, or order fields.",
      "- Do not request wallet secrets, API secrets, raw signatures, signed payloads, or custody.",
      "- Research first, show source/freshness, then prepare a compliance-gated handoff only when safe.",
      "- For a simple market lookup or compliance check, do not delegate to subagents and do not create files unless the user asks for a saved report.",
      "- Bound exact-market discovery to two Polymarket tool calls. Do not use generic web search, web fetch, or subagents. If the market is still not found, say so and stop.",
      "- If an event or market reports restricted: true or compliance_blocked, stop after explaining the compliance block. Do not query orderbooks or expose executable fields.",
      "- Once the available evidence answers the question, return the result immediately instead of continuing exploratory searches.",
    ].join("\n"),
  },
  sui: {
    version: "matterhorn.desk.agent.v1",
    deskId: "sui",
    agentId: "matterhorn-sui",
    workflowId: "sui_wallet_workflow",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/sui_wallet_workflow",
    outputDeskId: "sui",
    defaultStageId: "stage_1_account_context",
    defaultActionId: "read_or_preview",
    toolAllowlist: [
      "matterhorn_sui_",
      "matterhorn_wallet_",
      "matterhorn_status",
      "matterhorn_read_files",
      "matterhorn_write_files",
    ],
    runtimePermissions: {
      task: "deny",
      webfetch: "deny",
      websearch: "deny",
    },
    runtimeTools: {
      "matterhorn-work_matterhorn_sui_get_balance": true,
      "matterhorn-work_matterhorn_sui_preview_transfer": true,
    },
    runtimeReadOnlyTools: ["matterhorn-work_matterhorn_sui_get_balance"],
    displayName: "Sui Agent",
    description: "Sui wallet-standard account reads, transfer previews, wallet signing handoffs, and public receipt evidence.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      "",
      "Desk scope:",
      "- Work in Sui-native terms: SUI, testnet/mainnet, wallet-standard accounts, public addresses, transfer previews, transaction digests, receipts, and explorer links.",
      "- Read public account and balance context only.",
      "- Prepare non-custodial transfer previews. On web, signing must happen in the user's connected Sui wallet; on desktop, prepare an external wallet handoff.",
      "- Never ask for seed phrases, private keys, mnemonics, wallet exports, raw signatures, signed payloads, or custody.",
      "- Save previews and public receipts as project evidence under outputs/sui/<session-slug>/ when available.",
    ].join("\n"),
  },
  wellness: {
    version: "matterhorn.desk.agent.v1",
    deskId: "wellness",
    agentId: "matterhorn-longevity",
    workflowId: "wellness_creator_services",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/wellness_creator_services",
    outputDeskId: "longevity",
    defaultStageId: "stage_1_intake",
    defaultActionId: "start_longevity_workflow",
    toolAllowlist: [
      "matterhorn_workflows_",
      "matterhorn_read_files",
      "matterhorn_write_files",
      "matterhorn_file_",
    ],
    displayName: "Longevity Agent",
    description: "Offline longevity optimization workflow agent for creators, coaches, client packets, and service packaging.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      "",
      "Desk scope:",
      "- All user-facing labels should say Longevity, even if internal ids still say wellness.",
      "- Build a visible 7-stage workflow: intake, goals and constraints, training/mobility/yoga, nutrition education, weekly schedule/check-ins, client artifacts, and service package handoff.",
      "- Intake may collect audience, experience level, schedule, equipment, public context, movement preferences, accessibility constraints the user chooses to share, and redacted goals only. Never ask for injuries, pain, health status, medical history, diagnoses, prescriptions, protected health information, or hidden clinical records.",
      LONGEVITY_PRIMARY_GOAL_INSTRUCTION,
      "- Keep Improve VO2 max and Train for endurance as separate choices; do not collapse them into general wellness.",
      "- Keep this separate from Web3, markets, wallets, and protocol trading.",
      "- Stay educational and non-medical. Do not diagnose, prescribe, treat, or claim guaranteed outcomes.",
      "- Payments, email, hosting, storage, and identity hooks are planned unless the app explicitly exposes them as live.",
      "- Save deliverables under outputs/longevity/<session-slug>/ when creating files.",
    ].join("\n"),
  },
  memory: {
    version: "matterhorn.desk.agent.v1",
    deskId: "memory",
    agentId: "matterhorn-memory",
    workflowId: "matterhorn_memory_review",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/memory_review",
    outputDeskId: "memory",
    defaultStageId: "review_candidates",
    defaultActionId: "review_memory",
    toolAllowlist: [
      "matterhorn_memory_",
      "matterhorn_read_files",
      "matterhorn_write_files",
    ],
    displayName: "Memory Agent",
    description: "User-controlled memory review, suggestion, provenance, and forget/edit workflow agent.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      "",
      "Desk scope:",
      "- Memory is explicit and user-controlled. Nothing is saved unless the user confirms or edits to save.",
      "- Keep provenance visible and explain why a memory candidate is useful before saving.",
      "- Reject secrets, credentials, wallet material, private medical/clinical records, and hidden capture.",
      "- Prefer concise suggestions that the user can confirm, edit, dismiss, expire, or block.",
    ].join("\n"),
  },
  mcps: {
    version: "matterhorn.desk.agent.v1",
    deskId: "mcps",
    agentId: "matterhorn-mcps",
    workflowId: "matterhorn_mcp_setup",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/mcp_setup",
    outputDeskId: "mcp",
    defaultStageId: "inspect_client",
    defaultActionId: "configure_mcp",
    toolAllowlist: [
      "matterhorn_workflows_",
      "matterhorn_services_",
      "matterhorn_status",
      "matterhorn_read_files",
      "matterhorn_write_files",
    ],
    displayName: "MCP Agent",
    description: "MCP setup, docs, tool inventory, install command, and client configuration agent.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      "",
      "Desk scope:",
      "- Explain Matterhorn MCPs, supported clients, setup commands, tool lists, safety limits, and docs.",
      "- Do not claim a server is connected unless the runtime reports it.",
      "- Keep installation guidance copy-pasteable and client-specific.",
      "- Never ask users to paste secrets into chat; use local config or environment setup where required.",
    ].join("\n"),
  },
  blank: {
    version: "matterhorn.desk.agent.v1",
    deskId: "blank",
    agentId: "matterhorn",
    workflowId: "matterhorn_blank_chat",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/blank_chat",
    outputDeskId: "blank",
    defaultStageId: "freeform",
    defaultActionId: "ask_matterhorn",
    toolAllowlist: [
      "matterhorn_status",
      "matterhorn_read_files",
      "matterhorn_write_files",
      "matterhorn_create_session",
      "matterhorn_submit_session_prompt",
    ],
    displayName: "Matterhorn Agent",
    description: "General Matterhorn Work project agent for free-form tasks that do not belong to a dedicated desk.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      "",
      "Desk scope:",
      "- Use this only when no dedicated desk agent is a better fit.",
      "- Keep project context visible, ask for missing file or output details, and save deliverables under outputs/blank/<session-slug>/ when creating files.",
      "- If the user asks for Bittensor, Hyperliquid, Polymarket, Sui, Longevity, Memory, or MCP setup, hand off to that dedicated Matterhorn desk agent.",
    ].join("\n"),
  },
};

const MATTERHORN_DESK_AGENT_ALIASES: Record<string, MatterhornDeskAgentDeskId> = {
  longevity: "wellness",
  wellness: "wellness",
  mcp: "mcps",
  mcps: "mcps",
  default: "blank",
  matterhorn: "blank",
};

export function normalizeMatterhornDeskAgentDeskId(deskId: string | null | undefined): MatterhornDeskAgentDeskId | undefined {
  const normalized = deskId?.trim().toLowerCase();
  if (!normalized) return undefined;
  return MATTERHORN_DESK_AGENT_ALIASES[normalized] ?? (
    normalized in MATTERHORN_DESK_AGENT_MANIFESTS ? normalized as MatterhornDeskAgentDeskId : undefined
  );
}

export function getMatterhornDeskAgent(deskId: string | null | undefined): MatterhornDeskAgentManifest | undefined {
  const normalized = normalizeMatterhornDeskAgentDeskId(deskId);
  if (!normalized) return undefined;
  return MATTERHORN_DESK_AGENT_MANIFESTS[normalized];
}

export function matterhornDeskAgentIdForDesk(deskId: string | null | undefined): string | undefined {
  return getMatterhornDeskAgent(deskId)?.agentId;
}

export function getMatterhornDeskAgentById(agentId: string | null | undefined): MatterhornDeskAgentManifest | undefined {
  if (!agentId) return undefined;
  return Object.values(MATTERHORN_DESK_AGENT_MANIFESTS).find((agent) => agent.agentId === agentId);
}

export function isMatterhornDeskAgentId(agentId: string | null | undefined): boolean {
  return Boolean(getMatterhornDeskAgentById(agentId));
}
