#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCryptoCustomerPacket } from "./crypto-customer-packet.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/crypto-customer-packet.mjs");
const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-crypto-customer-packet-"));

try {
  const smoke = path.join(tmp, "smoke.json");
  const marketVerify = path.join(tmp, "market-verify.json");
  const bittensorBundle = path.join(tmp, "bittensor-bundle.json");
  const output = path.join(tmp, "packet.md");
  const jsonOutput = path.join(tmp, "packet.json");

  await writeFile(smoke, JSON.stringify({
    ready: true,
    summary: { pass: 31, fail: 0, skip: 0 },
    stages: [{ id: "crypto.unified_chat", status: "pass" }],
    safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
  }));
  await writeFile(marketVerify, JSON.stringify({
    ok: true,
    ready: true,
    status: "READY_FOR_TEST_CUSTOMER_QA",
    errors: [],
    warnings: [],
    safety: { nonCustodial: true, liveSubmissionEnabled: false, signsOrSubmits: false, acceptsSecrets: false },
  }));
  await writeFile(bittensorBundle, JSON.stringify({
    ready: true,
    errors: [],
    warnings: [],
  }));

  const direct = await buildCryptoCustomerPacket({
    customerReadySmoke: smoke,
    marketEvidenceVerify: marketVerify,
    bittensorEvidenceBundle: bittensorBundle,
    requireMarketEvidence: true,
    requireBittensorEvidence: true,
    title: "Test Packet",
  });
  assert.equal(direct.packet.ready, true);
  assert.equal(direct.packet.safety.liveSubmissionEnabled, false);
  assert.match(direct.markdown, /READY_FOR_TEST_CUSTOMER_QA/);

  execFileSync("node", [
    script,
    "--customer-ready-smoke",
    smoke,
    "--market-evidence-verify",
    marketVerify,
    "--bittensor-evidence-bundle",
    bittensorBundle,
    "--require-market-evidence",
    "--require-bittensor-evidence",
    "--output",
    output,
    "--json-output",
    jsonOutput,
    "--strict",
  ]);

  const markdown = await readFile(output, "utf8");
  assert.match(markdown, /Crypto Customer Packet/);
  assert.match(markdown, /Customer-ready crypto smoke/);
  assert.match(markdown, /Market evidence verifier/);
  assert.match(markdown, /Bittensor evidence bundle/);
  assert.match(markdown, /31 passed, 0 failed, 0 skipped/);
  assert.doesNotMatch(markdown, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const packet = JSON.parse(await readFile(jsonOutput, "utf8"));
  assert.equal(packet.ready, true);
  assert.equal(packet.customerReadySmoke.pass, 31);
  assert.equal(packet.marketEvidence.ready, true);
  assert.equal(packet.bittensorEvidence.ready, true);

  const missingMarket = spawnSync("node", [
    script,
    "--customer-ready-smoke",
    smoke,
    "--require-market-evidence",
    "--strict",
  ], { encoding: "utf8" });
  assert.notEqual(missingMarket.status, 0, "strict packet should fail when market evidence is required but absent");
  assert.match(`${missingMarket.stdout}\n${missingMarket.stderr}`, /Market evidence verification is required but missing/i);

  const bad = path.join(tmp, "bad-market.json");
  await writeFile(bad, JSON.stringify({ ok: true, privateKey: "never" }));
  assert.throws(
    () =>
      execFileSync("node", [
        script,
        "--customer-ready-smoke",
        smoke,
        "--market-evidence-verify",
        bad,
        "--strict",
      ], { stdio: "pipe" }),
    /forbidden secret-shaped field/i,
  );

  console.log("Crypto customer packet tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
