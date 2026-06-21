#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// 1. Package exposes the launch readiness gate.
assert.equal(
  pkg.scripts["test:monday-beta-launch-readiness"],
  "node scripts/monday-beta-launch-readiness.test.mjs",
  "package.json should expose test:monday-beta-launch-readiness",
);

function run(extraArgs = []) {
  return spawnSync(process.execPath, ["scripts/monday-beta-launch-readiness.mjs", ...extraArgs], {
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
}

// 2. Default run writes the report and exits 0.
const result = run();
assert.equal(result.status, 0, `launch readiness should exit 0. stderr=${result.stderr}`);
const summary = JSON.parse(result.stdout);
assert.equal(summary.ok, true);
assert.ok(summary.outputPath, "summary should include outputPath");
assert.equal(summary.failed, 0, "no findings should fail");

const report = readFileSync(summary.outputPath, "utf8");
assert.ok(report.startsWith("# Monday Beta Launch Readiness Audit"));
assert.ok(report.includes("**Overall:** ✅ READY"));

// 3. Report proves the four required areas.
for (const section of [
  "## Stale PR audit",
  "### Protocol/Workflow manifests",
  "### Market safety",
  "### Wellness safety",
  "### Services planned-not-live",
  "### Monday beta scenario coverage",
  "### Universal safety",
]) {
  assert.ok(report.includes(section), `report must include ${section}`);
}

// 4. Report shows expected green checks.
for (const check of [
  "Workflow manifest wellness_creator_services exists",
  "Workflow manifest bittensor_operator exists",
  "Workflow manifest market_read_preview exists",
  "Workflow manifest decentralized_services_planner exists",
  "Protocol workspace manifest bittensor exists",
  "Protocol workspace manifest hyperliquid exists",
  "Protocol workspace manifest polymarket exists",
  "Protocol workspace manifest wellness exists",
  "Protocol workspace manifest decentralized_services exists",
  "Hyperliquid scenario is preview_only",
  "Hyperliquid scenario canSubmit is false",
  "Polymarket scenario canSubmit is false",
  "Wellness scenario is planned_not_live",
  "Wellness scenario forbids medical advice claims",
  "Services scenario is planned_not_live",
  "All 5 Monday beta demo scenarios exist",
  "Monday beta scenarios cover 10 customers",
  "All demo scenarios reject live execution, submission, secrets, and real funds",
]) {
  assert.ok(report.includes(check), `report must include check: ${check}`);
  assert.ok(report.includes(`| ${check} | ✅`), `check must be green: ${check}`);
}

// 5. JSON mode works.
const jsonResult = run(["--json"]);
assert.equal(jsonResult.status, 0, `json mode should exit 0. stderr=${jsonResult.stderr}`);
const json = JSON.parse(jsonResult.stdout);
assert.equal(json.ok, true);
assert.ok(Array.isArray(json.findings));
assert.ok(json.findings.length > 0);

// 6. Custom output path works.
const tmpDir = mkdtempSync(join(tmpdir(), "monday-beta-readiness-"));
const customResult = run(["--output", join(tmpDir, "report.md")]);
assert.equal(customResult.status, 0, `custom output should exit 0. stderr=${customResult.stderr}`);
const customReport = readFileSync(join(tmpDir, "report.md"), "utf8");
assert.ok(customReport.includes("Monday Beta Launch Readiness Audit"));

// 7. Credential-shaped flags are rejected.
const reject = spawnSync(
  process.execPath,
  ["scripts/monday-beta-launch-readiness.mjs", "--output", join(tmpDir, "bad.md"), "--private-key", "redacted"],
  { encoding: "utf8", maxBuffer: 1024 * 1024 },
);
assert.notEqual(reject.status, 0, "launch readiness should reject credential-shaped flags");
assert.match(reject.stderr, /Forbidden credential-shaped flag --private-key/);

// Cleanup.
rmSync(tmpDir, { recursive: true, force: true });

console.log("Monday beta launch readiness audit check passed.");
