#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/matterhorn-product-browser-smoke.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.ok(
  script.includes("Matterhorn product browser smoke"),
  "product browser smoke should explain its purpose",
);
assert.ok(
  script.includes('import { chromium } from "playwright"'),
  "product browser smoke should use Playwright Chromium",
);
assert.ok(
  script.includes("MATTERHORN_PRODUCT_BROWSER_URL") &&
    script.includes("MATTERHORN_PRODUCT_BROWSER_OUTPUT_DIR") &&
    script.includes("MATTERHORN_PRODUCT_BROWSER_STRICT"),
  "product browser smoke should expose URL, output, and strict env controls",
);
assert.ok(
  script.includes('document.querySelector("#root")') &&
    script.includes("childElementCount"),
  "product browser smoke should wait for the Vite React app to mount",
);

for (const stageId of [
  "open_app",
  "home_shell",
  "wallet_readiness",
  "desk_task_start",
  "activity_summary",
  "project_history",
  "notes_panel",
  "memory_panel",
  "wallet_panel",
  "settings_overview_support_report",
  "settings_wallet",
  "settings_generated_media",
]) {
  assert.ok(script.includes(stageId), `product browser smoke should report stage ${stageId}`);
}

for (const visibleText of [
  "Workspace home",
  "Start a desk task, continue a chat, or collect notes and outputs for this workspace.",
  "New chat",
  "Jot note",
  "Open a desk",
  "Copy project path",
  "Open outputs folder",
  "Wallet readiness",
  "Wallet readiness details",
  "Sui signing stays in your wallet; desktop uses external handoff.",
  "Open Bittensor",
  "Bittensor desk",
  "Agent tasks",
  "Start task",
  "Project Activity",
  "Project history",
  "Project history filters",
  "No runs recorded yet",
  "Notes",
  "New note",
  "All notes",
  "Memory suggested",
  "Memory",
  "Review suggestions before saving.",
  "Memory review",
  "Memory inbox filters",
  "Refresh memory review",
  "Sui wallet workflow",
  "Signing stays in your wallet",
  "Signing remains in your wallet",
  "Settings",
  "Backend status",
  "Image and NFT publishing",
  "Support report",
  "Sui wallet preview",
  "Production readiness",
  "Setup diagnostics",
  "Recent media",
  "Data controls",
]) {
  assert.ok(script.includes(visibleText), `product browser smoke should exercise ${visibleText}`);
}

assert.ok(
  script.includes("waitForEvent(\"download\"") &&
    script.includes("matterhorn-backend-support") &&
    script.includes("suggestedFilename"),
  "product browser smoke should verify support report download behavior",
);
assert.ok(
  script.includes("?panel=notes") &&
    script.includes("?panel=memory") &&
    script.includes("?panel=wallet") &&
    script.includes("Back to chat"),
  "product browser smoke should verify Notes, Memory, and Wallet open inside the session shell",
);
assert.ok(
  script.includes("isOptionalDevWorkspace404") &&
    script.includes("opencode") &&
    script.includes("mcp") &&
    script.includes(".opencode/agents/opencode-router.md") &&
    script.includes("if (isOptionalDevWorkspace404(location.url)) return"),
  "product browser smoke should keep optional dev-stack workspace probes out of strict errors and warning noise",
);
assert.ok(
  script.includes("page.on(\"console\"") &&
    script.includes("page.on(\"response\"") &&
    script.includes("page.on(\"pageerror\"") &&
    script.includes("resourceWarnings") &&
    script.includes("networkFailures") &&
    script.includes("ignoredNetworkResponses") &&
    script.includes("shouldFailOnNetworkResponse") &&
    script.includes("report.errors.length === 0"),
  "product browser smoke should fail strict runs on browser and API network errors while reporting actionable resource warnings",
);
assert.ok(
  script.includes("matterhorn-product-browser-smoke.png") &&
    script.includes("summary.json"),
  "product browser smoke should write screenshot and JSON evidence",
);
assert.equal(
  packageJson.scripts?.["smoke:matterhorn-product-browser"],
  "node scripts/matterhorn-product-browser-smoke.mjs --strict",
  "package.json should expose the Matterhorn product browser smoke",
);
assert.equal(
  packageJson.scripts?.["test:matterhorn-product-browser-smoke"],
  "node scripts/matterhorn-product-browser-smoke.test.mjs",
  "package.json should expose the Matterhorn product browser smoke contract gate",
);

console.log("Matterhorn product browser smoke contract passed.");
