#!/usr/bin/env node
/**
 * Matterhorn Work Wallet MCP Server.
 * V1: Real chain reads + structured tx/signature responses.
 */

import { createServer } from "node:http";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

// --- viem clients ---
const clients = {
  8453: createPublicClient({ chain: base, transport: http() }),
  84532: createPublicClient({ chain: baseSepolia, transport: http() }),
};

function getClient(chainId) { return clients[chainId] ?? null; }

const registry = {
  8453: { USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 } },
  84532: { USDC: { address: "0x036CbD53842c5426634e7949541eC2318f3dCF7e", decimals: 6 } },
};

const erc20BalanceOf = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], type: "function" },
];

const tools = [
  {
    name: "wallet_connect",
    description: "Get the connected wallet address and chain info",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wallet_sendTransaction",
    description: "Prepare an on-chain transaction for user approval.",
    inputSchema: { type: "object", properties: { to: { type: "string" }, value: { type: "string" }, data: { type: "string" }, chainId: { type: "number" }, summary: { type: "string" } }, required: ["to", "value", "chainId"] },
  },
  {
    name: "wallet_signMessage",
    description: "Request a message signature from the connected wallet. Used for Hyperliquid L1 proofs.",
    inputSchema: { type: "object", properties: { message: { type: "string" }, description: { type: "string" } }, required: ["message"] },
  },
  {
    name: "wallet_getBalance",
    description: "Get native (ETH) and USDC balances for a given address on a chain",
    inputSchema: { type: "object", properties: { address: { type: "string" }, chainId: { type: "number" } }, required: ["address", "chainId"] },
  },
  {
    name: "wallet_readContract",
    description: "Call a read-only contract method",
    inputSchema: { type: "object", properties: { address: { type: "string" }, abi: { type: "array" }, functionName: { type: "string" }, args: { type: "array" }, chainId: { type: "number" } }, required: ["address", "abi", "functionName", "chainId"] },
  },
];

function jsonRpc(id, result) { return JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"; }
function jsonRpcError(id, code, message) { return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"; }

async function fetchBalance(address, chainId) {
  const client = getClient(chainId);
  if (!client) return { error: `Unsupported chainId: ${chainId}` };
  const native = await client.getBalance({ address });
  let usdc = 0n;
  const usdcAddr = registry[chainId]?.USDC?.address;
  if (usdcAddr) {
    usdc = await client.readContract({ address: usdcAddr, abi: erc20BalanceOf, functionName: "balanceOf", args: [address] });
  }
  return { chainId, address, native: native.toString(), nativeFormatted: Number(native) / 1e18, usdc: usdc.toString(), usdcFormatted: Number(usdc) / 1e6 };
}

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const msg = JSON.parse(trimmed);
      handleMessage(msg);
    } catch {
      process.stderr.write(`MCP parse error: ${trimmed.slice(0, 200)}\n`);
    }
  }
});

function handleMessage(msg) {
  const { method, id } = msg;
  switch (method) {
    case "initialize":
      return process.stdout.write(jsonRpc(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "matterhorn-work-wallet-mcp", version: "0.2.1" } }));
    case "notifications/initialized":
      return;
    case "tools/list":
      return process.stdout.write(jsonRpc(id, { tools }));
    case "tools/call": {
      const { name, arguments: args } = msg.params ?? {};
      switch (name) {
        case "wallet_connect":
          return process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ status: "check_ui", message: "Wallet state is managed by the browser UI. Check the wallet panel." }) }] }));
        case "wallet_sendTransaction": {
          const tx = { to: args?.to ?? "", value: args?.value ?? "0x0", data: args?.data, chainId: args?.chainId ?? 8453, summary: args?.summary ?? "Transaction", status: "pending_approval" };
          process.stderr.write(JSON.stringify({ event: "tx_approval", tx }) + "\n");
          return process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ status: "pending_approval", needs_approval: true, tx: { to: tx.to, value: tx.value, data: tx.data } }) }] }));
        }
        case "wallet_signMessage":
          process.stderr.write(JSON.stringify({ event: "sign_message", message: args?.message, description: args?.description }) + "\n");
          return process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ status: "pending_approval", needs_approval: true, type: "sign_message", message: args?.message }) }] }));
        case "wallet_getBalance":
          if (!args?.address || !args?.chainId) return process.stdout.write(jsonRpcError(id, -32602, "address and chainId required"));
          return fetchBalance(args.address, args.chainId).then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(r) }] })));
        case "wallet_readContract": {
          const c = getClient(args?.chainId);
          if (!c) return process.stdout.write(jsonRpcError(id, -32602, `Unsupported chainId: ${args?.chainId}`));
          return c.readContract({ address: args.address, abi: args.abi, functionName: args.functionName, args: args.args ?? [] })
            .then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ result: r }) }] })))
            .catch(err => process.stdout.write(jsonRpcError(id, -32000, err.message || "readContract failed")));
        }
        default:
          return process.stdout.write(jsonRpcError(id, -32601, `Unknown tool: ${name}`));
      }
    }
    default:
      process.stderr.write(`MCP unknown method: ${method}\n`);
  }
}

process.stderr.write("Matterhorn Work Wallet MCP Server v0.2.1 ready\n");
