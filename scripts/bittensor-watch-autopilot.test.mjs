#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/bittensor-watch-autopilot.mjs");
const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-watch-autopilot-"));

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
  const fixture = path.join(tmp, "check.json");
  const output = path.join(tmp, "watch.md");
  const jsonOutput = path.join(tmp, "watch.json");
  await writeFile(
    fixture,
    JSON.stringify({
      success: true,
      evaluations: [
        { watch: { id: "ok", kind: "subnet", netuid: 1, label: "Subnet ok" }, status: "ok" },
        {
          alertKey: "validator:14:abc",
          notificationIntent: "review_validator",
          status: "alert",
          watch: {
            id: "validator",
            kind: "validator",
            netuid: 14,
            validatorHotkey: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX",
            label: "Validator drift",
          },
          copilotActions: [{
            label: "Analyze validator",
            prompt: "Analyze validator 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX on subnet 14.",
          }],
        },
        {
          alertKey: "wallet:5abc",
          notificationIntent: "review_wallet",
          status: "warning",
          watch: { id: "wallet", kind: "wallet", ss58Address: "5Ek9wb5tA5Vb1o19pzTF4DzqmFTpFq1FBMx64nrAR76pRVoX" },
        },
      ],
    }),
  );

  execFileSync("node", [
    script,
    "--check-json",
    fixture,
    "--output",
    output,
    "--json-output",
    jsonOutput,
    "--strict",
  ], { stdio: "pipe" });

  const markdown = await readFile(output, "utf8");
  assert.match(markdown, /READ_ONLY_ALERT_REPORT/);
  assert.match(markdown, /Notification Summary/);
  assert.match(markdown, /Validator drift/);
  assert.match(markdown, /Analyze validator/);

  const summary = JSON.parse(await readFile(jsonOutput, "utf8"));
  assert.equal(summary.ok, true);
  assert.equal(summary.total, 3);
  assert.equal(summary.alertCount, 2);
  assert.equal(summary.notificationSummary.totalNotifications, 2);
  assert.equal(summary.notificationSummary.intents.review_validator, 1);
  assert.equal(summary.notificationSummary.intents.review_wallet, 1);
  assert.equal(summary.notificationSummary.promptSamples[0].prompt.includes("Analyze validator"), true);
  assert.equal(summary.notificationSummary.safety, "read_only_chat_prompts");
  assert.equal(summary.safety.signsOrBroadcasts, false);
  assert.equal(summary.safety.submitsTransactions, false);
  assert.equal(summary.safety.invokesSubnetServices, false);
  assert.equal(summary.alerts[1].prompt.includes("Review public Bittensor wallet"), true);

  const badFixture = path.join(tmp, "bad.json");
  const badJsonOutput = path.join(tmp, "bad.json.out");
  await writeFile(
    badFixture,
    JSON.stringify({
      success: true,
      evaluations: [{ status: "alert", seedPhrase: "never", watch: { kind: "wallet" } }],
    }),
  );
  expectCommandFailure(
    [
      "--check-json",
      badFixture,
      "--json-output",
      badJsonOutput,
      "--strict",
    ],
    /forbidden credential or signing field/i,
  );
  const badSummary = JSON.parse(await readFile(badJsonOutput, "utf8"));
  assert.equal(badSummary.ok, false);
  assert.match(badSummary.error, /forbidden credential or signing field/i);

  console.log("Bittensor watch autopilot tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
