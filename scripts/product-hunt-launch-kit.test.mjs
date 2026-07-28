#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = {
  kit: readFileSync("docs/product-hunt-launch-kit-2026-07-21.md", "utf8"),
  room: readFileSync("docs/product-hunt-launch-room-2026-07-21.md", "utf8"),
  trust: readFileSync("docs/product-hunt-measurement-and-trust-2026-07-21.md", "utf8"),
};

for (const [name, source] of Object.entries(files)) {
  assert.match(source, /NO-GO|stop-ship/i, `${name} must preserve the launch stop rule`);
}

for (const required of [
  "Your AI workspace for serious Web3 work",
  "Signing stays in the user's wallet",
  "Screenshot Storyboard",
  "Maker comment",
  "updates@matterhorn.so",
]) assert.ok(files.kit.includes(required), `launch kit missing ${required}`);

for (const required of [
  "MATTERHORN_BUILD_COMMIT",
  "drill:product-hunt-rollback",
  "pack:product-hunt-evidence",
  "P0",
  "P1",
  "UNASSIGNED",
]) assert.ok(files.room.includes(required), `launch room missing ${required}`);

for (const required of [
  "does **not** currently provide a complete",
  "wallet addresses",
  "Data-Minimized Event Plan",
  "Privacy policy URL",
  "updates@matterhorn.so",
]) assert.ok(files.trust.includes(required), `measurement and trust guide missing ${required}`);

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts["test:product-hunt-launch-kit"], "node scripts/product-hunt-launch-kit.test.mjs");
console.log("Product Hunt launch kit contract passed.");
