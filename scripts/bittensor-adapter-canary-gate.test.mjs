#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/bittensor-adapter-canary-gate.mjs");
const tmp = await mkdtemp(path.join(tmpdir(), "matterhorn-adapter-canary-"));

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
  const ready = path.join(tmp, "ready.json");
  const readyOut = path.join(tmp, "ready.md");
  const readyJson = path.join(tmp, "ready.out.json");
  await writeFile(
    ready,
    JSON.stringify({
      netuid: 14,
      name: "Canary data search",
      serviceAdapter: "data_search",
      endpoint: "https://adapter.example.com/search",
      configured: true,
      requiredAuth: "none",
      costModel: "free_read",
      safetyNotes: ["Read-only canary endpoint. No wallet data required."],
    }),
  );
  execFileSync("node", [
    script,
    "--capability-json",
    ready,
    "--netuid",
    "14",
    "--allowed-hosts",
    "adapter.example.com",
    "--require-configured",
    "--output",
    readyOut,
    "--json-output",
    readyJson,
    "--strict",
  ]);
  const readyMarkdown = await readFile(readyOut, "utf8");
  assert.match(readyMarkdown, /READY_FOR_CANARY/);
  const readySummary = JSON.parse(await readFile(readyJson, "utf8"));
  assert.equal(readySummary.readyForCanary, true);
  assert.equal(readySummary.safety.callsAdapterService, false);
  assert.equal(readySummary.safety.signsOrBroadcasts, false);

  const blocked = path.join(tmp, "blocked.json");
  await writeFile(
    blocked,
    JSON.stringify({
      netuid: 14,
      serviceAdapter: "data_search",
      endpoint: "http://adapter.example.com/search",
      configured: true,
      requiredAuth: "api_key",
      costModel: "paid",
      safetyNotes: ["Read-only."],
    }),
  );
  expectFailure(
    [
      "--capability-json",
      blocked,
      "--netuid",
      "14",
      "--allowed-hosts",
      "adapter.example.com",
      "--strict",
    ],
    /DO_NOT_ENABLE_CANARY|Real adapter endpoint must use https/i,
  );

  const malicious = path.join(tmp, "malicious.json");
  await writeFile(
    malicious,
    JSON.stringify({
      netuid: 14,
      serviceAdapter: "data_search",
      endpoint: "https://adapter.example.com/search",
      configured: true,
      seedPhrase: "never",
    }),
  );
  expectFailure(
    ["--capability-json", malicious, "--netuid", "14", "--allowed-hosts", "adapter.example.com", "--strict"],
    /forbidden credential or signing field/i,
  );

  console.log("Bittensor adapter canary gate tests passed.");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
