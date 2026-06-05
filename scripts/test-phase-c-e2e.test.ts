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

test("Intent parser returns job for sweep intent", async () => {
  if (!(await serverAvailable())) {
    console.log("Server not running — skipping API test");
    return;
  }
  const res = await fetch(`${SERVER}/api/schedule/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "sweep USDC to Aave every day" }),
  });
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.job.name).toBe("Sweep USDC to Aave");
  expect(json.job.type).toBe("recurring");
  expect(json.job.action.type).toBe("aave_supply");
});

test("Intent parser returns job for send intent", async () => {
  if (!(await serverAvailable())) {
    console.log("Server not running — skipping API test");
    return;
  }
  const res = await fetch(`${SERVER}/api/schedule/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "send 50 USDC to 0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }),
  });
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.job.name).toBe("Send 50 USDC");
  expect(json.job.action.type).toBe("transfer");
});

test("Intent parser handles unknown intent gracefully", async () => {
  if (!(await serverAvailable())) {
    console.log("Server not running — skipping API test");
    return;
  }
  const res = await fetch(`${SERVER}/api/schedule/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "do something weird" }),
  });
  const json = await res.json();
  expect(json.success).toBe(false);
  expect(json.error).toBeTruthy();
});

test("useJobQueue hook exists with lifecycle methods", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync(
    "apps/app/src/react-app/domains/wallet/hooks/useJobQueue.ts",
    "utf8"
  );
  expect(content).toInclude("add");
  expect(content).toInclude("pause");
  expect(content).toInclude("resume");
  expect(content).toInclude("logRun");
  expect(content).toInclude("pendingJobs");
});

test("AgentWorkspace panel exists", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync(
    "apps/app/src/react-app/domains/wallet/pages/AgentWorkspace.tsx",
    "utf8"
  );
  expect(content).toInclude("Agent");
  expect(content).toInclude("useJobQueue");
  expect(content).toInclude("/api/schedule/parse");
});

test("WalletPanel includes Agent button and AgentWorkspace wiring", () => {
  const fs = require("node:fs");
  const content = fs.readFileSync(
    "apps/app/src/react-app/domains/wallet/WalletPanel.tsx",
    "utf8"
  );
  expect(content).toInclude("agent");
  expect(content).toInclude("AgentWorkspace");
  expect(content).toInclude("Bot");
});
