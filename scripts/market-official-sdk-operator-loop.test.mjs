#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMarketOfficialSdkOperatorLoop } from "./market-official-sdk-operator-loop.mjs";

const tmp = await mkdtemp(join(tmpdir(), "matterhorn-market-sdk-loop-"));
const smokePath = join(tmp, "customer-ready-smoke.json");
await writeFile(smokePath, JSON.stringify({
  ready: true,
  metadata: { generatedAt: "2026-06-17T00:00:00.000Z", gitSha: "d".repeat(40), gitBranch: "codex/test" },
  summary: { pass: 29, fail: 0, skip: 0 },
  stages: [
    { id: "crypto.unified_chat", label: "Unified crypto chat router", status: "pass" },
    { id: "crypto.direct_prompt_safety", label: "Direct venue credential prompt safety", status: "pass" },
    { id: "crypto.shared_card_contract", label: "Unified crypto shared-card contract", status: "pass" },
    { id: "market.official_sdk_doctor", label: "Market official SDK validation doctor", status: "pass" },
    { id: "market.official_sdk_normalize", label: "Market official SDK artifact normalizer", status: "pass" },
    { id: "market.execution_safety", label: "Market execution safety gate", status: "pass" },
    { id: "market.execution_readiness_api", label: "Market execution-readiness API and chat contract", status: "pass" },
    { id: "market.official_sdk_validation", label: "Market official SDK validation track", status: "pass" },
    { id: "market.artifact_reconciliation", label: "Market artifact reconciliation evidence", status: "pass" },
    { id: "market.customer_evidence_bundle", label: "Market customer evidence bundle", status: "pass" },
    { id: "hyperliquid.readiness", label: "Hyperliquid readiness gate", status: "pass" },
    { id: "polymarket.readiness", label: "Polymarket readiness gate", status: "pass" },
    { id: "bittensor.customer_readiness", label: "Bittensor customer readiness gate", status: "pass" },
  ],
  safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
}));

const direct = await runMarketOfficialSdkOperatorLoop({
  fixture: true,
  outputDir: join(tmp, "direct"),
  customerReadySmoke: smokePath,
  requireOfficialSdkValidated: true,
});
assert.equal(direct.ok, true);
assert.equal(direct.ready, true);
assert.equal(direct.doctor.ready, true);
assert.equal(direct.officialSdkValidation.allValidated, true);
assert.equal(direct.safety.liveSubmissionEnabled, false);
assert.equal(direct.safety.signsOrSubmits, false);
assert.ok(direct.files.hyperliquidNormalized);
assert.ok(direct.files.polymarketNormalized);
assert.ok(direct.files.officialSdkEvidence);
assert.ok(direct.files.customerEvidenceMarkdown);
assert.ok(direct.files.customerEvidenceJson);
assert.ok(direct.files.operatorSummaryMarkdown);
assert.ok(direct.files.runManifest);
const markdown = await readFile(direct.files.customerEvidenceMarkdown, "utf8");
assert.match(markdown, /READY_FOR_TEST_CUSTOMER_QA/);
assert.match(markdown, /Operator Summary/);
assert.match(markdown, /matterhorn-market-sdk-operator-summary\.md/);
const summary = await readFile(direct.files.operatorSummaryMarkdown, "utf8");
assert.match(summary, /Matterhorn Market Official SDK Operator Summary/);
assert.match(summary, /READY_FOR_TEST_CUSTOMER_QA/);
assert.match(summary, /Non-custodial \| true/);
assert.match(summary, /Live submission enabled \| false/);
assert.match(summary, /hyperliquid/);
assert.match(summary, /polymarket/);
assert.equal(/privateKey|mnemonic|signedPayload|walletExport/i.test(summary), false);
const manifest = JSON.parse(await readFile(direct.files.runManifest, "utf8"));
assert.equal(manifest.version, "matterhorn.market.sdk.run-manifest.v1");
assert.equal(manifest.ready, true);
assert.equal(manifest.safety.nonCustodial, true);
assert.equal(manifest.safety.liveSubmissionEnabled, false);
assert.equal(manifest.safety.signsOrSubmits, false);
assert.equal(manifest.safety.acceptsSecrets, false);
assert.equal(manifest.files.officialSdkEvidence.file, "matterhorn-market-sdk-evidence.json");
assert.match(manifest.files.officialSdkEvidence.sha256, /^[a-f0-9]{64}$/);
assert.equal(manifest.files.runManifest, undefined);
assert.equal(manifest.venues.some((venue) => venue.venue === "hyperliquid"), true);
assert.equal(manifest.venues.some((venue) => venue.venue === "polymarket"), true);
assert.equal(JSON.stringify(manifest).includes("privateKey"), false);

const cliOutputDir = join(tmp, "cli");
const cli = spawnSync("node", [
  "scripts/market-official-sdk-operator-loop.mjs",
  "--fixture",
  "--output-dir",
  cliOutputDir,
  "--customer-ready-smoke",
  smokePath,
  "--require-official-sdk-validated",
  "--json",
], { cwd: process.cwd(), encoding: "utf8" });
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
const parsed = JSON.parse(cli.stdout);
assert.equal(parsed.ready, true);
assert.equal(parsed.files.officialSdkEvidence.endsWith("matterhorn-market-sdk-evidence.json"), true);
assert.equal(parsed.files.operatorSummaryMarkdown.endsWith("matterhorn-market-sdk-operator-summary.md"), true);
assert.equal(parsed.files.runManifest.endsWith("matterhorn-market-sdk-run-manifest.json"), true);
assert.equal(JSON.stringify(parsed).includes("privateKey"), false);

const unsafe = await runMarketOfficialSdkOperatorLoop({
  outputDir: join(tmp, "unsafe"),
  hyperliquidOfficialPublic: "missing.json",
  polymarketOfficialPublic: "missing.json",
});
assert.equal(unsafe.ok, false);
assert.match(unsafe.errors.join("\n"), /MARKET_OFFICIAL_SDK_VALIDATION_MODE/);

console.log("Market official SDK operator loop tests passed.");
