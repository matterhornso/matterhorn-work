#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

function assertIncludes(source, needle, label) {
  assert.ok(source.includes(needle), `${label} should include ${JSON.stringify(needle)}`);
}

function assertNotMatches(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} should not match ${pattern}`);
}

const [
  packageJson,
  deskAgents,
  packageExports,
  workspaceInit,
  workspaceInitTest,
  sessionSurface,
  sessionRoute,
  composer,
  chatPage,
  workflowTemplates,
  protocolDeskUi,
  bittensorPanel,
  receiptCheck,
  watchAutopilot,
  watchScheduler,
  mcpBundle,
] = await Promise.all([
  read("package.json"),
  read("packages/types/src/desk-agents.ts"),
  read("packages/types/package.json"),
  read("apps/server/src/workspace-init.ts"),
  read("apps/server/src/workspace-init.test.ts"),
  read("apps/app/src/react-app/domains/session/surface/session-surface.tsx"),
  read("apps/app/src/react-app/shell/session-route.tsx"),
  read("apps/app/src/react-app/domains/session/surface/composer/composer.tsx"),
  read("apps/app/src/react-app/domains/session/chat/session-page.tsx"),
  read("apps/app/src/react-app/domains/session/workflows/customer-workflow-templates.ts"),
  read("apps/app/src/react-app/domains/session/workflows/protocol-desk-ui.ts"),
  read("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx"),
  read("scripts/bittensor-receipt-check.mjs"),
  read("scripts/bittensor-watch-autopilot.mjs"),
  read("scripts/bittensor-watch-autopilot-scheduler.mjs"),
  read("packages/matterhorn-work-mcp/index.mjs"),
]);

const pkg = JSON.parse(packageJson);
assert.equal(
  pkg.scripts["test:matterhorn-desk-agent-contract"],
  "node scripts/matterhorn-desk-agent-contract.test.mjs",
  "package.json should expose the desk agent contract gate",
);

assertIncludes(packageExports, '"./desk-agents"', "@matterhorn-work/types package exports");
assertIncludes(deskAgents, "export const MATTERHORN_DESK_AGENT_MANIFESTS", "desk agent manifest");
assertIncludes(deskAgents, "not a generic chat persona", "desk agent manifest");
assertIncludes(deskAgents, "outputs/<desk>/<session-slug>/", "desk agent output convention");
assertIncludes(deskAgents, "Never ask for seed phrases, private keys, API secrets", "desk agent secret boundary");
assertIncludes(deskAgents, "getMatterhornDeskAgentById", "desk agent manifest");

for (const [deskId, agentId] of [
  ["bittensor", "matterhorn-bittensor"],
  ["hyperliquid", "matterhorn-hyperliquid"],
  ["polymarket", "matterhorn-polymarket"],
  ["wellness", "matterhorn-longevity"],
  ["memory", "matterhorn-memory"],
  ["mcps", "matterhorn-mcps"],
]) {
  assertIncludes(deskAgents, `deskId: "${deskId}"`, `manifest for ${deskId}`);
  assertIncludes(deskAgents, `agentId: "${agentId}"`, `manifest for ${deskId}`);
}

assertIncludes(workspaceInit, "MATTERHORN_DESK_AGENT_MANIFESTS", "workspace init");
assertIncludes(workspaceInit, "renderDeskAgentTemplate", "workspace init");
assertIncludes(workspaceInit, "ensureMatterhornDeskAgents", "workspace init");
assertIncludes(workspaceInit, "matterhorn_desk_agent: v1", "workspace init desk agent frontmatter");
assertIncludes(workspaceInit, "matterhorn_desk_id: ${agent.deskId}", "workspace init desk agent frontmatter");
assertIncludes(workspaceInit, "agent_id: ${agent.agentId}", "workspace init desk agent frontmatter");
assertIncludes(workspaceInit, ".opencode\", \"agents", "workspace init agent directory");
assertIncludes(workspaceInit, "outputs/<desk>/<session-slug>/", "workspace artifact guidance");
assertIncludes(workspaceInitTest, "matterhorn-bittensor.md", "workspace init tests");
assertIncludes(workspaceInitTest, "matterhorn-hyperliquid.md", "workspace init tests");
assertIncludes(workspaceInitTest, "matterhorn-polymarket.md", "workspace init tests");
assertIncludes(workspaceInitTest, "matterhorn-longevity.md", "workspace init tests");

assertIncludes(sessionSurface, "matterhornDeskAgentIdForDesk(activeDeskMode)", "session surface auto agent selection");
assertIncludes(sessionSurface, "props.onSelectAgent(deskAgentId)", "session surface auto agent selection");
assertIncludes(sessionSurface, "Open with agent", "session surface CTA");
assertIncludes(sessionSurface, "Nothing sends until you press Ask", "session surface guardrail copy");
assertIncludes(sessionRoute, "agent: selectedAgent ?? undefined", "session route prompt dispatch");
assertIncludes(sessionRoute, "formatAgentDisplayName(selectedAgent)", "session route agent label");
assertIncludes(sessionRoute, "setSelectedAgent(agent || null)", "session route launcher agent selection");
assertIncludes(composer, "formatComposerAgentName", "composer agent labels");
assertIncludes(composer, "getMatterhornDeskAgentById", "composer agent labels");
assertNotMatches(composer, /TODO:\s*Decide what to do with agent selection/i, "composer agent selector");
assertIncludes(chatPage, "matterhornDeskAgentIdForDesk", "chat page launcher agent routing");
assertIncludes(workflowTemplates, "matterhornDeskAgentIdForDesk", "workflow template agent routing");
assertIncludes(protocolDeskUi, "getMatterhornDeskAgent", "protocol desk agent display");

for (const [source, label] of [
  [sessionSurface, "session surface"],
  [composer, "composer"],
  [chatPage, "chat page"],
  [workflowTemplates, "workflow templates"],
  [protocolDeskUi, "protocol desk ui"],
  [bittensorPanel, "Bittensor panel"],
  [receiptCheck, "receipt follow-up"],
  [watchAutopilot, "watch autopilot"],
  [watchScheduler, "watch scheduler"],
  [mcpBundle, "MCP receipt follow-up"],
]) {
  assertNotMatches(source, /Use\s+Bittensor\s+chat\s+mode/i, label);
  assertNotMatches(source, /Hyperliquid\s+chat\s+mode/i, label);
  assertNotMatches(source, /Polymarket\s+chat\s+mode/i, label);
}

assertIncludes(bittensorPanel, "editable Bittensor Agent task", "Bittensor panel");
assertIncludes(receiptCheck, "Bittensor Agent task:", "receipt follow-up");
assertIncludes(watchAutopilot, "Bittensor Agent task:", "watch autopilot");
assertIncludes(watchAutopilot, "read_only_agent_tasks", "watch autopilot");
assertIncludes(watchScheduler, "Bittensor Agent task:", "watch scheduler");
assertIncludes(watchScheduler, "read_only_agent_tasks", "watch scheduler");
