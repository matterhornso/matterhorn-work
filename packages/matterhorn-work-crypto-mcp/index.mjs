#!/usr/bin/env node
/**
 * Matterhorn Work Crypto MCP Server.
 * V1+V2: CoinGecko, DeFiLlama, 1inch swap builder, tx simulation, Hyperliquid, Polymarket.
 * V3: Added security tools — approval manager, calldata decoder, ENS resolver, gas estimator.
 * V4: Added batch builder (crypto_buildBatch) + portfolio tracker (crypto_getPortfolio).
 */

import { createServer } from "node:http";

// =========================================================
// Clients
// =========================================================
let viemClientsPromise = null;

async function getViemClients() {
  if (!viemClientsPromise) {
    viemClientsPromise = Promise.all([import("viem"), import("viem/chains")]).then(
      ([{ createPublicClient, http }, { base, baseSepolia, mainnet }]) => {
        const clients = {
          8453: createPublicClient({ chain: base, transport: http() }),
          84532: createPublicClient({ chain: baseSepolia, transport: http() }),
        };
        const mainnetClient = createPublicClient({ chain: mainnet, transport: http() });
        return { clients, mainnetClient };
      },
    );
  }
  return viemClientsPromise;
}

async function getClient(chainId) {
  const { clients } = await getViemClients();
  return clients[chainId] ?? null;
}

async function getMainnetClient() {
  const { mainnetClient } = await getViemClients();
  return mainnetClient;
}

// Server proxy for tools that live in apps/server
const SERVER = process.env.MATTERHORN_SERVER_URL || "http://localhost:8787";
async function callServer(path, method = "GET", body = null) {
  const url = `${SERVER}${path}`;
  const opts = { method, headers: {} };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`Server HTTP ${res.status}`);
  return res.json();
}

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
    USDC: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 },
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

function formatAmount(raw, symbol) {
  const num = Number(raw);
  if (symbol.toUpperCase() === "USDC") return (num / 1e6).toFixed(2);
  if (symbol.toUpperCase() === "WETH" || symbol.toUpperCase() === "ETH") return (num / 1e18).toFixed(4);
  return raw;
}

function enforceSlippageLimit(slippagePct, maxBps = 100) {
  const requestedBps = Math.round(slippagePct * 100);
  if (requestedBps > maxBps) {
    throw new Error(
      `Slippage ${slippagePct}% exceeds the maximum allowed ${(maxBps / 100).toFixed(2)}% (${maxBps} bps). ` +
        "Increase the limit in wallet settings or reduce slippage."
    );
  }
}

/** Quote only — no transaction. Useful for agent reasoning. */
export async function getQuote({ chainId, fromToken, toToken, amount, slippage = 1, maxSlippageBps }) {
  const effectiveMax = maxSlippageBps ?? 100;
  enforceSlippageLimit(slippage, effectiveMax);

  const key = process.env.ONE_INCH_API_KEY;
  if (!key) throw new Error("ONE_INCH_API_KEY not configured");

  const url = `https://api.1inch.dev/swap/v6.0/${chainId}/quote?` +
    new URLSearchParams({ src: resolveToken(chainId, fromToken), dst: resolveToken(chainId, toToken), amount: String(amount) }).toString();

  const data = await fetchJson(url, { headers: { Authorization: `Bearer ${key}` } });

  return {
    from: data.fromToken?.symbol ?? fromToken,
    to: data.toToken?.symbol ?? toToken,
    fromAmount: data.fromAmount,
    toAmount: data.toAmount,
    estimatedGas: data.estimatedGas,
    slippagePct: slippage,
  };
}

async function buildSwap({ chainId, fromToken, toToken, amount, fromAddress, slippage = 1, maxSlippageBps }) {
  const effectiveMax = maxSlippageBps ?? 100;
  enforceSlippageLimit(slippage, effectiveMax);

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
    summary: `Swap ${formatAmount(data.fromTokenAmount, fromToken)} ${data.fromToken.symbol} → ${formatAmount(data.toTokenAmount, data.toToken.symbol)} ${data.toToken.symbol}`,
    needsApproval: true,
    protocol: "1inch",
  };
}

// =========================================================
// Transaction simulation via viem read-only clients
// =========================================================
async function simulateTransaction({ chainId, to, data, value = "0", from }) {
  const client = await getClient(chainId);
  if (!client) return { error: `Unsupported chainId: ${chainId}` };
  try {
    await client.call({ to, data, value: BigInt(value), account: from });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || "Simulation failed" };
  }
}

// =========================================================
// Security: Approval Manager
// =========================================================
const erc20AllowanceAbi = [
  { constant: true, inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ name: "", type: "uint256" }], type: "function" },
  { constant: true, inputs: [], name: "decimals", outputs: [{ name: "", type: "uint8" }], type: "function" },
  { constant: true, inputs: [], name: "symbol", outputs: [{ name: "", type: "string" }], type: "function" },
  { constant: true, inputs: [], name: "name", outputs: [{ name: "", type: "string" }], type: "function" },
];

const erc20ApproveAbi = [
  { name: "approve", type: "function", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
];

async function getTokenMeta(chainId, tokenAddress) {
  const client = await getClient(chainId);
  if (!client) return null;
  try {
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({ address: tokenAddress, abi: erc20AllowanceAbi, functionName: "symbol" }).catch(() => "???"),
      client.readContract({ address: tokenAddress, abi: erc20AllowanceAbi, functionName: "name" }).catch(() => "Unknown Token"),
      client.readContract({ address: tokenAddress, abi: erc20AllowanceAbi, functionName: "decimals" }).catch(() => 18),
    ]);
    return { symbol, name, decimals: Number(decimals) };
  } catch { return null; }
}

async function getAllowance({ chainId, tokenAddress, owner, spender }) {
  const client = await getClient(chainId);
  if (!client) return { success: false, error: `Unsupported chainId: ${chainId}` };
  try {
    const [allowance, meta] = await Promise.all([
      client.readContract({ address: tokenAddress, abi: erc20AllowanceAbi, functionName: "allowance", args: [owner, spender] }),
      getTokenMeta(chainId, tokenAddress),
    ]);
    return {
      success: true, tokenAddress, owner, spender,
      allowance: allowance.toString(),
      allowanceFormatted: meta ? Number(allowance) / 10 ** meta.decimals : null,
      symbol: meta?.symbol ?? null, name: meta?.name ?? null,
    };
  } catch (err) {
    return { success: false, error: err.message || "getAllowance failed" };
  }
}

function buildRevokeApprovalTx({ tokenAddress, spender }) {
  try {
    // viem encodeFunctionData is not readily available in plain node without viem/utils in ESM.
    // We know the function selector for approve(address,uint256) is 0x095ea7b3.
    // ABI encode: approve(address spender, uint256 amount)
    // selector = 0x095ea7b3
    // address pad left to 32 bytes
    // uint256 0 = 0x0000....0000 (64 zeros)
    const paddedSpender = spender.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const data = `0x095ea7b3${paddedSpender}0000000000000000000000000000000000000000000000000000000000000000`;
    return {
      success: true, tokenAddress, spender, data,
      description: `Revoke approval for ${spender} on ${tokenAddress}`,
    };
  } catch (err) {
    return { success: false, error: err.message || "Failed to build revoke tx" };
  }
}

// =========================================================
// Security: Calldata Decoder
// =========================================================
const KNOWN_SIGNATURES = {
  "0x095ea7b3": "approve(address,uint256)",
  "0xa9059cbb": "transfer(address,uint256)",
  "0x23b872dd": "transferFrom(address,address,uint256)",
  "0x38ed1739": "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)",
  "0x8803dbee": "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)",
  "0x7ff36ab5": "swapExactETHForTokens(uint256,address[],address,uint256)",
  "0x18cbafe5": "swapExactTokensForETH(uint256,uint256,address[],address,uint256)",
  "0xe8e33700": "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)",
  "0xf305d719": "addLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
  "0xbaa2abde": "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
  "0x02751cec": "removeLiquidityETH(address,uint256,uint256,uint256,address,uint256)",
  "0xd0e30db0": "deposit()",
  "0x2e1a7d4d": "withdraw(uint256)",
};

function decodeCalldataFast(data) {
  const clean = data.toLowerCase().replace(/^0x/, "");
  const selector = `0x${clean.slice(0, 8)}`;
  return { selector, signature: KNOWN_SIGNATURES[selector] ?? null, params: `0x${clean.slice(8)}`, raw: data };
}

async function decodeSelector(selector) {
  const short = selector.toLowerCase().replace(/^0x/, "").slice(0, 8);
  // Prefer local known-signature cache (higher quality, no network)
  if (KNOWN_SIGNATURES[`0x${short}`]) {
    return { success: true, selector: short, signatures: [KNOWN_SIGNATURES[`0x${short}`]], bestGuess: KNOWN_SIGNATURES[`0x${short}`] };
  }
  // Fall back to 4byte.directory
  try {
    const res = await fetchJson(`https://www.4byte.directory/api/v1/signatures/?hex_signature=0x${short}`, {}, 10000);
    const signatures = (res.results || []).map(r => r.text_signature);
    return { success: true, selector: short, signatures, bestGuess: signatures[0] ?? null };
  } catch (err) {
    return { success: false, error: err.message || "4byte lookup failed" };
  }
}

async function decodeCalldata(data) {
  const clean = data.toLowerCase().replace(/^0x/, "");
  if (clean.length < 8) return { success: false, error: "Calldata too short" };
  const selector = `0x${clean.slice(0, 8)}`;
  const params = `0x${clean.slice(8)}`;
  const lookup = await decodeSelector(selector);
  if (!lookup.success) {
    return { success: true, selector, signature: null, params, raw: data, note: "Unknown function — could not decode via 4byte.directory" };
  }
  return { success: true, selector, signature: lookup.bestGuess, signatures: lookup.signatures, params, raw: data };
}

// =========================================================
// Security: ENS Resolution
// =========================================================
async function resolveEnsName(name) {
  try {
    const mainnetClient = await getMainnetClient();
    const address = await mainnetClient.getEnsAddress({ name });
    return { success: true, name, address: address ?? null, resolved: address !== null };
  } catch (err) {
    return { success: false, name, error: err.message || "ENS resolution failed" };
  }
}

async function lookupEnsAddress(address) {
  try {
    const mainnetClient = await getMainnetClient();
    const ensName = await mainnetClient.getEnsName({ address });
    return { success: true, address, ensName: ensName ?? null, resolved: ensName !== null };
  } catch (err) {
    return { success: false, address, error: err.message || "ENS reverse lookup failed" };
  }
}

// =========================================================
// Security: Gas Estimator
// =========================================================
const gasPriceCache = {};
const GAS_PRICE_TTL_MS = 60_000;

async function getGasPriceCached(chainId) {
  const now = Date.now();
  const cached = gasPriceCache[chainId];
  if (cached && now - cached.timestamp < GAS_PRICE_TTL_MS) return cached.price;
  const client = await getClient(chainId);
  if (!client) return null;
  try {
    const price = await client.getGasPrice();
    gasPriceCache[chainId] = { price, timestamp: now };
    return price;
  } catch { return null; }
}

async function estimateGas({ chainId, to, data, value = "0", from }) {
  const client = await getClient(chainId);
  if (!client) return { success: false, error: `Unsupported chainId: ${chainId}` };
  try {
    const [gas, gasPrice] = await Promise.all([
      client.estimateGas({ to, data, value: BigInt(value), account: from }),
      getGasPriceCached(chainId),
    ]);
    const gasPriceGwei = gasPrice ? Number(gasPrice) / 1e9 : null;
    const costWei = gasPrice ? gas * gasPrice : null;
    const costEth = costWei ? Number(costWei) / 1e18 : null;
    return {
      success: true,
      gas: gas.toString(), gasFormatted: Number(gas).toLocaleString(),
      gasPriceWei: gasPrice?.toString() ?? null, gasPriceGwei,
      estimatedCostWei: costWei?.toString() ?? null,
      estimatedCostEth: costEth !== null ? costEth.toFixed(8) : null,
      estimatedCostUSD: costEth !== null ? (costEth * 2000).toFixed(2) : null,
      unit: "ETH",
    };
  } catch (err) {
    return { success: false, error: err.message || "Gas estimation failed" };
  }
}

async function getGasPrice(chainId) {
  const price = await getGasPriceCached(chainId);
  if (!price) return { success: false, error: "Failed to fetch gas price" };
  return { success: true, gasPriceWei: price.toString(), gasPriceGwei: Number(price) / 1e9, unit: "gwei" };
}

// =========================================================
// Hyperliquid Research
// =========================================================
async function hlCall(type, payload) {
  const data = await fetchJson("https://api.hyperliquid.xyz/info", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...(payload !== undefined ? { ...payload } : {}) }),
  });
  if (data?.error) throw new Error(`Hyperliquid error: ${data.error}`);
  return data;
}

async function hl_getMarkets() {
  const data = await hlCall("metaAndAssetCtxs");
  const meta = Array.isArray(data) && data.length >= 1 ? data[0] : data;
  return (meta.universe || []).map(u => ({
    name: u.name, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage, fundingIntervalHours: u.fundingIntervalHours, isActive: u.isActive,
  }));
}

async function hl_getFundingRates(symbol) {
  const data = await hlCall("metaAndAssetCtxs");
  const meta = Array.isArray(data) && data.length >= 1 ? data[0] : data;
  const ctxs = Array.isArray(data) && data.length >= 2 ? data[1] : data.assetCtxs;
  const idx = meta.universe?.findIndex(u => u.name === symbol) ?? -1;
  if (idx < 0) throw new Error(`Market not found: ${symbol}`);
  const ctx = ctxs[idx];
  return { fundingRate: Number(ctx.funding), markPrice: Number(ctx.markPx), openInterest: Number(ctx.openInterest), premium: Number(ctx.premium), oraclePrice: Number(ctx.oraclePx) };
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
  const events = Array.isArray(data) ? data : (data.events || []);
  return events.map(e => ({ id: e.id, title: e.title, description: e.description, endDate: e.endDate, volume: e.volume }));
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
// Bittensor Research and Quote-only Actions
// =========================================================
function filterSubnets(subnets, query, limit) {
  const q = String(query || "").trim().toLowerCase();
  const filtered = q
    ? subnets.filter((s) => `${s.netuid} ${s.name} ${s.symbol} ${s.category} ${s.benefitSummary}`.toLowerCase().includes(q))
    : subnets;
  return filtered.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 20);
}

async function bittensor_list_subnets({ query, limit } = {}) {
  const res = await callServer("/api/bittensor/subnets");
  return { success: true, subnets: filterSubnets(res.subnets || [], query, limit), cards: res.cards || [], source: "matterhorn-server" };
}

async function bittensor_explain_subnet(netuid) {
  const res = await callServer(`/api/bittensor/subnets/${encodeURIComponent(String(netuid))}`);
  return {
    success: true,
    subnet: res.subnet,
    cards: res.cards || [],
    guidance: "Use this as read-only context. Bittensor stake, unstake, and transfer operations require an external Bittensor-compatible signer.",
  };
}

async function bittensor_compare_subnets(netuids) {
  const ids = Array.isArray(netuids) ? netuids : [];
  const subnets = await Promise.all(ids.slice(0, 6).map((netuid) => bittensor_explain_subnet(netuid).then((r) => r.subnet)));
  return {
    success: true,
    subnets,
    comparison: subnets.map((s) => ({
      netuid: s.netuid,
      name: s.name,
      category: s.category,
      priceTao: s.priceTao,
      emission: s.emission,
      neurons: s.metagraphSummary?.neurons ?? null,
      benefitSummary: s.benefitSummary,
      providerSource: s.source,
    })),
    cards: subnets.flatMap((s) => s ? [{
      kind: "subnet_comparison",
      title: `${s.name} (${s.symbol})`,
      subtitle: `Subnet ${s.netuid} · ${s.category}`,
      summary: s.benefitSummary,
      items: [
        { label: "Price", value: s.priceTao === null || s.priceTao === undefined ? "Unavailable" : `${s.priceTao} TAO` },
        { label: "Emission", value: s.emission === null || s.emission === undefined ? "Unavailable" : String(s.emission) },
        { label: "Neurons", value: s.metagraphSummary?.neurons === null || s.metagraphSummary?.neurons === undefined ? "Unavailable" : String(s.metagraphSummary.neurons) },
        { label: "Source", value: s.source || "Unavailable", tone: s.source === "curated-fallback" ? "warning" : "muted" },
      ],
      warnings: s.risks || [],
      data: { subnet: s },
    }] : []),
  };
}

async function bittensor_get_wallet_positions(ss58Address) {
  const res = await callServer(`/api/bittensor/wallet/${encodeURIComponent(String(ss58Address || ""))}`);
  return { success: true, wallet: res.wallet, cards: res.cards || [] };
}

async function bittensor_prepare_action(args) {
  const res = await callServer("/api/bittensor/actions/quote", "POST", {
    action: args.action,
    netuid: args.netuid,
    amountTao: args.amountTao,
    validatorHotkey: args.validatorHotkey,
    recipient: args.recipient,
  });
  return {
    success: true,
    quote: res.quote,
    cards: res.cards || [],
    execution: "quote_only_external_signature_required",
  };
}

async function bittensor_plan_from_chat(args) {
  const res = await callServer("/api/bittensor/chat/plan", "POST", {
    message: args.message,
    ss58Address: args.ss58Address,
  });
  return { success: true, plan: res.plan, cards: res.cards || [] };
}

async function bittensor_chat(args) {
  const res = await callServer("/api/bittensor/chat/execute", "POST", {
    message: args.message,
    ss58Address: args.ss58Address,
    netuid: args.netuid,
    amountTao: args.amountTao,
    validatorHotkey: args.validatorHotkey,
    coldkey: args.coldkey,
    recipient: args.recipient,
    destination: args.destination,
    limit: args.limit,
    strategy: args.strategy,
    rateTolerance: args.rateTolerance,
  });
  return {
    success: true,
    plan: res.plan,
    responseText: res.responseText,
    cards: res.cards || [],
    data: res.data || {},
    warnings: res.warnings || [],
    requiresClarification: Boolean(res.requiresClarification),
    clarificationQuestion: res.clarificationQuestion ?? null,
    execution: res.execution,
  };
}

async function bittensor_find_subnets_for_goal(args) {
  const goal = args.goal || args.query || "Find useful Bittensor subnets";
  const [plan, discovery] = await Promise.all([
    bittensor_plan_from_chat({ message: args.goal || args.query || "Find useful Bittensor subnets" }),
    callServer("/api/bittensor/subnets/discover", "POST", {
      goal,
      limit: args.limit || 8,
    }),
  ]);
  return {
    success: true,
    goal,
    plan: plan.plan,
    matches: discovery.matches || [],
    subnets: (discovery.matches || []).map((match) => match.subnet).filter(Boolean),
    cards: discovery.cards || [],
  };
}

async function bittensor_get_subnet_capabilities(args) {
  if (Number.isFinite(args.netuid)) {
    const res = await callServer(`/api/bittensor/capabilities/${encodeURIComponent(String(args.netuid))}`);
    return { success: true, capability: res.capability };
  }
  const res = await callServer("/api/bittensor/capabilities");
  return { success: true, capabilities: res.capabilities };
}

async function bittensor_get_sidecar_status() {
  const res = await callServer("/api/bittensor/sidecar/status");
  return { success: true, sidecar: res.sidecar };
}

async function bittensor_get_sidecar_health() {
  const res = await callServer("/api/bittensor/sidecar/health");
  return { success: true, health: res.health, cards: res.cards || [] };
}

async function bittensor_readiness_audit() {
  const res = await callServer("/api/bittensor/readiness");
  return { success: true, report: res.report, cards: res.cards || [] };
}

async function bittensor_prepare_extrinsic(args) {
  const res = await callServer("/api/bittensor/extrinsics/prepare", "POST", args);
  return {
    success: true,
    preview: res.preview,
    cards: res.cards || [],
    execution: "external_signature_required",
  };
}

async function bittensor_create_signing_handoff(args) {
  const res = await callServer("/api/bittensor/extrinsics/handoff", "POST", {
    preview: args.preview,
  });
  return {
    success: true,
    handoff: res.handoff,
    cards: res.cards || [],
    execution: "external_signature_handoff",
  };
}

async function bittensor_submit_signed_extrinsic(args) {
  const res = await callServer("/api/bittensor/extrinsics/submit", "POST", {
    preview: args.preview,
    signature: args.signature,
    signerAddress: args.signerAddress,
  });
  return { success: true, result: res.result, cards: res.cards || [] };
}

async function bittensor_invoke_subnet(args) {
  const res = await callServer(`/api/bittensor/subnets/${encodeURIComponent(String(args.netuid))}/invoke`, "POST", {
    intent: args.intent,
    task: args.task,
    ss58Address: args.ss58Address,
  });
  return { success: true, invocation: res.invocation, cards: res.cards || [] };
}

async function bittensor_compare_validators(args) {
  const res = await callServer("/api/bittensor/validators/compare", "POST", {
    netuid: args.netuid,
    hotkeys: args.hotkeys,
    limit: args.limit,
    strategy: args.strategy,
  });
  return { success: true, comparison: res.comparison, cards: res.cards || [] };
}

async function bittensor_create_watch(args) {
  const res = await callServer("/api/bittensor/monitoring/watchlist", "POST", {
    kind: args.kind,
    label: args.label,
    netuid: args.netuid,
    ss58Address: args.ss58Address,
    threshold: args.threshold,
  });
  return { success: true, watch: res.watch, watches: res.watches, cards: res.cards || [] };
}

async function bittensor_list_watches() {
  const res = await callServer("/api/bittensor/monitoring/watchlist");
  return { success: true, watches: res.watches || [], cards: res.cards || [] };
}

async function bittensor_check_watches() {
  const res = await callServer("/api/bittensor/monitoring/check");
  return { success: true, evaluations: res.evaluations || [], cards: res.cards || [] };
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
  { name: "crypto_getQuote", description: "Get a swap quote via 1inch (no transaction built). Useful for comparing rates.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, fromToken: { type: "string" }, toToken: { type: "string" }, amount: { type: "string" }, slippage: { type: "number" }, maxSlippageBps: { type: "number" } }, required: ["chainId", "fromToken", "toToken", "amount"] } },
  { name: "crypto_buildSwap", description: "Build a swap transaction via 1inch. Returns tx ready for wallet_sendTransaction.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, fromToken: { type: "string" }, toToken: { type: "string" }, amount: { type: "string" }, fromAddress: { type: "string" }, slippage: { type: "number" }, maxSlippageBps: { type: "number" } }, required: ["chainId", "fromToken", "toToken", "amount", "fromAddress"] } },
  { name: "crypto_simulate", description: "Simulate a raw transaction before signing. Returns success or failure reason.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, to: { type: "string" }, data: { type: "string" }, value: { type: "string" }, from: { type: "string" } }, required: ["chainId", "to", "data", "from"] } },

  // -- security / analysis --
  { name: "security_checkAllowance", description: "Check the current ERC-20 allowance for a token, owner, and spender.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, tokenAddress: { type: "string" }, owner: { type: "string" }, spender: { type: "string" } }, required: ["chainId", "tokenAddress", "owner", "spender"] } },
  { name: "security_revokeApproval", description: "Build a revoke (approve to 0) transaction for an ERC-20 token. Returns tx data to send via wallet_sendTransaction.", inputSchema: { type: "object", properties: { tokenAddress: { type: "string" }, spender: { type: "string" } }, required: ["tokenAddress", "spender"] } },
  { name: "security_decodeCalldata", description: "Decode a transaction's calldata to reveal which function is being called. Uses 4byte.directory + local known signatures.", inputSchema: { type: "object", properties: { data: { type: "string" } }, required: ["data"] } },
  { name: "security_estimateGas", description: "Estimate gas cost for a transaction in ETH and USD. Use before suggesting any on-chain action.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, to: { type: "string" }, data: { type: "string" }, value: { type: "string" }, from: { type: "string" } }, required: ["chainId", "to", "data", "from"] } },
  { name: "security_resolveEns", description: "Resolve an ENS name (e.g. vitalik.eth) to a 0x address.", inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } },
  { name: "security_lookupEns", description: "Reverse-resolve an address to its ENS name, if any.", inputSchema: { type: "object", properties: { address: { type: "string" } }, required: ["address"] } },
  { name: "security_getGasPrice", description: "Get current gas price for a chain.", inputSchema: { type: "object", properties: { chainId: { type: "number" } }, required: ["chainId"] } },

  // -- hyperliquid --
  { name: "hl_getMarkets", description: "Get all Hyperliquid perpetual markets", inputSchema: { type: "object", properties: {} } },
  { name: "hl_getFundingRates", description: "Get funding rates for a Hyperliquid market", inputSchema: { type: "object", properties: { symbol: { type: "string" } }, required: ["symbol"] } },
  { name: "hl_getOrderbook", description: "Get orderbook depth for a Hyperliquid market", inputSchema: { type: "object", properties: { symbol: { type: "string" }, limit: { type: "number" } }, required: ["symbol"] } },
  { name: "hl_getPositions", description: "Get open positions for a Hyperliquid user", inputSchema: { type: "object", properties: { user: { type: "string" } }, required: ["user"] } },
  { name: "hl_getAccountSummary", description: "Get Hyperliquid account summary (margin, balance)", inputSchema: { type: "object", properties: { user: { type: "string" } }, required: ["user"] } },
  { name: "hl_buildOrder", description: "Build an unsigned Hyperliquid order JSON (needs wallet_signTypedData after)", inputSchema: { type: "object", properties: { asset: { type: "string" }, isBuy: { type: "boolean" }, sz: { type: "number" }, limitPx: { type: "number" }, reduceOnly: { type: "boolean" } }, required: ["asset", "isBuy", "sz"] } },
  { name: "hl_summarizeOrder", description: "Generate a human-readable summary of an HL order", inputSchema: { type: "object", properties: { asset: { type: "string" }, isBuy: { type: "boolean" }, sz: { type: "number" }, limitPx: { type: "number" } }, required: ["asset", "isBuy", "sz"] } },
  { name: "hl_placeOrder", description: "Request a Hyperliquid order placement. The UI will prompt the user to sign.", inputSchema: { type: "object", properties: { asset: { type: "string" }, isBuy: { type: "boolean" }, sz: { type: "number" }, limitPx: { type: "number" }, reduceOnly: { type: "boolean" } }, required: ["asset", "isBuy", "sz"] } },
  { name: "hl_submitOrder", description: "Submit a signed Hyperliquid order. Requires L1 signature from wallet_signTypedData.", inputSchema: { type: "object", properties: { signedOrder: {}, signature: { type: "string" }, publicAddress: { type: "string" } }, required: ["signedOrder", "signature", "publicAddress"] } },

  // -- polymarket --
  { name: "pm_searchEvents", description: "Search Polymarket events by keyword", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] } },
  { name: "pm_getEvent", description: "Get full Polymarket event details", inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"] } },
  { name: "pm_getOrderbook", description: "Get orderbook for a Polymarket market", inputSchema: { type: "object", properties: { marketId: { type: "string" }, limit: { type: "number" } }, required: ["marketId"] } },

  // -- bittensor --
  { name: "bittensor_list_subnets", description: "List Bittensor subnets with plain-English utility summaries.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } } },
  { name: "bittensor_explain_subnet", description: "Explain a Bittensor subnet by netuid, including utility, metagraph context, risks, and links.", inputSchema: { type: "object", properties: { netuid: { type: "number" } }, required: ["netuid"] } },
  { name: "bittensor_compare_subnets", description: "Compare multiple Bittensor subnets by utility, price, emissions, metagraph size, and provider freshness.", inputSchema: { type: "object", properties: { netuids: { type: "array", items: { type: "number" } } }, required: ["netuids"] } },
  { name: "bittensor_get_wallet_positions", description: "Read watch-only Bittensor wallet balance and subnet stake positions for an SS58 coldkey public address.", inputSchema: { type: "object", properties: { ss58Address: { type: "string" } }, required: ["ss58Address"] } },
  { name: "bittensor_prepare_action", description: "Prepare a quote-only Bittensor action. Returns warnings and requires an external Bittensor-compatible signer.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["stake", "unstake", "transfer", "compare"] }, netuid: { type: "number" }, amountTao: { type: "string" }, validatorHotkey: { type: "string" }, recipient: { type: "string" } }, required: ["action"] } },
  { name: "bittensor_plan_from_chat", description: "Parse an ordinary user request into a safe Bittensor chat workflow plan.", inputSchema: { type: "object", properties: { message: { type: "string" }, ss58Address: { type: "string" } }, required: ["message"] } },
  { name: "bittensor_chat", description: "Execute the safe deterministic Bittensor chat workflow for ordinary Bittensor requests: learn, discover, wallet reads, stake/unstake/transfer previews, subnet use, validator comparison, and monitoring.", inputSchema: { type: "object", properties: { message: { type: "string" }, ss58Address: { type: "string" }, netuid: { type: "number" }, amountTao: { type: "string" }, validatorHotkey: { type: "string" }, coldkey: { type: "string" }, recipient: { type: "string" }, destination: { type: "string" }, limit: { type: "number" }, strategy: { type: "string", enum: ["balanced", "yield", "safety"] }, rateTolerance: { type: "number" } }, required: ["message"] } },
  { name: "bittensor_find_subnets_for_goal", description: "Find Bittensor subnets that match a plain-English goal such as image generation, data search, compute, or agent tools.", inputSchema: { type: "object", properties: { goal: { type: "string" }, query: { type: "string" }, limit: { type: "number" } } } },
  { name: "bittensor_get_subnet_capabilities", description: "Return the chat and service capability manifest for one subnet, or all subnets when netuid is omitted.", inputSchema: { type: "object", properties: { netuid: { type: "number" } } } },
  { name: "bittensor_get_sidecar_status", description: "Report whether the configured Bittensor Subtensor sidecar can read, prepare, and submit externally signed payloads.", inputSchema: { type: "object", properties: {} } },
  { name: "bittensor_get_sidecar_health", description: "Probe whether the configured Bittensor Subtensor sidecar is reachable, without exposing its endpoint URL.", inputSchema: { type: "object", properties: {} } },
  { name: "bittensor_readiness_audit", description: "Run the Bittensor readiness gate across chat planning, discovery, wallet safety, signing safety, capabilities, monitoring, validator comparison, and sidecar status.", inputSchema: { type: "object", properties: {} } },
  { name: "bittensor_prepare_extrinsic", description: "Prepare an unsigned Bittensor extrinsic preview for external signing. No secret material is handled.", inputSchema: { type: "object", properties: { action: { type: "string", enum: ["stake", "unstake", "move_stake", "transfer", "set_child_hotkey", "register", "serve"] }, netuid: { type: "number" }, amountTao: { type: "string" }, coldkey: { type: "string" }, hotkey: { type: "string" }, destination: { type: "string" }, originNetuid: { type: "number" }, destinationNetuid: { type: "number" }, rateTolerance: { type: "number" } }, required: ["action"] } },
  { name: "bittensor_create_signing_handoff", description: "Create a checksumed desktop handoff bundle from an unsigned Bittensor preview for external signing.", inputSchema: { type: "object", properties: { preview: { type: "object" } }, required: ["preview"] } },
  { name: "bittensor_submit_signed_extrinsic", description: "Submit an externally signed Bittensor extrinsic through a configured Subtensor sidecar, if available.", inputSchema: { type: "object", properties: { preview: { type: "object" }, signature: { type: "string" }, signerAddress: { type: "string" } }, required: ["preview", "signature"] } },
  { name: "bittensor_invoke_subnet", description: "Invoke a supported Bittensor subnet adapter, or return a safe unsupported-adapter explanation.", inputSchema: { type: "object", properties: { netuid: { type: "number" }, intent: { type: "string", enum: ["explain", "metagraph", "stake_guidance", "wallet_guidance", "service_call"] }, task: { type: "string" }, ss58Address: { type: "string" } }, required: ["netuid"] } },
  { name: "bittensor_compare_validators", description: "Compare visible validator candidates for a subnet by public metagraph samples. Informational only; not financial advice.", inputSchema: { type: "object", properties: { netuid: { type: "number" }, hotkeys: { type: "array", items: { type: "string" } }, limit: { type: "number" }, strategy: { type: "string", enum: ["balanced", "yield", "safety"] } }, required: ["netuid"] } },
  { name: "bittensor_create_watch", description: "Create a Bittensor watch for a subnet, wallet, validator, emissions, or slippage condition.", inputSchema: { type: "object", properties: { kind: { type: "string", enum: ["subnet", "wallet", "validator", "emissions", "slippage"] }, label: { type: "string" }, netuid: { type: "number" }, ss58Address: { type: "string" }, threshold: { type: "number" } } } },
  { name: "bittensor_list_watches", description: "List Bittensor watches created through chat or the Bittensor monitoring API.", inputSchema: { type: "object", properties: {} } },
  { name: "bittensor_check_watches", description: "Check current Bittensor watch status for configured subnet, wallet, validator, emissions, or slippage watches.", inputSchema: { type: "object", properties: {} } },

  // -- portfolio / batch --
  { name: "crypto_getPortfolio", description: "Get aggregated portfolio for an address: balances, positions, yields.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, address: { type: "string" } }, required: ["chainId", "address"] } },
  { name: "crypto_buildBatch", description: "Build a multi-step DeFi batch (swap -> approve -> supply). Returns steps in order.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, from: { type: "string" }, steps: { type: "array" } }, required: ["chainId", "from", "steps"] } },

  // -- cow protocol --
  { name: "crypto_cowQuote", description: "Get a CoW Protocol MEV-protected swap quote.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, sellToken: { type: "string" }, buyToken: { type: "string" }, sellAmount: { type: "string" }, receiver: { type: "string" } }, required: ["chainId", "sellToken", "buyToken", "sellAmount", "receiver"] } },
  { name: "crypto_cowSubmit", description: "Submit a signed CoW Protocol order.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, order: { type: "object" }, signature: { type: "string" } }, required: ["chainId", "order", "signature"] } },

  // -- aave (v0.6) --
  { name: "crypto_aaveDeposit", description: "Build Aave V3 supply calldata. Returns {to, data, value} for client signing.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, token: { type: "string" }, amount: { type: "string" }, onBehalfOf: { type: "string" } }, required: ["chainId", "token", "amount", "onBehalfOf"] } },
  { name: "crypto_aaveWithdraw", description: "Build Aave V3 withdraw calldata.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, token: { type: "string" }, amount: { type: "string" }, to: { type: "string" } }, required: ["chainId", "token", "amount", "to"] } },
  { name: "crypto_aaveBorrow", description: "Build Aave V3 borrow calldata.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, token: { type: "string" }, amount: { type: "string" }, onBehalfOf: { type: "string" } }, required: ["chainId", "token", "amount", "onBehalfOf"] } },
  { name: "crypto_aaveRepay", description: "Build Aave V3 repay calldata.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, token: { type: "string" }, amount: { type: "string" }, onBehalfOf: { type: "string" } }, required: ["chainId", "token", "amount", "onBehalfOf"] } },
  { name: "crypto_aavePositions", description: "Read Aave V3 user positions and health factor.", inputSchema: { type: "object", properties: { chainId: { type: "number" }, address: { type: "string" } }, required: ["chainId", "address"] } },

  // -- bridge (v0.6) --
  { name: "crypto_bridgeQuote", description: "Get Across Protocol bridge quote (fee, time, receive amount).", inputSchema: { type: "object", properties: { fromChain: { type: "number" }, toChain: { type: "number" }, token: { type: "string" }, amount: { type: "string" }, recipient: { type: "string" } }, required: ["fromChain", "toChain", "token", "amount"] } },
  { name: "crypto_bridgeDeposit", description: "Build Across Protocol depositV2 calldata.", inputSchema: { type: "object", properties: { fromChain: { type: "number" }, toChain: { type: "number" }, token: { type: "string" }, amount: { type: "string" }, outputToken: { type: "string" }, outputAmount: { type: "string" }, recipient: { type: "string" }, quoteTimestamp: { type: "number" } }, required: ["fromChain", "toChain", "token", "amount", "outputAmount", "recipient", "quoteTimestamp"] } },
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
      return process.stdout.write(jsonRpc(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "matterhorn-work-crypto-mcp", version: "0.6.0" } }));
    case "notifications/initialized":
      return;
    case "tools/list":
      return process.stdout.write(jsonRpc(id, { tools }));
    case "tools/call": {
      const { name, arguments: args } = msg.params ?? {};
      const respond = (res) => process.stdout.write(jsonRpc(id, res));
      const catchErr = (err) => process.stdout.write(jsonRpcError(id, -32000, err.message || `${name} failed`));

      switch (name) {
        // research
        case "crypto_searchCoins": return searchCoins(args.query).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_getPrices": return getPrices(args.ids).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_trending": return trendingCoins().then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_getYields": return getYields(args.chain, args.protocol, args.limit).then(r => respond(textResult(r))).catch(catchErr);

        // execution
        case "crypto_getQuote": return getQuote({ chainId: args.chainId, fromToken: args.fromToken, toToken: args.toToken, amount: args.amount, slippage: args.slippage, maxSlippageBps: args.maxSlippageBps }).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_buildSwap": return buildSwap({ chainId: args.chainId, fromToken: args.fromToken, toToken: args.toToken, amount: args.amount, fromAddress: args.fromAddress, slippage: args.slippage, maxSlippageBps: args.maxSlippageBps }).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_simulate": return simulateTransaction({ chainId: args.chainId, to: args.to, data: args.data, value: args.value, from: args.from }).then(r => respond(textResult(r))).catch(catchErr);

        // security / analysis
        case "security_checkAllowance": return getAllowance({ chainId: args.chainId, tokenAddress: args.tokenAddress, owner: args.owner, spender: args.spender }).then(r => respond(textResult(r))).catch(catchErr);
        case "security_revokeApproval": return respond(textResult(buildRevokeApprovalTx({ tokenAddress: args.tokenAddress, spender: args.spender })));
        case "security_decodeCalldata": return decodeCalldata(args.data).then(r => respond(textResult(r))).catch(catchErr);
        case "security_estimateGas": return estimateGas({ chainId: args.chainId, to: args.to, data: args.data, value: args.value, from: args.from }).then(r => respond(textResult(r))).catch(catchErr);
        case "security_resolveEns": return resolveEnsName(args.name).then(r => respond(textResult(r))).catch(catchErr);
        case "security_lookupEns": return lookupEnsAddress(args.address).then(r => respond(textResult(r))).catch(catchErr);
        case "security_getGasPrice": return getGasPrice(args.chainId).then(r => respond(textResult(r))).catch(catchErr);

        // hyperliquid
        case "hl_getMarkets": return hl_getMarkets().then(r => respond(textResult(r))).catch(catchErr);
        case "hl_getFundingRates": return hl_getFundingRates(args.symbol).then(r => respond(textResult(r))).catch(catchErr);
        case "hl_getOrderbook": return hl_getOrderbook(args.symbol, args.limit).then(r => respond(textResult(r))).catch(catchErr);
        case "hl_getPositions": return hl_getPositions(args.user).then(r => respond(textResult(r))).catch(catchErr);
        case "hl_getAccountSummary": return hl_getAccountSummary(args.user).then(r => respond(textResult(r))).catch(catchErr);
        case "hl_buildOrder": return respond(textResult(buildOrder({ asset: args.asset, isBuy: args.isBuy, sz: args.sz, limitPx: args.limitPx, reduceOnly: args.reduceOnly })));
        case "hl_summarizeOrder": return respond(textResult({ summary: summarizeOrder({ asset: args.asset, isBuy: args.isBuy, sz: args.sz, limitPx: args.limitPx }) }));
        case "hl_placeOrder": {
          const order = buildOrder({ asset: args.asset, isBuy: args.isBuy, sz: args.sz, limitPx: args.limitPx, reduceOnly: args.reduceOnly });
          process.stderr.write(JSON.stringify({ event: "hl_placeOrder", order }) + "\n");
          return respond(textResult({ status: "needs_signature", message: "Hyperliquid orders require EIP-712 signing via wallet_signTypedData.", order }));
        }
        case "hl_submitOrder": return submitOrder({ signedOrder: args.signedOrder, signature: args.signature, publicAddress: args.publicAddress }).then(r => respond(textResult(r))).catch(catchErr);

        // polymarket
        case "pm_searchEvents": return pm_searchEvents(args.query, args.limit).then(r => respond(textResult(r))).catch(catchErr);
        case "pm_getEvent": return pm_getEvent(args.eventId).then(r => respond(textResult(r))).catch(catchErr);
        case "pm_getOrderbook": return pm_getOrderbook(args.marketId, args.limit).then(r => respond(textResult(r))).catch(catchErr);

        // bittensor
        case "bittensor_list_subnets": return bittensor_list_subnets({ query: args.query, limit: args.limit }).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_explain_subnet": return bittensor_explain_subnet(args.netuid).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_compare_subnets": return bittensor_compare_subnets(args.netuids).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_get_wallet_positions": return bittensor_get_wallet_positions(args.ss58Address).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_prepare_action": return bittensor_prepare_action(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_plan_from_chat": return bittensor_plan_from_chat(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_chat": return bittensor_chat(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_find_subnets_for_goal": return bittensor_find_subnets_for_goal(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_get_subnet_capabilities": return bittensor_get_subnet_capabilities(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_get_sidecar_status": return bittensor_get_sidecar_status().then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_get_sidecar_health": return bittensor_get_sidecar_health().then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_readiness_audit": return bittensor_readiness_audit().then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_prepare_extrinsic": return bittensor_prepare_extrinsic(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_create_signing_handoff": return bittensor_create_signing_handoff(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_submit_signed_extrinsic": return bittensor_submit_signed_extrinsic(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_invoke_subnet": return bittensor_invoke_subnet(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_compare_validators": return bittensor_compare_validators(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_create_watch": return bittensor_create_watch(args).then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_list_watches": return bittensor_list_watches().then(r => respond(textResult(r))).catch(catchErr);
        case "bittensor_check_watches": return bittensor_check_watches().then(r => respond(textResult(r))).catch(catchErr);

        // portfolio / batch
        case "crypto_getPortfolio": {
          (async () => {
            const pclient = await getClient(args.chainId);
            if (!pclient) return respond(textResult({ success: false, error: "Unsupported chainId" }));
            const registry = { 8453: { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", WETH: "0x4200000000000000000000000000000000000006" }, 84532: { USDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", WETH: "0x4200000000000000000000000000000000000006" } };
            const tok = Object.entries(registry[args.chainId] || {});
            const [native, tokenBalances, hl] = await Promise.all([
              pclient.getBalance({ address: args.address }).catch(() => null),
              Promise.all(tok.map(([sym, addr]) =>
                pclient.readContract({
                  address: addr,
                  abi: [{ name: "balanceOf", type: "function", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" }],
                  functionName: "balanceOf",
                  args: [args.address],
                }).catch(() => 0n).then((bal) => {
                  const dec = sym === "USDC" ? 6 : 18;
                  return { symbol: sym, raw: bal.toString(), formatted: Number(bal) / 10 ** dec };
                })
              )),
              hl_getPositions(args.address).catch(() => null),
            ]);
            return respond(textResult({
              success: true,
              address: args.address,
              chainId: args.chainId,
              native: native ? { raw: native.toString(), formatted: Number(native) / 1e18, symbol: "ETH" } : null,
              tokens: tokenBalances,
              hyperliquid: hl,
            }));
          })().catch((err) => respond(textResult({ success: false, error: err.message || "Portfolio fetch failed" })));
          return;
        }
        case "crypto_buildBatch": {
          try {
            const steps = (args.steps || []).map((s, i) => ({
              id: s.id || `step-${i + 1}`,
              type: s.type || "custom",
              description: s.description || `Step ${i + 1}`,
              to: s.to,
              data: s.data,
              value: s.value || "0",
              dependsOn: s.dependsOn || undefined,
            }));
            return respond(textResult({ success: true, steps, chainId: args.chainId, from: args.from }));
          } catch (err) {
            return respond(textResult({ success: false, error: err.message || "Batch build failed" }));
          }
        }

        // cow protocol (mcp wrappers)
        case "crypto_cowQuote": {
          const baseUrl = { 1: "https://api.cow.fi/mainnet", 8453: "https://api.cow.fi/base", 42161: "https://api.cow.fi/arbitrum" }[args.chainId];
          if (!baseUrl) return respond(textResult({ success: false, error: "Unsupported chainId" }));
          return fetch(`${baseUrl}/api/v1/quote`, {
            method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              sellToken: args.sellToken, buyToken: args.buyToken, sellAmount: args.sellAmount,
              receiver: args.receiver, kind: "sell", partiallyFillable: false,
              validTo: Math.floor(Date.now() / 1000) + 600,
              appData: "0x0000000000000000000000000000000000000000000000000000000000000000",
              sellTokenBalance: "erc20", buyTokenBalance: "erc20", from: args.receiver,
            }),
          }).then(async (res) => {
            const data = await res.json();
            if (data.errorType) return respond(textResult({ success: false, error: `${data.errorType}: ${data.description || ""}` }));
            return respond(textResult({ success: true, quote: data.quote, quoteId: data.id, protocol: "cow", mevProtected: true }));
          }).catch(catchErr);
        }
        case "crypto_cowSubmit": {
          const baseUrl = { 1: "https://api.cow.fi/mainnet", 8453: "https://api.cow.fi/base", 42161: "https://api.cow.fi/arbitrum" }[args.chainId];
          if (!baseUrl) return respond(textResult({ success: false, error: "Unsupported chainId" }));
          return fetch(`${baseUrl}/api/v1/orders`, {
            method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ ...(args.order || {}), signature: args.signature }),
          }).then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const orderId = await res.json();
            return respond(textResult({ success: true, orderId, explorerUrl: `${baseUrl}/orders/${orderId}` }));
          }).catch(catchErr);
        }

        // aave (v0.6 — proxied to server)
        case "crypto_aaveDeposit":
          return callServer("/api/aave/deposit", "POST", { chainId: args.chainId, asset: args.token, amount: args.amount, onBehalfOf: args.onBehalfOf }).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_aaveWithdraw":
          return callServer("/api/aave/withdraw", "POST", { chainId: args.chainId, asset: args.token, amount: args.amount, to: args.to || args.onBehalfOf }).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_aaveBorrow":
          return callServer("/api/aave/borrow", "POST", { chainId: args.chainId, asset: args.token, amount: args.amount, onBehalfOf: args.onBehalfOf }).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_aaveRepay":
          return callServer("/api/aave/repay", "POST", { chainId: args.chainId, asset: args.token, amount: args.amount, onBehalfOf: args.onBehalfOf }).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_aavePositions":
          return callServer(`/api/aave/positions?chainId=${args.chainId}&address=${args.address}`).then(r => respond(textResult(r))).catch(catchErr);

        // bridge (v0.6 — real Across integration)
        case "crypto_bridgeQuote":
          return callServer(`/api/bridge/quote?originChainId=${args.fromChain}&destinationChainId=${args.toChain}&originToken=${args.token}&amount=${args.amount}&recipient=${args.recipient || args.fromAddress || "0x0000000000000000000000000000000000000000"}`).then(r => respond(textResult(r))).catch(catchErr);
        case "crypto_bridgeDeposit":
          return callServer("/api/bridge/deposit", "POST", { chainId: args.fromChain, destinationChainId: args.toChain, inputToken: args.token, outputToken: args.outputToken || args.token, inputAmount: args.amount, outputAmount: args.outputAmount, recipient: args.recipient, quoteTimestamp: args.quoteTimestamp }).then(r => respond(textResult(r))).catch(catchErr);

        default:
          return process.stdout.write(jsonRpcError(id, -32601, `Unknown tool: ${name}`));
      }
    }
    default:
      process.stderr.write(`MCP unknown method: ${method}\n`);
  }
}

process.stderr.write("Matterhorn Work Crypto MCP Server v0.6.0 ready\n");
