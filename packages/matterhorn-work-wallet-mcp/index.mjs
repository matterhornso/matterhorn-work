#!/usr/bin/env node
/**
 * Matterhorn Work Wallet MCP Server.
 * V1: Real chain reads + structured tx/signature responses.
 */

import { createServer } from "node:http";

const SUPPORTED_CHAIN_IDS = new Set([8453, 84532]);

let clientsPromise = null;

async function getClients() {
  if (!clientsPromise) {
    clientsPromise = Promise.all([import("viem"), import("viem/chains")]).then(
      ([{ createPublicClient, http }, { base, baseSepolia }]) => ({
        8453: createPublicClient({ chain: base, transport: http() }),
        84532: createPublicClient({ chain: baseSepolia, transport: http() }),
      }),
    );
  }
  return clientsPromise;
}

async function getClient(chainId) {
  if (!SUPPORTED_CHAIN_IDS.has(chainId)) return null;
  const clients = await getClients();
  return clients[chainId] ?? null;
}

const registry = {
  8453: { USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 } },
  84532: { USDC: { address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6 } },
};

const erc20BalanceOf = [
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ name: "", type: "uint256" }], type: "function" },
];

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const FORBIDDEN_SIGNING_TEXT_RE = /(seed phrase|mnemonic|private key|wallet export|keyfile|suri|raw custody|secret key)/i;

function normalizeAddress(value, label = "address") {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return { error: `${label} must be a valid EVM address` };
  }
  const address = value.toLowerCase();
  if (address.toLowerCase() === ZERO_ADDRESS) return { error: `${label} cannot be the zero address` };
  return { value: address };
}

function normalizeValue(value) {
  const text = typeof value === "string" ? value.trim() : String(value ?? "0");
  try {
    const amount = text.startsWith("0x") ? BigInt(text) : BigInt(text);
    if (amount < 0n) return { error: "value cannot be negative" };
    return { value: amount.toString() };
  } catch {
    return { error: "value must be a decimal or hex integer" };
  }
}

function normalizeData(value) {
  if (value === undefined || value === null || value === "") return { value: undefined };
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]*$/.test(value)) return { error: "data must be hex encoded" };
  return { value };
}

function validateSummary(value) {
  const summary = typeof value === "string" ? value.trim() : "Transaction";
  if (summary.length > 240) return { error: "summary is too long" };
  return { value: summary || "Transaction" };
}

function validateSignMessage(value) {
  if (typeof value !== "string" || value.trim().length === 0) return { error: "message is required" };
  if (value.length > 4096) return { error: "message is too long" };
  if (FORBIDDEN_SIGNING_TEXT_RE.test(value)) return { error: "message appears to request custody material" };
  return { value };
}

const tools = [
  {
    name: "wallet_connect",
    description: "Get the connected wallet address and chain info",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wallet_sendTransaction",
    description: "Prepare an on-chain transaction for explicit user approval. This tool never signs or broadcasts.",
    inputSchema: { type: "object", properties: { to: { type: "string" }, value: { type: "string" }, data: { type: "string" }, chainId: { type: "number" }, summary: { type: "string" } }, required: ["to", "value", "chainId"] },
  },
  {
    name: "wallet_signMessage",
    description: "Request an explicit user-approved message signature. Never use this for custody material or hidden authorization.",
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
  const client = await getClient(chainId);
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
      void handleMessage(msg).catch((err) => {
        process.stdout.write(jsonRpcError(msg.id, -32000, err instanceof Error ? err.message : "wallet MCP request failed"));
      });
    } catch {
      process.stderr.write(`MCP parse error: ${trimmed.slice(0, 200)}\n`);
    }
  }
});

async function handleMessage(msg) {
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
          const chainId = Number(args?.chainId ?? 8453);
          if (!SUPPORTED_CHAIN_IDS.has(chainId)) return process.stdout.write(jsonRpcError(id, -32602, `Unsupported chainId: ${chainId}`));
          const to = normalizeAddress(args?.to, "to");
          if (to.error) return process.stdout.write(jsonRpcError(id, -32602, to.error));
          const value = normalizeValue(args?.value ?? "0");
          if (value.error) return process.stdout.write(jsonRpcError(id, -32602, value.error));
          const data = normalizeData(args?.data);
          if (data.error) return process.stdout.write(jsonRpcError(id, -32602, data.error));
          const summary = validateSummary(args?.summary);
          if (summary.error) return process.stdout.write(jsonRpcError(id, -32602, summary.error));
          const tx = { to: to.value, value: value.value, data: data.value, chainId, summary: summary.value, status: "pending_approval" };
          process.stderr.write(JSON.stringify({ event: "tx_approval", tx }) + "\n");
          return process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ status: "pending_approval", needs_approval: true, tx: { to: tx.to, value: tx.value, data: tx.data } }) }] }));
        }
        case "wallet_signMessage":
          {
            const message = validateSignMessage(args?.message);
            if (message.error) return process.stdout.write(jsonRpcError(id, -32602, message.error));
            const description = validateSummary(args?.description ?? "Message signature");
            if (description.error) return process.stdout.write(jsonRpcError(id, -32602, description.error));
            process.stderr.write(JSON.stringify({ event: "sign_message", message: message.value, description: description.value }) + "\n");
            return process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify({ status: "pending_approval", needs_approval: true, type: "sign_message", message: message.value }) }] }));
          }
        case "wallet_getBalance":
          if (!args?.address || !args?.chainId) return process.stdout.write(jsonRpcError(id, -32602, "address and chainId required"));
          {
            const address = normalizeAddress(args.address);
            if (address.error) return process.stdout.write(jsonRpcError(id, -32602, address.error));
            return fetchBalance(address.value, args.chainId).then(r => process.stdout.write(jsonRpc(id, { content: [{ type: "text", text: JSON.stringify(r) }] })));
          }
        case "wallet_readContract": {
          const c = await getClient(args?.chainId);
          if (!c) return process.stdout.write(jsonRpcError(id, -32602, `Unsupported chainId: ${args?.chainId}`));
          const address = normalizeAddress(args?.address);
          if (address.error) return process.stdout.write(jsonRpcError(id, -32602, address.error));
          if (!Array.isArray(args?.abi)) return process.stdout.write(jsonRpcError(id, -32602, "abi must be an array"));
          if (typeof args?.functionName !== "string" || args.functionName.trim().length === 0) {
            return process.stdout.write(jsonRpcError(id, -32602, "functionName is required"));
          }
          return c.readContract({ address: address.value, abi: args.abi, functionName: args.functionName, args: args.args ?? [] })
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
