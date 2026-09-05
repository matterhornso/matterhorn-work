#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ACCEPTANCE_REPORT_PRODUCER,
  ACCEPTANCE_REPORT_SIGNATURE_DOMAIN,
  ACCEPTANCE_REPORT_VERSION,
  canonicalAcceptanceReportPayload,
  verifyCryptoCoworkersAcceptanceReport,
  verifyCryptoCoworkersAcceptanceReportReference,
  verifyCryptoCoworkersAcceptanceReportReferenceSet,
  verifyCryptoCoworkersAcceptanceReportSet,
} from "./lib/crypto-coworkers-acceptance-report-v1.mjs";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const OTHER_COMMIT = "89abcdef0123456789abcdef0123456789abcdef";
const APP_ORIGIN = "https://candidate.example";
const CAPTURED_AT = "2026-09-04T12:00:00.000Z";
const NOW = "2026-09-04T12:01:00.000Z";
const OUTCOMES = Object.freeze({
  permissionDenyByDefault: true,
  shellBlocked: true,
});
const keys = generateKeyPairSync("ed25519");
const otherKeys = generateKeyPairSync("ed25519");

function baseReport() {
  return {
    version: ACCEPTANCE_REPORT_VERSION,
    group: "runtime",
    release: {
      commit: COMMIT,
      appOrigin: APP_ORIGIN,
      environment: "deployed",
    },
    window: {
      startedAt: "2026-09-04T11:50:00.000Z",
      completedAt: "2026-09-04T11:55:00.000Z",
    },
    producer: {
      kind: ACCEPTANCE_REPORT_PRODUCER,
      runnerVersion: "1.0.0",
      runId: "run_runtime_0123456789",
    },
    outcomes: { ...OUTCOMES },
    artifacts: [
      { kind: "redacted_result", sha256: "1".repeat(64) },
    ],
    attestation: {
      algorithm: "ed25519",
      keyId: "acceptance-key-1",
      signature: "pending",
    },
  };
}

function signedReport(mutator = () => {}, privateKey = keys.privateKey) {
  const report = baseReport();
  mutator(report);
  report.attestation.signature = sign(
    null,
    Buffer.from(canonicalAcceptanceReportPayload(report), "utf8"),
    privateKey,
  ).toString("base64url");
  return report;
}

function options(overrides = {}) {
  return {
    expectedGroup: "runtime",
    expectedCommit: COMMIT,
    expectedAppOrigin: APP_ORIGIN,
    expectedEnvironment: "deployed",
    expectedOutcomes: OUTCOMES,
    capturedAt: CAPTURED_AT,
    now: NOW,
    trustedKeys: [{
      keyId: "acceptance-key-1",
      algorithm: "ed25519",
      publicKey: keys.publicKey,
    }],
    ...overrides,
  };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => error?.code === code && error?.message === code);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function reportPacket(t, report = signedReport(), name = "runtime.json") {
  const directory = mkdtempSync(join(tmpdir(), "matterhorn-acceptance-report-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const reports = join(directory, "reports");
  mkdirSync(reports);
  const content = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(join(reports, name), content, { mode: 0o600 });
  return {
    directory,
    packetPath: join(directory, "acceptance.json"),
    reference: {
      version: ACCEPTANCE_REPORT_VERSION,
      group: report.group,
      path: `reports/${name}`,
      sha256: sha256(content),
    },
  };
}

test("verifies a closed exact-release Ed25519 report without returning report content", () => {
  const verified = verifyCryptoCoworkersAcceptanceReport(signedReport(), options());
  assert.deepEqual(verified, {
    version: ACCEPTANCE_REPORT_VERSION,
    group: "runtime",
    commit: COMMIT,
    appOrigin: APP_ORIGIN,
    environment: "deployed",
    startedAt: "2026-09-04T11:50:00.000Z",
    completedAt: "2026-09-04T11:55:00.000Z",
    runnerVersion: "1.0.0",
    runId: "run_runtime_0123456789",
    keyId: "acceptance-key-1",
    outcomes: OUTCOMES,
    artifactHashes: ["1".repeat(64)],
    reportHash: verified.reportHash,
    attestationHash: verified.attestationHash,
  });
  assert.match(verified.reportHash, /^[a-f0-9]{64}$/);
  assert.match(verified.attestationHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(verified).includes("signature"), false);
  assert.equal(JSON.stringify(verified).includes("prompt"), false);
});

test("uses deterministic domain-separated canonical signing bytes", () => {
  const report = signedReport();
  const reordered = Object.fromEntries(Object.entries(report).reverse());
  assert.equal(canonicalAcceptanceReportPayload(report), canonicalAcceptanceReportPayload(reordered));
  const payload = JSON.parse(canonicalAcceptanceReportPayload(report));
  assert.equal(payload.domain, ACCEPTANCE_REPORT_SIGNATURE_DOMAIN);
  assert.equal(Object.hasOwn(payload.report, "attestation"), false);
});

test("rejects post-signing mutation of every release and result boundary", () => {
  const mutations = [
    (report) => { report.release.commit = OTHER_COMMIT; },
    (report) => { report.release.appOrigin = "https://other.example"; },
    (report) => { report.group = "operations"; },
    (report) => { report.outcomes.shellBlocked = false; },
    (report) => { report.artifacts[0].sha256 = "2".repeat(64); },
    (report) => { report.window.completedAt = "2026-09-04T11:56:00.000Z"; },
    (report) => { report.producer.runId = "run_runtime_9876543210"; },
  ];
  for (const mutate of mutations) {
    const report = signedReport();
    mutate(report);
    expectCode("acceptance_report_signature_invalid", () => {
      verifyCryptoCoworkersAcceptanceReport(report, {
        ...options(),
        expectedCommit: report.release.commit,
        expectedAppOrigin: report.release.appOrigin,
        expectedGroup: report.group,
        expectedOutcomes: report.outcomes,
      });
    });
  }
});

test("rejects cross-release, cross-origin, cross-group, environment, and outcome substitution", () => {
  const report = signedReport();
  expectCode("acceptance_report_commit_mismatch", () => verifyCryptoCoworkersAcceptanceReport(report, options({ expectedCommit: OTHER_COMMIT })));
  expectCode("acceptance_report_origin_mismatch", () => verifyCryptoCoworkersAcceptanceReport(report, options({ expectedAppOrigin: "https://other.example" })));
  expectCode("acceptance_report_group_mismatch", () => verifyCryptoCoworkersAcceptanceReport(report, options({ expectedGroup: "operations" })));
  expectCode("acceptance_report_environment_mismatch", () => verifyCryptoCoworkersAcceptanceReport(report, options({ expectedEnvironment: "staging" })));
  expectCode("acceptance_report_outcomes_mismatch", () => verifyCryptoCoworkersAcceptanceReport(report, options({ expectedOutcomes: { ...OUTCOMES, shellBlocked: false } })));
  expectCode("acceptance_report_outcomes_mismatch", () => verifyCryptoCoworkersAcceptanceReport(report, options({ expectedOutcomes: { ...OUTCOMES, extra: true } })));
  expectCode("acceptance_report_expected_outcomes_required", () => verifyCryptoCoworkersAcceptanceReport(report, options({ expectedOutcomes: undefined })));
});

test("accepts only a canonical deployed HTTPS origin", () => {
  const invalid = [
    "http://candidate.example",
    "https://candidate.example/path",
    "https://candidate.example/",
    "https://candidate.example?x=1",
    "https://candidate.example:8443",
    "https://user:pass@candidate.example",
    "https://127.0.0.1",
    "https://localhost",
    "https://candidate.local",
  ];
  for (const origin of invalid) {
    const report = signedReport((candidate) => { candidate.release.appOrigin = origin; });
    expectCode("acceptance_report_origin_invalid", () => verifyCryptoCoworkersAcceptanceReport(report, options({ expectedAppOrigin: origin })));
  }
});

test("rejects malformed, untrusted, wrong-algorithm, wrong-type, private, and duplicate keys", () => {
  const report = signedReport();
  const wrongSignature = signedReport(() => {}, otherKeys.privateKey);
  expectCode("acceptance_report_signature_invalid", () => verifyCryptoCoworkersAcceptanceReport(wrongSignature, options()));
  expectCode("acceptance_report_key_untrusted", () => verifyCryptoCoworkersAcceptanceReport(report, options({
    trustedKeys: [{ keyId: "other", algorithm: "ed25519", publicKey: keys.publicKey }],
  })));
  expectCode("acceptance_report_key_untrusted", () => verifyCryptoCoworkersAcceptanceReport(report, options({
    trustedKeys: [{ keyId: "acceptance-key-1", algorithm: "rsa", publicKey: keys.publicKey }],
  })));
  expectCode("acceptance_report_key_invalid", () => verifyCryptoCoworkersAcceptanceReport(report, options({
    trustedKeys: [{ keyId: "acceptance-key-1", algorithm: "ed25519", publicKey: keys.privateKey }],
  })));
  expectCode("acceptance_report_key_invalid", () => verifyCryptoCoworkersAcceptanceReport(report, options({
    trustedKeys: [{ keyId: "acceptance-key-1", algorithm: "ed25519", publicKey: "not-a-key" }],
  })));
  expectCode("acceptance_report_key_untrusted", () => verifyCryptoCoworkersAcceptanceReport(report, options({
    trustedKeys: [
      { keyId: "acceptance-key-1", algorithm: "ed25519", publicKey: keys.publicKey },
      { keyId: "acceptance-key-1", algorithm: "ed25519", publicKey: keys.publicKey },
    ],
  })));

  for (const signature of ["", "a".repeat(85), "!".repeat(86), Buffer.alloc(63).toString("base64url")]) {
    const candidate = signedReport();
    candidate.attestation.signature = signature;
    expectCode("acceptance_report_signature_invalid", () => verifyCryptoCoworkersAcceptanceReport(candidate, options()));
  }
});

test("rejects open objects, invalid shapes, excessive counts, and oversized reports", () => {
  const openRoot = signedReport((report) => { report.unexpected = true; });
  expectCode("acceptance_report_invalid", () => verifyCryptoCoworkersAcceptanceReport(openRoot, options()));
  const openRelease = signedReport((report) => { report.release.alias = "candidate"; });
  expectCode("acceptance_report_release_invalid", () => verifyCryptoCoworkersAcceptanceReport(openRelease, options()));
  const openArtifact = signedReport((report) => { report.artifacts[0].path = "raw.log"; });
  expectCode("acceptance_report_artifact_invalid", () => verifyCryptoCoworkersAcceptanceReport(openArtifact, options()));
  const invalidOutcome = signedReport((report) => { report.outcomes.shellBlocked = "yes"; });
  expectCode("acceptance_report_outcomes_invalid", () => verifyCryptoCoworkersAcceptanceReport(invalidOutcome, options({ expectedOutcomes: invalidOutcome.outcomes })));
  const excessiveOutcomes = signedReport((report) => {
    report.outcomes = Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`outcome${index}`, true]));
  });
  expectCode("acceptance_report_outcomes_invalid", () => verifyCryptoCoworkersAcceptanceReport(excessiveOutcomes, options({ expectedOutcomes: excessiveOutcomes.outcomes })));
  const excessiveArtifacts = signedReport((report) => {
    report.artifacts = Array.from({ length: 33 }, (_, index) => ({
      kind: "redacted_result",
      sha256: index.toString(16).padStart(64, "0"),
    }));
  });
  expectCode("acceptance_report_artifacts_invalid", () => verifyCryptoCoworkersAcceptanceReport(excessiveArtifacts, options()));
  const oversized = signedReport((report) => { report.producer.runnerVersion = `v${"x".repeat(256 * 1024)}`; });
  expectCode("acceptance_report_size_invalid", () => verifyCryptoCoworkersAcceptanceReport(oversized, options()));
});

test("rejects sensitive fields and credential-like content before signature verification", () => {
  const sensitiveFields = ["prompt", "walletAddress", "workspaceId", "rawToolOutput", "privateKey"];
  for (const field of sensitiveFields) {
    const report = signedReport((candidate) => { candidate.outcomes[field] = true; });
    expectCode("acceptance_report_sensitive_field_forbidden", () => verifyCryptoCoworkersAcceptanceReport(report, options({ expectedOutcomes: report.outcomes })));
  }
  const secrets = [
    "-----BEGIN PRIVATE KEY-----",
    `Bearer ${"a".repeat(24)}`,
    `sk-${"x".repeat(24)}`,
    `AKIA${"A".repeat(16)}`,
    "seed phrase: abandon",
  ];
  for (const secret of secrets) {
    const report = signedReport((candidate) => { candidate.producer.runnerVersion = secret; });
    expectCode("acceptance_report_sensitive_content_forbidden", () => verifyCryptoCoworkersAcceptanceReport(report, options()));
  }
});

test("enforces canonical timestamps, freshness, future tolerance, and minimum duration", () => {
  const reversed = signedReport((report) => {
    report.window.startedAt = "2026-09-04T11:56:00.000Z";
  });
  expectCode("acceptance_report_window_invalid", () => verifyCryptoCoworkersAcceptanceReport(reversed, options()));

  const stale = signedReport((report) => {
    report.window.startedAt = "2026-09-03T22:00:00.000Z";
    report.window.completedAt = "2026-09-03T23:00:00.000Z";
  });
  expectCode("acceptance_report_window_stale", () => verifyCryptoCoworkersAcceptanceReport(stale, options()));

  const future = signedReport((report) => {
    report.window.startedAt = "2026-09-04T12:00:00.000Z";
    report.window.completedAt = "2026-09-04T12:02:00.001Z";
  });
  expectCode("acceptance_report_window_future", () => verifyCryptoCoworkersAcceptanceReport(future, options()));

  const nonCanonical = signedReport((report) => { report.window.completedAt = "2026-09-04T11:55:00Z"; });
  expectCode("acceptance_report_window_invalid", () => verifyCryptoCoworkersAcceptanceReport(nonCanonical, options()));

  expectCode("acceptance_report_window_invalid", () => verifyCryptoCoworkersAcceptanceReport(signedReport(), options({ minDurationMs: 6 * 60 * 1000 })));

  const shadow = signedReport((report) => {
    report.group = "rollout";
    report.window.startedAt = "2026-09-02T11:55:00.000Z";
    report.producer.runId = "run_rollout_0123456789";
    report.outcomes = { uninterruptedShadow: true };
    report.artifacts[0].sha256 = "2".repeat(64);
  });
  const verified = verifyCryptoCoworkersAcceptanceReport(shadow, options({
    expectedGroup: "rollout",
    expectedOutcomes: { uninterruptedShadow: true },
    minDurationMs: 48 * 60 * 60 * 1000,
  }));
  assert.equal(verified.group, "rollout");
});

test("rejects duplicate artifacts within one report", () => {
  const report = signedReport((candidate) => {
    candidate.artifacts.push({ ...candidate.artifacts[0] });
  });
  expectCode("acceptance_report_artifact_reused", () => verifyCryptoCoworkersAcceptanceReport(report, options()));
});

test("verifies a report set and rejects group, run, report, signature, or artifact replay", () => {
  const runtime = signedReport();
  const operations = signedReport((report) => {
    report.group = "operations";
    report.producer.runId = "run_operations_0123456";
    report.outcomes = { twoAccountIsolation: true };
    report.artifacts[0].sha256 = "2".repeat(64);
  });
  const entries = [
    { report: runtime, expectedGroup: "runtime", expectedOutcomes: OUTCOMES },
    { report: operations, expectedGroup: "operations", expectedOutcomes: { twoAccountIsolation: true } },
  ];
  const verified = verifyCryptoCoworkersAcceptanceReportSet(entries, {
    expectedCommit: COMMIT,
    expectedAppOrigin: APP_ORIGIN,
    expectedEnvironment: "deployed",
    capturedAt: CAPTURED_AT,
    now: NOW,
    trustedKeys: options().trustedKeys,
  });
  assert.deepEqual(verified.map((report) => report.group), ["runtime", "operations"]);

  expectCode("acceptance_report_group_reused", () => verifyCryptoCoworkersAcceptanceReportSet([
    entries[0],
    { ...entries[0], report: signedReport((report) => {
      report.producer.runId = "run_runtime_other_1234";
      report.artifacts[0].sha256 = "3".repeat(64);
    }) },
  ], {
    expectedCommit: COMMIT,
    expectedAppOrigin: APP_ORIGIN,
    capturedAt: CAPTURED_AT,
    now: NOW,
    trustedKeys: options().trustedKeys,
  }));

  const reusedRun = signedReport((report) => {
    report.group = "operations";
    report.outcomes = { twoAccountIsolation: true };
    report.artifacts[0].sha256 = "4".repeat(64);
  });
  expectCode("acceptance_report_run_reused", () => verifyCryptoCoworkersAcceptanceReportSet([
    entries[0],
    { report: reusedRun, expectedGroup: "operations", expectedOutcomes: reusedRun.outcomes },
  ], {
    expectedCommit: COMMIT,
    expectedAppOrigin: APP_ORIGIN,
    capturedAt: CAPTURED_AT,
    now: NOW,
    trustedKeys: options().trustedKeys,
  }));

  const reusedArtifact = signedReport((report) => {
    report.group = "operations";
    report.producer.runId = "run_operations_9876543";
    report.outcomes = { twoAccountIsolation: true };
  });
  expectCode("acceptance_report_artifact_reused", () => verifyCryptoCoworkersAcceptanceReportSet([
    entries[0],
    { report: reusedArtifact, expectedGroup: "operations", expectedOutcomes: reusedArtifact.outcomes },
  ], {
    expectedCommit: COMMIT,
    expectedAppOrigin: APP_ORIGIN,
    capturedAt: CAPTURED_AT,
    now: NOW,
    trustedKeys: options().trustedKeys,
  }));

  expectCode("acceptance_report_set_invalid", () => verifyCryptoCoworkersAcceptanceReportSet([
    { ...entries[0], unexpected: true },
  ], {
    expectedCommit: COMMIT,
    expectedAppOrigin: APP_ORIGIN,
    capturedAt: CAPTURED_AT,
    now: NOW,
    trustedKeys: options().trustedKeys,
  }));
});

test("loads one content-addressed report without returning its filesystem path", (t) => {
  const packet = reportPacket(t);
  const verified = verifyCryptoCoworkersAcceptanceReportReference(packet.reference, {
    ...options(),
    packetPath: packet.packetPath,
  });
  assert.equal(verified.group, "runtime");
  assert.equal(verified.evidenceHash, packet.reference.sha256);
  assert.equal(JSON.stringify(verified).includes(packet.directory), false);
  assert.equal(Object.hasOwn(verified, "path"), false);
});

test("rejects changed bytes, wrong reference metadata, traversal, absolute paths, and symlinks", (t) => {
  const packet = reportPacket(t);
  expectCode("acceptance_report_reference_hash_mismatch", () => verifyCryptoCoworkersAcceptanceReportReference({
    ...packet.reference,
    sha256: "f".repeat(64),
  }, { ...options(), packetPath: packet.packetPath }));
  expectCode("acceptance_report_reference_version_invalid", () => verifyCryptoCoworkersAcceptanceReportReference({
    ...packet.reference,
    version: "matterhorn.crypto-coworkers-acceptance-report.v0",
  }, { ...options(), packetPath: packet.packetPath }));
  expectCode("acceptance_report_reference_group_mismatch", () => verifyCryptoCoworkersAcceptanceReportReference({
    ...packet.reference,
    group: "operations",
  }, { ...options(), packetPath: packet.packetPath }));
  expectCode("acceptance_report_reference_invalid", () => verifyCryptoCoworkersAcceptanceReportReference({
    ...packet.reference,
    url: "https://candidate.example/report",
  }, { ...options(), packetPath: packet.packetPath }));
  for (const path of ["../runtime.json", packet.packetPath, "", `reports/${"x".repeat(513)}`]) {
    expectCode("acceptance_report_path_invalid", () => verifyCryptoCoworkersAcceptanceReportReference({
      ...packet.reference,
      path,
    }, { ...options(), packetPath: packet.packetPath }));
  }

  const fileLink = join(packet.directory, "reports", "linked.json");
  symlinkSync(join(packet.directory, "reports", "runtime.json"), fileLink);
  expectCode("acceptance_report_path_invalid", () => verifyCryptoCoworkersAcceptanceReportReference({
    ...packet.reference,
    path: "reports/linked.json",
  }, { ...options(), packetPath: packet.packetPath }));

  const linkedDirectory = join(packet.directory, "linked-reports");
  symlinkSync(join(packet.directory, "reports"), linkedDirectory);
  expectCode("acceptance_report_path_invalid", () => verifyCryptoCoworkersAcceptanceReportReference({
    ...packet.reference,
    path: "linked-reports/runtime.json",
  }, { ...options(), packetPath: packet.packetPath }));
});

test("rejects malformed UTF-8, invalid JSON, duplicate JSON keys, empty files, and oversized files", (t) => {
  const packet = reportPacket(t);
  const cases = [
    ["invalid-utf8.json", Buffer.from([0xc3, 0x28]), "acceptance_report_json_invalid"],
    ["invalid-json.json", Buffer.from("{", "utf8"), "acceptance_report_json_invalid"],
    [
      "duplicate-key.json",
      Buffer.from(`{"version":"${ACCEPTANCE_REPORT_VERSION}","version":"${ACCEPTANCE_REPORT_VERSION}"}`, "utf8"),
      "acceptance_report_duplicate_json_key",
    ],
    ["empty.json", Buffer.alloc(0), "acceptance_report_file_size_invalid"],
    ["oversized.json", Buffer.alloc(256 * 1024 + 1, 0x20), "acceptance_report_file_size_invalid"],
  ];
  for (const [name, content, code] of cases) {
    writeFileSync(join(packet.directory, "reports", name), content);
    expectCode(code, () => verifyCryptoCoworkersAcceptanceReportReference({
      ...packet.reference,
      path: `reports/${name}`,
      sha256: sha256(content),
    }, { ...options(), packetPath: packet.packetPath }));
  }
});

test("rejects report-file path and evidence-hash replay across one packet", (t) => {
  const packet = reportPacket(t);
  const entry = {
    reference: packet.reference,
    expectedGroup: "runtime",
    expectedOutcomes: OUTCOMES,
  };
  expectCode("acceptance_report_path_reused", () => verifyCryptoCoworkersAcceptanceReportReferenceSet([
    entry,
    entry,
  ], {
    expectedCommit: COMMIT,
    expectedAppOrigin: APP_ORIGIN,
    capturedAt: CAPTURED_AT,
    now: NOW,
    trustedKeys: options().trustedKeys,
    packetPath: packet.packetPath,
  }));

  const duplicatePath = join(packet.directory, "reports", "runtime-copy.json");
  const content = Buffer.from(`${JSON.stringify(signedReport(), null, 2)}\n`, "utf8");
  writeFileSync(duplicatePath, content);
  const duplicateReference = {
    ...packet.reference,
    path: "reports/runtime-copy.json",
    sha256: sha256(content),
  };
  expectCode("acceptance_report_evidence_hash_reused", () => verifyCryptoCoworkersAcceptanceReportReferenceSet([
    entry,
    { ...entry, reference: duplicateReference },
  ], {
    expectedCommit: COMMIT,
    expectedAppOrigin: APP_ORIGIN,
    capturedAt: CAPTURED_AT,
    now: NOW,
    trustedKeys: options().trustedKeys,
    packetPath: packet.packetPath,
  }));
});

console.log("Crypto Coworkers acceptance report v1 verifier passed.");
