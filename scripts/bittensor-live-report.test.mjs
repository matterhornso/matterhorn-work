#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "bittensor-live-report.mjs");

function run(args, input = "") {
  const child = spawn("node", [scriptPath, ...args], { stdio: ["pipe", "pipe", "pipe"] });
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

const sample = {
  ready: true,
  ok: true,
  serverUrl: "http://127.0.0.1:8787",
  checkedAt: "2026-06-12T07:20:00.000Z",
  summary: { pass: 7, warn: 1, fail: 0, skip: 2 },
  requestCount: 8,
  artifacts: {
    readinessStatus: "ready",
    capabilityCount: 1,
    selectedCapabilityLevel: "adapter_required",
    bittensorContextId: "bt-chat-1",
    signingHandoffPayloadSha256: "d".repeat(64),
  },
  stages: [
    { id: "bittensor.readiness", label: "Read Bittensor readiness", status: "pass", readinessStatus: "ready" },
    { id: "bittensor.capabilities.list", label: "List subnet capability manifests", status: "pass", capabilityCount: 1 },
    { id: "bittensor.capabilities.subnet", label: "Read selected subnet capability manifest", status: "pass", capabilityLevel: "adapter_required", serviceAdapter: "inference" },
    { id: "bittensor.extrinsic.handoff", label: "Create checksumed external-signing handoff", status: "pass", payloadSha256: "d".repeat(64) },
    { id: "bittensor.wallet.snapshot", label: "Read watch-only TAO wallet snapshot", status: "skip", hint: "Pass --ss58-address with a public coldkey address to test wallet reads." },
    { id: "bittensor.subnet.unsupported_adapter", label: "Handle unsupported subnet service calls honestly", status: "warn", hint: "A subnet adapter is configured, so the unsupported-adapter fallback was not exercised in this environment." },
    { id: "bittensor.subnet.invocation_preview", label: "Preview subnet adapter request before invocation", status: "pass", requestSha256: "c".repeat(64), requiresConfirmation: true, adapterSupported: false },
  ],
  nextSteps: ["Run the full wallet preview path with a public SS58 address."],
};

const fromStdin = await run(["--title", "Custom Bittensor Report"], JSON.stringify(sample));
assert.equal(fromStdin.code, 0);
assert.ok(fromStdin.stdout.includes("# Custom Bittensor Report"));
assert.ok(fromStdin.stdout.includes("Result: ready"));
assert.ok(fromStdin.stdout.includes("bittensor.wallet.snapshot"));
assert.ok(fromStdin.stdout.includes("request sha256:"));
assert.ok(fromStdin.stdout.includes("payload sha256:"));
assert.ok(fromStdin.stdout.includes("capabilities: 1"));
assert.ok(fromStdin.stdout.includes("capability: adapter_required"));
assert.ok(fromStdin.stdout.includes("requires confirmation: true"));
assert.ok(fromStdin.stdout.includes("Skipped Coverage"));
assert.ok(fromStdin.stdout.includes("Run the full wallet preview path with a public SS58 address."));
assert.equal(/seed phrase field|private key field|wallet export field/i.test(fromStdin.stdout), false);

const dir = await mkdtemp(join(tmpdir(), "matterhorn-bittensor-report-"));
const inputPath = join(dir, "qa.json");
const outputPath = join(dir, "report.md");
await writeFile(inputPath, JSON.stringify(sample), "utf8");
const fromFile = await run(["--input", inputPath, "--output", outputPath, "--strict"]);
assert.equal(fromFile.code, 0);
const output = await readFile(outputPath, "utf8");
assert.ok(output.includes("Matterhorn Work Bittensor Live Readiness Report"));
assert.ok(output.includes("| readinessStatus | ready |"));

const failed = await run(["--strict"], JSON.stringify({
  ready: false,
  ok: false,
  summary: { pass: 1, warn: 0, fail: 1, skip: 0 },
  stages: [{ id: "bittensor.readiness", label: "Readiness", status: "fail", error: "provider unavailable" }],
}));
assert.equal(failed.code, 1);
assert.ok(failed.stdout.includes("not ready"));
assert.ok(failed.stdout.includes("provider unavailable"));

const forbidden = await run([], JSON.stringify({
  ready: true,
  summary: { pass: 1, warn: 0, fail: 0, skip: 0 },
  stages: [],
  artifacts: { seedPhrase: "never" },
}));
assert.notEqual(forbidden.code, 0);
assert.match(forbidden.stderr, /forbidden secret-shaped field/i);

console.log("Matterhorn Bittensor live readiness report test passed.");
