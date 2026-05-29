#!/usr/bin/env node

import { createServer } from "node:http";

const tools = [
  {
    name: "wallet_connect",
    description: "Get the connected wallet address and chain info",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "wallet_sendTransaction",
    description: "Prepare an on-chain transaction for user approval. The user must approve in their wallet panel before the TX is broadcast.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient address" },
        value: { type: "string", description: "ETH value in wei as hex string" },
        data: { type: "string", description: "Optional calldata for contract interactions" },
      },
      required: ["to", "value"],
    },
  },
  {
    name: "wallet_signMessage",
    description: "Sign a message with the connected wallet",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to sign" },
      },
      required: ["message"],
    },
  },
  {
    name: "wallet_getBalance",
    description: "Get ETH and USDC balances for the connected wallet",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

function jsonRpc(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n";
}

function jsonRpcError(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n";
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
      return process.stdout.write(
        jsonRpc(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "matterhorn-work-wallet-mcp", version: "0.1.0" },
        }),
      );

    case "notifications/initialized":
      return;

    case "tools/list":
      return process.stdout.write(jsonRpc(id, { tools }));

    case "tools/call": {
      const { name, arguments: args } = msg.params ?? {};
      switch (name) {
        case "wallet_connect":
          return process.stdout.write(
            jsonRpc(id, {
              content: [{ type: "text", text: JSON.stringify({ status: "check_ui", message: "Wallet state is managed by the browser UI. Check the wallet panel." }) }],
            }),
          );
        case "wallet_sendTransaction": {
          const tx = { to: args?.to ?? "", value: args?.value ?? "0x0", data: args?.data, status: "pending_approval" };
          process.stderr.write(JSON.stringify({ event: "tx_approval", tx }) + "\n");
          return process.stdout.write(
            jsonRpc(id, {
              content: [{ type: "text", text: JSON.stringify({ status: "pending_approval", message: "Transaction requires user approval in the wallet panel." }) }],
            }),
          );
        }
        case "wallet_signMessage":
          return process.stdout.write(
            jsonRpc(id, {
              content: [{ type: "text", text: JSON.stringify({ status: "pending_approval", message: "Signature request requires user approval in the wallet panel." }) }],
            }),
          );
        case "wallet_getBalance":
          return process.stdout.write(
            jsonRpc(id, {
              content: [{ type: "text", text: JSON.stringify({ status: "check_ui", message: "Balance info is displayed in the wallet panel." }) }],
            }),
          );
        default:
          return process.stdout.write(jsonRpcError(id, -32601, `Unknown tool: ${name}`));
      }
    }

    default:
      process.stderr.write(`MCP unknown method: ${method}\n`);
  }
}

process.stderr.write("Matterhorn Work Wallet MCP Server ready\n");
