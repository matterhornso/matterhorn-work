#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cliPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "apps", "orchestrator", "src", "cli.ts");

function run(args) {
  return spawnSync("bun", [cliPath, "upstream", "openwork", "check", ...args], {
    encoding: "utf8",
  });
}

const json = run([
  "--json",
  "--upstream-url",
  "https://github.com/different-ai/openwork.git",
  "--upstream-branch",
  "main",
  "--base-branch",
  "dev",
  "--date",
  "2026-06-12",
]);
assert.equal(json.status, 0, json.stderr);
const plan = JSON.parse(json.stdout);
assert.equal(plan.upstreamUrl, "https://github.com/different-ai/openwork.git");
assert.equal(plan.upstreamBranch, "main");
assert.equal(plan.baseBranch, "dev");
assert.equal(plan.syncBranch, "codex/sync-openwork-2026-06-12");
assert.equal(plan.remoteStatus.status, "skipped");
assert.ok(plan.conflictZones.some((zone) => zone.name === "Bittensor safety"));

const human = run(["--date", "2026-06-12"]);
assert.equal(human.status, 0, human.stderr);
assert.ok(human.stdout.includes("Matterhorn Desks upstream OpenWork sync intake"));
assert.ok(human.stdout.includes("Recommended branch: codex/sync-openwork-2026-06-12"));

const bad = spawnSync("bun", [cliPath, "upstream", "other", "check"], { encoding: "utf8" });
assert.notEqual(bad.status, 0);
assert.match(bad.stderr, /upstream requires openwork/);

const serialized = `${json.stdout}\n${human.stdout}`.toLowerCase();
for (const forbidden of ["seed phrase field", "mnemonic field", "private key field", "wallet export field"]) {
  assert.equal(serialized.includes(forbidden), false, `sync CLI should not add secret-shaped schema examples: ${forbidden}`);
}

console.log("Matterhorn upstream OpenWork CLI check passed.");
