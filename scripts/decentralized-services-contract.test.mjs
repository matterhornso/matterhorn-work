#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const doc = readFileSync("docs/decentralized-services-capability-contract.md", "utf8");
const types = readFileSync("packages/types/src/decentralized-services.ts", "utf8");
const index = readFileSync("packages/types/src/index.ts", "utf8");
const typesPackage = JSON.parse(readFileSync("packages/types/package.json", "utf8"));
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));

const capabilities = ["hosting", "storage", "email", "payments", "identity"];

// 1. All five capabilities are covered in docs and types.
const docLower = doc.toLowerCase();
for (const capability of capabilities) {
  assert.ok(docLower.includes(capability), `doc missing capability section: ${capability}`);
  assert.ok(types.includes(`"${capability}"`), `types missing capability literal: ${capability}`);
}
assert.ok(types.includes('DECENTRALIZED_SERVICE_CAPABILITIES'), "types should export capability registry");

// 2. No JSON examples request private keys, seed phrases, raw signatures, API secrets, or wallet exports.
const forbiddenJsonKeys = [
  '"privateKey":',
  '"private_key":',
  '"seed":',
  '"seedPhrase":',
  '"seed_phrase":',
  '"mnemonic":',
  '"rawSignature":',
  '"raw_signature":',
  '"apiSecret":',
  '"api_secret":',
  '"apiKeySecret":',
  '"walletExport":',
  '"wallet_export":',
  '"passphrase":',
  '"password":',
  '"keyfile":',
  '"suri":',
];
function extractJsonExamples(text) {
  const blocks = [];
  const regex = /```json\n([\s\S]*?)\n```/g;
  let match;
  while ((match = regex.exec(text)) !== null) blocks.push(match[1]);
  return blocks.join("\n");
}
const jsonExamples = extractJsonExamples(doc);
for (const forbidden of forbiddenJsonKeys) {
  assert.equal(jsonExamples.includes(forbidden), false, `JSON examples must not request forbidden key: ${forbidden}`);
}

// 3. Safety defaults and forbidden credential pattern are present.
for (const token of [
  "DECENTRALIZED_SERVICE_SAFETY_DEFAULTS",
  "DECENTRALIZED_SERVICE_FORBIDDEN_CREDENTIAL_KEY_PATTERN",
  "liveExecutionEnabled: false",
  "acceptsPrivateKeys: false",
  "acceptsApiSecrets: false",
  "acceptsRawSignatures: false",
  "requiresPreviewBeforeExecution: true",
  "requiresConfirmationBeforeExecution: true",
]) {
  assert.ok(types.includes(token), `types missing safety token: ${token}`);
}

// 4. Every execution-capable flow has preview, confirmation, receipt, and rollback/failure fields.
for (const snippet of [
  "DecentralizedServicePreview",
  "DecentralizedServiceConfirmation",
  "DecentralizedServiceReceipt",
  "DecentralizedServiceFailureResult",
  "rollbackAvailable",
  "rollbackAttempted",
  "previewSha256",
  "canExecute: false",
]) {
  assert.ok(types.includes(snippet), `types missing execution-flow field: ${snippet}`);
}

// 5. Docs state that these are future contracts, not live providers.
assert.ok(doc.includes("future contract only"), "doc should state future contract status");
assert.ok(doc.includes('"future_contract"'), "doc should include future_contract status");
assert.ok(doc.includes("No real provider is wired up"), "doc should clarify no live provider");
assert.ok(doc.includes("allContractsFutureOnly: true"), "doc should state allContractsFutureOnly");

// 6. Manifest, preview, handoff, receipt, and unsupported response examples are documented.
for (const snippet of [
  "matterhorn.services.provider-manifest.v1",
  "matterhorn.services.preview.v1",
  "matterhorn.services.external-action-handoff.v1",
  "matterhorn.services.receipt.v1",
  "matterhorn.services.unsupported.v1",
]) {
  assert.ok(doc.includes(snippet), `doc missing schema version: ${snippet}`);
  assert.ok(types.includes(snippet), `types missing schema version: ${snippet}`);
}

// 7. Type package exports the new module and root package exposes the test script.
assert.ok(index.includes('export * from "./decentralized-services"'), "types index should export decentralized-services");
assert.ok(typesPackage.exports["./decentralized-services"], "types package should export ./decentralized-services");
assert.equal(rootPackage.scripts["test:decentralized-services-contract"], "node scripts/decentralized-services-contract.test.mjs");

// 8. Provider-discovery fixtures exist for every capability and are readonly/future-contract only.
const fixtureConstants = [
  "HOSTING_DISCOVERY_FIXTURES",
  "STORAGE_DISCOVERY_FIXTURES",
  "EMAIL_DISCOVERY_FIXTURES",
  "PAYMENTS_DISCOVERY_FIXTURES",
  "IDENTITY_DISCOVERY_FIXTURES",
  "DECENTRALIZED_SERVICE_DISCOVERY_FIXTURES",
];
for (const constant of fixtureConstants) {
  assert.ok(types.includes(constant), `types missing discovery fixture constant: ${constant}`);
}

function extractFixtureBlocks(text) {
  const blocks = [];
  const regex = /:\s*DecentralizedServiceDiscoveryFixture\[\]\s*=\s*\[([\s\S]*?)\];/g;
  let match;
  while ((match = regex.exec(text)) !== null) blocks.push(match[1]);
  return blocks;
}

const fixtureBlocks = extractFixtureBlocks(types);
assert.ok(fixtureBlocks.length >= 5, `expected at least 5 capability fixture blocks, found ${fixtureBlocks.length}`);

const forbiddenFixtureKeys = [
  '"privateKey":',
  '"private_key":',
  '"seed":',
  '"seedPhrase":',
  '"seed_phrase":',
  '"mnemonic":',
  '"rawSignature":',
  '"raw_signature":',
  '"apiSecret":',
  '"api_secret":',
  '"apiKeySecret":',
  '"walletExport":',
  '"wallet_export":',
  '"passphrase":',
  '"password":',
  '"keyfile":',
  '"suri":',
];

for (const block of fixtureBlocks) {
  assert.ok(/status:\s*"future_contract"|status:\s*"readonly_preview"/.test(block), "fixture status must be future_contract or readonly_preview");
  assert.ok(block.includes("liveExecutionEnabled: false"), "fixture must set liveExecutionEnabled: false");
  assert.ok(block.includes("canExecute: false"), "fixture must set canExecute: false");
  assert.ok(block.includes("acceptsSecrets: false"), "fixture must set acceptsSecrets: false");
  assert.ok(block.includes("acceptsPrivateKeys: false"), "fixture must set acceptsPrivateKeys: false");
  assert.ok(block.includes("acceptsRawSignatures: false"), "fixture must set acceptsRawSignatures: false");
  assert.ok(block.includes("publicMetadata:"), "fixture must use publicMetadata for provider metadata");
  for (const forbidden of forbiddenFixtureKeys) {
    assert.equal(block.includes(forbidden), false, `fixture must not request forbidden key: ${forbidden}`);
  }
}

// 9. Fixture registry maps all capabilities to at least one fixture.
const registryBlock = types.slice(types.indexOf("DECENTRALIZED_SERVICE_DISCOVERY_FIXTURES"));
for (const capability of capabilities) {
  assert.ok(registryBlock.includes(capability), `fixture registry missing capability: ${capability}`);
}

// 10. Preview fixtures exist for every capability and are strictly non-executable.
const previewFixtureConstants = [
  "HOSTING_PREVIEW_FIXTURES",
  "STORAGE_PREVIEW_FIXTURES",
  "EMAIL_PREVIEW_FIXTURES",
  "PAYMENTS_PREVIEW_FIXTURES",
  "IDENTITY_PREVIEW_FIXTURES",
  "DECENTRALIZED_SERVICE_PREVIEW_FIXTURES",
];
for (const constant of previewFixtureConstants) {
  assert.ok(types.includes(constant), `types missing preview fixture constant: ${constant}`);
}

function extractPreviewFixtureBlocks(text) {
  const blocks = [];
  const regex = /:\s*DecentralizedServicePreview\[\]\s*=\s*\[([\s\S]*?)\];/g;
  let match;
  while ((match = regex.exec(text)) !== null) blocks.push(match[1]);
  return blocks;
}

const previewFixtureBlocks = extractPreviewFixtureBlocks(types);
assert.ok(previewFixtureBlocks.length >= 5, `expected at least 5 capability preview fixture blocks, found ${previewFixtureBlocks.length}`);

const forbiddenPreviewValues = [
  '"privateKey":',
  '"private_key":',
  '"seed":',
  '"seedPhrase":',
  '"seed_phrase":',
  '"mnemonic":',
  '"rawSignature":',
  '"raw_signature":',
  '"apiSecret":',
  '"api_secret":',
  '"apiKeySecret":',
  '"walletExport":',
  '"wallet_export":',
  '"passphrase":',
  '"password":',
  '"keyfile":',
  '"suri":',
  '"signedPayload":',
  '"signed_payload":',
];

for (const block of previewFixtureBlocks) {
  assert.ok(block.includes('version: "matterhorn.services.preview.v1"'), "preview fixture must use preview version");
  assert.ok(block.includes("canExecute: false"), "preview fixture must set canExecute: false");
  assert.ok(
    /execution:\s*"preview_required"|execution:\s*"confirmation_required"|execution:\s*"external_handoff_required"/.test(block),
    "preview fixture execution must be future/preview-only"
  );
  assert.ok(block.includes("consequence:"), "preview fixture must include consequence");
  assert.ok(block.includes("confirmationText:"), "preview fixture must include confirmationText");
  assert.ok(block.includes("previewSha256:"), "preview fixture must include previewSha256");
  for (const forbidden of forbiddenPreviewValues) {
    assert.equal(block.includes(forbidden), false, `preview fixture must not contain forbidden value: ${forbidden}`);
  }
}

const previewRegistryBlock = types.slice(types.indexOf("DECENTRALIZED_SERVICE_PREVIEW_FIXTURES"));
for (const capability of capabilities) {
  assert.ok(previewRegistryBlock.includes(capability), `preview fixture registry missing capability: ${capability}`);
}

console.log("Decentralized services capability contract static check passed.");
