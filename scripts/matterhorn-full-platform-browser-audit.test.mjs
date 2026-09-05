#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const source = readFileSync("scripts/matterhorn-full-platform-browser-audit.mjs", "utf8");

assert.equal(
  packageJson.scripts?.["test:matterhorn-full-platform-browser-audit"],
  "node scripts/matterhorn-full-platform-browser-audit.test.mjs",
);
assert.equal(
  packageJson.scripts?.["smoke:matterhorn-full-platform-browser-audit"],
  "node scripts/matterhorn-full-platform-browser-audit.mjs --strict",
);

for (const signal of [
  'import { chromium, firefox, webkit } from "playwright"',
  'Object.freeze({ chromium, firefox, webkit })',
  'argumentValue("--browser")',
  "MATTERHORN_FULL_AUDIT_BROWSER",
  'throw new Error("Browser must be chromium, firefox, or webkit.")',
  "browserEngine: browserName",
  "browserTypes[browserName].launch",
  "matterhorn-full-platform-browser-audit-${browserName}",
  "knownNonBlockingBrowserDiagnostic",
  "webkit_viewport_option_unsupported",
  "vite_dev_csp_eval_blocked",
  "browserWarningsByCategory",
  "waitForNotesPanel",
  'aria-label="Notes panel"',
]) {
  assert.ok(source.includes(signal), `full platform audit missing cross-browser boundary: ${signal}`);
}

const firefoxHelp = spawnSync(process.execPath, [
  "scripts/matterhorn-full-platform-browser-audit.mjs",
  "--help",
  "--browser",
  "firefox",
], { encoding: "utf8" });
assert.equal(firefoxHelp.status, 0, firefoxHelp.stderr);
assert.match(firefoxHelp.stdout, /chromium, firefox, or webkit/);

const invalidBrowser = spawnSync(process.execPath, [
  "scripts/matterhorn-full-platform-browser-audit.mjs",
  "--browser",
  "safari",
], { encoding: "utf8" });
assert.notEqual(invalidBrowser.status, 0);
assert.match(invalidBrowser.stderr, /Browser must be chromium, firefox, or webkit/);

for (const surface of [
  "workspace-home",
  "project-history",
  "settings-general",
  "settings-overview",
  "settings-preferences",
  "settings-permissions",
  "settings-wallet",
  "settings-generated-media",
  "settings-extensions",
  "settings-ai",
  "settings-privacy",
  "settings-customization",
  "settings-appearance",
  "settings-updates",
  "settings-billing",
  "settings-cloud-account",
  "panel-profile",
  "panel-wallet",
  "panel-outputs",
  "panel-extensions",
  "panel-memory",
  "panel-notes",
  "desk-bittensor",
  "desk-hyperliquid",
  "desk-polymarket",
  "desk-sui",
  "desk-chat",
]) {
  assert.ok(source.includes(`"${surface}"`), `full platform audit missing ${surface}`);
}

for (const signal of [
  "horizontalOverflow",
  "waitForVisualSettle",
  "gotoWithTransientRetry",
  "ERR_NETWORK_CHANGED",
  "waitForChatComposer",
  "chatSurfaceMarkers",
  "name: /^Ask (Matterhorn|about)/i",
  '"Cautious"',
  "Choose a desk to begin",
  "document.getAnimations()",
  "Number.isFinite(endTime)",
  "consoleErrors",
  "pageErrors",
  "networkFailures",
  'button.textContent?.trim() === "Quick Jot" && !button.disabled',
  'id.endsWith("settings-overview")',
  'id.endsWith("settings-wallet")',
  'button.textContent?.trim() === "Save policy" && !button.disabled',
  '["settings-wallet", "settings/wallet", ["Wallets", "Save policy"]]',
  '["panel-wallet", "wallet", ["Wallets", "Save policy"]]',
  'id.endsWith("settings-preferences")',
  'element.getAttribute("aria-label") === "Auto context compaction"',
  'element.getAttribute("aria-hidden") === "true"',
  'id.endsWith("panel-memory")',
  '["panel-extensions", "extensions", ["MCP connections"]]',
  '["settings-privacy", "settings/privacy", ["Model processing", "Workspace data", "Complete workspace archive"]]',
  'getByRole("button", { name: "Manage MCPs", exact: true })',
  'workspaceUrl("settings/extensions")',
  'Embedded MCP rail exposed the full connector catalog.',
  '["Refresh saved memories", "Refresh memory review"].every',
  '["Could not load memory", "Could not load memory review"].some',
  "await page.waitForTimeout(250)",
  "settings-overview-quick-jot",
  "settings-overview-evidence-navigation",
  "launchPolicyFallbackForSurface",
  "generatedMediaChatControlAvailable",
  "Generate image is absent even though Generated Media remains available in Settings.",
  "chat-generated-media-control",
  "hidden_by_launch_policy",
  "resolvedUrl: page.url()",
  "Hidden Cloud Account route resolved",
  "settings-overview-launch-policy",
  "customization-visibility-controls",
  "Model controls did not return after restoring their original visibility setting.",
  "New project sidebar action did not return to its original visibility setting.",
  "initiallyShowingModelPicker",
  "initiallyShowingNewWorkspace",
  "mcp-rail-availability-and-disclosure",
  'getByText("Matterhorn Desks MCP", { exact: true })',
  'Connected MCP servers:',
  "connectedServerSummary.count()",
  "connectedServerSummary.first().getAttribute",
  "Connected MCP summary did not name any servers.",
  "Not every connected MCP server is visibly ready.",
  "Embedded MCP rail exposed the full connector catalog.",
  "Available MCPs & connectors",
  "stale-session-recovery",
  "Chat no longer available",
  "Recovered stale chat reopened the previously focused desk instead of Project Home.",
  "response-perspective-controls",
  "session-model-provider-recovery",
  "Connect a model recovery",
  "Model provider setup",
  "generate-image-panel",
  "Image generation requires Matterhorn setup. Review its status in Settings.",
  "MATTERHORN_FULL_AUDIT_CHAT_URL",
  "MATTERHORN_FULL_AUDIT_PRODUCT_REPORT",
  "discoverProductSmokeReports",
  "await authenticateAuditContext(context)",
  "ensureAuditChat",
  "Workspace home New chat",
  "auditArtifacts",
  "blank_chat",
  "report?.ready !== true",
  "entry.name.startsWith(\"matterhorn-product-browser-smoke\")",
  "entry.name.endsWith(\"product-smoke\")",
  "No external MCPs connected.",
  "inspectResponsiveSurfaceCatalog",
  '{ prefix: "compact-", name: "compact-laptop", width: 1280, height: 800 }',
  '{ prefix: "tablet-", name: "tablet", width: 820, height: 1180 }',
  '{ prefix: "mobile-", name: "mobile", width: 390, height: 844 }',
  "responsiveViewports",
  "MATTERHORN_FULL_AUDIT_RESPONSIVE_VIEWPORTS",
  "MATTERHORN_FULL_AUDIT_SURFACE_PACE_MS",
  "surfacePaceMs",
  "function printHelp()",
  'process.argv.includes("--help")',
  "Show this help without starting a browser.",
  "rootText:",
  "failure.png",
  "activeBrowser?.close()",
]) {
  assert.ok(source.includes(signal), `full platform audit missing ${signal}`);
}

console.log("Matterhorn full platform browser audit contract passed.");
