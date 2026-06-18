#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/market-artifact-reconciliation.mjs");
const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-market-artifact-reconciliation-"));

function validation(venue) {
  const action = venue === "hyperliquid" ? "place_order" : "buy_shares";
  return {
    success: true,
    validation: {
      version: "matterhorn.market.artifact-validation.v1",
      venue,
      status: "accepted_public_metadata",
      validationMode: "public_redacted_metadata",
      matchesSignRequest: true,
      signRequestSha256: venue === "hyperliquid" ? "a".repeat(64) : "b".repeat(64),
      signedArtifactPublicHash: venue === "hyperliquid" ? "c".repeat(64) : "d".repeat(64),
      signedArtifactRedacted: true,
      redactedMetadataAccepted: true,
      signedArtifactAccepted: false,
      submitSignedAllowedByContract: false,
      canSubmit: false,
      liveSubmissionEnabled: false,
      publicAuditReceiptCandidate: {
        version: "matterhorn.market.receipt.v1",
        venue,
        status: "received",
        action,
        previewSha256: venue === "hyperliquid" ? "e".repeat(64) : "f".repeat(64),
        handoffSha256: venue === "hyperliquid" ? "1".repeat(64) : "2".repeat(64),
        orderId: null,
        txHash: null,
        warnings: [
          "Public audit receipt candidate only. It proves redacted metadata matched the sign request; it is not exchange submission evidence.",
        ],
      },
      errors: [],
      warnings: [],
    },
  };
}

try {
  const hyperliquidPath = path.join(tmp, "hyperliquid-artifact-validation.json");
  const polymarketPath = path.join(tmp, "polymarket-artifact-validation.json");
  const markdownPath = path.join(tmp, "matterhorn-market-artifact-reconciliation.md");
  const jsonPath = path.join(tmp, "matterhorn-market-artifact-reconciliation.json");
  await writeFile(hyperliquidPath, JSON.stringify(validation("hyperliquid"), null, 2));
  await writeFile(polymarketPath, JSON.stringify(validation("polymarket"), null, 2));

  execFileSync("node", [
    script,
    "--hyperliquid-artifact-validation",
    hyperliquidPath,
    "--polymarket-artifact-validation",
    polymarketPath,
    "--require-hyperliquid",
    "--require-polymarket",
    "--output",
    markdownPath,
    "--json-output",
    jsonPath,
    "--strict",
  ], { cwd: repoRoot });

  const markdown = await readFile(markdownPath, "utf8");
  assert.match(markdown, /READY_FOR_CUSTOMER_EVIDENCE/);
  assert.match(markdown, /Hyperliquid|hyperliquid/);
  assert.match(markdown, /polymarket/);
  assert.match(markdown, /Public Audit Receipt Candidates/);
  assert.match(markdown, /Signed artifact public hash/);
  assert.match(markdown, /not exchange submission evidence/i);
  assert.doesNotMatch(markdown, /raw signature:\s*0x/i);

  const report = JSON.parse(await readFile(jsonPath, "utf8"));
  assert.equal(report.version, "matterhorn.market.artifact-reconciliation.v1");
  assert.equal(report.ready, true);
  assert.equal(report.safety.nonCustodial, true);
  assert.equal(report.safety.liveSubmissionEnabled, false);
  assert.equal(report.safety.signsOrSubmits, false);
  assert.equal(report.safety.acceptsSecrets, false);
  assert.equal(report.safety.publicMetadataOnly, true);
  assert.equal(report.venues.length, 2);
  assert.equal(report.venues.find((item) => item.venue === "hyperliquid")?.ready, true);
  assert.equal(report.venues.find((item) => item.venue === "polymarket")?.ready, true);

  const jsonOnly = execFileSync("node", [
    script,
    "--hyperliquid-artifact-validation",
    hyperliquidPath,
    "--json",
    "--strict",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.doesNotMatch(jsonOnly, /# Matterhorn Market Artifact Reconciliation/);
  assert.equal(JSON.parse(jsonOnly).version, "matterhorn.market.artifact-reconciliation.v1");

  const missingRequired = execFileSync("node", [
    script,
    "--hyperliquid-artifact-validation",
    hyperliquidPath,
    "--require-polymarket",
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.match(missingRequired, /NOT_READY/);
  assert.match(missingRequired, /Missing polymarket artifact-validation evidence/i);

  let strictMissingError = null;
  try {
    execFileSync("node", [
      script,
      "--hyperliquid-artifact-validation",
      hyperliquidPath,
      "--require-polymarket",
      "--strict",
    ], { cwd: repoRoot, stdio: "pipe" });
  } catch (error) {
    strictMissingError = error;
  }
  assert.ok(strictMissingError, "strict mode should fail when a required venue is missing");
  assert.match(String(strictMissingError.stdout), /Missing polymarket artifact-validation evidence/i);

  const rejectedPath = path.join(tmp, "rejected-polymarket-artifact-validation.json");
  const rejected = validation("polymarket");
  rejected.validation.status = "rejected";
  rejected.validation.matchesSignRequest = false;
  rejected.validation.publicAuditReceiptCandidate = null;
  rejected.validation.errors = ["Artifact previewSha256 does not match the sign request."];
  await writeFile(rejectedPath, JSON.stringify(rejected, null, 2));
  let rejectedError = null;
  try {
    execFileSync("node", [
      script,
      "--polymarket-artifact-validation",
      rejectedPath,
      "--strict",
    ], { cwd: repoRoot, stdio: "pipe" });
  } catch (error) {
    rejectedError = error;
  }
  assert.ok(rejectedError, "rejected artifact-validation evidence should fail");
  assert.match(String(rejectedError.stdout), /polymarket artifact validation was not accepted/i);
  assert.match(String(rejectedError.stdout), /previewSha256 does not match/i);

  const secretPath = path.join(tmp, "bad-hyperliquid-artifact-validation.json");
  await writeFile(secretPath, JSON.stringify({
    ...validation("hyperliquid"),
    validation: {
      ...validation("hyperliquid").validation,
      publicAuditReceiptCandidate: {
        ...validation("hyperliquid").validation.publicAuditReceiptCandidate,
        signature: "0xdeadbeef",
      },
    },
  }));
  assert.throws(
    () =>
      execFileSync("node", [
        script,
        "--hyperliquid-artifact-validation",
        secretPath,
      ], { cwd: repoRoot, stdio: "pipe" }),
    /forbidden secret-shaped field/i,
  );

  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.scripts["test:market-artifact-reconciliation"], "node scripts/market-artifact-reconciliation.test.mjs");

  const doc = readFileSync("docs/market-artifact-validation-phase2.md", "utf8");
  assert.ok(doc.includes("Market Artifact Reconciliation"), "Phase 2 doc should explain reconciliation");
  assert.ok(doc.includes("test:market-artifact-reconciliation"), "Phase 2 doc should list the reconciliation gate");
  assert.ok(doc.includes("not exchange submission evidence"), "Phase 2 doc should keep receipt-candidate warning");

  const smoke = readFileSync("scripts/customer-ready-crypto-smoke.mjs", "utf8");
  const smokeTest = readFileSync("scripts/customer-ready-crypto-smoke.test.mjs", "utf8");
  assert.ok(smoke.includes("market.artifact_reconciliation"), "customer-ready smoke should run artifact reconciliation");
  assert.ok(smokeTest.includes("market.artifact_reconciliation"), "customer-ready smoke test should expect artifact reconciliation");

  for (const text of [
    readFileSync(script, "utf8"),
  ]) {
    for (const forbidden of [
      "/api/hyperliquid/orders/submit",
      "/api/polymarket/orders/submit",
      "/api/hyperliquid/orders/sign",
      "/api/polymarket/orders/sign",
    ]) {
      assert.ok(!text.includes(forbidden), `artifact reconciliation must not introduce ${forbidden}`);
    }
  }

  console.log("Market artifact reconciliation tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
