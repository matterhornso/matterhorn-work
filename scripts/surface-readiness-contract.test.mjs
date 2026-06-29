#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");
const index = readFileSync("packages/types/src/index.ts", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));

// 1. Root package exposes the test script.
assert.equal(
  rootPackage.scripts["test:surface-readiness-contract"],
  "node scripts/surface-readiness-contract.test.mjs",
  "root package must expose test:surface-readiness-contract",
);

// 2. Types package exports the workflow module.
assert.ok(
  index.includes('export * from "./matterhorn-workflows"'),
  "types index should export matterhorn-workflows",
);

// 3. Required surface readiness types and constants exist.
for (const token of [
  "MatterhornSurfaceReadinessEntry",
  "MatterhornSurfaceSafetyPosture",
  "MatterhornSurfaceStatus",
  "MatterhornSurfaceKind",
  "MatterhornSurfaceOwner",
  "MATTERHORN_SURFACE_STATUSES",
  "MATTERHORN_SURFACE_KINDS",
  "MATTERHORN_SURFACE_OWNERS",
  "SURFACE_READINESS_REGISTRY",
  "getMatterhornSurfaceReadinessEntry",
  "listMatterhornSurfaceReadinessEntries",
  "listSurfacesByKind",
  "listSurfacesByStatus",
]) {
  assert.ok(types.includes(token), `types missing surface readiness token: ${token}`);
}

const expectedSurfaceIds = [
  "bittensor_desk",
  "hyperliquid_desk",
  "polymarket_desk",
  "wellness_desk",
  "memory_desk",
  "mcps_desk",
  "wallet_settings",
  "profile_settings",
  "ai_providers_settings",
  "environment_settings",
  "agent_marketplace",
  "feedback_surface",
  "subscribetome_future",
];

// 4. Registry covers expected surfaces.
const registryBlock = types.slice(types.indexOf("SURFACE_READINESS_REGISTRY"));
for (const id of expectedSurfaceIds) {
  assert.ok(registryBlock.includes(id), `surface readiness registry missing: ${id}`);
}

// 5. Extract each surface block.
function extractBlock(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const braceStart = text.indexOf("{", start);
  if (braceStart < 0) return "";
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) return text.slice(braceStart, i + 1);
  }
  return "";
}

const surfaceBlocks = {};
for (const id of expectedSurfaceIds) {
  const block = extractBlock(types, `${id}:`);
  assert.ok(block, `surface readiness block must exist: ${id}`);
  surfaceBlocks[id] = block;
}

// 6. Every surface has required fields.
for (const [id, block] of Object.entries(surfaceBlocks)) {
  for (const field of [
    "version",
    "id",
    "displayName",
    "kind",
    "status",
    "routeOrPanelId",
    "owner",
    "safetyPosture",
  ]) {
    assert.ok(block.includes(`${field}:`), `${id} must include ${field}`);
  }
}

// 7. Every safety posture has the four required boolean fields.
for (const [id, block] of Object.entries(surfaceBlocks)) {
  const postureMatch = block.match(/safetyPosture:\s*\{([\s\S]*?)\}/);
  assert.ok(postureMatch, `${id} must declare safetyPosture`);
  const posture = postureMatch[1];
  for (const field of ["canSubmit", "liveSubmissionEnabled", "custody", "secretInputsAllowed"]) {
    assert.ok(posture.includes(`${field}:`), `${id} safetyPosture must include ${field}`);
  }
}

// 8. Market desk surfaces cannot enable live submission/signing/custody.
for (const id of ["bittensor_desk", "hyperliquid_desk", "polymarket_desk"]) {
  const block = surfaceBlocks[id];
  const postureMatch = block.match(/safetyPosture:\s*\{([\s\S]*?)\}/);
  const posture = postureMatch[1].toLowerCase();
  assert.ok(posture.includes("cansubmit: false"), `${id} must disable canSubmit`);
  assert.ok(posture.includes("livesubmissionenabled: false"), `${id} must disable live submission`);
  assert.ok(posture.includes("custody: false"), `${id} must disable custody`);
  assert.ok(posture.includes("secretinputsallowed: false"), `${id} must not allow secret inputs`);
}

// 9. Demo/static surfaces are not marked ready.
const notReadySurfaces = [
  "bittensor_desk",
  "hyperliquid_desk",
  "polymarket_desk",
  "mcps_desk",
  "wallet_settings",
  "ai_providers_settings",
  "environment_settings",
  "agent_marketplace",
  "subscribetome_future",
];
for (const id of notReadySurfaces) {
  assert.ok(
    !surfaceBlocks[id].includes('status: "ready"'),
    `${id} is a demo/static/setup surface and must not be marked ready`,
  );
}

// 10. Settings pages with partial backend support are marked appropriately.
assert.ok(surfaceBlocks.ai_providers_settings.includes('status: "cloud_only"'), "AI providers settings must be cloud_only");
assert.ok(surfaceBlocks.environment_settings.includes('status: "developer"'), "Environment settings must be developer");
assert.ok(surfaceBlocks.wallet_settings.includes('status: "needs_setup"'), "Wallet settings must be needs_setup");
assert.ok(surfaceBlocks.agent_marketplace.includes('status: "preview"'), "Agent marketplace must be preview");

// 11. Ready surfaces are legitimate production surfaces.
for (const [id, block] of Object.entries(surfaceBlocks)) {
  if (block.includes('status: "ready"')) {
    assert.ok(
      ["wellness_desk", "memory_desk", "profile_settings", "feedback_surface"].includes(id),
      `${id} marked ready but not in allow-list of production-ready surfaces`,
    );
  }
}

// 12. Surface kinds are valid.
const validKinds = ["desk", "setting", "mcp", "wallet", "memory", "workflow"];
for (const [id, block] of Object.entries(surfaceBlocks)) {
  const kindMatch = block.match(/kind:\s*"([^"]+)"/);
  assert.ok(kindMatch, `${id} must declare kind`);
  assert.ok(validKinds.includes(kindMatch[1]), `${id} kind ${kindMatch[1]} is not valid`);
}

// 13. Surface statuses are valid.
const validStatuses = ["ready", "needs_setup", "preview", "desktop_only", "cloud_only", "developer"];
for (const [id, block] of Object.entries(surfaceBlocks)) {
  const statusMatch = block.match(/status:\s*"([^"]+)"/);
  assert.ok(statusMatch, `${id} must declare status`);
  assert.ok(validStatuses.includes(statusMatch[1]), `${id} status ${statusMatch[1]} is not valid`);
}

console.log("Surface readiness contract check passed.");
