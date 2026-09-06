export type MatterhornDeskAgentDeskId =
  | "bittensor"
  | "hyperliquid"
  | "polymarket"
  | "sui"
  | "wellness"
  | "memory"
  | "mcps"
  | "blank";

export type MatterhornDeskRuntimeKind = "managed_desk" | "general_orchestrator";
export type MatterhornDeskAgentActionLevel = "read_only" | "prepare_only" | "workspace_write";
export type MatterhornDeskCompletionSurface =
  | "none"
  | "external_signer"
  | "connected_wallet"
  | "external_client"
  | "manual_trade_ticket";
export type MatterhornDeskEvidencePolicy = "workspace" | "tool" | "tool_and_receipt";

export interface MatterhornDeskToolPolicy {
  runtimeKind: MatterhornDeskRuntimeKind;
  /**
   * Managed desk agents are emitted with `"*": false` and only these exact
   * tools enabled. The general orchestrator is intentionally managed by the
   * workspace-owned Matterhorn agent template instead.
   */
  denyByDefault: boolean;
  permissions: Partial<Record<"task" | "webfetch" | "websearch", "allow" | "ask" | "deny">>;
  work: string[];
  /** Tools that remain safe when a session is narrowed to Discuss or Plan. */
  readOnly: string[];
}

export interface MatterhornDeskCapabilityPolicy {
  actionLevel: MatterhornDeskAgentActionLevel;
  readsLiveData: boolean;
  preparesUserAction: boolean;
  userCompletion: {
    surface: MatterhornDeskCompletionSurface;
    availableAfterReview: boolean;
    featureGate?: string;
  };
  /** These remain false for every desk. Signing and submission are user-owned. */
  agentMaySign: false;
  agentMaySubmit: false;
  automationsMaySubmit: false;
  evidence: MatterhornDeskEvidencePolicy;
  statusLabel: string;
  summary: string;
}

export interface MatterhornDeskContextPolicy {
  includeEnvironmentVariableNames: true;
  includeWorkspaceOrientation: boolean;
  /** Public-chain facts become private context once linked to a Matterhorn account. */
  includeWalletPublicContext: boolean;
  includeCryptoSafetyPolicy: boolean;
  selectedMemoryOnly: true;
  allowSecretValues: false;
}

export interface MatterhornDeskVerificationPolicy {
  requireToolEvidenceForLiveFacts: boolean;
  requireSourceAndFreshness: boolean;
  requireReceiptForCompletionClaim: boolean;
  maxToolCalls: number;
  prohibitedClaims: string[];
}

export interface MatterhornDeskModelPolicy {
  selection: "user_selected_with_workspace_fallback";
  defaultReasoningEffort: "balanced";
  temperature: number;
  requiresToolCalling: boolean;
}

export interface MatterhornDeskResponseEvidence {
  liveFactsUsed?: boolean;
  toolEvidencePresent?: boolean;
  sourceNamed?: boolean;
  freshnessNamed?: boolean;
  completionClaimed?: boolean;
  receiptEvidencePresent?: boolean;
  agentSigningClaimed?: boolean;
  agentSubmissionClaimed?: boolean;
  automationSubmissionClaimed?: boolean;
  toolCalls?: number;
}

export type MatterhornDeskResponseVerificationIssue =
  | "agent_signing_claim"
  | "agent_submission_claim"
  | "automation_submission_claim"
  | "completion_without_receipt"
  | "live_fact_without_freshness"
  | "live_fact_without_source"
  | "live_fact_without_tool_evidence"
  | "tool_call_budget_exceeded";

export interface MatterhornDeskAgentManifest {
  version: "matterhorn.desk.agent.v2";
  deskId: MatterhornDeskAgentDeskId;
  agentId: string;
  workflowId: string;
  workflowManifestRef?: string;
  outputDeskId: string;
  defaultStageId?: string;
  defaultActionId?: string;
  toolPolicy: MatterhornDeskToolPolicy;
  capabilityPolicy: MatterhornDeskCapabilityPolicy;
  contextPolicy: MatterhornDeskContextPolicy;
  verificationPolicy: MatterhornDeskVerificationPolicy;
  modelPolicy: MatterhornDeskModelPolicy;
  displayName: string;
  description: string;
  instructions: string;
}

const NEVER_AGENT_SUBMITS = {
  agentMaySign: false,
  agentMaySubmit: false,
  automationsMaySubmit: false,
} as const;

const DEFAULT_CONTEXT_POLICY: MatterhornDeskContextPolicy = {
  includeEnvironmentVariableNames: true,
  includeWorkspaceOrientation: true,
  includeWalletPublicContext: false,
  includeCryptoSafetyPolicy: false,
  selectedMemoryOnly: true,
  allowSecretValues: false,
};

const DEFAULT_MODEL_POLICY: MatterhornDeskModelPolicy = {
  selection: "user_selected_with_workspace_fallback",
  defaultReasoningEffort: "balanced",
  temperature: 0.2,
  requiresToolCalling: true,
};

const PROHIBITED_EXECUTION_CLAIMS = [
  "Do not claim that Matterhorn signed on the user's behalf.",
  "Do not claim that an agent, automation, or watch submitted a transaction.",
  "Do not claim completion without the required receipt evidence.",
];

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
  "You are a dedicated Matterhorn Desks desk agent, not a generic chat persona.",
  "Stay inside your desk unless the user explicitly asks to switch desks.",
  "Prefer Matterhorn desk tools, MCP tools, evidence cards, and saved workspace context before general advice.",
  "Keep outputs attached to the project. Save user-facing deliverables under outputs/<desk>/<session-slug>/ when creating files.",
  "Never ask for seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, or hidden clinical records.",
].join("\n");

const AGENT_FAST_ACTION_PATH = [
  "Action path:",
  "- Treat an imperative request as an action intent. Use the user's original wording and already-known session or wallet context; never ask them to repeat known public fields.",
  "- Infer only unambiguous public fields. Apply documented backend defaults only when the review card shows them before approval; never infer a recipient, validator, outcome, amount, or limit price.",
  "- If required fields are missing, ask one compact question containing every missing field and a short example. Do not explain the whole workflow first.",
  "- Once the request is complete, call the final bounded action tool before prose. Return the typed review card first, then one short sentence naming the user's next approval step.",
  "- If lookup returns several valid targets, show at most three compact choices. Do not require a URL or raw protocol id when a unique public result can be resolved from the user's description.",
  "- Never return a generic simulation acknowledgement when a desk tool can return a real read, clarification, preview, or review card.",
].join("\n");

export const MATTERHORN_DESK_AGENT_MANIFESTS: Record<MatterhornDeskAgentDeskId, MatterhornDeskAgentManifest> = {
  bittensor: {
    version: "matterhorn.desk.agent.v2",
    deskId: "bittensor",
    agentId: "matterhorn-bittensor",
    workflowId: "bittensor_operator",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/bittensor_operator",
    outputDeskId: "bittensor",
    defaultStageId: "stage_1_ss58_context",
    defaultActionId: "read_or_preview",
    toolPolicy: {
      runtimeKind: "managed_desk",
      denyByDefault: true,
      permissions: {
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
      },
      work: [
        "matterhorn-work_matterhorn_bittensor_chat",
        "matterhorn-work_matterhorn_bittensor_prepare_action",
        "matterhorn-work_matterhorn_crypto_chat",
      ],
      readOnly: [
        "matterhorn-work_matterhorn_bittensor_chat",
      ],
    },
    capabilityPolicy: {
      actionLevel: "prepare_only",
      readsLiveData: true,
      preparesUserAction: true,
      userCompletion: {
        surface: "connected_wallet",
        availableAfterReview: true,
      },
      ...NEVER_AGENT_SUBMITS,
      evidence: "tool_and_receipt",
      statusLabel: "Review in wallet",
      summary: "Reads public Bittensor data and prepares TAO transfer, stake, and unstake calls for exact connected-wallet review.",
    },
    contextPolicy: {
      ...DEFAULT_CONTEXT_POLICY,
      includeWalletPublicContext: true,
      includeCryptoSafetyPolicy: true,
    },
    verificationPolicy: {
      requireToolEvidenceForLiveFacts: true,
      requireSourceAndFreshness: true,
      requireReceiptForCompletionClaim: true,
      maxToolCalls: 1,
      prohibitedClaims: PROHIBITED_EXECUTION_CLAIMS,
    },
    modelPolicy: { ...DEFAULT_MODEL_POLICY, temperature: 0.1 },
    displayName: "Bittensor Agent",
    description: "Bittensor-native TAO, subnet, validator, wallet-read, reviewed transaction, watch, and receipt agent.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      AGENT_FAST_ACTION_PATH,
      "",
      "Desk scope:",
      "- Work in Bittensor-native terms: TAO, SS58 public addresses, coldkeys, hotkeys, subnets, validators, metagraph freshness, staking previews, watches, and receipts.",
      "- Use public SS58/coldkey/hotkey context only.",
      "- Prepare direct TAO transfer, stake, and unstake drafts for the separate connected-wallet ticket. The installed Bittensor wallet must review, sign, and broadcast the exact Finney call.",
      "- Do not present delegation or advanced runtime calls as executable until a dedicated adapter and review contract are available. Matterhorn never signs or broadcasts on the user's behalf.",
      "- Explain Bittensor concepts in beginner language before exposing raw chain details.",
      "- If required public context is missing, ask one concise question listing every missing public value.",
      "- For a simple subnet discovery or comparison, do not delegate to subagents and do not create files unless the user requests a saved report.",
      "- For a complete TAO transfer, stake, or unstake request, call the bounded Bittensor action tool exactly once with the user's original message and available public fields. The final action call creates the typed Review in wallet card; do not replace it with a prose-only transaction draft.",
      "- A transfer is complete only when destination and positive TAO amount are known. Stake and unstake require a positive amount, subnet netuid, and validator hotkey. Use the selected public wallet address as sender when present; otherwise ask one concise question listing only missing public fields.",
      "- After the unified action tool returns, do not call another tool or restate an invented draft. Briefly summarize the returned evidence and tell the user to choose Review in wallet.",
      "- For non-transfer Bittensor reads: Call the Bittensor desk tool exactly once. After it returns, do not call any tool again. Answer immediately from that bounded evidence; do not inspect repository files, use shell commands, or call generic web tools.",
      "- Treat the returned tool evidence as the sole source for subnet IDs, names, and capabilities. Never fill gaps from model memory or infer a subnet-to-capability mapping that the tool did not return.",
      "- If the returned evidence is fallback, stale, unavailable, or does not explicitly identify matching subnets, say that current subnet recommendations are unavailable. Give only generic selection criteria plus a concise configure-and-retry step; do not name subnet IDs, subnet names, or capabilities.",
      "- Return at most five relevant subnets only when every recommendation is directly supported by the returned evidence. Keep the default answer concise and always name the data source and freshness.",
    ].join("\n"),
  },
  hyperliquid: {
    version: "matterhorn.desk.agent.v2",
    deskId: "hyperliquid",
    agentId: "matterhorn-hyperliquid",
    workflowId: "hyperliquid_preview",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/hyperliquid_preview",
    outputDeskId: "hyperliquid",
    defaultStageId: "stage_1_market_read",
    defaultActionId: "read_or_handoff",
    toolPolicy: {
      runtimeKind: "managed_desk",
      denyByDefault: true,
      permissions: {
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
      },
      work: [
        "matterhorn-work_matterhorn_hyperliquid_list_markets",
        "matterhorn-work_matterhorn_hyperliquid_get_account",
        "matterhorn-work_matterhorn_hyperliquid_get_positions",
        "matterhorn-work_matterhorn_hyperliquid_get_open_orders",
        "matterhorn-work_matterhorn_hyperliquid_get_orderbook",
        "matterhorn-work_matterhorn_hyperliquid_get_funding",
        "matterhorn-work_matterhorn_hyperliquid_preview_order",
        "matterhorn-work_matterhorn_crypto_chat",
      ],
      readOnly: [
        "matterhorn-work_matterhorn_hyperliquid_list_markets",
        "matterhorn-work_matterhorn_hyperliquid_get_account",
        "matterhorn-work_matterhorn_hyperliquid_get_positions",
        "matterhorn-work_matterhorn_hyperliquid_get_open_orders",
        "matterhorn-work_matterhorn_hyperliquid_get_orderbook",
        "matterhorn-work_matterhorn_hyperliquid_get_funding",
      ],
    },
    capabilityPolicy: {
      actionLevel: "prepare_only",
      readsLiveData: true,
      preparesUserAction: true,
      userCompletion: {
        surface: "manual_trade_ticket",
        availableAfterReview: true,
        featureGate: "hyperliquid_execution",
      },
      ...NEVER_AGENT_SUBMITS,
      evidence: "tool_and_receipt",
      statusLabel: "Review in wallet",
      summary: "Chat prepares the order; the trade ticket requires your wallet approval before one-time submission.",
    },
    contextPolicy: {
      ...DEFAULT_CONTEXT_POLICY,
      includeWalletPublicContext: true,
      includeCryptoSafetyPolicy: true,
    },
    verificationPolicy: {
      requireToolEvidenceForLiveFacts: true,
      requireSourceAndFreshness: true,
      requireReceiptForCompletionClaim: true,
      maxToolCalls: 2,
      prohibitedClaims: PROHIBITED_EXECUTION_CLAIMS,
    },
    modelPolicy: { ...DEFAULT_MODEL_POLICY, temperature: 0.1 },
    displayName: "Hyperliquid Agent",
    description: "Hyperliquid market research, exposure, funding, watch, receipt, and wallet-approved execution agent.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      AGENT_FAST_ACTION_PATH,
      "",
      "Desk scope:",
      "- Work in Hyperliquid terms: markets, orderbooks, funding, account exposure, open orders, watches, receipts, and wallet-approved orders.",
      "- Trading is available only through the Hyperliquid desk's explicit review, connected-wallet signature, and one-time submission flow.",
      "- Show market context, missing inputs, estimated notional, network, order type, slippage, and reduce-only state before directing the user to review an order.",
      "- Do not request exchange API secrets, private keys, raw signatures, signed payloads, or custody.",
      "- Never claim an Agent prompt placed an order. Direct actual trading to the desk ticket; watches and chat never auto-execute.",
      "- For a complete order request, you MUST call matterhorn-work_matterhorn_crypto_chat exactly once with venue hyperliquid, the user's original message, asset, side, and positive base-asset size, plus any explicitly supplied price, order type, slippage tolerance, or reduce-only intent. This final action call creates the typed Review in wallet card; do not replace it with prose.",
      "- An order request is complete when asset, side, and positive base-asset size are known. The bounded backend visibly defaults an omitted order type to market, network to testnet, reduce-only to false, and slippage to its reviewed policy; a limit order additionally requires price. Ask one compact question for only fields that remain missing, and never silently convert notional into base size.",
      "- After the unified action tool returns, do not call another tool or recreate the draft in prose. Briefly summarize the returned evidence and tell the user to choose Review in wallet. The separate ticket defaults to testnet; mainnet remains explicitly gated there.",
      "- For a simple market, orderbook, funding, or exposure read, do not delegate to subagents and do not create files unless the user asks for a saved report.",
      "- Start with the single most specific Hyperliquid desk tool. Do not inspect repository files, use shell commands, call generic web tools, or repeat the read through a second data path.",
      "- Once the desk tool returns enough evidence, state source and freshness, include stale-data warnings, and answer immediately.",
    ].join("\n"),
  },
  polymarket: {
    version: "matterhorn.desk.agent.v2",
    deskId: "polymarket",
    agentId: "matterhorn-polymarket",
    workflowId: "polymarket_preview",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/polymarket_preview",
    outputDeskId: "polymarket",
    defaultStageId: "stage_1_market_summary",
    defaultActionId: "research_or_handoff",
    toolPolicy: {
      runtimeKind: "managed_desk",
      denyByDefault: true,
      permissions: {
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
      },
      work: [
        "matterhorn-work_matterhorn_prediction_market_venues",
        "matterhorn-work_matterhorn_prediction_markets_search",
        "matterhorn-work_matterhorn_polymarket_search_markets",
        "matterhorn-work_matterhorn_polymarket_get_orderbook",
        "matterhorn-work_matterhorn_polymarket_check_compliance",
        "matterhorn-work_matterhorn_polymarket_preview_order",
        "matterhorn-work_matterhorn_polymarket_prepare_handoff",
        "matterhorn-work_matterhorn_crypto_chat",
      ],
      readOnly: [
        "matterhorn-work_matterhorn_prediction_market_venues",
        "matterhorn-work_matterhorn_prediction_markets_search",
        "matterhorn-work_matterhorn_polymarket_search_markets",
        "matterhorn-work_matterhorn_polymarket_get_orderbook",
        "matterhorn-work_matterhorn_polymarket_check_compliance",
      ],
    },
    capabilityPolicy: {
      actionLevel: "prepare_only",
      readsLiveData: true,
      preparesUserAction: true,
      userCompletion: {
        surface: "connected_wallet",
        availableAfterReview: true,
        featureGate: "polymarket_compliance",
      },
      ...NEVER_AGENT_SUBMITS,
      evidence: "tool_and_receipt",
      statusLabel: "Review in wallet",
      summary: "Researches live markets and prepares compliance-allowed buy, sell, and cancel actions for connected Polygon-wallet review.",
    },
    contextPolicy: {
      ...DEFAULT_CONTEXT_POLICY,
      includeWalletPublicContext: true,
      includeCryptoSafetyPolicy: true,
    },
    verificationPolicy: {
      requireToolEvidenceForLiveFacts: true,
      requireSourceAndFreshness: true,
      requireReceiptForCompletionClaim: true,
      maxToolCalls: 2,
      prohibitedClaims: PROHIBITED_EXECUTION_CLAIMS,
    },
    modelPolicy: { ...DEFAULT_MODEL_POLICY, temperature: 0.1 },
    displayName: "Polymarket Agent",
    description: "Cross-venue prediction-market research plus a Polymarket liquidity, compliance, watch, receipt, and wallet-approved action agent.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      AGENT_FAST_ACTION_PATH,
      "",
      "Desk scope:",
      "- Research prediction markets across Polymarket, Kalshi, and Manifold. Normalize venue, market type, probability, liquidity, source, and freshness without implying the venues are interchangeable.",
      "- Kalshi and Manifold are research-only. Never route their markets into a Polymarket order, wallet ticket, handoff, watch, or receipt. Never claim Matterhorn can trade there.",
      "- Compliance-allowed buy and sell orders, plus exact-order cancellations, continue only through the connected Polygon-wallet ticket. Proxy accounts, blocked regions, agents, and watches cannot submit in this release.",
      "- If compliance blocks a flow, do not expose executable price, size, share, or order fields.",
      "- Research first, show source/freshness, then prepare an exact Wallet review only when compliance allows it.",
      "- For an order request, use the user's public market description to resolve a unique active market before asking for an id or URL. If several markets match, show at most three choices. Then call matterhorn-work_matterhorn_crypto_chat exactly once with venue polymarket, the original message, resolved public marketId, outcome or side, positive amountUsdc, and any explicit slippage tolerance. This final action call creates the typed Review in wallet card when compliance allows it; do not replace it with prose.",
      "- An order request is complete when a unique active market, explicit outcome/side, and positive USDC amount are known. The bounded backend applies its visible slippage policy when omitted. Ask one compact question for only fields that remain missing; never guess the market, outcome, or amount.",
      "- After the unified action tool returns, do not call another tool or recreate the draft in prose. If allowed, tell the user to choose Review in wallet. If blocked or unsupported, state that clearly and keep it as an external handoff without executable fields.",
      "- For a simple market lookup or compliance check, do not delegate to subagents and do not create files unless the user asks for a saved report.",
      "- For a broad topic or a cross-venue comparison, call matterhorn-work_matterhorn_prediction_markets_search once. Identify every result's venue and distinguish real-money markets from Manifold's play-money markets.",
      "- Bound exact-market discovery to two Polymarket tool calls. Do not use generic web search, web fetch, or subagents. If the market is still not found, say so and stop.",
      "- Read an order book only with the exact outcome token ID returned by certified Polymarket discovery. Treat the snapshot as public evidence, never as permission to trade.",
      "- If an event or market reports restricted: true or compliance_blocked, stop after explaining the compliance block. Do not query orderbooks or expose executable fields.",
      "- Once the available evidence answers the question, return the result immediately instead of continuing exploratory searches.",
    ].join("\n"),
  },
  sui: {
    version: "matterhorn.desk.agent.v2",
    deskId: "sui",
    agentId: "matterhorn-sui",
    workflowId: "sui_wallet_workflow",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/sui_wallet_workflow",
    outputDeskId: "sui",
    defaultStageId: "stage_1_account_context",
    defaultActionId: "read_or_preview",
    toolPolicy: {
      runtimeKind: "managed_desk",
      denyByDefault: true,
      permissions: {
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
      },
      work: [
        "matterhorn-work_matterhorn_sui_get_balance",
        "matterhorn-work_matterhorn_sui_preview_transfer",
      ],
      readOnly: ["matterhorn-work_matterhorn_sui_get_balance"],
    },
    capabilityPolicy: {
      actionLevel: "prepare_only",
      readsLiveData: true,
      preparesUserAction: true,
      userCompletion: {
        surface: "connected_wallet",
        availableAfterReview: true,
        featureGate: "sui_wallet_standard",
      },
      ...NEVER_AGENT_SUBMITS,
      evidence: "tool_and_receipt",
      statusLabel: "Review in wallet",
      summary:
        "Prepares a transfer preview; you review, sign, and submit it in your connected Sui wallet. Matterhorn stores previews and public receipts only.",
    },
    contextPolicy: {
      ...DEFAULT_CONTEXT_POLICY,
      includeCryptoSafetyPolicy: true,
    },
    verificationPolicy: {
      requireToolEvidenceForLiveFacts: true,
      requireSourceAndFreshness: true,
      requireReceiptForCompletionClaim: true,
      maxToolCalls: 1,
      prohibitedClaims: PROHIBITED_EXECUTION_CLAIMS,
    },
    modelPolicy: { ...DEFAULT_MODEL_POLICY, temperature: 0.1 },
    displayName: "Sui Agent",
    description: "Sui wallet-standard account reads, transfer previews, wallet signing handoffs, and public receipt evidence.",
    instructions: [
      AGENT_SHARED_BOUNDARY,
      "",
      "Desk scope:",
      "- Work in Sui-native terms: SUI, testnet/mainnet, wallet-standard accounts, public addresses, transfer previews, transaction digests, receipts, and explorer links.",
      "- Read public account and balance context only.",
      "- Prepare non-custodial transfer previews with amountSui as a positive decimal string. On web, signing must happen in the user's connected Sui wallet; on desktop, prepare an external wallet handoff.",
      "- Call the Sui transfer preview tool once. If it fails, say that no valid preview was generated, do not calculate replacement transaction details yourself, and do not recommend signing or execution.",
      "- Never invent a gas budget, digest, preview hash, or handoff. Show those fields only when the tool returns them.",
      "- Never ask for seed phrases, private keys, mnemonics, wallet exports, raw signatures, signed payloads, or custody.",
      "- Save previews and public receipts as project evidence under outputs/sui/<session-slug>/ when available.",
    ].join("\n"),
  },
  wellness: {
    version: "matterhorn.desk.agent.v2",
    deskId: "wellness",
    agentId: "matterhorn-longevity",
    workflowId: "wellness_creator_services",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/wellness_creator_services",
    outputDeskId: "longevity",
    defaultStageId: "stage_1_intake",
    defaultActionId: "start_longevity_workflow",
    toolPolicy: {
      runtimeKind: "managed_desk",
      denyByDefault: true,
      permissions: {
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
      },
      work: [
        "matterhorn-work_matterhorn_workflows_catalog",
        "matterhorn-work_matterhorn_workflows_customer_templates",
        "matterhorn-work_matterhorn_workflows_prompt_pack",
        "matterhorn-work_matterhorn_read_files",
        "matterhorn-work_matterhorn_write_files",
      ],
      readOnly: [
        "matterhorn-work_matterhorn_workflows_catalog",
        "matterhorn-work_matterhorn_workflows_customer_templates",
        "matterhorn-work_matterhorn_workflows_prompt_pack",
        "matterhorn-work_matterhorn_read_files",
      ],
    },
    capabilityPolicy: {
      actionLevel: "workspace_write",
      readsLiveData: false,
      preparesUserAction: false,
      userCompletion: {
        surface: "none",
        availableAfterReview: false,
      },
      ...NEVER_AGENT_SUBMITS,
      evidence: "workspace",
      statusLabel: "Workspace workflow",
      summary:
        "Builds educational longevity programs with no medical advice and no live payments, then saves approved deliverables in this project.",
    },
    contextPolicy: DEFAULT_CONTEXT_POLICY,
    verificationPolicy: {
      requireToolEvidenceForLiveFacts: false,
      requireSourceAndFreshness: false,
      requireReceiptForCompletionClaim: false,
      maxToolCalls: 8,
      prohibitedClaims: [
        "Do not diagnose, prescribe, treat, or claim guaranteed health outcomes.",
        "Do not claim that a deliverable was saved unless the file write succeeded.",
      ],
    },
    modelPolicy: DEFAULT_MODEL_POLICY,
    displayName: "Longevity Agent",
    description: "Guided longevity program workflow for creators, coaches, client packets, and service packaging.",
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
    version: "matterhorn.desk.agent.v2",
    deskId: "memory",
    agentId: "matterhorn-memory",
    workflowId: "matterhorn_memory_review",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/memory_review",
    outputDeskId: "memory",
    defaultStageId: "review_candidates",
    defaultActionId: "review_memory",
    toolPolicy: {
      runtimeKind: "managed_desk",
      denyByDefault: true,
      permissions: {
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
      },
      work: [
        "matterhorn-work_matterhorn_memory_capture",
        "matterhorn-work_matterhorn_memory_export",
        "matterhorn-work_matterhorn_memory_forget",
        "matterhorn-work_matterhorn_memory_get",
        "matterhorn-work_matterhorn_memory_list",
        "matterhorn-work_matterhorn_memory_search",
        "matterhorn-work_matterhorn_memory_update",
      ],
      readOnly: [
        "matterhorn-work_matterhorn_memory_get",
        "matterhorn-work_matterhorn_memory_list",
        "matterhorn-work_matterhorn_memory_search",
      ],
    },
    capabilityPolicy: {
      actionLevel: "workspace_write",
      readsLiveData: false,
      preparesUserAction: false,
      userCompletion: {
        surface: "none",
        availableAfterReview: false,
      },
      ...NEVER_AGENT_SUBMITS,
      evidence: "workspace",
      statusLabel: "User-confirmed",
      summary: "Reviews, saves, edits, exports, or forgets only the memories you explicitly control.",
    },
    contextPolicy: DEFAULT_CONTEXT_POLICY,
    verificationPolicy: {
      requireToolEvidenceForLiveFacts: false,
      requireSourceAndFreshness: false,
      requireReceiptForCompletionClaim: false,
      maxToolCalls: 6,
      prohibitedClaims: [
        "Do not claim that anything was remembered unless the memory tool confirms it.",
        "Do not save secrets, credentials, wallet material, or hidden clinical records.",
      ],
    },
    modelPolicy: DEFAULT_MODEL_POLICY,
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
    version: "matterhorn.desk.agent.v2",
    deskId: "mcps",
    agentId: "matterhorn-mcps",
    workflowId: "matterhorn_mcp_setup",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/mcp_setup",
    outputDeskId: "mcp",
    defaultStageId: "inspect_client",
    defaultActionId: "configure_mcp",
    toolPolicy: {
      runtimeKind: "managed_desk",
      denyByDefault: true,
      permissions: {
        task: "deny",
        webfetch: "deny",
        websearch: "deny",
      },
      work: [
        "matterhorn-work_matterhorn_status",
        "matterhorn-work_matterhorn_services_get_capabilities",
        "matterhorn-work_matterhorn_services_chat_plan",
        "matterhorn-work_matterhorn_workflows_catalog",
        "matterhorn-work_matterhorn_read_files",
        "matterhorn-work_matterhorn_write_files",
      ],
      readOnly: [
        "matterhorn-work_matterhorn_status",
        "matterhorn-work_matterhorn_services_get_capabilities",
        "matterhorn-work_matterhorn_workflows_catalog",
        "matterhorn-work_matterhorn_read_files",
      ],
    },
    capabilityPolicy: {
      actionLevel: "workspace_write",
      readsLiveData: true,
      preparesUserAction: false,
      userCompletion: {
        surface: "none",
        availableAfterReview: false,
      },
      ...NEVER_AGENT_SUBMITS,
      evidence: "tool",
      statusLabel: "Configure",
      summary: "Inspects the live runtime and prepares client-specific MCP configuration for this project.",
    },
    contextPolicy: DEFAULT_CONTEXT_POLICY,
    verificationPolicy: {
      requireToolEvidenceForLiveFacts: true,
      requireSourceAndFreshness: false,
      requireReceiptForCompletionClaim: false,
      maxToolCalls: 6,
      prohibitedClaims: [
        "Do not claim that an MCP server is connected unless the runtime reports it ready.",
        "Do not claim that configuration was written unless the file write succeeded.",
      ],
    },
    modelPolicy: DEFAULT_MODEL_POLICY,
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
    version: "matterhorn.desk.agent.v2",
    deskId: "blank",
    agentId: "matterhorn",
    workflowId: "matterhorn_blank_chat",
    workflowManifestRef: "matterhorn.workflow.manifest.v1/blank_chat",
    outputDeskId: "blank",
    defaultStageId: "freeform",
    defaultActionId: "ask_matterhorn",
    toolPolicy: {
      runtimeKind: "general_orchestrator",
      denyByDefault: false,
      permissions: {},
      work: [],
      readOnly: ["read", "glob", "grep", "webfetch", "websearch"],
    },
    capabilityPolicy: {
      actionLevel: "workspace_write",
      readsLiveData: false,
      preparesUserAction: false,
      userCompletion: {
        surface: "none",
        availableAfterReview: false,
      },
      ...NEVER_AGENT_SUBMITS,
      evidence: "workspace",
      statusLabel: "General",
      summary: "Coordinates project work and routes specialized requests to the appropriate desk.",
    },
    contextPolicy: {
      ...DEFAULT_CONTEXT_POLICY,
      includeWalletPublicContext: true,
      includeCryptoSafetyPolicy: true,
    },
    verificationPolicy: {
      requireToolEvidenceForLiveFacts: true,
      requireSourceAndFreshness: false,
      requireReceiptForCompletionClaim: false,
      maxToolCalls: 12,
      prohibitedClaims: PROHIBITED_EXECUTION_CLAIMS,
    },
    modelPolicy: {
      ...DEFAULT_MODEL_POLICY,
      requiresToolCalling: false,
    },
    displayName: "Matterhorn Agent",
    description: "General Matterhorn Desks project agent for free-form tasks that do not belong to a dedicated desk.",
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

function completionSurfaceLabel(surface: MatterhornDeskCompletionSurface): string {
  switch (surface) {
    case "external_signer":
      return "The user reviews, signs, and submits in the connected wallet.";
    case "connected_wallet":
      return "The user reviews, signs, and submits in the connected wallet.";
    case "external_client":
      return "The user reviews and completes the action in an external client.";
    case "manual_trade_ticket":
      return "The user opens the separate trade ticket, reviews the exact order, signs a short-lived intent in the connected wallet, and explicitly submits.";
    case "none":
      return "No transaction or external action is part of this desk.";
  }
}

export function buildMatterhornDeskAgentContractPrompt(agent: MatterhornDeskAgentManifest): string {
  const capability = agent.capabilityPolicy;
  const verification = agent.verificationPolicy;
  const context = agent.contextPolicy;
  const toolBoundary = agent.toolPolicy.runtimeKind === "managed_desk"
    ? `Runtime tools are deny-by-default. In Work mode, only ${agent.toolPolicy.work.length} explicitly listed desk tool${agent.toolPolicy.work.length === 1 ? " is" : "s are"} available.`
    : "This is the general orchestrator. Route specialized work to a managed desk instead of impersonating its capabilities.";

  return [
    "## Enforced Matterhorn Desk Contract",
    `Contract: ${agent.version}`,
    `Desk: ${agent.displayName}`,
    `Action level: ${capability.actionLevel}`,
    `Capability: ${capability.summary}`,
    toolBoundary,
    `User completion: ${completionSurfaceLabel(capability.userCompletion.surface)}`,
    ...(capability.userCompletion.featureGate
      ? [`Feature gate: ${capability.userCompletion.featureGate}. If the runtime says it is unavailable, stop at a preview and say so plainly.`]
      : []),
    "The agent may never sign, submit, broadcast, or auto-execute. Watches and automations may never submit.",
    context.includeWalletPublicContext
      ? "Connected public wallet metadata may be used. Never request or expose signing material."
      : "Do not request or use wallet context that is unrelated to this desk.",
    context.selectedMemoryOnly
      ? "Use only memories the user explicitly selected for visible chat context. Never infer hidden memory."
      : "",
    context.allowSecretValues
      ? ""
      : "Environment context may name configured variables, but secret values must never enter the prompt or response.",
    verification.requireToolEvidenceForLiveFacts
      ? "Live facts require evidence from an allowed desk tool. Do not substitute model memory."
      : "",
    verification.requireSourceAndFreshness
      ? "Name the source and freshness for live facts. Mark stale, fallback, or unavailable evidence clearly."
      : "",
    verification.requireReceiptForCompletionClaim
      ? "Never claim an action completed without a matching public receipt or confirmed result."
      : "",
    `Tool-call budget: at most ${verification.maxToolCalls} calls for one user turn unless the user explicitly starts a broader saved workflow.`,
    ...verification.prohibitedClaims,
  ].filter(Boolean).join("\n");
}

export function buildMatterhornDeskAgentSystemPrompt(agent: MatterhornDeskAgentManifest): string {
  return [
    agent.instructions,
    buildMatterhornDeskAgentContractPrompt(agent),
  ].join("\n\n");
}

/**
 * Request-scoped reminder for a managed desk. The complete, versioned desk
 * contract already lives in the OpenCode agent definition generated during
 * workspace initialization. Re-sending that same contract on every turn
 * duplicates hundreds of tokens without adding an enforcement boundary.
 */
export function buildMatterhornDeskRequestOverlay(agent: MatterhornDeskAgentManifest): string {
  return [
    "## Active Matterhorn Desk",
    `Desk: ${agent.displayName}`,
    `Contract: ${agent.version}`,
    "Follow the managed desk contract and its deny-by-default tool allowlist loaded by the runtime.",
  ].join("\n");
}

export function buildMatterhornDeskRuntimeTools(agent: MatterhornDeskAgentManifest): Record<string, boolean> | undefined {
  if (agent.toolPolicy.runtimeKind !== "managed_desk") return undefined;
  return Object.fromEntries([
    ["*", false],
    ...agent.toolPolicy.work.map((tool) => [tool, true] as const),
  ]);
}

export function buildMatterhornDeskReadOnlyTools(agent: MatterhornDeskAgentManifest): Record<string, boolean> {
  return Object.fromEntries([
    ["*", false],
    ...agent.toolPolicy.readOnly.map((tool) => [tool, true] as const),
  ]);
}

/**
 * Deterministic companion to the system prompt. Callers that assemble
 * structured response evidence can use this before presenting a completion
 * claim or accepting an evaluation result.
 */
export function evaluateMatterhornDeskResponseEvidence(
  agent: MatterhornDeskAgentManifest,
  evidence: MatterhornDeskResponseEvidence,
): MatterhornDeskResponseVerificationIssue[] {
  const issues: MatterhornDeskResponseVerificationIssue[] = [];
  const policy = agent.verificationPolicy;

  if (evidence.agentSigningClaimed) issues.push("agent_signing_claim");
  if (evidence.agentSubmissionClaimed) issues.push("agent_submission_claim");
  if (evidence.automationSubmissionClaimed) issues.push("automation_submission_claim");

  if (
    evidence.completionClaimed
    && policy.requireReceiptForCompletionClaim
    && !evidence.receiptEvidencePresent
  ) {
    issues.push("completion_without_receipt");
  }

  if (evidence.liveFactsUsed) {
    if (policy.requireToolEvidenceForLiveFacts && !evidence.toolEvidencePresent) {
      issues.push("live_fact_without_tool_evidence");
    }
    if (policy.requireSourceAndFreshness && !evidence.sourceNamed) {
      issues.push("live_fact_without_source");
    }
    if (policy.requireSourceAndFreshness && !evidence.freshnessNamed) {
      issues.push("live_fact_without_freshness");
    }
  }

  if ((evidence.toolCalls ?? 0) > policy.maxToolCalls) {
    issues.push("tool_call_budget_exceeded");
  }

  return issues;
}
