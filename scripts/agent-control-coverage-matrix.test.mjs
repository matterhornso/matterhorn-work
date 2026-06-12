#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const matrix = readFileSync("docs/agent-control-coverage-matrix.md", "utf8");
const surface = readFileSync("docs/agent-control-surface.md", "utf8");
const api = readFileSync("docs/agent-control-api.md", "utf8");
const mcp = readFileSync("packages/matterhorn-work-mcp/index.mjs", "utf8");
const cli = readFileSync("apps/orchestrator/src/cli.ts", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const rows = [
  ["GET /health", "matterhorn_doctor", "matterhorn-work doctor"],
  ["GET /health", "matterhorn_status", "matterhorn-work status"],
  ["POST /workspace/:workspaceId/sessions", "matterhorn_create_session", "matterhorn-work sessions create"],
  ["GET /workspace/:workspaceId/sessions", "matterhorn_list_sessions", "matterhorn-work sessions list"],
  ["GET /workspace/:workspaceId/sessions/:sessionId", "matterhorn_get_session", "matterhorn-work sessions get"],
  ["GET /workspace/:workspaceId/sessions/:sessionId/messages", "matterhorn_get_session_messages", "matterhorn-work sessions messages"],
  ["POST /workspace/:workspaceId/sessions/:sessionId/messages", "matterhorn_submit_session_prompt", "matterhorn-work sessions prompt"],
  ["GET /workspace/:workspaceId/sessions/:sessionId/status", "matterhorn_get_session_status", "matterhorn-work sessions status"],
  ["GET /workspace/:workspaceId/sessions/:sessionId/snapshot", "matterhorn_get_session_snapshot", "matterhorn-work sessions snapshot"],
  ["GET /workspace/:workspaceId/sessions/:sessionId/events", "matterhorn_watch_session_events", "matterhorn-work sessions events"],
  ["DELETE /workspace/:workspaceId/sessions/:sessionId", "matterhorn_delete_session", "matterhorn-work sessions delete"],
  ["POST /workspace/:workspaceId/files/sessions", "matterhorn_create_file_session", "matterhorn-work files session create"],
  ["GET /files/sessions/:sessionId/catalog/snapshot", "matterhorn_file_catalog", "matterhorn-work files catalog"],
  ["GET /files/sessions/:sessionId/catalog/events", "matterhorn_watch_file_events", "matterhorn-work files events"],
  ["POST /files/sessions/:sessionId/read-batch", "matterhorn_read_files", "matterhorn-work files read"],
  ["POST /files/sessions/:sessionId/write-batch", "matterhorn_write_files", "matterhorn-work files write"],
  ["DELETE /files/sessions/:sessionId", "matterhorn_close_file_session", "matterhorn-work files session close"],
  ["GET /approvals", "matterhorn_list_approvals", "matterhorn-work approvals list"],
  ["POST /approvals/:approvalId", "matterhorn_reply_approval", "matterhorn-work approvals reply"],
  ["POST /api/bittensor/chat/execute", "matterhorn_bittensor_chat", "matterhorn-work bittensor chat"],
  ["GET /api/bittensor/readiness", "matterhorn_bittensor_readiness", "matterhorn-work bittensor readiness"],
];

for (const [route, tool, command] of rows) {
  assert.ok(matrix.includes(route), `coverage matrix missing HTTP route: ${route}`);
  assert.ok(matrix.includes(tool), `coverage matrix missing MCP tool: ${tool}`);
  assert.ok(matrix.includes(command), `coverage matrix missing CLI command/status: ${command}`);
  assert.ok(api.includes(route), `API docs missing route listed by coverage matrix: ${route}`);
  assert.ok(mcp.includes(tool), `MCP server missing tool listed by coverage matrix: ${tool}`);
}

for (const command of [
  "sessions create",
  "sessions prompt",
  "sessions status",
  "sessions snapshot",
  "sessions events",
  "files session",
  "approvals list",
  "bittensor chat",
  "bittensor readiness",
  "doctor",
]) {
  assert.ok(cli.includes(command), `CLI help or implementation missing command listed by coverage matrix: ${command}`);
}

for (const scriptName of [
  "test:agent-control-coverage-matrix",
  "test:agent-operator-workflow",
  "test:bittensor-operator-playbook",
  "test:bittensor-live-qa",
  "test:bittensor-live-report",
  "test:agent-control-doctor",
  "test:agent-control-live-qa",
  "test:agent-control-api-docs",
  "test:mcp-config-cli",
  "test:agent-session-progress-smoke",
]) {
  assert.ok(packageJson.scripts[scriptName], `package.json missing required check: ${scriptName}`);
  assert.ok(matrix.includes(scriptName), `coverage matrix missing required check: ${scriptName}`);
}

for (const forbidden of [
  "seed phrase field",
  "mnemonic field",
  "private key field",
  "wallet export field",
]) {
  assert.equal(matrix.toLowerCase().includes(forbidden), false, `coverage matrix should not introduce secret-shaped fields: ${forbidden}`);
}

assert.ok(surface.includes("./agent-control-coverage-matrix.md"), "agent control surface should link the coverage matrix");
assert.ok(surface.includes("./agent-operator-workflow.md"), "agent control surface should link the operator workflow");
assert.ok(surface.includes("./bittensor-operator-playbook.md"), "agent control surface should link the Bittensor operator playbook");
assert.ok(surface.includes("./bittensor-live-qa.md"), "agent control surface should link the Bittensor live QA harness");
assert.ok(surface.includes("./agent-control-live-qa.md"), "agent control surface should link the live QA harness");
assert.ok(matrix.includes("Agent operator workflow"), "coverage matrix should list the operator workflow");
assert.ok(matrix.includes("Bittensor operator playbook"), "coverage matrix should list the Bittensor operator playbook");
assert.ok(matrix.includes("Bittensor live QA harness"), "coverage matrix should list the Bittensor live QA harness");
assert.ok(matrix.includes("node scripts/bittensor-live-qa.mjs"), "coverage matrix should list the Bittensor live QA command");
assert.ok(matrix.includes("node scripts/agent-control-live-qa.mjs"), "coverage matrix should list the live QA harness");
assert.ok(api.includes("GET /api/bittensor/readiness"), "API docs should include the Bittensor readiness route used by live QA");

console.log("Matterhorn agent control coverage matrix static check passed.");
