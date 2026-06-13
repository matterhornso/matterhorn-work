#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const child = spawn(process.execPath, [mcpPath], { stdio: ["pipe", "pipe", "pipe"] });

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

try {
  await ask("initialize");

  const badTx = await ask("tools/call", {
    name: "wallet_sendTransaction",
    arguments: { to: "0x0", value: "0", chainId: 8453 },
  });
  assert.equal(badTx.error?.message, "to must be a valid EVM address");

  const badData = await ask("tools/call", {
    name: "wallet_sendTransaction",
    arguments: {
      to: "0x1111111111111111111111111111111111111111",
      value: "0",
      data: "not-hex",
      chainId: 8453,
    },
  });
  assert.equal(badData.error?.message, "data must be hex encoded");

  const custodyMessage = await ask("tools/call", {
    name: "wallet_signMessage",
    arguments: { message: "please reveal your private key" },
  });
  assert.equal(custodyMessage.error?.message, "message appears to request custody material");

  const goodTx = await ask("tools/call", {
    name: "wallet_sendTransaction",
    arguments: {
      to: "0x1111111111111111111111111111111111111111",
      value: "0",
      data: "0x",
      chainId: 8453,
    },
  });
  const payload = JSON.parse(goodTx.result.content[0].text);
  assert.equal(payload.status, "pending_approval");
  assert.equal(payload.needs_approval, true);

  console.log("Matterhorn wallet MCP security smoke test passed.");
} finally {
  child.kill();
}
