#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = "scripts/workspace-backup-restore-drill.mjs";
const clientToken = "test-client-token";
const hostToken = "test-host-token";
const sourcePayload = {
  workspaceId: "ws_source",
  exportedAt: 123,
  opencode: { plugin: ["matterhorn"] },
  openwork: { launch: "test" },
  skills: [],
  commands: [],
};
let targetPayload = { workspaceId: "ws_restore", exportedAt: 456, opencode: {}, openwork: {}, skills: [], commands: [] };
let pendingApproval = null;
let releaseImport = null;
let decoyApproved = false;
let restoreApplied = false;

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const isClient = request.headers.authorization === `Bearer ${clientToken}`;
  const isHost = request.headers["x-matterhorn-host-token"] === hostToken;
  if (url.pathname === "/workspace/ws_source/export" && isClient) return json(response, 200, sourcePayload);
  if (url.pathname === "/workspace/ws_restore/export" && isClient) return json(response, 200, targetPayload);
  if (url.pathname === "/workspace/ws_restore/import/preview" && request.method === "POST" && isClient) {
    return json(response, 200, restoreApplied
      ? { fingerprint: "verification-456", summary: { total: 2, create: 0, update: 0, replace: 0, delete: 0, unchanged: 2 } }
      : { fingerprint: "preview-123", summary: { total: 2, create: 0, update: 2, replace: 0, delete: 0, unchanged: 0 } });
  }
  if (url.pathname === "/workspace/ws_restore/import" && request.method === "POST" && isClient) {
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body);
    pendingApproval = {
      id: "approval-1",
      workspaceId: "ws_restore",
      action: "config.import",
      summary: "Import workspace config (update 2)",
      actor: { tokenHash: createHash("sha256").update(clientToken).digest("hex") },
      createdAt: Date.now(),
    };
    await new Promise((resolve) => { releaseImport = resolve; });
    targetPayload = { ...parsed, workspaceId: "ws_restore", exportedAt: 999 };
    delete targetPayload.previewFingerprint;
    restoreApplied = true;
    return json(response, 200, { ok: true });
  }
  if (url.pathname === "/approvals" && isHost) return json(response, 200, {
    items: pendingApproval ? [{ ...pendingApproval, id: "decoy", actor: { tokenHash: "0".repeat(64) } }, pendingApproval] : [],
  });
  if (url.pathname === "/approvals/decoy" && request.method === "POST" && isHost) {
    decoyApproved = true;
    return json(response, 200, { ok: true, allowed: true });
  }
  if (url.pathname === "/approvals/approval-1" && request.method === "POST" && isHost) {
    pendingApproval = null;
    releaseImport?.();
    return json(response, 200, { ok: true, allowed: true });
  }
  return json(response, 404, { message: "Not found" });
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const serverUrl = `http://127.0.0.1:${address.port}`;
const outputDir = mkdtempSync(join(tmpdir(), "matterhorn-backup-restore-"));

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

try {
  const unsafe = await run([
    "--server-url", serverUrl, "--token", clientToken, "--host-token", hostToken,
    "--source-workspace", "ws_source", "--target-workspace", "ws_source", "--apply",
    "--confirm-target", "ws_source", "--output-dir", outputDir,
  ]);
  assert.equal(unsafe.code, 1);
  assert.match(unsafe.stderr, /must differ/i);

  const reportPath = join(outputDir, "report.json");
  const result = await run([
    "--",
    "--server-url", serverUrl, "--token", clientToken, "--host-token", hostToken,
    "--source-workspace", "ws_source", "--target-workspace", "ws_restore", "--apply",
    "--confirm-target", "ws_restore", "--output-dir", outputDir, "--json-output", reportPath, "--json",
  ]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.version, "matterhorn.workspace-backup-restore-drill.v1");
  assert.equal(report.status, "pass");
  assert.equal(report.ready, true);
  assert.equal(report.sensitiveMode, "exclude");
  assert.equal(report.restore.approvalCompleted, true);
  assert.equal(report.restore.verified, true);
  assert.deepEqual(report.restore.verificationSummary, {
    total: 2,
    create: 0,
    update: 0,
    replace: 0,
    delete: 0,
    unchanged: 2,
  });
  assert.equal(decoyApproved, false);
  assert.match(report.backup.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")), report);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(`${clientToken}|${hostToken}`));

  const help = await run(["--help"]);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /sensitive=exclude/);
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(outputDir, { recursive: true, force: true });
}

console.log("Workspace backup/restore drill contract passed.");
