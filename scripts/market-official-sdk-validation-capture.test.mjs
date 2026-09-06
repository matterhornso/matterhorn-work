#!/usr/bin/env node
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildCapturedEvidence } from "./market-official-sdk-validation-capture.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(args, options = {}) {
  const result = spawnSync("node", ["scripts/market-official-sdk-validation-capture.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
  return result;
}

const generatedAt = new Date(0).toISOString();
const direct = buildCapturedEvidence({
  generatedAt,
  validatedAt: generatedAt,
  hyperliquidPackageVersion: "0.15.0",
  hyperliquidNormalized: {
    type: "order",
    grouping: "na",
    orders: [{ a: 0, b: false, p: "2500", s: "0.01", r: false, t: { limit: { tif: "Gtc" } } }],
  },
  polymarketPackageVersion: "1.1.0",
  polymarketExchangeAddress: "0x0000000000000000000000000000000000000001",
  polymarketChainId: "80002",
  polymarketNormalized: {
    domain: { name: "Polymarket CTF Exchange", version: "2", chainId: 80002, verifyingContract: "0x0000000000000000000000000000000000000001" },
    primaryType: "Order",
    types: { Order: [
      { name: "salt", type: "uint256" }, { name: "maker", type: "address" },
      { name: "signer", type: "address" }, { name: "tokenId", type: "uint256" },
      { name: "makerAmount", type: "uint256" }, { name: "takerAmount", type: "uint256" },
      { name: "side", type: "uint8" }, { name: "signatureType", type: "uint8" },
      { name: "timestamp", type: "uint256" }, { name: "metadata", type: "bytes32" },
      { name: "builder", type: "bytes32" },
    ] },
    message: {
      salt: "0", maker: "0x0000000000000000000000000000000000000000",
      signer: "0x0000000000000000000000000000000000000000", tokenId: "12345",
      makerAmount: "1000000", takerAmount: "500000", side: 0, signatureType: 0,
      timestamp: "0", metadata: `0x${"0".repeat(64)}`, builder: `0x${"0".repeat(64)}`,
    },
  },
});
assert(direct.ok, `direct captured evidence should validate: ${direct.errors.join("; ")}`);
assert(direct.evidence.venues.every((venue) => venue.status === "validated"), "both venues should be validated");
assert(direct.evidence.venues.every((venue) => venue.matterhornTemplate.canSubmit === false), "canSubmit must stay false");
assert(direct.evidence.safety.liveSubmissionEnabled === false, "live submission must stay disabled");

const tempDir = mkdtempSync(join(tmpdir(), "matterhorn-sdk-capture-"));
const hyperliquidArtifact = join(tempDir, "hyperliquid.json");
const polymarketArtifact = join(tempDir, "polymarket.json");
const outputPath = join(tempDir, "evidence.json");
writeFileSync(hyperliquidArtifact, JSON.stringify(direct.evidence.venues[0].validation.officialClientNormalized.content, null, 2));
writeFileSync(polymarketArtifact, JSON.stringify(direct.evidence.venues[1].validation.officialClientNormalized.content, null, 2));

const cli = run([
  "--generated-at", generatedAt,
  "--validated-at", generatedAt,
  "--hyperliquid-normalized", hyperliquidArtifact,
  "--hyperliquid-package-version", "0.15.0",
  "--polymarket-normalized", polymarketArtifact,
  "--polymarket-package-version", "1.1.0",
  "--polymarket-exchange-address", "0x0000000000000000000000000000000000000001",
  "--polymarket-chain-id", "80002",
  "--output", outputPath,
]);
assert(cli.status === 0, `capture CLI should pass: ${cli.stderr || cli.stdout}`);
const written = JSON.parse(readFileSync(outputPath, "utf8"));
assert(written.ok === true, "written capture result should be ok");
assert(written.evidence.venues[0].validation.officialClientNormalized.sha256, "Hyperliquid capture should include public artifact hash");
assert(written.evidence.venues[1].validation.officialClientNormalized.sha256, "Polymarket capture should include public artifact hash");
assert(!JSON.stringify(written).includes(tempDir), "capture output should not leak local file paths");

const negativePath = join(tempDir, "bad-hyperliquid.json");
writeFileSync(negativePath, JSON.stringify({ rawSignature: "0xdeadbeef" }, null, 2));
const negative = run([
  "--generated-at", generatedAt,
  "--hyperliquid-normalized", negativePath,
  "--hyperliquid-package-version", "0.15.0",
  "--json",
]);
assert(negative.status !== 0, "capture CLI should reject rawSignature");
assert(`${negative.stderr}\n${negative.stdout}`.includes("rawSignature"), "rawSignature rejection should be explicit");

const selfTest = run(["--self-test"]);
assert(selfTest.status === 0, `self-test should pass: ${selfTest.stderr || selfTest.stdout}`);

process.stdout.write("Market official SDK validation capture tests passed.\n");
