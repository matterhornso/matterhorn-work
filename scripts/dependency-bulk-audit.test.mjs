#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/dependency-bulk-audit.mjs", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const dir = mkdtempSync(join(tmpdir(), "matterhorn-bulk-audit-"));
const lockfile = join(dir, "pnpm-lock.yaml");
writeFileSync(lockfile, [
  "lockfileVersion: '9.0'",
  "packages:",
  "",
  "  fixture-package@1.0.0:",
  "    resolution: {integrity: fixture}",
  "",
  "  '@scope/fixture@2.0.0':",
  "    resolution: {integrity: fixture}",
  "",
  "snapshots:",
].join("\n"));

let receivedBody = null;
let retryRequests = 0;
let unavailableRequests = 0;
const server = createServer(async (request, response) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  receivedBody = JSON.parse(body);
  response.setHeader("Content-Type", "application/json");
  if (request.url?.includes("retry")) {
    retryRequests += 1;
    if (retryRequests === 1) {
      response.statusCode = 503;
      response.end(JSON.stringify({ error: "temporarily unavailable" }));
      return;
    }
  }
  if (request.url?.includes("unavailable")) {
    unavailableRequests += 1;
    response.statusCode = 503;
    response.end(JSON.stringify({ error: "temporarily unavailable" }));
    return;
  }
  response.end(JSON.stringify(receivedBody["fixture-package"] ? {
    "fixture-package": [{
      id: 42,
      url: "https://github.com/advisories/GHSA-test-test-test",
      title: "Fixture advisory",
      severity: "high",
      vulnerable_versions: "<=1.0.0",
    }],
  } : {}));
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const registryUrl = `http://127.0.0.1:${address.port}/-/npm/v1/security/advisories/bulk`;
  const blocked = await run(["--lockfile", lockfile, "--registry-url", registryUrl, "--audit-level", "low", "--json"]);
  assert.equal(blocked.code, 1, blocked.stderr || blocked.stdout);
  const blockedReport = JSON.parse(blocked.stdout);
  assert.equal(blockedReport.version, "matterhorn.dependency-bulk-audit.v1");
  assert.equal(blockedReport.ready, false);
  assert.equal(blockedReport.blockingCount, 1);
  assert.equal(blockedReport.advisories[0].id, "42");
  assert.deepEqual(receivedBody, {
    "@scope/fixture": ["2.0.0"],
    "fixture-package": ["1.0.0"],
  });

  const allowed = await run(["--lockfile", lockfile, "--registry-url", registryUrl, "--audit-level", "critical", "--json"]);
  assert.equal(allowed.code, 0, allowed.stderr || allowed.stdout);
  assert.equal(JSON.parse(allowed.stdout).ready, true);

  const completeLockfile = await run(["--all", "--registry-url", registryUrl, "--audit-level", "low", "--json"]);
  assert.equal(completeLockfile.code, 0, completeLockfile.stderr || completeLockfile.stdout);
  const completeReport = JSON.parse(completeLockfile.stdout);
  assert.equal(completeReport.ready, true);
  assert.equal(completeReport.scope, "complete-lockfile");
  assert.ok(completeReport.versionCount > 1_000, "the default release audit should cover the complete workspace lockfile");

  const productionGraph = await run(["--prod", "--registry-url", registryUrl, "--audit-level", "low", "--json"]);
  assert.equal(productionGraph.code, 0, productionGraph.stderr || productionGraph.stdout);
  const productionReport = JSON.parse(productionGraph.stdout);
  assert.equal(productionReport.ready, true);
  assert.equal(productionReport.scope, "installed-production-graph");
  assert.ok(productionReport.versionCount > 500, "the production audit should cover transitive installed dependencies");

  const retried = await run([
    "--lockfile", lockfile,
    "--registry-url", `${registryUrl}?retry=1`,
    "--audit-level", "critical",
    "--json",
  ]);
  assert.equal(retried.code, 0, retried.stderr || retried.stdout);
  assert.equal(retryRequests, 2, "one transient registry failure should be retried once");

  const unavailable = await run([
    "--lockfile", lockfile,
    "--registry-url", `${registryUrl}?unavailable=1`,
    "--audit-level", "critical",
    "--json",
  ]);
  assert.equal(unavailable.code, 1, unavailable.stderr || unavailable.stdout);
  assert.equal(unavailableRequests, 3, "the registry gate should stop after its bounded attempt budget");
  assert.match(unavailable.stderr, /npm bulk advisory API returned 503 after 3 attempts/);
} finally {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
}

console.log("Dependency bulk audit contract passed.");
