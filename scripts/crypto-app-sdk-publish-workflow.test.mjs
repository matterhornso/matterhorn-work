#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflowPath = ".github/workflows/publish-crypto-app-sdk.yml";
const source = readFileSync(workflowPath, "utf8");

function count(pattern) {
  return source.match(pattern)?.length ?? 0;
}

for (const required of [
  "name: Publish Crypto App SDK",
  "  workflow_dispatch:",
  "      version:",
  "      source_commit:",
  "      confirmation:",
  "permissions:\n  contents: read",
  "  group: publish-crypto-app-sdk",
  "  cancel-in-progress: false",
  "    runs-on: ubuntu-24.04",
  "    timeout-minutes: 30",
  "    environment: npm-crypto-app-sdk",
  "      id-token: write",
  '      SDK_PACKAGE: "@matterhorn-work/crypto-app-sdk"',
  "      NPM_REGISTRY: https://registry.npmjs.org/",
  "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2",
  "pnpm/action-setup@41ff72655975bd51cab0327fa583b6e92b6d3061 # v4.2.0",
  "actions/setup-node@395ad3262231945c25e8478fd5baf05154b1d79f # v6.1.0",
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2",
  "          fetch-depth: 0",
  "          persist-credentials: false",
  "          node-version: 24",
  "          registry-url: https://registry.npmjs.org",
  "          package-manager-cache: false",
  'if [ "$DISPATCH_REF" != "refs/heads/dev" ]',
  'if [ "$SOURCE_COMMIT" != "$DISPATCH_COMMIT" ]',
  'if [ "$(git rev-parse HEAD)" != "$SOURCE_COMMIT" ]',
  'expected_confirmation="publish ${SDK_PACKAGE}@${SDK_VERSION}"',
  'release_tag="crypto-app-sdk-v${SDK_VERSION}"',
  'git fetch --no-tags origin "refs/tags/${release_tag}:refs/tags/${release_tag}"',
  'if [ "$(git rev-list -n 1 "$release_tag")" != "$SOURCE_COMMIT" ]',
  "npm 11.5.1 or newer is required for trusted publishing.",
  "pnpm install --frozen-lockfile --ignore-scripts",
  "pnpm test:crypto-app-sdk-package",
  "pnpm test:crypto-app-sdk-provenance",
  "node scripts/crypto-app-sdk-publish-workflow.test.mjs",
  'npm publish "$SDK_ARCHIVE"',
  "--access public",
  "--ignore-scripts",
  "--provenance",
  'if [ -n "${NODE_AUTH_TOKEN:-}" ] || [ -n "${NPM_TOKEN:-}" ]',
  'npm view "${SDK_PACKAGE}@${SDK_VERSION}" version',
  "node scripts/crypto-app-sdk-provenance.mjs",
  '--expected-commit "$SOURCE_COMMIT"',
  "          if-no-files-found: error",
  "          retention-days: 30",
]) {
  assert.ok(
    source.includes(required),
    `SDK publication workflow missing: ${required}`,
  );
}

assert.equal(count(/^  workflow_dispatch:$/gm), 1);
assert.equal(
  count(
    /^  (?:push|pull_request|schedule|repository_dispatch|workflow_run):/gm,
  ),
  0,
);
assert.equal(
  count(/^  [a-z0-9_-]+:$/gm),
  2,
  "the workflow must retain one manual trigger and one approval-gated job",
);
assert.equal(count(/^  publish:$/gm), 1);
assert.equal(count(/uses: [^\s]+@[0-9a-f]{40}(?:\s+# [^\n]+)?$/gm), 4);
assert.equal(
  count(/npm publish /g),
  1,
  "the workflow must contain one publication boundary",
);
assert.equal(count(/^\s+(?:NODE_AUTH_TOKEN|NPM_TOKEN):/gm), 0);
assert.equal(count(/\$\{\{\s*secrets\./g), 0);

const testsIndex = source.indexOf("pnpm test:crypto-app-sdk-package");
const publishIndex = source.indexOf('npm publish "$SDK_ARCHIVE"');
const provenanceIndex = source.indexOf(
  "node scripts/crypto-app-sdk-provenance.mjs",
);
assert.ok(
  testsIndex >= 0 && testsIndex < publishIndex,
  "package tests must run before publication",
);
assert.ok(
  publishIndex < provenanceIndex,
  "registry provenance must be verified after publication",
);

for (const block of source.split(/^      - name: /m).slice(1)) {
  const run =
    block.match(/\n        run: \|\n([\s\S]*?)(?=\n      - name: |$)/)?.[1] ??
    "";
  assert.doesNotMatch(
    run,
    /\$\{\{\s*(?:inputs|github\.event\.inputs)\./,
    "untrusted dispatch input must enter shell steps through env",
  );
}

for (const forbidden of [
  "--force",
  "npm unpublish",
  "npm deprecate",
  "contents: write",
  "packages: write",
  "pull-requests: write",
]) {
  assert.equal(
    source.includes(forbidden),
    false,
    `SDK publication workflow must exclude ${forbidden}`,
  );
}

console.log("Crypto App SDK publication workflow safety passed.");
