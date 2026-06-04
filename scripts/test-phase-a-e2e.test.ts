import { test, expect } from "bun:test";

const SERVER = process.env.SERVER_URL || "http://localhost:8787";

async function serverAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

test("Aave APY endpoint returns valid APY for USDC on Base", async () => {
  if (!(await serverAvailable())) {
    console.log("Server not running — skipping API test");
    return;
  }
  const res = await fetch(`${SERVER}/api/aave/apy?chainId=8453&asset=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`);
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(Number(json.supplyApy)).toBeGreaterThan(0);
  expect(Number(json.supplyApy)).toBeLessThan(50);
});

test("Aave deposits endpoint returns array", async () => {
  if (!(await serverAvailable())) {
    console.log("Server not running — skipping API test");
    return;
  }
  const res = await fetch(`${SERVER}/api/aave/deposits?chainId=8453&address=0x70997970C51812dc3A010C7d01b50e0d17dc79C8`);
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(Array.isArray(json.deposits)).toBe(true);
});

test("Aave deposit calldata still builds correctly", async () => {
  if (!(await serverAvailable())) {
    console.log("Server not running — skipping API test");
    return;
  }
  const res = await fetch(`${SERVER}/api/aave/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chainId: 8453,
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      amount: "1000000",
      onBehalfOf: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    }),
  });
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.to).toBe("0xA238Dd80C2594FecF6fE2D89C5E3Bc3E6B01f994");
  expect(String(json.data)).toStartWith("0x");
});

test("PortfolioView file includes savings card and YieldSheet", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync(
    "apps/app/src/react-app/domains/wallet/pages/PortfolioView.tsx",
    "utf8"
  );
  expect(content).toInclude("useSavings");
  expect(content).toInclude("YieldSheet");
  expect(content).toInclude("Earn");
  expect(content).toInclude("Manage");
  expect(content).toInclude("Sprout");
});

test("YieldSheet file exists and has deposit/withdraw", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync(
    "apps/app/src/react-app/domains/wallet/components/YieldSheet.tsx",
    "utf8"
  );
  expect(content).toInclude("deposit");
  expect(content).toInclude("withdraw");
  expect(content).toInclude("requestApproval");
  expect(content).toInclude("/api/aave/deposit");
  expect(content).toInclude("/api/aave/withdraw");
});
