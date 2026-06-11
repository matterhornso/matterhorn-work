#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const docs = readFileSync("docs/agent-control-api.md", "utf8");
const surface = readFileSync("docs/agent-control-surface.md", "utf8");
const mcpReadme = readFileSync("packages/matterhorn-work-mcp/README.md", "utf8");
const mcpServer = readFileSync("packages/matterhorn-work-mcp/index.mjs", "utf8");

const endpointContracts = [
  ["matterhorn_status", "GET /health"],
  ["matterhorn_status", "GET /status"],
  ["matterhorn_status", "GET /capabilities"],
  ["matterhorn_list_workspaces", "GET /workspaces"],
  ["matterhorn_create_session", "POST /workspace/:workspaceId/sessions"],
  ["matterhorn_list_sessions", "GET /workspace/:workspaceId/sessions"],
  ["matterhorn_get_session", "GET /workspace/:workspaceId/sessions/:sessionId"],
  ["matterhorn_submit_session_prompt", "POST /workspace/:workspaceId/sessions/:sessionId/messages"],
  ["matterhorn_get_session_messages", "GET /workspace/:workspaceId/sessions/:sessionId/messages"],
  ["matterhorn_get_session_snapshot", "GET /workspace/:workspaceId/sessions/:sessionId/snapshot"],
  ["matterhorn_delete_session", "DELETE /workspace/:workspaceId/sessions/:sessionId"],
  ["matterhorn_create_file_session", "POST /workspace/:workspaceId/files/sessions"],
  ["matterhorn_file_catalog", "GET /files/sessions/:sessionId/catalog/snapshot"],
  ["matterhorn_read_files", "POST /files/sessions/:sessionId/read-batch"],
  ["matterhorn_write_files", "POST /files/sessions/:sessionId/write-batch"],
  ["matterhorn_close_file_session", "DELETE /files/sessions/:sessionId"],
  ["matterhorn_list_approvals", "GET /approvals"],
  ["matterhorn_reply_approval", "POST /approvals/:approvalId"],
  ["matterhorn_bittensor_chat", "POST /api/bittensor/chat/execute"],
  ["matterhorn_bittensor_readiness", "GET /api/bittensor/readiness"],
];

for (const [tool, route] of endpointContracts) {
  assert.ok(docs.includes(tool), `missing MCP tool in API docs: ${tool}`);
  assert.ok(docs.includes(route), `missing HTTP route in API docs: ${route}`);
}

for (const snippet of [
  "MATTERHORN_WORK_SERVER_URL",
  "Authorization: Bearer <client-token>",
  "X-Matterhorn-Host-Token: <host-token>",
  "X-OpenWork-Host-Token",
  "contentBase64",
  "write-batch",
  "external",
]) {
  assert.ok(docs.includes(snippet), `missing API docs snippet: ${snippet}`);
}

for (const routePath of [
  "/health",
  "/status",
  "/capabilities",
  "/workspaces",
  "/sessions",
  "/messages",
  "/snapshot",
  "/files/sessions/",
  "/api/bittensor/chat/execute",
  "/api/bittensor/readiness",
]) {
  assert.ok(mcpServer.includes(routePath), `MCP server no longer references documented path fragment: ${routePath}`);
}

assert.ok(surface.includes("./agent-control-api.md"), "agent control surface should link to the API contract");
assert.ok(mcpReadme.includes("docs/agent-control-api.md"), "MCP README should link to the API contract");

console.log("Matterhorn agent control API docs static check passed.");
