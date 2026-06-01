#!/usr/bin/env node
/**
 * Matterhorn Work Wallet + Crypto MCP Server.
 * V1: Real chain reads + CoinGecko / DeFiLlama / 1inch / simulation.
 */

import { createServer } from "node:http";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

// =========================================================
// viem clients (for wallet_readContract / simulate)
// =========================================================
const clients = {
  8453: createPublicClient({ chain: base, transport: http() }),
  84532: createPublicClient({ chain: baseSepolia, transport: http() }),
};

function getClient(chainId) {
  return clients[chainId] ?? null;
}

// =========================================================
// Token registry (for balance reads + 1inch swap)
// =========================================================
const registry = {
  8453: {
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    cbETH: { address: "0x2Ae3F1Ec7F1F5012CFEab8915BA8908c95F7e269", decimals: 18 },
  },
  84532: {
    USDC: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
};

const erc20BalanceOf = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], type: "function" },
];

// =========================================================
// Generic fetch helper with timeout
// =========================================================
async function fetchJson(url, opts = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// =========================================================
// CoinGecko (no key needed for free tier)
// =========================================================
const COINGECKO_CACHE = new Map();
const CG_CACHE_MS = 15_000;

function cgCached(key, fetcher) {
  const hit = COINGECKO_CACHE.get(key);
  if (hit && Date.now() - hit.at < CG_CACHE_MS) return Promise.resolve(hit.data);
  return fetcher().then(data => { COINGECKO_CACHE.set(key, { at: Date.now(), data }); return data; });
}

async function searchCoins(query) {
  const data = await cgCached(`search:${query}`, () => fetchJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`));
  return (data.coins || []).slice(0, 10).map(c => ({ id: c.id, name: c.name, symbol: c.symbol.toUpperCase(), rank: c.market_cap_rank }));
}

async function getPrices(ids) {
  const data = await cgCached(`prices:${ids.sort().join(",")}`, () =>
    fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true`)
  );
  return Object.entries(data).map(([id, v]) => ({ id, price: v.usd, change24h: v.usd_24h_change }));
}

async function trendingCoins() {
  const data = await cgCached("trending", () => fetchJson("https://api.coingecko.com/api/v3/search/trending"));
  return (data.coins || []).slice(0, 10).map(c => ({ id: c.item.id, name: c.item.name, symbol: c.item.symbol.toUpperCase() }));
}

// =========================================================
// DeFiLlama yields
// =========================================================
const LLAMA_CACHE = new Map();
const LLAMA_CACHE_MS = 60_000;

function llamaCached(key, fetcher) {
  const hit = LLAMA_CACHE.get(key);
  if (hit && Date.now() - hit.at < LLAMA_CACHE_MS) return Promise.resolve(hit.data);
  return fetcher().then(data => { LLAMA_CACHE.set(key, { at: Date.now(), data }); return data; });
}

async function getYields(chain, protocol, limit = 20) {
  const data = await llamaCached(`yields`, () => fetchJson("https://yields.llama.fi/pools"));
  let pools = (data.data || []).filter(p => p.chain.toLowerCase() === chain.toLowerCase());
  if (protocol) pools = pools.filter(p => p.project.toLowerCase().includes(protocol.toLowerCase()));
  return pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, limit).map(p => ({
    pool: p.pool, project: p.project, symbol: p.symbol, chain: p.chain, tvlUsd: p.tvlUsd, apy: p.apy,
  }));
}

// =========================================================
// 1inch swap builder
// =========================================================
const ONE_INCH_BASE = "https://api.1inch.dev/swap/v6.0";

function resolveToken(chainId, symbol) {
  const reg = registry[chainId];
  const match = reg?.[symbol.toUpperCase()];
  if (match) return match.address;
  if (/^0x[a-fA-F0-9]{40}$/.test(symbol)) return symbol;
  throw new Error(`Unknown token "${symbol}" on chain ${chainId}`);
}

async function buildSwap({ chainId, fromToken, toToken, amount, fromAddress, slippage = 1 }) {
  const key = process.env.ONE_INCH_API_KEY;
  if (!key) throw new Error("ONE_INCH_API_KEY not configured");

  const url = `${ONE_INCH_BASE}/${chainId}/swap?` +
    new URLSearchParams({
      src: resolveToken(chainId, fromToken),
      dst: resolveToken(chainId, toToken),
      amount: String(amount),
      from: fromAddress,
      slippage: String(slippage),
      disableEstimate: "true",
      includeGas: "true",
    }).toString();

  const data = await fetchJson(url, { headers: { Authorization: `Bearer ${key}` } });

  return {
    action: "swap",
    chainId,
    tx: {
      to: data.tx.to,
      data: data.tx.data,
      value: data.tx.value,
      gas: data.tx.gas,
      gasPrice: data.tx.gasPrice,
    },
    summary: `Swap ${fromToken} → ${toToken}`,
    needsApproval: true,
    protocol: "1inch",
  };
}

// =========================================================
// Transaction simulation via viem
// =========================================================
async function simulateTransaction({ chainId, to, data, value = "0", from }) {
  const client = getClient(chainId);
  if (!client) return { error: `Unsupported chainId: ${chainId}` };
  try {
    await client.call({ to, data, value: BigInt(value), account: from });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || "Simulation failed" };
  }
}

// =========================================================
// MCP tools schema
// =========================================================
const tools = [
  // -- wallet --
  { name: "wallet_connect", description: "Get the connected wallet address and chain info", inputSchema: { type: "object", properties: {} } },
  { name: "wallet_sendTransaction", description: "Prepare an on-chain transaction for user approval.",
    inputSchema: { type: "object", properties: { to: { type: "string" }, value: { type: "string" }, data: { type: "string" }, chainId: { type: "number" }, summary: { type: "string" } }, required: ["to", "value", "chainId"] } },
  { name: "wallet_signMessage", description: "Request a message signature from the connected wallet. Used for Hyperliquid L1 proofs.",
    inputSchema: { type: "object", properties: { message: { type: "string" }, description: { type: "string" } }, required: ["message"] } },
  { name: "wallet_getBalance", description: "Get native (ETH) and USDC balances for a given address on a chain",
    inputSchema: { type: "object", properties: { address: { type: "string" }, chainId: { type: "number" } }, required: ["address", "chainId"] } },
  { name: "wallet_readContract", description: "Call a read-only contract method",
    inputSchema: { type: "object", properties: { address: { type: "string" }, abi: { type: "array" }, functionName: { type: "string" }, args: { type: "array" }, chainId: { type: "number" } }, required: ["address", "abi", "functionName", "chainId"] } },

  // -- research --
  { name: "crypto_searchCoins", description: "Search for coins by keyword",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "crypto_getPrices", description: "Get current USD prices for a list of CoinGecko coin IDs",
    inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] } },
  { name: "crypto_trending", description: "Get trending coins on CoinGecko",
    inputSchema: { type: "object", properties: {} } },
  { name: "crypto_getYields", description: "Get top yield pools on a chain (e.g., Base). Optional protocol filter.",
    inputSchema: { type: "object", properties: { chain: { type: "string" }, protocol: { type: "string" }, limit: { type: "number" } }, required: ["chain"] } },

  // -- execution --
  { name: "crypto_buildSwap", description: "Build a swap transaction via 1inch. Returns tx ready for wallet_sendTransaction.",
    inputSchema: { type: "object", properties: { chainId: { type: "number" }, fromToken: { type: "string" }, toToken: { type: "string" }, amount: { type: "string" }, fromAddress: { type: "string" }, slippage: { type: "number" } }, required: ["chainId", "fromToken", "toToken", "amount", "fromAddress"] } },
  { name: "crypto_simulate", description: "Simulate a raw transaction before signing. Returns success or failure reason.",
    inputSchema: { type: "object", properties: { chainId: { type: "number" }, to: { type: "string" }, data: { type: "string" }, value: { type: "string" }, from: { type: "string" } }, required: ["chainId", "to", "data", "from"] } },
];

// =========================================================
// Helpers
// =========================================================
function jsonRpc(id, result) { return JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"; }
function jsonRpcError(id, code, message) { return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"; }

async function fetchBalance(address, chainId) {
  const client = getClient(chainId);
  if (!client) return { error: `Unsupported chainId: ${chainId}` };
  const native = await client.getBalance({ address });
  let usdc = 0n;
  const usdcAddr = registry[chainId]?.USDC?.address;
  if (usdcAddr) {
    usdc = await client.readContract({ address: usdcAddr, abi: erc20BalanceOf, functionName: "balanceOf", args: [address] });
  }
  return {
    chainId, address,
    native: native.toString(), nativeFormatted: Number(native) / 1e18,
    usdc: usdc.toString(), usdcFormatted: Number(usdc) / 1e6,
  };
}

// =========================================================
// Message handler
// =========================================================
let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      handleMessage(msg);
    } catch {
      process.stderr.write(`MCP parse error: ${trimmed.slice(0, 200)}\n`);
    }
  }
});

function handleMessage(msg) {
  const { method, id } = msg;
  switch (method) {
    case "initialize":
      return process.stdout.write(jsonRpc(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "matterhorn-work-wallet-mcp", version: "0.2.0" } }));
    case "notifications/initialized":
      return;
    case "tools/list":
      return process.stdout.write(jsonRpc(id, { tools }));
    case "tools/call": {
      const { name, arguments: args } = msg.params ?? {};
      switch (name) {
        // ---- wallet ----
        case "wallet_connect":
          return process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ status: "check_ui", message: "Wallet state is managed by the browser UI. Check the wallet panel." }) }] }));
        case "wallet_sendTransaction": {
          const tx = { to: args?.to ?? "", value: args?.value ?? "0x0", data: args?.data, chainId: args?.chainId ?? 8453, summary: args?.summary ?? "Transaction", status: "pending_approval" };
          process.stderr.write(JSON.stringify({ event: "tx_approval", tx }) + "\n");
          return process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ status: "pending_approval", needs_approval: true, tx: { to: tx.to, value: tx.value, data: tx.data } }) }] }));
        }
        case "wallet_signMessage":
          process.stderr.write(JSON.stringify({ event: "sign_message", message: args?.message, description: args?.description }) + "\n");
          return process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ status: "pending_approval", needs_approval: true, type: "sign_message", message: args?.message }) }] }));
        case "wallet_getBalance":
          if (!args?.address || !args?.chainId) return process.stdout.write(jsonRpcError(id, -32602, "address and chainId required"));
          return fetchBalance(args.address, args.chainId).then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(r) }] })));
        case "wallet_readContract": {
          const c = getClient(args?.chainId);
          if (!c) return process.stdout.write(jsonRpcError(id, -32602, `Unsupported chainId: ${args?.chainId}`));
          return c.readContract({ address: args.address, abi: args.abi, functionName: args.functionName, args: args.args ?? [] })
            .then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ result: r }) }] })))
            .catch(err => process.stdout.write(jsonRpcError(id, -32000, err.message || "readContract failed")));
        }

        // ---- research ----
        case "crypto_searchCoins":
          return searchCoins(args.query)
            .then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(r) }] })))
            .catch(err => process.stdout.write(jsonRpcError(id, -32000, err.message || "searchCoins failed")));
        case "crypto_getPrices":
          return getPrices(args.ids)
            .then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(r) }] })))
            .catch(err => process.stdout.write(jsonRpcError(id, -32000, err.message || "getPrices failed")));
        case "crypto_trending":
          return trendingCoins()
            .then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(r) }] })))
            .catch(err => process.stdout.write(jsonRpcError(id, -32000, err.message || "trending failed")));
        case "crypto_getYields":
          return getYields(args.chain, args.protocol, args.limit)
            .then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(r) }] })))
            .catch(err => process.stdout.write(jsonRpcError(id, -32000, err.message || "getYields failed")));

        // ---- execution ----
        case "crypto_buildSwap":
          return buildSwap({ chainId: args.chainId, fromToken: args.fromToken, toToken: args.toToken, amount: args.amount, fromAddress: args.fromAddress, slippage: args.slippage })
            .then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(r) }] })))
            .catch(err => process.stdout.write(jsonRpcError(id, -32000, err.message || "buildSwap failed")));
        case "crypto_simulate":
          return simulateTransaction({ chainId: args.chainId, to: args.to, data: args.data, value: args.value, from: args.from })
            .then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(r) }] })))
            .catch(err => process.stdout.write(jsonRpcError(id, -32000, err.message || "simulate failed")));

        default:
          return process.stdout.write(jsonRpcError(id, -32601, `Unknown tool: ${name}`));
      }
    }
    default:
      process.stderr.write(`MCP unknown method: ${method}\n`);
  }
}

process.stderr.write("Matterhorn Work Wallet + Crypto MCP Server v0.2.0 ready\n");
