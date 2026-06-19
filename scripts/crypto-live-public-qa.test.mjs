#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(repoRoot, "scripts/crypto-live-public-qa.mjs");
const forbidden =
  /(privateKey|private_key|seedPhrase|seed_phrase|mnemonic|apiSecret|api_secret|rawSignature|raw_signature|signedPayload|signed_payload|walletExport|wallet_export|"signature"\s*:)/i;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const outputDir = mkdtempSync(join(tmpdir(), "matterhorn-live-public-qa-test-"));
const result = run(["--output-dir", outputDir, "--strict", "--json"]);
assert(result.status === 0, `expected fixture fallback to pass, got ${result.status}. stderr=${result.stderr}`);

const payload = JSON.parse(result.stdout);
assert(payload.version === "matterhorn.crypto.live-public-qa.v1", "expected live public QA report version");
assert(payload.status === "SKIPPED_WITH_FIXTURE_FALLBACK", `expected fixture fallback status, got ${payload.status}`);
assert(payload.ready === true, "fixture fallback must not fail readiness");
assert(payload.safety?.nonCustodial === true, "expected non-custodial safety flag");
assert(payload.safety?.liveSubmissionEnabled === false, "expected liveSubmissionEnabled=false");
assert(payload.safety?.signsOrSubmits === false, "expected signsOrSubmits=false");
assert(payload.safety?.acceptsSecrets === false, "expected acceptsSecrets=false");
assert(payload.inputs?.tokenConfigured === false, "expected tokenConfigured=false in fixture mode");
assert(payload.summary?.skippedWithFixtureFallback >= 2, "expected skipped fixture fallback stages");
assert(Array.isArray(payload.stages) && payload.stages.length >= 3, "expected stage ledger");
const chainStage = payload.stages.find((stage) => stage.id === "market_execution_chain_api");
assert(chainStage?.status === "SKIPPED_WITH_FIXTURE_FALLBACK", "expected execution-chain API stage to fixture-skip without server inputs");
assert(/Authorization: Bearer <client-token>/.test(chainStage?.command || ""), "expected execution-chain API command to use bearer auth");
const sdkValidationStage = payload.stages.find((stage) => stage.id === "market_sdk_validation_api");
assert(sdkValidationStage?.status === "SKIPPED_WITH_FIXTURE_FALLBACK", "expected SDK-validation API stage to fixture-skip without server inputs");
assert(/Authorization: Bearer <client-token>/.test(sdkValidationStage?.command || ""), "expected SDK-validation API command to use bearer auth");
const hyperliquidWatchStage = payload.stages.find((stage) => stage.id === "hyperliquid_watch_evidence");
assert(hyperliquidWatchStage?.status === "SKIPPED_WITH_FIXTURE_FALLBACK", "expected Hyperliquid watch stage to fixture-skip without server inputs");
assert(/matterhorn-work hyperliquid watch create/.test(hyperliquidWatchStage?.command || ""), "expected Hyperliquid watch command in fixture stage");
assert(/--kind funding_rate/.test(hyperliquidWatchStage?.command || ""), "expected Hyperliquid watch kind in fixture stage");
const polymarketWatchStage = payload.stages.find((stage) => stage.id === "polymarket_watch_evidence");
assert(polymarketWatchStage?.status === "SKIPPED_WITH_FIXTURE_FALLBACK", "expected Polymarket watch stage to fixture-skip without server inputs");
assert(/matterhorn-work polymarket watch create/.test(polymarketWatchStage?.command || ""), "expected Polymarket watch command in fixture stage");
assert(/<public-market-id>/.test(polymarketWatchStage?.command || ""), "expected public Polymarket market id placeholder");
assert(payload.inputs?.hyperliquidAsset === "BTC", "expected default Hyperliquid asset input");
assert(payload.inputs?.polymarketMarketIdConfigured === false, "expected no Polymarket market id in fixture mode");

const jsonPath = join(outputDir, "matterhorn-live-public-qa.json");
const mdPath = join(outputDir, "matterhorn-live-public-qa.md");
const shaPath = join(outputDir, "matterhorn-live-public-qa.sha256");
assert(existsSync(jsonPath), "expected JSON report output");
assert(existsSync(mdPath), "expected Markdown report output");
assert(existsSync(shaPath), "expected SHA-256 output");

const json = readFileSync(jsonPath, "utf8");
const markdown = readFileSync(mdPath, "utf8");
const shaFile = readFileSync(shaPath, "utf8").trim();
assert(shaFile === `${sha256(json)}  matterhorn-live-public-qa.json`, "expected SHA-256 file to match JSON report");
assert(/Do not use seed phrases, private keys, API secrets/.test(markdown), "expected Markdown safety warning");
assert(/Market execution-chain API/.test(markdown), "expected Markdown to include execution-chain API stage");
assert(/Market SDK-validation API/.test(markdown), "expected Markdown to include SDK-validation API stage");
assert(/Hyperliquid watch evidence/.test(markdown), "expected Markdown to include Hyperliquid watch stage");
assert(/Polymarket watch evidence/.test(markdown), "expected Markdown to include Polymarket watch stage");
assert(/--hyperliquid-asset BTC/.test(markdown), "expected Markdown rerun command to include Hyperliquid asset");
assert(/--polymarket-market-id/.test(markdown), "expected Markdown rerun command to include Polymarket market id");
assert(!forbidden.test(json), "JSON report leaked secret-shaped fields");
assert(!forbidden.test(markdown), "Markdown report leaked secret-shaped fields");

const smokePath = join(outputDir, "customer-smoke.json");
writeFileSync(smokePath, JSON.stringify({
  ready: true,
  safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
  summary: { pass: 4, fail: 0, skip: 0 },
}) + "\n");
const attached = run(["--output-dir", outputDir, "--customer-ready-smoke", smokePath, "--json"]);
assert(attached.status === 0, `expected attachment run to pass, got ${attached.status}. stderr=${attached.stderr}`);
const attachedPayload = JSON.parse(attached.stdout);
const smokeStage = attachedPayload.stages.find((stage) => stage.id === "customer_crypto_smoke");
assert(smokeStage?.status === "pass", "expected customer smoke attachment to pass");
assert(typeof smokeStage.evidenceSha256 === "string" && smokeStage.evidenceSha256.length === 64, "expected attached smoke SHA-256");

const secretResult = run(["--output-dir", outputDir, "--private-key", "do-not-accept", "--json"]);
assert(secretResult.status !== 0, "expected credential-shaped flag to be rejected");
assert(/Forbidden credential-shaped flag/i.test(secretResult.stderr), "expected credential rejection error");

console.log("PASS crypto live public QA pack fixture fallback");
