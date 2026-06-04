/**
 * Phase 4 E2E Test Suite
 * Validates: Aave calldata builds, bridge quote/deposit, CoW signing flow, MCP v0.6 tools
 */

import { test, expect } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const SERVER = process.env.SERVER_URL || "http://localhost:8787";

// ─── File existence ───────────────────────────────────────────────────

test("Aave V3 server tool exists", () => {
  expect(existsSync("apps/server/src/tools/aave-v3.ts")).toBe(true);
});

test("Bridge server tool exists", () => {
  expect(existsSync("apps/server/src/tools/bridge.ts")).toBe(true);
});

test("AavePanel wired to real endpoints", () => {
  const src = readFileSync("apps/app/src/react-app/domains/wallet/pages/AavePanel.tsx", "utf-8");
  expect(src).toInclude("/api/aave/deposit");
  expect(src).toInclude("/api/aave/borrow");
  expect(src).toInclude("/api/aave/positions");
  expect(src).not.toInclude('alert(');
});

test("BridgePanel wired to real endpoints", () => {
  const src = readFileSync("apps/app/src/react-app/domains/wallet/pages/BridgePanel.tsx", "utf-8");
  expect(src).toInclude("/api/bridge/quote");
  expect(src).toInclude("/api/bridge/deposit");
  expect(src).not.toInclude('alert(');
});

test("CoW Swap Panel has EIP-712 signing", () => {
  const src = readFileSync("apps/app/src/react-app/domains/wallet/pages/CowSwapPanel.tsx", "utf-8");
  expect(src).toInclude("useSignTypedData");
  expect(src).toInclude("signTypedDataAsync");
  expect(src).toInclude("/api/cow/order");
});

test("MCP v0.6 tool list updated", () => {
  const src = readFileSync("packages/matterhorn-work-crypto-mcp/index.mjs", "utf-8");
  expect(src).toInclude('"0.6.0"');
  expect(src).toInclude("crypto_aaveDeposit");
  expect(src).toInclude("crypto_aaveWithdraw");
  expect(src).toInclude("crypto_aaveBorrow");
  expect(src).toInclude("crypto_aaveRepay");
  expect(src).toInclude("crypto_aavePositions");
  expect(src).toInclude("crypto_bridgeQuote");
  expect(src).toInclude("crypto_bridgeDeposit");
});

// ─── Server API calldata tests (require running server) ─────────────

async function serverAvailable() {
  try {
    await fetch(SERVER, { signal: AbortSignal.timeout(500) });
    return true;
  } catch { return false; }
}

const serverUp = await serverAvailable();

if (serverUp) {
  test("Aave supply calldata builds correctly", async () => {
    const res = await fetch(`${SERVER}/api/aave/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainId: 8453, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "1000000", onBehalfOf: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.to).toBe("0xA238Dd80C2594FecF6fE2D89C5E3Bc3E6B01f994");
    expect(json.data).toStartWith("0x");
  });

  test("Aave borrow calldata builds correctly", async () => {
    const res = await fetch(`${SERVER}/api/aave/borrow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainId: 8453, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "500000", onBehalfOf: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.to).toBe("0xA238Dd80C2594FecF6fE2D89C5E3Bc3E6B01f994");
  });

  test("Bridge deposit calldata builds correctly", async () => {
    const res = await fetch(`${SERVER}/api/bridge/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainId: 8453, destinationChainId: 42161, inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", outputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", inputAmount: "1000000", outputAmount: "995000", recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", quoteTimestamp: Math.floor(Date.now() / 1000) }),
    });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.to).toBe("0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64");
    expect(json.data).toStartWith("0x");
  });

  test("Aave supply on unsupported chain fails", async () => {
    const res = await fetch(`${SERVER}/api/aave/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainId: 1, asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "1000000", onBehalfOf: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
    });
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toInclude("Aave not supported");
  });

  test("Bridge deposit on unsupported chain fails", async () => {
    const res = await fetch(`${SERVER}/api/bridge/deposit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chainId: 1, destinationChainId: 42161, inputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", outputToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", inputAmount: "1000000", outputAmount: "995000", recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", quoteTimestamp: Math.floor(Date.now() / 1000) }),
    });
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toInclude("Across not supported");
  });
} else {
  test("[SKIP] Server not running — API tests skipped", () => {
    console.log(`Server ${SERVER} not available — skipping API calldata tests`);
    expect(true).toBe(true);
  });
}
