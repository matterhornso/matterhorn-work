#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const child = spawn(process.execPath, [mcpPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, MATTERHORN_MCP_DEBUG: "0" },
});

let nextId = 1;
let buffer = "";
let stderr = "";
const pending = new Map();

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    const entry = pending.get(message.id);
    if (!entry) continue;
    pending.delete(message.id);
    clearTimeout(entry.timeout);
    entry.resolve(message);
  }
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

child.on("exit", (code) => {
  for (const [id, entry] of pending.entries()) {
    pending.delete(id);
    clearTimeout(entry.timeout);
    entry.reject(new Error(`MCP exited with code ${code} while waiting for response ${id}: ${stderr.slice(-2000)}`));
  }
});

function ask(method, params) {
  const id = nextId++;
  const payload = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}: ${stderr.slice(-2000)}`));
    }, 90_000);
    pending.set(id, { resolve, reject, timeout });
  });
  child.stdin.write(`${JSON.stringify(payload)}\n`);
  return promise;
}

function textPayload(message) {
  return JSON.parse(message.result.content[0].text);
}

try {
  await ask("initialize");

  const arbitrarySwapToken = await ask("tools/call", {
    name: "crypto_getQuote",
    arguments: {
      chainId: 8453,
      fromToken: "0x1111111111111111111111111111111111111111",
      toToken: "USDC",
      amount: "1000",
    },
  });
  assert.equal(
    arbitrarySwapToken.error?.message,
    "token must be a supported registry token on chain 8453",
  );

  const badSwapSender = await ask("tools/call", {
    name: "crypto_buildSwap",
    arguments: {
      chainId: 8453,
      fromToken: "USDC",
      toToken: "WETH",
      amount: "1000",
      fromAddress: "0x0",
    },
  });
  assert.equal(badSwapSender.error?.message, "fromAddress must be a valid EVM address");

  const badRevokeToken = await ask("tools/call", {
    name: "security_revokeApproval",
    arguments: {
      chainId: 8453,
      tokenAddress: "0x1111111111111111111111111111111111111111",
      spender: "0x2222222222222222222222222222222222222222",
    },
  });
  assert.deepEqual(textPayload(badRevokeToken), {
    success: false,
    error: "tokenAddress must be a supported registry token on chain 8453",
  });

  const badRevokeSpender = await ask("tools/call", {
    name: "security_revokeApproval",
    arguments: {
      chainId: 8453,
      tokenAddress: "USDC",
      spender: "0x0",
    },
  });
  assert.deepEqual(textPayload(badRevokeSpender), {
    success: false,
    error: "spender must be a valid EVM address",
  });

  const goodRevoke = await ask("tools/call", {
    name: "security_revokeApproval",
    arguments: {
      chainId: 8453,
      tokenAddress: "USDC",
      spender: "0x2222222222222222222222222222222222222222",
    },
  });
  const revoke = textPayload(goodRevoke);
  assert.equal(revoke.success, true);
  assert.equal(revoke.chainId, 8453);
  assert.equal(revoke.to, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  assert.equal(revoke.value, "0");
  assert.equal(revoke.data.startsWith("0x095ea7b3"), true);

  const badCalldata = await ask("tools/call", {
    name: "security_decodeCalldata",
    arguments: { data: "not-hex" },
  });
  assert.equal(badCalldata.error?.message, "data must be even-length hex encoded data");

  const badBatchAddress = await ask("tools/call", {
    name: "crypto_buildBatch",
    arguments: {
      chainId: 8453,
      from: "0x1111111111111111111111111111111111111111",
      steps: [{ to: "0x0", data: "0x", value: "0" }],
    },
  });
  assert.deepEqual(textPayload(badBatchAddress), {
    success: false,
    error: "steps[0].to must be a valid EVM address",
  });

  const badBatchData = await ask("tools/call", {
    name: "crypto_buildBatch",
    arguments: {
      chainId: 8453,
      from: "0x1111111111111111111111111111111111111111",
      steps: [{ to: "0x2222222222222222222222222222222222222222", data: "0xabc", value: "0" }],
    },
  });
  assert.deepEqual(textPayload(badBatchData), {
    success: false,
    error: "steps[0].data must be even-length hex encoded data",
  });

  const goodBatch = await ask("tools/call", {
    name: "crypto_buildBatch",
    arguments: {
      chainId: 8453,
      from: "0x1111111111111111111111111111111111111111",
      steps: [{
        id: "approve",
        type: "approval",
        description: "Review token approval",
        to: "0x2222222222222222222222222222222222222222",
        data: "0x095ea7b30000000000000000000000003333333333333333333333333333333333333333",
        value: "0",
      }],
    },
  });
  assert.deepEqual(textPayload(goodBatch), {
    success: true,
    steps: [{
      id: "approve",
      type: "approval",
      description: "Review token approval",
      to: "0x2222222222222222222222222222222222222222",
      data: "0x095ea7b30000000000000000000000003333333333333333333333333333333333333333",
      value: "0",
      selector: "0x095ea7b3",
    }],
    chainId: 8453,
    from: "0x1111111111111111111111111111111111111111",
    canSubmit: false,
    requiresSimulation: true,
  });

  const hyperliquidOrder = await ask("tools/call", {
    name: "hl_placeOrder",
    arguments: {
      asset: "ETH",
      isBuy: true,
      sz: "0.123456789",
      limitPx: "2500",
      reduceOnly: false,
    },
  });
  assert.equal(textPayload(hyperliquidOrder).status, "needs_signature");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(stderr.includes("hl_placeOrder"), false);
  assert.equal(stderr.includes("0.123456789"), false);

  console.log("Matterhorn crypto MCP security smoke test passed.");
} finally {
  child.kill();
}
