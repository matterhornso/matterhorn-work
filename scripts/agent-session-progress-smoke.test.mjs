#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CLIENT_TOKEN = "mwt_progress_smoke";
const WORKSPACE_ID = "ws_1";
const SESSION_ID = "ses_1";
const requests = [];

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function eventFrame(id, event, payload) {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify({
    type: event,
    cursor: String(id),
    workspaceId: WORKSPACE_ID,
    sessionId: SESSION_ID,
    observedAt: 1_777_000_000_000 + Number(id),
    source: "matterhorn-work-server",
    payload,
  })}\n\n`;
}

function writeSessionEvents(res) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.write(eventFrame(10, "session.snapshot", {
    session: { id: SESSION_ID, title: "Agent progress smoke" },
    status: { type: "busy" },
  }));
  res.write(eventFrame(11, "message.created", {
    messageId: "msg_1",
    role: "assistant",
    createdAt: 1_777_000_000_011,
  }));
  res.end(eventFrame(12, "session.status", {
    status: { type: "idle" },
    busy: false,
  }));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const body = req.method === "POST" ? await readJson(req) : {};
  requests.push({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    authorization: req.headers.authorization,
    accept: req.headers.accept,
    body,
  });

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true });
  }

  if (req.headers.authorization !== `Bearer ${CLIENT_TOKEN}`) {
    return json(res, 401, { error: "unauthorized" });
  }

  if (req.method === "GET" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions`) {
    assert.equal(url.searchParams.get("limit"), "2");
    assert.equal(url.searchParams.get("search"), "demo");
    return json(res, 200, { items: [{ id: SESSION_ID, title: "Demo session" }] });
  }

  if (req.method === "POST" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions`) {
    assert.equal(body.title, "Agent session");
    return json(res, 200, { item: { id: SESSION_ID, title: "Agent session" } });
  }

  if (req.method === "GET" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}`) {
    return json(res, 200, { item: { id: SESSION_ID, title: "Demo session" } });
  }

  if (req.method === "GET" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/messages`) {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { items: [{ id: "msg_1", role: "assistant", content: "hello" }] });
  }

  if (req.method === "GET" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/status`) {
    return json(res, 200, { item: { session: { id: SESSION_ID }, status: { type: "busy" }, busy: true } });
  }

  if (req.method === "GET" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/snapshot`) {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { item: { session: { id: SESSION_ID }, messages: [{ id: "msg_1" }], todos: [], status: { type: "idle" } } });
  }

  if (req.method === "POST" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/messages`) {
    assert.equal(body.message, "Summarize this workspace");
    assert.equal(body.model.providerID, "openai");
    assert.equal(body.model.modelID, "gpt-4.1");
    assert.equal(body.agent, "build");
    assert.equal(body.noReply, true);
    return json(res, 200, { ok: true, accepted: true, sessionId: SESSION_ID });
  }

  if (
    req.method === "GET" &&
    url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/events`
  ) {
    assert.equal(req.headers.accept, "text/event-stream");
    assert.equal(url.searchParams.get("snapshot"), "true");
    assert.equal(url.searchParams.get("details"), "true");
    assert.equal(url.searchParams.get("maxEvents"), "3");
    return writeSessionEvents(res);
  }

  if (req.method === "DELETE" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}`) {
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "not_found", path: url.pathname });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function parseSseEvents(text) {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const entry = {};
      for (const line of block.split("\n")) {
        if (line.startsWith("id: ")) entry.id = line.slice("id: ".length);
        if (line.startsWith("event: ")) entry.event = line.slice("event: ".length);
        if (line.startsWith("data: ")) entry.data = JSON.parse(line.slice("data: ".length));
      }
      return entry;
    });
}

function parseToolResult(response) {
  assert.ok(!response.error, response.error?.message);
  return JSON.parse(response.result.content[0].text);
}

function createMcp(baseUrl) {
  const mcpPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "packages", "matterhorn-work-mcp", "index.mjs");
  const child = spawn("node", [mcpPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      MATTERHORN_WORK_SERVER_URL: baseUrl,
      MATTERHORN_WORK_TOKEN: CLIENT_TOKEN,
    },
  });

  let nextId = 1;
  let stdout = "";
  let stderr = "";
  const pending = new Map();
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    const lines = stdout.split("\n");
    stdout = lines.pop() ?? "";
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
        reject(new Error(`Timed out waiting for ${method}${stderr ? `\n${stderr}` : ""}`));
      }, 45_000);
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

function runCli(baseUrl, args) {
  const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "orchestrator", "src", "cli.ts");
  const child = spawn("bun", [
    cliPath,
    ...args,
    "--openwork-url",
    baseUrl,
    "--token",
    CLIENT_TOKEN,
    "--json",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`CLI exited ${code}${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

const port = await listen(server);
const baseUrl = `http://127.0.0.1:${port}`;
const mcp = createMcp(baseUrl);

try {
  const direct = await fetch(`${baseUrl}/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/events?snapshot=true&details=true&maxEvents=3&since=1`, {
    headers: {
      Authorization: `Bearer ${CLIENT_TOKEN}`,
      Accept: "text/event-stream",
    },
  });
  assert.equal(direct.status, 200);
  const directEvents = parseSseEvents(await direct.text());
  assert.deepEqual(directEvents.map((event) => event.event), ["session.snapshot", "message.created", "session.status"]);

  const init = await mcp.ask("initialize");
  assert.equal(init.result.serverInfo.name, "matterhorn-work-mcp");
  const mcpEvents = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_watch_session_events",
    arguments: {
      workspaceId: WORKSPACE_ID,
      sessionId: SESSION_ID,
      snapshot: true,
      details: true,
      maxEvents: 3,
      since: "2",
    },
  }));
  assert.equal(mcpEvents.count, 3);
  assert.equal(mcpEvents.nextSince, "12");
  assert.equal(mcpEvents.events[1].event, "message.created");

  const cliCreated = await runCli(baseUrl, [
    "sessions",
    "create",
    "--workspace-id",
    WORKSPACE_ID,
    "--title",
    "Agent session",
  ]);
  assert.equal(cliCreated.item.id, SESSION_ID);

  const cliList = await runCli(baseUrl, [
    "sessions",
    "list",
    "--workspace-id",
    WORKSPACE_ID,
    "--limit",
    "2",
    "--search",
    "demo",
  ]);
  assert.equal(cliList.items[0].id, SESSION_ID);

  const cliGet = await runCli(baseUrl, [
    "sessions",
    "get",
    SESSION_ID,
    "--workspace-id",
    WORKSPACE_ID,
  ]);
  assert.equal(cliGet.item.title, "Demo session");

  const cliMessages = await runCli(baseUrl, [
    "sessions",
    "messages",
    SESSION_ID,
    "--workspace-id",
    WORKSPACE_ID,
    "--limit",
    "5",
  ]);
  assert.equal(cliMessages.items[0].id, "msg_1");

  const cliStatus = await runCli(baseUrl, [
    "sessions",
    "status",
    SESSION_ID,
    "--workspace-id",
    WORKSPACE_ID,
  ]);
  assert.equal(cliStatus.item.busy, true);

  const cliPrompt = await runCli(baseUrl, [
    "sessions",
    "prompt",
    SESSION_ID,
    "--workspace-id",
    WORKSPACE_ID,
    "--message",
    "Summarize this workspace",
    "--provider-id",
    "openai",
    "--model-id",
    "gpt-4.1",
    "--agent",
    "build",
    "--skip-reply",
  ]);
  assert.equal(cliPrompt.accepted, true);

  const cliSnapshot = await runCli(baseUrl, [
    "sessions",
    "snapshot",
    SESSION_ID,
    "--workspace-id",
    WORKSPACE_ID,
    "--limit",
    "5",
  ]);
  assert.equal(cliSnapshot.item.session.id, SESSION_ID);

  const cliEvents = await runCli(baseUrl, [
    "sessions",
    "events",
    SESSION_ID,
    "--workspace-id",
    WORKSPACE_ID,
    "--snapshot",
    "--details",
    "--max-events",
    "3",
    "--since",
    "3",
  ]);
  assert.equal(cliEvents.count, 3);
  assert.equal(cliEvents.nextSince, "12");
  assert.equal(cliEvents.events[0].event, "session.snapshot");
  assert.equal(cliEvents.events[1].data.payload.messageId, "msg_1");

  const cliDeleted = await runCli(baseUrl, [
    "sessions",
    "delete",
    SESSION_ID,
    "--workspace-id",
    WORKSPACE_ID,
  ]);
  assert.equal(cliDeleted.ok, true);

  const sinceValues = requests
    .filter((request) => request.path.endsWith("/events"))
    .map((request) => request.query.since);
  assert.deepEqual(sinceValues, ["1", "2", "3"]);

  console.log("Matterhorn session control HTTP/MCP/CLI smoke test passed.");
} finally {
  mcp.child.kill();
  server.close();
}
