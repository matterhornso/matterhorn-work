#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const doc = readFileSync("docs/matterhorn-workflow-contract.md", "utf8");

const templateIds = [
  "wellness_creator_service_workflow",
  "bittensor_beta_operator_workflow",
  "hyperliquid_preview_workflow",
  "polymarket_preview_workflow",
  "decentralized_services_future_workflow",
];

// 1. Root package exposes the test script.
assert.equal(
  rootPackage.scripts["test:matterhorn-workflow-template-registry"],
  "node scripts/matterhorn-workflow-template-registry.test.mjs",
  "package.json should expose the template registry test script"
);

// 2. Required types and constants exist.
for (const token of [
  "MatterhornWorkflowTemplate",
  "MatterhornWorkflowTemplateSafetyBoundary",
  "DEFAULT_MATTERHORN_WORKFLOW_TEMPLATE_SAFETY_BOUNDARY",
  "MATTERHORN_WORKFLOW_TEMPLATE_REGISTRY",
  "MatterhornDeskManifest",
  "MatterhornDeskId",
  "MatterhornDeskStatus",
  "MatterhornDeskAccent",
  "MATTERHORN_DESK_MANIFEST_REGISTRY",
]) {
  assert.ok(types.includes(token), `types missing workflow template token: ${token}`);
}

// 3. Fixture constants exist.
for (const id of templateIds) {
  const constantName = `${id.toUpperCase()}_TEMPLATE`;
  assert.ok(types.includes(constantName), `types missing template constant: ${constantName}`);
}

// 4. Extract each template fixture block.
function extractTemplateBlocks(text) {
  const blocks = {};
  const regex = /export const (\w+)_TEMPLATE:\s*MatterhornWorkflowTemplate\s*=\s*\{/g;
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

const blocks = extractTemplateBlocks(types);
assert.equal(Object.keys(blocks).length, templateIds.length, `expected ${templateIds.length} template blocks`);

// 5. Every template has prompt starters and safety boundaries.
for (const [name, block] of Object.entries(blocks)) {
  assert.ok(block.includes("promptStarters:"), `${name} must include promptStarters`);
  assert.ok(/promptStarters:[\s\S]*?"/.test(block), `${name} must have at least one prompt starter`);
  assert.ok(block.includes("safetyBoundaries:"), `${name} must include safetyBoundaries`);
  assert.ok(block.includes("generatedArtifacts:"), `${name} must include generatedArtifacts`);
}

// 6. No template asks for secrets.
const forbiddenSecretTokens = [
  "privateKey",
  "seedPhrase",
  "mnemonic",
  "apiSecret",
  "rawSignature",
  "signedPayload",
  "walletExport",
  "passphrase",
  "password",
  "keyfile",
  "suri",
  "allowsRealFunds: true",
  "acceptsSecrets: true",
  "acceptsPrivateKeys: true",
  "acceptsRawSignatures: true",
  "acceptsApiSecrets: true",
];
for (const [name, block] of Object.entries(blocks)) {
  for (const forbidden of forbiddenSecretTokens) {
    assert.equal(block.includes(forbidden), false, `${name} must not contain ${forbidden}`);
  }
}

// 7. Market templates remain preview-only.
for (const id of ["hyperliquid_preview_workflow", "polymarket_preview_workflow"]) {
  const name = id.toUpperCase();
  const block = blocks[name];
  assert.ok(block, `${name} block must exist`);
  assert.ok(block.includes('status: "preview_only"'), `${id} must be preview_only`);
  assert.ok(block.includes("canExecute: false"), `${id} must set canExecute: false`);
  assert.ok(block.includes("canSubmit: false"), `${id} must set canSubmit: false`);
  assert.ok(block.includes("liveExecutionEnabled: false"), `${id} must set liveExecutionEnabled: false`);
}

// 8. Decentralized services template remains future-contract only.
const decentralizedBlock = blocks["DECENTRALIZED_SERVICES_FUTURE_WORKFLOW"];
assert.ok(decentralizedBlock, "decentralized_services_future_workflow block must exist");
assert.ok(decentralizedBlock.includes('status: "planned_not_live"'), "decentralized_services_future_workflow must be planned_not_live");
assert.ok(decentralizedBlock.includes("canExecute: false"), "decentralized_services_future_workflow must set canExecute: false");
assert.ok(decentralizedBlock.includes("liveExecutionEnabled: false"), "decentralized_services_future_workflow must set liveExecutionEnabled: false");

// 9. All service hooks in decentralized services template are planned_not_live.
const dsServiceHookMatch = decentralizedBlock.match(/serviceHooks:\s*\[([\s\S]*?)\]/);
assert.ok(dsServiceHookMatch, "decentralized_services_future_workflow must have serviceHooks");
const dsHookStatuses = [];
const hookRegex = /status:\s*"([^"]+)"/g;
let m;
while ((m = hookRegex.exec(dsServiceHookMatch[1])) !== null) dsHookStatuses.push(m[1]);
for (const status of dsHookStatuses) {
  assert.equal(status, "planned_not_live", `decentralized_services_future_workflow service hook must be planned_not_live, got ${status}`);
}

// 10. All templates set liveExecutionEnabled: false and canSubmit: false.
for (const [name, block] of Object.entries(blocks)) {
  assert.ok(block.includes("liveExecutionEnabled: false"), `${name} must set liveExecutionEnabled: false`);
  assert.ok(block.includes("canSubmit: false"), `${name} must set canSubmit: false`);
}

// 11. Registry covers all templates.
const registryBlock = types.slice(types.indexOf("MATTERHORN_WORKFLOW_TEMPLATE_REGISTRY"));
for (const id of templateIds) {
  assert.ok(registryBlock.includes(id), `template registry missing: ${id}`);
}

// 12. Doc coverage.
for (const snippet of [
  "MatterhornWorkflowTemplate",
  "MatterhornWorkflowTemplateSafetyBoundary",
  "MATTERHORN_WORKFLOW_TEMPLATE_REGISTRY",
  "wellness_creator_service_workflow",
  "bittensor_beta_operator_workflow",
  "hyperliquid_preview_workflow",
  "polymarket_preview_workflow",
  "decentralized_services_future_workflow",
]) {
  assert.ok(doc.includes(snippet), `doc missing: ${snippet}`);
}

// 13. Desk manifest registry exists and covers expected desks.
const deskIds = [
  "bittensor",
  "hyperliquid",
  "polymarket",
  "sui",
  "wellness",
  "memory",
  "mcp",
  "settings",
  "services",
];
const deskRegistryBlock = types.slice(types.indexOf("MATTERHORN_DESK_MANIFEST_REGISTRY"));
for (const id of deskIds) {
  assert.ok(deskRegistryBlock.includes(id), `desk manifest registry missing: ${id}`);
}

// 14. Every desk manifest declares required display/safety fields.
function extractDeskManifestBlocks(text) {
  const blocks = {};
  const regex = /export const (\w+)_DESK_MANIFEST:\s*MatterhornDeskManifest\s*=\s*\{/g;
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

const deskBlocks = extractDeskManifestBlocks(types);
assert.equal(Object.keys(deskBlocks).length, deskIds.length, `expected ${deskIds.length} desk manifest blocks`);

for (const [name, block] of Object.entries(deskBlocks)) {
  for (const field of [
    "deskDisplayName",
    "deskShortName",
    "deskDescription",
    "deskAccent",
    "customerPrimaryAction",
    "customerSafetyStrip",
  ]) {
    assert.ok(block.includes(`${field}:`), `${name} desk manifest must include ${field}`);
  }
  assert.ok(block.includes("liveSubmissionEnabled: false"), `${name} desk manifest must disable live submission`);
  assert.ok(block.includes("acceptsPrivateKeys: false"), `${name} desk manifest must not accept private keys`);
  assert.ok(block.includes("acceptsSeedPhrases: false"), `${name} desk manifest must not accept seed phrases`);
  assert.ok(block.includes("acceptsApiSecrets: false"), `${name} desk manifest must not accept API secrets`);
  assert.ok(block.includes("acceptsRawSignatures: false"), `${name} desk manifest must not accept raw signatures`);
  assert.ok(block.includes("acceptsSignedPayloads: false"), `${name} desk manifest must not accept signed payloads`);
  assert.ok(block.includes("acceptsWalletExports: false"), `${name} desk manifest must not accept wallet exports`);
}

// 15. Desk status rules.
assert.ok(deskBlocks["BITTENSOR"].includes('status: "beta_ready"'), "Bittensor desk must be beta_ready");
assert.ok(deskBlocks["BITTENSOR"].includes("requiresExternalSigner: true"), "Bittensor desk must require external signer");
assert.ok(deskBlocks["HYPERLIQUID"].includes('status: "preview_only"'), "Hyperliquid desk must be preview_only");
assert.ok(deskBlocks["POLYMARKET"].includes('status: "preview_only"'), "Polymarket desk must be preview_only");
assert.ok(deskBlocks["WELLNESS"].includes('status: "workflow_ready"'), "Wellness desk must be workflow_ready");
assert.ok(deskBlocks["SERVICES"].includes('status: "planned_not_live"'), "Services desk must be planned_not_live");
assert.ok(deskBlocks["SERVICES"].includes("isPrimaryCustomerDesk: false"), "Services desk must not be a primary customer desk");

console.log("Matterhorn workflow template registry check passed.");
