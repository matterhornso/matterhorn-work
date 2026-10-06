#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findRuntimeBinary, verifyNativeRuntime } from "./verify-opencode-native-contract.mjs";
import { verifyDistribution } from "./build-pinned-opencode.mjs";

const readText = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(readText(path));
const constants = readJson("constants.json");
const upstream = readJson("upstream-compatibility.json");
const pinnedVersion = String(constants.opencodeVersion ?? "").trim().replace(/^v/, "");
const openworkVersion = String(constants.openworkUpstreamVersion ?? "").trim();
const distribution = verifyDistribution();

assert.equal(pinnedVersion, distribution.version, "constants.json must pin the maintained runtime distribution");
assert.match(openworkVersion, /^v\d+\.\d+\.\d+$/, "constants.json must pin an exact OpenWork upstream version");
assert.equal(upstream.version, "matterhorn.upstream-compatibility.v1");
assert.equal(upstream.openwork?.version, openworkVersion, "OpenWork compatibility baseline must match constants.json");
assert.equal(upstream.opencode?.version, `v${pinnedVersion}`, "OpenCode compatibility baseline must match constants.json");
assert.equal(upstream.opencode?.sdkVersion, distribution.sdkVersion, "The unchanged HTTP SDK must match the source baseline");
assert.equal(upstream.opencode?.commit, distribution.source.commit);
assert.equal(upstream.opencode?.distributionManifest, "patches/runtime/distribution.json");
assert.deepEqual(upstream.opencode?.requiredPluginHooks, [
  "chat.message",
  "experimental.chat.messages.transform",
  "experimental.chat.system.transform",
  "experimental.session.compacting",
  "tool.execute.before",
], "the guarded runtime must pin every OpenCode hook used as a security boundary");
assert.equal(upstream.openwork?.integrationStrategy, "compatibility_port");
assert.match(upstream.openwork?.commit ?? "", /^[a-f0-9]{40}$/);
assert.match(upstream.opencode?.commit ?? "", /^[a-f0-9]{40}$/);

const packagePaths = [
  "apps/app/package.json",
  "apps/desktop/package.json",
  "apps/opencode-router/package.json",
  "apps/orchestrator/package.json",
  "apps/server/package.json",
];

for (const path of packagePaths) {
  const pkg = readJson(path);
  assert.equal(
    pkg.dependencies?.["@opencode-ai/sdk"],
    distribution.sdkVersion,
    `${path} must use the exact SDK version paired with the patched source baseline`,
  );
}

const dockerfile = readText("packaging/docker/Dockerfile.public-beta");
assert.match(
  dockerfile,
  /node scripts\/build-pinned-opencode\.mjs --output \/out\/opencode/,
  "the public-beta image must build the pinned compatible source distribution",
);
assert.match(
  dockerfile,
  /node scripts\/verify-opencode-native-contract\.mjs/,
  "the public-beta image must execute native acceptance against its exact installed binary",
);
assert.doesNotMatch(
  dockerfile,
  /releases\/download\/v\$\{OPENCODE_VERSION\}/,
  "the public-beta image must not bypass the checksum-verifying installer",
);

assert.deepEqual(distribution.sourceBuildPlatforms, ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"]);
assert.equal(distribution.publishedArtifacts, false, "Source builds must not claim unpublished prebuilt artifacts exist");

const runtimeConfig = readText("apps/server/src/managed-opencode-runtime-config.ts");
for (const contract of [
  '"*": "deny"',
  '"matterhorn-work_*": "allow"',
  'edit: "ask"',
  'bash: "deny"',
  'task: "deny"',
  'webfetch: "deny"',
  'websearch: "deny"',
  'external_directory: "deny"',
  'title: { disable: true }',
]) {
  assert.ok(runtimeConfig.includes(contract), `managed runtime permission policy missing ${contract}`);
}

assert.match(
  runtimeConfig,
  /openworkExtensionsPreviewPluginPath\(\),\s*matterhornGuardPluginPath\(\),/,
  "the Matterhorn guard must remain the final managed plugin",
);
const guardPlugin = readText("apps/server/src/opencode-plugins/matterhorn-guard.ts");
for (const hook of upstream.opencode.requiredPluginHooks) {
  assert.ok(guardPlugin.includes(`"${hook}"`), `the Matterhorn guard must implement ${hook}`);
}
assert.ok(
  guardPlugin.indexOf('"experimental.chat.messages.transform"')
    < guardPlugin.indexOf('"experimental.chat.system.transform"'),
  "final provider messages must be validated before provider system context is released",
);

const webClient = readText("apps/app/src/app/lib/opencode.ts");
assert.match(
  webClient,
  /resolveOpencodeRequestTimeoutMs\(input, init\)/,
  "OpenWork-compatible web event streams must not inherit the ordinary request timeout",
);

const sessionReadModel = readText("apps/server/src/session-read-model.ts");
assert.match(
  sessionReadModel,
  /SessionMessagesResponse2 as SessionMessagesResponse/,
  "the server read model must use the current OpenCode SDK message response type",
);

const binary = findRuntimeBinary();
if (binary) {
  const evidence = await verifyNativeRuntime({ binary, expectedVersion: pinnedVersion });
  console.log(JSON.stringify(evidence));
  console.log(`OpenWork ${openworkVersion} / OpenCode ${pinnedVersion} native compatibility gate passed.`);
} else if (process.env.MATTERHORN_REQUIRE_OPENCODE_BINARY === "1") {
  assert.fail(`OpenCode ${pinnedVersion} is required for this compatibility gate`);
} else {
  console.log(`OpenWork ${openworkVersion} / OpenCode ${pinnedVersion} metadata checks passed; native execution NOT verified (no binary on PATH).`);
}
