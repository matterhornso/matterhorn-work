#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CLIENT_TOKEN = "mwt_doctor_client";
const HOST_TOKEN = "mwt_doctor_host";
const requests = [];

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  requests.push({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    authorization: req.headers.authorization,
    hostToken: req.headers["x-matterhorn-host-token"],
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
    return json(res, 200, { items: [{ id: "ws_1", name: "Demo" }] });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/readiness") {
    return json(res, 200, { success: true, report: { ready: true, checks: [] } });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities") {
    return json(res, 200, { success: true, capabilities: [{ netuid: 14, capabilityLevel: "adapter_required" }] });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/status") {
    return json(res, 200, { item: { status: { type: "idle" }, busy: false } });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/snapshot") {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { item: { session: { id: "ses_1" }, messages: [], todos: [] } });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/events") {
    assert.equal(url.searchParams.get("maxEvents"), "1");
    assert.equal(url.searchParams.get("snapshot"), "true");
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`id: 1\nevent: session.snapshot\ndata: ${JSON.stringify({ type: "session.snapshot", cursor: "1" })}\n\n`);
    return;
  }
  if (req.method === "GET" && url.pathname === "/files/sessions/fs_1/catalog/snapshot") {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { items: [{ path: "README.md" }] });
  }
  if (req.method === "GET" && url.pathname === "/files/sessions/fs_1/catalog/events") {
    return json(res, 200, { cursor: 1, events: [] });
  }

  return json(res, 404, { error: "not_found", path: url.pathname });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function runCli(baseUrl) {
  const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "orchestrator", "src", "cli.ts");
  const child = spawn("bun", [
    cliPath,
    "doctor",
    "--openwork-url",
    baseUrl,
    "--token",
    CLIENT_TOKEN,
    "--host-token",
    HOST_TOKEN,
    "--workspace-id",
    "ws_1",
    "--session-id",
    "ses_1",
    "--file-session-id",
    "fs_1",
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

try {
  const report = await runCli(`http://127.0.0.1:${port}`);
  assert.equal(report.ready, true);
  assert.equal(report.summary.fail, 0);
  assert.ok(report.checks.some((check) => check.id === "server.health" && check.status === "pass"));
  assert.ok(report.checks.some((check) => check.id === "bittensor.readiness" && check.status === "pass"));
  assert.ok(report.checks.some((check) => check.id === "bittensor.capabilities" && check.status === "pass"));
  assert.ok(report.checks.some((check) => check.id === "session.events" && check.status === "pass"));
  assert.ok(report.checks.some((check) => check.id === "files.events" && check.status === "pass"));

  const routeKeys = requests.map((request) => `${request.method} ${request.path}`);
  for (const expected of [
    "GET /health",
    "GET /status",
    "GET /capabilities",
    "GET /workspaces",
    "GET /api/bittensor/readiness",
    "GET /api/bittensor/capabilities",
    "GET /workspace/ws_1/sessions/ses_1/status",
    "GET /workspace/ws_1/sessions/ses_1/snapshot",
    "GET /workspace/ws_1/sessions/ses_1/events",
    "GET /files/sessions/fs_1/catalog/snapshot",
    "GET /files/sessions/fs_1/catalog/events",
    "GET /approvals",
  ]) {
    assert.ok(routeKeys.includes(expected), `missing route probe: ${expected}`);
  }
  assert.equal(routeKeys.some((key) => key.startsWith("POST ") || key.startsWith("DELETE ")), false);
  assert.equal(/seed|mnemonic|privateKey|private_key|wallet export/i.test(JSON.stringify(report)), false);

  console.log("Matterhorn agent-control doctor smoke test passed.");
} finally {
  server.close();
}
