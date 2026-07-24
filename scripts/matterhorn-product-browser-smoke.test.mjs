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
    script.includes("MATTERHORN_PRODUCT_BROWSER_STRICT") &&
    script.includes("MATTERHORN_PRODUCT_BROWSER_REQUIRE_DESK_RESULTS") &&
    script.includes("MATTERHORN_PRODUCT_BROWSER_DESK_RESULT_TIMEOUT_MS"),
  "product browser smoke should expose URL, output, and strict env controls",
);
assert.ok(
  script.includes('document.querySelector("#root")') &&
    script.includes("childElementCount"),
  "product browser smoke should wait for the Vite React app to mount",
);
assert.ok(
  script.includes("hidden_by_launch_policy") &&
    script.includes("safe Overview fallback"),
  "product browser smoke should verify Billing is safely hidden when the launch policy disables it",
);
assert.ok(
  script.includes("Hidden Generated media route") &&
    script.includes("generatedMediaVisible"),
  "product browser smoke should verify Generated media is safely hidden when the launch policy disables it",
);

for (const stageId of [
  "open_app",
  "home_shell",
  "wallet_readiness",
  "desk_bittensor_task_start",
  "desk_hyperliquid_task_start",
  "desk_polymarket_task_start",
  "desk_sui_task_start",
  "session_direct_link_reload",
  "desk_longevity_workflow_start",
  "activity_summary",
  "project_history",
  "notes_panel",
  "memory_panel",
  "wallet_panel",
  "settings_overview_support_report",
  "settings_wallet",
  "settings_billing",
  "settings_generated_media",
]) {
  assert.ok(script.includes(stageId), `product browser smoke should report stage ${stageId}`);
}

for (const visibleText of [
  "Workspace home",
  "Chats, desks, notes, and saved outputs for this project.",
  "New chat",
  "New note",
  "Open a desk",
  "Jot a note about outputs",
  "Wallet readiness",
  "Wallet readiness details",
  "review and sign every transaction in your wallet",
  "Open Bittensor",
  "Open Hyperliquid",
  "Open Polymarket",
  "Open Sui",
  "Open Longevity",
  "Bittensor desk",
  "Hyperliquid desk",
  "Polymarket desk",
  "Sui desk",
  "Longevity Agent",
  "Agent tasks",
  "Explore subnets",
  "Read market overview",
  "Check compliance",
  "Add market",
  "Market URL or slug",
  "Preview a SUI transfer",
  "7 stages",
  "Run in chat",
  "Start task",
  "Project Activity",
  "Run history",
  "Project history filters",
  "No runs recorded yet",
  "Notes",
  "New note",
  "Notes panel",
  "Search notes",
  "Filter notes",
  "Memory",
  "Review suggestions before saving.",
  "Memory review",
  "Memory inbox filters",
  "Refresh memory review",
  "Wallets",
  "Install or enable Phantom for Sui",
  "Connect Phantom for Sui",
  "Connected wallet",
  "Settings",
  "Backend status",
  "Data policy",
  "Task History",
  "Copy and run this in your terminal to capture a redacted readiness report.",
  "Support report",
  "Download report",
  "Copy command",
  "Wallets",
  "Limited release",
  "Model",
  "Included models",
  "Browse models",
  "Included models",
  "Big Pickle",
  "Billing",
  "Matterhorn Plus",
  "Matterhorn Max",
  "$9.99/month",
  "$89.99/month",
  "Live charges off",
  "What billing changes",
  "Production readiness",
  "Media library",
  "Diagnostics and readiness report",
  "Storage and data controls",
]) {
  assert.ok(script.includes(visibleText), `product browser smoke should exercise ${visibleText}`);
}

assert.ok(
  script.includes('getByLabel("Copy project path").count()'),
  "product browser smoke should reject exposed local project path controls on the web",
);
assert.ok(
  script.includes('getByLabel("Open outputs folder").count()'),
  "product browser smoke should reject exposed local outputs-folder controls on the web",
);

assert.ok(
  script.includes("waitForEvent(\"download\"") &&
    script.includes("matterhorn-backend-support") &&
    script.includes("suggestedFilename") &&
    script.includes("offlineDiagnostics"),
  "product browser smoke should verify support report download behavior or offline diagnostics",
);
assert.ok(
  script.includes("stopVerifiedDeskRun") &&
    script.includes('name: "Stop generating"') &&
    script.includes("stoppedAfterVerification"),
  "product browser smoke should stop verified real desk runs before moving to the next surface",
);
assert.ok(
  script.includes("waitForCompletedDeskResult") &&
    script.includes('[data-message-role="assistant"]') &&
    script.includes("--require-desk-results") &&
    script.includes("completedDeskTasks") &&
    script.includes("deskTaskResults") &&
    script.includes('getByTestId("question-panel")') &&
    script.includes('outcome: "waiting_for_user"') &&
    script.includes('outcome: "completed"') &&
    script.includes("backend transport failure"),
  "product browser smoke should optionally require completed assistant results or an actionable user-input checkpoint from a real managed-engine stack",
);
assert.ok(
  script.includes("?panel=notes") &&
    script.includes("?panel=memory") &&
    script.includes("?panel=wallet") &&
    script.includes("Back to chat"),
  "product browser smoke should verify Notes, Memory, and Wallet open inside the session shell",
);
assert.ok(
  script.includes("async function ensureWorkspaceHomeVisible") &&
    script.includes('getByRole("button", { name: "Back to Home", exact: true })') &&
    script.includes("await ensureWorkspaceHomeVisible(page);"),
  "product browser smoke should recover to workspace Home when a focused desk remains mounted",
);
assert.ok(
  script.includes("function isWorkspaceSessionDetailUrl") &&
    script.includes("async function waitForDeskPromptSentEvent") &&
    script.includes('entry?.name === "desk.task_launch.prompt_sent"') &&
    script.includes('locator("[data-workflow-stage]")') &&
    script.includes("await page.waitForURL((url) => isWorkspaceSessionDetailUrl(url.toString())") &&
    script.includes('page.getByTestId("session-composer-shell")') &&
    script.includes("startedDeskTaskEvents") &&
    script.includes("startedDeskTaskSessions"),
  "product browser smoke should prove desk task launch sends a real prompt and navigates into a concrete chat session with the composer mounted",
);
assert.ok(
  script.includes('browser.newContext({ viewport: { width: 390, height: 844 } })') &&
    script.includes('getByTestId("session-composer-shell")') &&
    script.includes("directSessionReloadUrl"),
  "product browser smoke should prove persisted chat URLs survive a fresh mobile browser context",
);
assert.ok(
  script.includes("async function assertNoVisible") &&
    script.includes('"Show technical prompt"') &&
    script.includes('"Boundary:"') &&
    script.includes("/Can submit:/"),
  "product browser smoke should reject raw prompt and policy copy in focused desk defaults",
);
assert.ok(
  script.includes('page.locator("main").getByRole("heading", { name: "Billing", exact: true }).last()'),
  "product browser smoke should scope Billing heading assertions to the settings content area",
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
