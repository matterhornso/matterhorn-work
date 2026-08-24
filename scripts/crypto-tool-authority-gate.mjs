#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const SAFE_AUTHORITY_NAMES = new Set([
  "matterhorn_submit_session_prompt",
  "matterhorn_hyperliquid_create_sign_request",
  "matterhorn_polymarket_create_sign_request",
  "matterhorn_bittensor_create_signing_handoff",
  "matterhorn_bittensor_check_signing_handoff",
  "bittensor_create_signing_handoff",
]);
const FORBIDDEN_AUTHORITY_NAME = /(?:sign(?:ed|ature|transaction|message|typed)?|submit|relay|broadcast)/i;

function startMcp(relativePath) {
  const child = spawn(process.execPath, [resolve(relativePath)], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, MATTERHORN_MCP_DEBUG: "0" },
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let buffer = "";
  let stderr = "";
  let nextId = 1;
  const pending = new Map();
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      clearTimeout(waiter.timeout);
      waiter.resolve(message);
    }
  });
  const ask = (method, params) => {
    const id = nextId++;
    const response = new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}: ${stderr.slice(-1_000)}`));
      }, 15_000);
      pending.set(id, { resolve: resolvePromise, timeout });
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) })}\n`);
    return response;
  };
  return { child, ask };
}

function parsedTextResult(message) {
  const text = message?.result?.content?.[0]?.text;
  assert.equal(typeof text, "string", "Deprecated authority stub must return MCP text content");
  return JSON.parse(text);
}

async function auditServer(relativePath, deprecatedNames) {
  const mcp = startMcp(relativePath);
  try {
    await mcp.ask("initialize");
    const listed = await mcp.ask("tools/list");
    const tools = listed?.result?.tools;
    assert.ok(Array.isArray(tools), `${relativePath} did not return a tool registry`);
    const names = tools.map((tool) => String(tool.name ?? ""));
    for (const name of names) {
      if (!FORBIDDEN_AUTHORITY_NAME.test(name) || SAFE_AUTHORITY_NAMES.has(name)) continue;
      assert.fail(`${relativePath} advertises transaction authority through ${name}`);
    }
    for (const name of deprecatedNames) {
      assert.equal(names.includes(name), false, `${name} must not be model-visible`);
      const response = await mcp.ask("tools/call", { name, arguments: {
        chainId: 8453,
        preview: { action: "stake" },
        order: {},
        signature: "deprecated-value-must-not-be-forwarded",
      } });
      const result = parsedTextResult(response);
      assert.equal(result.code, "wallet_airlock_required", `${name} must fail closed through the wallet airlock`);
      assert.equal(result.success, false);
    }
  } finally {
    mcp.child.kill();
  }
}

await auditServer("packages/matterhorn-work-crypto-mcp/index.mjs", [
  "crypto_cowSubmit",
  "bittensor_submit_signed_extrinsic",
]);
await auditServer("packages/matterhorn-work-mcp/index.mjs", [
  "matterhorn_bittensor_submit_signed_extrinsic",
]);

console.log("Matterhorn crypto tool authority gate passed.");
