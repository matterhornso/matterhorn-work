#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const playbook = await readFile("docs/bittensor-operator-playbook.md", "utf8");
const operator = await readFile("docs/agent-operator-workflow.md", "utf8");
const surface = await readFile("docs/agent-control-surface.md", "utf8");
const matrix = await readFile("docs/agent-control-coverage-matrix.md", "utf8");
const pkg = JSON.parse(await readFile("package.json", "utf8"));

for (const phrase of [
  "matterhorn-work bittensor readiness",
  "matterhorn-work bittensor chat",
  "matterhorn_bittensor_readiness",
  "matterhorn_bittensor_chat",
  "I'm new to Bittensor",
  "Show my TAO",
  "Where am I staked",
  "Which Bittensor subnet is useful for image generation",
  "Compare validators on subnet 14",
  "Prepare staking 1 TAO safely",
  "Use subnet 14",
  "context-id",
  "contextId",
  "wallet_snapshot",
  "subnet comparison cards",
  "validator selection cards",
  "unsigned_preview",
  "clarification_required",
  "unsupported",
  "external signature required",
]) {
  assert.ok(playbook.includes(phrase), `Bittensor operator playbook should include: ${phrase}`);
}

for (const safetyPhrase of [
  "seed phrases",
  "mnemonics",
  "private keys",
  "keyfiles",
  "wallet exports",
  "public SS58 addresses",
  "coldkey",
  "hotkey",
  "netuid",
  "validator hotkey",
  "Do not give financial advice",
  "Never invent a validator hotkey",
  "no signing happens inside Matterhorn",
]) {
  assert.ok(playbook.includes(safetyPhrase), `Bittensor operator playbook should include safety phrase: ${safetyPhrase}`);
}

for (const command of [
  "--ss58-address",
  "--netuid 14",
  "--amount-tao 1",
  "--validator-hotkey",
  "--coldkey",
  "--rate-tolerance 0.01",
  "--limit 5",
  "--strategy balanced",
]) {
  assert.ok(playbook.includes(command), `Bittensor operator playbook should include CLI option: ${command}`);
}

assert.ok(operator.includes("./bittensor-operator-playbook.md"), "agent operator workflow should link the Bittensor playbook");
assert.ok(surface.includes("./bittensor-operator-playbook.md"), "agent control surface should link the Bittensor playbook");
assert.ok(matrix.includes("Bittensor operator playbook"), "coverage matrix should list the Bittensor operator playbook");
assert.ok(matrix.includes("test:bittensor-operator-playbook"), "coverage matrix should include the Bittensor playbook test");
assert.equal(pkg.scripts["test:bittensor-operator-playbook"], "node scripts/bittensor-operator-playbook.test.mjs");

console.log("Matterhorn Bittensor operator playbook docs check passed.");
