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
  const operatorSummary = path.join(tmp, "matterhorn-market-sdk-operator-summary.md");
  const receiptCheck = path.join(tmp, "market-receipt-check.json");
  const markdownOutput = path.join(tmp, "market-evidence.md");
  const jsonOutput = path.join(tmp, "market-evidence.json");

  await writeFile(smoke, JSON.stringify({
    ready: true,
    summary: { pass: 22, fail: 0, skip: 0 },
    stages: [
      { id: "crypto.unified_chat", label: "Unified crypto chat router", status: "pass" },
      { id: "crypto.shared_card_contract", label: "Unified crypto shared-card contract", status: "pass" },
      { id: "market.official_sdk_validation", label: "Market official SDK validation track", status: "pass" },
      { id: "market.execution_safety", label: "Market execution safety gate", status: "pass" },
      { id: "market.customer_evidence_bundle", label: "Market customer evidence bundle", status: "pass" },
      { id: "hyperliquid.readiness", label: "Hyperliquid readiness gate", status: "pass" },
      { id: "polymarket.readiness", label: "Polymarket readiness gate", status: "pass" },
      { id: "bittensor.customer_readiness", label: "Bittensor customer readiness gate", status: "pass" },
    ],
    safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
  }));

  const evidence = sampleEvidence();
  await writeFile(official, JSON.stringify(evidence));
  await writeFile(officialWrapped, JSON.stringify({ ...validateEvidenceBundle(evidence), evidence }));
  await writeFile(operatorSummary, [
    "# Matterhorn Market Official SDK Operator Summary",
    "",
    "Status: READY_FOR_TEST_CUSTOMER_QA",
    "",
    "| Invariant | Value |",
    "| --- | --- |",
    "| Non-custodial | true |",
    "| Live submission enabled | false |",
    "| Signs or submits | false |",
    "",
  ].join("\n"));
  await writeFile(receiptCheck, JSON.stringify({
    ok: true,
    matchesHandoff: true,
    receipt: {
      version: "matterhorn.market.receipt.v1",
      venue: "hyperliquid",
      status: "filled",
      action: "place_order",
      previewSha256: "h".repeat(64),
      handoffSha256: "a".repeat(64),
      orderId: "hl-order-123",
      txHash: null,
      warnings: [],
    },
    errors: [],
    warnings: [],
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
    },
  }));

  execFileSync("node", [
    script,
    "--customer-ready-smoke",
    smoke,
    "--official-sdk-validation",
    official,
    "--operator-summary",
    operatorSummary,
    "--receipt-check",
    receiptCheck,
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
  assert.match(markdown, /Operator Summary/);
  assert.match(markdown, /Public Receipt Evidence/);
  assert.match(markdown, /Accepted by receipt checker: yes/);
  assert.match(markdown, /Matches original handoff: yes/);
  assert.match(markdown, /hl-order-123/);
  assert.match(markdown, /Required Smoke Stages/);
  assert.match(markdown, /Unified crypto shared-card contract/);
  assert.match(markdown, /matterhorn-market-sdk-operator-summary\.md/);
  assert.match(markdown, /SHA-256/);
  assert.doesNotMatch(markdown, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const summary = JSON.parse(await readFile(jsonOutput, "utf8"));
  assert.equal(summary.ready, true);
  assert.equal(summary.safety.nonCustodial, true);
  assert.equal(summary.safety.liveSubmissionEnabled, false);
  assert.equal(summary.officialSdkValidation.validation.ok, true);
  assert.equal(summary.officialSdkValidation.allValidated, false);
  assert.equal(summary.customerReadySmoke.pass, 22);
  assert.equal(summary.customerReadySmoke.requiredStages.find((stage) => stage.id === "crypto.shared_card_contract")?.status, "pass");
  assert.equal(summary.operatorSummary.present, true);
  assert.equal(summary.operatorSummary.file, "matterhorn-market-sdk-operator-summary.md");
  assert.match(summary.operatorSummary.sha256, /^[a-f0-9]{64}$/);
  assert.equal(summary.receiptCheck.present, true);
  assert.equal(summary.receiptCheck.ready, true);
  assert.equal(summary.receiptCheck.venue, "hyperliquid");
  assert.equal(summary.receiptCheck.orderId, "hl-order-123");

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

  let missingReceiptError = null;
  try {
    execFileSync("node", [
        script,
        "--customer-ready-smoke",
        smoke,
        "--official-sdk-validation",
        official,
        "--require-receipt-check",
        "--strict",
      ], { cwd: repoRoot, stdio: "pipe" });
  } catch (error) {
    missingReceiptError = error;
  }
  assert.ok(missingReceiptError, "require-receipt-check should fail when receipt evidence is missing");
  assert.match(String(missingReceiptError.stdout), /Receipt-check evidence is required/i);

  const mismatchedReceipt = path.join(tmp, "mismatched-market-receipt-check.json");
  await writeFile(mismatchedReceipt, JSON.stringify({
    ok: false,
    matchesHandoff: false,
    receipt: {
      version: "matterhorn.market.receipt.v1",
      venue: "polymarket",
      status: "rejected",
      action: "buy_shares",
      previewSha256: "p".repeat(64),
      handoffSha256: "q".repeat(64),
      orderId: null,
      txHash: null,
      warnings: ["receipt has no order id or tx hash"],
    },
    errors: ["marketId mismatch"],
    warnings: ["receipt has no order id or tx hash"],
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
    },
  }));
  let mismatchedReceiptError = null;
  try {
    execFileSync("node", [
        script,
        "--customer-ready-smoke",
        smoke,
        "--official-sdk-validation",
        official,
        "--receipt-check",
        mismatchedReceipt,
        "--strict",
      ], { cwd: repoRoot, stdio: "pipe" });
  } catch (error) {
    mismatchedReceiptError = error;
  }
  assert.ok(mismatchedReceiptError, "strict bundle should fail rejected receipt-check evidence");
  assert.match(String(mismatchedReceiptError.stdout), /Receipt-check evidence was not accepted/i);
  assert.match(String(mismatchedReceiptError.stdout), /marketId mismatch/i);

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

  const badSummary = path.join(tmp, "bad-summary.md");
  await writeFile(badSummary, "rawSignature: 0xdeadbeef");
  assert.throws(
    () =>
      execFileSync("node", [
        script,
        "--customer-ready-smoke",
        smoke,
        "--official-sdk-validation",
        official,
        "--operator-summary",
        badSummary,
      ], { cwd: repoRoot, stdio: "pipe" }),
    /forbidden secret-shaped content/i,
  );

  const badReceipt = path.join(tmp, "bad-market-receipt-check.json");
  await writeFile(badReceipt, JSON.stringify({
    ok: true,
    matchesHandoff: true,
    receipt: {
      version: "matterhorn.market.receipt.v1",
      venue: "hyperliquid",
      status: "filled",
      signature: "0xdeadbeef",
    },
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
    },
  }));
  assert.throws(
    () =>
      execFileSync("node", [
        script,
        "--customer-ready-smoke",
        smoke,
        "--official-sdk-validation",
        official,
        "--receipt-check",
        badReceipt,
      ], { cwd: repoRoot, stdio: "pipe" }),
    /forbidden secret-shaped field/i,
  );

  const missingSharedCardSmoke = path.join(tmp, "missing-shared-card-smoke.json");
  await writeFile(missingSharedCardSmoke, JSON.stringify({
    ready: true,
    summary: { pass: 1, fail: 0, skip: 0 },
    stages: [{ id: "crypto.unified_chat", label: "Unified crypto chat router", status: "pass" }],
    safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
  }));
  let missingSharedCardError = null;
  try {
    execFileSync("node", [
        script,
        "--customer-ready-smoke",
        missingSharedCardSmoke,
        "--official-sdk-validation",
        official,
        "--strict",
      ], { cwd: repoRoot, stdio: "pipe" });
  } catch (error) {
    missingSharedCardError = error;
  }
  assert.ok(missingSharedCardError, "strict bundle should fail when the shared-card smoke stage is missing");
  assert.match(String(missingSharedCardError.stdout), /crypto\.shared_card_contract \(missing\)/i);

  console.log("Market customer evidence bundle tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
