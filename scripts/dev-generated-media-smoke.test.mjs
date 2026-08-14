#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/dev-generated-media-smoke.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.ok(
  script.includes("Matterhorn generated-media smoke launcher"),
  "generated-media smoke launcher should explain its purpose",
);
assert.ok(
  script.includes('MATTERHORN_MEDIA_SMOKE_APP_PORT?.trim() || "5282"') &&
    script.includes("QA-only simulator") &&
    script.includes("No live model, market, wallet, or submission was called."),
  "generated-media smoke launcher should avoid the normal product port and visibly identify synthetic responses",
);
assert.ok(
  script.includes("startFakeOpencode") &&
    script.includes("ensureSession") &&
    script.includes("decodeURIComponent(raw)") &&
    script.includes("requestDirectory(request)") &&
    script.includes('url.pathname === "/session"') &&
    script.includes('url.pathname === "/session/status"') &&
    script.includes('request.method === "PATCH"') &&
    script.includes('action === "revert"') &&
    script.includes('session.revert = { messageID }') &&
    script.includes("currentMessages.slice(0, revertIndex + 1)") &&
    script.includes("delete session.revert") &&
    script.includes('action === "prompt_async"') &&
    script.includes('action === "todo"'),
  "generated-media smoke launcher should include a fake OpenCode engine for browser chat sessions, response retry, and title updates",
);
assert.ok(
  script.includes("--opencode-base-url") && script.includes("Fake OpenCode"),
  "generated-media smoke launcher should wire the fake OpenCode engine into the Matterhorn server",
);
assert.ok(
  script.includes('url.pathname === "/provider"') &&
    script.includes('"big-pickle"'),
  "generated-media smoke launcher should expose a minimal provider catalog",
);
assert.ok(
  script.includes('url.pathname === "/mcp"') &&
    script.includes('wallet: { status: "connected" }') &&
    script.includes('crypto: { status: "connected" }'),
  "generated-media smoke launcher should expose live status for its configured wallet and crypto MCPs",
);
assert.ok(
  script.includes('url.pathname === "/global/health"') &&
    script.includes('url.pathname === "/config"') &&
    script.includes('url.pathname === "/event"') &&
    script.includes('url.pathname === "/permission"') &&
    script.includes('url.pathname === "/question"'),
  "generated-media smoke launcher should quiet normal OpenCode health, config, event, permission, and question side channels",
);
assert.ok(
  script.includes('MATTERHORN_IMAGE_PROVIDER: "mock"'),
  "generated-media smoke launcher must force mock image generation",
);
assert.ok(
  script.includes('MATTERHORN_BILLING_CURRENT_PLAN: "max"') &&
  script.includes("MATTERHORN_BILLING_ACCOUNT_PATH:") &&
    script.includes("local Max billing context") &&
    script.includes("no payment provider is used"),
  "generated-media smoke launcher should use a repeatable local Max billing context without payment providers",
);
assert.ok(
  script.includes('smokePlanId !== "max" || imageLimit !== null') &&
    script.includes("Generated-media smoke billing isolation failed"),
  "generated-media smoke launcher should verify its isolated backend has unlimited QA image allowance",
);
assert.ok(
  script.includes('MATTERHORN_MEDIA_SMOKE_REQUEST_RATE_LIMIT_MAX?.trim() || "5000"') &&
    script.includes("MATTERHORN_WORK_REQUEST_RATE_LIMIT_MAX: requestRateLimitMax") &&
    script.includes("synthetic loopback QA stack"),
  "generated-media smoke launcher should provide a repeatable browser-audit request budget without changing production defaults",
);
assert.ok(
  script.includes("MATTERHORN_MEDIA_SMOKE_RESPONSE_DELAY_MS") &&
    script.includes("Math.min(10_000, Math.max(0") &&
    script.includes("await new Promise((resolve) => setTimeout(resolve, promptResponseDelayMs))"),
  "generated-media smoke launcher should support a bounded opt-in delay for inspecting active agent states",
);
assert.ok(
  script.includes('waitForJson(`${serverUrl}/workspaces`, {\n    timeoutMs: 45_000') &&
    script.includes('`${serverUrl}/workspace/${encodeURIComponent(activeWorkspaceId)}/billing/status`,\n    {\n      timeoutMs: 45_000'),
  "generated-media smoke launcher should allow authenticated workspace bootstrap routes the full startup window",
);
assert.ok(
  script.includes("createServer") && script.includes('url.pathname === "/v1/blobs"'),
  "generated-media smoke launcher should include a browser-accessible fake Walrus publisher",
);
for (const envVar of [
  "MATTERHORN_WALRUS_PUBLISHER_URL",
  "MATTERHORN_WALRUS_RELAY_URL",
  "MATTERHORN_WALRUS_STORAGE_EPOCHS",
  "MATTERHORN_SUI_NFT_PACKAGE_ID",
  "MATTERHORN_SUI_NFT_MODULE_NAME",
  "MATTERHORN_SUI_NFT_TYPE",
  "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
  "MATTERHORN_SUI_KIOSK_ID",
  "MATTERHORN_SUI_KIOSK_OWNER_CAP_ID",
  "MATTERHORN_SUI_TRANSFER_POLICY_ID",
  "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
]) {
  assert.ok(script.includes(envVar), `generated-media smoke launcher should wire ${envVar}`);
}
assert.ok(
  script.includes("no OpenAI key required") &&
    script.includes("no custody or signing") &&
    script.includes("create or open a chat session"),
  "generated-media smoke launcher should keep the no-secret/no-custody boundary visible",
);
assert.ok(
  script.includes("VITE_MATTERHORN_DEV_API_TARGET") &&
    script.includes("VITE_MATTERHORN_WORK_URL") &&
    script.includes("VITE_MATTERHORN_WORK_TOKEN") &&
    script.includes("VITE_MATTERHORN_WORK_FORCE_SETTINGS"),
  "generated-media smoke launcher should wire the app to the local Matterhorn server",
);
assert.ok(
  script.includes("matterhorn-generated-media-smoke-runtime.json") &&
    script.includes("runtimeManifestPath") &&
    script.includes("workspaceId: activeWorkspaceId") &&
    script.includes("sessionUrl") &&
    script.includes("runtime?.pid === process.pid") &&
    script.includes("await unlink(runtimeManifestPath)"),
  "generated-media smoke launcher should publish its live workspace URL and only remove its own runtime manifest",
);
assert.ok(
  script.includes('"node_modules", "vite", "bin", "vite.js"') &&
    script.includes("rootViteBin") &&
    script.includes("process.execPath"),
  "generated-media smoke launcher should fall back to the root Vite binary when app node_modules is partially linked",
);

assert.equal(
  packageJson.scripts?.["dev:generated-media-smoke"],
  "node scripts/dev-generated-media-smoke.mjs",
  "package.json should expose the generated-media smoke launcher",
);
assert.equal(
  packageJson.scripts?.["test:dev-generated-media-smoke"],
  "node scripts/dev-generated-media-smoke.test.mjs",
  "package.json should expose the generated-media smoke launcher contract gate",
);

console.log("Generated-media smoke launcher gate passed.");
