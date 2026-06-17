#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sampleEvidence, validateEvidenceBundle } from "./market-official-sdk-validation-evidence.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/market-customer-evidence-bundle.mjs");
const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-market-evidence-"));

try {
  const smoke = path.join(tmp, "customer-ready-smoke.json");
  const official = path.join(tmp, "official-sdk-evidence.json");
  const officialWrapped = path.join(tmp, "official-sdk-evidence-wrapped.json");
  const markdownOutput = path.join(tmp, "market-evidence.md");
  const jsonOutput = path.join(tmp, "market-evidence.json");

  await writeFile(smoke, JSON.stringify({
    ready: true,
    summary: { pass: 22, fail: 0, skip: 0 },
    stages: [
      { id: "market.official_sdk_validation", label: "Market official SDK validation track", status: "pass" },
      { id: "market.execution_safety", label: "Market execution safety gate", status: "pass" },
    ],
    safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
  }));

  const evidence = sampleEvidence();
  await writeFile(official, JSON.stringify(evidence));
  await writeFile(officialWrapped, JSON.stringify({ ...validateEvidenceBundle(evidence), evidence }));

  execFileSync("node", [
    script,
    "--customer-ready-smoke",
    smoke,
    "--official-sdk-validation",
    official,
    "--output",
    markdownOutput,
    "--json-output",
    jsonOutput,
    "--strict",
  ], { cwd: repoRoot });

  const markdown = await readFile(markdownOutput, "utf8");
  assert.match(markdown, /READY_FOR_TEST_CUSTOMER_QA/);
  assert.match(markdown, /Official SDK Validation Evidence/);
  assert.match(markdown, /hyperliquid-python-sdk/);
  assert.match(markdown, /@polymarket\/clob-client-v2/);
  assert.match(markdown, /pending_official_client_validation/);
  assert.doesNotMatch(markdown, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const summary = JSON.parse(await readFile(jsonOutput, "utf8"));
  assert.equal(summary.ready, true);
  assert.equal(summary.safety.nonCustodial, true);
  assert.equal(summary.safety.liveSubmissionEnabled, false);
  assert.equal(summary.officialSdkValidation.validation.ok, true);
  assert.equal(summary.officialSdkValidation.allValidated, false);
  assert.equal(summary.customerReadySmoke.pass, 22);

  const wrappedMarkdown = execFileSync("node", [
    script,
    "--customer-ready-smoke",
    smoke,
    "--official-sdk-validation",
    officialWrapped,
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.match(wrappedMarkdown, /READY_FOR_TEST_CUSTOMER_QA/);

  let requireValidatedError = null;
  try {
    execFileSync("node", [
        script,
        "--customer-ready-smoke",
        smoke,
        "--official-sdk-validation",
        official,
        "--require-official-sdk-validated",
        "--strict",
      ], { cwd: repoRoot, stdio: "pipe" });
  } catch (error) {
    requireValidatedError = error;
  }
  assert.ok(requireValidatedError, "require-official-sdk-validated should fail for pending sample evidence");
  assert.match(String(requireValidatedError.stdout), /Official SDK evidence is not fully validated/i);

  const bad = path.join(tmp, "bad-official-sdk-evidence.json");
  await writeFile(bad, JSON.stringify({ ...evidence, rawSignature: "0xdeadbeef" }));
  assert.throws(
    () =>
      execFileSync("node", [
        script,
        "--customer-ready-smoke",
        smoke,
        "--official-sdk-validation",
        bad,
      ], { cwd: repoRoot, stdio: "pipe" }),
    /forbidden secret-shaped field/i,
  );

  console.log("Market customer evidence bundle tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
