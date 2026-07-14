#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/generated-media-browser-smoke.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.ok(
  script.includes("Matterhorn generated-media browser smoke"),
  "generated-media browser smoke should explain its purpose",
);
assert.ok(
  script.includes('import { chromium } from "playwright"'),
  "generated-media browser smoke should use Playwright Chromium",
);
assert.ok(
  script.includes("MATTERHORN_MEDIA_BROWSER_URL") &&
    script.includes("MATTERHORN_MEDIA_BROWSER_OUTPUT_DIR") &&
    script.includes("MATTERHORN_MEDIA_BROWSER_STRICT"),
  "generated-media browser smoke should expose URL, output, and strict env controls",
);
assert.ok(
  script.includes('document.querySelector("#root")') &&
    script.includes("childElementCount"),
  "generated-media browser smoke should wait for the Vite React app to mount",
);
assert.ok(
  script.includes("Date.now() - startedAt < 30_000") &&
    script.includes("Could not find a chat session"),
  "generated-media browser smoke should wait for route boot before declaring chat unavailable",
);
for (const stageId of [
  "open_app",
  "home_wallet_readiness",
  "open_chat",
  "open_image_panel",
  "generate_image",
  "open_nft_panel",
  "create_nft_draft",
  "upload_storage",
  "preview_mint",
  "record_mint_receipt",
  "preview_listing",
  "record_listing_receipt",
  "settings_generated_media",
  "settings_generated_media_diagnostics",
]) {
  assert.ok(script.includes(stageId), `generated-media browser smoke should report stage ${stageId}`);
}
assert.ok(
  script.includes("generationResponsePromise") &&
    script.includes("Image generation request failed (${generationResponse.status()}): ${detail}"),
  "generated-media browser smoke should fail immediately with backend response detail instead of timing out after an HTTP error",
);
for (const visibleText of [
  "Wallet readiness",
  "Early access",
  "Sui signing stays in your wallet; desktop uses external handoff.",
  "Open wallet",
  "Generate image",
  "Describe the image...",
  "Create image",
  "Saved to Outputs",
  "Make NFT",
  "generated-image-card",
  "Publishing path",
  "NFT marketplace listing",
  "Create draft",
  "Prepare",
  "Upload to Walrus",
  "Prepare mint handoff",
  "Mint digest",
  "Minted object id",
  "Save mint receipt",
  "Mint receipt recorded",
  "Listing inputs",
  "Prepare listing handoff",
  "Listing plan ready",
  "Listing transaction digest",
  "Save listing receipt",
  "Listing receipt recorded",
  "Generated media history",
  "Listed",
  "Production readiness",
  "Diagnostics and readiness report",
  "Run diagnostics",
  "Generated media setup passed all safe diagnostics.",
  "Production smoke plan",
  "Local test",
  "Public writes require user action",
  "Media library",
  "NFT drafts",
  "Storage and data controls",
  "Local generated media delete",
  "Delete generated image",
  "Delete NFT draft",
]) {
  assert.ok(script.includes(visibleText), `generated-media browser smoke should exercise ${visibleText}`);
}
assert.ok(
  script.includes("generatedMediaSettingsUrl") &&
    script.includes("/settings/generated-media") &&
    script.includes("publicStateRetained") &&
    script.includes("publicWritesDuringDiagnostics"),
  "generated-media browser smoke should navigate to the Generated media settings page, verify retained public NFT state, and run safe diagnostics",
);
assert.ok(
  script.includes("isOptionalDevWorkspace404") &&
    script.includes("opencode") &&
    script.includes("mcp") &&
    script.includes(".opencode/agents/opencode-router.md") &&
    script.includes("if (isOptionalDevWorkspace404(location.url)) return"),
  "generated-media browser smoke should keep optional dev-stack workspace probes out of strict errors and warning noise",
);
assert.ok(
  script.includes("records public mint receipt metadata") &&
    script.includes("records public listing receipt metadata") &&
    script.includes("It does not sign") &&
    script.includes("submit anything on-chain"),
  "generated-media browser smoke should document the no-custody public receipt boundary",
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
  "generated-media browser smoke should fail strict runs on browser and API network errors while reporting actionable resource warnings",
);
assert.ok(
  script.includes('[role="dialog"]') &&
    script.includes('filter({ hasText: "Publish as NFT" })') &&
    script.includes('getByText("NFT marketplace listing", { exact: true })'),
  "generated-media browser smoke should scope NFT readiness checks to the opened NFT publishing sheet with exact row labels",
);
assert.ok(
  script.includes("DEFAULT_PROMPT_BASE") &&
    script.includes("Date.now().toString(36)") &&
    script.includes('page.getByTestId("generated-image-card").filter({ hasText: prompt })') &&
    script.includes("createdCard.getByText(config.prompt, { exact: true })"),
  "generated-media browser smoke should prove a fresh image was created before opening the NFT draft",
);
assert.ok(
  script.includes("generated-media-browser-smoke.png") &&
    script.includes("summary.json"),
  "generated-media browser smoke should write screenshot and JSON evidence",
);
assert.equal(
  packageJson.scripts?.["smoke:generated-media-browser"],
  "node scripts/generated-media-browser-smoke.mjs --strict",
  "package.json should expose the generated-media browser smoke",
);
assert.equal(
  packageJson.scripts?.["test:generated-media-browser-smoke"],
  "node scripts/generated-media-browser-smoke.test.mjs",
  "package.json should expose the generated-media browser smoke contract gate",
);

console.log("Generated-media browser smoke contract passed.");
