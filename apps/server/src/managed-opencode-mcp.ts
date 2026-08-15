import {
  getMatterhornCryptoTool,
  listMatterhornCryptoTools,
  type MatterhornCryptoToolDefinition,
} from "@matterhorn-work/types/crypto-action-registry";
import {
  MATTERHORN_CRYPTO_EVIDENCE_VERSION,
  type MatterhornCryptoEvidenceEnvelope,
} from "@matterhorn-work/types/crypto-evidence";

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

export const MANAGED_MCP_MODEL_CONTENT_MAX_CHARS = 8_000;

export type ManagedMcpToolCallMetric = {
  tool: string;
  access: "read" | "prepare" | "system";
  outcome: "success" | "error" | "timeout";
  durationMs: number;
};

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
    description: "Run a Bittensor-native public read or unsigned preview through the Matterhorn desk workflow. Never signs or broadcasts.",
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
function modelFacingToolText(text: string): string {
  if (text.length <= MANAGED_MCP_MODEL_CONTENT_MAX_CHARS) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return `${text.slice(0, MANAGED_MCP_MODEL_CONTENT_MAX_CHARS - 120)}\n\n[Matterhorn truncated this tool result. Ask for a narrower query to inspect more.]`;
  }

  for (const options of [
    { arrayItems: 8, objectKeys: 50, stringChars: 1_000 },
    { arrayItems: 4, objectKeys: 25, stringChars: 400 },
  ]) {
    const compact = compactJsonForModel(parsed, options);
    const output = JSON.stringify({
      _matterhornContext: "Result shortened for model context. Use a narrower query for omitted detail.",
      result: compact,
    });
    if (output.length <= MANAGED_MCP_MODEL_CONTENT_MAX_CHARS) return output;
  }

  return JSON.stringify({
    _matterhornContext: "Result exceeded the model-context limit. Ask for a narrower query.",
    preview: text.slice(0, Math.floor(MANAGED_MCP_MODEL_CONTENT_MAX_CHARS * 0.65)),
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

function buildCryptoEvidenceEnvelope(input: {
  definition: NonNullable<ReturnType<typeof getMatterhornCryptoTool>>;
  status: "success" | "error";
  result: unknown;
  startedAtMs: number;
  completedAtMs: number;
}): MatterhornCryptoEvidenceEnvelope {
  const completedAt = new Date(input.completedAtMs).toISOString();
  const upstreamSource = findEvidenceString(input.result, ["source", "provider", "venue"]);
  const upstreamObservedAt = findEvidenceString(input.result, ["observedAt", "asOf", "updatedAt", "fetchedAt"]);
  const freshness = findEvidenceString(input.result, ["freshness", "freshnessStatus", "dataStatus"]);
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
    warnings: evidenceWarnings(input.result),
    result: input.result,
  };
}

function toolCallResult(input: {
  tool: ManagedMcpTool;
  text: string;
  ok: boolean;
  startedAtMs: number;
  completedAtMs: number;
}) {
  const result = parseToolPayload(input.text);
  const definition = getMatterhornCryptoTool(input.tool.name);
  return {
    content: [{
      type: "text",
      text: modelFacingToolText(input.text || (input.ok ? "{}" : "Matterhorn backend returned an empty error")),
    }],
    ...(definition
      ? {
          structuredContent: buildCryptoEvidenceEnvelope({
            definition,
            status: input.ok ? "success" : "error",
            result,
            startedAtMs: input.startedAtMs,
            completedAtMs: input.completedAtMs,
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
  onToolCall?: (metric: ManagedMcpToolCallMetric) => void;
}) {
  const startedAtMs = Date.now();
  const definition = getMatterhornCryptoTool(input.tool.name);
  let outcome: ManagedMcpToolCallMetric["outcome"] = "error";
  const request = input.tool.request(input.args);
  try {
    const response = await input.fetchImpl(`${input.serverUrl.replace(/\/+$/, "")}${request.path}`, {
      method: request.method ?? "GET",
      headers: {
        Authorization: `Bearer ${input.clientToken}`,
        ...(request.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      signal: AbortSignal.timeout(input.tool.timeoutMs ?? 30_000),
    });
    const text = await response.text();
    outcome = response.ok ? "success" : "error";
    return toolCallResult({
      tool: input.tool,
      text: text || (!response.ok ? `Matterhorn backend returned HTTP ${response.status}` : "{}"),
      ok: response.ok,
      startedAtMs,
      completedAtMs: Date.now(),
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
      });
    } catch {
      // Metrics must never change the MCP result.
    }
  }
}

async function mcpResult(message: JsonRpcRequest, options: {
  serverUrl: string;
  clientToken: string;
  fetchImpl: typeof fetch;
  onToolCall?: (metric: ManagedMcpToolCallMetric) => void;
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
    return callBackendTool({ tool, args: argumentsObject(params), ...options });
  }
  return {};
}

export async function handleManagedOpencodeMcp(input: {
  payload: unknown;
  serverUrl: string;
  clientToken: string;
  fetchImpl?: typeof fetch;
  onToolCall?: (metric: ManagedMcpToolCallMetric) => void;
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
