#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cli = readFileSync("apps/orchestrator/src/cli.ts", "utf8");
const docs = readFileSync("docs/agent-control-surface.md", "utf8");
const installDocs = readFileSync("docs/agent-mcp-install.md", "utf8");
const orchestratorReadme = readFileSync("apps/orchestrator/README.md", "utf8");

for (const snippet of [
  "matterhorn-work mcp config [--target <name>] [--profile <name>]",
  "mcp config              Print MCP config for Claude Code, Codex, Cursor, or Claude Desktop",
  "function buildMcpServersConfig(args: ParsedArgs)",
  '"matterhorn-work-mcp"',
  '"matterhorn-work-ui-mcp"',
  '"matterhorn-work-crypto-mcp"',
  '"matterhorn-work-wallet-mcp"',
  "MATTERHORN_WORK_SERVER_URL",
  "MATTERHORN_WORK_TOKEN",
  "MATTERHORN_WORK_HOST_TOKEN",
  'readMatterhornEnv("OPENWORK_SERVER_URL")',
  'readMatterhornEnv("OPENWORK_TOKEN")',
  'readMatterhornEnv("OPENWORK_HOST_TOKEN")',
  "async function runMcpCommand(args: ParsedArgs)",
  'if (command === "mcp")',
]) {
  assert.ok(cli.includes(snippet), `missing CLI snippet: ${snippet}`);
}

const helperStart = cli.indexOf("function buildMcpServersConfig(args: ParsedArgs)");
const helperEnd = cli.indexOf("async function runStart(args: ParsedArgs)");
assert.ok(helperStart > 0 && helperEnd > helperStart, "could not isolate MCP config helper block");
const helperBlock = cli.slice(helperStart, helperEnd);

for (const forbidden of [
  "seed phrase",
  "mnemonic",
  "privateKey",
  "private_key",
  "wallet export",
]) {
  assert.equal(helperBlock.includes(forbidden), false, `unexpected secret wording in CLI helper: ${forbidden}`);
}

assert.ok(docs.includes("matterhorn-work mcp config"), "agent control docs should mention mcp config");
assert.ok(docs.includes("./agent-mcp-install.md"), "agent control docs should link the MCP install guide");
assert.ok(orchestratorReadme.includes("## Agent MCP config"), "orchestrator README should document MCP config helper");

for (const snippet of [
  "## Codex",
  "codex mcp add matterhorn-work",
  "~/.codex/config.toml",
  "## Claude Code",
  "claude mcp add --transport stdio",
  "## Claude Desktop",
  "claude_desktop_config.json",
  "## Cursor",
  "## Generic MCP Clients",
  "matterhorn_get_session_status",
  "matterhorn_watch_session_events",
  "matterhorn_bittensor_chat",
]) {
  assert.ok(installDocs.includes(snippet), `missing MCP install docs snippet: ${snippet}`);
}

console.log("Matterhorn MCP config CLI static check passed.");
