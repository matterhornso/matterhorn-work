#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repository = process.cwd();
const packageDirectory = join(repository, "packages/matterhorn-guarded-mcp");
const temporary = mkdtempSync(join(tmpdir(), "matterhorn-guarded-mcp-package-"));
const packDirectory = join(temporary, "pack");
const extractDirectory = join(temporary, "extract");
const consumerDirectory = join(temporary, "consumer");
mkdirSync(packDirectory);
mkdirSync(extractDirectory);
mkdirSync(consumerDirectory);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repository,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
      npm_config_update_notifier: "false",
    },
  });
  assert.equal(result.error, undefined, `${command} failed to start: ${result.error?.message}`);
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result;
}

run("pnpm", ["pack", "--pack-destination", packDirectory], { cwd: packageDirectory });
const tarballs = readdirSync(packDirectory).filter((name) => name.endsWith(".tgz"));
assert.equal(tarballs.length, 1, "guarded MCP pack must produce exactly one archive");
const tarball = join(packDirectory, tarballs[0]);
const archive = run("tar", ["-tzf", tarball]).stdout.trim().split(/\r?\n/);
assert.deepEqual(archive.sort(), [
  "package/LICENSE",
  "package/README.md",
  "package/index.mjs",
  "package/package.json",
].sort());

run("tar", ["-xzf", tarball, "-C", extractDirectory]);
const packedDirectory = join(extractDirectory, "package");
const manifest = JSON.parse(readFileSync(join(packedDirectory, "package.json"), "utf8"));
assert.equal(manifest.name, "@matterhorn-work/guarded-mcp");
assert.equal(manifest.private, undefined);
assert.deepEqual(manifest.dependencies || {}, {});
assert.equal(manifest.sideEffects, false);
assert.equal(manifest.engines.node, ">=20");
assert.equal(manifest.bin["matterhorn-guarded-mcp"], "index.mjs");
assert.equal(manifest.publishConfig.access, "public");
assert.equal(manifest.publishConfig.registry, "https://registry.npmjs.org/");
assert.equal(manifest.repository.url, "git+https://github.com/matterhornso/matterhorn-work.git");
assert.equal(manifest.repository.directory, "packages/matterhorn-guarded-mcp");
for (const lifecycle of ["preinstall", "install", "postinstall", "prepublish", "prepublishOnly", "postpublish"]) {
  assert.equal(lifecycle in (manifest.scripts || {}), false, `archive contains ${lifecycle} lifecycle script`);
}

const source = readFileSync(join(packedDirectory, "index.mjs"), "utf8");
for (const forbidden of [
  "MATTERHORN_WORK_HOST_TOKEN",
  "OPENWORK_HOST_TOKEN",
  "X-Matterhorn-Host-Token",
  "node:child_process",
  "node:fs",
  "matterhorn_reply_approval",
  "matterhorn_write_files",
  "matterhorn_memory_capture",
  "matterhorn_bittensor_prepare_extrinsic",
  "matterhorn_hyperliquid_preview_order",
  "matterhorn_polymarket_preview_order",
  "matterhorn_sui",
  "/approvals",
  "/files/",
  "/api/crypto",
  "/api/bittensor",
  "/api/hyperliquid",
  "/api/polymarket",
  "/api/sui",
]) {
  assert.equal(source.includes(forbidden), false, `guarded archive contains forbidden authority surface: ${forbidden}`);
}

writeFileSync(
  join(consumerDirectory, "package.json"),
  JSON.stringify({ name: "guarded-mcp-clean-consumer", private: true, type: "module" }, null, 2),
);
run("pnpm", ["add", "--offline", "--ignore-scripts", "--save-exact", tarball], { cwd: consumerDirectory });
const binary = join(
  consumerDirectory,
  "node_modules/@matterhorn-work/guarded-mcp/index.mjs",
);
const child = spawn(process.execPath, [binary], {
  cwd: consumerDirectory,
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    MATTERHORN_WORK_MCP_PROFILE: "guarded_client",
    MATTERHORN_WORK_SERVER_URL: "http://127.0.0.1:8787",
    MATTERHORN_WORK_TOKEN: "clean_consumer_token",
  },
});
let output = "";
child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => { output += chunk; });
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`);
await new Promise((resolvePromise, reject) => {
  const timer = setTimeout(() => reject(new Error("clean guarded MCP tools/list timed out")), 5_000);
  const inspect = () => {
    const line = output.split("\n").find(Boolean);
    if (!line) return;
    clearTimeout(timer);
    resolvePromise();
  };
  child.stdout.on("data", inspect);
  inspect();
});
child.stdin.end();
const listed = JSON.parse(output.split("\n").find(Boolean));
assert.equal(listed.result.tools.length, 11);
assert.equal(listed.result.tools.every((tool) => tool.inputSchema.additionalProperties === false), true);
const serializedTools = JSON.stringify(listed.result.tools);
assert.equal(/approval|filesystem|private.?key|signed.?payload|broadcast|relay/i.test(serializedTools), false);

console.log("Matterhorn Guarded MCP clean-package acceptance passed.");
