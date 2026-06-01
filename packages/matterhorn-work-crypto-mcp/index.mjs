#!/usr/bin/env node
/**
 * Matterhorn Work Crypto MCP Server.
 * V1+V2: CoinGecko, DeFiLlama, 1inch swap builder, tx simulation, Hyperliquid, Polymarket.
 */

import { createServer } from "node:http";

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
  const data = await cgCached(`search:${query}`, () =>
    fetchJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`)
  );
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
  const data = await llamaCached("yields", () => fetchJson("https://yields.llama.fi/pools"));
  let pools = (data.data || []).filter(p => p.chain.toLowerCase() === chain.toLowerCase());
  if (protocol) pools = pools.filter(p => p.project.toLowerCase().includes(protocol.toLowerCase()));
  return pools.sort((a, b) => b.tvlUsd - a.tvlUsd).slice(0, limit).map(p => ({
    pool: p.pool, project: p.project, symbol: p.symbol, chain: p.chain, tvlUsd: p.tvlUsd, apy: p.apy,
  }));
}

// =========================================================
// 1inch swap builder
// =========================================================
const registry = {
  8453: {
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    cbETH: { address: "0x2Ae3F1Ec7F1F5012CFEab8915BA8908c95F7e269", decimals: 18 },
  },
  84532: {
    USDC: { address: "0x036CbD53842c5426634e7949541eC2318f3dCF7e", decimals: 6 },
    WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  },
};

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

  const url = `https://api.1inch.dev/swap/v6.0/${chainId}/swap?` +
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
    tx: { to: data.tx.to, data: data.tx.data, value: data.tx.value, gas: data.tx.gas, gasPrice: data.tx.gasPrice },
    summary: `Swap ${fromToken} → ${toToken}`,
    needsApproval: true,
    protocol: "1inch",
  };
}

// =========================================================
// Transaction simulation via viem read-only clients
// =========================================================
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

const clients = {
  8453: createPublicClient({ chain: base, transport: http() }),
  84532: createPublicClient({ chain: baseSepolia, transport: http() }),
};

function getClient(chainId) { return clients[chainId] ?? null; }

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
// Hyperliquid Research
// =========================================================
async function hlCall(type, payload) {
  const data = await fetchJson("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...(payload !== undefined ? { ...payload } : {}) }),
  });
  if (data?.error) throw new Error(`Hyperliquid error: ${data.error}`);
  return data;
}

async function hl_getMarkets() {
  const data = await hlCall("metaAndAssetCtxs");
  return (data.universe || []).map(u => ({
    name: u.name, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage, fundingIntervalHours: u.fundingIntervalHours, isActive: u.isActive,
  }));
}

async function hl_getFundingRates(symbol) {
  const data = await hlCall("metaAndAssetCtxs");
  const idx = (data.universe || []).findIndex(u => u.name === symbol);
  if (idx < 0) throw new Error(`Market not found: ${symbol}`);
  const ctx = data.assetCtxs[idx];
  return { fundingRate: Number(ctx.fundingRate), markPrice: Number(ctx.markPrice), openInterest: Number(ctx.openInterest), prevFundingRate: Number(ctx.prevFundingRate), nextFundingTime: ctx.nextFundingTime };
}

async function hl_getOrderbook(symbol, limit = 20) {
  const data = await hlCall("l2Book", { coin: symbol });
  const toArray = lvl => (lvl || []).slice(0, limit).map(x => [Number(x.px), Number(x.sz)]);
  return { bids: toArray(data.levels?.[0]), asks: toArray(data.levels?.[1]) };
}

async function hl_getPositions(user) {
  const data = await hlCall("clearinghouseState", { user });
  return (data.assetPositions || []).map(ap => ({
    coin: ap.position.coin, entryPx: Number(ap.position.entryPx), positionValue: Number(ap.position.positionValue),
    unrealizedPnl: Number(ap.position.unrealizedPnl), leverage: Number(ap.position.leverage?.value), liquidPx: ap.position.liquidationPx ? Number(ap.position.liquidationPx) : null, marginUsed: Number(ap.position.marginUsed),
  }));
}

async function hl_getAccountSummary(user) {
  const data = await hlCall("clearinghouseState", { user });
  return { accountValue: Number(data.accountValue), marginUsed: Number(data.marginUsed), withdrawable: Number(data.withdrawable) };
}

// =========================================================
// Hyperliquid Execution
// =========================================================
function buildOrder({ asset, isBuy, sz, limitPx, reduceOnly }) {
  const orderType = limitPx !== undefined ? { limit: { tif: "Gtc" } } : { market: {} };
  return { action: { orderAction: { orders: [{ a: asset, b: isBuy, p: limitPx?.toString() ?? "0", s: String(sz), r: reduceOnly ?? false, t: orderType }] } }, nonce: Date.now(), needsSignature: true };
}

function summarizeOrder({ asset, isBuy, sz, limitPx }) {
  const side = isBuy ? "Buy" : "Sell";
  const type = limitPx !== undefined ? `Limit @ ${limitPx}` : "Market";
  return `${side} ${sz} ${asset} (${type})`;
}

async function submitOrder({ signedOrder, signature, publicAddress }) {
  const data = await fetchJson("https://api.hyperliquid.xyz/exchange", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: signedOrder, signature, nonce: Date.now() }),
  });
  if (data?.error) return { success: false, error: data.error };
  return { success: true, data };
}

// =========================================================
// Polymarket Research
// =========================================================
async function pm_searchEvents(query, limit = 10) {
  const data = await fetchJson(`https://gamma-api.polymarket.com/events?closed=false&active=true&_q=${encodeURIComponent(query)}&limit=${limit}`);
  return (data.events || []).map(e => ({ id: e.id, title: e.title, description: e.description, endDate: e.endDate, volume: e.volume }));
}

async function pm_getEvent(eventId) {
  return await fetchJson(`https://gamma-api.polymarket.com/events/${eventId}`);
}

async function pm_getOrderbook(marketId, limit = 5) {
  const data = await fetchJson(`https://gamma-api.polymarket.com/markets/${marketId}/orderbook?limit=${limit}`);
  return {
    bids: (data.bids || []).map(b => ({ price: Number(b.price), size: Number(b.size) })),
    asks: (data.asks || []).map(a => ({ price: Number(a.price), size: Number(a.size) })),
  };
}

// =========================================================
// MCP tools schema
// =========================================================
const tools = [
  // -- research --
  { name: "crypto_searchCoins", description: "Search for coins by keyword", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "crypto_getPrices", description: "Get current USD prices for a list of CoinGecko coin IDs", inputSchema: { type: "object", properties: { ids: { type: "array", items: { type: "string" } } }, required: ["ids"] } },
  { name: "crypto_trending", description: "Get trending coins on CoinGecko", inputSchema: { type: "object", properties: {} } },
  { name: "crypto_getYields", description: "Get top yield pools on a chain (e.g., Base). Optional protocol filter.", inputSchema: { type: "object", properties: { chain: { type: "string" }, protocol: { type: "string" }, limit: { type: "number" } }, required: ["chain"] } },

  // -- execution --
  { name: "crypto_buildSwap", description: "Build a swap transaction via 1inch. Returns tx ready for wallet_sendTransaction.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, fromToken: { type: "string" }, toToken: { type: "string" }, amount: { type: "string" }, fromAddress: { type: "string" }, slippage: { type: "number" } }, required: ["chainId", "fromToken", "toToken", "amount", "fromAddress"] } },
  { name: "crypto_simulate", description: "Simulate a raw transaction before signing. Returns success or failure reason.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, to: { type: "string" }, data: { type: "string" }, value: { type: "string" }, from: { type: "string" } }, required: ["chainId", "to", "data", "from"] } },

  // -- hyperliquid --
  { name: "hl_getMarkets", description: "Get all Hyperliquid perpetual markets", inputSchema: { type: "object", properties: {} } },
  { name: "hl_getFundingRates", description: "Get funding rates for a Hyperliquid market", inputSchema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } },
  { name: "hl_getOrderbook", description: "Get orderbook depth for a Hyperliquid market", inputSchema: { type: "object", properties: { symbol: { type: "string" }, limit: { type: "number" } }, required: ["symbol"] } },
  { name: "hl_getPositions", description: "Get open positions for a Hyperliquid user", inputSchema: { type: "object", properties: { user: { type: "string" } }, required: ["user"] } },
  { name: "hl_getAccountSummary", description: "Get Hyperliquid account summary (margin, balance)", inputSchema: { type: "object", properties: { user: { type: "string" } }, required: ["user"] } },
  { name: "hl_buildOrder", description: "Build an unsigned Hyperliquid order JSON (needs wallet_signMessage after)", inputSchema: { type: "object", properties: { asset: { type: "string" }, isBuy: { type: "boolean" }, sz: { type: "number" }, limitPx: { type: "number" }, reduceOnly: { type: "boolean" } }, required: ["asset", "isBuy", "sz"] } },
  { name: "hl_summarizeOrder", description: "Generate a human-readable summary of an HL order", inputSchema: { type: "object", properties: { asset: { type: "string" }, isBuy: { type: "boolean" }, sz: { type: "number" }, limitPx: { type: "number" } }, required: ["asset", "isBuy", "sz"] } },
  { name: "hl_submitOrder", description: "Submit a signed Hyperliquid order. Requires L1 signature from wallet_signMessage.", inputSchema: { type: "object", properties: { signedOrder: {}, signature: { type: "string" }, publicAddress: { type: "string" } }, required: ["signedOrder", "signature", "publicAddress"] } },

  // -- polymarket --
  { name: "pm_searchEvents", description: "Search Polymarket events by keyword", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "pm_getEvent", description: "Get full Polymarket event details", inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"] } },
  { name: "pm_getOrderbook", description: "Get orderbook for a Polymarket market", inputSchema: { type: "object", properties: { marketId: { type: "string" }, limit: { type: "number" } }, required: ["marketId"] } },
];

// =========================================================
// JSON-RPC helpers
// =========================================================
function jsonRpc(id, result) { return JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"; }
function jsonRpcError(id, code, message) { return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"; }
function textResult(data) { return { content: [{ type: "text", text: JSON.stringify(data) }] }; }

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
      return process.stdout.write(jsonRpc(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "matterhorn-work-crypto-mcp", version: "0.2.0" } }));
    case "notifications/initialized":
      return;
    case "tools/list":
      return process.stdout.write(jsonRpc(id, { tools }));
    case "tools/call": {
      const { name, arguments: args } = msg.params ?? {};
      const respond = (res) => process.stdout.write(jsonRpc(id, res));
      const catchErr = (err) => process.stdout.write(jsonRpcError(id, -32000, err.message || `${name} failed`));

      switch (name) {
        case "crypto_searchCoins": return searchCoins(args.query).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_getPrices": return getPrices(args.ids).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_trending": return trendingCoins().then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_getYields": return getYields(args.chain, args.protocol, args.limit).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_buildSwap": return buildSwap({ chainId: args.chainId, fromToken: args.fromToken, toToken: args.toToken, amount: args.amount, fromAddress: args.fromAddress, slippage: args.slippage }).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_simulate": return simulateTransaction({ chainId: args.chainId, to: args.to, data: args.data, value: args.value, from: args.from }).then(r => respond(textResult(r))).catch(catchErr);

        case "hl_getMarkets": return hl_getMarkets().then(r => respond(textResult(r))).catch(catchErr);
        case "hl_getFundingRates": return hl_getFundingRates(args.symbol).then(r => respond(textResult(r))).catch(catchErr);
        case "hl_getOrderbook": return hl_getOrderbook(args.symbol, args.limit).then(r => respond(textResult(r))).catch(catchErr);
        case "hl_getPositions": return hl_getPositions(args.user).then(r => respond(textResult(r))).catch(catchErr);
        case "hl_getAccountSummary": return hl_getAccountSummary(args.user).then(r => respond(textResult(r))).catch(catchErr);
        case "hl_buildOrder": return respond(textResult(buildOrder({ asset: args.asset, isBuy: args.isBuy, sz: args.sz, limitPx: args.limitPx, reduceOnly: args.reduceOnly })));
        case "hl_summarizeOrder": return respond(textResult({ summary: summarizeOrder({ asset: args.asset, isBuy: args.isBuy, sz: args.sz, limitPx: args.limitPx }) }));
        case "hl_submitOrder": return submitOrder({ signedOrder: args.signedOrder, signature: args.signature, publicAddress: args.publicAddress }).then(r => respond(textResult(r))).catch(catchErr);

        case "pm_searchEvents": return pm_searchEvents(args.query, args.limit).then(r => respond(textResult(r))).catch(catchErr);
        case "pm_getEvent": return pm_getEvent(args.eventId).then(r => respond(textResult(r))).catch(catchErr);
        case "pm_getOrderbook": return pm_getOrderbook(args.marketId, args.limit).then(r => respond(textResult(r))).catch(catchErr);

        default:
          return process.stdout.write(jsonRpcError(id, -32601, `Unknown tool: ${name}`));
      }
    }
    default:
      process.stderr.write(`MCP unknown method: ${method}\n`);
  }
}

process.stderr.write("Matterhorn Work Crypto MCP Server v0.2.0 ready\n");
