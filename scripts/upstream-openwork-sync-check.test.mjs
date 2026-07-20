#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const run = (args) =>
  spawnSync("node", ["scripts/upstream-openwork-sync-check.mjs", ...args], {
    encoding: "utf8",
  });

const result = run([
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

assert.equal(result.status, 0, result.stderr);

const plan = JSON.parse(result.stdout);
assert.equal(plan.upstreamUrl, "https://github.com/different-ai/openwork.git");
assert.equal(plan.upstreamBranch, "main");
assert.equal(plan.baseBranch, "dev");
assert.equal(plan.syncBranch, "codex/sync-openwork-2026-06-12");
assert.equal(plan.remoteStatus.status, "skipped");
assert.ok(plan.conflictZones.some((zone) => zone.name === "Branding and i18n"));
assert.ok(plan.conflictZones.some((zone) => zone.name === "Bittensor safety"));
assert.ok(plan.conflictZones.some((zone) => zone.name === "Agent control surface"));
assert.ok(plan.verificationCommands.includes("pnpm test:cli-packaging-rename"));
assert.ok(plan.verificationCommands.includes("pnpm test:opencode-abstraction-copy"));
assert.ok(plan.verificationCommands.includes("pnpm test:bittensor-operator-playbook"));
assert.ok(plan.nextCommands.some((command) => command.includes("git fetch openwork-upstream main")));

const human = run(["--date", "2026-06-12"]);
assert.equal(human.status, 0, human.stderr);
assert.ok(human.stdout.includes("Matterhorn Desks upstream OpenWork sync intake"));
assert.ok(human.stdout.includes("Recommended branch: codex/sync-openwork-2026-06-12"));

const help = run(["--help"]);
assert.equal(help.status, 0, help.stderr);
assert.ok(help.stdout.includes("--upstream-url <url>"));

const doc = readFileSync("docs/upstream-openwork-sync.md", "utf8");
assert.ok(doc.includes("OPENWORK_UPSTREAM_REMOTE=https://github.com/different-ai/openwork.git"));
assert.ok(doc.includes("Matterhorn-specific Bittensor"));
assert.ok(doc.includes("pnpm test:upstream-openwork-sync"));
assert.ok(doc.includes("matterhorn-work upstream openwork check --json"));
assert.ok(doc.includes("Do not auto-merge upstream OpenWork into Matterhorn `dev`."));

const broadPlan = readFileSync("docs/chat-native-crypto-execution-plan.md", "utf8");
assert.ok(broadPlan.includes("Foundation Lane: Upstream OpenWork Intake"));
assert.ok(broadPlan.includes("./upstream-openwork-sync.md"));

const matrix = readFileSync("docs/agent-control-coverage-matrix.md", "utf8");
assert.ok(matrix.includes("Upstream OpenWork intake"));
assert.ok(matrix.includes("test:upstream-openwork-sync"));
assert.ok(matrix.includes("test:upstream-openwork-cli"));

const serialized = `${result.stdout}\n${human.stdout}\n${doc}\n${broadPlan}\n${matrix}`.toLowerCase();
for (const forbidden of ["seed phrase field", "mnemonic field", "private key field", "wallet export field"]) {
  assert.equal(serialized.includes(forbidden), false, `sync plan should not add secret-shaped schema examples: ${forbidden}`);
}

console.log("Upstream OpenWork sync intake check passed.");
