#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");
const index = readFileSync("packages/types/src/index.ts", "utf8");
const typesPackage = JSON.parse(readFileSync("packages/types/package.json", "utf8"));
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const doc = readFileSync("docs/matterhorn-workflow-contract.md", "utf8");

const fixtureIds = [
  "wellness_creator_services",
  "bittensor_operator",
  "market_read_preview",
  "decentralized_services_planner",
];

// 1. Types package exports the workflow module and root package exposes the test script.
assert.ok(index.includes('export * from "./matterhorn-workflows"'), "types index should export matterhorn-workflows");
assert.ok(typesPackage.exports["./matterhorn-workflows"], "types package should export ./matterhorn-workflows");
assert.equal(rootPackage.scripts["test:matterhorn-workflow-contract"], "node scripts/matterhorn-workflow-contract.test.mjs");

// 2. Required contract types and constants exist.
for (const token of [
  "MatterhornWorkflowManifest",
  "MatterhornWorkflowStep",
  "MatterhornWorkflowArtifact",
  "MatterhornWorkflowServiceHook",
  "MatterhornWorkflowSafetyPolicy",
  "MatterhornWorkflowQAContract",
  "MatterhornWorkflowStatus",
  "MatterhornWorkflowServiceHookType",
  "MATTERHORN_WORKFLOW_STATUSES",
  "MATTERHORN_WORKFLOW_CATEGORIES",
  "MATTERHORN_WORKFLOW_SERVICE_HOOK_TYPES",
  "DEFAULT_MATTERHORN_WORKFLOW_SAFETY_POLICY",
  "MATTERHORN_WORKFLOW_FIXTURES",
]) {
  assert.ok(types.includes(token), `types missing workflow token: ${token}`);
}

// 3. Fixture manifest constants exist.
for (const id of fixtureIds) {
  const constantName = `${id.toUpperCase()}_WORKFLOW`;
  assert.ok(types.includes(constantName), `types missing fixture constant: ${constantName}`);
}

// 4. Extract each fixture manifest block.
function extractManifestBlocks(text) {
  const blocks = {};
  const regex = /export const (\w+)_WORKFLOW:\s*MatterhornWorkflowManifest\s*=\s*\{/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const start = match.index;
    let braceDepth = 0;
    let inString = false;
    let stringChar = "";
    let started = false;
    for (let i = match.index + match[0].length - 1; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === stringChar) {
          inString = false;
        }
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === "{") {
        braceDepth++;
        started = true;
      } else if (ch === "}") {
        braceDepth--;
      }
      if (started && braceDepth === 0) {
        blocks[name] = text.slice(start, i + 1);
        break;
      }
    }
  }
  return blocks;
}

const blocks = extractManifestBlocks(types);
assert.equal(Object.keys(blocks).length, fixtureIds.length, `expected ${fixtureIds.length} fixture blocks`);

// 5. Every fixture has at least one prompt, artifact, service hook, and QA checklist.
for (const [name, block] of Object.entries(blocks)) {
  assert.ok(block.includes("inputPrompts:"), `${name} must include inputPrompts`);
  assert.ok(/inputPrompts:[\s\S]*?\{[\s\S]*?\}/.test(block), `${name} must have at least one input prompt`);
  assert.ok(block.includes("generatedArtifacts:"), `${name} must include generatedArtifacts`);
  assert.ok(/generatedArtifacts:[\s\S]*?\{[\s\S]*?\}/.test(block), `${name} must have at least one artifact`);
  assert.ok(block.includes("serviceHooks:"), `${name} must include serviceHooks`);
  assert.ok(/serviceHooks:[\s\S]*?\{[\s\S]*?\}/.test(block), `${name} must have at least one service hook`);
  assert.ok(block.includes("qaContract:"), `${name} must include qaContract`);
  assert.ok(/qaContract:[\s\S]*?checklist:[\s\S]*?"/.test(block), `${name} must have a non-empty QA checklist`);
}

// 6. No fixture accepts secrets.
for (const [name, block] of Object.entries(blocks)) {
  for (const field of ["acceptsSecrets: true", "acceptsPrivateKeys: true", "acceptsRawSignatures: true", "acceptsApiSecrets: true"]) {
    assert.equal(block.includes(field), false, `${name} must not accept secrets: ${field}`);
  }
}

// 7. All fixtures disable live execution and submission.
for (const [name, block] of Object.entries(blocks)) {
  assert.ok(block.includes("liveExecutionEnabled: false"), `${name} must set liveExecutionEnabled: false`);
  assert.ok(block.includes("canSubmit: false"), `${name} must set canSubmit: false`);
}

// 8. Market fixtures remain read/preview only.
const marketBlock = blocks["MARKET_READ_PREVIEW"];
assert.ok(marketBlock, "market_read_preview fixture must exist");
assert.ok(marketBlock.includes('status: "preview_only"'), "market_read_preview must have status preview_only");
assert.ok(marketBlock.includes("canExecute: false"), "market_read_preview must set canExecute: false");
assert.ok(marketBlock.includes("liveExecutionEnabled: false"), "market_read_preview must set liveExecutionEnabled: false");
assert.ok(marketBlock.includes("canSubmit: false"), "market_read_preview must set canSubmit: false");

// 9. Service hooks marked planned-not-live where not implemented.
function extractServiceHookStatuses(block) {
  const statuses = [];
  const match = block.match(/serviceHooks:\s*\[([\s\S]*?)\]/);
  if (!match) return statuses;
  const hookBlock = match[1];
  const regex = /status:\s*"([^"]+)"/g;
  let m;
  while ((m = regex.exec(hookBlock)) !== null) statuses.push(m[1]);
  return statuses;
}

for (const [name, block] of Object.entries(blocks)) {
  const workflowStatusMatch = block.match(/status:\s*"([^"]+)"/);
  const workflowStatus = workflowStatusMatch ? workflowStatusMatch[1] : null;
  const hookStatuses = extractServiceHookStatuses(block);
  assert.ok(hookStatuses.length > 0, `${name} must have at least one service hook status`);

  if (workflowStatus !== "live_local") {
    for (const status of hookStatuses) {
      assert.ok(
        status === "planned_not_live" || status === "preview_only" || status === "external_handoff_required" || status === "blocked_by_policy",
        `${name} service hook status ${status} is not allowed for non-live workflow`
      );
      assert.notEqual(status, "live_local", `${name} non-live workflow must not mark a service hook as live_local`);
    }
  }
}

// 10. No submit/sign/live provider route is implied.
for (const forbidden of ["submitRoute", "signRoute", "/submit", "/sign"]) {
  assert.equal(types.includes(forbidden), false, `workflow contract must not imply ${forbidden}`);
}

// 11. Doc coverage.
for (const snippet of [
  "MatterhornWorkflowManifest",
  "MatterhornWorkflowStep",
  "MatterhornWorkflowArtifact",
  "MatterhornWorkflowServiceHook",
  "MatterhornWorkflowSafetyPolicy",
  "MatterhornWorkflowQAContract",
  "wellness_creator_services",
  "bittensor_operator",
  "market_read_preview",
  "decentralized_services_planner",
]) {
  assert.ok(doc.includes(snippet), `doc missing: ${snippet}`);
}

console.log("Matterhorn workflow contract static check passed.");
