#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REPORT_VERSION,
  buildLaunchEvidence,
  buildStages,
  evaluateDecision,
  executeStage,
  getSourceIdentity,
  parseArgs,
  redactLog,
  reusableStage,
} from "./public-beta-candidate-certifier.mjs";

const source = {
  head: "a".repeat(40),
  branch: "codex/test",
  dirty: false,
  dirtyPathCount: 0,
  preserveOnlyPathCount: 0,
  stagedPathCount: 0,
  workingTreeFingerprint: "b".repeat(64),
};

const parsed = parseArgs([
  "--output-dir",
  "/tmp/candidate",
  "--app-url=https://desks.example/workspace/ws/session",
  "--timeout-ms",
  "5000",
  "--strict",
  "--json",
]);
assert.equal(parsed.outputDir, "/tmp/candidate");
assert.equal(parsed.appUrl, "https://desks.example/workspace/ws/session");
assert.equal(parsed.timeoutMs, 5000);
assert.equal(parsed.strict, true);
assert.equal(parsed.json, true);
assert.throws(() => parseArgs(["--timeout-ms", "10"]), /at least 100/);
assert.throws(() => parseArgs(["--app-url", "file:///tmp/app"]), /http or https/);
assert.throws(
  () => parseArgs(["--app-url", "https://user:password@desks.example/"]),
  /must not include credentials/,
);
assert.throws(
  () => parseArgs(["--app-url", "https://desks.example/?access_token=secret"]),
  /secret-like query parameters/,
);
assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);

const stages = buildStages({
  outputDir: "/tmp/candidate",
  appUrl: "https://desks.example/workspace/ws/session",
  skipBrowser: false,
  timeoutMs: 1000,
});
assert.ok(stages.some((item) => item.id === "scope_inventory"));
assert.ok(stages.some((item) => item.id === "candidate_manifest"));
assert.ok(stages.some((item) => item.id === "secret_scan"));
assert.ok(stages.some((item) => item.id === "app_tests"));
assert.ok(stages.some((item) => item.id === "server_tests"));
assert.ok(stages.some((item) => item.id === "production_build"));
assert.ok(stages.some((item) => item.id === "platform_safety"));
assert.ok(stages.some((item) => item.id === "browser_acceptance"));
assert.deepEqual(
  stages.find((item) => item.id === "electron_typecheck").command,
  [
    "pnpm",
    "--filter",
    "@matterhorn-work/app",
    "exec",
    "tsc",
    "-p",
    "../desktop/tsconfig.electron.json",
    "--noEmit",
  ],
);
assert.equal(
  buildStages({
    outputDir: "/tmp/candidate",
    appUrl: "",
    skipBrowser: false,
    timeoutMs: 1000,
  }).some((item) => item.id === "browser_acceptance"),
  false,
);

const secret = "sk-" + "A".repeat(32);
assert.doesNotMatch(redactLog(`token=${secret}`), new RegExp(secret));
assert.match(redactLog(`Authorization: Bearer ${"x".repeat(24)}`), /Bearer <redacted>/);
assert.match(redactLog("API_KEY=super-secret-value"), /API_KEY=<redacted>/);

const passed = [{ status: "pass" }, { status: "pass" }];
assert.deepEqual(evaluateDecision({ source, stages: passed }), {
  decision: "LOCAL-GREEN-OWNER-GATES-PENDING",
  technicalGatesPass: true,
  sourceStable: true,
  localReady: true,
  immutable: true,
  readyForOwnerGates: true,
  publicReady: false,
});
assert.equal(
  evaluateDecision({
    source: { ...source, dirty: true },
    stages: passed,
  }).decision,
  "LOCAL-GREEN-NOT-IMMUTABLE",
);
assert.equal(
  evaluateDecision({ source, stages: [{ status: "fail" }] }).decision,
  "NO-GO-LOCAL-GATE-FAILED",
);
assert.equal(
  evaluateDecision({
    source,
    finalSource: {
      ...source,
      workingTreeFingerprint: "c".repeat(64),
    },
    stages: passed,
  }).decision,
  "NO-GO-SOURCE-CHANGED-DURING-RUN",
);

const partialEvidence = buildLaunchEvidence({
  capturedAt: "2026-07-19T00:00:00.000Z",
  source,
  immutable: false,
  localReady: true,
  stages: stages.map((item) => ({ id: item.id, status: "pass" })),
});
assert.equal(partialEvidence.version, "matterhorn.launch-channel-evidence.v1");
assert.equal(partialEvidence.common.gates["code.app_suite"].status, "pass");
assert.equal(partialEvidence.common.gates["code.typechecks"].status, "pass");
assert.equal(partialEvidence.common.gates["release.exact_commit"].status, "pending");
assert.equal(partialEvidence.channels["public-beta"].gates.constructor, Object);

const fingerprintRepo = mkdtempSync(join(tmpdir(), "matterhorn-candidate-fingerprint-"));
const git = (...args) =>
  spawnSync("git", args, {
    cwd: fingerprintRepo,
    encoding: "utf8",
  });
assert.equal(git("init").status, 0);
assert.equal(git("config", "user.email", "release-test@example.invalid").status, 0);
assert.equal(git("config", "user.name", "Release Test").status, 0);
writeFileSync(join(fingerprintRepo, "source.txt"), "one\n");
assert.equal(git("add", "source.txt").status, 0);
assert.equal(git("commit", "-m", "fixture").status, 0);
const cleanIdentity = getSourceIdentity(fingerprintRepo);
mkdirSync(join(fingerprintRepo, "qa-reports"), { recursive: true });
writeFileSync(join(fingerprintRepo, "qa-reports", "evidence.json"), "{}\n");
mkdirSync(join(fingerprintRepo, "outputs"), { recursive: true });
writeFileSync(join(fingerprintRepo, "outputs", "generated.json"), "{}\n");
const evidenceIdentity = getSourceIdentity(fingerprintRepo);
assert.equal(evidenceIdentity.workingTreeFingerprint, cleanIdentity.workingTreeFingerprint);
assert.equal(evidenceIdentity.dirty, false);
assert.equal(evidenceIdentity.preserveOnlyPathCount, 2);
writeFileSync(join(fingerprintRepo, "source.txt"), "two\n");
const changedIdentity = getSourceIdentity(fingerprintRepo);
assert.notEqual(changedIdentity.workingTreeFingerprint, cleanIdentity.workingTreeFingerprint);
assert.equal(changedIdentity.dirty, true);
writeFileSync(join(fingerprintRepo, "source.txt"), `${"release-sized-diff\n".repeat(70_000)}`);
const largeDiffIdentity = getSourceIdentity(fingerprintRepo);
assert.equal(largeDiffIdentity.dirty, true);
assert.notEqual(
  largeDiffIdentity.workingTreeFingerprint,
  changedIdentity.workingTreeFingerprint,
);

const outputDir = mkdtempSync(join(tmpdir(), "matterhorn-candidate-stage-"));
const success = await executeStage(
  {
    id: "success",
    label: "Success",
    command: [process.execPath, "-e", "console.log('ok')"],
    timeoutMs: 1000,
  },
  { repoRoot: process.cwd(), outputDir, source },
);
assert.equal(success.status, "pass");
assert.match(readFileSync(join(outputDir, success.logFile), "utf8"), /ok/);
assert.equal(success.logSha256.length, 64);
assert.equal(reusableStage(success, {
  id: "success",
  command: [process.execPath, "-e", "console.log('ok')"],
}, source, outputDir), true);

const failure = await executeStage(
  {
    id: "failure",
    label: "Failure",
    command: [process.execPath, "-e", "process.exit(7)"],
    timeoutMs: 1000,
  },
  { repoRoot: process.cwd(), outputDir, source },
);
assert.equal(failure.status, "fail");
assert.equal(failure.exitCode, 7);

const timeout = await executeStage(
  {
    id: "timeout",
    label: "Timeout",
    command: [process.execPath, "-e", "setTimeout(() => {}, 5000)"],
    timeoutMs: 100,
  },
  { repoRoot: process.cwd(), outputDir, source },
);
assert.equal(timeout.status, "timeout");

const dryRunDir = mkdtempSync(join(tmpdir(), "matterhorn-candidate-dry-run-"));
const cli = spawnSync(
  process.execPath,
  [
    "scripts/public-beta-candidate-certifier.mjs",
    "--dry-run",
    "--skip-browser",
    "--output-dir",
    dryRunDir,
    "--json",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(cli.status, 0, cli.stderr);
const report = JSON.parse(cli.stdout);
assert.equal(report.version, REPORT_VERSION);
assert.equal(report.decision, "DRY-RUN");
assert.equal(report.publicReady, false);
assert.ok(report.externalGates.length >= 5);
assert.equal(report.channelReadiness.decision, "NO-GO");
assert.ok(report.channelReadiness.counts.blocked > 0);
assert.equal(
  report.artifacts.candidateManifest,
  "release-candidate-manifest/release-candidate-manifest.json",
);
assert.equal(report.artifacts.launchEvidence, "launch-evidence.local.json");
assert.equal(report.integrity.algorithm, "sha256");
assert.equal(report.integrity.digest.length, 64);
assert.ok(report.stages.every((item) => item.status === "planned"));
const markdown = readFileSync(join(dryRunDir, "candidate-certification.md"), "utf8");
assert.doesNotMatch(markdown, /undefined/);
assert.match(markdown, /Public-beta gates: \d+ passed, \d+ blocked, \d+ expired/);
assert.match(markdown, /Launch scope and deferred features are frozen/);

console.log("public beta candidate certifier tests passed");
