#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const VERSION = "matterhorn.product-hunt-operations-evidence.v2";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function parseArgs(argv) {
  const config = { evidence: "", strict: false, json: false, jsonOutput: "", now: new Date(), help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--evidence") config.evidence = next();
    else if (arg === "--json-output") config.jsonOutput = next();
    else if (arg === "--now") config.now = new Date(next());
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json") config.json = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!config.help && !config.evidence) throw new Error("--evidence is required.");
  return config;
}

function help() {
  return [
    "Matterhorn Product Hunt operations evidence gate",
    "",
    "Validates fresh monitoring, backup/restore, and rollback evidence. It never runs a release or accepts credentials.",
    "",
    "Usage:",
    "  pnpm gate:product-hunt-operations -- --evidence operations.json --json --strict",
  ].join("\n");
}

function rejectSecrets(value, path = "evidence") {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectSecrets(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (/token|authorization|api.?key|secret|private.?key|seed|mnemonic|signature|wallet.?export/i.test(key)) {
      throw new Error(`Credential-shaped evidence key is not allowed: ${path}.${key}`);
    }
    rejectSecrets(item, `${path}.${key}`);
  }
}

function present(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function check(id, label, pass, evidence) {
  return { id, label, status: pass ? "pass" : "fail", evidence: present(evidence) ? evidence : null };
}

function evaluate(input, now) {
  if (input.version !== VERSION) throw new Error(`Evidence version must be ${VERSION}.`);
  rejectSecrets(input);
  const capturedAt = new Date(input.capturedAt);
  const fresh = Number.isFinite(capturedAt.getTime()) && now.getTime() >= capturedAt.getTime() - 60_000 && now.getTime() - capturedAt.getTime() <= MAX_AGE_MS;
  const monitoring = input.monitoring ?? {};
  const alertTest = monitoring.alertTest ?? {};
  const backup = input.backupRestore ?? {};
  const userDataRecovery = input.userDataRecovery ?? {};
  const rollback = input.rollback ?? {};
  const requiredUserDataCoverage = ["notes", "memory", "outputs", "taskAndEvidenceState", "chatHistory"];
  const checks = [
    check("evidence_commit", "Evidence identifies the exact candidate commit", /^[a-f0-9]{40}$/i.test(input.commit ?? ""), input.commit),
    check("evidence_fresh", "Evidence is no more than 12 hours old", fresh, input.capturedAt),
    check("monitoring_status", "Monitoring is active", monitoring.status === "pass", monitoring.reportPath),
    check("monitoring_dashboard", "Monitoring dashboard uses HTTPS", /^https:\/\//.test(monitoring.dashboardUrl ?? ""), monitoring.dashboardUrl),
    ...["health", "errors", "latency", "providerFailures"].map((key) => check(`monitoring_${key}`, `Monitoring covers ${key}`, present(monitoring.signals?.[key]), monitoring.signals?.[key])),
    check(
      "monitoring_alert_test",
      "Alert delivery test passed",
      alertTest.status === "pass" && present(alertTest.testedAt) && present(alertTest.channel),
      alertTest.testedAt,
    ),
    check("backup_status", "Backup and restore drill passed", backup.status === "pass", backup.reportPath),
    check("backup_secret_exclusion", "Backup excluded sensitive configuration", backup.sensitiveMode === "exclude", backup.sensitiveMode),
    check("backup_hash", "Backup has a SHA-256 digest", /^[a-f0-9]{64}$/i.test(backup.sha256 ?? ""), backup.sha256),
    check("backup_separate_target", "Restore used a separate workspace", present(backup.sourceWorkspaceId) && present(backup.targetWorkspaceId) && backup.sourceWorkspaceId !== backup.targetWorkspaceId, `${backup.sourceWorkspaceId ?? ""} -> ${backup.targetWorkspaceId ?? ""}`),
    check("backup_verified", "Restored state was verified", backup.verified === true, backup.verified),
    check("user_data_recovery_status", "Encrypted user-data recovery drill passed", userDataRecovery.status === "pass", userDataRecovery.restoreReportPath),
    check("user_data_recovery_encrypted", "User-data backup is authenticated and encrypted", userDataRecovery.encrypted === true, userDataRecovery.encrypted),
    check("user_data_recovery_hash", "Encrypted user-data archive has a SHA-256 digest", /^[a-f0-9]{64}$/i.test(userDataRecovery.archiveSha256 ?? ""), userDataRecovery.archiveSha256),
    ...requiredUserDataCoverage.map((key) => check(
      `user_data_recovery_${key}`,
      `User-data recovery covers ${key}`,
      userDataRecovery.coverage?.[key] === true,
      userDataRecovery.coverage?.[key],
    )),
    check("user_data_recovery_separate_target", "User data restored to a separate target", userDataRecovery.separateTarget === true, userDataRecovery.separateTarget),
    check("user_data_recovery_verified", "Every restored user-data file was digest-verified", userDataRecovery.restoreVerified === true, userDataRecovery.restoreVerified),
    check("user_data_recovery_sqlite", "Restored chat database passed SQLite integrity verification", userDataRecovery.sqliteIntegrityVerified === true, userDataRecovery.sqliteIntegrityVerified),
    check("rollback_status", "Rollback drill passed", rollback.status === "pass", rollback.reportPath),
    check("rollback_refs", "Rollback moved between immutable commits", /^[a-f0-9]{40}$/i.test(rollback.fromCommit ?? "") && /^[a-f0-9]{40}$/i.test(rollback.toCommit ?? "") && rollback.fromCommit !== rollback.toCommit, `${rollback.fromCommit ?? ""} -> ${rollback.toCommit ?? ""}`),
    check("rollback_health", "Health was verified after rollback", rollback.healthVerified === true, rollback.healthVerifiedAt),
    check("rollback_owner", "Rollback owner is named", present(rollback.owner), rollback.owner),
  ];
  const blockers = checks.filter((item) => item.status === "fail").map(({ id, label }) => ({ id, action: label }));
  return { version: "matterhorn.product-hunt-operations-readiness.v2", decision: blockers.length ? "NO-GO" : "GO", ready: blockers.length === 0, commit: input.commit ?? null, evaluatedAt: now.toISOString(), checks, blockers };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) return process.stdout.write(`${help()}\n`);
  const input = JSON.parse(readFileSync(config.evidence, "utf8"));
  const report = evaluate(input, config.now);
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Product Hunt operations: ${report.decision}\n`);
  if (config.strict && !report.ready) process.exitCode = 1;
}

try { main(); } catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
