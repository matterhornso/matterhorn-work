#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const contract = readFileSync("docs/agent-action-model-contract.md", "utf8");
const surface = readFileSync("docs/agent-control-surface.md", "utf8");
const uiProfile = readFileSync("docs/mcp-ui-control-profile.md", "utf8");
const controlProvider = readFileSync("apps/app/src/react-app/shell/control/control-provider.tsx", "utf8");
const uiMcp = readFileSync("packages/matterhorn-work-ui-mcp/index.mjs", "utf8");
const uiPackage = readFileSync("packages/matterhorn-work-ui-mcp/package.json", "utf8");

for (const snippet of [
  "type MatterhornControlActionMetadata",
  "type MatterhornControlSnapshot",
  "type MatterhornControlExecutionRequest",
  "type MatterhornControlExecutionResult",
  "MatterhornControlSideEffect",
  "requiresConfirmation",
  "sideEffect",
  "ui_snapshot",
  "ui_list_actions",
  "ui_execute_action",
  "GET /workspace/:workspaceId/actions",
  "POST /workspace/:workspaceId/actions/execute",
  "browser.snapshot",
  "browser.navigate",
  "No action schema may accept seed phrases",
]) {
  assert.ok(contract.includes(snippet), `missing action contract snippet: ${snippet}`);
}

for (const prefix of [
  "route.*",
  "session.*",
  "composer.*",
  "workspace.*",
  "files.*",
  "approval.*",
  "bittensor.*",
  "browser.*",
]) {
  assert.ok(contract.includes(prefix), `missing action namespace: ${prefix}`);
}

for (const sourceSnippet of [
  "export type MatterhornControlActionMetadata",
  "export type MatterhornControlSnapshot",
  "export type MatterhornControlResult",
  "export type MatterhornControlSideEffect",
  "window.__openworkControl",
]) {
  assert.ok(controlProvider.includes(sourceSnippet), `control provider no longer exposes expected shape: ${sourceSnippet}`);
}

assert.ok(surface.includes("./agent-action-model-contract.md"), "agent control surface should link the action model contract");
assert.ok(uiProfile.includes("matterhorn-work-ui-mcp"), "UI control profile should document the Matterhorn Work UI MCP package");
assert.ok(uiMcp.includes('name: "matterhorn-work-ui"'), "UI MCP server should use Matterhorn Work naming");
assert.ok(uiPackage.includes('"directory": "packages/matterhorn-work-ui-mcp"'), "UI MCP package metadata should use Matterhorn Work package path");

const contractLower = contract.toLowerCase();
assert.equal(contractLower.includes("privatekey"), false, "contract should not mention privateKey fields");
assert.equal(contractLower.includes("wallet export fields accepted"), false, "contract should not allow wallet export fields");

console.log("Matterhorn agent action model contract static check passed.");
