#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/bittensor-customer-evidence-bundle.mjs");
const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-evidence-bundle-"));

try {
  const bittensor = path.join(tmp, "bittensor-live-qa.json");
  const agent = path.join(tmp, "agent-control-live-qa.json");
  const ci = path.join(tmp, "github-ci.json");
  const gate = path.join(tmp, "readiness.md");
  const timeline = path.join(tmp, "wallet-timeline.json");
  const adapterCanary = path.join(tmp, "adapter-canary.json");
  const receiptCheck = path.join(tmp, "receipt-check.json");
  const output = path.join(tmp, "bundle.md");
  const jsonOutput = path.join(tmp, "bundle.json");

  await writeFile(
    bittensor,
    JSON.stringify({
      ready: true,
      summary: { pass: 7, fail: 0, skip: 0 },
      stages: [
        { id: "readiness", label: "Bittensor readiness", status: "pass" },
        { id: "wallet.snapshot", label: "Wallet snapshot", status: "pass" },
        { id: "stake.unsigned_preview", label: "Unsigned staking preview", status: "pass" },
      ],
    }),
  );
  await writeFile(agent, JSON.stringify({ ready: true, summary: { pass: 4, fail: 0 }, stages: [] }));
  await writeFile(
    ci,
    JSON.stringify({
      workflow_runs: [
        { name: "Matterhorn Work Tests", conclusion: "success" },
        { name: "i18n Audit", conclusion: "success" },
        { name: "Alpha Channel macOS arm64", conclusion: "success" },
      ],
    }),
  );
  await writeFile(gate, "# Gate\n\nResult: READY_FOR_TEST_CUSTOMERS\n");
  await writeFile(timeline, JSON.stringify({ enabled: true, snapshotCount: 2, latestSnapshotAt: "2026-06-15T00:00:00.000Z" }));
  await writeFile(adapterCanary, JSON.stringify({
    readyForCanary: true,
    netuid: 14,
    serviceAdapter: "data_search",
    summary: { pass: 6, warn: 1, fail: 0 },
    findings: [{ area: "Endpoint", status: "pass" }],
  }));
  await writeFile(receiptCheck, JSON.stringify({
    accepted: true,
    txHash: `0x${"a".repeat(64)}`,
    blockHash: `0x${"b".repeat(64)}`,
    payloadSha256: "c".repeat(64),
    status: "finalized",
    action: "stake",
    netuid: 14,
    summary: { pass: 5, warn: 0, fail: 0 },
    findings: [{ area: "Payload hash", status: "pass" }],
    followUpPrompt: "Compare my public wallet state after this stake receipt.",
  }));

  execFileSync("node", [
    script,
    "--bittensor-live-qa",
    bittensor,
    "--agent-control-live-qa",
    agent,
    "--ci",
    ci,
    "--readiness-gate",
    gate,
    "--wallet-timeline",
    timeline,
    "--adapter-canary",
    adapterCanary,
    "--receipt-check",
    receiptCheck,
    "--require-adapter-canary",
    "--require-receipt-check",
    "--output",
    output,
    "--json-output",
    jsonOutput,
    "--strict",
  ]);

  const markdown = await readFile(output, "utf8");
  assert.match(markdown, /READY_FOR_TEST_CUSTOMERS/);
  assert.match(markdown, /Wallet snapshot/);
  assert.match(markdown, /wallet-timeline\.json/);
  assert.match(markdown, /adapter-canary\.json/);
  assert.match(markdown, /receipt-check\.json/);
  assert.match(markdown, /Receipt check accepted/);
  assert.doesNotMatch(markdown, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const summary = JSON.parse(await readFile(jsonOutput, "utf8"));
  assert.equal(summary.ready, true);
  assert.equal(summary.walletTimeline.snapshots, 2);
  assert.equal(summary.adapterCanary.ready, true);
  assert.equal(summary.receiptCheck.ready, true);
  assert.equal(summary.receiptCheck.status, "finalized");

  const bad = path.join(tmp, "bad.json");
  await writeFile(bad, JSON.stringify({ ready: true, seedPhrase: "never" }));
  assert.throws(
    () =>
      execFileSync("node", [
        script,
        "--bittensor-live-qa",
        bad,
        "--agent-control-live-qa",
        agent,
        "--ci",
        ci,
        "--readiness-gate",
        gate,
      ], { stdio: "pipe" }),
    /forbidden secret-shaped field/i,
  );

  const badReceipt = path.join(tmp, "bad-receipt.json");
  await writeFile(badReceipt, JSON.stringify({ accepted: true, signature: "0x1234" }));
  assert.throws(
    () =>
      execFileSync("node", [
        script,
        "--bittensor-live-qa",
        bittensor,
        "--agent-control-live-qa",
        agent,
        "--ci",
        ci,
        "--readiness-gate",
        gate,
        "--receipt-check",
        badReceipt,
      ], { stdio: "pipe" }),
    /forbidden secret-shaped field|forbidden signing/i,
  );

  console.log("Bittensor customer evidence bundle tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
