import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const launcher = fileURLToPath(new URL("launch.mjs", import.meta.url));
const fixtureKey = "synthetic-qa-key-never-print-this-value";
function run(args) {
  const result = spawnSync(process.execPath, [launcher, ...args], { encoding: "utf8", env: { PATH: process.env.PATH, CUDOS_API_KEY: fixtureKey } });
  assert.ok(!`${result.stdout}${result.stderr}`.includes(fixtureKey));
  return result;
}
test("missing explicit source rejects inherited provider key", () => {
  const result = run(["--check-only"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing --env-file/);
});
test("provider-free check validates maintained binary without a provider", () => {
  const result = run(["--wiring-only", "--check-only"]);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).providerKeyTextPresent, false);
});
test("private env source is required, bounded, and never echoed", () => {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-launcher-test-"));
  const file = join(root, "provider.env");
  try {
    writeFileSync(file, "OTHER_KEY=synthetic\n", { mode: 0o600 });
    assert.equal(run(["--env-file", file, "--check-only"]).status, 1);
    writeFileSync(file, `CUDOS_API_KEY=${fixtureKey}\n`);
    assert.equal(run(["--env-file", file, "--check-only"]).status, 0);
    chmodSync(file, 0o644);
    assert.equal(run(["--env-file", file, "--check-only"]).status, 1);
    chmodSync(file, 0o600);
    const link = join(root, "linked.env");
    symlinkSync(file, link);
    assert.equal(run(["--env-file", link, "--check-only"]).status, 1);
    assert.equal(run(["--env-file", file, "--wiring-only", "--check-only"]).status, 1);
    writeFileSync(file, `CUDOS_API_KEY=${fixtureKey}\n#${"x".repeat(65536)}`);
    assert.equal(run(["--env-file", file, "--check-only"]).status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
