#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const cli = readFileSync("apps/orchestrator/src/cli.ts", "utf8");
const docs = readFileSync("docs/agent-control-surface.md", "utf8");
const installDocs = readFileSync("docs/agent-mcp-install.md", "utf8");
const orchestratorReadme = readFileSync("apps/orchestrator/README.md", "utf8");

for (const snippet of [
  "matterhorn-work mcp config [--target <name>] [--profile <name>]",
  "matterhorn-work sessions list --workspace-id <id>",
  "matterhorn-work sessions create --workspace-id <id>",
  "matterhorn-work sessions prompt <session-id> --workspace-id <id> --message <text>",
  "matterhorn-work sessions events <session-id> --workspace-id <id>",
  "matterhorn-work doctor",
  "matterhorn-work bittensor chat --message <text>",
  "matterhorn-work bittensor readiness",
  "mcp config              Print MCP config for Claude Code, Codex, Cursor, or Claude Desktop",
  "async function runSessions(args: ParsedArgs)",
  "async function runBittensor(args: ParsedArgs)",
  "parseSessionSseEvents",
  "text/event-stream",
  "sessions create",
  "sessions prompt",
  "sessions status",
  "sessions snapshot",
  "doctor",
  "bittensor chat",
  "bittensor readiness",
  "--details",
  "/sessions/${encodeURIComponent(sessionId)}/messages",
  "/sessions/${encodeURIComponent(sessionId)}/status",
  "/sessions/${encodeURIComponent(sessionId)}/events",
  "/api/bittensor/chat/execute",
  "/api/bittensor/readiness",
  "function buildMcpServersConfig(",
  "function readMcpConfigProfile(args: ParsedArgs)",
  "function readMcpHostApprovalOptions(",
  "function resolveMcpRepositoryPath(args: ParsedArgs)",
  "function mcpRunner(args: ParsedArgs)",
  "function renderCodexMcpConfig(",
  "[mcp_servers.${name}]",
  "[mcp_servers.${name}.env]",
  'if (target === "codex")',
  "codex | claude | claude-desktop | cursor | json | env",
  '"matterhorn-work-mcp"',
  '"matterhorn-work-ui-mcp"',
  '"matterhorn-work-crypto-mcp"',
  '"matterhorn-work-wallet-mcp"',
  "MATTERHORN_WORK_SERVER_URL",
  "MATTERHORN_WORK_TOKEN",
  "MATTERHORN_WORK_HOST_TOKEN",
  "MATTERHORN_WORK_MCP_PROFILE",
  "include-host-approvals",
  "--repo-path",
  "Matterhorn MCP packages are not published",
  'readMatterhornEnv("OPENWORK_SERVER_URL")',
  'readMatterhornEnv("OPENWORK_TOKEN")',
  'readMatterhornEnv("OPENWORK_HOST_TOKEN")',
  "async function runMcpCommand(args: ParsedArgs)",
  'if (command === "mcp")',
]) {
  assert.ok(cli.includes(snippet), `missing CLI snippet: ${snippet}`);
}

const helperStart = cli.indexOf("function buildMcpServersConfig(");
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
assert.ok(docs.includes("matterhorn-work doctor"), "agent control docs should mention doctor CLI fallback");
assert.ok(docs.includes("matterhorn_doctor"), "agent control docs should mention doctor MCP tool");
assert.ok(docs.includes("matterhorn-work sessions events"), "agent control docs should mention session event CLI fallback");
assert.ok(docs.includes("matterhorn-work sessions prompt"), "agent control docs should mention session prompt CLI fallback");
assert.ok(docs.includes("matterhorn-work bittensor chat"), "agent control docs should mention Bittensor CLI fallback");
assert.ok(docs.includes("./agent-mcp-install.md"), "agent control docs should link the MCP install guide");
assert.ok(orchestratorReadme.includes("## Agent MCP config"), "orchestrator README should document MCP config helper");
assert.ok(orchestratorReadme.includes("## Agent doctor"), "orchestrator README should document doctor helper");
assert.ok(orchestratorReadme.includes("## Chat session events"), "orchestrator README should document chat session events");
assert.ok(orchestratorReadme.includes("## Bittensor"), "orchestrator README should document Bittensor CLI fallback");

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

function runMcpConfig(args, environment = {}) {
  return spawnSync(
    "bun",
    ["apps/orchestrator/src/cli.ts", "mcp", "config", ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        MATTERHORN_WORK_HOST_TOKEN: "",
        OPENWORK_HOST_TOKEN: "",
        ...environment,
      },
    },
  );
}

const safeConfig = runMcpConfig([
  "--target", "json",
  "--profile", "guarded",
  "--repo-path", process.cwd(),
  "--server-url", "http://127.0.0.1:8787",
  "--token", "test-client-token",
]);
assert.equal(safeConfig.status, 0, safeConfig.stderr);
const safeServers = JSON.parse(safeConfig.stdout).mcpServers;
assert.equal(safeServers["matterhorn-work"].command, "node");
assert.equal(
  safeServers["matterhorn-work"].args[0],
  `${process.cwd()}/packages/matterhorn-work-mcp/index.mjs`,
);
assert.equal(safeServers["matterhorn-work"].env.MATTERHORN_WORK_TOKEN, "test-client-token");
assert.equal(
  safeServers["matterhorn-work"].env.MATTERHORN_WORK_MCP_PROFILE,
  "guarded_client",
);
assert.equal("MATTERHORN_WORK_HOST_TOKEN" in safeServers["matterhorn-work"].env, false);
assert.deepEqual(Object.keys(safeServers), ["matterhorn-work"]);
assert.equal(safeConfig.stdout.includes("npx"), false);

const defaultConfig = runMcpConfig([
  "--target", "json",
  "--repo-path", process.cwd(),
  "--server-url", "http://127.0.0.1:8787",
  "--token", "test-client-token",
]);
assert.equal(defaultConfig.status, 0, defaultConfig.stderr);
const defaultServers = JSON.parse(defaultConfig.stdout).mcpServers;
assert.deepEqual(Object.keys(defaultServers), ["matterhorn-work"]);
assert.equal(
  defaultServers["matterhorn-work"].env.MATTERHORN_WORK_MCP_PROFILE,
  "guarded_client",
);
assert.equal(
  "MATTERHORN_WORK_HOST_TOKEN" in defaultServers["matterhorn-work"].env,
  false,
);

const inheritedHostToken = runMcpConfig([
  "--target", "env",
  "--profile", "guarded",
  "--server-url", "http://127.0.0.1:8787",
  "--token", "test-client-token",
], { MATTERHORN_WORK_HOST_TOKEN: "must-not-inherit" });
assert.equal(inheritedHostToken.status, 0, inheritedHostToken.stderr);
assert.equal(inheritedHostToken.stdout.includes("must-not-inherit"), false);
assert.equal(inheritedHostToken.stdout.includes("MATTERHORN_WORK_HOST_TOKEN"), false);
assert.match(inheritedHostToken.stdout, /MATTERHORN_WORK_MCP_PROFILE="guarded_client"/);

const rejectedHostToken = runMcpConfig([
  "--target", "json",
  "--profile", "server",
  "--repo-path", process.cwd(),
  "--host-token", "must-require-explicit-authority",
]);
assert.notEqual(rejectedHostToken.status, 0);
assert.match(rejectedHostToken.stderr, /requires --include-host-approvals/);
assert.equal(rejectedHostToken.stdout.includes("must-require-explicit-authority"), false);

const operatorConfig = runMcpConfig([
  "--target", "json",
  "--profile", "server",
  "--repo-path", process.cwd(),
  "--include-host-approvals",
  "--host-token", "explicit-test-host-token",
]);
assert.equal(operatorConfig.status, 0, operatorConfig.stderr);
assert.equal(
  JSON.parse(operatorConfig.stdout).mcpServers["matterhorn-work"].env.MATTERHORN_WORK_HOST_TOKEN,
  "explicit-test-host-token",
);
assert.equal(
  JSON.parse(operatorConfig.stdout).mcpServers["matterhorn-work"].env.MATTERHORN_WORK_MCP_PROFILE,
  "full",
);

const rejectedGuardedHostAuthority = runMcpConfig([
  "--target", "json",
  "--profile", "guarded",
  "--repo-path", process.cwd(),
  "--include-host-approvals",
  "--host-token", "must-not-cross-guarded-boundary",
]);
assert.notEqual(rejectedGuardedHostAuthority.status, 0);
assert.match(
  rejectedGuardedHostAuthority.stderr,
  /requires the server or full profile/,
);
assert.equal(
  rejectedGuardedHostAuthority.stdout.includes("must-not-cross-guarded-boundary"),
  false,
);

const invalidCheckout = runMcpConfig([
  "--target", "json",
  "--repo-path", "/definitely/not/a/matterhorn/checkout",
]);
assert.notEqual(invalidCheckout.status, 0);
assert.match(invalidCheckout.stderr, /does not contain the Matterhorn MCP entrypoints/);

const explicitFutureRunner = runMcpConfig([
  "--target", "json",
  "--profile", "server",
  "--runner", "npx",
]);
assert.equal(explicitFutureRunner.status, 0, explicitFutureRunner.stderr);
const futureServer = JSON.parse(explicitFutureRunner.stdout).mcpServers["matterhorn-work"];
assert.equal(futureServer.command, "npx");
assert.deepEqual(futureServer.args, ["-y", "matterhorn-work-mcp"]);

const invalidProfile = runMcpConfig([
  "--target", "json",
  "--profile", "unknown",
  "--repo-path", process.cwd(),
]);
assert.notEqual(invalidProfile.status, 0);
assert.match(invalidProfile.stderr, /must be guarded, server, or full/);

console.log("Matterhorn MCP config CLI static check passed.");
