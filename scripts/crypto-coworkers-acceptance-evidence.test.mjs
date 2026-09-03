#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "matterhorn-crypto-coworkers-acceptance-"));
const evidencePath = join(directory, "acceptance.json");
const now = "2026-09-03T12:00:00.000Z";
const commit = "a".repeat(40);
const constants = JSON.parse(readFileSync("constants.json", "utf8"));
const upstream = JSON.parse(readFileSync("upstream-compatibility.json", "utf8"));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function evidence(name) {
  const path = `${name}.md`;
  const content = `Redacted acceptance outcomes for ${name}.\n`;
  writeFileSync(join(directory, path), content);
  return { path, sha256: sha256(content) };
}

const coworkerCommon = {
  status: "pass",
  created: true,
  explicitResourceGrant: true,
  modelCompletion: true,
  runReceipt: true,
  tokenBudgetEnforced: true,
  pauseBlocksNewWork: true,
  revokeBlocksNewWork: true,
  crossTenantBlocked: true,
};

const input = {
  version: "matterhorn.crypto-coworkers-acceptance-evidence.v1",
  capturedAt: "2026-09-03T11:00:00.000Z",
  commit,
  environment: "deployed",
  appUrl: "https://matterhorn.example/workspace/example",
  runtime: {
    status: "pass",
    openworkVersion: constants.openworkUpstreamVersion,
    openworkCommit: upstream.openwork.commit,
    opencodeVersion: constants.opencodeVersion,
    opencodeCommit: upstream.opencode.commit,
    opencodeSdkVersion: constants.opencodeVersion.replace(/^v/, ""),
    permissionDenyByDefault: true,
    evidence: evidence("runtime"),
  },
  certifications: {
    sui: {
      status: "pass", network: "sui-testnet", liveRead: true, financialSimulation: true,
      sealedRuntimeReport: true, promoted: true, revisionPinned: true, noSubmitAuthority: true,
      evidence: evidence("certification-sui"),
    },
    hyperliquid: {
      status: "pass", network: "testnet", liveRead: true, orderPreview: true,
      sealedRuntimeReport: true, promoted: true, revisionPinned: true, noSubmitAuthority: true,
      evidence: evidence("certification-hyperliquid"),
    },
    bittensor: {
      status: "pass", network: "test", pythonSdkSidecar: true, liveRead: true,
      transferPreview: true, stakePreview: true, unstakePreview: true, sealedRuntimeReport: true,
      promoted: true, revisionPinned: true, noSubmitAuthority: true,
      evidence: evidence("certification-bittensor"),
    },
    polymarket: {
      status: "pass", network: "mainnet-public-readonly", signedManifests: true,
      liveDiscovery: true, liveOrderbook: true, sealedRuntimeReport: true, promoted: true,
      revisionPinned: true, noCredentialAuthority: true, noTransactionAuthority: true,
      evidence: evidence("certification-polymarket"),
    },
  },
  coworkers: {
    marketAnalyst: {
      ...coworkerCommon, publicResearch: true, citationsPreserved: true,
      evidence: evidence("coworker-market-analyst"),
    },
    riskMonitor: {
      ...coworkerCommon, watchCreated: true, alertCannotSubmit: true,
      evidence: evidence("coworker-risk-monitor"),
    },
    transactionCoordinator: {
      ...coworkerCommon, prepareOnly: true, walletReviewRequired: true,
      evidence: evidence("coworker-transaction-coordinator"),
    },
    treasuryCoworker: {
      ...coworkerCommon, structuredState: true, noWalletAuthority: true,
      evidence: evidence("coworker-treasury"),
    },
  },
  transactions: {
    sui: {
      status: "pass", network: "sui-testnet", prepare: true, simulate: true, reject: true,
      expire: true, tamperBlocked: true, refresh: true, walletOnly: true, receiptReconciled: true,
      evidence: evidence("transaction-sui"),
    },
    hyperliquid: {
      status: "pass", network: "testnet", prepare: true, simulate: true, reject: true,
      expire: true, tamperBlocked: true, refresh: true, walletOnly: true, receiptReconciled: true,
      evidence: evidence("transaction-hyperliquid"),
    },
    bittensor: {
      status: "pass", network: "test", transferPreview: true, stakePreview: true,
      unstakePreview: true, reject: true, expire: true, tamperBlocked: true, refresh: true,
      walletOnly: true, receiptReconciled: true, evidence: evidence("transaction-bittensor"),
    },
    polymarket: {
      status: "pass", network: "mainnet-public-readonly", discovery: true, orderbook: true,
      regionDisclosure: true, transactionAuthorityAbsent: true, safeDeferralVisible: true,
      evidence: evidence("transaction-polymarket-readonly"),
    },
  },
  encryptedEvidence: {
    status: "pass", explicitOptIn: true, ciphertextOnly: true, exactReadback: true,
    suiCertification: true, tamperBlocked: true, renewalWalletOnly: true, expiryBlocked: true,
    deleted: true, recoveryKeyDestroyed: true, publicScanNonIdentifying: true,
    restoreDrill: true, erasureLedgerVerified: true, evidence: evidence("walrus-sui-evidence"),
  },
  developerPlatform: {
    status: "pass", quickstartUnder30Minutes: true, localConformance: true,
    signedRevision: true, failedOutcomeVisible: true, passedOutcomeVisible: true,
    inviteSingleUse: true, connectionWithoutChatCredentials: true, codexGuardedClient: true,
    claudeCodeGuardedClient: true, genericMcpGuardedClient: true, meteringTenantSafe: true,
    sdkPackageGate: true, sdkPublished: true, packageProvenanceVerified: true,
    evidence: evidence("developer-platform"),
  },
  designPartners: {
    status: "pass", count: 3, inviteOnly: true, noChatCredentials: true,
    noWalletAuthority: true, evidence: evidence("design-partners"),
  },
  rollout: {
    status: "pass", mode: "shadow", hours: 48, unexplainedDenials: 0,
    allBypassesReviewed: true, rollbackProven: true, sequentialProtocolReview: true,
    evidence: evidence("shadow-rollout"),
  },
  operations: {
    status: "pass", twoAccountIsolation: true, tenantExportIsolation: true,
    hostBackupRestore: true, deletionResume: true, privacyFirewall: true,
    capabilityAdversarial: true, accessibility: true, responsive: true,
    performance: true, rollback: true, evidence: evidence("hosted-operations"),
  },
};

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/crypto-coworkers-acceptance-evidence.mjs", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function run(value, expectedCommit = commit) {
  writeFileSync(evidencePath, `${JSON.stringify(value, null, 2)}\n`);
  return runCli([
    "--evidence", evidencePath,
    "--expected-commit", expectedCommit,
    "--now", now,
    "--strict",
    "--json",
  ]);
}

function readSecureFile(path) {
  const descriptor = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    return {
      mode: fstatSync(descriptor).mode & 0o777,
      content: readFileSync(descriptor, "utf8"),
    };
  } finally {
    closeSync(descriptor);
  }
}

try {
  const templatePath = join(directory, "pending", "acceptance.json");
  const template = await runCli([
    "template",
    "--expected-commit", commit,
    "--app-url", "https://matterhorn.example/workspace/example",
    "--output", templatePath,
    "--now", "2026-09-03T11:00:00.000Z",
    "--json",
  ]);
  assert.equal(template.code, 0, template.stderr || template.stdout);
  const templateFile = readSecureFile(templatePath);
  assert.equal(templateFile.mode, 0o600);
  const pending = JSON.parse(template.stdout);
  assert.deepEqual(pending, JSON.parse(templateFile.content));
  assert.equal(pending.commit, commit);
  assert.equal(pending.runtime.openworkVersion, constants.openworkUpstreamVersion);
  assert.equal(pending.runtime.opencodeVersion, constants.opencodeVersion);
  assert.equal(pending.runtime.status, "pending");
  assert.equal(pending.certifications.sui.network, "sui-testnet");
  assert.equal(pending.transactions.polymarket.network, "mainnet-public-readonly");
  assert.equal(pending.coworkers.transactionCoordinator.walletReviewRequired, false);
  assert.equal(pending.encryptedEvidence.recoveryKeyDestroyed, false);
  assert.equal(pending.developerPlatform.sdkPublished, false);
  assert.equal(pending.rollout.hours, 0);
  assert.match(pending.runtime.evidence.path, /^reports\//);
  assert.equal(pending.runtime.evidence.sha256, "REPLACE_WITH_SHA256_AFTER_REDACTED_REPORT_REVIEW");

  const pendingResult = await run(pending);
  assert.equal(pendingResult.code, 1);
  const pendingReport = JSON.parse(pendingResult.stdout);
  assert.equal(pendingReport.decision, "NO-GO");
  assert.equal(pendingReport.checks.length, 21);
  assert.equal(pendingReport.blockers.length, 18);

  const overwrite = await runCli([
    "template", "--expected-commit", commit,
    "--app-url", "https://matterhorn.example/workspace/example",
    "--output", templatePath,
  ]);
  assert.equal(overwrite.code, 1);
  assert.match(overwrite.stderr, /already exists/i);

  for (const [index, appUrl] of [
    "http://matterhorn.example/workspace/example",
    "https://operator:password@matterhorn.example/workspace/example",
    "https://[::1]/workspace/example",
  ].entries()) {
    const unsafeTemplate = await runCli([
      "template", "--expected-commit", commit,
      "--app-url", appUrl,
      "--output", join(directory, `unsafe-${index}.json`),
    ]);
    assert.equal(unsafeTemplate.code, 1);
    assert.match(unsafeTemplate.stderr, /deployed HTTPS URL/i);
  }

  const passing = await run(input);
  assert.equal(passing.code, 0, passing.stderr || passing.stdout);
  const report = JSON.parse(passing.stdout);
  assert.equal(report.version, "matterhorn.crypto-coworkers-acceptance-readiness.v1");
  assert.equal(report.decision, "GO");
  assert.equal(report.ready, true);
  assert.equal(report.checks.length, 21);
  assert.equal(report.runtime.opencode.version, constants.opencodeVersion);

  const wrongCommit = await run(input, "b".repeat(40));
  assert.equal(wrongCommit.code, 1);
  assert.ok(JSON.parse(wrongCommit.stdout).blockers.some((item) => item.id === "exact_commit"));

  const runtimeMismatch = await run({
    ...input,
    runtime: { ...input.runtime, opencodeVersion: "v0.0.0" },
  });
  assert.equal(runtimeMismatch.code, 1);
  assert.ok(JSON.parse(runtimeMismatch.stdout).blockers.some((item) => item.id === "runtime_compatibility"));

  const localUrl = await run({ ...input, appUrl: "https://localhost/workspace/example" });
  assert.equal(localUrl.code, 1);
  assert.ok(JSON.parse(localUrl.stdout).blockers.some((item) => item.id === "deployed_https"));

  const ipv6Loopback = await run({ ...input, appUrl: "https://[::1]/workspace/example" });
  assert.equal(ipv6Loopback.code, 1);
  assert.ok(JSON.parse(ipv6Loopback.stdout).blockers.some((item) => item.id === "deployed_https"));

  const missingCertifications = structuredClone(input);
  delete missingCertifications.certifications;
  const missingCertificationResult = await run(missingCertifications);
  assert.equal(missingCertificationResult.code, 1);
  assert.ok(JSON.parse(missingCertificationResult.stdout).blockers.some((item) => item.id === "certification_sui"));

  const unsafeCoworker = await run({
    ...input,
    coworkers: {
      ...input.coworkers,
      transactionCoordinator: { ...input.coworkers.transactionCoordinator, walletReviewRequired: false },
    },
  });
  assert.equal(unsafeCoworker.code, 1);
  assert.ok(JSON.parse(unsafeCoworker.stdout).blockers.some((item) => item.id === "coworker_transactionCoordinator"));

  const incompleteShadow = await run({
    ...input,
    rollout: { ...input.rollout, hours: 47.99 },
  });
  assert.equal(incompleteShadow.code, 1);
  assert.ok(JSON.parse(incompleteShadow.stdout).blockers.some((item) => item.id === "shadow_rollout"));

  const tamperedEvidence = structuredClone(input);
  writeFileSync(join(directory, tamperedEvidence.encryptedEvidence.evidence.path), "tampered\n");
  const tampered = await run(tamperedEvidence);
  assert.equal(tampered.code, 1);
  assert.ok(JSON.parse(tampered.stdout).blockers.some((item) => item.id === "encrypted_evidence_lifecycle"));
  writeFileSync(join(directory, input.encryptedEvidence.evidence.path), "Redacted acceptance outcomes for walrus-sui-evidence.\n");

  const symlinkedEvidence = structuredClone(input);
  symlinkSync(input.runtime.evidence.path, join(directory, "runtime-link.md"));
  symlinkedEvidence.runtime.evidence.path = "runtime-link.md";
  const symlinkedEvidenceResult = await run(symlinkedEvidence);
  assert.equal(symlinkedEvidenceResult.code, 1);
  assert.ok(JSON.parse(symlinkedEvidenceResult.stdout).blockers.some((item) => item.id === "runtime_compatibility"));

  const secretReport = structuredClone(input);
  const unsafeReport = "Authorization: Bearer this-is-a-provider-token\n";
  writeFileSync(join(directory, secretReport.runtime.evidence.path), unsafeReport);
  secretReport.runtime.evidence.sha256 = sha256(unsafeReport);
  const secretReportResult = await run(secretReport);
  assert.equal(secretReportResult.code, 1);
  assert.ok(JSON.parse(secretReportResult.stdout).blockers.some((item) => item.id === "runtime_compatibility"));
  writeFileSync(join(directory, input.runtime.evidence.path), "Redacted acceptance outcomes for runtime.\n");

  const secret = await run({ ...input, privateKey: "never-store-this" });
  assert.equal(secret.code, 1);
  assert.match(secret.stderr, /signing material is not allowed/i);

  const arbitraryContent = await run({ ...input, rawPrompt: "must not enter the evidence manifest" });
  assert.equal(arbitraryContent.code, 1);
  assert.match(arbitraryContent.stderr, /unsupported fields/i);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

console.log("Guarded Crypto Coworkers acceptance evidence contract passed.");
