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
  summary: { pass: 27, fail: 0, skip: 0 },
  stages: [
    { id: "market.official_sdk_doctor", label: "Market official SDK validation doctor", status: "pass" },
    { id: "market.official_sdk_normalize", label: "Market official SDK artifact normalizer", status: "pass" },
    { id: "market.execution_safety", label: "Market execution safety gate", status: "pass" },
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
assert.equal(JSON.stringify(parsed).includes("privateKey"), false);

const unsafe = await runMarketOfficialSdkOperatorLoop({
  outputDir: join(tmp, "unsafe"),
  hyperliquidOfficialPublic: "missing.json",
  polymarketOfficialPublic: "missing.json",
});
assert.equal(unsafe.ok, false);
assert.match(unsafe.errors.join("\n"), /MARKET_OFFICIAL_SDK_VALIDATION_MODE/);

console.log("Market official SDK operator loop tests passed.");
