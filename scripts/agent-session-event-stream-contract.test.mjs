#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contract = readFileSync("docs/agent-session-event-stream.md", "utf8");
const api = readFileSync("docs/agent-control-api.md", "utf8");
const surface = readFileSync("docs/agent-control-surface.md", "utf8");
const mcpReadme = readFileSync("packages/matterhorn-work-mcp/README.md", "utf8");

for (const snippet of [
  "# Matterhorn Work Session Event Stream Contract",
  "GET /workspace/:workspaceId/sessions/:sessionId/events",
  "text/event-stream",
  "Authorization: Bearer <client-token>",
  "Last-Event-ID",
  "MatterhornSessionEvent",
  "session.snapshot",
  "session.status",
  "message.created",
  "message.delta",
  "message.completed",
  "todo.updated",
  "approval.requested",
  "approval.resolved",
  "tool.started",
  "tool.completed",
  "browser.action",
  "heartbeat",
  "cursor_expired",
  "matterhorn_watch_session_events",
  "matterhorn_get_session_status",
  "matterhorn_get_session_snapshot",
]) {
  assert.ok(contract.includes(snippet), `missing session event stream contract snippet: ${snippet}`);
}

for (const doc of [api, surface, mcpReadme]) {
  assert.ok(doc.includes("agent-session-event-stream.md"), "related docs should link the session event stream contract");
}

assert.ok(api.includes("future `matterhorn_watch_session_events`"), "API docs should reserve the future MCP event tool name");
assert.ok(api.includes("GET /workspace/:workspaceId/sessions/:sessionId/events"), "API docs should reserve the session event route");

const lower = contract.toLowerCase();
for (const forbidden of [
  "seed phrases accepted",
  "mnemonics accepted",
  "private keys accepted",
  "wallet exports accepted",
  "host tokens are allowed in query strings",
]) {
  assert.equal(lower.includes(forbidden), false, `event stream contract must not allow secret-shaped fields: ${forbidden}`);
}

console.log("Matterhorn session event stream contract static check passed.");
