#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(
  "scripts/matterhorn-product-browser-smoke.mjs",
  "utf8",
);
const sessionRoute = readFileSync(
  "apps/app/src/react-app/shell/session-route.tsx",
  "utf8",
);
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
    script.includes("MATTERHORN_PRODUCT_BROWSER_DESK_RESULT_TIMEOUT_MS") &&
    script.includes("MATTERHORN_PRODUCT_BROWSER_HOSTED_ACCOUNT"),
  "product browser smoke should expose URL, output, and strict env controls",
);
assert.ok(
  script.includes("resolveFixtureUrl") &&
    script.includes("matterhorn-generated-media-smoke-runtime.json") &&
    script.includes("no live fixture manifest exists") &&
    script.includes("process.kill(runtimePid, 0)") &&
    script.includes("is stale. Restart pnpm dev:generated-media-smoke") &&
    script.includes("does not contain a valid workspace session URL") &&
    script.includes("config.url = sessionUrl") &&
    script.includes("config.serverUrl = runtime.serverUrl.trim()"),
  "product browser smoke should discover the launcher's current workspace instead of relying on a stale hard-coded id",
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
  "auth_signup",
  "open_app",
  "home_shell",
  "wallet_readiness",
  "desk_bittensor_task_start",
  "desk_hyperliquid_task_start",
  "desk_polymarket_task_start",
  "desk_sui_task_start",
  "desk_reviewed_action_chat_handoff",
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
  assert.ok(
    script.includes(stageId),
    `product browser smoke should report stage ${stageId}`,
  );
}

for (const visibleText of [
  "Workspace home",
  "Continue active work, start a focused desk task, or create something new.",
  "New chat",
  "New note",
  "Open a desk",
  "Jot a note",
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
  "Longevity desk",
  "Agent tasks",
  "Explore subnets",
  "Read market overview",
  "Check compliance",
  "Read Sui wallet",
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
  "Workspace health",
  "Data & privacy",
  "Task History",
  "Copy and run this in your terminal to capture a redacted readiness report.",
  "Support report",
  "Download report",
  "Copy command",
  "Wallets",
  "Limited release",
  "Models",
  "Available models",
  "Connected model catalog",
  "Browse models",
  "Matterhorn smoke provider",
  "Smoke model",
  "Add CUDOS API key",
  "Unavailable in this deployment",
  "Add a model provider",
  "CUDOS / ASI:Cloud",
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
  assert.ok(
    script.includes(visibleText),
    `product browser smoke should exercise ${visibleText}`,
  );
}

assert.equal(
  script.includes("Describe market"),
  false,
  "product browser smoke should start Polymarket tasks before collecting missing context in chat",
);

assert.ok(
  script.includes("/api/auth/sign-up/email") &&
    script.includes("/api/den/v1/me") &&
    script.includes("const apiBase = serverUrl || origin") &&
    script.includes('new URL("/api/auth/sign-up/email", apiBase)') &&
    script.includes('new URL("/api/den/v1/me", apiBase)') &&
    script.includes('new URL("/workspaces", apiBase)') &&
    script.includes("--server-url") &&
    script.includes(
      "Fresh-user workspace provisioning did not return one isolated active workspace.",
    ) &&
    script.includes("--hosted-account") &&
    script.includes('mode: "fixture-workspace"') &&
    script.includes("Hosted identity and tenant") &&
    script.includes("freshAccount: false"),
  "product browser smoke should explicitly separate fresh hosted-account certification from local fixture coverage",
);
assert.ok(
  script.includes("assertCurrentWorkspaceRoute") &&
    script.includes("left the expected workspace") &&
    script.includes('"Project history"'),
  "product browser smoke should reject silent workspace route drift",
);
assert.ok(
  script.includes("The web build exposed a raw provider-key control."),
  "product browser smoke should reject raw provider-key controls in the web build",
);
assert.ok(
  script.includes('report.artifacts.mcpMode = "hosted-managed"') &&
    script.includes('["Available in this workspace", "Managed connections"]') &&
    script.includes('"Reviewed wallet actions"') &&
    script.includes("Hosted managed Tools exposed local-only control"),
  "product browser smoke should verify the hosted managed-tools boundary without expecting local MCP setup",
);
assert.ok(
  script.includes('[aria-label^="Connected MCP servers:"]') &&
    script.includes("getByText(/^Synced /)") &&
    script.includes("Connected MCP summary did not name any servers.") &&
    script.includes("Not every connected MCP server is visibly ready.") &&
    script.includes("report.artifacts.connectedMcpServers = connectedNames"),
  "product browser smoke should accept named ready MCP rows while rejecting empty or unready connected summaries",
);
assert.ok(
  script.includes('getByLabel("Copy project path").count()'),
  "product browser smoke should reject exposed local project path controls on the web",
);
assert.ok(
  script.includes('getByLabel("Open outputs folder").count()'),
  "product browser smoke should reject exposed local outputs-folder controls on the web",
);

assert.ok(
  script.includes('waitForEvent("download"') &&
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
    script.includes('name: "Back to Home"') &&
    script.includes("await ensureWorkspaceHomeVisible(page);"),
  "product browser smoke should recover to workspace Home when a focused desk remains mounted",
);
assert.ok(
  sessionRoute.includes("!publicBetaWeb &&\n        nextWorkspaceId") &&
    sessionRoute.includes("if (!publicBetaWeb && workspaceId && client)"),
  "public web must not call the desktop host-only workspace activation route",
);
assert.ok(
  script.includes("function isWorkspaceSessionDetailUrl") &&
    script.includes("function isWorkspaceSettingsAiUrl") &&
    script.includes("async function waitForDeskPromptSentEvent") &&
    script.includes('entry?.name === "desk.task_launch.prompt_sent"') &&
    script.includes('locator("[data-workflow-stage]")') &&
    script.includes("provider_setup_required") &&
    script.includes('getByTestId("pending-desk-task-handoff")') &&
    script.includes('name: "Return to desk"') &&
    script.includes(
      "Connect a model before starting a stage. Nothing has been sent.",
    ) &&
    script.includes('page.getByTestId("session-composer-shell")') &&
    script.includes("startedDeskTaskEvents") &&
    script.includes("startedDeskTaskSessions"),
  "product browser smoke should prove a desk task either sends a real prompt into a concrete chat session or pauses safely at provider setup without sending work",
);
assert.ok(
  script.includes("verifyReviewedActionChatHandoff") &&
    script.includes('name: "Prepare in chat"') &&
    script.includes("matterhorn.session-agents.v1") &&
    script.includes('entry?.name === "desk.task_launch.draft_saved"') &&
    script.includes(
      'entry?.name === "session.reviewed_action.staged_from_composer"',
    ) &&
    script.includes('name: "Review order ticket", exact: true') &&
    script.includes("modelPromptSent: false"),
  "product browser smoke should prove reviewed actions start as editable session-scoped chat drafts and move to Wallet without model submission",
);
assert.ok(
  script.includes("const storageState = await context.storageState()") &&
    script.includes("storageState,") &&
    script.includes("viewport: { width: 390, height: 844 }") &&
    script.includes('getByTestId("session-composer-shell")') &&
    script.includes("directSessionReloadUrl") &&
    script.includes("persisted-chat-fresh-context-failed.png") &&
    script.includes("directSessionReloadFailure") &&
    script.includes("window.__matterhorn?.snapshot?.()"),
  "product browser smoke should prove persisted chat URLs and authentication survive a fresh mobile browser context with actionable failure evidence",
);
assert.ok(
  sessionRoute.includes(
    "const selectedSessionIdRef = useRef<string | null>(selectedSessionId)",
  ) &&
    sessionRoute.includes(
      "const routeSessionId = selectedSessionIdRef.current",
    ) &&
    sessionRoute.includes(
      "[loadWorkspaceSessionsInBackground, markBootRouteReady, routeWorkspaceId]",
    ),
  "chat navigation should not restart the workspace bootstrap effect",
);
assert.ok(
  sessionRoute.includes(
    "const effectiveLoading = loading && (!client || !selectedWorkspace)",
  ),
  "an already-connected workspace should not hide the chat composer behind stale route loading",
);
assert.ok(
  sessionRoute.includes(
    "if (!selectedSessionKnown && !selectedSessionPending)",
  ) && !sessionRoute.includes("sessionOwnedByOtherWorkspace"),
  "a chat confirmed in the selected workspace should render even when an authorized workspace alias exposes the same session id",
);
assert.ok(
  script.includes("async function assertNoVisible") &&
    script.includes('"Show technical prompt"') &&
    script.includes('"Boundary:"') &&
    script.includes("/Can submit:/"),
  "product browser smoke should reject raw prompt and policy copy in focused desk defaults",
);
assert.ok(
  script.includes('getByRole("region", {') &&
    script.includes('name: "Workspace home"') &&
    script.includes("exact: true"),
  "product browser smoke should target the Home region without colliding with the Home navigation button",
);
assert.ok(
  script.includes(
    'getByRole("heading", { name: desk.heading, exact: true, level: 2 })',
  ),
  "product browser smoke should target each desk content heading without colliding with the location heading",
);
assert.ok(
  script.includes('const moreTasks = page.getByRole("button"') &&
    script.includes("More tasks") &&
    script.includes('page.getByText("Place an order", { exact: true })') &&
    script.includes('name: "Prepare in chat", exact: true') &&
    script.includes("reviewedActionHidden: true"),
  "product browser smoke should expand the task list and prove reviewed actions are hidden in Public Beta instead of requiring an unavailable handoff",
);
assert.ok(
  script.includes('.locator("main")') &&
    script.includes('name: "Billing"') &&
    script.includes("billingHeading"),
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
  script.includes('page.on("console"') &&
    script.includes('page.on("response"') &&
    script.includes('page.on("pageerror"') &&
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
