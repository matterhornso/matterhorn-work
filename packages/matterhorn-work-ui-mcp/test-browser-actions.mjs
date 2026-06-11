#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TOKEN = "mwh_ui_test";
const requests = [];
const actions = [
  {
    id: "browser.snapshot",
    label: "Snapshot browser",
    description: "Read the active browser target state.",
    sideEffect: "none",
    requiresConfirmation: false,
    requiresArgs: false,
    hasPreviewArgs: false,
    disabled: false,
    busy: false,
  },
  {
    id: "browser.open",
    label: "Open URL",
    description: "Navigate the built-in browser to a URL.",
    sideEffect: "navigation",
    requiresConfirmation: false,
    requiresArgs: true,
    hasPreviewArgs: true,
    previewArgs: { url: "https://matterhorn.so" },
    args: [{ name: "url", type: "string", required: true, description: "URL to open." }],
    disabled: false,
    busy: false,
  },
  {
    id: "browser.place_trade",
    label: "Place trade",
    description: "Submits a financial trade in the active browser.",
    sideEffect: "external",
    requiresConfirmation: true,
    requiresArgs: true,
    hasPreviewArgs: false,
    args: [{ name: "amount", type: "number", required: true }],
    disabled: false,
    busy: false,
  },
  {
    id: "composer.send",
    label: "Send prompt",
    description: "Non-browser action that should not be exposed by browser tools.",
    sideEffect: "mutation",
    requiresConfirmation: false,
    requiresArgs: false,
    hasPreviewArgs: false,
    disabled: false,
    busy: false,
  },
];

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const bridge = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const body = await readJson(req);
  requests.push({
    method: req.method,
    path: url.pathname,
    authorization: req.headers.authorization,
    body,
  });
  if (req.headers.authorization !== `Bearer ${TOKEN}` && url.pathname !== "/health") {
    return json(res, 401, { ok: false, error: "unauthorized" });
  }
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, app: "Matterhorn Work", version: 1 });
  }
  if (req.method === "GET" && url.pathname === "/actions") {
    return json(res, 200, { ok: true, actions });
  }
  if (req.method === "GET" && url.pathname === "/snapshot") {
    return json(res, 200, {
      ok: true,
      snapshot: {
        version: 1,
        enabled: true,
        route: "/workspace/ws_1/session/ses_1",
        status: "ready",
        busyActionId: null,
        narration: "Ready.",
        actions,
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/execute") {
    if (body.actionId === "browser.snapshot") {
      return json(res, 200, { ok: true, result: { url: "https://matterhorn.so", title: "Matterhorn" } });
    }
    if (body.actionId === "browser.open") {
      assert.equal(body.args.url, "https://matterhorn.so/docs");
      return json(res, 200, { ok: true, result: { opened: body.args.url, newTab: body.args.newTab === true } });
    }
    if (body.actionId === "browser.place_trade") {
      return json(res, 200, { ok: true, result: { submitted: true } });
    }
    return json(res, 404, { ok: false, error: "unknown_action" });
  }
  return json(res, 404, { ok: false, error: "not_found" });
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Bridge test server did not return a TCP address."));
        return;
      }
      resolve(address.port);
    });
  });
}

function createMcp(discoveryPath) {
  const child = spawn("node", ["index.mjs"], {
    cwd: new URL(".", import.meta.url),
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      MATTERHORN_WORK_UI_CONTROL_DISCOVERY: discoveryPath,
    },
  });

  let nextId = 1;
  let buffer = "";
  let stderr = "";
  const pending = new Map();
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        entry.resolve(message);
      }
    }
  });

  function send(method, params) {
    const id = nextId++;
    const payload = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}. stderr: ${stderr.trim()}`));
      }, 5_000);
      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timeout);
          resolve(message);
        },
      });
    });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  function notify(method, params) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, ...(params ? { params } : {}) })}\n`);
  }

  return { child, send, notify };
}

function text(response) {
  assert.ok(!response.error, response.error?.message);
  return response.result.content[0].text;
}

function isError(response) {
  assert.ok(!response.error, response.error?.message);
  return response.result.isError === true;
}

const tempDir = await mkdtemp(join(tmpdir(), "matterhorn-ui-mcp-"));
const discoveryPath = join(tempDir, "matterhorn-work-ui-control.json");
const port = await listen(bridge);
await writeFile(discoveryPath, JSON.stringify({ baseUrl: `http://127.0.0.1:${port}`, token: TOKEN }), "utf8");
const mcp = createMcp(discoveryPath);

try {
  const init = await mcp.send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "matterhorn-ui-mcp-test", version: "0.0.0" },
  });
  assert.equal(init.result.serverInfo.name, "matterhorn-work-ui");
  mcp.notify("notifications/initialized");

  const listed = await mcp.send("tools/list");
  const toolNames = listed.result.tools.map((tool) => tool.name);
  for (const expected of [
    "browser_list_actions",
    "browser_snapshot",
    "browser_open",
    "browser_execute_action",
    "ui_snapshot",
    "ui_execute_action",
  ]) {
    assert.ok(toolNames.includes(expected), `missing ${expected}`);
  }
  assert.equal(/seed|mnemonic|privateKey|private_key|wallet export/i.test(JSON.stringify(listed.result.tools)), false);

  const browserActions = text(await mcp.send("tools/call", { name: "browser_list_actions", arguments: {} }));
  assert.match(browserActions, /browser\.snapshot/);
  assert.match(browserActions, /browser\.open/);
  assert.doesNotMatch(browserActions, /composer\.send/);

  const snapshot = text(await mcp.send("tools/call", { name: "browser_snapshot", arguments: {} }));
  assert.match(snapshot, /Matterhorn/);

  const nonBrowser = await mcp.send("tools/call", {
    name: "browser_execute_action",
    arguments: { actionId: "composer.send" },
  });
  assert.equal(isError(nonBrowser), true);
  assert.match(text(nonBrowser), /only accepts semantic browser\.\*/i);

  const unconfirmedExternal = await mcp.send("tools/call", {
    name: "browser_execute_action",
    arguments: { actionId: "browser.place_trade", args: { amount: 10 } },
  });
  assert.equal(isError(unconfirmedExternal), true);
  assert.match(text(unconfirmedExternal), /requires explicit confirmation/i);
  assert.equal(requests.some((request) => request.body?.actionId === "browser.place_trade"), false);

  const opened = text(await mcp.send("tools/call", {
    name: "browser_open",
    arguments: { url: "https://matterhorn.so/docs", newTab: true },
  }));
  assert.match(opened, /https:\/\/matterhorn\.so\/docs/);
  assert.ok(requests.some((request) => request.body?.actionId === "browser.open"));

  console.log("Matterhorn UI MCP browser action smoke test passed.");
} finally {
  mcp.child.kill();
  bridge.close();
  await rm(tempDir, { recursive: true, force: true });
}
