#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const helper = readFileSync("scripts/decentralized-services-capabilities.mjs", "utf8");
const doc = readFileSync("docs/decentralized-services-capability-contract.md", "utf8");
const cli = readFileSync("apps/orchestrator/src/cli.ts", "utf8");
const server = readFileSync("apps/server/src/server.ts", "utf8");
const serverTool = readFileSync("apps/server/src/tools/decentralized-services.ts", "utf8");
const mcp = readFileSync("packages/matterhorn-work-mcp/index.mjs", "utf8");

assert.equal(
  rootPackage.scripts["test:decentralized-services-operator-helper"],
  "node scripts/decentralized-services-operator-helper.test.mjs",
  "package.json should expose the decentralized services operator helper gate",
);

for (const phrase of [
  "matterhorn.services.capability-catalog.v1",
  "matterhorn-work services capabilities --json",
  "matterhorn-work services capabilities --capability hosting --json",
  "pnpm test:decentralized-services-operator-helper",
  "future_contract",
  "liveExecutionEnabled: false",
  "canExecute: false",
  "acceptsPrivateKeys",
  "acceptsApiSecrets",
  "acceptsRawSignatures",
  "hosting",
  "storage",
  "email",
  "payments",
  "identity",
]) {
  assert.ok(helper.includes(phrase) || doc.includes(phrase), `helper/doc missing phrase: ${phrase}`);
}

for (const phrase of [
  "matterhorn-work services capabilities",
  "services capabilities",
  "decentralized-services",
  "runServices",
  "assertNoServicesSecrets",
  "decentralized-services-capabilities.mjs",
  "--capability <name>",
]) {
  assert.ok(cli.includes(phrase), `CLI should expose decentralized services helper phrase: ${phrase}`);
}

for (const phrase of [
  "/api/services/capabilities",
  "buildDecentralizedServicesCapabilityCatalog",
  "findForbiddenDecentralizedServiceQueryKey",
  "services_secret_rejected",
]) {
  assert.ok(server.includes(phrase), `server should expose decentralized services discovery phrase: ${phrase}`);
}

for (const phrase of [
  "matterhorn_services_get_capabilities",
  "/api/services/capabilities",
  "future decentralized service capability contracts",
]) {
  assert.ok(mcp.includes(phrase), `MCP should expose decentralized services discovery phrase: ${phrase}`);
}

const result = spawnSync(process.execPath, ["scripts/decentralized-services-capabilities.mjs", "--json"], {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
assert.equal(result.status, 0, `helper should exit 0. stderr=${result.stderr}`);
const catalog = JSON.parse(result.stdout);
assert.equal(catalog.version, "matterhorn.services.capability-catalog.v1");
assert.equal(catalog.status, "future_contract");
assert.equal(catalog.safety.liveExecutionEnabled, false);
assert.equal(catalog.safety.canExecute, false);
assert.equal(catalog.safety.acceptsPrivateKeys, false);
assert.equal(catalog.safety.acceptsApiSecrets, false);
assert.equal(catalog.safety.acceptsRawSignatures, false);
assert.deepEqual(
  catalog.capabilities.map((item) => item.capability),
  ["hosting", "storage", "email", "payments", "identity"],
);
for (const item of catalog.capabilities) {
  assert.equal(item.version, "matterhorn.services.provider-manifest.v1");
  assert.equal(item.status, "future_contract");
  assert.equal(item.liveExecutionEnabled, false);
  assert.equal(item.canExecute, false);
  assert.equal(item.safety.liveExecutionEnabled, false);
  assert.ok(Array.isArray(item.userIntents) && item.userIntents.length >= 3, `${item.capability} should include user intents`);
  assert.ok(Array.isArray(item.outputArtifacts) && item.outputArtifacts.length >= 3, `${item.capability} should include output artifacts`);
}

const filtered = spawnSync(process.execPath, [
  "scripts/decentralized-services-capabilities.mjs",
  "--capability",
  "hosting",
  "--json",
], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.equal(filtered.status, 0, `filtered helper should exit 0. stderr=${filtered.stderr}`);
const filteredCatalog = JSON.parse(filtered.stdout);
assert.deepEqual(filteredCatalog.capabilities.map((item) => item.capability), ["hosting"]);

const reject = spawnSync(process.execPath, [
  "scripts/decentralized-services-capabilities.mjs",
  "--json",
  "--private-key",
  "redacted",
], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024,
});
assert.notEqual(reject.status, 0, "helper should reject credential-shaped flags");
assert.match(reject.stderr, /Forbidden credential-shaped flag --private-key/);

for (const forbidden of [
  "/api/services/execute",
  "/api/services/submit",
  "liveExecutionEnabled: true",
  "canExecute: true",
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
]) {
  assert.equal(helper.includes(forbidden), false, `helper must not expose ${forbidden}`);
  assert.equal(cli.includes(forbidden), false, `CLI must not expose ${forbidden}`);
  assert.equal(serverTool.includes(forbidden), false, `server tool must not expose ${forbidden}`);
  assert.equal(mcp.includes(forbidden), false, `MCP must not expose ${forbidden}`);
}

console.log("Decentralized services operator helper check passed.");
