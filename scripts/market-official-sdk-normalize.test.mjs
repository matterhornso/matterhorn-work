#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeOfficialSdkArtifact } from "./market-official-sdk-normalize.mjs";

const root = process.cwd();
const fixtureDir = join(root, "qa-fixtures/market-official-sdk");
const tempDir = mkdtempSync(join(tmpdir(), "matterhorn-sdk-normalize-"));

function fixture(name) {
  return join(fixtureDir, name);
}

function run(args) {
  return spawnSync("node", ["scripts/market-official-sdk-normalize.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

const hyperliquid = JSON.parse(readFileSync(fixture("hyperliquid-normalized-action.fixture.json"), "utf8"));
const nestedHyperliquid = normalizeOfficialSdkArtifact({ action: hyperliquid }, "hyperliquid");
assert.equal(nestedHyperliquid.type, "order");
assert.equal(nestedHyperliquid.orders[0].a, 0);
assert.equal(nestedHyperliquid.operatorRedaction.submissionFieldsRemoved, true);

const polymarket = JSON.parse(readFileSync(fixture("polymarket-normalized-typed-data.fixture.json"), "utf8"));
const nestedPolymarket = normalizeOfficialSdkArtifact({ typedData: polymarket }, "polymarket");
assert.equal(nestedPolymarket.primaryType, "Order");
assert.equal(nestedPolymarket.domain.chainId, 80002);
assert.equal(nestedPolymarket.message.signatureType, 0);

const hyperliquidOut = join(tempDir, "hyperliquid.json");
const polymarketOut = join(tempDir, "polymarket.json");
let result = run(["--venue", "hyperliquid", "--input", fixture("hyperliquid-normalized-action.fixture.json"), "--output", hyperliquidOut]);
assert.equal(result.status, 0, result.stderr || result.stdout);
result = run(["--venue", "polymarket", "--input", fixture("polymarket-normalized-typed-data.fixture.json"), "--output", polymarketOut]);
assert.equal(result.status, 0, result.stderr || result.stdout);

const captured = execFileSync("node", [
  "scripts/market-official-sdk-validation-capture.mjs",
  "--generated-at", new Date(0).toISOString(),
  "--validated-at", new Date(0).toISOString(),
  "--hyperliquid-normalized", hyperliquidOut,
  "--hyperliquid-package-version", "fixture-hyperliquid-python-sdk",
  "--polymarket-normalized", polymarketOut,
  "--polymarket-package-version", "fixture-@polymarket/clob-client-v2",
  "--polymarket-exchange-address", "0x0000000000000000000000000000000000000001",
  "--polymarket-chain-id", "80002",
  "--json",
], { cwd: root, encoding: "utf8" });
const capture = JSON.parse(captured);
assert.equal(capture.ok, true, capture.errors?.join("; "));
assert.equal(capture.evidence.venues[0].status, "validated");
assert.equal(capture.evidence.venues[1].status, "validated");

result = run(["--venue", "hyperliquid", "--input", fixture("hyperliquid-forbidden-raw-signature.fixture.json"), "--json"]);
assert.notEqual(result.status, 0, "normalizer must reject rawSignature");
assert.match(`${result.stdout}\n${result.stderr}`, /rawSignature/);

const badPolymarket = join(tempDir, "bad-polymarket.json");
writeFileSync(badPolymarket, JSON.stringify({ typedData: { domain: {}, types: {}, message: { makerAmount: "1" } } }, null, 2));
result = run(["--venue", "polymarket", "--input", badPolymarket, "--json"]);
assert.notEqual(result.status, 0, "normalizer must reject incomplete Polymarket typed data");
assert.match(`${result.stdout}\n${result.stderr}`, /types\.Order|domain\.name|takerAmount/);

process.stdout.write("Market official SDK normalizer tests passed.\n");
