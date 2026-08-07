import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dockerfile = readFileSync("packaging/docker/Dockerfile.public-beta", "utf8");
const entrypoint = readFileSync("packaging/docker/public-beta-entrypoint.sh", "utf8");

for (const required of [
  "OPENWORK_MANAGE_OPENCODE=1",
  "OPENWORK_OPENCODE_BIN=/usr/local/bin/opencode",
  "MATTERHORN_WORK_DATA_DIR=/data/matterhorn",
  "MATTERHORN_WORK_WORKSPACES=/data/workspace",
  "MATTERHORN_WORK_APPROVAL_MODE=manual",
  "USER node",
  'VOLUME ["/data"]',
  "/health/live",
]) {
  assert.ok(dockerfile.includes(required), `public Beta image must include ${required}`);
}
assert.doesNotMatch(dockerfile, /ee\/apps\/den|ee\/packages\/den/);

for (const required of [
  "require_secret MATTERHORN_WORK_TOKEN",
  "require_secret MATTERHORN_WORK_HOST_TOKEN",
  "require_secret MATTERHORN_WORK_TRUSTED_PROXY_SECRET",
  "MATTERHORN_BUILD_COMMIT must be a full 40-character SHA",
  "MATTERHORN_WORK_CORS_ORIGINS must be the exact HTTPS app origin",
  'exec bun /app/apps/server/src/cli.ts',
]) {
  assert.ok(entrypoint.includes(required), `public Beta entrypoint must include ${required}`);
}

console.log("public-beta-container-contract tests: PASS");
