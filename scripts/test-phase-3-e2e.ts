/**
 * Phase 3 E2E — CoW, Aave, Bridge, Portfolio API, MCP v0.5
 * Run: npx tsx scripts/test-phase-3-e2e.ts
 */

import assert from "node:assert";

const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const BASE_SEPOLIA_WETH = "0x4200000000000000000000000000000000000006";
const TEST_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

async function main() {
  console.log("\n============================================");
  console.log("  Phase 3 E2E — Execution-First Features");
  console.log("============================================\n");

  let passed = 0;
  let failed = 0;

  async function test(label: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`  ${label.padEnd(58)} \x1b[32mPASS\x1b[0m`);
    } catch (err: any) {
      failed++;
      console.log(`  ${label.padEnd(58)} \x1b[31mFAIL\x1b[0m — ${err.message}`);
    }
  }

  async function serverIsUp(): Promise<boolean> {
    try {
      const res = await fetch("http://localhost:3001/health");
      return res.ok;
    } catch {
      return false;
    }
  }

  const hasServer = await serverIsUp();

  // ─── Server API Tests ───────────────────────────────────────────────

  if (hasServer) {
    await test("Portfolio API route exists", async () => {
      const res = await fetch(`http://localhost:3001/api/portfolio?chainId=84532&address=${TEST_ADDRESS}`);
      assert(res.ok, `HTTP ${res.status}`);
      const json = await res.json();
      assert(typeof json.success === "boolean", "Missing success field");
    });

    await test("CoW quote API rejects unsupported chain", async () => {
      const res = await fetch(`http://localhost:3001/api/cow/quote?chainId=999999&sellToken=${BASE_SEPOLIA_USDC}&buyToken=${BASE_SEPOLIA_WETH}&sellAmount=1000000&receiver=${TEST_ADDRESS}`);
      assert(res.ok, `HTTP ${res.status}`);
      const json = await res.json();
      assert(json.success === false, "Expected failure for unsupported chain");
    });

    await test("CoW order API stays behind the wallet airlock", async () => {
      const res = await fetch("http://localhost:3001/api/cow/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chainId: 8453 }),
      });
      assert.equal(res.status, 403, `HTTP ${res.status}`);
      const json = await res.json();
      assert.equal(json.code, "reviewed_wallet_flow_required", "Expected reviewed-wallet denial");
    });
  } else {
    console.log("  (Server not running — skipping API tests)\n");
  }

  // ─── File Existence Checks ─────────────────────────────────────────

  await test("CowSwapPanel.tsx exists (lazy chunk)", async () => {
    const fs = await import("node:fs");
    assert(fs.existsSync("apps/app/src/react-app/domains/wallet/pages/CowSwapPanel.tsx"), "File missing");
  });

  await test("AavePanel.tsx exists (lazy chunk)", async () => {
    const fs = await import("node:fs");
    assert(fs.existsSync("apps/app/src/react-app/domains/wallet/pages/AavePanel.tsx"), "File missing");
  });

  await test("BridgePanel.tsx exists (lazy chunk)", async () => {
    const fs = await import("node:fs");
    assert(fs.existsSync("apps/app/src/react-app/domains/wallet/pages/BridgePanel.tsx"), "File missing");
  });

  await test("token-registry.ts exists in app infra", async () => {
    const fs = await import("node:fs");
    assert(fs.existsSync("apps/app/src/react-app/infra/token-registry.ts"), "File missing");
  });

  await test("WalletPanel.tsx wires all 4 panels", async () => {
    const fs = await import("node:fs");
    const text = fs.readFileSync("apps/app/src/react-app/domains/wallet/WalletPanel.tsx", "utf8");
    assert(text.includes('"cow"'), "Missing cow panel");
    assert(text.includes('"aave"'), "Missing aave panel");
    assert(text.includes('"bridge"'), "Missing bridge panel");
    assert(text.includes('"portfolio"'), "Missing portfolio panel");
  });

  // ─── MCP v0.5 Tool List ────────────────────────────────────────────

  await test("MCP server lists new tools (v0.5)", async () => {
    const { spawn } = await import("node:child_process");
    const cp = spawn("node", ["packages/matterhorn-work-crypto-mcp/index.mjs"], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    cp.stdout.on("data", (d) => { output += d.toString(); });
    cp.stderr.on("data", () => {});
    cp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) + "\n");
    cp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    cp.kill();
    const tools = output.split("\n").filter(Boolean).map((line) => {
      try { return JSON.parse(line).result?.tools; } catch { return null; }
    }).find(Boolean);
    assert(Array.isArray(tools), "No tools returned");
    const names = tools.map((t) => t.name);
    assert(names.includes("crypto_cowQuote"), "Missing crypto_cowQuote");
    assert(!names.includes("crypto_cowSubmit"), "crypto_cowSubmit must stay outside the model-visible registry");
    assert(names.includes("crypto_aaveDeposit"), "Missing crypto_aaveDeposit");
    assert(names.includes("crypto_aaveBorrow"), "Missing crypto_aaveBorrow");
    assert(names.includes("crypto_bridgeQuote"), "Missing crypto_bridgeQuote");
  });

  // ─── Build Check ───────────────────────────────────────────────────

  await test("Vite build produces all lazy chunks", async () => {
    const fs = await import("node:fs");
    const dist = "apps/app/dist/assets";
    const files = fs.readdirSync(dist).filter((f) => f.endsWith(".js"));
    assert(files.some((f) => f.includes("CowSwapPanel")), "Missing CowSwapPanel chunk");
    assert(files.some((f) => f.includes("AavePanel")), "Missing AavePanel chunk");
    assert(files.some((f) => f.includes("BridgePanel")), "Missing BridgePanel chunk");
    assert(files.some((f) => f.includes("PortfolioView")), "Missing PortfolioView chunk");
  });

  console.log("\n============================================");
  console.log(`  PASS: ${passed}  FAIL: ${failed}`);
  console.log("============================================");
  if (failed > 0) {
    console.log("\x1b[31mSOME PHASE 3 TESTS FAILED\x1b[0m");
    process.exit(1);
  } else {
    console.log("\x1b[32mALL PHASE 3 TESTS PASSED\x1b[0m");
  }
}

main();
