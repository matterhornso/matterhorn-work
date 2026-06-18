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
