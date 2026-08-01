#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const types = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");
const protocolBrandLogo = readFileSync(
  "apps/app/src/react-app/domains/session/workflows/protocol-brand-logo.tsx",
  "utf8",
);
const protocolDeskPanel = readFileSync(
  "apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx",
  "utf8",
);
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));

// 1. Root package exposes the test script.
assert.equal(
  rootPackage.scripts["test:protocol-desk-visual-contract"],
  "node scripts/protocol-desk-visual-contract.test.mjs",
  "package.json should expose the protocol desk visual contract test script",
);

// 2. Required types, constants, and helper exports exist.
for (const token of [
  "ProtocolDeskManifest",
  "ProtocolDeskVisualStatus",
  "ProtocolDeskCategory",
  "ProtocolDeskWalletRequirement",
  "ProtocolDeskWalletRailMode",
  "ProtocolDeskStatusBadgeTone",
  "ProtocolDeskReadinessTone",
  "ProtocolDeskBackendStatus",
  "ProtocolDeskActionStatus",
  "ProtocolDeskExtensionStatus",
  "ProtocolDeskAction",
  "ProtocolDeskThemeTokenHints",
  "ProtocolDeskSafetyBoundaries",
  "ProtocolBrandAssetManifest",
  "DEFAULT_PROTOCOL_DESK_SAFETY_BOUNDARIES",
  "PROTOCOL_DESK_MANIFEST_REGISTRY",
  "PROTOCOL_BRAND_ASSET_REGISTRY",
  "CUSTOMER_DESK_ORDER",
  "getProtocolDeskManifest",
  "listCustomerProtocolDesks",
  "getDeskLauncherPrompt",
  "getDeskSafetySummary",
  "getDeskWalletRequirementSummary",
  "getDeskLogoFallback",
]) {
  assert.ok(types.includes(token), `types missing protocol desk visual token: ${token}`);
}

const expectedDeskIds = ["bittensor", "hyperliquid", "polymarket", "sui", "wellness", "memory", "mcps"];

for (const descriptor of [
  "TAO wallet · subnets · validators",
  "Markets · account · wallet execution",
  "Markets · outcomes · compliance",
]) {
  assert.equal(protocolDeskPanel.includes(descriptor), false, `protocol desk should not show redundant eyebrow copy: ${descriptor}`);
}
assert.equal(protocolDeskPanel.includes("eyebrow:"), false, "protocol desk config should not retain redundant eyebrow metadata");

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
    "launcherTitle",
    "launcherDescription",
    "launcherPrompt",
    "rightRailSummary",
    "logoAssetId",
    "officialLogoAssetId",
    "logoAlt",
    "category",
    "status",
    "readinessTone",
    "backendStatus",
    "actionStatus",
    "extensionStatus",
    "statusBadgeLabel",
    "statusBadgeTone",
    "routeOrPanelId",
    "logoAssetKey",
    "preferredColorToken",
    "lightThemeTokenHints",
    "darkThemeTokenHints",
    "primaryActions",
    "primaryActionLabel",
    "secondaryActions",
    "walletRequirements",
    "walletRailMode",
    "safetyBoundaries",
    "customerVisible",
    "capabilityBullets",
    "safetySummary",
    "customerCapabilitySummary",
    "noCustodySafetyLine",
    "suggestedPromptTitles",
    "emptyStateCopy",
    "degradedStateCopy",
  ]) {
    assert.ok(block.includes(`${field}:`), `${id} desk manifest must include ${field}`);
  }

  for (const copyField of ["headline", "body"]) {
    assert.ok(block.includes(`${copyField}:`), `${id} desk manifest empty/degraded state must include ${copyField}`);
  }
}

// 6. Safety invariants: no desk accepts secrets. Financial completion occurs
//    only in a separate user-authorized wallet surface; agents remain no-submit.
const walletAuthorizedDeskIds = new Set(["bittensor", "hyperliquid", "polymarket", "sui"]);
for (const [id, block] of Object.entries(deskBlocks)) {
  assert.ok(
    block.includes(`liveSubmissionEnabled: ${walletAuthorizedDeskIds.has(id) ? "true" : "false"}`),
    `${id} must declare the expected live-submission boundary`,
  );
  assert.ok(block.includes("acceptsPrivateKeys: false"), `${id} must not accept private keys`);
  assert.ok(block.includes("acceptsSeedPhrases: false"), `${id} must not accept seed phrases`);
  assert.ok(block.includes("acceptsApiSecrets: false"), `${id} must not accept API secrets`);
  assert.ok(block.includes("acceptsRawSignatures: false"), `${id} must not accept raw signatures`);
  assert.ok(block.includes("acceptsSignedPayloads: false"), `${id} must not accept signed payloads`);
  assert.ok(block.includes("acceptsWalletExports: false"), `${id} must not accept wallet exports`);
  assert.ok(
    block.includes(`allowsRealFunds: ${walletAuthorizedDeskIds.has(id) ? "true" : "false"}`),
    `${id} must declare the expected real-funds boundary`,
  );
  assert.ok(block.includes("medicalClaimsAllowed: false"), `${id} must not allow medical claims`);
}

// 7. Market desk status rules.
for (const id of ["hyperliquid", "polymarket"]) {
  const block = deskBlocks[id];
  assert.ok(
    block.includes(`status: "${id === "hyperliquid" ? "live" : "beta_ready"}"`),
    `${id} must expose the expected customer status`,
  );
  assert.ok(block.includes("requiresExternalSigner: false"), `${id} must not require external signer`);

  const marketCopy = [
    block.match(/displayName:\s*"([^"]+)"/)?.[1] ?? "",
    block.match(/shortDescription:\s*"([^"]+)"/)?.[1] ?? "",
    block.match(/launcherTitle:\s*"([^"]+)"/)?.[1] ?? "",
    block.match(/launcherDescription:\s*"([^"]+)"/)?.[1] ?? "",
    block.match(/rightRailSummary:\s*"([^"]+)"/)?.[1] ?? "",
    block.match(/capabilityBullets:/) ? block.match(/capabilityBullets:\s*\[([\s\S]*?)\]/)?.[1] ?? "" : "",
    block.match(/safetySummary:\s*"([^"]+)"/)?.[1] ?? "",
    block.match(/customerCapabilitySummary:\s*"([^"]+)"/)?.[1] ?? "",
    block.match(/noCustodySafetyLine:\s*"([^"]+)"/)?.[1] ?? "",
    ...Array.from(block.matchAll(/headline:\s*"([^"]+)"/g)).map((m) => m[1]),
    ...Array.from(block.matchAll(/body:\s*"([^"]+)"/g)).map((m) => m[1]),
  ]
    .join(" ")
    .toLowerCase();
  const forbidden = id === "hyperliquid"
    ? ["seed phrase", "raw signature", "signed payload", "custody"]
    : ["private key", "seed phrase", "api secret", "raw signature", "signed payload", "custody"];
  for (const phrase of forbidden) {
    assert.equal(
      marketCopy.includes(phrase),
      false,
      `${id} manifest copy must not mention "${phrase}"`,
    );
  }
  if (id === "hyperliquid") {
    assert.ok(marketCopy.includes("connected wallet"), "Hyperliquid must explain the connected-wallet boundary");
    assert.ok(marketCopy.includes("exact reviewed order"), "Hyperliquid must explain exact-order review");
  } else {
    assert.ok(marketCopy.includes("eligible eoa buy"), "Polymarket must explain the supported BUY boundary");
    assert.ok(marketCopy.includes("connected polygon wallet"), "Polymarket must explain wallet authorization");
  }
}

// 8. Bittensor manifest distinguishes SS58/coldkey/hotkey from EVM wallet.
const bittensorBlock = deskBlocks.bittensor;
assert.ok(bittensorBlock.includes('status: "beta_ready"'), "Bittensor must be beta_ready");
assert.ok(bittensorBlock.includes("requiresExternalSigner: false"), "Bittensor connected-wallet transfers must not require an external signer");
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
  wellnessBlock.match(/launcherTitle:\s*"([^"]+)"/)?.[1] ?? "",
  wellnessBlock.match(/launcherDescription:\s*"([^"]+)"/)?.[1] ?? "",
  wellnessBlock.match(/rightRailSummary:\s*"([^"]+)"/)?.[1] ?? "",
  wellnessBlock.match(/capabilityBullets:/) ? wellnessBlock.match(/capabilityBullets:\s*\[([\s\S]*?)\]/)?.[1] ?? "" : "",
  wellnessBlock.match(/safetySummary:\s*"([^"]+)"/)?.[1] ?? "",
  ...Array.from(wellnessBlock.matchAll(/headline:\s*"([^"]+)"/g)).map((m) => m[1]),
  ...Array.from(wellnessBlock.matchAll(/body:\s*"([^"]+)"/g)).map((m) => m[1]),
].join(" ").toLowerCase();
for (const forbidden of ["wallet", "private key", "submit", "live submission"]) {
  assert.equal(
    wellnessCopy.includes(forbidden),
    false,
    `Wellness manifest copy must not mention "${forbidden}"`,
  );
}
for (const forbidden of ["live payment", "live email", "live hosting"]) {
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
  for (const field of ["lightAssetPath", "darkAssetPath"]) {
    const assetPath = block.match(new RegExp(`${field}:\\s*"([^"]+)"`))?.[1];
    const fallback = block.match(/fallbackInitials:\s*"([^"]+)"/)?.[1];
    if (!assetPath) {
      assert.ok(fallback, `${key} brand asset without ${field} path must include fallbackInitials`);
      continue;
    }
    assert.ok(
      existsSync(`apps/app/public${assetPath}`),
      `${key} ${field} should resolve to a bundled app asset: ${assetPath}`,
    );
  }
}

// 14. Customer desk order matches the registry and is stable.
const customerOrderArrayMatch = types.match(/CUSTOMER_DESK_ORDER:\s*string\[\]\s*=\s*(\[[\s\S]*?\]);/);
assert.ok(customerOrderArrayMatch, "CUSTOMER_DESK_ORDER array must be extractable");
const customerOrderBlock = customerOrderArrayMatch[1];
for (const id of expectedDeskIds) {
  assert.ok(customerOrderBlock.includes(`"${id}"`), `CUSTOMER_DESK_ORDER must include ${id}`);
}
assert.equal(
  (customerOrderBlock.match(/"/g) || []).length,
  expectedDeskIds.length * 2,
  "CUSTOMER_DESK_ORDER must contain exactly the expected desks",
);

// 15. Helper functions are exported and reference registry/brand assets.
assert.ok(types.includes("export function getProtocolDeskManifest"), "getProtocolDeskManifest must be exported");
assert.ok(types.includes("export function listCustomerProtocolDesks"), "listCustomerProtocolDesks must be exported");
assert.ok(types.includes("export function getDeskLauncherPrompt"), "getDeskLauncherPrompt must be exported");
assert.ok(types.includes("export function getDeskSafetySummary"), "getDeskSafetySummary must be exported");
assert.ok(types.includes("export function getDeskWalletRequirementSummary"), "getDeskWalletRequirementSummary must be exported");
assert.ok(types.includes("export function getDeskLogoFallback"), "getDeskLogoFallback must be exported");
assert.ok(
  protocolBrandLogo.includes("resolveExtensionIconSrc") &&
    protocolBrandLogo.includes("resolveExtensionIconSrc(asset.lightAssetPath") &&
    protocolBrandLogo.includes("resolveExtensionIconSrc(asset.darkAssetPath)"),
  "protocol desk logos must resolve public asset paths against the Vite base for packaged file URLs",
);

// 16. Wallet rail modes match desk posture.
assert.ok(deskBlocks.bittensor.includes('walletRailMode: "external_signer"'), "Bittensor walletRailMode must be external_signer");
assert.ok(deskBlocks.hyperliquid.includes('walletRailMode: "evm_connect"'), "Hyperliquid walletRailMode must be evm_connect");
assert.ok(deskBlocks.polymarket.includes('walletRailMode: "evm_preview"'), "Polymarket walletRailMode must be evm_preview");
assert.ok(deskBlocks.sui.includes('walletRailMode: "sui_wallet"'), "Sui walletRailMode must be sui_wallet");
for (const id of ["wellness", "memory", "mcps"]) {
  assert.ok(deskBlocks[id].includes('walletRailMode: "none"'), `${id} walletRailMode must be none`);
}

// 17. All customer-facing desks are visible.
for (const id of expectedDeskIds) {
  assert.ok(deskBlocks[id].includes("customerVisible: true"), `${id} must be customerVisible`);
}

// 18. Status badge labels and tones are present.
for (const id of expectedDeskIds) {
  assert.ok(deskBlocks[id].includes("statusBadgeLabel:"), `${id} must include statusBadgeLabel`);
  assert.ok(deskBlocks[id].includes("statusBadgeTone:"), `${id} must include statusBadgeTone`);
}

// 19. Readiness tones are present and match desk posture.
const expectedReadinessTones = {
  bittensor: "beta_ready",
  hyperliquid: "live",
  polymarket: "beta_ready",
  sui: "beta_ready",
  wellness: "workflow_ready",
  memory: "beta_ready",
  mcps: "local_only",
};
for (const [id, tone] of Object.entries(expectedReadinessTones)) {
  assert.ok(
    deskBlocks[id].includes(`readinessTone: "${tone}"`),
    `${id} must have readinessTone ${tone}`,
  );
}

// 20. Truth labels are present and match desk/backend/extension posture.
const expectedStatusLabels = {
  bittensor: {
    backendStatus: "partial",
    actionStatus: "external_signer",
    extensionStatus: "built_in_partial",
  },
  hyperliquid: {
    backendStatus: "live",
    actionStatus: "live",
    extensionStatus: "built_in_live",
  },
  polymarket: {
    backendStatus: "live",
    actionStatus: "live",
    extensionStatus: "built_in_live",
  },
  sui: {
    backendStatus: "live",
    actionStatus: "live",
    extensionStatus: "built_in_live",
  },
  wellness: {
    backendStatus: "static_catalog",
    actionStatus: "workflow_only",
    extensionStatus: "static_catalog",
  },
  memory: {
    backendStatus: "live",
    actionStatus: "read_only",
    extensionStatus: "built_in_live",
  },
  mcps: {
    backendStatus: "disabled",
    actionStatus: "workflow_only",
    extensionStatus: "requires_setup",
  },
};
for (const [id, expected] of Object.entries(expectedStatusLabels)) {
  for (const [field, value] of Object.entries(expected)) {
    assert.ok(
      deskBlocks[id].includes(`${field}: "${value}"`),
      `${id} must have ${field} ${value}`,
    );
  }
}

// 21. Bittensor supports connected-wallet transfers and external-signer staking.
assert.ok(deskBlocks.bittensor.includes('status: "beta_ready"'), "Bittensor must be beta_ready");
assert.ok(deskBlocks.bittensor.includes('actionStatus: "external_signer"'), "Bittensor actionStatus must be external_signer");
assert.ok(deskBlocks.bittensor.includes('backendStatus: "partial"'), "Bittensor backendStatus must be partial");
assert.ok(deskBlocks.bittensor.includes("requiresExternalSigner: false"), "Bittensor transfers must support connected-wallet approval");

// 22. Hyperliquid and eligible Polymarket BUY orders are wallet-approved. Neither accepts secrets.
assert.ok(deskBlocks.hyperliquid.includes('status: "live"'), "Hyperliquid must be live");
assert.ok(deskBlocks.hyperliquid.includes('actionStatus: "live"'), "Hyperliquid actionStatus must be live");
assert.ok(deskBlocks.hyperliquid.includes('backendStatus: "live"'), "Hyperliquid backendStatus must be live");
assert.ok(deskBlocks.hyperliquid.includes("liveSubmissionEnabled: true"), "Hyperliquid must enable wallet-approved submission");

assert.ok(deskBlocks.polymarket.includes('status: "beta_ready"'), "Polymarket must be beta_ready");
assert.ok(deskBlocks.polymarket.includes('actionStatus: "live"'), "Polymarket actionStatus must be live");
assert.ok(deskBlocks.polymarket.includes('backendStatus: "live"'), "Polymarket backendStatus must be live");
assert.ok(deskBlocks.polymarket.includes("liveSubmissionEnabled: true"), "Polymarket must enable wallet-approved submission");

for (const id of ["hyperliquid", "polymarket"]) {
  assert.ok(deskBlocks[id].includes("acceptsPrivateKeys: false"), `${id} must not accept private keys`);
  assert.ok(deskBlocks[id].includes("acceptsApiSecrets: false"), `${id} must not accept API secrets`);
  assert.ok(deskBlocks[id].includes("acceptsRawSignatures: false"), `${id} must not accept raw signatures`);
  assert.ok(deskBlocks[id].includes("acceptsSignedPayloads: false"), `${id} must not accept signed payloads`);
}

// 23. Wellness is workflow-only and not Web3/medical/payment/email/hosting live.
assert.ok(deskBlocks.wellness.includes('status: "workflow_ready"'), "Wellness must be workflow_ready");
assert.ok(deskBlocks.wellness.includes('actionStatus: "workflow_only"'), "Wellness actionStatus must be workflow_only");
assert.ok(deskBlocks.wellness.includes('backendStatus: "static_catalog"'), "Wellness backendStatus must be static_catalog");
assert.ok(deskBlocks.wellness.includes('walletRailMode: "none"'), "Wellness must require no wallet");
const wellnessStatusLower = deskBlocks.wellness.toLowerCase();
for (const phrase of ["non-medical", "educational"]) {
  assert.ok(wellnessStatusLower.includes(phrase), `Wellness must include "${phrase}"`);
}
for (const forbidden of ["live payment", "live email", "live hosting"]) {
  assert.equal(
    wellnessStatusLower.includes(forbidden),
    false,
    `Wellness must not mention "${forbidden}"`,
  );
}

// 24. MCPs desk is disabled as a backend and requires user setup for extensions.
assert.ok(deskBlocks.mcps.includes('backendStatus: "disabled"'), "MCPs backendStatus must be disabled");
assert.ok(deskBlocks.mcps.includes('extensionStatus: "requires_setup"'), "MCPs extensionStatus must be requires_setup");

// 25. Every desk exposes capability bullets, safety summary, and suggested prompt titles.
for (const id of expectedDeskIds) {
  const bulletsMatch = deskBlocks[id].match(/capabilityBullets:\s*\[([\s\S]*?)\]/);
  assert.ok(bulletsMatch, `${id} must include capabilityBullets`);
  const bullets = [...bulletsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(bullets.length >= 2, `${id} must have at least 2 capability bullets`);

  assert.ok(deskBlocks[id].includes("safetySummary:"), `${id} must include safetySummary`);

  const titlesMatch = deskBlocks[id].match(/suggestedPromptTitles:\s*\[([\s\S]*?)\]/);
  assert.ok(titlesMatch, `${id} must include suggestedPromptTitles`);
  const titles = [...titlesMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(titles.length >= 2, `${id} must have at least 2 suggested prompt titles`);
}

console.log("Protocol desk visual contract check passed.");
