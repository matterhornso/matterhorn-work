#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CLIENT_TOKEN = "mwt_live_qa_client";
const HOST_TOKEN = "mwt_live_qa_host";
const WORKSPACE_ID = "ws_1";
const SESSION_ID = "ses_live";
const FILE_SESSION_ID = "fs_live";
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
      if (!raw) return resolve({});
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const body = req.method === "POST" ? await readJson(req) : {};
  requests.push({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    authorization: req.headers.authorization,
    hostToken: req.headers["x-matterhorn-host-token"],
    accept: req.headers.accept,
    body,
  });

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "matterhorn-work-server" });
  }
  if (url.pathname === "/approvals") {
    assert.equal(req.headers["x-matterhorn-host-token"], HOST_TOKEN);
    return json(res, 200, { items: [] });
  }
  assert.equal(req.headers.authorization, `Bearer ${CLIENT_TOKEN}`);

  if (req.method === "GET" && url.pathname === "/status") {
    return json(res, 200, { ok: true, workspaces: 1 });
  }
  if (req.method === "GET" && url.pathname === "/capabilities") {
    return json(res, 200, { ok: true, tools: ["sessions", "files", "bittensor"] });
  }
  if (req.method === "GET" && url.pathname === "/workspaces") {
    return json(res, 200, { activeId: WORKSPACE_ID, items: [{ id: WORKSPACE_ID, name: "Demo" }] });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/readiness") {
    return json(res, 200, { success: true, report: { ready: true, checks: [] } });
  }
  if (req.method === "POST" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions`) {
    assert.match(body.title, /Agent control live QA/);
    return json(res, 200, { item: { id: SESSION_ID, title: body.title } });
  }
  if (req.method === "POST" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/messages`) {
    assert.equal(body.message, "QA prompt");
    assert.equal(body.noReply, true);
    return json(res, 200, { ok: true, accepted: true, sessionId: SESSION_ID });
  }
  if (req.method === "GET" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/status`) {
    return json(res, 200, { item: { session: { id: SESSION_ID }, status: { type: "idle" }, busy: false } });
  }
  if (req.method === "GET" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/events`) {
    assert.equal(req.headers.accept, "text/event-stream");
    assert.equal(url.searchParams.get("snapshot"), "true");
    assert.equal(url.searchParams.get("details"), "true");
    assert.equal(url.searchParams.get("maxEvents"), "4");
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(eventFrame(1, "session.snapshot", { session: { id: SESSION_ID }, status: { type: "idle" } }));
    res.end(eventFrame(2, "session.status", { status: { type: "idle" }, busy: false }));
    return;
  }
  if (req.method === "DELETE" && url.pathname === `/workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}`) {
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === `/workspace/${WORKSPACE_ID}/files/sessions`) {
    assert.equal(body.write, false);
    assert.equal(body.ttlSeconds, 120);
    return json(res, 200, { session: { id: FILE_SESSION_ID, workspaceId: WORKSPACE_ID, canWrite: false } });
  }
  if (req.method === "GET" && url.pathname === `/files/sessions/${FILE_SESSION_ID}/catalog/snapshot`) {
    assert.equal(url.searchParams.get("limit"), "20");
    return json(res, 200, { items: [{ path: "README.md", kind: "file", bytes: 12 }] });
  }
  if (req.method === "POST" && url.pathname === `/files/sessions/${FILE_SESSION_ID}/read-batch`) {
    assert.deepEqual(body.paths, ["README.md"]);
    return json(res, 200, { items: [{ ok: true, path: "README.md", bytes: 12, contentBase64: "aGVsbG8K" }] });
  }
  if (req.method === "DELETE" && url.pathname === `/files/sessions/${FILE_SESSION_ID}`) {
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: "not_found", path: url.pathname });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function runHarness(baseUrl) {
  const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "agent-control-live-qa.mjs");
  const child = spawn("node", [
    scriptPath,
    "--server-url",
    baseUrl,
    "--token",
    CLIENT_TOKEN,
    "--host-token",
    HOST_TOKEN,
    "--message",
    "QA prompt",
    "--max-events",
    "4",
    "--ttl-seconds",
    "120",
    "--skip-reply",
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
        reject(new Error(`live QA exited ${code}${stderr ? `\n${stderr}` : ""}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

const port = await listen(server);

try {
  const report = await runHarness(`http://127.0.0.1:${port}`);
  assert.equal(report.ready, true);
  assert.equal(report.summary.fail, 0);
  for (const expected of [
    "server.health",
    "workspaces.list",
    "bittensor.readiness",
    "session.create",
    "session.prompt",
    "session.events",
    "files.session",
    "files.catalog",
    "files.read",
    "approvals.list",
    "session.cleanup",
  ]) {
    assert.ok(report.stages.some((stage) => stage.id === expected && stage.status === "pass"), `missing passing stage: ${expected}`);
  }
  assert.equal(report.artifacts.workspaceId, WORKSPACE_ID);
  assert.equal(report.artifacts.sessionId, SESSION_ID);
  assert.equal(report.artifacts.fileSessionId, FILE_SESSION_ID);
  assert.equal(report.artifacts.filePath, "README.md");

  const routeKeys = requests.map((request) => `${request.method} ${request.path}`);
  for (const expected of [
    "GET /health",
    "GET /status",
    "GET /capabilities",
    "GET /workspaces",
    "GET /api/bittensor/readiness",
    `POST /workspace/${WORKSPACE_ID}/sessions`,
    `POST /workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/messages`,
    `GET /workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}/events`,
    `POST /workspace/${WORKSPACE_ID}/files/sessions`,
    `POST /files/sessions/${FILE_SESSION_ID}/read-batch`,
    "GET /approvals",
    `DELETE /workspace/${WORKSPACE_ID}/sessions/${SESSION_ID}`,
  ]) {
    assert.ok(routeKeys.includes(expected), `missing route: ${expected}`);
  }
  assert.equal(/seed|mnemonic|privateKey|private_key|wallet export/i.test(JSON.stringify({ report, requests })), false);

  console.log("Matterhorn agent-control live QA harness test passed.");
} finally {
  server.close();
}
