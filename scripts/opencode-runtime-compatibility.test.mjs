#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";

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
  "experimental.chat.messages.transform",
  "experimental.chat.system.transform",
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

const binaryCheck = spawnSync("opencode", ["--version"], { encoding: "utf8" });
if (binaryCheck.status === 0) {
  const installedVersion = `${binaryCheck.stdout}${binaryCheck.stderr}`.trim().replace(/^v/, "");
  assert.equal(installedVersion, pinnedVersion, "installed OpenCode must match the pinned SDK/runtime version");

  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("failed to reserve an OpenCode compatibility port"));
      });
    });
  });
  const username = "matterhorn-compatibility";
  const password = "matterhorn-compatibility-password";
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const child = spawn(
    "opencode",
    ["serve", "--hostname", "127.0.0.1", "--port", String(port), "--cors", "*"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENCODE_SERVER_USERNAME: username,
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_CONFIG_CONTENT: JSON.stringify({ permission: { "*": "deny", read: "allow" } }),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const appendOutput = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-8_192);
  };
  child.stdout?.on("data", appendOutput);
  child.stderr?.on("data", appendOutput);

  try {
    const deadline = Date.now() + 15_000;
    let healthy = false;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/global/health`, {
          headers: { Authorization: authorization },
          signal: AbortSignal.timeout(1_500),
        });
        if (response.ok) {
          const body = await response.json();
          assert.equal(body.healthy, true, "the pinned OpenCode runtime must report healthy");
          assert.equal(body.version, pinnedVersion, "the running OpenCode version must match the repository pin");
          healthy = true;
          break;
        }
      } catch {
        // The process may still be binding its loopback listener.
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(healthy, `OpenCode ${pinnedVersion} failed its managed runtime boot smoke:\n${output}`);
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
} else if (process.env.MATTERHORN_REQUIRE_OPENCODE_BINARY === "1") {
  assert.fail(`OpenCode ${pinnedVersion} is required for this compatibility gate`);
}

console.log(`OpenWork ${openworkVersion} / OpenCode ${pinnedVersion} compatibility gate passed.`);
