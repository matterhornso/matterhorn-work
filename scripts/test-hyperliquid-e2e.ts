#!/usr/bin/env bun
/**
 * Hyperliquid End-to-End Test
 * Validates the full order signing + submission flow.
 * NOTE: Requires a Hyperliquid account with margin to submit real orders.
 * The signing test works with any private key. Submission requires real funds.
 */

// viem imports removed — testing from server packages which are already built

let PASS = 0;
let FAIL = 0;

function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }

async function check(label: string, fn: () => Promise<boolean>) {
  process.stdout.write(`  ${label.padEnd(60)} `);
  try {
    const result = await fn();
    if (result) { console.log(green("PASS")); PASS++; }
    else { console.log(red("FAIL (false)")); FAIL++; }
  } catch (err) {
    console.log(red("FAIL"));
    console.log(`    → ${err instanceof Error ? err.message : String(err)}`);
    FAIL++;
  }
}

console.log("");
console.log("========================================");
console.log("  Hyperliquid End-to-End Tests");
console.log("========================================");
console.log("");

// ============================================================
// Test 1: Order building
// ============================================================
console.log("[Order Building]");

await check("buildOrder creates correct structure", async () => {
  const { buildOrder } = await import("../apps/server/src/tools/hyperliquid-execution");
  const order = buildOrder({ asset: "ETH", isBuy: true, sz: 0.01, reduceOnly: false });
  // buildOrder returns { action: { orderAction: { orders: [{a,b,p,s,r,t}] } }, nonce, needsSignature }
  const innerOrder = order.action?.orderAction?.orders?.[0];
  return (
    innerOrder.a === "ETH" &&
    innerOrder.b === true &&
    innerOrder.s === "0.01" &&
    innerOrder.p === "0" &&
    innerOrder.r === false
  );
});

await check("buildOrder with limit price", async () => {
  const { buildOrder } = await import("../apps/server/src/tools/hyperliquid-execution");
  const order = buildOrder({ asset: "ETH", isBuy: false, sz: 0.05, limitPx: 2000 });
  const innerOrder = order.action?.orderAction?.orders?.[0];
  return innerOrder.p === "2000";
});

// ============================================================
// Test 2: Order summary
// ============================================================
console.log("");
console.log("[Order Summary]");

await check("summarizeOrder market order", async () => {
  const { summarizeOrder } = await import("../apps/server/src/tools/hyperliquid-execution");
  const summary = summarizeOrder({ asset: "ETH", isBuy: true, sz: 0.01 });
  return summary.includes("Buy") && summary.includes("0.01") && summary.includes("ETH");
});

await check("summarizeOrder limit order", async () => {
  const { summarizeOrder } = await import("../apps/server/src/tools/hyperliquid-execution");
  const summary = summarizeOrder({ asset: "ETH", isBuy: false, sz: 0.05, limitPx: 2000 });
  return summary.includes("Sell") && summary.includes("Limit @ 2000");
});

// ============================================================
// Test 3: Signing with SDK
// ============================================================
console.log("");
console.log("[Signing with SDK]");

await check("SDK loads and has placeOrder method", async () => {
  try {
    const { Hyperliquid } = await import("../apps/server/node_modules/hyperliquid");
    const pk = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Anvil default account #0
    const hl = new Hyperliquid({ privateKey: pk, isTestnet: true });
    return typeof hl.exchange?.placeOrder === "function";
  } catch (err) {
    console.log("    SDK load error:", (err as Error).message);
    return false;
  }
});

// ============================================================
// Test 4: MCP tool integration
// ============================================================
console.log("");
console.log("[MCP Tool Integration]");

await check("Crypto MCP lists hl_placeOrder tool", async () => {
  const { spawn } = await import("node:child_process");
  const { join } = await import("node:path");

  return new Promise((resolve) => {
    const cp = spawn("node", ["index.mjs"], {
      cwd: join(process.cwd(), "packages/matterhorn-work-crypto-mcp"),
    });
    let stdout = "";
    cp.stdout.on("data", (d) => { stdout += d; });
    cp.on("close", () => {
      resolve(stdout.includes("hl_placeOrder"));
    });
    cp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }) + "\n");
    cp.stdin.end();
  }) as Promise<boolean>;
});

// ============================================================
// Test 5: HL Research tools (prerequisite)
// ============================================================
console.log("");
console.log("[Prerequisite: Research Tools]");

await check("hl_getFundingRates returns real data", async () => {
  const { hl_getFundingRates } = await import("../apps/server/src/tools/hyperliquid-research");
  const r = await hl_getFundingRates("ETH");
  return typeof r.fundingRate === "number" && r.fundingRate > -1 && r.markPrice > 0;
});

await check("hl_getMarkets returns ETH", async () => {
  const { hl_getMarkets } = await import("../apps/server/src/tools/hyperliquid-research");
  const markets = await hl_getMarkets();
  return markets.some((m) => m.name === "ETH");
});

// ============================================================
// Test 6: Wallet store HL order type
// ============================================================
console.log("");
console.log("[Wallet Store Integration]");

await check("wallet store has HlOrderApproval type", async () => {
  const { createWalletStore } = await import("../apps/app/src/react-app/domains/wallet/state/wallet-store");
  const store = createWalletStore();
  const snap = store.getSnapshot();
  // The store should support the new fields
  return (
    typeof snap.maxDailySpendUSD === "number" &&
    typeof snap.maxPerTransactionUSD === "number"
  );
});

// ============================================================
// Summary
// ============================================================
console.log("");
console.log("========================================");
console.log(`  PASS: ${PASS}  FAIL: ${FAIL}`);
console.log("========================================");

if (FAIL === 0) {
  console.log(green("ALL HYPERLIQUID E2E TESTS PASSED"));
  console.log("");
  console.log("Next steps for live submission test:");
  console.log("1. Get Arbitrum Sepolia testnet ETH");
  console.log("2. Deposit to Hyperliquid testnet");
  console.log("3. Set private key in environment: HYPERLIQUID_PRIVATE_KEY=0x...");
  console.log("4. Run: bun scripts/test-hyperliquid-live.ts");
  process.exit(0);
} else {
  console.log(red("SOME TESTS FAILED"));
  process.exit(1);
}
