import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const wrapper = readFileSync(join(root, "bin/matterhorn-work"), "utf8");

test("published postinstall requires a matching installed optional package; never fetches or accepts legacy binaries", () => {
  const directory = mkdtempSync(join(tmpdir(), "matterhorn-install-test-"));
  try {
    copyFileSync(join(root, "scripts/postinstall.mjs"), join(directory, "postinstall.mjs"));
    writeFileSync(join(directory, "package.json"), JSON.stringify({ version: "1.2.3" }), { mode: 0o600 });
    const extension = process.platform === "win32" ? ".exe" : "";
    const pkg = `openwork-orchestrator-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
    const run = () => spawnSync(process.execPath, [join(directory, "postinstall.mjs")], {
      encoding: "utf8", env: { PATH: process.env.PATH, MATTERHORN_WORK_ORCHESTRATOR_DOWNLOAD_BASE_URL: "http://127.0.0.1:1" },
    });
    const assertMissing = () => { const result = run(); assert.equal(result.status, 1); assert.match(result.stderr, /optional dependencies enabled/); };
    assertMissing();
    mkdirSync(join(directory, "dist/bin"), { recursive: true, mode: 0o700 });
    for (const name of ["matterhorn-work", "openwork"]) writeFileSync(join(directory, "dist/bin", name + extension), "never execute legacy bytes", { mode: 0o700 });
    assertMissing();
    const installed = join(directory, "node_modules", pkg);
    mkdirSync(join(installed, "bin"), { recursive: true, mode: 0o700 });
    writeFileSync(join(installed, "package.json"), JSON.stringify({ version: "1.2.3" }), { mode: 0o600 });
    assertMissing();
    writeFileSync(join(installed, "bin", "matterhorn-work" + extension), "synthetic platform binary; installer must not execute", { mode: 0o700 });
    assert.equal(run().status, 0);
    writeFileSync(join(installed, "package.json"), JSON.stringify({ version: "9.9.9" }), { mode: 0o600 });
    assertMissing();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

function runWrapper({ platform = "linux", arch = "x64", installed = true, version = "1.2.3", canonical = true, legacy = false, env = {} } = {}) {
  const spawned = [];
  const errors = [];
  let exit;
  const marker = {};
  const path = { join: (...parts) => parts.join("/"), dirname: (value) => value.slice(0, value.lastIndexOf("/")) };
  const packagePath = `/modules/openwork-orchestrator-${platform === "win32" ? "windows" : platform}-${arch}/package.json`;
  const modules = {
    child_process: { spawnSync: (...args) => { spawned.push(args); return { status: 0 }; } },
    os: { platform: () => platform, arch: () => arch }, path,
    fs: {
      readFileSync: (file) => JSON.stringify({ version: file === packagePath ? version : "1.2.3" }),
      lstatSync: (file) => ({ isFile: () => file.endsWith(`/bin/matterhorn-work${platform === "win32" ? ".exe" : ""}`) ? canonical : legacy }),
    },
  };
  const require = (name) => modules[name];
  require.resolve = () => { if (!installed) throw new Error("missing"); return packagePath; };
  try {
    runInNewContext(wrapper, { require, __dirname: "/package/bin", console: { error: (message) => errors.push(message) },
      process: { env, argv: ["node", "wrapper", "serve", "--workspace", "space with quotes'"], exit(code) { exit = code; throw marker; } } });
  } catch (error) { if (error !== marker) throw error; }
  return { exit, spawned, errors, packagePath };
}

test("wrapper preserves all supported platform packages and arguments, with same-package legacy name compatibility", () => {
  for (const platform of ["darwin", "linux", "win32"]) for (const arch of ["x64", "arm64"]) {
    const result = runWrapper({ platform, arch });
    assert.equal(result.exit, 0);
    assert.equal(result.spawned.length, 1);
    assert.equal(result.spawned[0][0], `${dirname(result.packagePath)}/bin/matterhorn-work${platform === "win32" ? ".exe" : ""}`);
    assert.deepEqual(Array.from(result.spawned[0][1]), ["serve", "--workspace", "space with quotes'"]);
  }
  assert.match(runWrapper({ canonical: false, legacy: true }).spawned[0][0], /\/bin\/openwork$/);
});

test("wrapper fails closed without platform package, on version mismatch and missing binaries, even if postinstall was skipped", () => {
  for (const options of [{ installed: false }, { version: "9.9.9" }, { canonical: false }]) {
    const result = runWrapper(options);
    assert.equal(result.exit, 1);
    assert.deepEqual(result.spawned, []);
    assert.match(result.errors.join("\n"), /optional dependencies enabled/);
  }
  assert.doesNotMatch(wrapper, /fallbackCandidates|existsSync/);
  assert.doesNotMatch(readFileSync(join(root, "scripts/postinstall.mjs"), "utf8"), /fetch\(|DOWNLOAD_BASE_URL/);
});

test("explicit operator BIN_PATH remains a documented direct-execution trust choice", () => {
  for (const name of ["MATTERHORN_WORK_ORCHESTRATOR_BIN_PATH", "OPENWORK_ORCHESTRATOR_BIN_PATH"]) {
    const result = runWrapper({ installed: false, env: { [name]: "/operator-selected/binary" } });
    assert.equal(result.exit, 0);
    assert.equal(result.spawned[0][0], "/operator-selected/binary");
  }
});
