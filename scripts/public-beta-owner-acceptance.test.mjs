#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(
  packageJson.scripts["public-beta:owner-acceptance"],
  "node scripts/public-beta-owner-acceptance.mjs",
);
assert.equal(
  packageJson.scripts["test:public-beta-owner-acceptance"],
  "node scripts/public-beta-owner-acceptance.test.mjs",
);
const separatorHelp = spawnSync(process.execPath, [
  "scripts/public-beta-owner-acceptance.mjs",
  "--",
  "--help",
], { encoding: "utf8" });
assert.equal(separatorHelp.status, 0, separatorHelp.stderr || separatorHelp.stdout);
assert.match(separatorHelp.stdout, /Matterhorn Public Beta owner acceptance/);

const now = "2026-07-20T12:00:00.000Z";
const commitTime = "2026-07-20T11:00:00.000Z";
const dir = mkdtempSync(join(tmpdir(), "matterhorn-public-beta-owner-"));
const repo = join(dir, "repo");
const reportsDir = join(dir, "reports");
const evidenceDir = join(dir, "evidence");
const inputPath = join(dir, "owner-input.json");
const outputDir = join(dir, "output");
mkdirSync(repo, { recursive: true });
mkdirSync(reportsDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function withIntegrity(value) {
  return {
    ...value,
    integrity: {
      algorithm: "sha256",
      digest: createHash("sha256").update(stableJson(value)).digest("hex"),
    },
  };
}

function writeJson(name, value) {
  const path = join(reportsDir, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return path;
}

function evidence(name) {
  const path = join(evidenceDir, name);
  writeFileSync(path, `${name} passed at ${commitTime}\n`);
  return path;
}

function passingCheck(id, value = "verified") {
  return { id, status: "pass", evidence: value };
}

function run(input) {
  writeFileSync(inputPath, `${JSON.stringify(input, null, 2)}\n`);
  return spawnSync(process.execPath, [
    "scripts/public-beta-owner-acceptance.mjs",
    "--input", inputPath,
    "--output-dir", outputDir,
    "--repo-root", repo,
    "--now", now,
    "--strict",
    "--json",
  ], { encoding: "utf8" });
}

try {
  execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "release@example.invalid"], { cwd: repo });
  execFileSync("git", ["config", "user.name", "Release Test"], { cwd: repo });
  writeFileSync(join(repo, "candidate.txt"), "candidate\n");
  execFileSync("git", ["add", "candidate.txt"], { cwd: repo });
  execFileSync("git", ["commit", "-m", "candidate"], { cwd: repo, stdio: "ignore" });
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const tag = "v0.13.13-public-beta-rc.test";
  execFileSync("git", ["tag", "-a", tag, "-m", "Public Beta test candidate"], { cwd: repo });

  const commonGateIds = [
    "scope.freeze",
    "release.exact_commit",
    "code.app_suite",
    "code.server_suite",
    "code.typechecks",
    "code.production_build",
    "code.platform_safety",
    "security.dependency_audit",
    "security.desktop_trust_boundary",
    "ux.local_responsive_acceptance",
    "product.deferred_features_hidden",
  ];
  const launchEvidencePath = writeJson("launch-evidence.local.json", {
    version: "matterhorn.launch-channel-evidence.v1",
    capturedAt: commitTime,
    commit,
    common: {
      gates: Object.fromEntries(commonGateIds.map((id) => [id, {
        status: "pass",
        evidence: `candidate#${id}`,
      }])),
    },
    channels: { "public-beta": { gates: {} } },
  });
  const candidatePath = writeJson("candidate.json", withIntegrity({
    version: "matterhorn.public-beta-candidate-certifier.v1",
    capturedAt: commitTime,
    decision: "LOCAL-GREEN-OWNER-GATES-PENDING",
    technicalGatesPass: true,
    sourceStable: true,
    localReady: true,
    immutable: true,
    readyForOwnerGates: true,
    publicReady: false,
    source: { head: commit, dirty: false },
    finalSource: { head: commit, dirty: false },
    stages: [],
    artifacts: { launchEvidence: launchEvidencePath },
  }));
  const approvalPath = writeJson("owner-approval.json", {
    version: "matterhorn.release-owner-approval.v1",
    capturedAt: commitTime,
    candidate: { commit, tag, tagResolvesToCommit: true },
    scope: {
      status: "frozen",
      channel: "public-beta",
      deferredFeaturesRemainHidden: true,
    },
  });

  const deploymentIds = [
    "https", "app_response", "api_health", "api_build_commit",
    "cors_trusted_origin", "cors_vary_origin", "cors_untrusted_origin",
    "app_nosniff", "app_referrer", "app_permissions", "app_framing", "app_hsts",
    "api_nosniff", "api_referrer", "api_permissions", "api_framing", "api_hsts",
    "app_workspace_proxy_origin", "app_workspace_proxy",
    "app_engine_proxy_origin", "app_engine_proxy",
  ];
  const deploymentPath = writeJson("deployment.json", {
    version: "matterhorn.product-hunt-deployment-probe.v1",
    ready: true,
    metadata: {
      generatedAt: commitTime,
      appUrl: "https://app.matterhorn.example/",
      serverUrl: "https://api.matterhorn.example/",
      expectedCommit: commit,
      localContractRun: false,
    },
    checks: deploymentIds.map((id) => passingCheck(id)),
  });

  const monitoringEvidence = evidence("monitoring.md");
  const backupEvidence = evidence("backup.md");
  const recoveryEvidence = evidence("recovery.md");
  const rollbackEvidence = evidence("rollback.md");
  const operationsPath = writeJson("operations.json", {
    version: "matterhorn.product-hunt-operations-readiness.v2",
    ready: true,
    decision: "GO",
    commit,
    evaluatedAt: commitTime,
    checks: [
      passingCheck("monitoring_status", monitoringEvidence),
      passingCheck("monitoring_dashboard"),
      passingCheck("monitoring_health"),
      passingCheck("monitoring_errors"),
      passingCheck("monitoring_latency"),
      passingCheck("monitoring_providerFailures"),
      passingCheck("monitoring_alert_test"),
      passingCheck("backup_status", backupEvidence),
      passingCheck("backup_secret_exclusion"),
      passingCheck("backup_hash"),
      passingCheck("backup_separate_target"),
      passingCheck("backup_verified"),
      passingCheck("user_data_recovery_status", recoveryEvidence),
      passingCheck("user_data_recovery_encrypted"),
      passingCheck("user_data_recovery_hash"),
      passingCheck("user_data_recovery_notes"),
      passingCheck("user_data_recovery_memory"),
      passingCheck("user_data_recovery_outputs"),
      passingCheck("user_data_recovery_taskAndEvidenceState"),
      passingCheck("user_data_recovery_chatHistory"),
      passingCheck("user_data_recovery_separate_target"),
      passingCheck("user_data_recovery_verified"),
      passingCheck("user_data_recovery_sqlite"),
      passingCheck("rollback_status", rollbackEvidence),
      passingCheck("rollback_refs"),
      passingCheck("rollback_health"),
      passingCheck("rollback_owner"),
    ],
  });

  const guardedShadowPath = writeJson("guarded-shadow.json", withIntegrity({
    version: "matterhorn.guarded-runtime-shadow-evidence.v1",
    decision: "GO",
    ready: true,
    commit,
    serverOrigin: "https://api.matterhorn.example",
    evaluatedAt: commitTime,
    window: {
      startedAt: "2026-07-18T10:50:00.000Z",
      endedAt: "2026-07-20T11:00:00.000Z",
      hours: 48.167,
      processUptimeDeltaSeconds: 173400,
    },
    checks: [
      "baseline_integrity",
      "final_integrity",
      "same_commit",
      "same_origin",
      "shadow_ready",
      "snapshot_time",
      "window_duration",
      "uninterrupted_process",
      "counter_monotonicity",
      "shadow_decision_shape",
      "issue_exercised",
      "consume_exercised",
      "read_exercised",
      "prepare_exercised",
      "anomaly_review",
    ].map((id) => passingCheck(id)),
    blockers: [],
  }));

  const acceptanceEvidence = Object.fromEntries([
    "new-user.md",
    "existing-user.md",
    "metamask.md",
    "coinbase.md",
    "phantom.md",
    "hyperliquid.md",
    "notion.md",
  ].map((name) => [name, evidence(name)]));
  const acceptancePath = writeJson("acceptance.json", {
    version: "matterhorn.product-hunt-acceptance-readiness.v1",
    ready: true,
    decision: "GO",
    commit,
    evaluatedAt: commitTime,
    acceptedOauthConnectors: ["notion"],
    checks: [
      passingCheck("evidence_fresh", commitTime),
      passingCheck("deployed_https", "https://app.matterhorn.example/"),
      passingCheck("newUser_journey", acceptanceEvidence["new-user.md"]),
      passingCheck("existingUser_journey", acceptanceEvidence["existing-user.md"]),
      passingCheck("metamask_journey", acceptanceEvidence["metamask.md"]),
      passingCheck("coinbase_journey", acceptanceEvidence["coinbase.md"]),
      passingCheck("phantom_sui_journey", acceptanceEvidence["phantom.md"]),
      passingCheck("hyperliquid_testnet_journey", acceptanceEvidence["hyperliquid.md"]),
      passingCheck("oauth_notion", acceptanceEvidence["notion.md"]),
      passingCheck("oauth_visible_set", "notion"),
    ],
  });

  const dmgHash = "a".repeat(64);
  const desktopPath = writeJson("desktop.json", {
    version: "matterhorn.desktop-public-release-verification.v1",
    ready: true,
    status: "pass",
    sourceCommit: commit,
    localContract: false,
    capturedAt: commitTime,
    artifacts: [
      { file: "Matterhorn-Desks.dmg", sha256: dmgHash },
      { file: "Matterhorn-Desks.zip", sha256: "b".repeat(64) },
    ],
    checks: [],
  });

  const baseInput = {
    version: "matterhorn.public-beta-owner-acceptance-input.v1",
    capturedAt: commitTime,
    commit,
    tag,
    expectedOauthConnectors: ["notion"],
    reports: {
      candidate: candidatePath,
      ownerApproval: approvalPath,
      deployment: deploymentPath,
      operations: operationsPath,
      guardedShadow: guardedShadowPath,
      acceptance: acceptancePath,
      desktop: desktopPath,
    },
    manual: {
      exposedKeyRotation: {
        status: "pass",
        allExposedKeysRevoked: true,
        replacementsInSecretStore: true,
        owner: "Security owner",
        reviewedAt: commitTime,
        reportPath: evidence("rotation.md"),
      },
      cleanInstall: {
        status: "pass",
        cleanInstall: true,
        update: true,
        reinstall: true,
        tester: "Desktop tester",
        testedAt: commitTime,
        reportPath: evidence("clean-install.md"),
      },
      publicDownload: {
        status: "pass",
        url: "https://downloads.matterhorn.example/Matterhorn-Desks.dmg",
        artifactFile: "Matterhorn-Desks.dmg",
        sha256: dmgHash,
        resolvesToCandidate: true,
        reportPath: evidence("public-download.md"),
      },
      legal: {
        status: "pass",
        approver: "Legal owner",
        approvedAt: commitTime,
        privacyUrl: "https://matterhorn.example/privacy",
        termsUrl: "https://matterhorn.example/terms",
        supportUrl: "https://matterhorn.example/support",
        reportPath: evidence("legal.md"),
      },
      support: {
        status: "pass",
        owner: "Support owner",
        channelUrl: "https://matterhorn.example/support",
        responseTarget: "One business day",
        reportPath: evidence("support.md"),
      },
      launchRoom: {
        status: "pass",
        incidentCommander: "IC",
        rollbackOwner: "Rollback owner",
        securityOwner: "Security owner",
        supportOwner: "Support owner",
        channelUrl: "https://matterhorn.example/launch-room",
        reportPath: evidence("launch-room.md"),
      },
    },
  };

  const passing = run(baseInput);
  assert.equal(passing.status, 0, passing.stderr || passing.stdout);
  const passingReport = JSON.parse(passing.stdout);
  assert.equal(passingReport.decision, "GO");
  assert.equal(passingReport.ready, true);
  assert.equal(passingReport.commit, commit);
  assert.equal(passingReport.launchReadiness.blocked, 0);
  assert.ok(readFileSync(join(outputDir, "launch-readiness.md"), "utf8").includes("**Decision:** GO"));

  const blockedShadowPath = writeJson("guarded-shadow-blocked.json", withIntegrity({
    version: "matterhorn.guarded-runtime-shadow-evidence.v1",
    decision: "NO-GO",
    ready: false,
    commit,
    evaluatedAt: commitTime,
    window: { hours: 24 },
    checks: [{ id: "window_duration", status: "fail", evidence: 24 }],
    blockers: [{ id: "window_duration", action: "Shadow observation is at least 48 hours" }],
  }));
  const blockedShadow = run({
    ...baseInput,
    reports: { ...baseInput.reports, guardedShadow: blockedShadowPath },
  });
  assert.equal(blockedShadow.status, 1);
  assert.ok(JSON.parse(blockedShadow.stdout).blockers.some((entry) => entry.gate === "agent.guarded_shadow_window"));

  const noOauthAcceptancePath = writeJson("acceptance-no-oauth.json", {
    version: "matterhorn.product-hunt-acceptance-readiness.v1",
    ready: false,
    decision: "NO-GO",
    commit,
    evaluatedAt: commitTime,
    acceptedOauthConnectors: [],
    checks: [
      passingCheck("evidence_fresh", commitTime),
      passingCheck("oauth_visible_set", "none"),
      { id: "deployed_https", status: "fail", evidence: null },
      { id: "newUser_journey", status: "fail", evidence: null },
      { id: "existingUser_journey", status: "fail", evidence: null },
      { id: "metamask_journey", status: "fail", evidence: null },
      { id: "coinbase_journey", status: "fail", evidence: null },
      { id: "phantom_sui_journey", status: "fail", evidence: null },
      { id: "hyperliquid_testnet_journey", status: "fail", evidence: null },
    ],
  });
  const noOauth = run({
    ...baseInput,
    expectedOauthConnectors: [],
    reports: {
      ...baseInput.reports,
      acceptance: noOauthAcceptancePath,
    },
  });
  assert.equal(noOauth.status, 1);
  const noOauthReport = JSON.parse(noOauth.stdout);
  assert.equal(
    noOauthReport.checks.find(({ id }) => id === "oauth_acceptance")?.status,
    "pass",
  );
  assert.equal(
    noOauthReport.checks.find(({ id }) => id === "evm_wallet_acceptance")?.status,
    "fail",
  );

  const blocked = run({
    ...baseInput,
    manual: {
      ...baseInput.manual,
      cleanInstall: { ...baseInput.manual.cleanInstall, update: false },
    },
  });
  assert.equal(blocked.status, 1);
  assert.ok(JSON.parse(blocked.stdout).blockers.some((entry) => entry.gate === "desktop.clean_install"));

  const stale = run({ ...baseInput, capturedAt: "2026-07-19T00:00:00.000Z" });
  assert.equal(stale.status, 1);
  assert.ok(JSON.parse(stale.stdout).blockers.some((entry) => entry.id === "owner_input_fresh"));

  const unsafe = run({
    ...baseInput,
    manual: { ...baseInput.manual, exposedKeyRotation: { ...baseInput.manual.exposedKeyRotation, apiKey: "never" } },
  });
  assert.equal(unsafe.status, 1);
  assert.match(unsafe.stderr, /Credential or signing material is not allowed/);

  const disguisedSecret = run({
    ...baseInput,
    manual: { ...baseInput.manual, notes: "sk-this-is-a-secret-value-that-must-not-be-stored" },
  });
  assert.equal(disguisedSecret.status, 1);
  assert.match(disguisedSecret.stderr, /Credential or signing material is not allowed/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("Public Beta owner acceptance contract passed.");
