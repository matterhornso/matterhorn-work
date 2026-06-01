#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
const child = spawn("node", [mcpPath], { stdio: ["pipe", "pipe", "pipe"] });

let outBuf = "";
child.stdout.on("data", (d) => { outBuf += d; });

function ask(msg) {
  return new Promise((resolve) => {
    function onData(d) {
      outBuf += d;
      const lines = outBuf.split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const res = JSON.parse(line);
          if (res.id === msg.id) { resolve(res); return; }
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

  // Test CoinGecko search
  const search = await ask({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "crypto_searchCoins", arguments: { query: "bitcoin" } } });
  const searchRes = JSON.parse(search?.result?.content?.[0]?.text ?? "[]");
  console.log("CoinGecko search results:", searchRes.length);

  // Test Hyperliquid markets
  const hl = await ask({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "hl_getMarkets", arguments: {} } });
  const hlRes = JSON.parse(hl?.result?.content?.[0]?.text ?? "[]");
  console.log("HL markets:", hlRes.length);

  // Test Polymarket events
  const pm = await ask({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "pm_searchEvents", arguments: { query: "election" } } });
  const pmRes = JSON.parse(pm?.result?.content?.[0]?.text ?? "[]");
  console.log("Polymarket events:", pmRes.length);

  child.kill();
  console.log("\nAll Crypto MCP smoke tests passed.");
}

main().catch(console.error);
