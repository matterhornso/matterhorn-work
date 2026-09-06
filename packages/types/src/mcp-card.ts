// MCP card connectivity contract
// Customer-facing card data for each Matterhorn MCP, including install commands
// per target client, testability, and whether the MCP works outside Matterhorn.

export const MCP_CARD_STATUSES = [
  "available",
  "installed",
  "configured",
  "testable",
  "needs_setup",
  "preview",
  "unavailable",
] as const;
export type McpCardStatus = (typeof MCP_CARD_STATUSES)[number];

export const MCP_INSTALL_TARGETS = [
  "codex",
  "claude_code",
  "claude_desktop",
  "cursor",
] as const;
export type McpInstallTarget = (typeof MCP_INSTALL_TARGETS)[number];

export interface McpCardInstallCommand {
  target: McpInstallTarget;
  command: string;
}

export interface McpCardSupportedTool {
  name: string;
  description: string;
  isReadOnly: boolean;
}

export interface McpCardSafetyBoundary {
  liveSubmissionEnabled: false;
  canSubmit: false;
  acceptsPrivateKeys: false;
  acceptsSeedPhrases: false;
  acceptsApiSecrets: false;
  acceptsRawSignatures: false;
  acceptsSignedPayloads: false;
  acceptsWalletExports: false;
  allowsRealFunds: false;
}

export interface McpCardConnectivity {
  version: "matterhorn.mcp.card.v1";
  id: string;
  catalogItemId: string;
  displayName: string;
  deskId: string;
  description: string;
  status: McpCardStatus;
  installCommands: McpCardInstallCommand[];
  supportedTools: McpCardSupportedTool[];
  testEndpoint?: string;
  testCommand?: string;
  safetyBoundary: McpCardSafetyBoundary;
  worksOutsideMatterhorn: boolean;
}

function installCmd(target: McpInstallTarget, tool: string): McpCardInstallCommand {
  return {
    target,
    command: `matterhorn-work mcp install ${tool} --target ${target}`,
  };
}

function baseSafetyBoundary(): McpCardSafetyBoundary {
  return {
    liveSubmissionEnabled: false,
    canSubmit: false,
    acceptsPrivateKeys: false,
    acceptsSeedPhrases: false,
    acceptsApiSecrets: false,
    acceptsRawSignatures: false,
    acceptsSignedPayloads: false,
    acceptsWalletExports: false,
    allowsRealFunds: false,
  };
}

export const BITTENSOR_MCP_CARD: McpCardConnectivity = {
  version: "matterhorn.mcp.card.v1",
  id: "bittensor-mcp-card",
  catalogItemId: "matterhorn-bittensor",
  displayName: "Matterhorn Bittensor",
  deskId: "bittensor",
  description:
    "Read Bittensor subnet, stake, and balance data. Prepare transfer, stake, and unstake calls for exact connected-wallet review.",
  status: "preview",
  installCommands: [
    installCmd("codex", "matterhorn-bittensor"),
    installCmd("claude_code", "matterhorn-bittensor"),
    installCmd("claude_desktop", "matterhorn-bittensor"),
    installCmd("cursor", "matterhorn-bittensor"),
  ],
  supportedTools: [
    { name: "bittensor_read_balance", description: "Read a public SS58 balance", isReadOnly: true },
    { name: "bittensor_read_stake", description: "Read stake and delegate state", isReadOnly: true },
    { name: "bittensor_preview_stake", description: "Prepare a reviewed stake action", isReadOnly: true },
    { name: "bittensor_prepare_stake_handoff", description: "Build a connected-wallet review handoff", isReadOnly: false },
  ],
  testCommand: "matterhorn-work mcp test matterhorn-bittensor --subnet 1",
  safetyBoundary: baseSafetyBoundary(),
  worksOutsideMatterhorn: true,
};

export const HYPERLIQUID_MCP_CARD: McpCardConnectivity = {
  version: "matterhorn.mcp.card.v1",
  id: "hyperliquid-mcp-card",
  catalogItemId: "matterhorn-hyperliquid",
  displayName: "Matterhorn Hyperliquid",
  deskId: "hyperliquid",
  description:
    "Read Hyperliquid market data and preview trades. Prepare wallet reviews and verify public receipts.",
  status: "testable",
  installCommands: [
    installCmd("codex", "matterhorn-hyperliquid"),
    installCmd("claude_code", "matterhorn-hyperliquid"),
    installCmd("claude_desktop", "matterhorn-hyperliquid"),
    installCmd("cursor", "matterhorn-hyperliquid"),
  ],
  supportedTools: [
    { name: "hyperliquid_read_market", description: "Read perp market metadata", isReadOnly: true },
    { name: "hyperliquid_preview_order", description: "Preview an order", isReadOnly: true },
    { name: "hyperliquid_prepare_handoff", description: "Prepare an exact connected-wallet review", isReadOnly: false },
    { name: "hyperliquid_import_receipt", description: "Import a signed receipt", isReadOnly: false },
  ],
  testEndpoint: "/api/hyperliquid/orders/handoff",
  testCommand: "matterhorn-work mcp test matterhorn-hyperliquid --market BTC-PERP",
  safetyBoundary: baseSafetyBoundary(),
  worksOutsideMatterhorn: true,
};

export const POLYMARKET_MCP_CARD: McpCardConnectivity = {
  version: "matterhorn.mcp.card.v1",
  id: "polymarket-mcp-card",
  catalogItemId: "matterhorn-polymarket",
  displayName: "Matterhorn Polymarket",
  deskId: "polymarket",
  description:
    "Search Polymarket markets, read probabilities, and preview positions. Prepare wallet reviews and verify public receipts.",
  status: "testable",
  installCommands: [
    installCmd("codex", "matterhorn-polymarket"),
    installCmd("claude_code", "matterhorn-polymarket"),
    installCmd("claude_desktop", "matterhorn-polymarket"),
    installCmd("cursor", "matterhorn-polymarket"),
  ],
  supportedTools: [
    { name: "polymarket_search_markets", description: "Search prediction markets", isReadOnly: true },
    { name: "polymarket_preview_trade", description: "Preview a trade", isReadOnly: true },
    { name: "polymarket_prepare_handoff", description: "Prepare an exact connected-wallet review", isReadOnly: false },
    { name: "polymarket_import_receipt", description: "Import a signed receipt", isReadOnly: false },
  ],
  testEndpoint: "/api/polymarket/orders/handoff",
  testCommand: "matterhorn-work mcp test matterhorn-polymarket --market will-btc-exceed-100k",
  safetyBoundary: baseSafetyBoundary(),
  worksOutsideMatterhorn: true,
};

export const MEMORY_MCP_CARD: McpCardConnectivity = {
  version: "matterhorn.mcp.card.v1",
  id: "memory-mcp-card",
  catalogItemId: "matterhorn-memory",
  displayName: "Matterhorn Memory",
  deskId: "memory",
  description: "Read, manage, and export user-confirmed memory records. No hidden saves.",
  status: "installed",
  installCommands: [
    installCmd("codex", "matterhorn-memory"),
    installCmd("claude_code", "matterhorn-memory"),
    installCmd("claude_desktop", "matterhorn-memory"),
    installCmd("cursor", "matterhorn-memory"),
  ],
  supportedTools: [
    { name: "memory_review", description: "Review saved memory records", isReadOnly: true },
    { name: "memory_manage_suggestions", description: "Manage pending suggestions", isReadOnly: false },
    { name: "memory_forget_record", description: "Forget a record", isReadOnly: false },
  ],
  testCommand: "matterhorn-work mcp test matterhorn-memory",
  safetyBoundary: baseSafetyBoundary(),
  worksOutsideMatterhorn: true,
};

export const WORKFLOW_MCP_CARD: McpCardConnectivity = {
  version: "matterhorn.mcp.card.v1",
  id: "workflow-mcp-card",
  catalogItemId: "matterhorn-workflow",
  displayName: "Matterhorn Workflow",
  deskId: "workflow",
  description: "Invoke customer workflow templates and evidence bundles locally.",
  status: "needs_setup",
  installCommands: [
    installCmd("codex", "matterhorn-workflow"),
    installCmd("claude_code", "matterhorn-workflow"),
    installCmd("cursor", "matterhorn-workflow"),
  ],
  supportedTools: [
    { name: "workflow_list_templates", description: "List workflow templates", isReadOnly: true },
    { name: "workflow_run_template", description: "Run a workflow template", isReadOnly: false },
  ],
  testCommand: "matterhorn-work mcp test matterhorn-workflow --template wellness_creator_services",
  safetyBoundary: baseSafetyBoundary(),
  worksOutsideMatterhorn: true,
};

export const UI_CONTROL_MCP_CARD: McpCardConnectivity = {
  version: "matterhorn.mcp.card.v1",
  id: "ui-control-mcp-card",
  catalogItemId: "matterhorn-ui-control",
  displayName: "Matterhorn UI Control",
  deskId: "ui_control",
  description: "Control local Matterhorn UI surfaces. No backend execution.",
  status: "unavailable",
  installCommands: [
    installCmd("codex", "matterhorn-ui-control"),
    installCmd("claude_code", "matterhorn-ui-control"),
  ],
  supportedTools: [
    { name: "ui_focus_desk", description: "Focus a desk in the UI", isReadOnly: false },
    { name: "ui_set_prompt", description: "Set the chat prompt input", isReadOnly: false },
  ],
  safetyBoundary: baseSafetyBoundary(),
  worksOutsideMatterhorn: false,
};

export const MCP_CARD_REGISTRY: Record<string, McpCardConnectivity> = {
  "bittensor-mcp-card": BITTENSOR_MCP_CARD,
  "hyperliquid-mcp-card": HYPERLIQUID_MCP_CARD,
  "polymarket-mcp-card": POLYMARKET_MCP_CARD,
  "memory-mcp-card": MEMORY_MCP_CARD,
  "workflow-mcp-card": WORKFLOW_MCP_CARD,
  "ui-control-mcp-card": UI_CONTROL_MCP_CARD,
};

export function getMcpCard(id: string): McpCardConnectivity | undefined {
  return MCP_CARD_REGISTRY[id];
}

export function listMcpCards(): McpCardConnectivity[] {
  return Object.values(MCP_CARD_REGISTRY);
}
