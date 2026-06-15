#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/bittensor-receipt-check.mjs");
const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-receipt-check-"));
const sha = "c".repeat(64);
const txHash = `0x${"d".repeat(64)}`;
const blockHash = `0x${"e".repeat(64)}`;

function expectFailure(args, pattern) {
  try {
    execFileSync("node", [script, ...args], { stdio: "pipe" });
  } catch (error) {
    const output = `${error.stdout?.toString("utf8") || ""}\n${error.stderr?.toString("utf8") || ""}\n${error.message || ""}`;
    assert.match(output, pattern);
    return;
  }
  assert.fail("Expected command to fail.");
}

try {
  const receipt = path.join(tmp, "receipt.json");
  const output = path.join(tmp, "receipt.md");
  const jsonOutput = path.join(tmp, "receipt.out.json");
  await writeFile(
    receipt,
    JSON.stringify({
      receipt: {
        txHash,
        blockHash,
        status: "finalized",
        payloadSha256: sha,
        action: "stake",
        netuid: 14,
      },
    }),
  );

  execFileSync("node", [
    script,
    "--receipt",
    receipt,
    "--expected-payload-sha",
    sha,
    "--expected-action",
    "stake",
    "--expected-netuid",
    "14",
    "--output",
    output,
    "--json-output",
    jsonOutput,
    "--strict",
  ]);

  const markdown = await readFile(output, "utf8");
  assert.match(markdown, /RECEIPT_CAPTURED/);
  assert.match(markdown, /Suggested Follow-Up Prompt/);
  assert.doesNotMatch(markdown, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const summary = JSON.parse(await readFile(jsonOutput, "utf8"));
  assert.equal(summary.accepted, true);
  assert.equal(summary.txHash, txHash);
  assert.equal(summary.safety.acceptsRawSignatures, false);
  assert.match(summary.followUpPrompt, /Compare my public wallet state/i);

  expectFailure(
    [
      "--receipt-json",
      JSON.stringify({ txHash, status: "finalized", payloadSha256: sha, action: "stake", netuid: 14 }),
      "--expected-payload-sha",
      "f".repeat(64),
      "--strict",
    ],
    /Receipt payload SHA-256 does not match/i,
  );

  expectFailure(
    [
      "--receipt-json",
      JSON.stringify({ txHash, status: "finalized", payloadSha256: sha, action: "stake", netuid: 14, signature: "0x1234" }),
      "--strict",
    ],
    /forbidden signing or credential field/i,
  );

  console.log("Bittensor receipt check tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
