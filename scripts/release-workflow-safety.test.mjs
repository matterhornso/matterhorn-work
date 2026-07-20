#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const releaseWorkflow = readFileSync(".github/workflows/release-macos-aarch64.yml", "utf8");
const daytonaWorkflow = readFileSync(".github/workflows/release-daytona-snapshot.yml", "utf8");
const agentWorkflow = readFileSync(".github/workflows/opencode-agents.yml", "utf8");
const releaseReview = readFileSync("scripts/release/review.mjs", "utf8");
const pinnedEngineInstaller = readFileSync("scripts/install-pinned-opencode.sh", "utf8");
const microSandboxDockerfile = readFileSync("packaging/docker/Dockerfile.microsandbox", "utf8");
const microSandboxEntrypoint = readFileSync("packaging/docker/microsandbox-entrypoint.sh", "utf8");
const productionCompose = readFileSync("packaging/docker/docker-compose.yml", "utf8");
const legacyDockerfile = readFileSync("packaging/docker/Dockerfile", "utf8");
const engineChecksums = JSON.parse(readFileSync("packaging/docker/opencode-release-checksums.json", "utf8"));
const constants = JSON.parse(readFileSync("constants.json", "utf8"));

for (const phrase of [
  'orchestratorPkg.dependencies?.["matterhorn-work-server"]',
  'manifest.entries?.["matterhorn-work-server"]?.version',
  "Orchestrator server dependency matches server version",
]) {
  assert.ok(releaseReview.includes(phrase), `release review must understand the canonical Matterhorn server package: ${phrase}`);
}

for (const phrase of [
  'RELEASE_NAME="Matterhorn Desks $TAG"',
  'if [[ "$TAG" == *-* ]]',
  'prerelease="true"',
  'if [ "$prerelease" = "true" ]',
  'publish_sidecars="false"',
  'publish_npm="false"',
  'publish_daytona_snapshot="false"',
  'draft="true"',
  'publish="${INPUT_PUBLISH:-false}"',
  "needs.resolve-release.outputs.publish == 'true'",
  "github.event_name == 'workflow_dispatch'",
  "Verify macOS public release trust chain",
  "desktop-public-release-verify.mjs",
  'source_commit="$(git rev-parse HEAD)"',
  '--source-commit "$source_commit"',
  "--strict",
  "trust-chain-${{ matrix.artifact }}",
]) {
  assert.ok(releaseWorkflow.includes(phrase), `release workflow missing safety policy: ${phrase}`);
}

assert.equal(
  releaseWorkflow.includes("blacksmith-4vcpu-ubuntu-2404"),
  false,
  "release workflow must use an available GitHub-hosted Linux runner",
);
assert.equal(
  daytonaWorkflow.includes("blacksmith-4vcpu-ubuntu-2404"),
  false,
  "release snapshot workflow must use an available GitHub-hosted Linux runner",
);

const publishReleaseStart = releaseWorkflow.indexOf("publish-release:");
assert.ok(publishReleaseStart >= 0, "release workflow must retain the publish-release job");
const publishReleaseBlock = releaseWorkflow.slice(publishReleaseStart);
assert.ok(
  publishReleaseBlock.indexOf("github.event_name == 'workflow_dispatch'") <
    publishReleaseBlock.indexOf("gh release edit"),
  "a tag push must not automatically publish a draft release",
);

assert.equal(
  releaseWorkflow.includes("github.event.inputs.draft"),
  false,
  "release dispatch must not allow a draft bypass before assets are ready",
);

function jobBlock(jobName) {
  const marker = `\n  ${jobName}:`;
  const start = releaseWorkflow.indexOf(marker);
  assert.ok(start >= 0, `release workflow must retain ${jobName}`);
  const tail = releaseWorkflow.slice(start + marker.length);
  const nextJob = tail.search(/\n  [a-z0-9-]+:\n/);
  return nextJob >= 0 ? tail.slice(0, nextJob) : tail;
}

assert.equal(
  agentWorkflow.includes("https://opencode.ai/install"),
  false,
  "agent workflows must not pipe a remote installer into the runner shell",
);
assert.ok(
  agentWorkflow.match(/bash scripts\/install-pinned-opencode\.sh/g)?.length === 2,
  "both agent jobs must use the repository-pinned engine installer",
);
for (const phrase of [
  "curl --proto '=https' --tlsv1.2",
  "sha256sum -c -",
  "opencode-release-checksums.json",
  "OPENCODE_DOWNLOAD_SHA256 is required",
]) {
  assert.ok(pinnedEngineInstaller.includes(phrase), `pinned engine installer missing integrity policy: ${phrase}`);
}
const engineVersion = String(constants.opencodeVersion ?? "").replace(/^v/, "");
assert.ok(engineChecksums[engineVersion], `checksums must cover the pinned engine version ${engineVersion}`);
for (const asset of [
  "opencode-linux-arm64.tar.gz",
  "opencode-linux-x64-baseline.tar.gz",
]) {
  assert.match(
    engineChecksums[engineVersion][asset] ?? "",
    /^[a-f0-9]{64}$/,
    `checksums must include a SHA-256 for ${asset}`,
  );
}
assert.ok(
  microSandboxDockerfile.includes("/usr/local/bin/install-pinned-opencode.sh"),
  "micro-sandbox Docker builds must use the verified engine installer",
);
assert.doesNotMatch(
  microSandboxEntrypoint,
  /microsandbox-(?:host-)?token/,
  "micro-sandbox entrypoint must not ship fixed bearer credentials",
);
assert.doesNotMatch(
  microSandboxEntrypoint,
  /(?:client|host) token:.*\$/i,
  "micro-sandbox entrypoint must not print bearer credentials",
);
assert.ok(
  microSandboxEntrypoint.includes("MATTERHORN_WORK_APPROVAL_MODE:-${OPENWORK_APPROVAL_MODE:-manual}"),
  "micro-sandbox approval mode must default to manual",
);
assert.ok(
  microSandboxEntrypoint.includes("Set MATTERHORN_WORK_TOKEN using the deployment secret manager"),
  "micro-sandbox must require a client secret",
);
assert.ok(
  microSandboxEntrypoint.includes("Set MATTERHORN_WORK_HOST_TOKEN using the deployment secret manager"),
  "micro-sandbox must require a host secret",
);
assert.doesNotMatch(
  microSandboxEntrypoint,
  /CORS_ORIGINS[^\n]*:-\*}/,
  "micro-sandbox CORS must not default to wildcard",
);
assert.ok(
  productionCompose.includes("dockerfile: packaging/docker/Dockerfile.microsandbox"),
  "production compose must use the source-built, checksum-verified image",
);
assert.ok(
  productionCompose.includes("MATTERHORN_WORK_TOKEN: ${MATTERHORN_WORK_TOKEN:?"),
  "production compose must require the client token",
);
assert.ok(
  productionCompose.includes("MATTERHORN_WORK_HOST_TOKEN: ${MATTERHORN_WORK_HOST_TOKEN:?"),
  "production compose must require the host token",
);
assert.doesNotMatch(
  legacyDockerfile,
  /"--cors", "\*"/,
  "legacy container defaults must not grant wildcard CORS",
);

for (const jobName of [
  "release-orchestrator-sidecars",
  "publish-npm",
  "publish-daytona-snapshot",
  "aur-publish",
  "publish-release",
]) {
  assert.ok(
    jobBlock(jobName).includes("github.event_name == 'workflow_dispatch'"),
    `${jobName} must require a deliberate workflow dispatch`,
  );
}

assert.ok(
  jobBlock("aur-publish").includes("needs.resolve-release.outputs.prerelease == 'false'"),
  "prereleases must never publish AUR metadata",
);

console.log("Release workflow safety policy passed.");
