#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const index = readFileSync("packages/types/src/index.ts", "utf8");
const walletRuntime = readFileSync("packages/types/src/wallet-runtime.ts", "utf8");
const profileReadiness = readFileSync("packages/types/src/profile-readiness.ts", "utf8");
const mcpCard = readFileSync("packages/types/src/mcp-card.ts", "utf8");
const chatDraft = readFileSync("packages/types/src/chat-draft.ts", "utf8");

const allContracts = walletRuntime + profileReadiness + mcpCard + chatDraft;

// 1. Root package exposes the test script.
assert.equal(
  rootPackage.scripts["test:wallet-profile-mcp-readiness-contract"],
  "node scripts/wallet-profile-mcp-readiness-contract.test.mjs",
  "root package must expose test:wallet-profile-mcp-readiness-contract",
);

// 2. Types index exports the new modules.
for (const mod of ["./wallet-runtime", "./profile-readiness", "./mcp-card", "./chat-draft"]) {
  assert.ok(index.includes(`export * from "${mod}"`), `types index must export ${mod}`);
}

// --- Wallet runtime contract ---
for (const token of [
  "WalletRuntime",
  "EvmConnectorState",
  "DesktopWalletStrategy",
  "WalletProtocol",
  "WalletProtocolCapability",
  "WalletRuntimeCapability",
  "WALLET_RUNTIME_CAPABILITY_REGISTRY",
  "getWalletRuntimeCapability",
]) {
  assert.ok(walletRuntime.includes(token), `wallet-runtime.ts missing ${token}`);
}

// 3. Hyperliquid and Polymarket remain canSubmit:false and liveSubmissionEnabled:false.
for (const protocol of ["hyperliquid", "polymarket"]) {
  const block = extractObjectBlock(walletRuntime, `${protocol}: `);
  assert.ok(block, `wallet runtime block must exist for ${protocol}`);
  assert.ok(block.includes("canSubmit: false"), `${protocol} wallet capability must disable canSubmit`);
  assert.ok(
    block.includes("liveSubmissionEnabled: false"),
    `${protocol} wallet capability must disable live submission`,
  );
}

// 4. Desktop/Electron runtime cannot claim injected MetaMask/Rabby support.
for (const runtime of ["desktop", "electron"]) {
  const block = extractObjectBlock(walletRuntime, `${runtime.toUpperCase()}_WALLET_RUNTIME_CAPABILITY`);
  assert.ok(block, `wallet runtime block must exist for ${runtime}`);
  assert.ok(block.includes("supportsInjectedEvm: false"), `${runtime} must not claim injected EVM support`);
}

const webBlock = extractObjectBlock(walletRuntime, "WEB_WALLET_RUNTIME_CAPABILITY");
assert.ok(webBlock.includes("supportsInjectedEvm: true"), "web runtime may claim injected EVM support");

// --- Profile readiness contract ---
for (const token of [
  "ProfileAuthState",
  "ProfileSupportLinks",
  "ProfileReadiness",
  "PROFILE_READINESS_REGISTRY",
  "getProfileReadiness",
]) {
  assert.ok(profileReadiness.includes(token), `profile-readiness.ts missing ${token}`);
}

// 5. All support links are Matterhorn-owned or explicitly marked external.
const linkFieldMatches = [...profileReadiness.matchAll(/(docsUrl|feedbackUrl|issueUrl|accountUrl):/g)];
assert.ok(linkFieldMatches.length > 0, "profile readiness must declare support link fields");
assert.ok(
  profileReadiness.includes("function matterhornLink"),
  "profile readiness must build links via matterhornLink helper",
);
assert.ok(
  !profileReadiness.includes("https://") || profileReadiness.includes("https://matterhorn.so"),
  "profile readiness must only use Matterhorn-owned https links",
);
const externalLabelsMatches = [...profileReadiness.matchAll(/externalLinkLabels:\s*\[([^\]]*)\]/g)];
for (const [, content] of externalLabelsMatches) {
  if (content.includes('"')) {
    assert.ok(
      content.includes('"cloud_console"'),
      "profile externalLinkLabels may only contain explicitly marked external labels",
    );
  }
}

// --- MCP card connectivity contract ---
for (const token of [
  "McpCardStatus",
  "McpInstallTarget",
  "McpCardInstallCommand",
  "McpCardSupportedTool",
  "McpCardSafetyBoundary",
  "McpCardConnectivity",
  "MCP_CARD_REGISTRY",
  "getMcpCard",
  "listMcpCards",
]) {
  assert.ok(mcpCard.includes(token), `mcp-card.ts missing ${token}`);
}

const expectedMcpCardIds = [
  "bittensor-mcp-card",
  "hyperliquid-mcp-card",
  "polymarket-mcp-card",
  "memory-mcp-card",
  "workflow-mcp-card",
  "ui-control-mcp-card",
];
for (const id of expectedMcpCardIds) {
  assert.ok(mcpCard.includes(id), `mcp-card.ts missing card ${id}`);
}

// 6. MCP cards marked testable must include a test command or endpoint.
for (const id of expectedMcpCardIds) {
  const block = extractObjectBlock(mcpCard, `${id.replace(/-/g, "_").toUpperCase()}: `);
  assert.ok(block, `MCP card block must exist: ${id}`);
  const statusMatch = block.match(/status:\s*"([^"]+)"/);
  assert.ok(statusMatch, `${id} must declare status`);
  if (statusMatch[1] === "testable") {
    assert.ok(
      block.includes("testEndpoint") || block.includes("testCommand"),
      `${id} marked testable must include testEndpoint or testCommand`,
    );
  }
}

// 7. Static/catalog connectors cannot appear installed or configured.
const staticCatalogIds = ["workflow-mcp-card", "ui-control-mcp-card"];
for (const id of staticCatalogIds) {
  const block = extractObjectBlock(mcpCard, `${id.replace(/-/g, "_").toUpperCase()}: `);
  assert.ok(block, `MCP card block must exist: ${id}`);
  assert.ok(
    !block.includes('status: "installed"') && !block.includes('status: "configured"'),
    `${id} is a static/catalog connector and cannot appear installed or configured`,
  );
}

// 8. No MCP card allows seed phrase/private key/API secret/raw signature/signed payload/wallet export.
const forbiddenCredentialPatterns = [
  "private key",
  "seed phrase",
  "api secret",
  "raw signature",
  "signed payload",
  "wallet export",
  "mnemonic",
];
for (const id of expectedMcpCardIds) {
  const block = extractObjectBlock(mcpCard, `${id.replace(/-/g, "_").toUpperCase()}: `);
  const blockLower = block.toLowerCase();
  for (const pattern of forbiddenCredentialPatterns) {
    assert.equal(
      blockLower.includes(pattern),
      false,
      `${id} must not mention "${pattern}"`,
    );
  }
}

// 9. MCP card safety boundaries lock submit/live submission/secrets.
const baseSafetyBoundaryBlock = extractObjectBlock(mcpCard, "function baseSafetyBoundary");
assert.ok(baseSafetyBoundaryBlock.includes("liveSubmissionEnabled: false"), "base safety boundary must disable live submission");
assert.ok(baseSafetyBoundaryBlock.includes("canSubmit: false"), "base safety boundary must disable canSubmit");
assert.ok(baseSafetyBoundaryBlock.includes("acceptsPrivateKeys: false"), "base safety boundary must not accept private keys");
assert.ok(baseSafetyBoundaryBlock.includes("acceptsApiSecrets: false"), "base safety boundary must not accept API secrets");
assert.ok(baseSafetyBoundaryBlock.includes("allowsRealFunds: false"), "base safety boundary must not allow real funds");
for (const id of expectedMcpCardIds) {
  const block = extractObjectBlock(mcpCard, `${id.replace(/-/g, "_").toUpperCase()}: `);
  assert.ok(
    block.includes("safetyBoundary: baseSafetyBoundary()"),
    `${id} must use the shared base safety boundary`,
  );
}

// --- Chat draft contract ---
for (const token of [
  "ChatPromptAction",
  "ChatDraftConfig",
  "CHAT_DRAFT_REGISTRY",
  "getChatDraftConfig",
  "listChatDraftConfigs",
]) {
  assert.ok(chatDraft.includes(token), `chat-draft.ts missing ${token}`);
}

const expectedDraftDesks = ["bittensor", "hyperliquid", "polymarket", "wellness", "memory", "mcps"];
for (const deskId of expectedDraftDesks) {
  assert.ok(chatDraft.includes(`deskId: "${deskId}"`), `chat-draft.ts missing desk ${deskId}`);
}

// 10. Bittensor prompt actions are draft_only and carry Bittensor desk id.
const bittensorDraftBlock = extractObjectBlock(chatDraft, "BITTENSOR_CHAT_DRAFT");
assert.ok(bittensorDraftBlock.includes('deskId: "bittensor"'), "Bittensor chat draft must carry bittensor desk id");
assert.ok(bittensorDraftBlock.includes('promptAction: "draft_only"'), "Bittensor chat draft must be draft_only");

// 11. Markets never set send_after_confirm for live submit/sign paths.
for (const deskId of ["hyperliquid", "polymarket"]) {
  const block = extractObjectBlock(chatDraft, `${deskId.toUpperCase()}_CHAT_DRAFT`);
  assert.ok(block.includes('promptAction: "draft_only"'), `${deskId} chat draft must be draft_only`);
}

// 12. Every chat draft maps to exactly one desk id (no duplicate deskIds in registry).
const deskIdMatches = [...chatDraft.matchAll(/deskId:\s*"([^"]+)"/g)].map((m) => m[1]);
assert.equal(new Set(deskIdMatches).size, deskIdMatches.length, "chat draft registry must map each desk id exactly once");

console.log("Wallet, profile, MCP readiness contract check passed.");

function extractObjectBlock(text, marker) {
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
