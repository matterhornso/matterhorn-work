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
  script.includes("startFakeOpencode") &&
    script.includes("ensureSession") &&
    script.includes('url.pathname === "/session"') &&
    script.includes('url.pathname === "/session/status"') &&
    script.includes('request.method === "PATCH"') &&
    script.includes('action === "prompt_async"') &&
    script.includes('action === "todo"'),
  "generated-media smoke launcher should include a fake OpenCode engine for browser chat sessions and title updates",
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
  script.includes("VITE_MATTERHORN_WORK_URL") &&
    script.includes("VITE_MATTERHORN_WORK_TOKEN") &&
    script.includes("VITE_MATTERHORN_WORK_FORCE_SETTINGS"),
  "generated-media smoke launcher should wire the app to the local Matterhorn server",
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
