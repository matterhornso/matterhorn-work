#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fromCommit = "a".repeat(40);
const toCommit = "b".repeat(40);
const temp = mkdtempSync(join(tmpdir(), "matterhorn-rollback-"));
const statePath = join(temp, "state.txt");
const hookPath = join(temp, "rollback-hook");
const reportPath = join(temp, "report.json");
writeFileSync(statePath, fromCommit);
writeFileSync(hookPath, `#!/bin/sh\nprintf '%s' "$1" > "$2"\n`);
chmodSync(hookPath, 0o700);

const server = createServer((request, response) => {
  const commit = readFileSync(statePath, "utf8").trim();
  response.writeHead(200, {
    "content-type": request.url === "/health" ? "application/json" : "text/html",
    "x-matterhorn-build-commit": commit,
  });
  response.end(request.url === "/health" ? JSON.stringify({ ok: true }) : "<!doctype html><title>Matterhorn Desks</title>");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const base = `http://127.0.0.1:${address.port}`;

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/product-hunt-rollback-rehearsal.mjs", ...args], { stdio: ["ignore", "pipe", "pipe"] });
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
    "--app-url", base, "--server-url", base, "--from-commit", fromCommit, "--to-commit", fromCommit,
    "--owner", "Release owner", "--rollback-hook", hookPath, "--allow-loopback-http",
  ]);
  assert.equal(unsafe.code, 1);
  assert.match(unsafe.stderr, /must differ/i);

  const escapedHealth = await run([
    "--app-url", base, "--server-url", base, "--from-commit", fromCommit, "--to-commit", toCommit,
    "--owner", "Release owner", "--rollback-hook", hookPath, "--health-path", "//untrusted.invalid/health",
    "--allow-loopback-http",
  ]);
  assert.equal(escapedHealth.code, 1);
  assert.match(escapedHealth.stderr, /health-path must be an absolute path/i);

  const result = await run([
    "--app-url", base, "--server-url", base, "--from-commit", fromCommit, "--to-commit", toCommit,
    "--owner", "Release owner", "--rollback-hook", hookPath,
    "--rollback-arg", toCommit, "--rollback-arg", statePath,
    "--timeout-ms", "4000", "--interval-ms", "50", "--allow-loopback-http",
    "--json", "--json-output", reportPath,
  ]);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.version, "matterhorn.product-hunt-rollback-rehearsal.v1");
  assert.equal(report.status, "contract_pass");
  assert.equal(report.ready, false);
  assert.equal(report.localContractRun, true);
  assert.equal(report.healthVerified, true);
  assert.equal(report.hook.file, "rollback-hook");
  assert.equal(report.hook.argumentsRecorded, false);
  assert.match(report.hook.sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.parse(readFileSync(reportPath, "utf8")).toCommit, toCommit);
  assert.doesNotMatch(result.stdout, new RegExp(statePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const strict = await run([
    "--app-url", base, "--server-url", base, "--from-commit", toCommit, "--to-commit", fromCommit,
    "--owner", "Release owner", "--rollback-hook", hookPath,
    "--rollback-arg", fromCommit, "--rollback-arg", statePath,
    "--timeout-ms", "4000", "--interval-ms", "50", "--allow-loopback-http", "--strict",
  ]);
  assert.equal(strict.code, 1, "A loopback rehearsal must not pass strict production readiness.");
  console.log("Product Hunt rollback rehearsal contract passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
