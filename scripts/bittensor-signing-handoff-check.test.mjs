#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/bittensor-signing-handoff-check.mjs");
const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-handoff-check-"));
const sha = "a".repeat(64);

function expectCommandFailure(args, pattern) {
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
  const handoffPath = path.join(tmp, "handoff.json");
  const output = path.join(tmp, "handoff.md");
  const jsonOutput = path.join(tmp, "handoff-check.json");
  await writeFile(
    handoffPath,
    JSON.stringify({
      handoff: {
        payloadSha256: sha,
        expiresAt: "2026-06-16T00:00:00.000Z",
        requiresExternalSignature: true,
        preview: { action: "stake", netuid: 14, amountTao: "1" },
      },
    }),
  );

  execFileSync("node", [
    script,
    "--handoff",
    handoffPath,
    "--expected-sha",
    sha,
    "--now",
    "2026-06-15T00:00:00.000Z",
    "--output",
    output,
    "--json-output",
    jsonOutput,
    "--strict",
  ]);

  const markdown = await readFile(output, "utf8");
  assert.match(markdown, /READY_FOR_EXTERNAL_SIGNER/);
  assert.match(markdown, /stake/);
  assert.doesNotMatch(markdown, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const summary = JSON.parse(await readFile(jsonOutput, "utf8"));
  assert.equal(summary.readyToSign, true);
  assert.equal(summary.payloadSha256, sha);
  assert.equal(summary.summary.fail, 0);

  expectCommandFailure(
    [
      "--handoff",
      handoffPath,
      "--expected-sha",
      "b".repeat(64),
      "--now",
      "2026-06-15T00:00:00.000Z",
      "--strict",
    ],
    /Expected payload SHA-256 does not match/i,
  );

  expectCommandFailure(
    [
      "--handoff-json",
      JSON.stringify({ payloadSha256: sha, expiresAt: "2026-06-14T00:00:00.000Z", requiresExternalSignature: true }),
      "--now",
      "2026-06-15T00:00:00.000Z",
      "--strict",
    ],
    /Handoff expired/i,
  );

  expectCommandFailure(
    [
      "--handoff-json",
      JSON.stringify({ payloadSha256: sha, expiresAt: "2026-06-16T00:00:00.000Z", signature: "0x1234" }),
    ],
    /forbidden signing or credential field/i,
  );

  console.log("Bittensor signing handoff check tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
