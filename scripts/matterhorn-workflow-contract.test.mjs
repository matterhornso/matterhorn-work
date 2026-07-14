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
  "MatterhornWorkflowEvidenceItem",
  "MatterhornWorkflowEvidenceBundle",
  "MatterhornProtocolWorkspaceManifest",
  "MatterhornProtocolWorkspaceId",
  "MatterhornProtocolWorkspaceCustomerStatus",
  "MatterhornProtocolWorkspaceLaunchBehavior",
  "MatterhornProtocolWorkspaceCardKind",
  "MATTERHORN_WORKFLOW_STATUSES",
  "MATTERHORN_WORKFLOW_CATEGORIES",
  "MATTERHORN_WORKFLOW_SERVICE_HOOK_TYPES",
  "DEFAULT_MATTERHORN_WORKFLOW_SAFETY_POLICY",
  "MATTERHORN_WORKFLOW_FIXTURES",
  "MATTERHORN_WORKFLOW_EVIDENCE_BUNDLE_FIXTURES",
  "MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY",
  "MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE",
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
for (const id of fixtureIds) {
  const constantName = id.toUpperCase();
  assert.ok(blocks[constantName], `expected baseline fixture block: ${constantName}_WORKFLOW`);
}
assert.ok(Object.keys(blocks).length >= fixtureIds.length, `expected at least ${fixtureIds.length} fixture blocks`);

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

// 10. Protocol workspace manifests are safe and complete.
const protocolWorkspaceIds = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "wellness",
  "decentralized_services",
];

for (const id of protocolWorkspaceIds) {
  const constantName = `${id.toUpperCase()}_PROTOCOL_WORKSPACE_MANIFEST`;
  assert.ok(types.includes(constantName), `types missing protocol workspace manifest constant: ${constantName}`);
}

function extractProtocolWorkspaceBlocks(text) {
  const blocks = {};
  const regex = /export const (\w+)_PROTOCOL_WORKSPACE_MANIFEST:\s*MatterhornProtocolWorkspaceManifest\s*=\s*\{/g;
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

const protocolBlocks = extractProtocolWorkspaceBlocks(types);
for (const id of protocolWorkspaceIds) {
  const constantName = id.toUpperCase();
  assert.ok(protocolBlocks[constantName], `expected baseline protocol workspace block: ${constantName}_PROTOCOL_WORKSPACE_MANIFEST`);
}
assert.ok(Object.keys(protocolBlocks).length >= protocolWorkspaceIds.length, `expected at least ${protocolWorkspaceIds.length} protocol workspace manifest blocks`);

for (const [name, block] of Object.entries(protocolBlocks)) {
  assert.ok(block.includes('version: "matterhorn.protocol.workspace.manifest.v1"'), `${name} must use protocol workspace manifest version`);
  assert.ok(block.includes("allowedIntents:"), `${name} must include allowedIntents`);
  assert.ok(/allowedIntents:[\s\S]*?"/.test(block), `${name} must have at least one allowed intent`);
  assert.ok(block.includes("primaryPanelRouteId:"), `${name} must include primaryPanelRouteId`);
  assert.ok(block.includes("supportedCardKinds:"), `${name} must include supportedCardKinds`);
  assert.ok(/supportedCardKinds:[\s\S]*?"/.test(block), `${name} must have at least one supported card kind`);
  assert.ok(block.includes("demoPrompt:"), `${name} must include demoPrompt`);
  assert.ok(block.includes("launchBehavior:"), `${name} must include launchBehavior`);
  assert.ok(block.includes("liveExecutionEnabled: false"), `${name} must set liveExecutionEnabled: false`);
  assert.ok(block.includes("canSubmit: false"), `${name} must set canSubmit: false`);
  assert.equal(block.includes("acceptsSecrets: true"), false, `${name} must not accept secrets`);
  assert.equal(block.includes("acceptsPrivateKeys: true"), false, `${name} must not accept private keys`);
  assert.equal(block.includes("acceptsRawSignatures: true"), false, `${name} must not accept raw signatures`);
  assert.equal(block.includes("acceptsApiSecrets: true"), false, `${name} must not accept API secrets`);
}

// Market protocol workspaces must not enable live submission or custody.
for (const id of ["hyperliquid", "polymarket"]) {
  const block = protocolBlocks[id.toUpperCase()];
  assert.ok(block, `${id} protocol workspace manifest block must exist`);
  assert.ok(block.includes('customerStatus: "preview_only"'), `${id} must be preview_only`);
  assert.ok(block.includes("canExecute: false"), `${id} must set canExecute: false`);
  assert.ok(block.includes("requiresExternalSigner: false"), `${id} must not require external signer`);
}

const mappingBlock = types.slice(types.indexOf("MATTERHORN_CUSTOMER_TEMPLATE_TO_PROTOCOL_WORKSPACE"));
for (const id of protocolWorkspaceIds) {
  assert.ok(mappingBlock.includes(id), `customer-template-to-workspace mapping missing: ${id}`);
}

// 11. No submit/sign/live provider route is implied.
for (const forbidden of ["submitRoute", "signRoute", "/submit", "/sign"]) {
  assert.equal(types.includes(forbidden), false, `workflow contract must not imply ${forbidden}`);
}

// 12. Doc coverage.
for (const snippet of [
  "MatterhornWorkflowManifest",
  "MatterhornWorkflowStep",
  "MatterhornWorkflowArtifact",
  "MatterhornWorkflowServiceHook",
  "MatterhornWorkflowSafetyPolicy",
  "MatterhornWorkflowQAContract",
  "MatterhornWorkflowEvidenceBundle",
  "MatterhornProtocolWorkspaceManifest",
  "MATTERHORN_PROTOCOL_WORKSPACE_MANIFEST_REGISTRY",
  "wellness_creator_services",
  "bittensor_operator",
  "market_read_preview",
  "decentralized_services_planner",
]) {
  assert.ok(doc.includes(snippet), `doc missing: ${snippet}`);
}

// 13. Evidence bundle fixtures are safe and complete.
const evidenceBundleIds = [
  "wellness_creator_workflow",
  "bittensor_beta_workflow",
  "hyperliquid_preview_workflow",
  "polymarket_preview_workflow",
  "decentralized_services_planned_workflow",
];

for (const id of evidenceBundleIds) {
  const constantName = `${id.toUpperCase()}_EVIDENCE_BUNDLE`;
  assert.ok(types.includes(constantName), `types missing evidence bundle constant: ${constantName}`);
}

function extractEvidenceBundleBlocks(text) {
  const blocks = {};
  const regex = /export const (\w+)_EVIDENCE_BUNDLE:\s*MatterhornWorkflowEvidenceBundle\s*=\s*\{/g;
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

const evidenceBlocks = extractEvidenceBundleBlocks(types);
for (const id of evidenceBundleIds) {
  const constantName = id.toUpperCase();
  assert.ok(evidenceBlocks[constantName], `expected baseline evidence bundle block: ${constantName}_EVIDENCE_BUNDLE`);
}
assert.ok(Object.keys(evidenceBlocks).length >= evidenceBundleIds.length, `expected at least ${evidenceBundleIds.length} evidence bundle blocks`);

for (const [name, block] of Object.entries(evidenceBlocks)) {
  assert.ok(block.includes('version: "matterhorn.workflow.evidence-bundle.v1"'), `${name} must use evidence bundle version`);
  assert.ok(block.includes("workflowId:"), `${name} must include workflowId`);
  assert.ok(block.includes("domain:"), `${name} must include domain`);
  assert.ok(block.includes("requestedOutcome:"), `${name} must include requestedOutcome`);
  assert.ok(block.includes("inputPrompt:"), `${name} must include inputPrompt`);
  assert.ok(block.includes("generatedArtifactType:"), `${name} must include generatedArtifactType`);
  assert.ok(block.includes("safetyStatus:"), `${name} must include safetyStatus`);
  assert.ok(block.includes("liveExecutionEnabled: false"), `${name} must set liveExecutionEnabled: false`);
  assert.ok(block.includes("acceptsCustody: false"), `${name} must set acceptsCustody: false`);
  assert.ok(block.includes("acceptsSigning: false"), `${name} must set acceptsSigning: false`);
  assert.ok(block.includes("acceptsSecrets: false"), `${name} must set acceptsSecrets: false`);
  assert.ok(block.includes("evidenceHash:"), `${name} must include evidenceHash`);
  assert.ok(/publicEvidence:[\s\S]*?\{[\s\S]*?\}/.test(block), `${name} must have at least one public evidence item`);
  assert.ok(/plannedServiceHooks:[\s\S]*?\{[\s\S]*?\}/.test(block), `${name} must have at least one planned service hook`);
  assert.ok(block.includes("safetyFlags:"), `${name} must include safetyFlags`);
  assert.ok(block.includes("createdAt:"), `${name} must include createdAt`);
  assert.ok(block.includes("source:"), `${name} must include source`);
  assert.ok(block.includes("canExecute: false"), `${name} must set canExecute: false`);
  assert.ok(block.includes("public: true"), `${name} must contain only public evidence items`);
  assert.equal(block.includes("public: false"), false, `${name} must not contain non-public evidence items`);
  for (const forbidden of ["privateKey", "seedPhrase", "mnemonic", "apiSecret", "rawSignature", "signedPayload", "walletExport", "passphrase", "password", "keyfile", "suri"]) {
    assert.equal(block.includes(forbidden), false, `${name} must not contain credential-shaped value: ${forbidden}`);
  }
}

const evidenceRegistryBlock = types.slice(types.indexOf("MATTERHORN_WORKFLOW_EVIDENCE_BUNDLE_FIXTURES"));
for (const id of evidenceBundleIds) {
  assert.ok(evidenceRegistryBlock.includes(id), `evidence bundle registry missing: ${id}`);
}

console.log("Matterhorn workflow contract static check passed.");
