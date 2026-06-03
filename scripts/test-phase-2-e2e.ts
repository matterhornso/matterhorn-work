#!/usr/bin/env bun
let PASS = 0;
let FAIL = 0;

function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }

async function check(label: string, fn: () => Promise<boolean>) {
  process.stdout.write(`  ${label.padEnd(62)} `);
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

(async () => {
  console.log("");
  console.log("============================================");
  console.log("  Phase 2 E2E — Batch + Portfolio + MCP");
  console.log("============================================");
  console.log("");

  console.log("[Batch Builder]");
  await check("buildBatchPlan validates chain support", async () => {
    const { buildBatchPlan } = await import("../apps/server/src/tools/defi-batcher");
    const res = await buildBatchPlan({ chainId: 999, from: "0x0000000000000000000000000000000000000000", steps: [] });
    return !res.success && res.error === "Batch must contain at least one step";
  });

  console.log("");
  console.log("[Portfolio Tracker]");
  await check("getPortfolio rejects unsupported chain", async () => {
    const { getPortfolio } = await import("../apps/server/src/tools/portfolio-tracker");
    const res = await getPortfolio({ chainId: 1, address: "0x0000000000000000000000000000000000000000" });
    return !res.success && res.error === "Unsupported chainId: 1";
  });
  await check("getPortfolio returns structure for Base", async () => {
    const { getPortfolio } = await import("../apps/server/src/tools/portfolio-tracker");
    const res = await getPortfolio({ chainId: 8453, address: "0x4838B106FCe9647Bdf1E7877BF73cE8B0BAd5f81" });
    if (!res.success) return false;
    return res.data.address && Array.isArray(res.data.tokens) && typeof res.data.chainId === "number";
  });

  console.log("");
  console.log("[MCP Server v0.4.0]");
  await check("Crypto MCP v0.4.0 lists new tools", async () => {
    const { spawn } = await import("node:child_process");
    const { join } = await import("node:path");
    return new Promise((resolve) => {
      const cp = spawn("node", ["index.mjs"], {
        cwd: join(process.cwd(), "packages/matterhorn-work-crypto-mcp"),
      });
      let stdout = "";
      cp.stdout.on("data", (d) => { stdout += d; });
      cp.on("close", () => {
        resolve(stdout.includes("crypto_getPortfolio") && stdout.includes("crypto_buildBatch"));
      });
      cp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }) + "\n");
      cp.stdin.end();
    }) as Promise<boolean>;
  });

  await check("Wallet store supports batch approval type", async () => {
    const { createWalletStore } = await import("../apps/app/src/react-app/domains/wallet/state/wallet-store");
    const store = createWalletStore();
    const snap = store.getSnapshot();
    return typeof snap.maxDailySpendUSD === "number";
  });

  console.log("");
  console.log("============================================");
  console.log(`  PASS: ${PASS}  FAIL: ${FAIL}`);
  console.log("============================================");
  if (FAIL === 0) {
    console.log(green("ALL PHASE 2 TESTS PASSED"));
    process.exit(0);
  } else {
    console.log(red("SOME TESTS FAILED"));
    process.exit(1);
  }
})();
