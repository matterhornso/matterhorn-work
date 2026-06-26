#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));

// 1. Root package exposes the test script.
assert.equal(
  rootPackage.scripts["test:protocol-desk-visual-contract"],
  "node scripts/protocol-desk-visual-contract.test.mjs",
  "package.json should expose the protocol desk visual contract test script",
);

// 2. Required types and constants exist.
for (const token of [
  "ProtocolDeskManifest",
  "ProtocolDeskVisualStatus",
  "ProtocolDeskCategory",
  "ProtocolDeskWalletRequirement",
  "ProtocolDeskAction",
  "ProtocolDeskThemeTokenHints",
  "ProtocolDeskSafetyBoundaries",
  "ProtocolBrandAssetManifest",
  "DEFAULT_PROTOCOL_DESK_SAFETY_BOUNDARIES",
  "PROTOCOL_DESK_MANIFEST_REGISTRY",
  "PROTOCOL_BRAND_ASSET_REGISTRY",
]) {
  assert.ok(types.includes(token), `types missing protocol desk visual token: ${token}`);
}

const expectedDeskIds = ["bittensor", "hyperliquid", "polymarket", "wellness", "memory", "mcps"];

// 3. Registry covers expected desks.
const registryBlock = types.slice(types.indexOf("PROTOCOL_DESK_MANIFEST_REGISTRY"));
for (const id of expectedDeskIds) {
  assert.ok(registryBlock.includes(id), `protocol desk manifest registry missing: ${id}`);
}

// 4. Extract each desk manifest block.
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

const deskBlocks = {};
for (const id of expectedDeskIds) {
  const constName = id.toUpperCase().replace(/S$/, "S") + "_PROTOCOL_DESK_MANIFEST";
  const block = extractBlock(types, constName);
  assert.ok(block, `protocol desk manifest block must exist: ${id}`);
  deskBlocks[id] = block;
}

// 5. Every manifest includes required visual/UX fields.
for (const [id, block] of Object.entries(deskBlocks)) {
  for (const field of [
    "displayName",
    "shortDescription",
    "category",
    "status",
    "routeOrPanelId",
    "logoAssetKey",
    "preferredColorToken",
    "lightThemeTokenHints",
    "darkThemeTokenHints",
    "primaryActions",
    "secondaryActions",
    "walletRequirements",
    "safetyBoundaries",
    "emptyStateCopy",
    "degradedStateCopy",
  ]) {
    assert.ok(block.includes(`${field}:`), `${id} desk manifest must include ${field}`);
  }

  for (const copyField of ["headline", "body"]) {
    assert.ok(block.includes(`${copyField}:`), `${id} desk manifest empty/degraded state must include ${copyField}`);
  }
}

// 6. Safety invariants: secret acceptance and live submission are disabled everywhere.
for (const [id, block] of Object.entries(deskBlocks)) {
  assert.ok(block.includes("liveSubmissionEnabled: false"), `${id} must disable live submission`);
  assert.ok(block.includes("acceptsPrivateKeys: false"), `${id} must not accept private keys`);
  assert.ok(block.includes("acceptsSeedPhrases: false"), `${id} must not accept seed phrases`);
  assert.ok(block.includes("acceptsApiSecrets: false"), `${id} must not accept API secrets`);
  assert.ok(block.includes("acceptsRawSignatures: false"), `${id} must not accept raw signatures`);
  assert.ok(block.includes("acceptsSignedPayloads: false"), `${id} must not accept signed payloads`);
  assert.ok(block.includes("acceptsWalletExports: false"), `${id} must not accept wallet exports`);
  assert.ok(block.includes("allowsRealFunds: false"), `${id} must not allow real funds`);
  assert.ok(block.includes("medicalClaimsAllowed: false"), `${id} must not allow medical claims`);
}

// 7. Market desk status rules.
for (const id of ["hyperliquid", "polymarket"]) {
  const block = deskBlocks[id];
  assert.ok(block.includes('status: "preview_only"'), `${id} must be preview_only`);
  assert.ok(block.includes("requiresExternalSigner: false"), `${id} must not require external signer`);

  const blockLower = block.toLowerCase();
  for (const forbidden of [
    "private key",
    "seed phrase",
    "api secret",
    "raw signature",
    "signed payload",
    "custody",
    "live submission",
  ]) {
    assert.equal(
      blockLower.includes(forbidden),
      false,
      `${id} manifest copy must not mention "${forbidden}"`,
    );
  }
}

// 8. Bittensor manifest distinguishes SS58/coldkey/hotkey from EVM wallet.
const bittensorBlock = deskBlocks.bittensor;
assert.ok(bittensorBlock.includes('status: "beta_ready"'), "Bittensor must be beta_ready");
assert.ok(bittensorBlock.includes("requiresExternalSigner: true"), "Bittensor must require external signer");
const bittensorLower = bittensorBlock.toLowerCase();
assert.ok(bittensorLower.includes("ss58"), "Bittensor manifest must mention SS58");
assert.ok(
  bittensorLower.includes("private key") || bittensorLower.includes("seed phrase"),
  "Bittensor manifest must warn against private keys or seed phrases",
);

// 9. Wellness is non-medical and non-Web3 by default.
const wellnessBlock = deskBlocks.wellness;
assert.ok(wellnessBlock.includes('status: "workflow_ready"'), "Wellness must be workflow_ready");
assert.ok(wellnessBlock.includes('"none"'), "Wellness must require no wallet");
const wellnessLower = wellnessBlock.toLowerCase();
for (const required of ["non-medical", "educational"]) {
  assert.ok(wellnessLower.includes(required), `Wellness manifest must include "${required}"`);
}
const wellnessCopy = [
  wellnessBlock.match(/displayName:\s*"([^"]+)"/)?.[1] ?? "",
  wellnessBlock.match(/shortDescription:\s*"([^"]+)"/)?.[1] ?? "",
  ...Array.from(wellnessBlock.matchAll(/headline:\s*"([^"]+)"/g)).map((m) => m[1]),
  ...Array.from(wellnessBlock.matchAll(/body:\s*"([^"]+)"/g)).map((m) => m[1]),
].join(" ").toLowerCase();
for (const forbidden of ["web3", "wallet", "private key", "submit", "live submission"]) {
  assert.equal(
    wellnessCopy.includes(forbidden),
    false,
    `Wellness manifest copy must not mention "${forbidden}"`,
  );
}

// 10. MCPs desk is planned-not-live.
const mcpsBlock = deskBlocks.mcps;
assert.ok(mcpsBlock.includes('status: "planned_not_live"'), "MCPs must be planned_not_live");

// 11. Memory desk has visible/forgettable actions.
const memoryBlock = deskBlocks.memory;
assert.ok(memoryBlock.includes('status: "beta_ready"'), "Memory must be beta_ready");
assert.ok(memoryBlock.includes("forget record"), "Memory must include forget-record action");

// 12. Brand asset registry covers every logoAssetKey.
const assetRegistryBlock = types.slice(types.indexOf("PROTOCOL_BRAND_ASSET_REGISTRY"));
const logoAssetKeys = [];
for (const id of expectedDeskIds) {
  const logoMatch = deskBlocks[id].match(/logoAssetKey:\s*"([^"]+)"/);
  assert.ok(logoMatch, `${id} must declare logoAssetKey`);
  const assetKey = logoMatch[1];
  logoAssetKeys.push(assetKey);
  assert.ok(assetRegistryBlock.includes(assetKey), `brand asset registry missing: ${assetKey}`);
}

// 13. Every brand asset manifest has required fields.
const assetBlocks = {};
for (const key of logoAssetKeys) {
  const protocol = key.replace(/-logo$/, "");
  const constName = `${protocol.toUpperCase()}_BRAND_ASSET_MANIFEST`;
  const block = extractBlock(types, constName);
  assert.ok(block, `brand asset block must exist: ${key}`);
  assetBlocks[key] = block;
}

for (const [key, block] of Object.entries(assetBlocks)) {
  for (const field of ["assetKey", "protocol", "allowedUseNote", "lightAssetPath", "darkAssetPath", "fallbackInitials"]) {
    assert.ok(block.includes(`${field}:`), `${key} brand asset must include ${field}`);
  }
}

console.log("Protocol desk visual contract check passed.");
