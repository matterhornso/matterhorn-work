#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const subnet = {
  netuid: 14,
  name: "TAOHash",
  symbol: "SN14",
  category: "Compute and infrastructure",
  benefitSummary: "A documented subnet example useful for testing metagraph and validator views.",
  ownerColdkey: null,
  ownerHotkey: null,
  priceTao: 0.5,
  emission: 12.5,
  tempo: 360,
  updatedAt: "2026-06-09T00:00:00.000Z",
  source: "mock",
};

const detail = {
  ...subnet,
  metagraphSummary: { neurons: 128, totalStake: 1000, block: 123 },
  topValidators: [],
  knownUseCases: ["Evaluate decentralized compute capacity"],
  risks: ["Quote only"],
  links: [],
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && url.pathname === "/api/bittensor/subnets") {
    res.end(JSON.stringify({ success: true, subnets: [subnet] }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/subnets/14") {
    res.end(JSON.stringify({ success: true, subnet: detail }));
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/bittensor/wallet/")) {
    res.end(JSON.stringify({
      success: true,
      wallet: {
        ss58Address: decodeURIComponent(url.pathname.split("/").pop() ?? ""),
        taoBalance: null,
        stakePositions: [],
        estimatedValueTao: null,
        providerStatus: "provider_unavailable",
        updatedAt: "2026-06-09T00:00:00.000Z",
        message: "Mock provider unavailable",
      },
    }));
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/actions/quote") {
    res.end(JSON.stringify({
      success: true,
      quote: {
        action: "stake",
        netuid: 14,
        amountTao: 1,
        expectedAlpha: 2,
        feeTao: 0.0001,
        slippageBps: 25,
        warnings: ["Quote only. External signature required."],
        requiresExternalSignature: true,
      },
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ success: false, error: "not found" }));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const port = typeof address === "object" && address ? address.port : 0;

const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const child = spawn("node", [mcpPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, MATTERHORN_SERVER_URL: `http://127.0.0.1:${port}` },
});

let buffer = "";
let stderr = "";
child.stdout.on("data", (data) => { buffer += data; });
child.stderr.on("data", (data) => { stderr += data; });

function ask(msg) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(interval);
      child.off("exit", onExit);
    };
    const onExit = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`MCP child exited with code ${code}\n${stderr.trim()}`));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out waiting for ${msg.method}\n${stderr.trim()}`));
    }, 5000);
    const interval = setInterval(() => {
      const lines = buffer.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          if (response.id === msg.id) {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(response);
            return;
          }
        } catch {}
      }
    }, 25);
    child.once("exit", onExit);
    child.stdin.write(JSON.stringify(msg) + "\n");
  });
}

try {
  await ask({ jsonrpc: "2.0", id: 1, method: "initialize" });
  const tools = await ask({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const names = tools.result.tools.map((tool) => tool.name);
  for (const name of [
    "bittensor_list_subnets",
    "bittensor_explain_subnet",
    "bittensor_compare_subnets",
    "bittensor_get_wallet_positions",
    "bittensor_prepare_action",
  ]) {
    assert.ok(names.includes(name), `${name} should be registered`);
  }
  const bittensorSchemas = tools.result.tools.filter((tool) => tool.name.startsWith("bittensor_"));
  assert.equal(/seed|private|mnemonic/i.test(JSON.stringify(bittensorSchemas)), false);

  const list = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "bittensor_list_subnets", arguments: { query: "hash" } } });
  assert.equal(JSON.parse(list.result.content[0].text).subnets.length, 1);

  const explain = await ask({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "bittensor_explain_subnet", arguments: { netuid: 14 } } });
  assert.equal(JSON.parse(explain.result.content[0].text).subnet.netuid, 14);

  const compare = await ask({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "bittensor_compare_subnets", arguments: { netuids: [14] } } });
  assert.equal(JSON.parse(compare.result.content[0].text).comparison.length, 1);

  const wallet = await ask({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "bittensor_get_wallet_positions", arguments: { ss58Address: "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF" } } });
  assert.equal(JSON.parse(wallet.result.content[0].text).wallet.providerStatus, "provider_unavailable");

  const quote = await ask({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "bittensor_prepare_action", arguments: { action: "stake", netuid: 14, amountTao: "1" } } });
  assert.equal(JSON.parse(quote.result.content[0].text).quote.requiresExternalSignature, true);

  console.log("All Bittensor MCP smoke tests passed.");
} finally {
  child.kill();
  server.close();
}
