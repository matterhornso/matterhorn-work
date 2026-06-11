#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CLIENT_TOKEN = "mwt_client_test";
const HOST_TOKEN = "mwh_host_test";
const requests = [];

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const body = await readJson(req);
  requests.push({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    authorization: req.headers.authorization,
    hostToken: req.headers["x-matterhorn-host-token"],
    body,
  });

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "matterhorn-work-server" });
  }
  if (req.headers.authorization !== `Bearer ${CLIENT_TOKEN}` && !url.pathname.startsWith("/approvals")) {
    return json(res, 401, { error: "unauthorized" });
  }
  if (url.pathname.startsWith("/approvals") && req.headers["x-matterhorn-host-token"] !== HOST_TOKEN) {
    return json(res, 403, { error: "forbidden" });
  }

  if (req.method === "GET" && url.pathname === "/status") {
    return json(res, 200, { ok: true, workspaces: 1 });
  }
  if (req.method === "GET" && url.pathname === "/capabilities") {
    return json(res, 200, { ok: true, tools: ["files", "approvals", "bittensor"] });
  }
  if (req.method === "GET" && url.pathname === "/workspaces") {
    return json(res, 200, { items: [{ id: "ws_1", name: "Demo", path: "/workspace" }], activeId: "ws_1" });
  }
  if (req.method === "POST" && url.pathname === "/workspace/ws_1/sessions") {
    assert.equal(body.title, "Agent session");
    return json(res, 200, { item: { id: "ses_created", title: "Agent session" } });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions") {
    assert.equal(url.searchParams.get("limit"), "3");
    assert.equal(url.searchParams.get("search"), "demo");
    return json(res, 200, { items: [{ id: "ses_1", title: "Demo session" }] });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1") {
    return json(res, 200, { item: { id: "ses_1", title: "Demo session" } });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/messages") {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { items: [{ id: "msg_1", role: "user", content: "hello" }] });
  }
  if (req.method === "POST" && url.pathname === "/workspace/ws_1/sessions/ses_1/messages") {
    assert.equal(body.message, "Summarize this workspace");
    assert.equal(body.model.providerID, "openai");
    assert.equal(body.model.modelID, "gpt-4.1");
    assert.equal(body.agent, "build");
    assert.equal(body.noReply, true);
    return json(res, 200, { ok: true, accepted: true, sessionId: "ses_1" });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/snapshot") {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { item: { session: { id: "ses_1" }, messages: [{ id: "msg_1" }], todos: [], statuses: [] } });
  }
  if (req.method === "DELETE" && url.pathname === "/workspace/ws_1/sessions/ses_1") {
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/workspace/ws_1/files/sessions") {
    assert.equal(body.write, false);
    return json(res, 200, { session: { id: "fs_1", workspaceId: "ws_1", canWrite: false } });
  }
  if (req.method === "GET" && url.pathname === "/files/sessions/fs_1/catalog/snapshot") {
    return json(res, 200, { items: [{ path: "README.md", kind: "file", bytes: 12 }], total: 1 });
  }
  if (req.method === "POST" && url.pathname === "/files/sessions/fs_1/read-batch") {
    assert.deepEqual(body.paths, ["README.md"]);
    return json(res, 200, {
      items: [{
        ok: true,
        path: "README.md",
        bytes: 12,
        contentBase64: Buffer.from("hello world\n", "utf8").toString("base64"),
      }],
    });
  }
  if (req.method === "POST" && url.pathname === "/files/sessions/fs_write/write-batch") {
    assert.equal(body.writes[0].contentBase64, Buffer.from("updated", "utf8").toString("base64"));
    return json(res, 200, { items: [{ ok: true, path: "README.md" }], cursor: 2 });
  }
  if (req.method === "DELETE" && url.pathname === "/files/sessions/fs_1") {
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/approvals") {
    return json(res, 200, { items: [{ id: "ap_1", action: "workspace.files.session.ops" }] });
  }
  if (req.method === "POST" && url.pathname === "/approvals/ap_1") {
    assert.equal(body.reply, "allow");
    return json(res, 200, { ok: true, allowed: true });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/chat/execute") {
    assert.equal(body.message, "show my TAO");
    return json(res, 200, { success: true, execution: "clarification_required", clarificationQuestion: "What SS58 address should I use?" });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/readiness") {
    return json(res, 200, { success: true, ready: true });
  }

  return json(res, 404, { error: "not_found", path: url.pathname });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function createMcp(baseUrl) {
  const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "index.mjs");
  const child = spawn("node", [mcpPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      MATTERHORN_WORK_SERVER_URL: baseUrl,
      MATTERHORN_WORK_TOKEN: CLIENT_TOKEN,
      MATTERHORN_WORK_HOST_TOKEN: HOST_TOKEN,
    },
  });

  let nextId = 1;
  let buffer = "";
  const pending = new Map();
  child.stdout.setEncoding("utf8");
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

  function ask(method, params) {
    const id = nextId++;
    const payload = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
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

  return { child, ask };
}

function parseToolResult(response) {
  assert.ok(!response.error, response.error?.message);
  return JSON.parse(response.result.content[0].text);
}

const port = await listen(server);
const mcp = createMcp(`http://127.0.0.1:${port}`);

try {
  const init = await mcp.ask("initialize");
  assert.equal(init.result.serverInfo.name, "matterhorn-work-mcp");

  const listed = await mcp.ask("tools/list");
  const toolNames = listed.result.tools.map((tool) => tool.name);
  for (const expected of [
    "matterhorn_status",
    "matterhorn_list_workspaces",
    "matterhorn_create_session",
    "matterhorn_list_sessions",
    "matterhorn_get_session",
    "matterhorn_get_session_messages",
    "matterhorn_submit_session_prompt",
    "matterhorn_get_session_snapshot",
    "matterhorn_delete_session",
    "matterhorn_create_file_session",
    "matterhorn_read_files",
    "matterhorn_write_files",
    "matterhorn_list_approvals",
    "matterhorn_bittensor_chat",
  ]) {
    assert.ok(toolNames.includes(expected), `missing ${expected}`);
  }

  const schemaText = JSON.stringify(listed.result.tools);
  assert.equal(/seed|mnemonic|privateKey|private_key|wallet export/i.test(schemaText), false);

  const status = parseToolResult(await mcp.ask("tools/call", { name: "matterhorn_status", arguments: {} }));
  assert.equal(status.health.ok, true);
  assert.equal(status.status.ok, true);

  const workspaces = parseToolResult(await mcp.ask("tools/call", { name: "matterhorn_list_workspaces", arguments: {} }));
  assert.equal(workspaces.items[0].id, "ws_1");

  const createdSession = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_create_session",
    arguments: { workspaceId: "ws_1", title: "Agent session" },
  }));
  assert.equal(createdSession.item.id, "ses_created");

  const sessions = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_list_sessions",
    arguments: { workspaceId: "ws_1", limit: 3, search: "demo" },
  }));
  assert.equal(sessions.items[0].id, "ses_1");

  const sessionItem = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1" },
  }));
  assert.equal(sessionItem.item.id, "ses_1");

  const sessionMessages = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session_messages",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", limit: 5 },
  }));
  assert.equal(sessionMessages.items[0].id, "msg_1");

  const submittedPrompt = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_submit_session_prompt",
    arguments: {
      workspaceId: "ws_1",
      sessionId: "ses_1",
      message: "Summarize this workspace",
      model: { providerID: "openai", modelID: "gpt-4.1" },
      agent: "build",
      noReply: true,
    },
  }));
  assert.equal(submittedPrompt.accepted, true);

  const sessionSnapshot = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session_snapshot",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", limit: 5 },
  }));
  assert.equal(sessionSnapshot.item.session.id, "ses_1");

  const session = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_create_file_session",
    arguments: { workspaceId: "ws_1", readOnly: true },
  }));
  assert.equal(session.session.id, "fs_1");

  const catalog = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_file_catalog",
    arguments: { sessionId: "fs_1", limit: 10 },
  }));
  assert.equal(catalog.items[0].path, "README.md");

  const read = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_read_files",
    arguments: { sessionId: "fs_1", paths: ["README.md"] },
  }));
  assert.equal(read.items[0].content, "hello world\n");
  assert.equal(read.items[0].contentBase64, undefined);

  const write = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_write_files",
    arguments: { sessionId: "fs_write", writes: [{ path: "README.md", content: "updated" }] },
  }));
  assert.equal(write.items[0].ok, true);

  const approvals = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_list_approvals",
    arguments: {},
  }));
  assert.equal(approvals.items[0].id, "ap_1");

  const approvalReply = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_reply_approval",
    arguments: { approvalId: "ap_1", reply: "allow" },
  }));
  assert.equal(approvalReply.allowed, true);

  const bittensor = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_chat",
    arguments: { message: "show my TAO" },
  }));
  assert.equal(bittensor.execution, "clarification_required");

  const readiness = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_readiness",
    arguments: {},
  }));
  assert.equal(readiness.ready, true);

  await mcp.ask("tools/call", {
    name: "matterhorn_close_file_session",
    arguments: { sessionId: "fs_1" },
  });

  const deletedSession = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_delete_session",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1" },
  }));
  assert.equal(deletedSession.ok, true);

  assert.ok(requests.some((request) => request.hostToken === HOST_TOKEN && request.path === "/approvals"));
  assert.ok(requests.some((request) => request.authorization === `Bearer ${CLIENT_TOKEN}` && request.path === "/workspaces"));

  console.log("Matterhorn Work MCP smoke test passed.");
} finally {
  mcp.child.kill();
  server.close();
}
