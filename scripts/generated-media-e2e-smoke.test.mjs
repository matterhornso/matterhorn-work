#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/generated-media-e2e-smoke.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const platformSafetyGate = readFileSync("scripts/matterhorn-platform-safety-gate.mjs", "utf8");

assert.equal(
  packageJson.scripts?.["smoke:generated-media-e2e"],
  "node scripts/generated-media-e2e-smoke.mjs",
  "package.json should expose the generated-media E2E smoke",
);
assert.equal(
  packageJson.scripts?.["test:generated-media-e2e-smoke"],
  "node scripts/generated-media-e2e-smoke.test.mjs",
  "package.json should expose the generated-media E2E smoke contract",
);

for (const required of [
  "Matterhorn generated-media E2E smoke",
  "scripts/dev-generated-media-smoke.mjs",
  "scripts/generated-media-browser-smoke.mjs",
  "--strict",
  "--url",
  "--output-dir",
  "App:",
  "SIGINT",
  "SIGTERM",
  "STACK_READY_TIMEOUT_MS",
  "SMOKE_TIMEOUT_MS",
]) {
  assert.ok(script.includes(required), `generated-media E2E smoke missing ${required}`);
}

assert.ok(
  script.includes("http:\\/\\/127\\.0\\.0\\.1") &&
    script.includes("\\/workspace\\/") &&
    script.includes("\\/session"),
  "generated-media E2E smoke should parse the generated app session URL",
);
assert.ok(
  script.includes("process.stdout.write(text)") && script.includes("process.stderr.write(String(chunk))"),
  "generated-media E2E smoke should stream child process logs for debuggability",
);
assert.ok(
  platformSafetyGate.includes("scripts/generated-media-e2e-smoke.test.mjs"),
  "platform safety gate should cover generated-media E2E smoke wiring",
);

console.log("Generated-media E2E smoke contract passed.");
