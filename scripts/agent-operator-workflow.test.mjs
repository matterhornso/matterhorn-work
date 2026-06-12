#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile("docs/agent-operator-workflow.md", "utf8");
const surface = await readFile("docs/agent-control-surface.md", "utf8");
const install = await readFile("docs/agent-mcp-install.md", "utf8");
const matrix = await readFile("docs/agent-control-coverage-matrix.md", "utf8");
const pkg = JSON.parse(await readFile("package.json", "utf8"));

for (const phrase of [
  "matterhorn-work start",
  "matterhorn-work doctor --strict --json",
  "node scripts/agent-control-live-qa.mjs",
  "codex mcp add matterhorn-work",
  "claude mcp add --transport stdio",
  "matterhorn-work sessions create",
  "matterhorn-work sessions prompt",
  "matterhorn-work sessions events",
  "matterhorn-work files session create",
  "matterhorn-work files read",
  "matterhorn-work files write",
  "matterhorn-work bittensor readiness",
  "matterhorn-work bittensor chat",
  "matterhorn_doctor",
  "matterhorn_create_session",
  "matterhorn_submit_session_prompt",
  "matterhorn_watch_session_events",
  "matterhorn_create_file_session",
  "matterhorn_read_files",
  "matterhorn_write_files",
  "matterhorn_bittensor_chat",
]) {
  assert.ok(workflow.includes(phrase), `operator workflow should include ${phrase}`);
}

for (const safetyPhrase of [
  "read-only file sessions",
  "host token",
  "Do not put tokens in URLs",
  "seed phrases",
  "mnemonics",
  "private keys",
  "wallet exports",
  "public SS58 addresses",
]) {
  assert.ok(workflow.includes(safetyPhrase), `operator workflow should include safety phrase: ${safetyPhrase}`);
}

assert.ok(surface.includes("./agent-operator-workflow.md"), "agent control surface should link the operator workflow");
assert.ok(install.includes("./agent-operator-workflow.md"), "MCP install guide should link the operator workflow");
assert.ok(matrix.includes("Agent operator workflow"), "coverage matrix should list the operator workflow");
assert.ok(matrix.includes("test:agent-operator-workflow"), "coverage matrix should include the operator workflow test");
assert.equal(pkg.scripts["test:agent-operator-workflow"], "node scripts/agent-operator-workflow.test.mjs");

console.log("Matterhorn agent operator workflow docs check passed.");
