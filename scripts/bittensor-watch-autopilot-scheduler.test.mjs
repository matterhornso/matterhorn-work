#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/bittensor-watch-autopilot-scheduler.mjs");
const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-watch-scheduler-"));

function expectFailure(args, pattern) {
  try { execFileSync("node", [script, ...args], { stdio: "pipe" }); }
  catch (error) {
    const output = (error.stdout?.toString("utf8") || "") + "\n" + (error.stderr?.toString("utf8") || "") + "\n" + (error.message || "");
    assert.match(output, pattern);
    return;
  }
  assert.fail("Expected command to fail.");
}

try {
  const fixture = path.join(tmp, "check.json");
  const jsonl = path.join(tmp, "watch.jsonl");
  const summaryOut = path.join(tmp, "summary.json");
  await writeFile(fixture, JSON.stringify({ success: true, evaluations: [
    { watch: { id: "ok", kind: "subnet", netuid: 1, label: "Subnet ok" }, status: "ok" },
    { alertKey: "wallet:5abc", notificationIntent: "review_wallet", status: "warning", watch: { kind: "wallet", ss58Address: "5Ek9wb5tA5Vb1o19pzTF4DzqmFTpFq1FBMx64nrAR76pRVoX" } },
  ] }));
  execFileSync("node", [script, "--check-json", fixture, "--iterations", "2", "--interval-ms", "1", "--jsonl-output", jsonl, "--summary-output", summaryOut, "--strict"], { stdio: "pipe" });
  const lines = (await readFile(jsonl, "utf8")).trim().split("\n");
  assert.equal(lines.length, 2);
  const first = JSON.parse(lines[0]);
  assert.equal(first.ok, true);
  assert.equal(first.alertCount, 1);
  assert.equal(first.safety.signsOrBroadcasts, false);
  assert.equal(first.safety.invokesSubnetServices, false);
  assert.match(first.alerts[0].prompt, /Review public Bittensor wallet/);
  const summary = JSON.parse(await readFile(summaryOut, "utf8"));
  assert.equal(summary.ok, true);
  assert.equal(summary.iterations, 2);
  assert.equal(summary.totalAlerts, 2);
  assert.equal(summary.safety.submitsTransactions, false);
  const bad = path.join(tmp, "bad.json");
  await writeFile(bad, JSON.stringify({ success: true, evaluations: [{ status: "alert", seedPhrase: "never" }] }));
  expectFailure(["--check-json", bad, "--iterations", "1", "--strict"], /forbidden credential or signing field/i);
  console.log("Bittensor watch autopilot scheduler tests passed.");
} finally { await rm(tmp, { recursive: true, force: true }); }
