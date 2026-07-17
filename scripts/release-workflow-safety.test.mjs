#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const releaseWorkflow = readFileSync(".github/workflows/release-macos-aarch64.yml", "utf8");
const daytonaWorkflow = readFileSync(".github/workflows/release-daytona-snapshot.yml", "utf8");
const releaseReview = readFileSync("scripts/release/review.mjs", "utf8");

for (const phrase of [
  'orchestratorPkg.dependencies?.["matterhorn-work-server"]',
  'manifest.entries?.["matterhorn-work-server"]?.version',
  "Orchestrator server dependency matches server version",
]) {
  assert.ok(releaseReview.includes(phrase), `release review must understand the canonical Matterhorn server package: ${phrase}`);
}

for (const phrase of [
  'RELEASE_NAME="Matterhorn Work $TAG"',
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
