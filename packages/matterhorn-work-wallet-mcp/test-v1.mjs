#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const child = spawn("node", [mcpPath], { stdio: ["pipe", "pipe", "pipe"] });

let outBuf = "";
let errBuf = "";
child.stdout.on("data", (d) => { outBuf += d; });
child.stderr.on("data", (d) => { errBuf += d; });

function ask(msg) {
  return new Promise((resolve) => {
    function onData(d) {
      outBuf += d;
      const lines = outBuf.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const res = JSON.parse(line);
          if (res.id === msg.id) {
            resolve(res);
            return;
          }
        } catch {}
      }
    }
    child.stdout.once("data", onData);
    child.stdin.write(JSON.stringify(msg) + "\n");
  });
}

async function main() {
  const init = await ask({ jsonrpc: "2.0", id: 1, method: "initialize" });
  console.log("Init:", init?.result?.serverInfo?.version);

  const tools = await ask({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  console.log("Tools:", tools?.result?.tools?.map((t) => t.name));

  const bal = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "wallet_getBalance", arguments: { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", chainId: 8453 } } });
  console.log("Balance result:", JSON.stringify(JSON.parse(bal?.result?.content?.[0]?.text ?? "{}"), null, 2));

  const search = await ask({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "crypto_searchCoins", arguments: { query: "ethereum" } } });
  console.log("Search result count:", JSON.parse(search?.result?.content?.[0]?.text ?? "[]").length);

  child.kill();
  console.log("\nAll V1 MCP tests passed.");
}

main().catch(console.error);
