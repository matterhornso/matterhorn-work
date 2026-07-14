type JsonObject = Record<string, unknown>;

type ManagedMcpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonObject;
  request: (args: JsonObject) => { path: string; method?: "GET" | "POST"; body?: JsonObject };
};

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

const objectSchema = (properties: JsonObject, required: string[] = []): JsonObject => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

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

const MANAGED_MCP_TOOLS: ManagedMcpTool[] = [
  {
    name: "matterhorn_status",
    title: "Matterhorn status",
    description: "Read the local Matterhorn Work engine status and capability summary.",
    inputSchema: objectSchema({}),
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
    name: "matterhorn_hyperliquid_list_markets",
    title: "Hyperliquid markets",
    description: "List public Hyperliquid markets with source and freshness metadata.",
    inputSchema: objectSchema({ limit: { type: "number", minimum: 1, maximum: 50 } }),
    request: (args) => ({ path: queryPath("/api/hyperliquid/markets", args, ["limit"]) }),
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
    name: "matterhorn_sui_get_balance",
    title: "Sui public balance",
    description: "Read a public Sui address balance. Never requests or handles wallet secrets.",
    inputSchema: objectSchema({
      address: { type: "string", description: "Public Sui address." },
      network: { type: "string", enum: ["mainnet", "testnet", "devnet"] },
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
      network: { type: "string", enum: ["mainnet", "testnet", "devnet"] },
      sender: { type: "string", description: "Public sender address." },
      recipient: { type: "string", description: "Public recipient address." },
      amount: { type: "string", description: "Transfer amount as a decimal string." },
      coinType: { type: "string", description: "Optional public coin type." },
    }, ["network", "sender", "recipient", "amount"]),
    request: (args) => ({ path: "/api/sui/transactions/preview", method: "POST", body: args }),
  },
];

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function argumentsObject(params: unknown): JsonObject {
  if (!params || typeof params !== "object" || Array.isArray(params)) return {};
  const value = (params as JsonObject).arguments;
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

async function callBackendTool(input: {
  tool: ManagedMcpTool;
  args: JsonObject;
  serverUrl: string;
  clientToken: string;
  fetchImpl: typeof fetch;
}) {
  const request = input.tool.request(input.args);
  const response = await input.fetchImpl(`${input.serverUrl.replace(/\/+$/, "")}${request.path}`, {
    method: request.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.clientToken}`,
      ...(request.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    return {
      content: [{ type: "text", text: text || `Matterhorn backend returned HTTP ${response.status}` }],
      isError: true,
    };
  }
  return { content: [{ type: "text", text: text || "{}" }] };
}

async function mcpResult(message: JsonRpcRequest, options: {
  serverUrl: string;
  clientToken: string;
  fetchImpl: typeof fetch;
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
      tools: MANAGED_MCP_TOOLS.map(({ request: _request, ...tool }) => tool),
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
