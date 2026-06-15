#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/bittensor-adapter-readonly-canary.mjs");
const token = "mwt_canary_test";
const requests = [];

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
  });
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const requestSha256 = "a".repeat(64);
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const body = await readJson(req);
  requests.push({ method: req.method, path: url.pathname, authorization: req.headers.authorization, body });
  if (req.headers.authorization !== `Bearer ${token}`) return json(res, 401, { error: "unauthorized" });
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities/14") {
    return json(res, 200, {
      success: true,
      capability: {
        netuid: 14,
        name: "SN14 canary",
        serviceAdapter: "data_search",
        endpoint: "https://adapter.example.com/search",
        configured: true,
        requiredAuth: "none",
        costModel: "free_read",
        safetyNotes: ["Read-only canary endpoint. No wallet data required."],
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/preview") {
    return json(res, 200, {
      success: true,
      preview: {
        netuid: 14,
        intent: "service_call",
        adapter: "data_search",
        supported: true,
        request: { netuid: 14, intent: "service_call", task: body.task, ss58Address: null },
        requestSha256,
        warnings: [],
        requiresConfirmation: true,
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/invoke") {
    if (body.previewRequestSha256 !== requestSha256 || body.reviewedRequestSha256 !== requestSha256) {
      return json(res, 409, { error: "preview_mismatch" });
    }
    return json(res, 200, {
      success: true,
      invocation: {
        netuid: 14,
        intent: "service_call",
        adapter: "data_search",
        supported: true,
        result: { output: { ok: true, items: [{ title: "canary" }] } },
        message: "Adapter canary completed.",
        warnings: [],
      },
    });
  }
  return json(res, 404, { error: "not_found" });
});

const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-adapter-readonly-canary-"));
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const serverUrl = `http://127.0.0.1:${port}`;

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [script, "--server-url", serverUrl, "--token", token, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else {
        const error = new Error(`Command failed with code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

try {
  const out = path.join(tmp, "canary.json");
  await run([
    "--netuid", "14",
    "--task", "Find public Bittensor docs about subnet 14.",
    "--allowed-hosts", "adapter.example.com",
    "--confirm-invoke",
    "--allow-real-adapter-call",
    "--json-output", out,
    "--strict",
  ]);
  const summary = JSON.parse(await readFile(out, "utf8"));
  assert.equal(summary.ready, true);
  assert.equal(summary.invoked, true);
  assert.equal(summary.previewRequestSha256, requestSha256);
  assert.equal(summary.safety.signsOrBroadcasts, false);
  assert.equal(requests.some((request) => request.path === "/api/bittensor/subnets/14/invoke"), true);

  await assert.rejects(
    () => run([
      "--netuid", "14",
      "--task", "Find public Bittensor docs about subnet 14.",
      "--allowed-hosts", "adapter.example.com",
      "--confirm-invoke",
      "--strict",
    ]),
    /Command failed/i,
  );

  console.log("Bittensor adapter read-only canary tests passed.");
} finally {
  server.close();
  await rm(tmp, { recursive: true, force: true });
}
