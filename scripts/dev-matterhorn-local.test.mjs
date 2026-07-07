#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/dev-matterhorn-local.mjs", "utf8");

assert.ok(
  script.includes('"--cors", "loopback"'),
  "dev:matterhorn-local should start the Matterhorn server with loopback CORS",
);
assert.equal(
  script.includes('"--cors", "*"'),
  false,
  "dev:matterhorn-local must not force wildcard CORS",
);
assert.ok(
  script.includes("VITE_MATTERHORN_WORK_URL"),
  "dev:matterhorn-local should still wire the local app to the Matterhorn server",
);
assert.ok(
  script.includes("OpenCode engine: not provided"),
  "dev:matterhorn-local should still explain when OpenCode is not configured",
);

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(
  packageJson.scripts?.["test:dev-matterhorn-local"],
  "node scripts/dev-matterhorn-local.test.mjs",
  "package.json should expose the dev:matterhorn-local contract gate",
);

console.log("Matterhorn local dev launcher gate passed.");
