#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runOfficialSdkPublicValidation } from "./market-official-sdk-validate-public.mjs";

const root = process.cwd();
const fixtureDir = join(root, "qa-fixtures/market-official-sdk");
const tempDir = mkdtempSync(join(tmpdir(), "matterhorn-sdk-public-validation-"));

const direct = runOfficialSdkPublicValidation({
  mode: "fixture",
  inputDir: fixtureDir,
  outputDir: join(tempDir, "direct"),
});
assert.equal(direct.ok, true);
assert.equal(direct.ready, true);
assert.equal(direct.safety.nonCustodial, true);
assert.equal(direct.safety.liveSubmissionEnabled, false);
assert.equal(direct.safety.signsOrSubmits, false);
assert.equal(direct.safety.acceptsSecrets, false);
assert.equal(direct.safety.requiresClientValidation, true);
assert.equal(direct.officialSdkValidation.allValidated, true);
assert.equal(direct.artifacts.length, 2);
assert.match(direct.artifacts[0].inputSha256, /^[a-f0-9]{64}$/);
assert.match(direct.artifacts[0].normalizedSha256, /^[a-f0-9]{64}$/);
assert.ok(existsSync(direct.files.officialSdkEvidence));
assert.ok(existsSync(direct.files.publicValidationJson));
assert.ok(existsSync(direct.files.publicValidationMarkdown));
assert.ok(existsSync(direct.files.publicValidationSha256));
assert.equal(/privateKey|apiSecret|rawSignature|signedPayload|walletExport/i.test(JSON.stringify(direct)), false);

function run(args) {
  return spawnSync("node", ["scripts/market-official-sdk-validate-public.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });
}

const cliOut = join(tempDir, "cli");
const cli = run([
  "--mode", "fixture",
  "--input-dir", fixtureDir,
  "--output-dir", cliOut,
  "--strict",
  "--json",
]);
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
const parsed = JSON.parse(cli.stdout);
assert.equal(parsed.version, "matterhorn.market.official-sdk-public-validation.v1");
assert.equal(parsed.ready, true);
assert.equal(parsed.mode, "fixture");
assert.equal(parsed.files.publicValidationJson.endsWith("matterhorn-market-sdk-public-validation.json"), true);
const written = JSON.parse(readFileSync(parsed.files.publicValidationJson, "utf8"));
assert.equal(written.ready, true);
assert.match(readFileSync(parsed.files.publicValidationSha256, "utf8"), /matterhorn-market-sdk-public-validation\.json/);

const missingMode = run([
  "--input-dir", fixtureDir,
  "--output-dir", join(tempDir, "missing-mode"),
  "--strict",
  "--json",
]);
assert.notEqual(missingMode.status, 0, "explicit mode should be required");
assert.match(missingMode.stdout, /Explicit --mode is required/);

const mainnet = run([
  "--mode", "operator_owned_testnet",
  "--input-dir", fixtureDir,
  "--output-dir", join(tempDir, "mainnet"),
  "--hyperliquid-network", "mainnet",
  "--hyperliquid-package-version", "0.15.0",
  "--polymarket-network", "polygon-mainnet",
  "--polymarket-chain-id", "137",
  "--polymarket-exchange-address", "0x0000000000000000000000000000000000000001",
  "--polymarket-package-version", "1.1.0",
  "--strict",
  "--json",
]);
assert.notEqual(mainnet.status, 0, "mainnet-looking validation should fail");
assert.match(mainnet.stdout, /mainnet/i);

const badDir = join(tempDir, "bad-inputs");
mkdirSync(badDir, { recursive: true });
writeFileSync(join(badDir, "hyperliquid-official-public.json"), JSON.stringify({ rawSignature: "0xdeadbeef" }, null, 2));
writeFileSync(
  join(badDir, "polymarket-official-public.json"),
  readFileSync(join(fixtureDir, "polymarket-normalized-typed-data.fixture.json"), "utf8"),
);
const badJson = run([
  "--mode", "fixture",
  "--input-dir", badDir,
  "--output-dir", join(tempDir, "bad-json"),
  "--strict",
  "--json",
]);
assert.notEqual(badJson.status, 0, "secret-shaped JSON fields should fail");
assert.match(badJson.stdout, /rawSignature/);

const secretFlag = run([
  "--mode", "fixture",
  "--input-dir", fixtureDir,
  "--output-dir", join(tempDir, "secret-flag"),
  "--private-key", "redacted",
  "--json",
]);
assert.notEqual(secretFlag.status, 0, "credential-shaped CLI flags should fail");
assert.match(secretFlag.stdout, /Forbidden credential-shaped flag/);

const testnet = run([
  "--mode", "operator_owned_testnet",
  "--input-dir", fixtureDir,
  "--output-dir", join(tempDir, "testnet"),
  "--hyperliquid-network", "hyperliquid-testnet",
  "--hyperliquid-package-version", "0.15.0",
  "--polymarket-network", "polygon-amoy",
  "--polymarket-chain-id", "80002",
  "--polymarket-exchange-address", "0x0000000000000000000000000000000000000001",
  "--polymarket-package-version", "1.1.0",
  "--strict",
  "--json",
]);
assert.equal(testnet.status, 0, testnet.stderr || testnet.stdout);
const testnetParsed = JSON.parse(testnet.stdout);
assert.equal(testnetParsed.mode, "operator_owned_testnet");
assert.equal(testnetParsed.ready, true);
assert.equal(testnetParsed.safety.liveSubmissionEnabled, false);

process.stdout.write("Market official SDK public validation tests passed.\n");
