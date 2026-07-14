#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const requestedPaths = [];
const eventMarkets = Array.from({ length: 7 }, (_, index) => ({
  id: `market-${index + 1}`,
  question: `Market ${index + 1}`,
  active: true,
  closed: false,
  restricted: index === 0,
  enableOrderBook: true,
  volume: String(700 - index),
  liquidity: String(100 + index),
  outcomes: JSON.stringify(["Yes", "No"]),
  outcomePrices: JSON.stringify(["0.55", "0.45"]),
  clobTokenIds: JSON.stringify([`yes-${index}`, `no-${index}`]),
}));

function sendJson(response, body, status = 200) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const fixtureServer = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  requestedPaths.push(`${url.pathname}${url.search}`);
  if (url.pathname === "/events/event-1") {
    return sendJson(response, {
      id: "event-1",
      title: "Fixture event",
      slug: "fixture-event",
      active: true,
      closed: false,
      markets: eventMarkets,
    });
  }
  if (url.pathname === "/markets/restricted") {
    return sendJson(response, {
      id: "restricted",
      question: "Restricted market",
      active: true,
      closed: false,
      restricted: true,
      enableOrderBook: true,
      outcomes: JSON.stringify(["Yes", "No"]),
      clobTokenIds: JSON.stringify(["restricted-yes", "restricted-no"]),
    });
  }
  if (url.pathname === "/markets/open") {
    return sendJson(response, {
      id: "open",
      question: "Open market",
      active: true,
      closed: false,
      restricted: false,
      enableOrderBook: true,
      outcomes: JSON.stringify(["Yes", "No"]),
      clobTokenIds: JSON.stringify(["open-yes", "open-no"]),
    });
  }
  if (url.pathname === "/book") {
    const tokenId = url.searchParams.get("token_id");
    if (tokenId === "open-yes" || tokenId === "open-no") {
      return sendJson(response, {
        bids: [
          { price: "0.41", size: "20" },
          { price: "0.43", size: "10" },
          { price: "0.42", size: "15" },
        ],
        asks: [
          { price: "0.47", size: "10" },
          { price: "0.45", size: "30" },
          { price: "0.46", size: "20" },
        ],
      });
    }
  }
  return sendJson(response, { error: "not found" }, 404);
});

await new Promise((resolve, reject) => {
  fixtureServer.once("error", reject);
  fixtureServer.listen(0, "127.0.0.1", resolve);
});

const address = fixtureServer.address();
assert.ok(address && typeof address === "object", "fixture server should expose a TCP address");
const fixtureBaseUrl = `http://127.0.0.1:${address.port}`;
const child = spawn(process.execPath, ["packages/matterhorn-work-crypto-mcp/index.mjs"], {
  env: {
    ...process.env,
    POLYMARKET_GAMMA_URL: fixtureBaseUrl,
    POLYMARKET_CLOB_URL: fixtureBaseUrl,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuffer = "";
let stderrBuffer = "";
let nextId = 1;
const pending = new Map();

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => { stderrBuffer += chunk; });
child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  const lines = stdoutBuffer.split("\n");
  stdoutBuffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    const waiter = pending.get(message.id);
    if (!waiter) continue;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(JSON.parse(message.result.content[0].text));
  }
});
child.once("error", (error) => {
  for (const waiter of pending.values()) waiter.reject(error);
  pending.clear();
});

function callTool(name, args) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out calling ${name}. MCP stderr: ${stderrBuffer}`));
    }, 5_000);
    pending.set(id, {
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })}\n`);
  });
}

try {
  const event = await callTool("pm_getEvent", { eventId: "event-1" });
  assert.equal(event.marketCount, 7, "event summary should preserve the complete market count");
  assert.equal(event.markets.length, 5, "event details should include at most five representative markets");
  assert.equal(event.restricted, true, "a restricted child market should make the event compliance-restricted");
  assert.equal(event.restrictedMarketCount, 1, "event summary should count restricted markets");
  const serializedEvent = JSON.stringify(event);
  assert.equal(serializedEvent.includes("clobTokenIds"), false, "event summary should omit CLOB token arrays");
  assert.equal(serializedEvent.includes("outcomePrices"), false, "event summary should omit executable outcome prices");
  assert.ok(serializedEvent.length < 6_000, "event summary should remain bounded");

  const beforeRestrictedCall = requestedPaths.length;
  const blocked = await callTool("pm_getOrderbook", { marketId: "restricted", limit: 2 });
  assert.equal(blocked.status, "compliance_blocked", "restricted markets should stop at compliance");
  assert.equal(Object.hasOwn(blocked, "outcomes"), false, "restricted responses should omit order-book outcomes");
  assert.equal(requestedPaths.slice(beforeRestrictedCall).some((path) => path.startsWith("/book?")), false, "restricted markets should never call the CLOB API");

  const orderbook = await callTool("pm_getOrderbook", { marketId: "open", limit: 2 });
  assert.equal(orderbook.status, "available", "open markets should expose a read-only CLOB orderbook");
  assert.deepEqual(orderbook.outcomes.map((outcome) => outcome.outcome), ["Yes", "No"]);
  assert.deepEqual(orderbook.outcomes[0].bids.map((level) => level.price), [0.43, 0.42], "bids should be descending and bounded");
  assert.deepEqual(orderbook.outcomes[0].asks.map((level) => level.price), [0.45, 0.46], "asks should be ascending and bounded");
  assert.ok(requestedPaths.includes("/book?token_id=open-yes"), "Yes outcome should resolve through its CLOB token ID");
  assert.ok(requestedPaths.includes("/book?token_id=open-no"), "No outcome should resolve through its CLOB token ID");

  process.stdout.write("Matterhorn Polymarket Crypto MCP contract passed.\n");
} finally {
  child.stdin.end();
  child.kill();
  await new Promise((resolve) => fixtureServer.close(resolve));
}
