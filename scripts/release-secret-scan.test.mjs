#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(sourceRoot, "scripts", "release-secret-scan.mjs");
const temp = mkdtempSync(join(tmpdir(), "matterhorn-secret-scan-"));
const reportPath = join(temp, "qa-reports", "secret-scan.json");
const fakeProviderToken = `sk-${"fixture_value_".repeat(3)}`;

function git(args) {
  return execFileSync("git", args, { cwd: temp, encoding: "utf8" });
}

function write(path, value) {
  const target = join(temp, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
}

function run(extraArgs = []) {
  return spawnSync("node", [
    script,
    "--repo-root", temp,
    "--json-output", reportPath,
    "--strict",
    ...extraArgs,
  ], { cwd: sourceRoot, encoding: "utf8" });
}

try {
  git(["init", "-q"]);
  git(["config", "user.email", "security-test@matterhorn.local"]);
  git(["config", "user.name", "Matterhorn Security Test"]);
  write("src/app.ts", "export const safe = true;\n");
  write("docs/example.md", fakeProviderToken);
  write("src/app.test.ts", fakeProviderToken);
  write("qa-reports/local/output.json", JSON.stringify({ token: fakeProviderToken }));
  git(["add", "src/app.ts", "docs/example.md", "src/app.test.ts"]);
  git(["commit", "-qm", "fixture"]);

  const safe = run(["--json"]);
  assert.equal(safe.status, 0, safe.stderr || safe.stdout);
  const safeReport = JSON.parse(safe.stdout);
  assert.equal(safeReport.ready, true);
  assert.equal(safeReport.findings.length, 0);
  assert.equal(safeReport.policy.reportsMatchedValues, false);

  write("src/provider.ts", `export const providerCredential = "${fakeProviderToken}";\n`);
  const blocked = run();
  assert.equal(blocked.status, 1);
  assert.doesNotMatch(blocked.stdout, new RegExp(fakeProviderToken));
  assert.doesNotMatch(blocked.stderr, new RegExp(fakeProviderToken));
  const blockedReport = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(blockedReport.ready, false);
  assert.deepEqual(blockedReport.findings, [
    { path: "src/provider.ts", line: 1, rule: "provider-secret-token" },
  ]);
  assert.doesNotMatch(JSON.stringify(blockedReport), new RegExp(fakeProviderToken));

  write("src/bridge.py", `credential = "${fakeProviderToken}"\n`);
  const pythonBlocked = run(["--json"]);
  assert.equal(pythonBlocked.status, 1);
  assert.ok(JSON.parse(pythonBlocked.stdout).findings.some(finding => finding.path === "src/bridge.py"));
  assert.ok(!pythonBlocked.stdout.includes(fakeProviderToken));

  write("src/provider.ts", "export const safe = true;\n");
  write("src/bridge.py", "safe = True\n");
  const catalogPrefix = " ".repeat(3 * 1024 * 1024);
  write("src/catalog.json", `${catalogPrefix}${JSON.stringify({ credential: fakeProviderToken })}`);
  const largeSecret = run(["--json"]);
  assert.equal(largeSecret.status, 1);
  const largeSecretReport = JSON.parse(largeSecret.stdout);
  assert.equal(largeSecretReport.skippedLarge.length, 0);
  assert.deepEqual(largeSecretReport.findings, [
    { path: "src/catalog.json", line: 1, rule: "provider-secret-token" },
  ]);
  assert.ok(!largeSecret.stdout.includes(fakeProviderToken));

  write("src/catalog.json", `${catalogPrefix}{}`);
  const largeSafe = run(["--json"]);
  assert.equal(largeSafe.status, 0, largeSafe.stderr);
  assert.equal(JSON.parse(largeSafe.stdout).skippedLarge.length, 0);

  write("src/catalog.json", " ".repeat(8 * 1024 * 1024 + 1));
  const oversized = run(["--json"]);
  assert.equal(oversized.status, 1);
  const oversizedReport = JSON.parse(oversized.stdout);
  assert.equal(oversizedReport.ready, false);
  assert.deepEqual(oversizedReport.skippedLarge, [
    { path: "src/catalog.json", bytes: 8 * 1024 * 1024 + 1 },
  ]);

  console.log("Release secret scan contract passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
