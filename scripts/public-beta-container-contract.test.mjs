import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dockerfile = readFileSync("packaging/docker/Dockerfile.public-beta", "utf8");
const entrypoint = readFileSync("packaging/docker/public-beta-entrypoint.sh", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci-tests.yml", "utf8");
const railway = JSON.parse(readFileSync("railway.json", "utf8"));

for (const required of [
  "OPENWORK_MANAGE_OPENCODE=1",
  "OPENWORK_OPENCODE_BIN=/usr/local/bin/opencode",
  "XDG_DATA_HOME=/data/opencode/xdg/data",
  "XDG_STATE_HOME=/data/opencode/xdg/state",
  "MATTERHORN_WORK_DATA_DIR=/data/matterhorn",
  "MATTERHORN_WORK_WORKSPACES=/data/workspace",
  "MATTERHORN_WORK_APPROVAL_MODE=manual",
  "MATTERHORN_HOSTED_PUBLIC_BETA=1",
  "MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED=1",
  "pnpm --dir packages/crypto-app-sdk build",
  "gosu",
  "/health/live",
]) {
  assert.ok(dockerfile.includes(required), `public Beta image must include ${required}`);
}
assert.doesNotMatch(
  dockerfile,
  /^VOLUME\b/m,
  "public Beta persistence must use a host-managed /data mount",
);
assert.doesNotMatch(dockerfile, /ee\/apps\/den|ee\/packages\/den/);

for (const required of [
  "require_secret MATTERHORN_WORK_TOKEN",
  "require_secret MATTERHORN_WORK_HOST_TOKEN",
  "require_secret MATTERHORN_WORK_TRUSTED_PROXY_SECRET",
  "require_secret MATTERHORN_AGENT_RUNTIME_SECRET",
  "require_secret MATTERHORN_CAPABILITY_SIGNING_SECRET",
  "MATTERHORN_GUARDED_RUNTIME_MODE must be off, shadow, or enforce",
  "MATTERHORN_GUARDED_RUNTIME_ENFORCE_ACCESS must be prepare or all",
  "MATTERHORN_GUARDED_RUNTIME_ENFORCE_DESKS contains an unknown or malformed desk",
  "MATTERHORN_BUILD_COMMIT must be a full 40-character SHA",
  "MATTERHORN_WORK_CORS_ORIGINS must be the exact HTTPS app origin",
  '"${MATTERHORN_WORK_DATA_DIR}"',
  '"${MATTERHORN_WORK_WORKSPACES}"',
  '"${XDG_DATA_HOME}"',
  '"${XDG_STATE_HOME}"',
  'exec gosu node bun /app/apps/server/src/cli.ts',
]) {
  assert.ok(entrypoint.includes(required), `public Beta entrypoint must include ${required}`);
}

for (const required of [
  "public-beta-container-build:",
  "docker/build-push-action@v6",
  "file: packaging/docker/Dockerfile.public-beta",
  "push: false",
  "Verify startup fails closed without production secrets",
  "Smoke production image liveness with a persistent volume",
  "http://127.0.0.1:18787/health/live",
]) {
  assert.ok(ciWorkflow.includes(required), `CI must include ${required}`);
}

const webContainerJob = ciWorkflow
  .split("  public-beta-web-container-build:\n")[1]
  ?.split(/\n  [a-z][a-z0-9-]*:\n/)[0];
assert.ok(webContainerJob, "CI must build and smoke the production web image separately");
for (const required of [
  "timeout-minutes: 20",
  "MATTERHORN_BUILD_COMMIT: ${{ github.event.pull_request.head.sha || github.sha }}",
  "ref: ${{ env.MATTERHORN_BUILD_COMMIT }}",
  "persist-credentials: false",
  "file: packaging/docker/Dockerfile.public-beta-web",
  "VITE_MATTERHORN_BUILD_COMMIT=${{ env.MATTERHORN_BUILD_COMMIT }}",
  "load: true",
  "push: false",
  "timeout-minutes: 2",
  "trap cleanup EXIT",
  '--network none',
  '--env MATTERHORN_CONTROL_PLANE_URL=',
  '--env MATTERHORN_PROXY_SECRET=',
  'docker exec --env MATTERHORN_BUILD_COMMIT="$MATTERHORN_BUILD_COMMIT"',
  "for attempt in $(seq 1 30)",
  "AbortSignal.timeout(3000)",
  'assert.equal(root.status, 200)',
  'name="matterhorn-build-commit" content="${expectedCommit}"',
  'data-matterhorn-static-auth',
  'assert.doesNotMatch(html, /data-matterhorn-ui="retro"/)',
  "http://127.0.0.1:8080/health/ready",
  "assert.equal(health.status, 503)",
  'assert.equal((await health.json()).code, "control_plane_unavailable")',
]) {
  assert.ok(webContainerJob.includes(required), `web container CI must include ${required}`);
}
assert.doesNotMatch(
  webContainerJob,
  /secrets\.|push:\s*true|docker\s+push|docker\/login-action|--publish|--env-file/,
  "web container CI must remain unpublished, network-isolated and independent of real credentials",
);

assert.equal(railway.$schema, "https://railway.com/railway.schema.json");
assert.deepEqual(railway.build, {
  builder: "DOCKERFILE",
  dockerfilePath: "packaging/docker/Dockerfile.public-beta",
});
assert.equal(
  railway.deploy?.healthcheckPath,
  "/health/ready",
  "Railway must promote only a fully ready guarded-runtime deployment",
);
assert.equal(railway.deploy?.healthcheckTimeout, 300);
assert.equal(railway.deploy?.restartPolicyType, "ON_FAILURE");
assert.equal(railway.deploy?.restartPolicyMaxRetries, 10);

console.log("public-beta-container-contract tests: PASS");
