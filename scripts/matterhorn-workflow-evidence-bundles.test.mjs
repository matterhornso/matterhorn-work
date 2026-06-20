#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const helperPath = "scripts/matterhorn-workflow-evidence-bundles.mjs";
const helper = readFileSync(helperPath, "utf8");
const types = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalJson);
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = canonicalJson(value[key]);
  }
  return sorted;
}

function computeEvidenceHash(bundle) {
  const { evidenceHash, ...rest } = bundle;
  return createHash("sha256").update(JSON.stringify(canonicalJson(rest))).digest("hex");
}

const helperIds = [
  "wellness_creator_workflow",
  "bittensor_beta_workflow",
  "hyperliquid_preview_workflow",
  "polymarket_preview_workflow",
  "decentralized_services_planned_workflow",
];

const requiredBundleFields = [
  "version",
  "workflowId",
  "domain",
  "requestedOutcome",
  "inputPrompt",
  "generatedArtifactType",
  "safetyStatus",
  "liveExecutionEnabled",
  "acceptsCustody",
  "acceptsSigning",
  "acceptsSecrets",
  "publicEvidence",
  "plannedServiceHooks",
  "safetyFlags",
  "createdAt",
  "source",
  "status",
  "canExecute",
  "evidenceHash",
];

const forbiddenCredentialValues = [
  "privateKey",
  "seedPhrase",
  "mnemonic",
  "apiSecret",
  "rawSignature",
  "signedPayload",
  "walletExport",
  "passphrase",
  "password",
  "keyfile",
  "suri",
];

// 1. Package scripts are exposed.
assert.equal(
  rootPackage.scripts["test:matterhorn-workflow-evidence-bundles"],
  "node scripts/matterhorn-workflow-evidence-bundles.test.mjs",
  "package.json should expose the evidence bundle test script"
);
assert.equal(
  rootPackage.scripts["workflow:evidence:list"],
  "node scripts/matterhorn-workflow-evidence-bundles.mjs --list",
  "package.json should expose workflow:evidence:list"
);
assert.equal(
  rootPackage.scripts["workflow:evidence:show"],
  "node scripts/matterhorn-workflow-evidence-bundles.mjs --id",
  "package.json should expose workflow:evidence:show"
);
assert.equal(
  rootPackage.scripts["workflow:evidence:export"],
  "node scripts/matterhorn-workflow-evidence-bundles.mjs --export",
  "package.json should expose workflow:evidence:export"
);

// 2. Helper contains required patterns.
for (const phrase of [
  "matterhorn.workflow.evidence-bundle-operator.v1",
  "EVIDENCE_BUNDLE_FIXTURES",
  "--list",
  "--id",
  "--export",
  "--checksum",
  "toPublicBundle",
  "Forbidden credential-shaped flag",
  "canExecute: false",
  "liveExecutionEnabled: false",
  "acceptsCustody: false",
  "acceptsSigning: false",
  "acceptsSecrets: false",
  "evidenceHash",
  "computeEvidenceHash",
]) {
  assert.ok(helper.includes(phrase), `helper missing phrase: ${phrase}`);
}

// 3. Helper fixture IDs match the types file registry.
for (const id of helperIds) {
  assert.ok(types.includes(id), `types registry missing bundle id: ${id}`);
  assert.ok(helper.includes(id), `helper missing bundle id: ${id}`);
}

// 4. --list returns all bundle IDs.
const listResult = spawnSync(process.execPath, [helperPath, "--list"], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.equal(listResult.status, 0, `list should exit 0. stderr=${listResult.stderr}`);
const listOutput = JSON.parse(listResult.stdout);
assert.equal(listOutput.version, "matterhorn.workflow.evidence-bundle-operator.v1");
assert.equal(listOutput.action, "list");
assert.deepEqual(listOutput.bundleIds.sort(), [...helperIds].sort());

// 5. --id returns each bundle with safety fields, public/redacted evidence, and valid hash.
for (const id of helperIds) {
  const showResult = spawnSync(process.execPath, [helperPath, "--id", id], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert.equal(showResult.status, 0, `show ${id} should exit 0. stderr=${showResult.stderr}`);
  const showOutput = JSON.parse(showResult.stdout);
  assert.equal(showOutput.version, "matterhorn.workflow.evidence-bundle-operator.v1");
  assert.equal(showOutput.action, "show");
  assert.equal(showOutput.bundleId, id);

  const bundle = showOutput.bundle;
  for (const field of requiredBundleFields) {
    assert.ok(field in bundle, `${id} must include field: ${field}`);
  }

  assert.equal(bundle.canExecute, false, `${id} must have canExecute: false`);
  assert.equal(bundle.liveExecutionEnabled, false, `${id} must have liveExecutionEnabled: false`);
  assert.equal(bundle.acceptsCustody, false, `${id} must have acceptsCustody: false`);
  assert.equal(bundle.acceptsSigning, false, `${id} must have acceptsSigning: false`);
  assert.equal(bundle.acceptsSecrets, false, `${id} must have acceptsSecrets: false`);
  assert.equal(bundle.safetyStatus, bundle.status, `${id} safetyStatus must match status`);

  // Every evidence item must be public (public/redacted only).
  assert.ok(bundle.publicEvidence.length > 0, `${id} must have at least one evidence item`);
  for (const item of bundle.publicEvidence) {
    assert.equal(item.public, true, `${id} evidence item ${item.id} must be public`);
  }

  // Evidence hash must match the canonical bundle content.
  assert.equal(
    computeEvidenceHash(bundle),
    bundle.evidenceHash,
    `${id} evidenceHash must match canonical SHA-256`
  );

  const json = JSON.stringify(bundle);
  for (const forbidden of forbiddenCredentialValues) {
    assert.equal(json.includes(forbidden), false, `${id} must not contain ${forbidden}`);
  }
}

// 6. --export produces public-only output with checksum.
const exportDir = tmpdir();
const exportPath = join(exportDir, "matterhorn-workflow-evidence-bundles.json");
const checksumPath = `${exportPath}.sha256`;

for (const path of [exportPath, checksumPath]) {
  if (existsSync(path)) unlinkSync(path);
}

const exportResult = spawnSync(
  process.execPath,
  [helperPath, "--export", exportPath, "--checksum"],
  {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  }
);
assert.equal(exportResult.status, 0, `export should exit 0. stderr=${exportResult.stderr}`);
const exportMeta = JSON.parse(exportResult.stdout);
assert.equal(exportMeta.version, "matterhorn.workflow.evidence-bundle-operator.v1");
assert.equal(exportMeta.action, "export");
assert.equal(exportMeta.outputPath, exportPath);
assert.equal(exportMeta.checksumPath, checksumPath);
assert.equal(exportMeta.publicOnly, true);

const exported = JSON.parse(readFileSync(exportPath, "utf8"));
assert.equal(exported.version, "matterhorn.workflow.evidence-bundle-operator.v1");
assert.equal(exported.publicOnly, true);
assert.equal(exported.count, helperIds.length);

for (const id of helperIds) {
  assert.ok(exported.bundles[id], `exported bundles missing ${id}`);
  assert.equal(exported.bundles[id].canExecute, false, `exported ${id} must have canExecute: false`);
  for (const item of exported.bundles[id].publicEvidence) {
    assert.equal(item.public, true, `exported ${id} evidence item ${item.id} must be public`);
  }
  const exportedJson = JSON.stringify(exported.bundles[id]);
  for (const forbidden of forbiddenCredentialValues) {
    assert.equal(exportedJson.includes(forbidden), false, `exported ${id} must not contain ${forbidden}`);
  }
}

assert.ok(existsSync(checksumPath), "checksum file should exist");
const checksumContent = readFileSync(checksumPath, "utf8");
assert.match(checksumContent, /^[a-f0-9]{64}  /, "checksum should be a 64-char hex sha256");

// 7. Reject credential-shaped flags.
const reject = spawnSync(process.execPath, [helperPath, "--list", "--private-key", "redacted"], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.notEqual(reject.status, 0, "helper should reject credential-shaped flags");
assert.match(reject.stderr, /Forbidden credential-shaped flag --private-key/);

// 8. No forbidden execution/submission patterns in helper.
for (const forbidden of [
  "canExecute: true",
  "liveExecutionEnabled: true",
  "/submit",
  "/sign",
  "submitRoute",
  "signRoute",
]) {
  assert.equal(helper.includes(forbidden), false, `helper must not expose ${forbidden}`);
}

// Cleanup.
for (const path of [exportPath, checksumPath]) {
  if (existsSync(path)) unlinkSync(path);
}

console.log("Matterhorn workflow evidence bundle operator helper check passed.");
