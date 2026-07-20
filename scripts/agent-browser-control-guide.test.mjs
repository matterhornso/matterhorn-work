#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guide = readFileSync("docs/agent-browser-control.md", "utf8");
const surface = readFileSync("docs/agent-control-surface.md", "utf8");
const uiProfile = readFileSync("docs/mcp-ui-control-profile.md", "utf8");
const uiMcp = readFileSync("packages/matterhorn-work-ui-mcp/index.mjs", "utf8");
const uiMcpTest = readFileSync("packages/matterhorn-work-ui-mcp/test-browser-actions.mjs", "utf8");
const sessionPage = readFileSync("apps/app/src/react-app/domains/session/chat/session-page.tsx", "utf8");
const browserPanel = readFileSync("apps/app/src/react-app/domains/session/browser/browser-panel.tsx", "utf8");

for (const snippet of [
  "# Matterhorn Desks Agent Browser Control",
  "matterhorn-work-ui-mcp",
  "ui_status",
  "ui_snapshot",
  "browser_list_actions",
  "browser_snapshot",
  "browser_open",
  "browser_execute_action",
  "browser.open_panel",
  "browser.open",
  "browser.snapshot",
  "browser.navigate",
  "browser.back",
  "browser.forward",
  "browser.reload",
  "browser.close_panel",
  "pnpm --dir packages/matterhorn-work-ui-mcp test",
  "confirmed: true",
  "localhost bind permission",
]) {
  assert.ok(guide.includes(snippet), `missing browser-control guide snippet: ${snippet}`);
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

for (const action of [
  'id: "browser.open_panel"',
  'id: "browser.open"',
  'id: "browser.snapshot"',
  'id: "browser.navigate"',
  'id: "browser.back"',
  'id: "browser.forward"',
  'id: "browser.reload"',
  'id: "browser.close_panel"',
]) {
  const source = `${sessionPage}\n${browserPanel}`;
  assert.ok(source.includes(action), `desktop source no longer registers ${action}`);
}

assert.ok(surface.includes("./agent-browser-control.md"), "agent control surface should link the browser-control guide");
assert.ok(uiProfile.includes("./agent-browser-control.md"), "UI MCP profile should link the browser-control guide");

const guideLower = guide.toLowerCase();
for (const forbidden of ["privatekey", "private key export", "wallet export accepted", "seed phrase accepted"]) {
  assert.equal(guideLower.includes(forbidden), false, `browser guide should not allow secret-shaped fields: ${forbidden}`);
}

console.log("Matterhorn agent browser-control guide static check passed.");
