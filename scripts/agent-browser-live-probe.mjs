#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const requireLive = args.includes("--require") || process.env.MATTERHORN_WORK_BROWSER_LIVE_REQUIRE === "1";
const openUrl = readArg("--open-url") ?? process.env.MATTERHORN_WORK_BROWSER_LIVE_OPEN_URL;

function readArg(name) {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : undefined;
}

function userAppDataDir() {
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support");
  if (platform() === "win32") return process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

function defaultDiscoveryPaths() {
  const appData = userAppDataDir();
  return [
    process.env.MATTERHORN_WORK_UI_CONTROL_DISCOVERY?.trim(),
    process.env.OPENWORK_UI_CONTROL_DISCOVERY?.trim(),
    join(appData, "com.matterhorn.work", "matterhorn-work-ui-control.json"),
    join(appData, "com.matterhorn.work.dev", "matterhorn-work-ui-control.json"),
    join(appData, "com.differentai.openwork", "matterhorn-work-ui-control.json"),
    join(appData, "com.differentai.openwork.dev", "matterhorn-work-ui-control.json"),
    join(appData, "com.differentai.openwork", "openwork-ui-control.json"),
    join(appData, "com.differentai.openwork.dev", "openwork-ui-control.json"),
  ].filter(Boolean);
}

function findDiscoveryPath() {
  for (const candidate of defaultDiscoveryPaths()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function createMcp(discoveryPath) {
  const child = spawn("node", ["packages/matterhorn-work-ui-mcp/index.mjs"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(discoveryPath ? { MATTERHORN_WORK_UI_CONTROL_DISCOVERY: discoveryPath } : {}),
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
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
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
      }, 8_000);
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
  return response.result?.content?.[0]?.text ?? "";
}

function isToolError(response) {
  assert.ok(!response.error, response.error?.message);
  return response.result?.isError === true;
}

function skip(message) {
  if (requireLive) {
    throw new Error(message);
  }
  console.log(`SKIP: ${message}`);
}

const discoveryPath = findDiscoveryPath();
if (!discoveryPath) {
  skip("No Matterhorn Work UI control discovery file found.");
  process.exit(0);
}

const mcp = createMcp(discoveryPath);

try {
  const init = await mcp.send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "matterhorn-browser-live-probe", version: "0.0.0" },
  });
  assert.equal(init.result.serverInfo.name, "matterhorn-work-ui");
  mcp.notify("notifications/initialized");

  const listed = await mcp.send("tools/list");
  const toolNames = listed.result.tools.map((tool) => tool.name);
  for (const expected of ["ui_status", "ui_snapshot", "browser_list_actions", "browser_snapshot", "browser_open", "browser_execute_action"]) {
    assert.ok(toolNames.includes(expected), `missing ${expected}`);
  }
  assert.equal(/seed|mnemonic|privateKey|private_key|wallet export/i.test(JSON.stringify(listed.result.tools)), false);

  const status = await mcp.send("tools/call", { name: "ui_status", arguments: {} });
  if (isToolError(status)) {
    skip(`Matterhorn Work UI bridge is not reachable: ${text(status).split("\n")[0]}`);
  } else {
    const snapshot = await mcp.send("tools/call", { name: "ui_snapshot", arguments: {} });
    assert.equal(isToolError(snapshot), false, text(snapshot));

    const browserActions = await mcp.send("tools/call", { name: "browser_list_actions", arguments: {} });
    assert.equal(isToolError(browserActions), false, text(browserActions));
    const actionText = text(browserActions);
    assert.match(actionText, /browser\./, "desktop bridge did not publish any browser.* action");
    assert.doesNotMatch(actionText, /seed|mnemonic|privateKey|private_key|wallet export/i);

    if (openUrl) {
      const opened = await mcp.send("tools/call", {
        name: "browser_open",
        arguments: { url: openUrl, newTab: true },
      });
      assert.equal(isToolError(opened), false, text(opened));
    }

    console.log(`Matterhorn browser live probe passed using ${discoveryPath}.`);
  }
} finally {
  mcp.child.kill();
}
