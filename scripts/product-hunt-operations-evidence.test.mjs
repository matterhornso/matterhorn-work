#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "matterhorn-operations-evidence-"));
const path = join(dir, "evidence.json");
const now = "2026-07-20T12:00:00.000Z";
const base = {
  version: "matterhorn.product-hunt-operations-evidence.v2",
  commit: "d".repeat(40),
  capturedAt: "2026-07-20T11:00:00.000Z",
  monitoring: {
    status: "pass", dashboardUrl: "https://monitoring.example/matterhorn", reportPath: "monitoring.json",
    alertTest: { status: "pass", testedAt: "2026-07-20T11:30:00.000Z", channel: "release-alerts" },
    signals: { health: "uptime", errors: "5xx rate", latency: "p95", providerFailures: "provider error rate" },
  },
  backupRestore: {
    status: "pass", reportPath: "backup.json", sensitiveMode: "exclude", sha256: "a".repeat(64), sourceWorkspaceId: "ws_prod", targetWorkspaceId: "ws_restore", verified: true,
  },
  userDataRecovery: {
    status: "pass",
    backupReportPath: "user-data-backup.json",
    restoreReportPath: "user-data-restore.json",
    encrypted: true,
    archiveSha256: "e".repeat(64),
    coverage: { notes: true, memory: true, outputs: true, taskAndEvidenceState: true, chatHistory: true },
    separateTarget: true,
    restoreVerified: true,
    sqliteIntegrityVerified: true,
  },
  rollback: {
    status: "pass", reportPath: "rollback.json", fromCommit: "b".repeat(40), toCommit: "c".repeat(40), healthVerified: true, healthVerifiedAt: "2026-07-20T11:40:00.000Z", owner: "Release owner",
  },
};

function run(value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/product-hunt-operations-evidence.mjs", "--evidence", path, "--now", now, "--strict", "--json"], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

try {
  const pass = await run(base);
  assert.equal(pass.code, 0, pass.stderr || pass.stdout);
  const report = JSON.parse(pass.stdout);
  assert.equal(report.decision, "GO");
  assert.equal(report.version, "matterhorn.product-hunt-operations-readiness.v2");
  assert.equal(report.ready, true);
  assert.equal(report.commit, base.commit);
  assert.deepEqual(report.blockers, []);

  const blocked = await run({ ...base, monitoring: { ...base.monitoring, dashboardUrl: "http://localhost:3000", signals: { ...base.monitoring.signals, latency: "" } } });
  assert.equal(blocked.code, 1);
  const blockedReport = JSON.parse(blocked.stdout);
  assert.equal(blockedReport.decision, "NO-GO");
  assert.ok(blockedReport.blockers.some((item) => item.id === "monitoring_dashboard"));
  assert.ok(blockedReport.blockers.some((item) => item.id === "monitoring_latency"));

  const failedAlert = await run({ ...base, monitoring: { ...base.monitoring, alertTest: { ...base.monitoring.alertTest, status: "fail" } } });
  assert.equal(failedAlert.code, 1);
  assert.ok(JSON.parse(failedAlert.stdout).blockers.some((item) => item.id === "monitoring_alert_test"));

  const incompleteRecovery = await run({
    ...base,
    userDataRecovery: {
      ...base.userDataRecovery,
      coverage: { ...base.userDataRecovery.coverage, chatHistory: false },
    },
  });
  assert.equal(incompleteRecovery.code, 1);
  assert.ok(JSON.parse(incompleteRecovery.stdout).blockers.some((item) => item.id === "user_data_recovery_chatHistory"));

  const secret = await run({ ...base, monitoring: { ...base.monitoring, apiToken: "never" } });
  assert.equal(secret.code, 1);
  assert.match(secret.stderr, /Credential-shaped evidence key/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("Product Hunt operations evidence contract passed.");
