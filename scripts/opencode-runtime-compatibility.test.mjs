#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findRuntimeBinary, verifyNativeRuntime } from "./verify-opencode-native-contract.mjs";

const readText = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(readText(path));
const constants = readJson("constants.json");
const upstream = readJson("upstream-compatibility.json");
const pinnedVersion = String(constants.opencodeVersion ?? "").trim().replace(/^v/, "");
const openworkVersion = String(constants.openworkUpstreamVersion ?? "").trim();

assert.match(pinnedVersion, /^\d+\.\d+\.\d+$/, "constants.json must pin an exact OpenCode version");
assert.match(openworkVersion, /^v\d+\.\d+\.\d+$/, "constants.json must pin an exact OpenWork upstream version");
assert.equal(upstream.version, "matterhorn.upstream-compatibility.v1");
assert.equal(upstream.openwork?.version, openworkVersion, "OpenWork compatibility baseline must match constants.json");
assert.equal(upstream.opencode?.version, `v${pinnedVersion}`, "OpenCode compatibility baseline must match constants.json");
assert.equal(upstream.opencode?.sdkVersion, pinnedVersion, "OpenCode SDK and runtime must remain paired");
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
    pinnedVersion,
    `${path} must use the exact SDK version paired with the runtime`,
  );
}

const dockerfile = readText("packaging/docker/Dockerfile.public-beta");
assert.match(
  dockerfile,
  new RegExp(`ARG OPENCODE_VERSION=${pinnedVersion.replaceAll(".", "\\.")}`),
  "the public-beta image must default to the repository-pinned OpenCode version",
);
assert.match(
  dockerfile,
  /bash scripts\/install-pinned-opencode\.sh/,
  "the public-beta image must use the checksum-verifying installer",
);
assert.doesNotMatch(
  dockerfile,
  /releases\/download\/v\$\{OPENCODE_VERSION\}/,
  "the public-beta image must not bypass the checksum-verifying installer",
);

const checksums = readJson("packaging/docker/opencode-release-checksums.json");
for (const asset of [
  "opencode-darwin-arm64.zip",
  "opencode-darwin-x64-baseline.zip",
  "opencode-linux-arm64.tar.gz",
  "opencode-linux-x64-baseline.tar.gz",
]) {
  assert.match(
    checksums[pinnedVersion]?.[asset] ?? "",
    /^[a-f0-9]{64}$/,
    `the pinned runtime must include a SHA-256 for ${asset}`,
  );
}

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
