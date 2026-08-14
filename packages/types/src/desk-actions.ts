import {
  defineDeskTransactionContract,
  type DeskActionTransactionContract,
} from "./desk-transactions.js";

// Desk Action Manifest contract for production Desk V2 action surfaces.
// This file defines every action a user can invoke from a desk launcher or chat thread,
// including required context, safety boundaries, execution state, prompt templates,
// MCP tool hints, CLI hints, and result card kinds.

export const DESK_ACTION_EXECUTION_STATES = [
  "live_read",
  "preview_only",
  "user_authorized_submit",
  "external_signer_required",
  "planned_not_live",
] as const;
export type DeskActionExecutionState = (typeof DESK_ACTION_EXECUTION_STATES)[number];

export const DESK_ACTION_CARD_KINDS = [
  "summary_card",
  "preview_card",
  "handoff_card",
  "watch_card",
  "receipt_card",
  "education_card",
  "settings_card",
  "empty_card",
] as const;
export type DeskActionCardKind = (typeof DESK_ACTION_CARD_KINDS)[number];

export const DESK_ACTION_USER_COMPLETION_SURFACES = [
  "connected_wallet",
  "external_signer",
  "workspace",
] as const;
export type DeskActionUserCompletionSurface = (typeof DESK_ACTION_USER_COMPLETION_SURFACES)[number];

export const DESK_ACTION_USER_COMPLETION_RESULTS = [
  "submitted_transaction",
  "public_receipt",
  "workspace_output",
] as const;
export type DeskActionUserCompletionResult = (typeof DESK_ACTION_USER_COMPLETION_RESULTS)[number];

export interface DeskActionUserCompletion {
  surface: DeskActionUserCompletionSurface;
  actionLabel: string;
  result: DeskActionUserCompletionResult;
  featureGate?: string;
}

export interface DeskActionSafetyBoundary {
  liveSubmissionEnabled: false;
  canSubmit: boolean;
  canRequestSecrets: false;
  acceptsPrivateKeys: false;
  acceptsSeedPhrases: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
  acceptsWalletExports: false;
  requiresExternalSigner: boolean;
  allowsRealFunds: false;
}

export interface DeskActionManifest {
  version: "matterhorn.desk.action.manifest.v1";
  id: string;
  deskId: string;
  title: string;
  description: string;
  requiredContextFields: string[];
  optionalContextFields: string[];
  safetyBoundary: DeskActionSafetyBoundary;
  executionState: DeskActionExecutionState;
  promptTemplate: string;
  mcpToolHints?: string[];
  cliCommandHints?: string[];
  resultCardKinds: DeskActionCardKind[];
  /**
   * Describes the separate, user-authorized completion surface. The agent safety
   * boundary above remains authoritative: agents never sign or submit.
   */
  userCompletion?: DeskActionUserCompletion;
  /**
   * Describes the complete user transaction path. This is deliberately
   * separate from the agent boundary: the agent prepares, the user approves.
   */
  transaction?: DeskActionTransactionContract;
}

export const DEFAULT_DESK_ACTION_SAFETY_BOUNDARY: DeskActionSafetyBoundary = {
  liveSubmissionEnabled: false,
  canSubmit: false,
  canRequestSecrets: false,
  acceptsPrivateKeys: false,
  acceptsSeedPhrases: false,
  acceptsApiSecrets: false,
  acceptsRawSignatures: false,
  acceptsSignedPayloads: false,
  acceptsWalletExports: false,
  requiresExternalSigner: false,
  allowsRealFunds: false,
};

// --- Bittensor actions ---

export const BITTENSOR_SHOW_TAO_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_show_tao",
  deskId: "bittensor",
  title: "Show my TAO",
  description: "Display TAO balance and stake overview for a connected SS58 address.",
  requiredContextFields: ["ss58Address"],
  optionalContextFields: ["subtensorNetwork"],
  safetyBoundary: {
    ...DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
    canSubmit: false,
  },
  executionState: "live_read",
  promptTemplate: "Show my TAO for {ss58Address}",
  mcpToolHints: ["bittensor_read_balance"],
  cliCommandHints: ["matterhorn-work bittensor balance {ss58Address}"],
  resultCardKinds: ["summary_card"],
};

export const BITTENSOR_WALLET_STAKE_READ_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_wallet_stake_read",
  deskId: "bittensor",
  title: "Where am I staked?",
  description: "List current delegations and stake allocations across subnets.",
  requiredContextFields: ["ss58Address"],
  optionalContextFields: ["subnetId"],
  safetyBoundary: {
    ...DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
    canSubmit: false,
  },
  executionState: "live_read",
  promptTemplate: "Where is {ss58Address} staked?",
  mcpToolHints: ["bittensor_read_stake"],
  cliCommandHints: ["matterhorn-work bittensor stake {ss58Address}"],
  resultCardKinds: ["summary_card", "watch_card"],
};

export const BITTENSOR_DISCOVER_SUBNETS_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_discover_subnets",
  deskId: "bittensor",
  title: "Discover subnets",
  description: "Explore Bittensor subnets, their emissions, and recent activity.",
  requiredContextFields: [],
  optionalContextFields: ["subnetId", "sortBy"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show Bittensor subnets",
  mcpToolHints: ["bittensor_list_subnets"],
  cliCommandHints: ["matterhorn-work bittensor subnets"],
  resultCardKinds: ["summary_card"],
};

export const BITTENSOR_COMPARE_VALIDATORS_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_compare_validators",
  deskId: "bittensor",
  title: "Compare validators",
  description: "Compare validator performance, take, and stake on a subnet.",
  requiredContextFields: ["subnetId"],
  optionalContextFields: ["validatorHotkeys", "minStake"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Compare validators on subnet {subnetId}",
  mcpToolHints: ["bittensor_compare_validators"],
  cliCommandHints: ["matterhorn-work bittensor validators --subnet {subnetId}"],
  resultCardKinds: ["summary_card"],
};

export const BITTENSOR_PREPARE_STAKE_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_prepare_stake",
  deskId: "bittensor",
  title: "Review TAO stake",
  description: "Prepare the exact stake, then review, sign, and broadcast it with a connected Bittensor wallet.",
  requiredContextFields: ["ss58Address", "amount", "validatorHotkey"],
  optionalContextFields: ["subnetId"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Prepare staking {amount} TAO with {validatorHotkey}",
  mcpToolHints: ["bittensor_prepare_stake_handoff"],
  cliCommandHints: ["matterhorn-work bittensor stake-handoff --amount {amount} --validator {validatorHotkey}"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review and submit in wallet",
    result: "submitted_transaction",
    featureGate: "bittensor_wallet",
  },
  transaction: defineDeskTransactionContract({
    protocol: "bittensor",
    family: "bittensor_stake",
    supportLevel: "connected_wallet",
    submissionAuthority: "connected_wallet",
    simulationPolicy: "required",
    walletKinds: ["polkadot_extension"],
    networks: ["finney"],
    limitations: ["Requires a compatible injected Bittensor wallet and final wallet approval."],
  }),
};

export const BITTENSOR_PREPARE_UNSTAKE_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_prepare_unstake",
  deskId: "bittensor",
  title: "Review TAO unstake",
  description: "Prepare the exact unstake, then review, sign, and broadcast it with a connected Bittensor wallet.",
  requiredContextFields: ["ss58Address", "amount", "validatorHotkey"],
  optionalContextFields: ["subnetId"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Prepare unstaking {amount} TAO from {validatorHotkey}",
  mcpToolHints: ["bittensor_prepare_unstake_handoff"],
  cliCommandHints: ["matterhorn-work bittensor unstake-handoff --amount {amount} --validator {validatorHotkey}"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review and submit in wallet",
    result: "submitted_transaction",
    featureGate: "bittensor_wallet",
  },
  transaction: defineDeskTransactionContract({
    protocol: "bittensor",
    family: "bittensor_unstake",
    supportLevel: "connected_wallet",
    submissionAuthority: "connected_wallet",
    simulationPolicy: "required",
    walletKinds: ["polkadot_extension"],
    networks: ["finney"],
    limitations: ["Requires a compatible injected Bittensor wallet and final wallet approval."],
  }),
};

export const BITTENSOR_PREPARE_TRANSFER_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_prepare_transfer",
  deskId: "bittensor",
  title: "Review TAO transfer",
  description:
    "Prepare the exact Finney transfer, then review, sign, and broadcast it with a connected Bittensor wallet. Matterhorn never holds the key.",
  requiredContextFields: ["fromSs58Address", "toSs58Address", "amount"],
  optionalContextFields: ["memo"],
  safetyBoundary: {
    ...DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
    requiresExternalSigner: false,
  },
  executionState: "user_authorized_submit",
  promptTemplate: "Prepare transferring {amount} TAO to {toSs58Address}",
  mcpToolHints: ["bittensor_prepare_transfer_handoff"],
  cliCommandHints: ["matterhorn-work bittensor transfer-handoff --to {toSs58Address} --amount {amount}"],
  resultCardKinds: ["preview_card", "handoff_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review and submit in wallet",
    result: "submitted_transaction",
    featureGate: "bittensor_wallet",
  },
  transaction: defineDeskTransactionContract({
    protocol: "bittensor",
    family: "bittensor_transfer",
    supportLevel: "connected_wallet",
    submissionAuthority: "connected_wallet",
    simulationPolicy: "required",
    walletKinds: ["polkadot_extension"],
    networks: ["finney"],
    limitations: ["Requires a compatible injected Bittensor wallet and final wallet approval."],
  }),
};

export const BITTENSOR_CREATE_WATCH_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_create_watch",
  deskId: "bittensor",
  title: "Watch subnet or validator",
  description: "Create a watchlist entry for subnet emissions or validator changes.",
  requiredContextFields: ["watchType", "targetId"],
  optionalContextFields: ["threshold"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Watch {watchType} {targetId}",
  mcpToolHints: ["bittensor_create_watch"],
  cliCommandHints: ["matterhorn-work bittensor watch --type {watchType} --target {targetId}"],
  resultCardKinds: ["watch_card"],
};

export const BITTENSOR_IMPORT_RECEIPT_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_import_receipt",
  deskId: "bittensor",
  title: "Import receipt",
  description: "Import a public transaction receipt to update memory and watchlists.",
  requiredContextFields: ["receipt"],
  optionalContextFields: ["label"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Import this Bittensor receipt",
  mcpToolHints: ["bittensor_import_receipt"],
  cliCommandHints: ["matterhorn-work bittensor receipt"],
  resultCardKinds: ["receipt_card"],
};

export const BITTENSOR_EXPLAIN_KEYS_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "bittensor_explain_keys",
  deskId: "bittensor",
  title: "Explain coldkey vs hotkey",
  description: "Educational explanation of SS58 coldkeys, hotkeys, and why Matterhorn never asks for them.",
  requiredContextFields: [],
  optionalContextFields: [],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Explain coldkey and hotkey in Bittensor",
  mcpToolHints: [],
  cliCommandHints: [],
  resultCardKinds: ["education_card"],
};

// --- Hyperliquid actions ---

export const HYPERLIQUID_MARKET_READ_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_market_read",
  deskId: "hyperliquid",
  title: "Read market",
  description: "Read a Hyperliquid perp market summary including mark price and funding.",
  requiredContextFields: ["symbol"],
  optionalContextFields: ["interval"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show {symbol} on Hyperliquid",
  mcpToolHints: ["hyperliquid_read_market"],
  cliCommandHints: ["matterhorn-work hyperliquid market {symbol}"],
  resultCardKinds: ["summary_card"],
};

export const HYPERLIQUID_ORDERBOOK_READ_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_orderbook_read",
  deskId: "hyperliquid",
  title: "Show orderbook",
  description: "Display the Hyperliquid orderbook for a symbol.",
  requiredContextFields: ["symbol"],
  optionalContextFields: ["depth"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show {symbol} orderbook on Hyperliquid",
  mcpToolHints: ["hyperliquid_read_orderbook"],
  cliCommandHints: ["matterhorn-work hyperliquid orderbook {symbol}"],
  resultCardKinds: ["summary_card"],
};

export const HYPERLIQUID_ACCOUNT_EXPOSURE_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_account_exposure",
  deskId: "hyperliquid",
  title: "Show exposure",
  description: "Show open positions, margin, and account exposure for a public EVM address.",
  requiredContextFields: ["evmAddress"],
  optionalContextFields: [],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show my Hyperliquid exposure for {evmAddress}",
  mcpToolHints: ["hyperliquid_read_exposure"],
  cliCommandHints: ["matterhorn-work hyperliquid exposure {evmAddress}"],
  resultCardKinds: ["summary_card"],
};

export const HYPERLIQUID_FUNDING_READ_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_funding_read",
  deskId: "hyperliquid",
  title: "Show funding",
  description: "Display current and predicted funding rates for Hyperliquid perps.",
  requiredContextFields: ["symbol"],
  optionalContextFields: [],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show {symbol} funding on Hyperliquid",
  mcpToolHints: ["hyperliquid_read_funding"],
  cliCommandHints: ["matterhorn-work hyperliquid funding {symbol}"],
  resultCardKinds: ["summary_card"],
};

export const HYPERLIQUID_OPEN_ORDERS_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_open_orders",
  deskId: "hyperliquid",
  title: "Show open orders",
  description: "List open orders for a public EVM address.",
  requiredContextFields: ["evmAddress"],
  optionalContextFields: ["symbol"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show open orders for {evmAddress} on Hyperliquid",
  mcpToolHints: ["hyperliquid_read_open_orders"],
  cliCommandHints: ["matterhorn-work hyperliquid orders {evmAddress}"],
  resultCardKinds: ["summary_card"],
};

export const HYPERLIQUID_PREVIEW_ORDER_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_preview_order",
  deskId: "hyperliquid",
  title: "Prepare order",
  description:
    "Prepare the exact Hyperliquid order, then review it in the trade ticket and approve its short-lived intent with your connected wallet.",
  requiredContextFields: ["symbol", "side", "size"],
  optionalContextFields: ["price", "orderType"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Prepare a {side} {size} {symbol} order on Hyperliquid",
  mcpToolHints: ["hyperliquid_preview_order"],
  cliCommandHints: ["matterhorn-work hyperliquid preview-order --symbol {symbol} --side {side} --size {size}"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review, sign, and submit",
    result: "submitted_transaction",
    featureGate: "hyperliquid_execution",
  },
  transaction: defineDeskTransactionContract({
    protocol: "hyperliquid",
    family: "hyperliquid_order",
    supportLevel: "connected_wallet",
    submissionAuthority: "matterhorn_after_signature",
    simulationPolicy: "required",
    walletKinds: ["evm_wallet"],
    networks: ["hyperliquid-testnet", "hyperliquid-mainnet"],
    limitations: ["Current ticket supports market and limit orders with bounded slippage and notional."],
  }),
};

export const HYPERLIQUID_CANCEL_ORDER_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_cancel_order",
  deskId: "hyperliquid",
  title: "Cancel order",
  description: "Review one open order by ID, then authorize its cancellation with the connected wallet.",
  requiredContextFields: ["symbol", "orderId"],
  optionalContextFields: ["network"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Cancel Hyperliquid order {orderId} for {symbol}",
  mcpToolHints: ["hyperliquid_cancel_order"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review, sign, and cancel",
    result: "submitted_transaction",
    featureGate: "hyperliquid_execution",
  },
  transaction: defineDeskTransactionContract({
    protocol: "hyperliquid",
    family: "hyperliquid_cancel_order",
    supportLevel: "connected_wallet",
    submissionAuthority: "matterhorn_after_signature",
    simulationPolicy: "required",
    walletKinds: ["evm_wallet"],
    networks: ["hyperliquid-testnet", "hyperliquid-mainnet"],
    limitations: ["The cancellation is bound to the exact reviewed order ID."],
  }),
};

export const HYPERLIQUID_MODIFY_ORDER_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_modify_order",
  deskId: "hyperliquid",
  title: "Modify order",
  description: "Review replacement terms for an open order, then authorize the exact modification.",
  requiredContextFields: ["symbol", "orderId", "side", "size", "orderType"],
  optionalContextFields: ["price", "network", "reduceOnly"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Modify Hyperliquid order {orderId} for {symbol}",
  mcpToolHints: ["hyperliquid_modify_order"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review, sign, and modify",
    result: "submitted_transaction",
    featureGate: "hyperliquid_execution",
  },
  transaction: defineDeskTransactionContract({
    protocol: "hyperliquid",
    family: "hyperliquid_modify_order",
    supportLevel: "connected_wallet",
    submissionAuthority: "matterhorn_after_signature",
    simulationPolicy: "required",
    walletKinds: ["evm_wallet"],
    networks: ["hyperliquid-testnet", "hyperliquid-mainnet"],
    limitations: ["The reviewed modification replaces one exact open order."],
  }),
};

export const HYPERLIQUID_CLOSE_POSITION_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_close_position",
  deskId: "hyperliquid",
  title: "Close position",
  description: "Review a reduce-only close for the selected position size, then authorize it with the connected wallet.",
  requiredContextFields: ["symbol", "side", "size"],
  optionalContextFields: ["network", "slippageBps"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Close {size} {symbol} on Hyperliquid",
  mcpToolHints: ["hyperliquid_close_position"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review, sign, and close",
    result: "submitted_transaction",
    featureGate: "hyperliquid_execution",
  },
  transaction: defineDeskTransactionContract({
    protocol: "hyperliquid",
    family: "hyperliquid_close_position",
    supportLevel: "connected_wallet",
    submissionAuthority: "matterhorn_after_signature",
    simulationPolicy: "required",
    walletKinds: ["evm_wallet"],
    networks: ["hyperliquid-testnet", "hyperliquid-mainnet"],
    limitations: ["Position closing uses a reduce-only IOC order within the reviewed slippage bound."],
  }),
};

export const HYPERLIQUID_EXTERNAL_SIGNER_HANDOFF_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_external_signer_handoff",
  deskId: "hyperliquid",
  title: "Open trade review",
  description:
    "Build a redacted handoff for the separate Hyperliquid trade ticket. The agent cannot sign or submit; the user must review the exact order and approve a short-lived intent with a connected wallet.",
  requiredContextFields: ["evmAddress", "symbol", "side", "size"],
  optionalContextFields: ["price", "orderType"],
  safetyBoundary: {
    ...DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
    requiresExternalSigner: true,
  },
  executionState: "external_signer_required",
  promptTemplate: "Prepare a {side} {size} {symbol} handoff on Hyperliquid",
  mcpToolHints: ["hyperliquid_prepare_handoff"],
  cliCommandHints: ["matterhorn-work hyperliquid handoff --symbol {symbol} --side {side} --size {size}"],
  resultCardKinds: ["preview_card", "handoff_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review, sign, and submit",
    result: "submitted_transaction",
    featureGate: "hyperliquid_execution",
  },
  transaction: defineDeskTransactionContract({
    protocol: "hyperliquid",
    family: "hyperliquid_order",
    supportLevel: "connected_wallet",
    submissionAuthority: "matterhorn_after_signature",
    simulationPolicy: "required",
    walletKinds: ["evm_wallet"],
    networks: ["hyperliquid-testnet", "hyperliquid-mainnet"],
    limitations: ["The user must approve the exact short-lived order intent in the connected wallet."],
  }),
};

export const HYPERLIQUID_CREATE_WATCH_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_create_watch",
  deskId: "hyperliquid",
  title: "Watch market",
  description: "Add a Hyperliquid market or funding rate to the watchlist.",
  requiredContextFields: ["symbol"],
  optionalContextFields: ["threshold"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Watch {symbol} on Hyperliquid",
  mcpToolHints: ["hyperliquid_create_watch"],
  cliCommandHints: ["matterhorn-work hyperliquid watch {symbol}"],
  resultCardKinds: ["watch_card"],
};

export const HYPERLIQUID_IMPORT_RECEIPT_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "hyperliquid_import_receipt",
  deskId: "hyperliquid",
  title: "Import receipt",
  description: "Import a public Hyperliquid receipt to update memory.",
  requiredContextFields: ["receipt"],
  optionalContextFields: ["label"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Import this Hyperliquid receipt",
  mcpToolHints: ["hyperliquid_import_receipt"],
  cliCommandHints: ["matterhorn-work hyperliquid receipt"],
  resultCardKinds: ["receipt_card"],
};

// --- Polymarket actions ---

export const POLYMARKET_MARKET_DISCOVERY_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_market_discovery",
  deskId: "polymarket",
  title: "Discover markets",
  description: "Search and filter Polymarket prediction markets.",
  requiredContextFields: [],
  optionalContextFields: ["query", "category", "volumeMin"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Find Polymarket markets about {query}",
  mcpToolHints: ["polymarket_search_markets"],
  cliCommandHints: ["matterhorn-work polymarket search {query}"],
  resultCardKinds: ["summary_card"],
};

export const POLYMARKET_OUTCOME_PROBABILITIES_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_outcome_probabilities",
  deskId: "polymarket",
  title: "Outcome probabilities",
  description: "Show current outcome probabilities and price history for a market.",
  requiredContextFields: ["marketId"],
  optionalContextFields: [],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show probabilities for Polymarket market {marketId}",
  mcpToolHints: ["polymarket_read_probabilities"],
  cliCommandHints: ["matterhorn-work polymarket probabilities {marketId}"],
  resultCardKinds: ["summary_card"],
};

export const POLYMARKET_LIQUIDITY_ORDERBOOK_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_liquidity_orderbook",
  deskId: "polymarket",
  title: "Show orderbook",
  description: "Display the Polymarket orderbook and liquidity for a market outcome.",
  requiredContextFields: ["marketId", "outcomeId"],
  optionalContextFields: ["depth"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show orderbook for {marketId} outcome {outcomeId}",
  mcpToolHints: ["polymarket_read_orderbook"],
  cliCommandHints: ["matterhorn-work polymarket orderbook {marketId} {outcomeId}"],
  resultCardKinds: ["summary_card"],
};

export const POLYMARKET_COMPLIANCE_CHECK_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_compliance_check",
  deskId: "polymarket",
  title: "Compliance check",
  description: "Surface jurisdictional restrictions and market eligibility without placing a trade.",
  requiredContextFields: ["marketId"],
  optionalContextFields: ["jurisdiction"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "preview_only",
  promptTemplate: "Check if I can trade Polymarket market {marketId}",
  mcpToolHints: ["polymarket_compliance_check"],
  cliCommandHints: ["matterhorn-work polymarket compliance {marketId}"],
  resultCardKinds: ["preview_card"],
};

export const POLYMARKET_PREVIEW_TRADE_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_preview_trade",
  deskId: "polymarket",
  title: "Prepare trade",
  description:
    "Prepare an eligible buy order and compliance check. Review the maximum loss, then authorize the exact order in a connected Polygon wallet.",
  requiredContextFields: ["marketId", "outcomeId", "amount"],
  optionalContextFields: ["side"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Prepare buying ${amount} of {outcomeId} in {marketId}",
  mcpToolHints: ["polymarket_preview_trade"],
  cliCommandHints: ["matterhorn-work polymarket preview-trade --market {marketId} --outcome {outcomeId} --amount {amount}"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Authorize and submit",
    result: "submitted_transaction",
    featureGate: "polymarket_execution",
  },
  transaction: defineDeskTransactionContract({
    protocol: "polymarket",
    family: "polymarket_buy",
    supportLevel: "connected_wallet",
    submissionAuthority: "matterhorn_after_signature",
    simulationPolicy: "required",
    walletKinds: ["evm_wallet"],
    networks: ["polygon"],
    limitations: ["Direct submission requires an eligible browser-wallet EOA after compliance checks."],
  }),
};

export const POLYMARKET_SELL_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_sell",
  deskId: "polymarket",
  title: "Sell shares",
  description: "Review the selected outcome, share quantity, and estimated proceeds before authorizing the sale.",
  requiredContextFields: ["marketId", "outcomeId", "shares"],
  optionalContextFields: ["slippageTolerance"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Sell {shares} shares of {outcomeId} in {marketId}",
  mcpToolHints: ["polymarket_sell_preview"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Authorize and sell",
    result: "submitted_transaction",
    featureGate: "polymarket_execution",
  },
  transaction: defineDeskTransactionContract({
    protocol: "polymarket",
    family: "polymarket_sell",
    supportLevel: "connected_wallet",
    submissionAuthority: "matterhorn_after_signature",
    simulationPolicy: "required",
    walletKinds: ["evm_wallet"],
    networks: ["polygon"],
    limitations: ["Requires an eligible browser-wallet EOA that owns the selected outcome shares."],
  }),
};

export const POLYMARKET_CANCEL_ORDER_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_cancel_order",
  deskId: "polymarket",
  title: "Cancel orders",
  description: "Review exact order IDs or all open orders before authorizing cancellation.",
  requiredContextFields: ["orderIdsOrAll"],
  optionalContextFields: [],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Cancel Polymarket orders {orderIdsOrAll}",
  mcpToolHints: ["polymarket_cancel_orders"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Authorize cancellation",
    result: "submitted_transaction",
    featureGate: "polymarket_execution",
  },
  transaction: defineDeskTransactionContract({
    protocol: "polymarket",
    family: "polymarket_cancel_order",
    supportLevel: "connected_wallet",
    submissionAuthority: "matterhorn_after_signature",
    simulationPolicy: "required",
    walletKinds: ["evm_wallet"],
    networks: ["polygon"],
    limitations: ["Cancellation applies only to the exact reviewed order IDs, unless the user explicitly chooses all orders."],
  }),
};

export const POLYMARKET_EXTERNAL_SIGNER_HANDOFF_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_external_signer_handoff",
  deskId: "polymarket",
  title: "Prepare handoff",
  description:
    "Build an external-client handoff for proxy accounts or advanced order types that the connected-wallet ticket does not support.",
  requiredContextFields: ["evmAddress", "marketId", "outcomeId", "amount"],
  optionalContextFields: ["side"],
  safetyBoundary: {
    ...DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
    requiresExternalSigner: true,
  },
  executionState: "external_signer_required",
  promptTemplate: "Prepare an advanced {side} handoff for ${amount} of {outcomeId} in {marketId}",
  mcpToolHints: ["polymarket_prepare_handoff"],
  cliCommandHints: ["matterhorn-work polymarket handoff --market {marketId} --outcome {outcomeId} --amount {amount}"],
  resultCardKinds: ["preview_card", "handoff_card"],
  userCompletion: {
    surface: "external_signer",
    actionLabel: "Finish in Polymarket client",
    result: "public_receipt",
  },
  transaction: defineDeskTransactionContract({
    protocol: "polymarket",
    family: "polymarket_external_client_order",
    supportLevel: "external_client",
    submissionAuthority: "external_client",
    simulationPolicy: "when_available",
    walletKinds: ["external_client"],
    networks: ["polygon"],
    limitations: ["Proxy accounts and advanced order types finish in an eligible Polymarket client."],
  }),
};

export const POLYMARKET_CREATE_WATCH_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_create_watch",
  deskId: "polymarket",
  title: "Watch market",
  description: "Add a Polymarket market to the watchlist.",
  requiredContextFields: ["marketId"],
  optionalContextFields: ["threshold"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Watch Polymarket market {marketId}",
  mcpToolHints: ["polymarket_create_watch"],
  cliCommandHints: ["matterhorn-work polymarket watch {marketId}"],
  resultCardKinds: ["watch_card"],
};

export const POLYMARKET_IMPORT_RECEIPT_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "polymarket_import_receipt",
  deskId: "polymarket",
  title: "Import receipt",
  description: "Import a public Polymarket receipt to update memory.",
  requiredContextFields: ["receipt"],
  optionalContextFields: ["label"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Import this Polymarket receipt",
  mcpToolHints: ["polymarket_import_receipt"],
  cliCommandHints: ["matterhorn-work polymarket receipt"],
  resultCardKinds: ["receipt_card"],
};

// --- Sui actions ---

export const SUI_ACCOUNT_READ_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "sui_account_read",
  deskId: "sui",
  title: "Read Sui wallet",
  description: "Read a public Sui address, network, and balance without custody.",
  requiredContextFields: ["suiAddress"],
  optionalContextFields: ["network"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show Sui account context for {suiAddress}",
  mcpToolHints: ["sui_read_account", "sui_read_balance"],
  cliCommandHints: ["matterhorn-work sui account {suiAddress}"],
  resultCardKinds: ["summary_card"],
};

export const SUI_TRANSFER_PREVIEW_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "sui_transfer_preview",
  deskId: "sui",
  title: "Review Sui transfer",
  description:
    "Prepare the exact transfer, then review, sign, and submit it in a connected Sui wallet on web. Desktop provides an external-wallet handoff.",
  requiredContextFields: ["sender", "recipient", "amountSui"],
  optionalContextFields: ["network", "memo"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Prepare a Sui transfer from {sender} to {recipient} for {amountSui} SUI",
  mcpToolHints: ["sui_preview_transfer"],
  cliCommandHints: ["matterhorn-work sui preview-transfer --from {sender} --to {recipient} --amount {amountSui}"],
  resultCardKinds: ["preview_card", "handoff_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Sign in Sui wallet",
    result: "submitted_transaction",
    featureGate: "sui_wallet_standard",
  },
  transaction: defineDeskTransactionContract({
    protocol: "sui",
    family: "sui_transfer",
    supportLevel: "connected_wallet",
    submissionAuthority: "connected_wallet",
    simulationPolicy: "required",
    walletKinds: ["sui_wallet"],
    networks: ["sui-testnet", "sui-mainnet"],
    limitations: ["Requires a Wallet Standard compatible Sui wallet; desktop uses a wallet handoff."],
  }),
};

export const SUI_COIN_TRANSFER_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "sui_coin_transfer",
  deskId: "sui",
  title: "Transfer a Sui coin",
  description: "Review the coin type, recipient, and amount before signing the transfer in a connected Sui wallet.",
  requiredContextFields: ["sender", "recipient", "coinType", "amount"],
  optionalContextFields: ["network"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Transfer {amount} of {coinType} from {sender} to {recipient}",
  mcpToolHints: ["sui_preview_coin_transfer"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review and sign in Sui wallet",
    result: "submitted_transaction",
    featureGate: "sui_wallet_standard",
  },
  transaction: defineDeskTransactionContract({
    protocol: "sui",
    family: "sui_coin_transfer",
    supportLevel: "connected_wallet",
    submissionAuthority: "connected_wallet",
    simulationPolicy: "required",
    walletKinds: ["sui_wallet"],
    networks: ["sui-testnet", "sui-mainnet"],
    limitations: ["The connected wallet must own sufficient coins of the exact reviewed type."],
  }),
};

export const SUI_OBJECT_TRANSFER_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "sui_object_transfer",
  deskId: "sui",
  title: "Transfer an object",
  description: "Review one Sui object or NFT and its recipient before signing in the connected wallet.",
  requiredContextFields: ["sender", "recipient", "objectId"],
  optionalContextFields: ["network"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Transfer Sui object {objectId} from {sender} to {recipient}",
  mcpToolHints: ["sui_preview_object_transfer"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review and sign in Sui wallet",
    result: "submitted_transaction",
    featureGate: "sui_wallet_standard",
  },
  transaction: defineDeskTransactionContract({
    protocol: "sui",
    family: "sui_object_transfer",
    supportLevel: "connected_wallet",
    submissionAuthority: "connected_wallet",
    simulationPolicy: "required",
    walletKinds: ["sui_wallet"],
    networks: ["sui-testnet", "sui-mainnet"],
    limitations: ["The object must be transferable and owned by the connected wallet."],
  }),
};

export const SUI_BATCH_TRANSFER_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "sui_batch_transfer",
  deskId: "sui",
  title: "Send a batch",
  description: "Review every SUI recipient and amount together before signing one batch transaction.",
  requiredContextFields: ["sender", "transfers"],
  optionalContextFields: ["network"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "user_authorized_submit",
  promptTemplate: "Prepare a Sui batch transfer from {sender}: {transfers}",
  mcpToolHints: ["sui_preview_batch_transfer"],
  resultCardKinds: ["preview_card", "receipt_card"],
  userCompletion: {
    surface: "connected_wallet",
    actionLabel: "Review batch and sign",
    result: "submitted_transaction",
    featureGate: "sui_wallet_standard",
  },
  transaction: defineDeskTransactionContract({
    protocol: "sui",
    family: "sui_batch_transaction",
    supportLevel: "connected_wallet",
    submissionAuthority: "connected_wallet",
    simulationPolicy: "required",
    walletKinds: ["sui_wallet"],
    networks: ["sui-testnet", "sui-mainnet"],
    limitations: ["Current batch execution supports native SUI transfers reviewed as one transaction."],
  }),
};

export const SUI_IMPORT_RECEIPT_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "sui_import_receipt",
  deskId: "sui",
  title: "Import receipt",
  description: "Import public Sui transaction metadata after the user signs in their own wallet.",
  requiredContextFields: ["transactionDigest"],
  optionalContextFields: ["previewSha256", "network", "explorerUrl"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Import this public Sui transaction receipt: {transactionDigest}",
  mcpToolHints: ["sui_import_receipt"],
  cliCommandHints: ["matterhorn-work sui receipt {transactionDigest}"],
  resultCardKinds: ["receipt_card"],
};

// --- Wellness actions ---

export const WELLNESS_BUILD_PROGRAM_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "wellness_build_program",
  deskId: "wellness",
  title: "Build program",
  description: "Generate an educational, non-medical longevity program from a goal and audience.",
  requiredContextFields: ["goal", "audience"],
  optionalContextFields: ["durationWeeks", "format"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Build a {durationWeeks}-week {goal} program for {audience}",
  mcpToolHints: ["wellness_build_program"],
  cliCommandHints: ["matterhorn-work wellness build --goal {goal} --audience {audience}"],
  resultCardKinds: ["education_card"],
  userCompletion: {
    surface: "workspace",
    actionLabel: "Save program",
    result: "workspace_output",
  },
};

export const WELLNESS_GENERATE_ARTIFACTS_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "wellness_generate_artifacts",
  deskId: "wellness",
  title: "Generate artifacts",
  description: "Create intake forms, schedules, and education packets for a longevity program.",
  requiredContextFields: ["programId"],
  optionalContextFields: ["artifactTypes"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Generate artifacts for program {programId}",
  mcpToolHints: ["wellness_generate_artifacts"],
  cliCommandHints: ["matterhorn-work wellness artifacts {programId}"],
  resultCardKinds: ["education_card"],
  userCompletion: {
    surface: "workspace",
    actionLabel: "Save artifacts",
    result: "workspace_output",
  },
};

export const WELLNESS_PACKAGE_SERVICE_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "wellness_package_service",
  deskId: "wellness",
  title: "Package service",
  description: "Package a program into a client-facing service offer. No live payments or hosting.",
  requiredContextFields: ["programId"],
  optionalContextFields: ["price", "currency"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Package program {programId} as a service",
  mcpToolHints: ["wellness_package_service"],
  cliCommandHints: ["matterhorn-work wellness package {programId}"],
  resultCardKinds: ["summary_card", "education_card"],
  userCompletion: {
    surface: "workspace",
    actionLabel: "Save service package",
    result: "workspace_output",
  },
};

export const WELLNESS_PLAN_LIVE_SERVICE_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "wellness_plan_live_service",
  deskId: "wellness",
  title: "Plan live service",
  description: "Plan future live payments, email, hosting, or access integrations. Not available today.",
  requiredContextFields: [],
  optionalContextFields: ["serviceType"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "planned_not_live",
  promptTemplate: "Plan future {serviceType} integration for my longevity service",
  mcpToolHints: [],
  cliCommandHints: [],
  resultCardKinds: ["preview_card"],
};

// --- Memory actions ---

export const MEMORY_REVIEW_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "memory_review",
  deskId: "memory",
  title: "Review memory",
  description: "Inspect saved memory records across desks.",
  requiredContextFields: [],
  optionalContextFields: ["deskId", "kind", "query"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show my memory",
  mcpToolHints: ["memory_review"],
  cliCommandHints: ["matterhorn-work memory list"],
  resultCardKinds: ["summary_card"],
};

export const MEMORY_MANAGE_SUGGESTIONS_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "memory_manage_suggestions",
  deskId: "memory",
  title: "Manage suggestions",
  description: "Confirm, edit, or dismiss pending memory suggestions.",
  requiredContextFields: [],
  optionalContextFields: ["status"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show my memory suggestions",
  mcpToolHints: ["memory_manage_suggestions"],
  cliCommandHints: ["matterhorn-work memory suggestions"],
  resultCardKinds: ["summary_card", "settings_card"],
};

export const MEMORY_FORGET_RECORD_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "memory_forget_record",
  deskId: "memory",
  title: "Forget record",
  description: "Permanently delete a memory record.",
  requiredContextFields: ["recordId"],
  optionalContextFields: [],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Forget memory record {recordId}",
  mcpToolHints: ["memory_forget_record"],
  cliCommandHints: ["matterhorn-work memory forget {recordId}"],
  resultCardKinds: ["settings_card"],
  userCompletion: {
    surface: "workspace",
    actionLabel: "Confirm deletion",
    result: "workspace_output",
  },
};

export const MEMORY_EXPORT_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "memory_export",
  deskId: "memory",
  title: "Export memory",
  description: "Export memory records for backup or portability. Secrets and clinical records are excluded.",
  requiredContextFields: [],
  optionalContextFields: ["deskId", "format"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Export my memory",
  mcpToolHints: ["memory_export"],
  cliCommandHints: ["matterhorn-work memory export"],
  resultCardKinds: ["summary_card"],
  userCompletion: {
    surface: "workspace",
    actionLabel: "Export memory",
    result: "workspace_output",
  },
};

// --- MCPs actions ---

export const MCPS_BROWSE_TOOLS_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "mcps_browse_tools",
  deskId: "mcps",
  title: "Browse tools",
  description: "View managed MCP tools, connection health, and access boundaries.",
  requiredContextFields: [],
  optionalContextFields: ["category"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "Show my managed MCP tools and connection health",
  mcpToolHints: [],
  cliCommandHints: ["matterhorn-work mcps browse"],
  resultCardKinds: ["summary_card"],
};

export const MCPS_INSTALL_TOOL_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "mcps_install_tool",
  deskId: "mcps",
  title: "Install tool",
  description: "Configure a custom MCP in Matterhorn Desktop. Web workspaces use managed tools and do not accept custom MCP credentials.",
  requiredContextFields: ["toolId"],
  optionalContextFields: ["version"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "planned_not_live",
  promptTemplate: "Install MCP tool {toolId}",
  mcpToolHints: [],
  cliCommandHints: ["matterhorn-work mcps install {toolId}"],
  resultCardKinds: ["settings_card"],
};

export const MCPS_MANAGE_PERMISSIONS_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "mcps_manage_permissions",
  deskId: "mcps",
  title: "Manage permissions",
  description: "Review and change custom MCP permissions in Matterhorn Desktop. Web workspaces expose managed access boundaries only.",
  requiredContextFields: [],
  optionalContextFields: ["toolId"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "planned_not_live",
  promptTemplate: "Show my MCP permissions",
  mcpToolHints: [],
  cliCommandHints: ["matterhorn-work mcps permissions"],
  resultCardKinds: ["settings_card"],
};

export const MCPS_VIEW_USAGE_GUIDE_ACTION: DeskActionManifest = {
  version: "matterhorn.desk.action.manifest.v1",
  id: "mcps_view_usage_guide",
  deskId: "mcps",
  title: "Usage guide",
  description: "View guidance for managed web tools and custom MCP setup in Matterhorn Desktop.",
  requiredContextFields: [],
  optionalContextFields: ["toolId"],
  safetyBoundary: DEFAULT_DESK_ACTION_SAFETY_BOUNDARY,
  executionState: "live_read",
  promptTemplate: "How do MCP tools work in Matterhorn?",
  mcpToolHints: [],
  cliCommandHints: [],
  resultCardKinds: ["education_card"],
};

// --- Registries ---

export const BITTENSOR_DESK_ACTION_REGISTRY: Record<string, DeskActionManifest> = {
  bittensor_show_tao: BITTENSOR_SHOW_TAO_ACTION,
  bittensor_wallet_stake_read: BITTENSOR_WALLET_STAKE_READ_ACTION,
  bittensor_discover_subnets: BITTENSOR_DISCOVER_SUBNETS_ACTION,
  bittensor_compare_validators: BITTENSOR_COMPARE_VALIDATORS_ACTION,
  bittensor_prepare_stake: BITTENSOR_PREPARE_STAKE_ACTION,
  bittensor_prepare_unstake: BITTENSOR_PREPARE_UNSTAKE_ACTION,
  bittensor_prepare_transfer: BITTENSOR_PREPARE_TRANSFER_ACTION,
  bittensor_create_watch: BITTENSOR_CREATE_WATCH_ACTION,
  bittensor_import_receipt: BITTENSOR_IMPORT_RECEIPT_ACTION,
  bittensor_explain_keys: BITTENSOR_EXPLAIN_KEYS_ACTION,
};

export const HYPERLIQUID_DESK_ACTION_REGISTRY: Record<string, DeskActionManifest> = {
  hyperliquid_market_read: HYPERLIQUID_MARKET_READ_ACTION,
  hyperliquid_orderbook_read: HYPERLIQUID_ORDERBOOK_READ_ACTION,
  hyperliquid_account_exposure: HYPERLIQUID_ACCOUNT_EXPOSURE_ACTION,
  hyperliquid_funding_read: HYPERLIQUID_FUNDING_READ_ACTION,
  hyperliquid_open_orders: HYPERLIQUID_OPEN_ORDERS_ACTION,
  hyperliquid_preview_order: HYPERLIQUID_PREVIEW_ORDER_ACTION,
  hyperliquid_cancel_order: HYPERLIQUID_CANCEL_ORDER_ACTION,
  hyperliquid_modify_order: HYPERLIQUID_MODIFY_ORDER_ACTION,
  hyperliquid_close_position: HYPERLIQUID_CLOSE_POSITION_ACTION,
  hyperliquid_create_watch: HYPERLIQUID_CREATE_WATCH_ACTION,
  hyperliquid_import_receipt: HYPERLIQUID_IMPORT_RECEIPT_ACTION,
};

export const POLYMARKET_DESK_ACTION_REGISTRY: Record<string, DeskActionManifest> = {
  polymarket_market_discovery: POLYMARKET_MARKET_DISCOVERY_ACTION,
  polymarket_outcome_probabilities: POLYMARKET_OUTCOME_PROBABILITIES_ACTION,
  polymarket_liquidity_orderbook: POLYMARKET_LIQUIDITY_ORDERBOOK_ACTION,
  polymarket_compliance_check: POLYMARKET_COMPLIANCE_CHECK_ACTION,
  polymarket_preview_trade: POLYMARKET_PREVIEW_TRADE_ACTION,
  polymarket_sell: POLYMARKET_SELL_ACTION,
  polymarket_cancel_order: POLYMARKET_CANCEL_ORDER_ACTION,
  polymarket_create_watch: POLYMARKET_CREATE_WATCH_ACTION,
  polymarket_import_receipt: POLYMARKET_IMPORT_RECEIPT_ACTION,
};

export const SUI_DESK_ACTION_REGISTRY: Record<string, DeskActionManifest> = {
  sui_account_read: SUI_ACCOUNT_READ_ACTION,
  sui_transfer_preview: SUI_TRANSFER_PREVIEW_ACTION,
  sui_coin_transfer: SUI_COIN_TRANSFER_ACTION,
  sui_object_transfer: SUI_OBJECT_TRANSFER_ACTION,
  sui_batch_transfer: SUI_BATCH_TRANSFER_ACTION,
  sui_import_receipt: SUI_IMPORT_RECEIPT_ACTION,
};

export const WELLNESS_DESK_ACTION_REGISTRY: Record<string, DeskActionManifest> = {
  wellness_build_program: WELLNESS_BUILD_PROGRAM_ACTION,
  wellness_generate_artifacts: WELLNESS_GENERATE_ARTIFACTS_ACTION,
  wellness_package_service: WELLNESS_PACKAGE_SERVICE_ACTION,
  wellness_plan_live_service: WELLNESS_PLAN_LIVE_SERVICE_ACTION,
};

export const MEMORY_DESK_ACTION_REGISTRY: Record<string, DeskActionManifest> = {
  memory_review: MEMORY_REVIEW_ACTION,
  memory_manage_suggestions: MEMORY_MANAGE_SUGGESTIONS_ACTION,
  memory_forget_record: MEMORY_FORGET_RECORD_ACTION,
  memory_export: MEMORY_EXPORT_ACTION,
};

export const MCPS_DESK_ACTION_REGISTRY: Record<string, DeskActionManifest> = {
  mcps_browse_tools: MCPS_BROWSE_TOOLS_ACTION,
  mcps_install_tool: MCPS_INSTALL_TOOL_ACTION,
  mcps_manage_permissions: MCPS_MANAGE_PERMISSIONS_ACTION,
  mcps_view_usage_guide: MCPS_VIEW_USAGE_GUIDE_ACTION,
};

export const DESK_ACTION_REGISTRY: Record<string, Record<string, DeskActionManifest>> = {
  bittensor: BITTENSOR_DESK_ACTION_REGISTRY,
  hyperliquid: HYPERLIQUID_DESK_ACTION_REGISTRY,
  polymarket: POLYMARKET_DESK_ACTION_REGISTRY,
  sui: SUI_DESK_ACTION_REGISTRY,
  wellness: WELLNESS_DESK_ACTION_REGISTRY,
  memory: MEMORY_DESK_ACTION_REGISTRY,
  mcps: MCPS_DESK_ACTION_REGISTRY,
};

export function getDeskActionManifest(deskId: string, actionId: string): DeskActionManifest | undefined {
  return DESK_ACTION_REGISTRY[deskId]?.[actionId];
}

export function listDeskActions(deskId: string): DeskActionManifest[] {
  const registry = DESK_ACTION_REGISTRY[deskId];
  if (!registry) return [];
  return Object.values(registry);
}

export function listAllDeskActionIds(): string[] {
  return Object.values(DESK_ACTION_REGISTRY).flatMap((registry) => Object.keys(registry));
}

export function listTransactionDeskActions(deskId?: string): DeskActionManifest[] {
  const registries = deskId ? [DESK_ACTION_REGISTRY[deskId]] : Object.values(DESK_ACTION_REGISTRY);
  return registries
    .filter((registry): registry is Record<string, DeskActionManifest> => Boolean(registry))
    .flatMap((registry) => Object.values(registry))
    .filter((action) => Boolean(action.transaction));
}

export function listLiveTransactionDeskActions(deskId?: string): DeskActionManifest[] {
  return listTransactionDeskActions(deskId).filter((action) => action.transaction?.availableInsideMatterhorn === true);
}
