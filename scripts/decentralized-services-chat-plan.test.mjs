#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const planner = readFileSync("scripts/decentralized-services-chat-plan.mjs", "utf8");
const server = readFileSync("apps/server/src/server.ts", "utf8");
const serverTool = readFileSync("apps/server/src/tools/decentralized-services.ts", "utf8");
const cli = readFileSync("apps/orchestrator/src/cli.ts", "utf8");
const mcp = readFileSync("packages/matterhorn-work-mcp/index.mjs", "utf8");
const docs = [
  readFileSync("docs/agent-control-api.md", "utf8"),
  readFileSync("docs/agent-control-coverage-matrix.md", "utf8"),
  readFileSync("packages/matterhorn-work-mcp/README.md", "utf8"),
].join("\n");

assert.equal(
  rootPackage.scripts["test:decentralized-services-chat-plan"],
  "node scripts/decentralized-services-chat-plan.test.mjs",
  "package.json should expose the decentralized services chat-plan gate",
);

for (const phrase of [
  "matterhorn.services.chat-plan.v1",
  "planned_not_live",
  "service_plan",
  "matterhorn-work services chat --message",
  "Future providers",
  "Can execute: No",
]) {
  assert.ok(planner.includes(phrase), `planner missing phrase: ${phrase}`);
}

for (const phrase of [
  "/api/services/chat/plan",
  "planDecentralizedServicesChat",
  "findForbiddenDecentralizedServiceInput",
  "services_secret_rejected",
]) {
  assert.ok(server.includes(phrase), `server route missing phrase: ${phrase}`);
  assert.ok(serverTool.includes(phrase) || server.includes(phrase), `server tool/route missing phrase: ${phrase}`);
}

for (const phrase of [
  "services chat",
  "decentralized-services-chat-plan.mjs",
  "message is required for services chat planning",
]) {
  assert.ok(cli.includes(phrase), `CLI missing phrase: ${phrase}`);
}

for (const phrase of [
  "matterhorn_services_chat_plan",
  "/api/services/chat/plan",
  "Plan a future decentralized service workflow",
]) {
  assert.ok(mcp.includes(phrase), `MCP missing phrase: ${phrase}`);
}

for (const phrase of [
  "POST /api/services/chat/plan",
  "matterhorn_services_chat_plan",
  "matterhorn-work services chat",
  "future-contract",
]) {
  assert.ok(docs.includes(phrase), `docs missing phrase: ${phrase}`);
}

const planResult = spawnSync(process.execPath, [
  "scripts/decentralized-services-chat-plan.mjs",
  "--json",
  "--message",
  "Create a paid fitness program with customer email updates and gated access",
], {
  encoding: "utf8",
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(planResult.status, 0, `planner should exit 0. stderr=${planResult.stderr}`);
const plan = JSON.parse(planResult.stdout);
assert.equal(plan.version, "matterhorn.services.chat-plan.v1");
assert.equal(plan.status, "future_contract");
assert.equal(plan.execution, "planned_not_live");
assert.deepEqual(plan.matchedCapabilities, ["email", "payments", "identity"]);
assert.equal(plan.safety.liveExecutionEnabled, false);
assert.equal(plan.safety.canExecute, false);
assert.equal(plan.requiresClarification, false);
assert.ok(plan.cards.length >= 3, "planner should produce one service_plan card per matched capability");
for (const card of plan.cards) {
  assert.equal(card.kind, "service_plan");
  assert.equal(card.status, "future_contract");
  assert.equal(card.safety.canExecute, false);
  assert.equal(card.safety.liveExecutionEnabled, false);
  assert.equal(card.safety.acceptsSecrets, false);
  assert.equal(card.safety.plannedNotLive, true);
}

const clarificationResult = spawnSync(process.execPath, [
  "scripts/decentralized-services-chat-plan.mjs",
  "--json",
  "--message",
  "Can Matterhorn help me with services?",
], {
  encoding: "utf8",
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(clarificationResult.status, 0, `clarification planner should exit 0. stderr=${clarificationResult.stderr}`);
const clarification = JSON.parse(clarificationResult.stdout);
assert.equal(clarification.requiresClarification, false);
assert.deepEqual(
  clarification.cards.map((card) => card.capability),
  ["hosting", "storage", "email", "payments", "identity"],
);

const reject = spawnSync(process.execPath, [
  "scripts/decentralized-services-chat-plan.mjs",
  "--json",
  "--message",
  "send newsletter",
  "--api-secret",
  "redacted",
], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.notEqual(reject.status, 0, "planner should reject credential-shaped flags");
assert.match(reject.stderr, /Forbidden credential-shaped flag --api-secret/);

for (const forbidden of [
  "/api/services/execute",
  "/api/services/submit",
  "/api/services/sign",
  "liveExecutionEnabled: true",
  "canExecute: true",
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
  "walletExport:",
]) {
  assert.equal(planner.includes(forbidden), false, `planner must not expose ${forbidden}`);
  assert.equal(serverTool.includes(forbidden), false, `server tool must not expose ${forbidden}`);
  assert.equal(mcp.includes(forbidden), false, `MCP must not expose ${forbidden}`);
}

console.log("Decentralized services chat-plan check passed.");
