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
]) {
  assert.ok(script.includes(stageId), `generated-media browser smoke should report stage ${stageId}`);
}
for (const visibleText of [
  "Wallet readiness",
  "Sui signing stays in your wallet; desktop uses external handoff.",
  "Open wallet",
  "Generate image",
  "Describe an image to generate...",
  "Image saved to outputs",
  "Make NFT",
  "Create local draft",
  "Prepare upload",
  "Upload",
  "Preview mint",
  "Mint digest",
  "Minted object id",
  "Record mint receipt",
  "Mint receipt recorded",
  "Preview listing",
  "Listing plan ready",
  "Listing transaction digest",
  "Record listing receipt",
  "Listing receipt recorded",
  "Generated media history",
  "Listed",
]) {
  assert.ok(script.includes(visibleText), `generated-media browser smoke should exercise ${visibleText}`);
}
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
    script.includes("shouldFailOnNetworkResponse") &&
    script.includes("report.errors.length === 0"),
  "generated-media browser smoke should fail strict runs on browser and API network errors while reporting stale resource warnings",
);
assert.ok(
  script.includes('[role="dialog"]') &&
    script.includes('filter({ hasText: "Make NFT" })'),
  "generated-media browser smoke should scope NFT readiness checks to the Make NFT dialog",
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
