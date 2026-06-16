#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "bittensor-real-adapter-candidate-gate.mjs");

function run(args) {
  const child = spawn("node", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

const dir = await mkdtemp(join(tmpdir(), "matterhorn-real-adapter-candidate-"));
const candidatePath = join(dir, "candidate.json");
const outputPath = join(dir, "candidate.md");
const jsonOutputPath = join(dir, "candidate-output.json");

const candidate = {
  id: "docs-search-canary-v1",
  netuid: 14,
  adapterKind: "data_search",
  endpoint: "https://adapter.example.com/v1/search",
  supportedIntents: ["service_call", "data_search"],
  requiredAuth: "none",
  costModel: "free_read",
  privacy: { sendsWalletData: false, sendsKeyMaterial: false },
  timeoutMs: 10000,
  rateLimit: { requestsPerMinute: 12 },
  rollback: { owner: "Matterhorn operator", disableEnv: "BITTENSOR_ENABLE_REAL_SUBNET_ADAPTERS=0" },
  canaryTask: "Find public Bittensor docs about subnet 14.",
};
await writeFile(candidatePath, JSON.stringify(candidate), "utf8");

const ok = await run([
  "--candidate-json", candidatePath,
  "--allowed-hosts", "adapter.example.com",
  "--preferred-kind", "data_search",
  "--preferred-intent", "data_search",
  "--output", outputPath,
  "--json-output", jsonOutputPath,
  "--strict",
]);
assert.equal(ok.code, 0, ok.stderr || ok.stdout);
const markdown = await readFile(outputPath, "utf8");
const summary = JSON.parse(await readFile(jsonOutputPath, "utf8"));
assert.ok(markdown.includes("READY_FOR_READONLY_CANARY"));
assert.ok(markdown.includes("Endpoint host: adapter.example.com"));
assert.equal(markdown.includes("https://adapter.example.com/v1/search"), false);
assert.equal(summary.readyForReadOnlyCanary, true);
assert.equal(summary.safety.callsAdapterService, false);
assert.equal(summary.endpointHost, "adapter.example.com");
assert.ok(summary.suggestedCommands.readonlyCanary.includes("--allow-real-adapter-call"));

const badHost = await run([
  "--candidate-json", candidatePath,
  "--allowed-hosts", "other.example.com",
  "--strict",
]);
assert.equal(badHost.code, 1);
assert.ok(badHost.stdout.includes("not in --allowed-hosts"));

const unsafePrivacyPath = join(dir, "unsafe-privacy.json");
await writeFile(unsafePrivacyPath, JSON.stringify({ ...candidate, privacy: { sendsWalletData: true, sendsKeyMaterial: false } }), "utf8");
const unsafePrivacy = await run(["--candidate-json", unsafePrivacyPath, "--allowed-hosts", "adapter.example.com", "--strict"]);
assert.equal(unsafePrivacy.code, 1);
assert.ok(unsafePrivacy.stdout.includes("wallet data or key material"));

const forbiddenPath = join(dir, "forbidden.json");
await writeFile(forbiddenPath, JSON.stringify({ ...candidate, apiKey: "never" }), "utf8");
const forbidden = await run(["--candidate-json", forbiddenPath, "--allowed-hosts", "adapter.example.com", "--strict"]);
assert.equal(forbidden.code, 1);
assert.ok(forbidden.stdout.includes("forbidden credential or signing field"));

console.log("Matterhorn Bittensor real adapter candidate gate test passed.");
