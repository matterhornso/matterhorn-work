export type MatterhornJsonSchema = Record<string, unknown>;

export type MatterhornCryptoToolAccess = "read" | "prepare";

export type MatterhornCryptoToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: MatterhornJsonSchema;
  deskIds: readonly ("bittensor" | "hyperliquid" | "polymarket" | "sui")[];
  actionIds: readonly string[];
  access: MatterhornCryptoToolAccess;
  timeoutMs: number;
  requiresFreshness: boolean;
};

const objectSchema = (
  properties: MatterhornJsonSchema,
  required: readonly string[] = [],
): MatterhornJsonSchema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const numberOrStringSchema: MatterhornJsonSchema = {
  oneOf: [{ type: "number" }, { type: "string" }],
};

/**
 * Canonical model-facing crypto capability catalog.
 *
 * The hosted MCP, generated desk agents, compatibility checks, and future UI
 * capability cards consume this registry. Transport details remain in the
 * server because they include authenticated internal routes; user-visible
 * names, schemas, risk class, timeouts, and desk/action ownership live here.
 */
export const MATTERHORN_CRYPTO_ACTION_REGISTRY = [
  {
    name: "matterhorn_bittensor_chat",
    title: "Bittensor desk read",
    description: "Run a Bittensor-native public read through the Matterhorn desk workflow. Transaction intents use the separate prepare tool. Never signs or broadcasts.",
    inputSchema: objectSchema({
      message: { type: "string", description: "Plain-language Bittensor request." },
      ss58Address: { type: "string", description: "Optional public SS58 address." },
      netuid: { type: "number", description: "Optional subnet netuid." },
      limit: { type: "number", description: "Optional result limit." },
      strategy: { type: "string", enum: ["balanced", "yield", "safety"] },
    }, ["message"]),
    deskIds: ["bittensor"],
    actionIds: [
      "bittensor_show_tao",
      "bittensor_wallet_stake_read",
      "bittensor_discover_subnets",
      "bittensor_compare_validators",
    ],
    access: "read",
    timeoutMs: 25_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_bittensor_prepare_action",
    title: "Bittensor action preview",
    description: "Prepare exact Bittensor transfer, stake, or unstake terms for separate wallet review. Never signs, relays, or submits.",
    inputSchema: objectSchema({
      action: { type: "string", enum: ["transfer", "stake", "unstake"] },
      sender: { type: "string", description: "Optional public coldkey address." },
      destination: { type: "string", description: "Required transfer recipient." },
      hotkey: { type: "string", description: "Required validator hotkey for stake or unstake." },
      netuid: { type: "number", minimum: 0 },
      amountTao: numberOrStringSchema,
    }, ["action", "amountTao"]),
    deskIds: ["bittensor"],
    actionIds: ["bittensor_prepare_stake", "bittensor_prepare_unstake", "bittensor_prepare_transfer"],
    access: "prepare",
    timeoutMs: 15_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_crypto_chat",
    title: "Matterhorn reviewed crypto action",
    description: "Prepare a canonical typed Bittensor, Hyperliquid, or Polymarket action card for separate wallet review. Never signs or submits.",
    inputSchema: objectSchema({
      message: { type: "string", description: "The user's original request." },
      venue: { type: "string", enum: ["auto", "bittensor", "hyperliquid", "polymarket"] },
      address: { type: "string", description: "Optional public 0x wallet address." },
      ss58Address: { type: "string", description: "Optional public Bittensor SS58 address." },
      coldkey: { type: "string", description: "Optional public Bittensor sender coldkey/SS58 address." },
      recipient: { type: "string", description: "Optional public Bittensor transfer recipient." },
      destination: { type: "string", description: "Optional public Bittensor transfer destination." },
      netuid: { type: "number", description: "Optional Bittensor subnet id." },
      validatorHotkey: { type: "string", description: "Optional public Bittensor validator hotkey." },
      amountTao: numberOrStringSchema,
      marketId: { type: "string", description: "Optional public Polymarket market id." },
      outcome: { type: "string", description: "Optional Polymarket outcome label." },
      asset: { type: "string", description: "Optional Hyperliquid asset symbol." },
      side: { type: "string", enum: ["buy", "sell", "long", "short", "yes", "no"] },
      size: numberOrStringSchema,
      price: numberOrStringSchema,
      orderType: { type: "string", enum: ["market", "limit"], description: "Optional Hyperliquid order type. Market uses an indicative mark; limit requires a price." },
      network: { type: "string", enum: ["testnet", "mainnet"], description: "Optional Hyperliquid wallet review network." },
      amountUsdc: numberOrStringSchema,
      limit: { type: "number" },
      slippageTolerance: numberOrStringSchema,
      rateTolerance: numberOrStringSchema,
      reduceOnly: { type: "boolean" },
    }, ["message"]),
    deskIds: ["bittensor", "hyperliquid", "polymarket"],
    actionIds: [
      "bittensor_prepare_stake",
      "bittensor_prepare_unstake",
      "bittensor_prepare_transfer",
      "hyperliquid_preview_order",
      "hyperliquid_cancel_order",
      "hyperliquid_modify_order",
      "hyperliquid_close_position",
      "polymarket_preview_trade",
      "polymarket_sell",
      "polymarket_cancel_order",
    ],
    access: "prepare",
    timeoutMs: 20_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_hyperliquid_list_markets",
    title: "Hyperliquid markets",
    description: "List public Hyperliquid markets with source and freshness metadata.",
    inputSchema: objectSchema({ limit: { type: "number", minimum: 1, maximum: 50 } }),
    deskIds: ["hyperliquid"],
    actionIds: ["hyperliquid_market_read"],
    access: "read",
    timeoutMs: 10_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_hyperliquid_get_account",
    title: "Hyperliquid account",
    description: "Read public Hyperliquid account state for a connected or supplied public address.",
    inputSchema: objectSchema({ address: { type: "string", description: "Public 42-character 0x account address." } }, ["address"]),
    deskIds: ["hyperliquid"],
    actionIds: ["hyperliquid_account_exposure"],
    access: "read",
    timeoutMs: 10_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_hyperliquid_get_positions",
    title: "Hyperliquid positions",
    description: "Read public Hyperliquid positions and exposure for an account.",
    inputSchema: objectSchema({ address: { type: "string", description: "Public 42-character 0x account address." } }, ["address"]),
    deskIds: ["hyperliquid"],
    actionIds: ["hyperliquid_account_exposure"],
    access: "read",
    timeoutMs: 10_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_hyperliquid_get_open_orders",
    title: "Hyperliquid open orders",
    description: "Read public Hyperliquid open orders for an account.",
    inputSchema: objectSchema({ address: { type: "string", description: "Public 42-character 0x account address." } }, ["address"]),
    deskIds: ["hyperliquid"],
    actionIds: ["hyperliquid_open_orders"],
    access: "read",
    timeoutMs: 10_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_hyperliquid_get_orderbook",
    title: "Hyperliquid orderbook",
    description: "Read a public Hyperliquid orderbook. This tool is read-only and cannot submit orders.",
    inputSchema: objectSchema({ asset: { type: "string", description: "Asset symbol such as BTC." } }, ["asset"]),
    deskIds: ["hyperliquid"],
    actionIds: ["hyperliquid_orderbook_read"],
    access: "read",
    timeoutMs: 10_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_hyperliquid_get_funding",
    title: "Hyperliquid funding",
    description: "Read public Hyperliquid funding data for an asset.",
    inputSchema: objectSchema({ asset: { type: "string", description: "Asset symbol such as BTC." } }, ["asset"]),
    deskIds: ["hyperliquid"],
    actionIds: ["hyperliquid_funding_read"],
    access: "read",
    timeoutMs: 10_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_hyperliquid_preview_order",
    title: "Hyperliquid order preview",
    description: "Prepare exact Hyperliquid order terms for review. This preview never signs or submits.",
    inputSchema: objectSchema({
      asset: { type: "string" },
      side: { type: "string", enum: ["buy", "sell", "long", "short"] },
      size: numberOrStringSchema,
      orderType: { type: "string", enum: ["market", "limit"], description: "Market orders use an indicative mark; limit orders require price." },
      network: { type: "string", enum: ["testnet", "mainnet"], description: "Wallet review network. Defaults to testnet." },
      price: numberOrStringSchema,
      reduceOnly: { type: "boolean" },
      slippageTolerance: numberOrStringSchema,
      address: { type: "string" },
      message: { type: "string" },
    }, ["asset", "side", "size"]),
    deskIds: ["hyperliquid"],
    actionIds: ["hyperliquid_preview_order"],
    access: "prepare",
    timeoutMs: 15_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_prediction_market_venues",
    title: "Prediction-market venue coverage",
    description: "List the prediction-market venues Matterhorn can research and each venue's execution and eligibility boundary.",
    inputSchema: objectSchema({}),
    deskIds: ["polymarket"],
    actionIds: ["polymarket_market_discovery"],
    access: "read",
    timeoutMs: 5_000,
    requiresFreshness: false,
  },
  {
    name: "matterhorn_prediction_markets_search",
    title: "Prediction markets across venues",
    description: "Search live public Polymarket, Kalshi, and Manifold markets. Kalshi and Manifold results are research-only in Matterhorn.",
    inputSchema: objectSchema({
      query: { type: "string", description: "Topic, event, or market search text." },
      limit: { type: "number", minimum: 1, maximum: 10, description: "Maximum results per venue." },
    }),
    deskIds: ["polymarket"],
    actionIds: ["polymarket_market_discovery", "polymarket_outcome_probabilities"],
    access: "read",
    timeoutMs: 20_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_polymarket_search_markets",
    title: "Polymarket market search",
    description: "Search public Polymarket markets with source, liquidity, and compliance context.",
    inputSchema: objectSchema({
      query: { type: "string", description: "Market search text." },
      limit: { type: "number", minimum: 1, maximum: 50 },
    }),
    deskIds: ["polymarket"],
    actionIds: ["polymarket_market_discovery", "polymarket_outcome_probabilities"],
    access: "read",
    timeoutMs: 15_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_polymarket_check_compliance",
    title: "Polymarket compliance",
    description: "Read Matterhorn's current Polymarket compliance gate before exposing executable fields.",
    inputSchema: objectSchema({}),
    deskIds: ["polymarket"],
    actionIds: ["polymarket_compliance_check"],
    access: "read",
    timeoutMs: 10_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_polymarket_preview_order",
    title: "Polymarket order preview",
    description: "Prepare exact Polymarket order terms after compliance review. This preview never signs or submits.",
    inputSchema: objectSchema({
      marketId: { type: "string" },
      outcome: { type: "string" },
      side: { type: "string", enum: ["buy", "sell", "yes", "no"] },
      amountUsdc: numberOrStringSchema,
      slippageTolerance: numberOrStringSchema,
    }, ["marketId", "outcome", "side", "amountUsdc"]),
    deskIds: ["polymarket"],
    actionIds: ["polymarket_preview_trade", "polymarket_sell"],
    access: "prepare",
    timeoutMs: 15_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_polymarket_prepare_handoff",
    title: "Polymarket wallet handoff",
    description: "Prepare a compliance-gated Polymarket handoff for separate connected-wallet review. Never signs or submits.",
    inputSchema: objectSchema({
      marketId: { type: "string" },
      outcome: { type: "string" },
      side: { type: "string", enum: ["buy", "sell", "yes", "no"] },
      amountUsdc: numberOrStringSchema,
      slippageTolerance: numberOrStringSchema,
    }, ["marketId", "outcome", "side", "amountUsdc"]),
    deskIds: ["polymarket"],
    actionIds: ["polymarket_preview_trade", "polymarket_sell"],
    access: "prepare",
    timeoutMs: 15_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_sui_get_balance",
    title: "Sui public balance",
    description: "Read a public Sui address balance. Never requests or handles wallet secrets.",
    inputSchema: objectSchema({
      address: { type: "string", description: "Public Sui address." },
      network: { type: "string", enum: ["mainnet", "testnet"] },
      coinType: { type: "string", description: "Optional public coin type." },
    }, ["address"]),
    deskIds: ["sui"],
    actionIds: ["sui_account_read"],
    access: "read",
    timeoutMs: 10_000,
    requiresFreshness: true,
  },
  {
    name: "matterhorn_sui_preview_transfer",
    title: "Sui transfer preview",
    description: "Prepare a non-custodial Sui transfer preview for review in the user's wallet. Never signs or broadcasts.",
    inputSchema: objectSchema({
      network: { type: "string", enum: ["mainnet", "testnet"] },
      sender: { type: "string", description: "Public sender address." },
      recipient: { type: "string", description: "Public recipient address." },
      amountSui: { type: "string", description: "SUI amount as a positive decimal string." },
      memo: { type: "string", description: "Optional public memo, up to 140 characters." },
    }, ["network", "sender", "recipient", "amountSui"]),
    deskIds: ["sui"],
    actionIds: ["sui_transfer_preview"],
    access: "prepare",
    timeoutMs: 15_000,
    requiresFreshness: true,
  },
] as const satisfies readonly MatterhornCryptoToolDefinition[];

export type MatterhornCryptoToolName = (typeof MATTERHORN_CRYPTO_ACTION_REGISTRY)[number]["name"];

export function listMatterhornCryptoTools(): readonly MatterhornCryptoToolDefinition[] {
  return MATTERHORN_CRYPTO_ACTION_REGISTRY;
}

export function getMatterhornCryptoTool(
  name: string,
): (typeof MATTERHORN_CRYPTO_ACTION_REGISTRY)[number] | undefined {
  return MATTERHORN_CRYPTO_ACTION_REGISTRY.find((tool) => tool.name === name);
}

export function matterhornCryptoRuntimeToolName(name: MatterhornCryptoToolName): string {
  return `matterhorn-work_${name}`;
}
