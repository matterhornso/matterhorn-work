#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = "scripts/model-prompt-path-audit.mjs";

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

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts["smoke:model-prompt-path-audit"], "node scripts/model-prompt-path-audit.mjs");
assert.equal(packageJson.scripts["test:model-prompt-path-audit"], "node scripts/model-prompt-path-audit.test.mjs");

const source = readFileSync(scriptPath, "utf8");
for (const required of [
  "matterhorn.model-prompt-path-audit.v1",
  "apps/server/src/server.ts",
  "apps/server/src/session-read-model.e2e.test.ts",
  "apps/app/src/react-app/shell/session-route.tsx",
  "apps/app/src/react-app/domains/settings/pages/ai-view.tsx",
  "apps/app/src/react-app/domains/settings/state/model-readiness-summary.ts",
  "until the prompt path is fully unified",
]) {
  assert.ok(source.includes(required), `audit source should reference ${required}`);
}

const jsonResult = await run(["--json"]);
assert.equal(jsonResult.code, 0, jsonResult.stderr || jsonResult.stdout);
const report = JSON.parse(jsonResult.stdout);
assert.equal(report.success, true);
assert.equal(report.version, "matterhorn.model-prompt-path-audit.v1");
assert.ok(Array.isArray(report.modelPrecedence));
assert.ok(report.modelPrecedence.some((item) => item.includes("Explicit app picker request model wins")));

const expectedCheckIds = [
  "server-stable-route-resolves-model",
  "server-precedence-tests",
  "app-composer-send-uses-picker-model",
  "app-desk-send-uses-picker-model",
  "settings-workspace-default-controls",
  "settings-copy-explains-precedence",
  "backend-copy-no-stale-unified-warning",
  "app-send-path-no-hardcoded-default-model",
];
const checkIds = new Set(report.checks.map((check) => check.id));
for (const id of expectedCheckIds) {
  assert.ok(checkIds.has(id), `missing audit check ${id}`);
}
assert.ok(report.checks.every((check) => check.status === "pass"));

const outputDir = mkdtempSync(join(tmpdir(), "matterhorn-model-prompt-audit-"));
try {
  const outputPath = join(outputDir, "report.json");
  const outputResult = await run(["--json-output", outputPath]);
  assert.equal(outputResult.code, 0, outputResult.stderr || outputResult.stdout);
  assert.ok(outputResult.stdout.includes("Model prompt path audit"));
  const saved = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(saved.success, true);
  assert.equal(saved.checks.length, report.checks.length);
} finally {
  rmSync(outputDir, { recursive: true, force: true });
}

const helpResult = await run(["--help"]);
assert.equal(helpResult.code, 0, helpResult.stderr);
assert.ok(helpResult.stdout.includes("Usage:"));
assert.ok(helpResult.stdout.includes("--json-output"));

console.log("model-prompt-path-audit: ok");
