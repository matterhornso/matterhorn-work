# MCP Server Testing

How to test MCP stdio servers — without a real OpenCode instance.

## MCP Protocol Basics

MCP uses JSON-RPC 2.0 over stdio. Messages are newline-delimited JSON:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}
```

Server responds:
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"0.1.0","capabilities":{"tools":{}},"serverInfo":{"name":"...","version":"..."}}}
```

## Quick Start Test

After creating `packages/matterhorn-work-wallet-mcp/index.mjs`:

```bash
# Test 1: Server starts and responds to initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | timeout 5 node packages/matterhorn-work-wallet-mcp/index.mjs 2>&1

# Expected: JSON response with "result" field containing serverInfo. NOT a crash, NOT an empty response.
```

```bash
# Test 2: Server lists its tools
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | timeout 5 node packages/matterhorn-work-wallet-mcp/index.mjs 2>&1

# Expected: Two JSON responses. The second should list wallet_connect, wallet_sendTransaction, wallet_signMessage, wallet_getBalance
```

```bash
# Test 3: Server handles an unknown tool gracefully
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"0.1.0","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"nonexistent","arguments":{}}}\n' | timeout 5 node packages/matterhorn-work-wallet-mcp/index.mjs 2>&1

# Expected: Second response should be an error, not a crash
```

## MCP Implementation Pattern

```javascript
#!/usr/bin/env node
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin });

const TOOLS = [
  {
    name: "wallet_connect",
    description: "Get the connected wallet address and chain",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "wallet_sendTransaction",
    description: "Propose an on-chain transaction for user approval",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string" },
        value: { type: "string" },
        data: { type: "string" },
      },
      required: ["to", "value"],
    },
  },
  {
    name: "wallet_signMessage",
    description: "Sign a message with the connected wallet",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
  {
    name: "wallet_getBalance",
    description: "Get ETH and USDC balances for the connected wallet",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

function respond(id, result) {
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"
  );
}

function error(id, code, message) {
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"
  );
}

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;

  switch (method) {
    case "initialize":
      respond(id, {
        protocolVersion: "0.1.0",
        capabilities: { tools: {} },
        serverInfo: { name: "matterhorn-work-wallet-mcp", version: "0.1.0" },
      });
      break;
    case "tools/list":
      respond(id, { tools: TOOLS });
      break;
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) {
        error(id, -32601, `Unknown tool: ${params?.name}`);
        return;
      }
      // MVP: return placeholder. Real implementation connects to browser wallet.
      respond(id, {
        content: [{ type: "text", text: JSON.stringify({ status: "pending_approval", message: `Tool ${params.name} called with ${JSON.stringify(params.arguments)}` }) }],
      });
      break;
    }
    default:
      error(id, -32601, `Unknown method: ${method}`);
  }
});
```

## MCP Verification Checklist

After creating the MCP server:
- [ ] Test 1 passes: server responds to initialize
- [ ] Test 2 passes: server lists all 4 wallet tools
- [ ] Test 3 passes: server handles unknown tools without crashing
- [ ] Package.json has `"type": "module"` (ESM, not CJS)
- [ ] Package.json has `"bin"` pointing to index.mjs
- [ ] opencode.jsonc has the wallet MCP registered

## Pitfalls

- MCP is always ESM (`"type": "module"`). Do NOT use `require()` or CJS.
- Write responses with `process.stdout.write()`. Do NOT use `console.log()` — it adds a newline that breaks the protocol if you're already adding one.
- Use readline for stdin, not `process.stdin.on("data")` — readline splits on newlines for you.
- The `timeout 5` prefix in test commands prevents hanging if the server doesn't respond.
- MCP servers run as child processes — they inherit the CWD and env. Paths in opencode.jsonc are relative to the project root.
