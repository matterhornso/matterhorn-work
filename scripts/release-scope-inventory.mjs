#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const repoRoot = resolve(readArg("--repo-root") || scriptRoot);
const jsonOutput = readArg("--json-output");
const strict = args.includes("--strict");
const json = args.includes("--json");

const protectedRules = [
  { root: ".opencode/package-lock.json", matches: (path) => path === ".opencode/package-lock.json" },
  { root: ".matterhorn-work/", matches: (path) => path === ".matterhorn-work" || path.startsWith(".matterhorn-work/") },
  { root: "notes/", matches: (path) => path === "notes" || path.startsWith("notes/") },
  { root: "qa-reports/", matches: (path) => path === "qa-reports" || path.startsWith("qa-reports/") },
  { root: "apps/desktop/dist-electron 2/", matches: (path) => path.startsWith("apps/desktop/dist-electron 2/") },
  { root: "apps/desktop/server 2/", matches: (path) => path.startsWith("apps/desktop/server 2/") },
  { root: "apps/desktop/server 3/", matches: (path) => path.startsWith("apps/desktop/server 3/") },
];

function git(commandArgs, options = {}) {
  return execFileSync("git", commandArgs, {
    cwd: repoRoot,
    encoding: options.encoding || "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function parseStatus() {
  const raw = git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], { encoding: "buffer" });
  const tokens = raw.toString("utf8").split("\0");
  const entries = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    const status = token.slice(0, 2);
    const path = token.slice(3);
    const renamed = status.includes("R") || status.includes("C");
    const originalPath = renamed ? tokens[index + 1] || null : null;
    if (renamed) index += 1;
    entries.push({ status, path, originalPath });
  }

  return entries;
}

function protectedRoot(path) {
  return protectedRules.find((rule) => rule.matches(path))?.root || null;
}

function isStaged(status) {
  return status[0] !== " " && status[0] !== "?";
}

const entries = parseStatus();
const candidateReview = [];
const preserveOnly = {};
const statusCounts = {};
const topLevelCounts = {};
const stagedProtectedPaths = [];

for (const entry of entries) {
  statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1;
  const topLevel = entry.path.split("/")[0];
  topLevelCounts[topLevel] = (topLevelCounts[topLevel] || 0) + 1;

  const root = protectedRoot(entry.path) || (entry.originalPath ? protectedRoot(entry.originalPath) : null);
  if (root) {
    preserveOnly[root] = (preserveOnly[root] || 0) + 1;
    if (isStaged(entry.status)) {
      stagedProtectedPaths.push({ status: entry.status, path: entry.path, protectedRoot: root });
    }
    continue;
  }

  candidateReview.push({
    status: entry.status,
    path: entry.path,
    ...(entry.originalPath ? { originalPath: entry.originalPath } : {}),
    staged: isStaged(entry.status),
  });
}

const report = {
  version: "matterhorn.release-scope-inventory.v1",
  capturedAt: new Date().toISOString(),
  repository: repoRoot,
  branch: git(["branch", "--show-current"]).trim(),
  head: git(["rev-parse", "HEAD"]).trim(),
  readyToStage: stagedProtectedPaths.length === 0,
  totals: {
    dirtyPaths: entries.length,
    candidateReview: candidateReview.length,
    preserveOnly: entries.length - candidateReview.length,
  },
  statusCounts,
  topLevelCounts,
  preserveOnly,
  stagedProtectedPaths,
  candidateReview,
};

if (jsonOutput) {
  const target = resolve(repoRoot, jsonOutput);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Release scope inventory: ${report.branch}@${report.head.slice(0, 12)}`);
  console.log(`  Candidate review: ${report.totals.candidateReview}`);
  console.log(`  Preserve only:    ${report.totals.preserveOnly}`);
  console.log(`  Protected staged: ${report.stagedProtectedPaths.length}`);
  if (jsonOutput) console.log(`  Report:           ${resolve(repoRoot, jsonOutput)}`);
}

if (strict && stagedProtectedPaths.length > 0) {
  console.error("Release scope inventory blocked: preserve-only paths are staged.");
  process.exitCode = 1;
}
