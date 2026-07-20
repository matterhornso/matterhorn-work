#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(repoRoot, "scripts", "release-scope-inventory.mjs");
const temp = mkdtempSync(join(tmpdir(), "matterhorn-scope-inventory-"));
const reportPath = join(temp, "qa-reports", "inventory.json");

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
  ], { cwd: repoRoot, encoding: "utf8" });
}

try {
  git(["init", "-q"]);
  git(["config", "user.email", "release-test@matterhorn.local"]);
  git(["config", "user.name", "Matterhorn Release Test"]);
  write("src/app.ts", "export const app = true;\n");
  write(".opencode/package-lock.json", "{}\n");
  git(["add", "src/app.ts", ".opencode/package-lock.json"]);
  git(["commit", "-qm", "fixture"]);

  write("src/app.ts", "export const app = false;\n");
  write(".opencode/package-lock.json", "{\"local\":true}\n");
  write("notes/private.txt", "preserve\n");
  write("qa-reports/run/output.json", "{}\n");
  write(".matterhorn-work/runtime.json", "{}\n");
  write("src/new.ts", "export const next = true;\n");
  git(["add", ".opencode/package-lock.json"]);

  const blocked = run();
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /preserve-only paths are staged/i);
  const blockedReport = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(blockedReport.readyToStage, false);
  assert.equal(blockedReport.stagedProtectedPaths.length, 1);
  assert.equal(blockedReport.stagedProtectedPaths[0].protectedRoot, ".opencode/package-lock.json");
  assert.ok(blockedReport.candidateReview.some((entry) => entry.path === "src/app.ts"));
  assert.ok(blockedReport.candidateReview.some((entry) => entry.path === "src/new.ts"));
  assert.ok(blockedReport.candidateReview.every((entry) => !entry.path.startsWith("notes/")));
  assert.ok(blockedReport.candidateReview.every((entry) => !entry.path.startsWith("qa-reports/")));

  git(["reset", "-q", "HEAD", "--", ".opencode/package-lock.json"]);
  git(["add", "src/app.ts", "src/new.ts"]);
  const allowed = run(["--json"]);
  assert.equal(allowed.status, 0, allowed.stderr || allowed.stdout);
  const allowedReport = JSON.parse(allowed.stdout);
  assert.equal(allowedReport.readyToStage, true);
  assert.equal(allowedReport.stagedProtectedPaths.length, 0);
  assert.equal(allowedReport.totals.candidateReview, 2);
  assert.equal(allowedReport.totals.preserveOnly, 5);

  console.log("Release scope inventory contract passed.");
} finally {
  rmSync(temp, { recursive: true, force: true });
}
