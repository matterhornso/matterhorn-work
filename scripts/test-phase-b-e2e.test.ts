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

test("Transfer calldata builds for ERC-20", async () => {
  if (!(await serverAvailable())) {
    console.log("Server not running — skipping API test");
    return;
  }
  const res = await fetch(`${SERVER}/api/transfer/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chainId: 8453,
      token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000",
    }),
  });
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.to).toBe("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  expect(String(json.data)).toStartWith("0x");
  expect(json.value).toBe("0");
});

test("Transfer calldata builds for native ETH", async () => {
  if (!(await serverAvailable())) {
    console.log("Server not running — skipping API test");
    return;
  }
  const res = await fetch(`${SERVER}/api/transfer/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chainId: 8453,
      token: "native",
      to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      amount: "1000000000000000",
    }),
  });
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.to).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  expect(json.value).toBe("1000000000000000");
});

test("TransferPanel file exists with key features", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync(
    "apps/app/src/react-app/domains/wallet/pages/TransferPanel.tsx",
    "utf8"
  );
  expect(content).toInclude("requestApproval");
  expect(content).toInclude("/api/transfer/build");
  expect(content).toInclude("Address book");
});

test("WalletPanel includes Send button and TransferPanel wiring", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync(
    "apps/app/src/react-app/domains/wallet/WalletPanel.tsx",
    "utf8"
  );
  expect(content).toInclude("Send");
  expect(content).toInclude("TransferPanel");
  expect(content).toInclude("send");
});

test("BridgePanel includes recipient input and fee preview", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync(
    "apps/app/src/react-app/domains/wallet/pages/BridgePanel.tsx",
    "utf8"
  );
  expect(content).toInclude("recipient");
  expect(content).toInclude("Fee");
  expect(content).toInclude("Address book");
});
