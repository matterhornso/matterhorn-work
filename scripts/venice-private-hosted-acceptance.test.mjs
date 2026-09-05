#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts["gate:venice-private-acceptance"], "node scripts/venice-private-hosted-acceptance.mjs");
assert.equal(packageJson.scripts["template:venice-private-acceptance"], "node scripts/venice-private-hosted-acceptance.mjs template");
assert.equal(packageJson.scripts["test:venice-private-acceptance"], "node scripts/venice-private-hosted-acceptance.test.mjs");

const commit = "a".repeat(40);
const now = "2026-09-05T12:00:00.000Z";
const dir = mkdtempSync(join(tmpdir(), "matterhorn-venice-private-"));
const reports = join(dir, "reports");
const inputPath = join(dir, "acceptance.json");
mkdirSync(reports, { recursive: true });

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function report(name, text) {
  const path = join(reports, `${name}.md`);
  writeFileSync(path, `${text}\n`);
  return { path: `reports/${name}.md`, sha256: sha256(path) };
}

function run(input) {
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  return runPath(inputPath);
}

function runPath(path) {
  return spawnSync(process.execPath, [
    "scripts/venice-private-hosted-acceptance.mjs",
    "--input", path,
    "--expected-commit", commit,
    "--now", now,
    "--strict",
    "--json",
  ], { encoding: "utf8" });
}

function passingInput() {
  return {
    version: "matterhorn.venice-private-hosted-acceptance.v1",
    capturedAt: "2026-09-05T11:30:00.000Z",
    commit,
    frontendCommit: commit,
    backendCommit: commit,
    appUrl: "https://candidate.matterhorn.example/workspace/test/session",
    provider: {
      status: "pass",
      id: "venice",
      modelId: "venice-private-tools-v1",
      proofVerifiedAt: "2026-09-05T10:00:00.000Z",
      proofExpiresAt: "2026-09-06T10:00:00.000Z",
      policyStatus: "verified_no_training",
      trainingUse: "none",
      retentionDays: 0,
      selectedFromExactProof: true,
      browserCredentialAbsent: true,
    },
    ui: {
      status: "pass",
      setupState: true,
      unavailableState: true,
      toggleKeyboardOperable: true,
      verifiedOffState: true,
      verifiedOnState: true,
      busyState: true,
      disclosureVisible: true,
    },
    requests: {
      status: "pass",
      privateRequestCompleted: true,
      privateWorkspaceModeBound: true,
      receiptProviderMatches: true,
      receiptZeroRetention: true,
      modelSubstitutionBlocked: true,
      expiredProofBlocked: true,
      refreshFailureBlocked: true,
      secretBlockedBeforeProvider: true,
      zeroUsageOnSecretBlock: true,
      zeroProviderCallsOnSecretBlock: true,
      crossAccountBlocked: true,
      reloadRestored: true,
    },
    evidence: {
      provider: report("provider", "Current proof and exact model intersection verified."),
      ui: report("ui", "Keyboard and visible Private control states verified."),
      requests: report("requests", "Private dispatch, blocking, receipts, reload, and isolation verified."),
    },
  };
}

try {
  const help = spawnSync(process.execPath, ["scripts/venice-private-hosted-acceptance.mjs", "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Venice Private hosted acceptance/);

  const templatePath = join(dir, "template.json");
  const template = spawnSync(process.execPath, [
    "scripts/venice-private-hosted-acceptance.mjs", "template",
    "--expected-commit", commit,
    "--app-url", "https://candidate.matterhorn.example/workspace/test",
    "--output", templatePath,
    "--now", now,
  ], { encoding: "utf8" });
  assert.equal(template.status, 0, template.stderr);
  assert.equal(statSync(templatePath).mode & 0o777, 0o600);
  assert.equal(JSON.parse(readFileSync(templatePath, "utf8")).provider.status, "pending");
  const overwrite = spawnSync(process.execPath, [
    "scripts/venice-private-hosted-acceptance.mjs", "template",
    "--expected-commit", commit,
    "--app-url", "https://candidate.matterhorn.example/workspace/test",
    "--output", templatePath,
    "--now", now,
  ], { encoding: "utf8" });
  assert.equal(overwrite.status, 1);
  assert.match(overwrite.stderr, /already exists/);

  const passing = run(passingInput());
  assert.equal(passing.status, 0, passing.stderr || passing.stdout);
  const ready = JSON.parse(passing.stdout);
  assert.equal(ready.decision, "GO");
  assert.equal(ready.ready, true);
  assert.equal(ready.checks.length, 6);
  assert.equal(JSON.stringify(ready).includes("reports/"), false);

  for (const mutate of [
    (input) => { input.frontendCommit = "b".repeat(40); },
    (input) => { input.provider.selectedFromExactProof = false; },
    (input) => { input.provider.proofExpiresAt = input.capturedAt; },
    (input) => { input.ui.toggleKeyboardOperable = false; },
    (input) => { input.requests.zeroProviderCallsOnSecretBlock = false; },
    (input) => { input.requests.crossAccountBlocked = false; },
  ]) {
    const input = passingInput();
    mutate(input);
    const failed = run(input);
    assert.equal(failed.status, 1);
    assert.equal(JSON.parse(failed.stdout).decision, "NO-GO");
  }

  const unsafeUrl = passingInput();
  unsafeUrl.appUrl = "http://localhost:3000";
  const unsafeUrlResult = run(unsafeUrl);
  assert.equal(unsafeUrlResult.status, 1);
  assert.match(unsafeUrlResult.stderr, /deployed HTTPS URL/);

  const unknownField = passingInput();
  unknownField.provider.runtimeToken = "redacted";
  const unknownResult = run(unknownField);
  assert.equal(unknownResult.status, 1);
  assert.match(unknownResult.stderr, /unsupported field/);

  const duplicateEvidence = passingInput();
  duplicateEvidence.evidence.ui = duplicateEvidence.evidence.provider;
  const duplicateResult = run(duplicateEvidence);
  assert.equal(duplicateResult.status, 1);
  assert.match(duplicateResult.stderr, /distinct evidence file/);

  const secretInput = passingInput();
  const secretReportPath = join(reports, "requests-secret.md");
  writeFileSync(secretReportPath, "authorization: Bearer abcdefghijklmnopqrstuvwxyz\n");
  secretInput.evidence.requests = { path: "reports/requests-secret.md", sha256: sha256(secretReportPath) };
  const secretResult = run(secretInput);
  assert.equal(secretResult.status, 1);
  assert.match(secretResult.stderr, /forbidden in acceptance evidence/);

  const outsidePath = join(dir, "..", `matterhorn-venice-outside-${process.pid}.md`);
  writeFileSync(outsidePath, "outside\n");
  const traversalInput = passingInput();
  traversalInput.evidence.ui = { path: `../${basename(outsidePath)}`, sha256: sha256(outsidePath) };
  const traversalResult = run(traversalInput);
  assert.equal(traversalResult.status, 1);
  assert.match(traversalResult.stderr, /remain inside/);
  rmSync(outsidePath, { force: true });

  const targetPath = join(reports, "symlink-target.md");
  const symlinkPath = join(reports, "symlink.md");
  writeFileSync(targetPath, "symlink target\n");
  symlinkSync(targetPath, symlinkPath);
  const symlinkInput = passingInput();
  symlinkInput.evidence.ui = { path: "reports/symlink.md", sha256: sha256(targetPath) };
  const symlinkResult = run(symlinkInput);
  assert.equal(symlinkResult.status, 1);
  assert.match(symlinkResult.stderr, /non-symlink/);

  const duplicateInputPath = join(dir, "duplicate-input.json");
  writeFileSync(duplicateInputPath, `{"version":"matterhorn.venice-private-hosted-acceptance.v1","version":"duplicate"}\n`);
  const duplicateInputResult = runPath(duplicateInputPath);
  assert.equal(duplicateInputResult.status, 1);
  assert.match(duplicateInputResult.stderr, /duplicate JSON key/);

  const invalidUtf8InputPath = join(dir, "invalid-utf8-input.json");
  writeFileSync(invalidUtf8InputPath, Buffer.from([0xc3, 0x28]));
  const invalidUtf8InputResult = runPath(invalidUtf8InputPath);
  assert.equal(invalidUtf8InputResult.status, 1);
  assert.match(invalidUtf8InputResult.stderr, /valid UTF-8 JSON/);

  const oversizedInputPath = join(dir, "oversized-input.json");
  writeFileSync(oversizedInputPath, Buffer.alloc(256 * 1024 + 1, 0x20));
  const oversizedInputResult = runPath(oversizedInputPath);
  assert.equal(oversizedInputResult.status, 1);
  assert.match(oversizedInputResult.stderr, /no larger than 256 KiB/);

  const linkedInputPath = join(dir, "linked-input.json");
  symlinkSync(inputPath, linkedInputPath);
  const linkedInputResult = runPath(linkedInputPath);
  assert.equal(linkedInputResult.status, 1);
  assert.match(linkedInputResult.stderr, /regular non-symlink/);

  process.stdout.write("Venice Private hosted acceptance tests passed.\n");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
