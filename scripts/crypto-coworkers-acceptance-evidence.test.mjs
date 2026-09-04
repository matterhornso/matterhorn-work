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
const outsideDirectory = mkdtempSync(join(tmpdir(), "matterhorn-crypto-coworkers-outside-"));
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

function jsonEvidence(name, value) {
  const path = `${name}.json`;
  const content = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(join(directory, path), content);
  return { path, sha256: sha256(content) };
}

function sdkProvenance(sourceCommit = commit) {
  return {
    version: "matterhorn.crypto-app-sdk-provenance.v1",
    decision: "GO",
    package: {
      name: "@matterhorn-work/crypto-app-sdk",
      version: "0.1.0",
      registry: "https://registry.npmjs.org/",
      integrity: "sha512",
    },
    source: {
      repository: "https://github.com/matterhornso/matterhorn-work",
      commit: sourceCommit,
      workflow: ".github/workflows/publish-crypto-app-sdk.yml",
      workflowRef: "refs/tags/crypto-app-sdk-v0.1.0",
      builder: "https://github.com/actions/runner/github-hosted",
      invocation: "https://github.com/matterhornso/matterhorn-work/actions/runs/123/attempts/1",
    },
    checks: {
      registrySignature: "verified",
      publishAttestation: "verified",
      provenanceAttestation: "verified",
      transparencyLog: "verified",
      lifecycleScripts: "disabled_during_verification",
    },
  };
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
  version: "matterhorn.crypto-coworkers-acceptance-evidence.v2",
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
      status: "pass", network: "polymarket:polygon", signedReadManifests: true,
      signedWalletPreviewManifest: true, liveDiscovery: true, liveOrderbook: true,
      trustedJurisdiction: true, walletSimulation: true, sealedReadRuntimeReport: true,
      sealedWalletRuntimeReport: true, readPromoted: true, walletPreviewPromoted: true,
      revisionPinned: true, noCredentialAuthority: true, noSubmitAuthority: true,
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
      status: "pass", network: "polymarket:polygon", discovery: true, orderbook: true,
      trustedJurisdiction: true, directVenueDenialRespected: true, prepare: true,
      simulate: true, exactTokenBound: true, exactSignerBound: true, exactFakTermsBound: true,
      reject: true, expire: true, tamperBlocked: true, refresh: true, walletOnly: true,
      receiptReconciled: true, evidence: evidence("transaction-polymarket-wallet"),
    },
  },
  encryptedEvidence: {
    status: "pass", explicitOptIn: true, ciphertextOnly: true, exactReadback: true,
    suiCertification: true, tamperBlocked: true, renewalWalletOnly: true, expiryBlocked: true,
    deleted: true, recoveryKeyDestroyed: true, publicScanNonIdentifying: true,
    restoreDrill: true, erasureLedgerVerified: true, anchorWalletOnly: true,
    anchorExactBinding: true, anchorImmutable: true, anchorMutationBlocked: true,
    anchorReplayBlocked: true, anchorPublicScanNonIdentifying: true,
    evidence: evidence("walrus-sui-evidence"),
  },
  developerPlatform: {
    status: "pass", quickstartUnder30Minutes: true, localConformance: true,
    signedRevision: true, failedOutcomeVisible: true, passedOutcomeVisible: true,
    inviteSingleUse: true, connectionWithoutChatCredentials: true, codexGuardedClient: true,
    claudeCodeGuardedClient: true, genericMcpGuardedClient: true, meteringTenantSafe: true,
    sdkPackageGate: true, sdkPublished: true, packageProvenanceVerified: true,
    evidence: evidence("developer-platform"),
    sdkProvenance: jsonEvidence("crypto-app-sdk-provenance", sdkProvenance()),
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
  assert.equal(pending.certifications.polymarket.network, "polymarket:polygon");
  assert.equal(pending.certifications.polymarket.signedWalletPreviewManifest, false);
  assert.equal(pending.certifications.polymarket.walletPreviewPromoted, false);
  assert.equal(pending.transactions.polymarket.network, "polymarket:polygon");
  assert.equal(pending.transactions.polymarket.exactFakTermsBound, false);
  assert.equal(pending.transactions.polymarket.walletOnly, false);
  assert.equal(pending.coworkers.transactionCoordinator.walletReviewRequired, false);
  assert.equal(pending.encryptedEvidence.recoveryKeyDestroyed, false);
  assert.equal(pending.encryptedEvidence.anchorWalletOnly, false);
  assert.equal(pending.encryptedEvidence.anchorExactBinding, false);
  assert.equal(pending.encryptedEvidence.anchorImmutable, false);
  assert.equal(pending.encryptedEvidence.anchorMutationBlocked, false);
  assert.equal(pending.encryptedEvidence.anchorReplayBlocked, false);
  assert.equal(pending.encryptedEvidence.anchorPublicScanNonIdentifying, false);
  assert.equal(pending.developerPlatform.sdkPublished, false);
  assert.equal(pending.developerPlatform.sdkProvenance.path, "reports/crypto-app-sdk-provenance.json");
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

  const manifestLink = join(directory, "acceptance-link.json");
  symlinkSync(evidencePath, manifestLink);
  const linkedManifest = await runCli([
    "--evidence", manifestLink,
    "--expected-commit", commit,
    "--now", now,
    "--strict",
  ]);
  assert.equal(linkedManifest.code, 1);
  assert.match(linkedManifest.stderr, /non-symlink/i);

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
  assert.equal(report.version, "matterhorn.crypto-coworkers-acceptance-readiness.v2");
  assert.equal(report.decision, "GO");
  assert.equal(report.ready, true);
  assert.equal(report.checks.length, 21);
  assert.equal(report.runtime.opencode.version, constants.opencodeVersion);

  const reusedPath = structuredClone(input);
  reusedPath.coworkers.riskMonitor.evidence = reusedPath.coworkers.marketAnalyst.evidence;
  const reusedPathResult = await run(reusedPath);
  assert.equal(reusedPathResult.code, 1);
  assert.match(reusedPathResult.stderr, /report is reused/i);

  const reusedContent = structuredClone(input);
  const marketAnalystReport = readFileSync(
    join(directory, reusedContent.coworkers.marketAnalyst.evidence.path),
    "utf8",
  );
  writeFileSync(join(directory, "risk-monitor-copy.md"), marketAnalystReport);
  reusedContent.coworkers.riskMonitor.evidence = {
    path: "risk-monitor-copy.md",
    sha256: sha256(marketAnalystReport),
  };
  const reusedContentResult = await run(reusedContent);
  assert.equal(reusedContentResult.code, 1);
  assert.match(reusedContentResult.stderr, /content is reused/i);

  writeFileSync(evidencePath, `${JSON.stringify(input, null, 2)}\n`);
  const jsonOutputPath = join(directory, "readiness.json");
  const jsonOutput = await runCli([
    "--evidence", evidencePath,
    "--expected-commit", commit,
    "--now", now,
    "--json-output", jsonOutputPath,
  ]);
  assert.equal(jsonOutput.code, 0, jsonOutput.stderr || jsonOutput.stdout);
  assert.equal(readSecureFile(jsonOutputPath).mode, 0o600);
  const jsonOutputOverwrite = await runCli([
    "--evidence", evidencePath,
    "--expected-commit", commit,
    "--now", now,
    "--json-output", jsonOutputPath,
  ]);
  assert.equal(jsonOutputOverwrite.code, 1);
  assert.match(jsonOutputOverwrite.stderr, /already exists/i);

  const wrongCommit = await run(input, "b".repeat(40));
  assert.equal(wrongCommit.code, 1);
  assert.ok(JSON.parse(wrongCommit.stdout).blockers.some((item) => item.id === "exact_commit"));

  const runtimeMismatch = await run({
    ...input,
    runtime: { ...input.runtime, opencodeVersion: "v0.0.0" },
  });
  assert.equal(runtimeMismatch.code, 1);
  assert.ok(JSON.parse(runtimeMismatch.stdout).blockers.some((item) => item.id === "runtime_compatibility"));

  const wrongSdkCommit = structuredClone(input);
  wrongSdkCommit.developerPlatform.sdkProvenance = jsonEvidence(
    "crypto-app-sdk-provenance-wrong-commit",
    sdkProvenance("b".repeat(40)),
  );
  const wrongSdkCommitResult = await run(wrongSdkCommit);
  assert.equal(wrongSdkCommitResult.code, 1);
  assert.ok(JSON.parse(wrongSdkCommitResult.stdout).blockers.some((item) => item.id === "developer_platform"));

  const unclosedSdkReport = sdkProvenance();
  unclosedSdkReport.attestationBundles = ["must-not-enter-acceptance"];
  const unclosedSdkEvidence = structuredClone(input);
  unclosedSdkEvidence.developerPlatform.sdkProvenance = jsonEvidence(
    "crypto-app-sdk-provenance-unclosed",
    unclosedSdkReport,
  );
  const unclosedSdkResult = await run(unclosedSdkEvidence);
  assert.equal(unclosedSdkResult.code, 1);
  assert.ok(JSON.parse(unclosedSdkResult.stdout).blockers.some((item) => item.id === "developer_platform"));

  const missingSdkProof = structuredClone(input);
  delete missingSdkProof.developerPlatform.sdkProvenance;
  const missingSdkProofResult = await run(missingSdkProof);
  assert.equal(missingSdkProofResult.code, 1);
  assert.ok(JSON.parse(missingSdkProofResult.stdout).blockers.some((item) => item.id === "developer_platform"));

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

  const incompletePolymarketCertification = structuredClone(input);
  incompletePolymarketCertification.certifications.polymarket.walletPreviewPromoted = false;
  const incompletePolymarketCertificationResult = await run(incompletePolymarketCertification);
  assert.equal(incompletePolymarketCertificationResult.code, 1);
  assert.ok(JSON.parse(incompletePolymarketCertificationResult.stdout).blockers.some((item) => item.id === "certification_polymarket"));

  const unsafePolymarketAirlock = structuredClone(input);
  unsafePolymarketAirlock.transactions.polymarket.exactSignerBound = false;
  const unsafePolymarketAirlockResult = await run(unsafePolymarketAirlock);
  assert.equal(unsafePolymarketAirlockResult.code, 1);
  assert.ok(JSON.parse(unsafePolymarketAirlockResult.stdout).blockers.some((item) => item.id === "transaction_polymarket"));

  const legacyReadOnlyEvidence = structuredClone(input);
  legacyReadOnlyEvidence.version = "matterhorn.crypto-coworkers-acceptance-evidence.v1";
  const legacyReadOnlyEvidenceResult = await run(legacyReadOnlyEvidence);
  assert.equal(legacyReadOnlyEvidenceResult.code, 1);
  assert.match(legacyReadOnlyEvidenceResult.stderr, /version must be matterhorn\.crypto-coworkers-acceptance-evidence\.v2/i);

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

  const unverifiedAnchor = structuredClone(input);
  unverifiedAnchor.encryptedEvidence.anchorExactBinding = false;
  const unverifiedAnchorResult = await run(unverifiedAnchor);
  assert.equal(unverifiedAnchorResult.code, 1);
  assert.ok(JSON.parse(unverifiedAnchorResult.stdout).blockers.some((item) => item.id === "encrypted_evidence_lifecycle"));

  const symlinkedEvidence = structuredClone(input);
  symlinkSync(input.runtime.evidence.path, join(directory, "runtime-link.md"));
  symlinkedEvidence.runtime.evidence.path = "runtime-link.md";
  const symlinkedEvidenceResult = await run(symlinkedEvidence);
  assert.equal(symlinkedEvidenceResult.code, 1);
  assert.ok(JSON.parse(symlinkedEvidenceResult.stdout).blockers.some((item) => item.id === "runtime_compatibility"));

  const linkedDirectoryEvidence = structuredClone(input);
  const outsideRuntime = "Redacted acceptance outcomes from outside the packet.\n";
  writeFileSync(join(outsideDirectory, "runtime.md"), outsideRuntime);
  symlinkSync(outsideDirectory, join(directory, "linked-reports"));
  linkedDirectoryEvidence.runtime.evidence = {
    path: "linked-reports/runtime.md",
    sha256: sha256(outsideRuntime),
  };
  const linkedDirectoryResult = await run(linkedDirectoryEvidence);
  assert.equal(linkedDirectoryResult.code, 1);
  assert.ok(JSON.parse(linkedDirectoryResult.stdout).blockers.some((item) => item.id === "runtime_compatibility"));

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
  rmSync(outsideDirectory, { recursive: true, force: true });
}

console.log("Guarded Crypto Coworkers acceptance evidence contract passed.");
