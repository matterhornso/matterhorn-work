import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildEnvironment, buildPinnedRuntime, digest, verifyDistribution } from "./build-pinned-opencode.mjs";

test("maintained distribution pins reviewed patches and a real full model catalog", () => {
  const manifest = verifyDistribution();
  assert.equal(manifest.version, "1.18.31-matterhorn.1");
  assert.equal(manifest.sdkVersion, "1.18.31");
  assert.equal(manifest.patches.length, 4);
  assert.ok(manifest.catalog.models > 1000);
  assert.equal(manifest.publishedArtifacts, false);
  assert.equal(manifest.hostedAcceptance, false);
});

test("build environment excludes credentials, release flags and Bun/Node injection", () => {
  const env = buildEnvironment("/disposable", { PATH: "/tools", GH_TOKEN: "secret", AWS_SECRET_ACCESS_KEY: "secret",
    NODE_OPTIONS: "injection", BUN_OPTIONS: "injection", OPENCODE_RELEASE: "1", OPENCODE_VERSION: "fake" });
  assert.equal(env.PATH, "/tools");
  assert.equal(env.HOME, "/disposable/home");
  assert.equal(env.GIT_CONFIG_GLOBAL, "/dev/null");
  for (const key of ["GH_TOKEN", "AWS_SECRET_ACCESS_KEY", "NODE_OPTIONS", "BUN_OPTIONS", "OPENCODE_RELEASE", "OPENCODE_VERSION"]) assert.equal(env[key], undefined);
});

for (const change of ["patch", "catalog-checksum", "empty-catalog", "invalid-manifest"]) {
  test(`rejects ${change} before fetching or building source`, () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-distribution-test-"));
    try {
      cpSync(new URL("../patches/runtime", import.meta.url), root, { recursive: true });
      const manifestPath = join(root, "distribution.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (change === "patch") writeFileSync(join(root, manifest.patches[0].file), "modified patch");
      if (change === "catalog-checksum") writeFileSync(join(root, manifest.catalog.file), "{}");
      if (change === "empty-catalog") {
        writeFileSync(join(root, manifest.catalog.file), "{}");
        manifest.catalog.sha256 = digest("{}"); manifest.catalog.models = 0; manifest.catalog.providers = 0;
      }
      if (change === "invalid-manifest") manifest.source.repository = "https://untrusted.example/runtime.git";
      writeFileSync(manifestPath, JSON.stringify(manifest));
      assert.throws(() => verifyDistribution(root));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("source builder requires explicit output and never replaces an existing file", () => {
  assert.throws(() => buildPinnedRuntime({ output: "relative" }), /absolute/);
  assert.throws(() => buildPinnedRuntime({ output: new URL(import.meta.url).pathname }), /overwrite/);
});

test("source builder verifies immutable inputs and never invokes upstream publishing", () => {
  const source = readFileSync(new URL("./build-pinned-opencode.mjs", import.meta.url), "utf8");
  for (const expected of ["--frozen-lockfile", "--ignore-scripts", "--check", "--skip-install", "--skip-embed-web-ui",
    "MODELS_DEV_API_JSON", "binarySha256", "upstreamLockSha256", "test/util/lock-owner.test.ts", "nativeAcceptance: false"]) assert.ok(source.includes(expected));
  assert.doesNotMatch(source, /OPENCODE_RELEASE:/);
  assert.doesNotMatch(source, /models\.fixture/);
  assert.ok(source.includes('process.kill(-result.pid, "SIGKILL")'));
  assert.ok(source.includes("test/installation/matterhorn.test.ts"));
  assert.ok(source.includes("delete upgradeEnvironment.OPENCODE_DISABLE_AUTOUPDATE"));
});

test("uncertified desktop and automatic prebuilt paths fail closed", () => {
  for (const path of ["../apps/desktop/scripts/prepare-sidecar.mjs", "../apps/orchestrator/src/cli.ts", "../apps/desktop/electron/runtime.mjs"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.ok(source.includes('includes("-matterhorn.")'), `${path} must recognize the source-only distribution`);
  }
});

test("container toolchains approve only pinned Bun lifecycle and verify its installed version", () => {
  for (const name of ["Dockerfile.public-beta", "Dockerfile.microsandbox"]) {
    const source = readFileSync(new URL(`../packaging/docker/${name}`, import.meta.url), "utf8");
    assert.ok(source.includes("pnpm --allow-build=bun add --global"));
    assert.ok(source.includes("bun@1.3.14"));
    assert.ok(source.includes('test "$(bun --version)" = "1.3.14"'));
    assert.match(source, /USER node\nRUN node scripts\/build-pinned-opencode\.mjs/,
      "source lock permission tests must execute as an unprivileged user");
    assert.doesNotMatch(source, /dangerouslyAllowAllBuilds/);
  }
});

for (const corrupt of [false, true]) {
  test(`installer ${corrupt ? "preserves the installed engine on checksum failure" : "verifies and installs a staged binary with provenance"}`, () => {
    const root = mkdtempSync(join(tmpdir(), "matterhorn-installer-test-"));
    try {
      mkdirSync(join(root, "scripts")); mkdirSync(join(root, "patches/runtime"), { recursive: true });
      const installDirectory = join(root, "installed"); mkdirSync(installDirectory);
      const version = verifyDistribution().version;
      copyFileSync(new URL("./install-pinned-opencode.sh", import.meta.url), join(root, "scripts/install-pinned-opencode.sh"));
      writeFileSync(join(root, "constants.json"), JSON.stringify({ opencodeVersion: `v${version}` }));
      writeFileSync(join(root, "patches/runtime/distribution.json"), JSON.stringify({ version }));
      const old = "existing-runtime-remains-unchanged";
      writeFileSync(join(installDirectory, "opencode"), old, { mode: 0o755 });
      const binary = `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(version)});\n`;
      // This isolated fake builder tests the installer transaction only. The
      // production source builder and strict native verifier remain separate.
      writeFileSync(join(root, "scripts/build-pinned-opencode.mjs"), `
        import { writeFileSync } from "node:fs";
        const output = process.argv[3];
        writeFileSync(output, ${JSON.stringify(binary)}, { mode: 0o755 });
        writeFileSync(output + ".provenance.json", ${JSON.stringify(JSON.stringify({ version, binarySha256: corrupt ? "0".repeat(64) : digest(binary) }))});
        writeFileSync(output + ".LICENSE", "fixture license");
        writeFileSync(output + ".models.dev-LICENSE", "fixture catalog license");
      `);
      const result = spawnSync("bash", [join(root, "scripts/install-pinned-opencode.sh")], { encoding: "utf8",
        env: { PATH: process.env.PATH, HOME: root, OPENCODE_INSTALL_DIR: installDirectory } });
      if (corrupt) {
        assert.notEqual(result.status, 0);
        assert.match(result.stderr, /integrity mismatch/);
        assert.equal(readFileSync(join(installDirectory, "opencode"), "utf8"), old);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.equal(readFileSync(join(installDirectory, "opencode"), "utf8"), binary);
        assert.equal(JSON.parse(readFileSync(join(installDirectory, "opencode.provenance.json"), "utf8")).binarySha256, digest(binary));
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
