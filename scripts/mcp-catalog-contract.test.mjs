#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("packages/types/src/matterhorn-workflows.ts", "utf8");
const index = readFileSync("packages/types/src/index.ts", "utf8");
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));

// 1. Root package exposes the test script.
assert.equal(
  rootPackage.scripts["test:mcp-catalog-contract"],
  "node scripts/mcp-catalog-contract.test.mjs",
  "root package must expose test:mcp-catalog-contract",
);

// 2. Types package exports the workflow module.
assert.ok(
  index.includes('export * from "./matterhorn-workflows"'),
  "types index should export matterhorn-workflows",
);

// 3. Required MCP catalog types and constants exist.
for (const token of [
  "MatterhornMcpCatalogItem",
  "MatterhornMcpToolDescriptor",
  "MatterhornMcpSafetyBoundary",
  "MatterhornMcpStatus",
  "MatterhornMcpCompatibleClient",
  "MATTERHORN_MCP_STATUSES",
  "MATTERHORN_MCP_COMPATIBLE_CLIENTS",
  "MATTERHORN_MCP_CATALOG_REGISTRY",
  "getMatterhornMcpCatalogItem",
  "listMatterhornMcpCatalogItems",
]) {
  assert.ok(types.includes(token), `types missing MCP catalog token: ${token}`);
}

const expectedMcpIds = [
  "matterhorn-bittensor",
  "matterhorn-hyperliquid",
  "matterhorn-polymarket",
  "matterhorn-memory",
  "matterhorn-workflow",
  "matterhorn-ui-control",
];

// 4. Registry covers expected MCP catalog IDs.
const registryBlock = types.slice(types.indexOf("MATTERHORN_MCP_CATALOG_REGISTRY"));
for (const id of expectedMcpIds) {
  assert.ok(registryBlock.includes(id), `MCP catalog registry missing: ${id}`);
}

// 5. Extract each catalog item block.
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

const mcpBlocks = {};
for (const id of expectedMcpIds) {
  const constName = id
    .replace(/^matterhorn-/, "")
    .split("-")
    .map((s) => s.toUpperCase())
    .join("_") + "_MCP_CATALOG_ITEM";
  const block = extractBlock(types, constName);
  assert.ok(block, `MCP catalog item block must exist: ${id}`);
  mcpBlocks[id] = block;
}

// 6. Every catalog item has required fields.
for (const [id, block] of Object.entries(mcpBlocks)) {
  for (const field of [
    "version",
    "id",
    "displayName",
    "deskId",
    "description",
    "installCommand",
    "supportedTools",
    "safetyBoundary",
    "compatibleClients",
    "status",
    "isBuiltIn",
  ]) {
    assert.ok(block.includes(`${field}:`), `${id} must include ${field}`);
  }
}

// 7. Every catalog item has a non-empty install command.
for (const [id, block] of Object.entries(mcpBlocks)) {
  const installMatch = block.match(/installCommand:\s*"([^"]+)"/);
  assert.ok(installMatch, `${id} must declare installCommand`);
  assert.ok(installMatch[1].length > 0, `${id} installCommand must not be empty`);
  assert.ok(
    installMatch[1].startsWith("matterhorn-work mcp install "),
    `${id} installCommand must use matterhorn-work mcp install`,
  );
}

// 8. Every catalog item has at least one supported tool.
for (const [id, block] of Object.entries(mcpBlocks)) {
  const toolsMatch = block.match(/supportedTools:\s*\[([\s\S]*?)\]/);
  assert.ok(toolsMatch, `${id} must declare supportedTools`);
  const tools = [...toolsMatch[1].matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(tools.length >= 1, `${id} must have at least one supported tool`);
}

// 9. Compatible clients list must include Codex and Claude Code where applicable.
for (const id of ["matterhorn-bittensor", "matterhorn-hyperliquid", "matterhorn-polymarket", "matterhorn-memory", "matterhorn-workflow"]) {
  assert.ok(
    mcpBlocks[id].includes('"codex"'),
    `${id} must list Codex as a compatible client`,
  );
  assert.ok(
    mcpBlocks[id].includes('"claude_code"'),
    `${id} must list Claude Code as a compatible client`,
  );
}

// 10. No catalog item includes forbidden credential examples or language.
const forbiddenPatterns = [
  "private key",
  "seed phrase",
  "api secret",
  "raw signature",
  "signed payload",
  "wallet export",
  "mnemonic",
];
for (const [id, block] of Object.entries(mcpBlocks)) {
  const blockLower = block.toLowerCase();
  for (const pattern of forbiddenPatterns) {
    assert.equal(
      blockLower.includes(pattern),
      false,
      `${id} must not mention "${pattern}"`,
    );
  }
}

// 11. Market MCPs cannot enable submit/sign/custody.
for (const id of ["matterhorn-hyperliquid", "matterhorn-polymarket"]) {
  const block = mcpBlocks[id];
  assert.ok(block.includes("liveSubmissionEnabled: false"), `${id} must disable live submission`);
  assert.ok(block.includes("canSubmit: false"), `${id} must disable canSubmit`);
  assert.ok(block.includes("acceptsPrivateKeys: false"), `${id} must not accept private keys`);
  assert.ok(block.includes("acceptsApiSecrets: false"), `${id} must not accept API secrets`);
  assert.ok(block.includes("acceptsRawSignatures: false"), `${id} must not accept raw signatures`);
  assert.ok(block.includes("acceptsSignedPayloads: false"), `${id} must not accept signed payloads`);
  assert.ok(block.includes("allowsRealFunds: false"), `${id} must not allow real funds`);
  assert.ok(block.includes("requiresExternalSigner: false"), `${id} must not require external signer at MCP boundary`);
}

// 12. Bittensor MCP requires external signer and operates on public data only.
const bittensorBlock = mcpBlocks["matterhorn-bittensor"];
assert.ok(bittensorBlock.includes("requiresExternalSigner: true"), "Bittensor MCP must require external signer");
assert.ok(bittensorBlock.includes("operatesOnPublicDataOnly: true"), "Bittensor MCP must operate on public data only");
assert.ok(bittensorBlock.includes("requiresUserConfirmation: true"), "Bittensor MCP must require user confirmation");

// 13. Memory MCP requires user confirmation and has no hidden saves.
const memoryBlock = mcpBlocks["matterhorn-memory"];
assert.ok(memoryBlock.includes("requiresUserConfirmation: true"), "Memory MCP must require user confirmation");
assert.ok(memoryBlock.includes("liveSubmissionEnabled: false"), "Memory MCP must disable live submission");

// 14. UI control MCP is local-only.
const uiControlBlock = mcpBlocks["matterhorn-ui-control"];
assert.ok(uiControlBlock.includes('deskId: "ui_control"'), "UI control MCP must have deskId ui_control");
assert.ok(uiControlBlock.includes("liveSubmissionEnabled: false"), "UI control MCP must disable live submission");
assert.ok(uiControlBlock.includes("canExecute: false"), "UI control MCP must disable canExecute");

// 15. Every MCP catalog item is marked as built-in.
for (const [id, block] of Object.entries(mcpBlocks)) {
  assert.ok(block.includes("isBuiltIn: true"), `${id} must be marked as built-in`);
}

// 16. The production MCP settings page must advertise only backend-registered Matterhorn tools.
const appMcpView = readFileSync("apps/app/src/react-app/domains/settings/pages/mcp-view.tsx", "utf8");
const backendMcpServer = readFileSync("packages/matterhorn-work-mcp/index.mjs", "utf8");
const backendTools = new Set(
  [...backendMcpServer.matchAll(/["'](matterhorn_[a-z0-9_]+)["']/g)].map((match) => match[1]),
);
const mcpViewStart = appMcpView.indexOf("const MATTERHORN_MCP_PRODUCT_CARDS");
const mcpViewEnd = appMcpView.indexOf("export function McpView");
assert.ok(mcpViewStart >= 0 && mcpViewEnd > mcpViewStart, "MCP settings UI product-card registry should be findable");
const mcpViewBlock = appMcpView.slice(mcpViewStart, mcpViewEnd);
const uiToolNames = [
  ...new Set([...mcpViewBlock.matchAll(/["'](matterhorn_[a-z0-9_]+)["']/g)].map((match) => match[1])),
];
assert.ok(
  uiToolNames.length > 40,
  "MCP settings UI should advertise the real backend Matterhorn MCP tool surface",
);
for (const tool of uiToolNames) {
  assert.ok(
    backendTools.has(tool),
    `MCP settings UI advertises ${tool}, but packages/matterhorn-work-mcp does not register it`,
  );
}
for (const staleTool of [
  "matterhorn_ui_get_state",
  "matterhorn_ui_list_actions",
  "matterhorn_ui_run_action",
]) {
  assert.equal(
    appMcpView.includes(staleTool),
    false,
    `MCP settings UI must not advertise unregistered UI bridge tool ${staleTool}`,
  );
}
assert.ok(
  appMcpView.includes("No external MCPs connected."),
  "MCP page should clarify empty status means no external MCP servers",
);
assert.ok(
  appMcpView.includes("Built-in Matterhorn MCPs are server-backed and ready to install") &&
    appMcpView.includes("below. Copy a command for Codex"),
  "MCP page should tell users built-in Matterhorn MCPs are backend-backed and ready to install",
);
assert.ok(appMcpView.includes("Core Agent MCP"), "MCP page should expose the backend core agent MCP tools");
assert.ok(appMcpView.includes("Evidence MCP"), "MCP page should expose the backend evidence MCP tools");

console.log("MCP catalog contract check passed.");
