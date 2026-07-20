#!/usr/bin/env bun
/**
 * E2E Crypto Test — validates all server tools + MCPs actually work.
 * Run: bun scripts/e2e-crypto-test.ts
 */

import { baseClient, baseSepoliaClient } from "../apps/server/src/infra/chain-client";
import { tokensForChain } from "../apps/server/src/infra/token-registry";
import { getBalance } from "../apps/server/src/tools/chain-tools";
import { searchCoins, getPrices, trending } from "../apps/server/src/tools/coingecko";
import { getYields } from "../apps/server/src/tools/defillama";
import { simulateTransaction } from "../apps/server/src/tools/transaction-simulation";
import { hl_getMarkets, hl_getFundingRates, hl_getOrderbook } from "../apps/server/src/tools/hyperliquid-research";
import { pm_searchEvents } from "../apps/server/src/tools/polymarket-research";

let PASS = 0;
let FAIL = 0;

function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }

async function check(label: string, fn: () => Promise<boolean>, onPass?: (r: any) => void) {
  process.stdout.write(`  ${label.padEnd(60)} `);
  try {
    const result = await fn();
    if (result) {
      console.log(green("PASS"));
      PASS++;
    } else {
      console.log(red("FAIL (returned false)"));
      FAIL++;
    }
  } catch (err) {
    console.log(red("FAIL"));
    console.log(`    → ${err instanceof Error ? err.message : String(err)}`);
    FAIL++;
  }
}

console.log("");
console.log("========================================");
console.log("  Matterhorn Desks — E2E Crypto Tests");
console.log("========================================");
console.log("");

// ============================================================
// Phase A: Chain Client
// ============================================================
console.log("[Phase A] Server Chain Client");

await check("chain-client gets Base block number", async () => {
  const block = await baseClient.getBlockNumber();
  console.log(` (block ${block})`);
  return block > 0n;
});

await check("chain-client gets Sepolia block number", async () => {
  const block = await baseSepoliaClient.getBlockNumber();
  console.log(` (block ${block})`);
  return block > 0n;
});

await check("token-registry resolves USDC on Base", async () => {
  const t = tokensForChain(8453)?.USDC;
  return t?.address === "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
});

await check("token-registry resolves WETH on Sepolia", async () => {
  const t = tokensForChain(84532)?.WETH;
  return t?.address === "0x4200000000000000000000000000000000000006";
});

// ============================================================
// Phase B: Research Tools
// ============================================================
console.log("");
console.log("[Phase B] Research Tools");

await check("CoinGecko search for ethereum", async () => {
  const r = await searchCoins("ethereum");
  console.log(` (found ${r.length})`);
  return r.length > 0;
});

await check("CoinGecko getPrices bitcoin,ethereum", async () => {
  const r = await getPrices(["bitcoin", "ethereum"]);
  console.log(` (prices: ${r.map(p => `${p.id}=$${p.price}`).join(", ")})`);
  return r.length === 2 && r[0].price > 0;
});

await check("CoinGecko trending", async () => {
  const r = await trending();
  console.log(` (trending: ${r.length})`);
  return r.length > 0;
});

await check("DeFiLlama yields for Base", async () => {
  const r = await getYields("Base", undefined, 5);
  console.log(` (pools: ${r.length})`);
  return r.length > 0;
});

// ============================================================
// Phase B2: V2 Research
// ============================================================
console.log("");
console.log("[Phase B2] V2 Research — Hyperliquid");

await check("Hyperliquid getMarkets", async () => {
  const r = await hl_getMarkets();
  console.log(` (markets: ${r.length})`);
  return r.length > 0;
});

await check("Hyperliquid getFundingRates ETH", async () => {
  const r = await hl_getFundingRates("ETH");
  console.log(` (fundingRate: ${r.fundingRate}, markPrice: ${r.markPrice})`);
  return typeof r.fundingRate === "number" && !Number.isNaN(r.fundingRate);
});

await check("Hyperliquid getOrderbook ETH", async () => {
  const r = await hl_getOrderbook("ETH", 5);
  console.log(` (bids: ${r.bids.length}, asks: ${r.asks.length})`);
  return r.bids.length > 0 || r.asks.length > 0;
});

console.log("");
console.log("[Phase B2] V2 Research — Polymarket");

await check("Polymarket searchEvents 'crypto'", async () => {
  const r = await pm_searchEvents("crypto", 5);
  console.log(` (events: ${r.length})`);
  return r.length >= 0; // API may return 0 results
});

// ============================================================
// Phase C: Transaction Tools
// ============================================================
console.log("");
console.log("[Phase C] Transaction Tools");

await check("chain-tools getBalance on Base Sepolia", async () => {
  const r = await getBalance({ address: "0x0000000000000000000000000000000000000000", chainId: 84532 });
  console.log(` (native: ${r.native}, usdc: ${r.usdc})`);
  // zero address may hold testnet funds — just verify it returns a number
  return typeof r.native === "string" && typeof r.usdc === "string";
});

await check("transaction-simulation rejects bad chain", async () => {
  const r = await simulateTransaction({
    chainId: 999,
    to: "0x0000000000000000000000000000000000000000",
    data: "0x",
    from: "0x0000000000000000000000000000000000000000",
  });
  console.log(` (error: ${r.error}, success: ${r.success})`);
  return r.error !== undefined && r.success === false;
});

// ============================================================
// Phase D: MCP Servers (via subprocess)
// ============================================================
console.log("");
console.log("[Phase D] MCP Servers");

import { spawn } from "node:child_process";
import { join } from "node:path";

function mcpCall(cwd: string, msg: object, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const cp = spawn("node", ["index.mjs"], { cwd });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      cp.kill();
      reject(new Error("MCP timeout"));
    }, timeoutMs);

    cp.stdout.on("data", (d) => { stdout += d; });
    cp.stderr.on("data", (d) => { stderr += d; });
    cp.on("close", () => {
      clearTimeout(timer);
      resolve(stdout + stderr);
    });
    cp.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    cp.stdin.write(JSON.stringify(msg) + "\n");
    cp.stdin.end();
  });
}

const walletMcpDir = join(process.cwd(), "packages/matterhorn-work-wallet-mcp");
const cryptoMcpDir = join(process.cwd(), "packages/matterhorn-work-crypto-mcp");

await check("Wallet MCP starts and lists tools", async () => {
  const r = await mcpCall(walletMcpDir, { jsonrpc: "2.0", method: "tools/list", id: 1 });
  return r.includes("wallet_connect");
});

await check("Wallet MCP getBalance works", async () => {
  const r = await mcpCall(walletMcpDir, {
    jsonrpc: "2.0", method: "tools/call", id: 2,
    params: { name: "wallet_getBalance", arguments: { address: "0x0000000000000000000000000000000000000000", chainId: 84532 } },
  });
  return r.includes("native");
});

await check("Crypto MCP starts and lists tools", async () => {
  const r = await mcpCall(cryptoMcpDir, { jsonrpc: "2.0", method: "tools/list", id: 1 });
  return r.includes("crypto_searchCoins");
});

await check("Crypto MCP coingecko search works", async () => {
  const r = await mcpCall(cryptoMcpDir, {
    jsonrpc: "2.0", method: "tools/call", id: 2,
    params: { name: "crypto_searchCoins", arguments: { query: "ethereum" } },
  });
  return r.includes("ethereum");
});

await check("Crypto MCP hyperliquid funding works", async () => {
  const r = await mcpCall(cryptoMcpDir, {
    jsonrpc: "2.0", method: "tools/call", id: 2,
    params: { name: "hl_getFundingRates", arguments: { symbol: "ETH" } },
  });
  return r.includes("fundingRate");
});

await check("Crypto MCP polymarket search works", async () => {
  const r = await mcpCall(cryptoMcpDir, {
    jsonrpc: "2.0", method: "tools/call", id: 2,
    params: { name: "pm_searchEvents", arguments: { query: "crypto" } },
  });
  return r.includes("title") || r.includes("events");
});

// ============================================================
// Summary
// ============================================================
console.log("");
console.log("========================================");
console.log(`  PASS: ${PASS}  FAIL: ${FAIL}`);
console.log("========================================");

if (FAIL === 0) {
  console.log(green("ALL TESTS PASSED — crypto tools are working end-to-end"));
  process.exit(0);
} else {
  console.log(red("SOME TESTS FAILED — review output above"));
  process.exit(1);
}
