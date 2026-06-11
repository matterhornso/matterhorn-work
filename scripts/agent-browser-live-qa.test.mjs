#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const qa = readFileSync("docs/agent-browser-live-qa.md", "utf8");
const guide = readFileSync("docs/agent-browser-control.md", "utf8");
const surface = readFileSync("docs/agent-control-surface.md", "utf8");
const uiMcp = readFileSync("packages/matterhorn-work-ui-mcp/index.mjs", "utf8");
const uiMcpTest = readFileSync("packages/matterhorn-work-ui-mcp/test-browser-actions.mjs", "utf8");

for (const snippet of [
  "# Matterhorn Work Browser Control Live QA",
  "matterhorn-work-ui-mcp",
  "ui_status",
  "ui_snapshot",
  "browser_list_actions",
  "browser_open",
  "browser_snapshot",
  "browser_execute_action",
  "browser.open_panel",
  "browser.open",
  "browser.snapshot",
  "browser.navigate",
  "browser.reload",
  "browser.back",
  "browser.close_panel",
  "pnpm test:agent-browser-control-guide",
  "pnpm test:agent-action-model-contract",
  "pnpm --dir packages/matterhorn-work-ui-mcp test",
  "localhost bind permission",
  "No token value is printed",
  "No secrets are requested",
]) {
  assert.ok(qa.includes(snippet), `missing browser live QA snippet: ${snippet}`);
}

for (const tool of [
  "browser_list_actions",
  "browser_snapshot",
  "browser_open",
  "browser_execute_action",
]) {
  assert.ok(uiMcp.includes(`"${tool}"`), `UI MCP no longer exposes ${tool}`);
  assert.ok(uiMcpTest.includes(`"${tool}"`), `UI MCP browser smoke test no longer covers ${tool}`);
}

assert.ok(guide.includes("./agent-browser-live-qa.md"), "browser-control guide should link live QA checklist");
assert.ok(surface.includes("./agent-browser-live-qa.md"), "agent control surface should link live QA checklist");

const qaLower = qa.toLowerCase();
for (const forbidden of ["privatekey accepted", "privatekey allowed", "seed phrase accepted", "wallet export accepted"]) {
  assert.equal(qaLower.includes(forbidden), false, `live QA should not allow secret-shaped fields: ${forbidden}`);
}

console.log("Matterhorn browser live QA static check passed.");
