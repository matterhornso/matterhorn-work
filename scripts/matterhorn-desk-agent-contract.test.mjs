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
  activeLongevityAgent,
  activeHyperliquidAgent,
  activePolymarketAgent,
  activeBittensorAgent,
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
  read(".opencode/agents/matterhorn-longevity.md"),
  read(".opencode/agents/matterhorn-hyperliquid.md"),
  read(".opencode/agents/matterhorn-polymarket.md"),
  read(".opencode/agents/matterhorn-bittensor.md"),
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
assertIncludes(deskAgents, "LONGEVITY_PRIMARY_GOAL_OPTIONS", "Longevity goal intake catalog");
assertIncludes(deskAgents, 'label: "Improve VO2 max"', "Longevity VO2 max goal");
assertIncludes(deskAgents, 'label: "Train for endurance"', "Longevity endurance goal");
assertIncludes(deskAgents, "Keep Improve VO2 max and Train for endurance as separate choices", "Longevity goal distinction");
assertIncludes(activeLongevityAgent, "Improve VO2 max", "active Longevity agent VO2 max goal");
assertIncludes(activeLongevityAgent, "Train for endurance", "active Longevity agent endurance goal");
assertIncludes(deskAgents, "Start with the single most specific Hyperliquid desk tool", "Hyperliquid bounded read guidance");
assertIncludes(activeHyperliquidAgent, "Start with the single most specific Hyperliquid desk tool", "active Hyperliquid bounded read guidance");
assertIncludes(activeHyperliquidAgent, "websearch: deny", "active Hyperliquid web search runtime denial");
assertIncludes(deskAgents, "do not delegate to subagents", "Polymarket bounded lookup guidance");
assertIncludes(deskAgents, "Bound exact-market discovery to two Polymarket tool calls", "Polymarket bounded search guidance");
assertIncludes(deskAgents, 'runtimePermissions: {', "desk agent runtime permission manifest");
assertIncludes(deskAgents, 'websearch: "deny"', "desk agent web search runtime denial");
assertIncludes(deskAgents, 'runtimeTools: {', "desk agent deny-by-default runtime tool manifest");
assertIncludes(activePolymarketAgent, "do not delegate to subagents", "active Polymarket bounded lookup guidance");
assertIncludes(activePolymarketAgent, "Bound exact-market discovery to two Polymarket tool calls", "active Polymarket bounded search guidance");
assertIncludes(deskAgents, "If an event or market reports restricted: true or compliance_blocked", "Polymarket compliance stop guidance");
assertIncludes(activePolymarketAgent, "If an event or market reports restricted: true or compliance_blocked", "active Polymarket compliance stop guidance");
assertIncludes(activePolymarketAgent, "websearch: deny", "active Polymarket web search runtime denial");
assertIncludes(deskAgents, "For a simple subnet discovery or comparison, do not delegate to subagents", "Bittensor bounded discovery guidance");
assertIncludes(deskAgents, "Call the Bittensor desk tool exactly once", "Bittensor single-call guidance");
assertIncludes(deskAgents, "sole source for subnet IDs, names, and capabilities", "Bittensor evidence-only guidance");
assertIncludes(deskAgents, "current subnet recommendations are unavailable", "Bittensor unavailable-data guidance");
assertIncludes(deskAgents, "do not name subnet IDs, subnet names, or capabilities", "Bittensor no-invention guidance");
assertIncludes(activeBittensorAgent, "For a simple subnet discovery or comparison, do not delegate to subagents", "active Bittensor bounded discovery guidance");
assertIncludes(activeBittensorAgent, "Call the Bittensor desk tool exactly once", "active Bittensor single-call guidance");
assertIncludes(activeBittensorAgent, "sole source for subnet IDs, names, and capabilities", "active Bittensor evidence-only guidance");
assertIncludes(activeBittensorAgent, "current subnet recommendations are unavailable", "active Bittensor unavailable-data guidance");
assertIncludes(activeBittensorAgent, "do not name subnet IDs, subnet names, or capabilities", "active Bittensor no-invention guidance");
assertIncludes(activeBittensorAgent, "websearch: deny", "active Bittensor web search runtime denial");
assertIncludes(activeBittensorAgent, '"*": false', "active Bittensor deny-by-default tool map");
assertIncludes(activeBittensorAgent, '"matterhorn-work_matterhorn_bittensor_chat": true', "active Bittensor MCP tool allowlist");
assertIncludes(deskAgents, "getMatterhornDeskAgentById", "desk agent manifest");

for (const [deskId, agentId] of [
  ["bittensor", "matterhorn-bittensor"],
  ["hyperliquid", "matterhorn-hyperliquid"],
  ["polymarket", "matterhorn-polymarket"],
  ["sui", "matterhorn-sui"],
  ["wellness", "matterhorn-longevity"],
  ["memory", "matterhorn-memory"],
  ["mcps", "matterhorn-mcps"],
]) {
  assertIncludes(deskAgents, `deskId: "${deskId}"`, `manifest for ${deskId}`);
  assertIncludes(deskAgents, `agentId: "${agentId}"`, `manifest for ${deskId}`);
}

assertIncludes(workspaceInit, "MATTERHORN_DESK_AGENT_MANIFESTS", "workspace init");
assertIncludes(workspaceInit, "renderDeskAgentTemplate", "workspace init");
assertIncludes(workspaceInit, "renderDeskAgentRuntimePermissions", "workspace init runtime permissions");
assertIncludes(workspaceInit, "ensureMatterhornDeskAgents", "workspace init");
assertIncludes(workspaceInit, "matterhorn_desk_agent: v1", "workspace init desk agent frontmatter");
assertIncludes(workspaceInit, "matterhorn_desk_id: ${agent.deskId}", "workspace init desk agent frontmatter");
assertIncludes(workspaceInit, "agent_id: ${agent.agentId}", "workspace init desk agent frontmatter");
assertIncludes(workspaceInit, ".opencode\", \"agents", "workspace init agent directory");
assertIncludes(workspaceInit, "outputs/<desk>/<session-slug>/", "workspace artifact guidance");
assertIncludes(workspaceInitTest, "matterhorn-bittensor.md", "workspace init tests");
assertIncludes(workspaceInitTest, "matterhorn-hyperliquid.md", "workspace init tests");
assertIncludes(workspaceInitTest, "matterhorn-polymarket.md", "workspace init tests");
assertIncludes(workspaceInitTest, "matterhorn-sui.md", "workspace init tests");
assertIncludes(workspaceInitTest, "matterhorn-longevity.md", "workspace init tests");

assertIncludes(sessionSurface, "matterhornDeskAgentIdForDesk(activeDeskMode)", "session surface auto agent selection");
assertIncludes(sessionSurface, "props.onSelectAgent(deskAgentId)", "session surface auto agent selection");
assertIncludes(sessionSurface, "Start task", "session surface CTA");
assertIncludes(sessionSurface, "Review it, then send it to the desk agent.", "session surface guardrail copy");
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
