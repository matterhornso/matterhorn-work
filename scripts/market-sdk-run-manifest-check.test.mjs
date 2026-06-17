#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyMarketSdkRunManifest } from "./market-sdk-run-manifest-check.mjs";

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

const tmp = await mkdtemp(join(tmpdir(), "matterhorn-sdk-manifest-check-test-"));

try {
  const evidenceFile = join(tmp, "matterhorn-market-sdk-evidence.json");
  const evidence = `${JSON.stringify({
    version: "matterhorn.market.official-sdk-validation.v1",
    venue: "polymarket",
    signatureType: 0,
    safety: { nonCustodial: true, liveSubmissionEnabled: false },
  }, null, 2)}\n`;
  await writeFile(evidenceFile, evidence);
  const manifestFile = join(tmp, "matterhorn-market-sdk-run-manifest.json");
  await writeFile(manifestFile, `${JSON.stringify({
    version: "matterhorn.market.sdk.run-manifest.v1",
    status: "READY_FOR_TEST_CUSTOMER_QA",
    ready: true,
    ok: true,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
    },
    venues: [{ venue: "polymarket", status: "validated" }],
    files: {
      officialSdkEvidence: {
        file: "matterhorn-market-sdk-evidence.json",
        bytes: Buffer.byteLength(evidence, "utf8"),
        sha256: sha256(evidence),
      },
    },
  }, null, 2)}\n`);

  const accepted = verifyMarketSdkRunManifest({ manifestPath: manifestFile });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.ready, true);
  assert.equal(accepted.safety.liveSubmissionEnabled, false);
  assert.equal(accepted.files[0].shaMatches, true);
  assert.equal(accepted.files[0].bytesMatch, true);

  const cli = spawnSync("node", [
    "scripts/market-sdk-run-manifest-check.mjs",
    "--manifest",
    manifestFile,
    "--strict",
    "--json",
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr || cli.stdout);
  const parsed = JSON.parse(cli.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.manifest.version, "matterhorn.market.sdk.run-manifest.v1");
  assert.equal(JSON.stringify(parsed).includes("privateKey"), false);

  await writeFile(evidenceFile, `${JSON.stringify({ ...JSON.parse(evidence), venue: "tampered" })}\n`);
  const tampered = verifyMarketSdkRunManifest({ manifestPath: manifestFile });
  assert.equal(tampered.ok, false);
  assert.match(tampered.errors.join("\n"), /SHA-256 mismatch/i);

  await writeFile(evidenceFile, `${JSON.stringify({ privateKey: "never" })}\n`);
  const forbidden = verifyMarketSdkRunManifest({ manifestPath: manifestFile });
  assert.equal(forbidden.ok, false);
  assert.match(forbidden.errors.join("\n"), /forbidden secret-shaped/i);

  const selfTest = spawnSync("node", ["scripts/market-sdk-run-manifest-check.mjs", "--self-test"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(selfTest.status, 0, selfTest.stderr || selfTest.stdout);
  assert.match(selfTest.stdout, /self-test passed/i);

  const output = join(tmp, "manifest-check.json");
  const outputRun = spawnSync("node", [
    "scripts/market-sdk-run-manifest-check.mjs",
    "--manifest",
    manifestFile,
    "--output",
    output,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(outputRun.status, 0, outputRun.stderr || outputRun.stdout);
  assert.equal(JSON.parse(await readFile(output, "utf8")).ok, false);

  console.log("Market SDK run manifest checker tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
