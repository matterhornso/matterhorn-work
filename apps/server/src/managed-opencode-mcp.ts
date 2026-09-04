import {
  getMatterhornCryptoTool,
  listMatterhornCryptoTools,
  type MatterhornCryptoToolDefinition,
} from "@matterhorn-work/types/crypto-action-registry";
import {
  MATTERHORN_CRYPTO_EVIDENCE_VERSION,
  type MatterhornCryptoEvidenceEnvelope,
} from "@matterhorn-work/types/crypto-evidence";
import {
  isReviewedActionHandoffV2,
  type ReviewedActionDraftHandoff,
  type ReviewedActionHandoffV2,
} from "@matterhorn-work/types/reviewed-actions";
import type { MatterhornAgentCapabilityClaims } from "@matterhorn-work/types/guarded-agent-runtime";
import { sha256 } from "./guarded-runtime-crypto.js";
import { buildReviewedActionHandoffV2 } from "./reviewed-action-airlock.js";
import {
  containsUntrustedInstruction,
  quarantineUntrustedContent,
  untrustedContentChanged,
} from "./untrusted-data-quarantine.js";

type JsonObject = Record<string, unknown>;

type ManagedMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  timeoutMs?: number;
  request: (args: JsonObject) => { path: string; method?: "GET" | "POST"; body?: JsonObject };
};

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

export const MANAGED_MCP_MODEL_READ_CONTENT_MAX_CHARS = 2_000;
export const MANAGED_MCP_MODEL_PREPARE_CONTENT_MAX_CHARS = 4_000;
export const MANAGED_MCP_MODEL_CONTENT_MAX_CHARS = MANAGED_MCP_MODEL_PREPARE_CONTENT_MAX_CHARS;

export type ManagedMcpToolCallMetric = {
  tool: string;
  access: "read" | "prepare" | "system";
  outcome: "success" | "error" | "timeout";
  durationMs: number;
  reviewedAction?: ReviewedActionHandoffV2;
  source?: string;
  freshness?: string;
};

export type ManagedMcpToolAuthorization = {
  args: JsonObject;
  runId: string | null;
  callId: string | null;
  workspaceId: string | null;
  sessionId?: string | null;
  coworker?: MatterhornAgentCapabilityClaims["coworker"] | null;
};

export type ManagedMcpCertifiedToolExecutor = (input: {
  toolName: string;
  args: JsonObject;
  authorization: ManagedMcpToolAuthorization;
}) => Promise<unknown | null>;

const objectSchema = (properties: JsonObject, required: string[] = []): JsonObject => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

const numberOrStringSchema: JsonObject = {
  oneOf: [{ type: "number" }, { type: "string" }],
};

function stringArg(args: JsonObject, name: string, fallback = ""): string {
  const value = args[name];
  return typeof value === "string" ? value.trim() : fallback;
}

function polymarketTokenIdArg(args: JsonObject): string {
  const tokenId = stringArg(args, "tokenId");
  if (!/^[1-9][0-9]{0,77}$/.test(tokenId)
    || BigInt(tokenId) > ((1n << 256n) - 1n)) {
    throw new Error("polymarket_token_id_invalid");
  }
  return tokenId;
}

function queryPath(path: string, args: JsonObject, keys: string[]): string {
  const query = new URLSearchParams();
  for (const key of keys) {
    const value = args[key];
    if (value === undefined || value === null || value === "") continue;
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

const MANAGED_MCP_TRANSPORTS: ManagedMcpTool[] = [
  {
    name: "matterhorn_status",
    title: "Matterhorn status",
    description: "Read the local Matterhorn Desks engine status and capability summary.",
    inputSchema: objectSchema({}),
    timeoutMs: 5_000,
    request: () => ({ path: "/status" }),
  },
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
    request: (args) => ({ path: "/api/bittensor/chat/execute", method: "POST", body: args }),
  },
  {
    name: "matterhorn_bittensor_prepare_action",
    title: "Bittensor action preview",
    description: "Prepare exact Bittensor transfer, stake, or unstake terms for separate wallet review. Never signs, relays, or submits.",
    inputSchema: objectSchema({
      action: { type: "string", enum: ["transfer", "stake", "unstake"] },
      sender: { type: "string" },
      destination: { type: "string" },
      hotkey: { type: "string" },
      netuid: { type: "number", minimum: 0 },
      amountTao: numberOrStringSchema,
    }, ["action", "amountTao"]),
    request: (args) => ({
      path: "/api/bittensor/extrinsics/prepare",
      method: "POST",
      body: {
        action: args.action,
        coldkey: args.sender,
        destination: args.destination,
        hotkey: args.hotkey,
        netuid: args.netuid,
        amountTao: args.amountTao,
      },
    }),
  },
  {
    name: "matterhorn_crypto_chat",
    title: "Matterhorn reviewed crypto action",
    description: "Prepare the canonical typed Bittensor, Hyperliquid, or Polymarket action card for separate wallet review. Never signs or submits.",
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
    request: (args) => ({ path: "/api/crypto/chat/execute", method: "POST", body: args }),
  },
  {
    name: "matterhorn_hyperliquid_list_markets",
    title: "Hyperliquid markets",
    description: "List public Hyperliquid markets with source and freshness metadata.",
    inputSchema: objectSchema({ limit: { type: "number", minimum: 1, maximum: 50 } }),
    request: (args) => ({ path: queryPath("/api/hyperliquid/markets", args, ["limit"]) }),
  },
  {
    name: "matterhorn_hyperliquid_get_account",
    title: "Hyperliquid account",
    description: "Read public Hyperliquid account state for a connected or supplied public address.",
    inputSchema: objectSchema({ address: { type: "string", description: "Public 42-character 0x account address." } }, ["address"]),
    request: (args) => ({ path: `/api/hyperliquid/account/${encodeURIComponent(stringArg(args, "address"))}` }),
  },
  {
    name: "matterhorn_hyperliquid_get_positions",
    title: "Hyperliquid positions",
    description: "Read public Hyperliquid positions and exposure for an account.",
    inputSchema: objectSchema({ address: { type: "string", description: "Public 42-character 0x account address." } }, ["address"]),
    request: (args) => ({ path: `/api/hyperliquid/account/${encodeURIComponent(stringArg(args, "address"))}/positions` }),
  },
  {
    name: "matterhorn_hyperliquid_get_open_orders",
    title: "Hyperliquid open orders",
    description: "Read public Hyperliquid open orders for an account.",
    inputSchema: objectSchema({ address: { type: "string", description: "Public 42-character 0x account address." } }, ["address"]),
    request: (args) => ({ path: `/api/hyperliquid/account/${encodeURIComponent(stringArg(args, "address"))}/open-orders` }),
  },
  {
    name: "matterhorn_hyperliquid_get_orderbook",
    title: "Hyperliquid orderbook",
    description: "Read a public Hyperliquid orderbook. This tool is read-only and cannot submit orders.",
    inputSchema: objectSchema({ asset: { type: "string", description: "Asset symbol such as BTC." } }, ["asset"]),
    request: (args) => ({ path: `/api/hyperliquid/orderbook/${encodeURIComponent(stringArg(args, "asset"))}` }),
  },
  {
    name: "matterhorn_hyperliquid_get_funding",
    title: "Hyperliquid funding",
    description: "Read public Hyperliquid funding data for an asset.",
    inputSchema: objectSchema({ asset: { type: "string", description: "Asset symbol such as BTC." } }, ["asset"]),
    request: (args) => ({ path: `/api/hyperliquid/funding/${encodeURIComponent(stringArg(args, "asset"))}` }),
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
    request: (args) => ({ path: "/api/hyperliquid/orders/preview", method: "POST", body: args }),
  },
  {
    name: "matterhorn_prediction_market_venues",
    title: "Prediction-market venue coverage",
    description: "List the prediction-market venues Matterhorn can research and each venue's execution and eligibility boundary.",
    inputSchema: objectSchema({}),
    request: () => ({ path: "/api/prediction-markets/venues" }),
  },
  {
    name: "matterhorn_prediction_markets_search",
    title: "Prediction markets across venues",
    description: "Search live public Polymarket, Kalshi, and Manifold markets. Kalshi and Manifold results are research-only in Matterhorn.",
    inputSchema: objectSchema({
      query: { type: "string", description: "Topic, event, or market search text." },
      limit: { type: "number", minimum: 1, maximum: 10, description: "Maximum results per venue." },
    }),
    request: (args) => ({ path: queryPath("/api/prediction-markets/search", args, ["query", "limit"]) }),
  },
  {
    name: "matterhorn_polymarket_search_markets",
    title: "Polymarket market search",
    description: "Search public Polymarket markets with source, liquidity, and compliance context.",
    inputSchema: objectSchema({
      query: { type: "string", description: "Market search text." },
      limit: { type: "number", minimum: 1, maximum: 50 },
    }),
    request: (args) => ({ path: queryPath("/api/polymarket/markets", args, ["query", "limit"]) }),
  },
  {
    name: "matterhorn_polymarket_get_orderbook",
    title: "Polymarket public order book",
    description: "Read one bounded public Polymarket order book by exact outcome token ID. Never accesses an account or places an order.",
    inputSchema: objectSchema({
      tokenId: { type: "string", description: "Exact public outcome token ID returned by market discovery." },
    }, ["tokenId"]),
    request: (args) => ({
      path: `/api/polymarket/orderbook/${polymarketTokenIdArg(args)}`,
    }),
  },
  {
    name: "matterhorn_polymarket_check_compliance",
    title: "Polymarket compliance",
    description: "Read Matterhorn's current Polymarket compliance gate before exposing executable fields.",
    inputSchema: objectSchema({}),
    request: () => ({ path: "/api/polymarket/compliance" }),
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
    request: (args) => ({ path: "/api/polymarket/orders/preview", method: "POST", body: args }),
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
    request: (args) => ({ path: "/api/polymarket/orders/handoff", method: "POST", body: args }),
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
    request: (args) => ({
      path: queryPath(`/api/sui/balance/${encodeURIComponent(stringArg(args, "address"))}`, args, ["network", "coinType"]),
    }),
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
    request: (args) => ({
      path: "/api/sui/transactions/preview",
      method: "POST",
      body: {
        ...args,
        // Keep older callers working while the advertised contract uses amountSui.
        amountSui: args.amountSui ?? args.amount,
      },
    }),
  },
];

function withCanonicalCryptoContract(tool: ManagedMcpTool): ManagedMcpTool {
  const canonical = getMatterhornCryptoTool(tool.name);
  if (!canonical) return tool;
  return {
    ...tool,
    title: canonical.title,
    description: canonical.description,
    inputSchema: canonical.inputSchema,
    timeoutMs: canonical.timeoutMs,
  };
}

const MANAGED_MCP_TOOLS = MANAGED_MCP_TRANSPORTS.map(withCanonicalCryptoContract);

export function managedOpencodeCryptoToolDefinitions(): readonly MatterhornCryptoToolDefinition[] {
  return listMatterhornCryptoTools();
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function argumentsObject(params: unknown): JsonObject {
  if (!params || typeof params !== "object" || Array.isArray(params)) return {};
  const value = (params as JsonObject).arguments;
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function parseToolPayload(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function compactJsonForModel(
  value: unknown,
  options: { arrayItems: number; objectKeys: number; stringChars: number },
  depth = 0,
): unknown {
  if (typeof value === "string") {
    return value.length <= options.stringChars
      ? value
      : `${value.slice(0, options.stringChars)}… [truncated]`;
  }
  if (value == null || typeof value !== "object") return value;
  if (depth >= 8) return "[nested content truncated]";
  if (Array.isArray(value)) {
    const items = value.slice(0, options.arrayItems)
      .map((item) => compactJsonForModel(item, options, depth + 1));
    if (value.length > options.arrayItems) {
      items.push(`[${value.length - options.arrayItems} additional items omitted]`);
    }
    return items;
  }
  const entries = Object.entries(value as JsonObject);
  const compact = Object.fromEntries(entries.slice(0, options.objectKeys).map(([key, item]) => [
    key,
    compactJsonForModel(item, options, depth + 1),
  ]));
  if (entries.length > options.objectKeys) {
    compact._matterhornOmittedKeys = entries.length - options.objectKeys;
  }
  return compact;
}

/** Keep full structured evidence for receipts while bounding model context. */
function modelFacingToolText(text: string, access: "read" | "prepare" | "system"): string {
  const maxChars = access === "prepare"
    ? MANAGED_MCP_MODEL_PREPARE_CONTENT_MAX_CHARS
    : MANAGED_MCP_MODEL_READ_CONTENT_MAX_CHARS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const safeText = containsUntrustedInstruction(text)
      ? "[Matterhorn quarantined instruction-like external content]"
      : text;
    if (safeText.length <= maxChars) return safeText;
    return `${safeText.slice(0, maxChars - 120)}\n\n[Matterhorn truncated this tool result. Ask for a narrower query to inspect more.]`;
  }

  parsed = quarantineUntrustedContent(parsed);
  const sanitized = JSON.stringify(parsed);
  if (sanitized.length <= maxChars) return sanitized;

  for (const options of [
    { arrayItems: 8, objectKeys: 50, stringChars: 1_000 },
    { arrayItems: 4, objectKeys: 25, stringChars: 400 },
  ]) {
    const compact = compactJsonForModel(parsed, options);
    const output = JSON.stringify({
      _matterhornContext: "Result shortened for model context. Use a narrower query for omitted detail.",
      result: compact,
    });
    if (output.length <= maxChars) return output;
  }

  return JSON.stringify({
    _matterhornContext: "Result exceeded the model-context limit. Ask for a narrower query.",
    preview: sanitized.slice(0, Math.floor(maxChars * 0.65)),
  });
}

function findEvidenceString(value: unknown, keys: readonly string[], depth = 0): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 2) return undefined;
  const record = value as JsonObject;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim().slice(0, 500);
  }
  for (const candidate of Object.values(record)) {
    const nested = findEvidenceString(candidate, keys, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

function evidenceWarnings(value: unknown): readonly string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const warnings = (value as JsonObject).warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings
    .filter((warning) => typeof warning === "string" && warning.trim())
    .slice(0, 20)
    .map((warning) => String(warning).trim().slice(0, 1_000));
}

function finitePositive(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function reviewedActionDraftFromTool(toolName: string, args: JsonObject): ReviewedActionDraftHandoff | null {
  if (toolName === "matterhorn_bittensor_prepare_action") {
    const action = stringArg(args, "action");
    const amount = finitePositive(args.amountTao);
    if (!amount || (action !== "transfer" && action !== "stake" && action !== "unstake")) return null;
    const sender = stringArg(args, "sender") || null;
    if (action === "transfer") {
      const destination = stringArg(args, "destination");
      return destination ? {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "bittensor",
        source: "agent-card",
        draft: { operation: "transfer", sender, destination, hotkey: null, netuid: null, amountTao: String(amount) },
      } : null;
    }
    const hotkey = stringArg(args, "hotkey");
    const netuid = Number(args.netuid);
    return hotkey && Number.isInteger(netuid) && netuid >= 0 ? {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "bittensor",
      source: "agent-card",
      draft: { operation: action, sender, destination: null, hotkey, netuid, amountTao: String(amount) },
    } : null;
  }
  if (toolName === "matterhorn_hyperliquid_preview_order") {
    const asset = stringArg(args, "asset").toUpperCase();
    const size = finitePositive(args.size);
    const rawSide = stringArg(args, "side").toLowerCase();
    const side = rawSide === "buy" || rawSide === "long" ? "buy" : rawSide === "sell" || rawSide === "short" ? "sell" : null;
    if (!asset || !size || !side) return null;
    const orderType = args.orderType === "limit" ? "limit" : "market";
    const price = finitePositive(args.price);
    if (orderType === "limit" && !price) return null;
    const slippagePercent = finitePositive(args.slippageTolerance) ?? 1;
    return {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "hyperliquid",
      source: "agent-card",
      draft: {
        operation: "place_order",
        network: args.network === "mainnet" ? "mainnet" : "testnet",
        asset,
        orderId: null,
        side,
        size,
        orderType,
        limitPrice: orderType === "limit" ? price : null,
        slippageBps: Math.min(5_000, Math.max(1, Math.round(slippagePercent * 100))),
        reduceOnly: args.reduceOnly === true,
      },
    };
  }
  if (toolName === "matterhorn_polymarket_preview_order" || toolName === "matterhorn_polymarket_prepare_handoff") {
    const marketId = stringArg(args, "marketId");
    const outcome = stringArg(args, "outcome");
    const amountUsdc = finitePositive(args.amountUsdc);
    if (!marketId || !outcome || !amountUsdc) return null;
    return {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "polymarket",
      source: "agent-card",
      draft: {
        operation: "buy",
        marketId,
        outcome,
        amountUsdc,
        amountShares: null,
        slippageTolerance: Math.min(50, finitePositive(args.slippageTolerance) ?? 2),
        orderIds: [],
        cancelAll: false,
      },
    };
  }
  if (toolName === "matterhorn_sui_preview_transfer") {
    const sender = stringArg(args, "sender") || null;
    const recipient = stringArg(args, "recipient");
    const amount = finitePositive(args.amountSui ?? args.amount);
    if (!recipient || !amount) return null;
    return {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "sui",
      source: "agent-card",
      draft: {
        operation: "transfer_sui",
        network: args.network === "mainnet" ? "mainnet" : "testnet",
        sender,
        recipient,
        amount: String(amount),
        coinType: null,
        objectId: null,
        transfers: [],
      },
    };
  }
  return null;
}

function buildGuardedReviewedAction(input: {
  toolName: string;
  args: JsonObject;
  result: unknown;
  authorization?: ManagedMcpToolAuthorization;
  completedAtMs: number;
}): ReviewedActionHandoffV2 | undefined {
  if (!input.authorization?.runId) return undefined;
  if (input.result && typeof input.result === "object" && !Array.isArray(input.result) && (input.result as JsonObject).blocked === true) return undefined;
  const draft = reviewedActionDraftFromTool(input.toolName, input.args);
  if (!draft) return undefined;
  const block = findEvidenceString(input.result, ["block", "blockNumber", "checkpoint", "observedBlock"]);
  return buildReviewedActionHandoffV2({
    handoff: draft,
    runId: input.authorization.runId,
    signer: draft.protocol === "sui" ? draft.draft.sender : draft.protocol === "bittensor" ? draft.draft.sender : stringArg(input.args, "address") || null,
    simulation: {
      reference: `sha256:${sha256(input.result)}`,
      block: block ?? null,
      simulatedAt: new Date(input.completedAtMs),
    },
    preparedAt: new Date(input.completedAtMs),
  });
}

function attachReviewedActionToToolResult(result: unknown, reviewedAction: ReviewedActionHandoffV2): unknown {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return { result, reviewedAction };
  }
  const record = result as JsonObject;
  const cards = Array.isArray(record.cards)
    ? record.cards.map((card) => {
        if (!card || typeof card !== "object" || Array.isArray(card)) return card;
        const cardRecord = card as JsonObject;
        if (cardRecord.kind !== "action_preview") return card;
        const data = cardRecord.data && typeof cardRecord.data === "object" && !Array.isArray(cardRecord.data)
          ? cardRecord.data as JsonObject
          : {};
        return { ...cardRecord, data: { ...data, reviewedAction } };
      })
    : undefined;
  return { ...record, reviewedAction, ...(cards ? { cards } : {}) };
}

const BITTENSOR_ACTION_INTENT_PATTERN = /\b(?:send|transfer|stake|unstake|delegate)\b/i;

function assertReadToolArguments(tool: ManagedMcpTool, args: JsonObject): void {
  if (tool.name !== "matterhorn_bittensor_chat") return;
  const message = typeof args.message === "string" ? args.message : "";
  if (BITTENSOR_ACTION_INTENT_PATTERN.test(message)) {
    throw new Error("matterhorn_read_tool_cannot_prepare_action");
  }
}

function buildCryptoEvidenceEnvelope(input: {
  definition: NonNullable<ReturnType<typeof getMatterhornCryptoTool>>;
  status: "success" | "error";
  result: unknown;
  startedAtMs: number;
  completedAtMs: number;
  reviewedAction?: ReviewedActionHandoffV2;
}): MatterhornCryptoEvidenceEnvelope {
  const completedAt = new Date(input.completedAtMs).toISOString();
  const upstreamSource = findEvidenceString(input.result, ["source", "provider", "venue"]);
  const upstreamObservedAt = findEvidenceString(input.result, ["observedAt", "asOf", "updatedAt", "fetchedAt"]);
  const freshness = findEvidenceString(input.result, ["freshness", "freshnessStatus", "dataStatus"]);
  const sanitizedResult = quarantineUntrustedContent(input.result);
  return {
    version: MATTERHORN_CRYPTO_EVIDENCE_VERSION,
    status: input.status,
    tool: {
      name: input.definition.name,
      access: input.definition.access,
      deskIds: input.definition.deskIds,
      actionIds: input.definition.actionIds,
    },
    timing: {
      startedAt: new Date(input.startedAtMs).toISOString(),
      completedAt,
      durationMs: Math.max(0, input.completedAtMs - input.startedAtMs),
    },
    observation: {
      bridgeObservedAt: completedAt,
      ...(upstreamSource ? { upstreamSource } : {}),
      ...(upstreamObservedAt ? { upstreamObservedAt } : {}),
      ...(freshness ? { freshness } : {}),
      freshnessRequired: input.definition.requiresFreshness,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: untrustedContentChanged(input.result, sanitizedResult) ? "quarantined" : "typed_projection",
      evidenceReference: `sha256:${sha256(input.result)}`,
    },
    warnings: evidenceWarnings(input.result),
    ...(input.reviewedAction ? { reviewedAction: input.reviewedAction } : {}),
    result: sanitizedResult,
  };
}

function toolCallResult(input: {
  tool: ManagedMcpTool;
  text: string;
  ok: boolean;
  startedAtMs: number;
  completedAtMs: number;
  reviewedAction?: ReviewedActionHandoffV2;
}) {
  const result = parseToolPayload(input.text);
  const definition = getMatterhornCryptoTool(input.tool.name);
  return {
    content: [{
      type: "text",
      text: modelFacingToolText(
        input.text || (input.ok ? "{}" : "Matterhorn backend returned an empty error"),
        definition?.access ?? "system",
      ),
    }],
    ...(definition
      ? {
          structuredContent: buildCryptoEvidenceEnvelope({
            definition,
            status: input.ok ? "success" : "error",
            result,
            startedAtMs: input.startedAtMs,
            completedAtMs: input.completedAtMs,
            reviewedAction: input.reviewedAction,
          }),
        }
      : {}),
    ...(!input.ok ? { isError: true } : {}),
  };
}

async function callBackendTool(input: {
  tool: ManagedMcpTool;
  args: JsonObject;
  serverUrl: string;
  clientToken: string;
  fetchImpl: typeof fetch;
  authorization?: ManagedMcpToolAuthorization;
  executeCertifiedTool?: ManagedMcpCertifiedToolExecutor;
  onToolCall?: (metric: ManagedMcpToolCallMetric, authorization?: ManagedMcpToolAuthorization) => void;
}) {
  const startedAtMs = Date.now();
  const definition = getMatterhornCryptoTool(input.tool.name);
  let outcome: ManagedMcpToolCallMetric["outcome"] = "error";
  let reviewedAction: ReviewedActionHandoffV2 | undefined;
  let source: string | undefined;
  let freshness: string | undefined;
  assertReadToolArguments(input.tool, input.args);
  try {
    if (input.authorization?.coworker && input.executeCertifiedTool) {
      const certified = await input.executeCertifiedTool({
        toolName: input.tool.name,
        args: input.args,
        authorization: input.authorization,
      });
      if (certified !== null) {
        outcome = "success";
        const completedAtMs = Date.now();
        const certifiedRecord = certified && typeof certified === "object" && !Array.isArray(certified)
          ? certified as JsonObject
          : null;
        const certifiedReviewedAction = certifiedRecord?.reviewedAction;
        reviewedAction = isReviewedActionHandoffV2(certifiedReviewedAction)
          ? certifiedReviewedAction
          : undefined;
        source = findEvidenceString(certified, ["source", "provider", "venue"]);
        freshness = findEvidenceString(certified, ["freshness", "freshnessStatus", "dataStatus", "observedAt", "asOf"]);
        return toolCallResult({
          tool: input.tool,
          text: JSON.stringify(certified),
          ok: true,
          startedAtMs,
          completedAtMs,
          reviewedAction,
        });
      }
    }
    const request = input.tool.request(input.args);
    const response = await input.fetchImpl(`${input.serverUrl.replace(/\/+$/, "")}${request.path}`, {
      method: request.method ?? "GET",
      headers: {
        Authorization: `Bearer ${input.clientToken}`,
        ...(input.authorization?.workspaceId ? { "X-Matterhorn-Workspace-Id": input.authorization.workspaceId } : {}),
        ...(request.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      signal: AbortSignal.timeout(input.tool.timeoutMs ?? 30_000),
    });
    const text = await response.text();
    outcome = response.ok ? "success" : "error";
    const completedAtMs = Date.now();
    const parsedResult = parseToolPayload(text);
    source = findEvidenceString(parsedResult, ["source", "provider", "venue"]);
    freshness = findEvidenceString(parsedResult, ["freshness", "freshnessStatus", "dataStatus", "observedAt", "asOf"]);
    if (response.ok) {
      reviewedAction = buildGuardedReviewedAction({
        toolName: input.tool.name,
        args: input.args,
        result: parsedResult,
        authorization: input.authorization,
        completedAtMs,
      });
    }
    const resultText = reviewedAction
      ? JSON.stringify(attachReviewedActionToToolResult(parsedResult, reviewedAction))
      : text;
    return toolCallResult({
      tool: input.tool,
      text: resultText || (!response.ok ? `Matterhorn backend returned HTTP ${response.status}` : "{}"),
      ok: response.ok,
      startedAtMs,
      completedAtMs,
      reviewedAction,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      outcome = "timeout";
    }
    throw error;
  } finally {
    try {
      input.onToolCall?.({
        tool: input.tool.name,
        access: definition?.access ?? "system",
        outcome,
        durationMs: Math.max(0, Date.now() - startedAtMs),
        ...(reviewedAction ? { reviewedAction } : {}),
        ...(source ? { source } : {}),
        ...(freshness ? { freshness } : {}),
      }, input.authorization);
    } catch {
      // Metrics must never change the MCP result.
    }
  }
}

async function mcpResult(message: JsonRpcRequest, options: {
  serverUrl: string;
  clientToken: string;
  fetchImpl: typeof fetch;
  authorizeToolCall?: (input: { toolName: string; args: JsonObject }) => ManagedMcpToolAuthorization;
  executeCertifiedTool?: ManagedMcpCertifiedToolExecutor;
  onToolCall?: (metric: ManagedMcpToolCallMetric, authorization?: ManagedMcpToolAuthorization) => void;
}) {
  if (message.method === "initialize") {
    return {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "matterhorn-work", version: "0.13.13" },
    };
  }
  if (message.method === "ping") return {};
  if (message.method === "tools/list") {
    return {
      tools: MANAGED_MCP_TOOLS.map(({ request: _request, timeoutMs: _timeoutMs, ...tool }) => tool),
    };
  }
  if (message.method === "tools/call") {
    const params = message.params && typeof message.params === "object" && !Array.isArray(message.params)
      ? message.params as JsonObject
      : {};
    const name = typeof params.name === "string" ? params.name : "";
    const tool = MANAGED_MCP_TOOLS.find((item) => item.name === name);
    if (!tool) return { content: [{ type: "text", text: `Unknown Matterhorn tool: ${name || "(missing)"}` }], isError: true };
    const rawArgs = argumentsObject(params);
    const authorization = options.authorizeToolCall?.({ toolName: tool.name, args: rawArgs });
    return callBackendTool({
      tool,
      args: authorization?.args ?? rawArgs,
      authorization,
      serverUrl: options.serverUrl,
      clientToken: options.clientToken,
      fetchImpl: options.fetchImpl,
      executeCertifiedTool: options.executeCertifiedTool,
      onToolCall: options.onToolCall,
    });
  }
  return {};
}

export async function handleManagedOpencodeMcp(input: {
  payload: unknown;
  serverUrl: string;
  clientToken: string;
  fetchImpl?: typeof fetch;
  authorizeToolCall?: (input: { toolName: string; args: JsonObject }) => ManagedMcpToolAuthorization;
  executeCertifiedTool?: ManagedMcpCertifiedToolExecutor;
  onToolCall?: (metric: ManagedMcpToolCallMetric, authorization?: ManagedMcpToolAuthorization) => void;
}): Promise<{ status: number; body: unknown | null }> {
  const messages = Array.isArray(input.payload) ? input.payload : [input.payload];
  const responses = [];
  for (const candidate of messages) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const message = candidate as JsonRpcRequest;
    if (message.id === undefined) continue;
    if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      responses.push(jsonRpcError(message.id, -32600, "Invalid JSON-RPC request"));
      continue;
    }
    try {
      responses.push({
        jsonrpc: "2.0",
        id: message.id,
        result: await mcpResult(message, {
          serverUrl: input.serverUrl,
          clientToken: input.clientToken,
          fetchImpl: input.fetchImpl ?? fetch,
          authorizeToolCall: input.authorizeToolCall,
          executeCertifiedTool: input.executeCertifiedTool,
          onToolCall: input.onToolCall,
        }),
      });
    } catch (error) {
      responses.push(jsonRpcError(message.id, -32603, error instanceof Error ? error.message : "Matterhorn MCP call failed"));
    }
  }
  if (responses.length === 0) return { status: 202, body: null };
  return { status: 200, body: Array.isArray(input.payload) ? responses : responses[0] };
}

export function managedOpencodeMcpToolNames(): string[] {
  return MANAGED_MCP_TOOLS.map((tool) => tool.name);
}
