#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDirectory = join(repository, "patches/runtime");
export const digest = (value) => createHash("sha256").update(value).digest("hex");

export function verifyDistribution(directory = runtimeDirectory) {
  const manifest = JSON.parse(readFileSync(join(directory, "distribution.json"), "utf8"));
  if (manifest.schema !== "matterhorn.opencode-source-distribution.v1"
    || !/^\d+\.\d+\.\d+-matterhorn\.\d+$/.test(manifest.version)
    || !/^\d+\.\d+\.\d+$/.test(manifest.sdkVersion)
    || !/^[a-f0-9]{40}$/.test(manifest.source?.commit)
    || manifest.source.repository !== "https://github.com/anomalyco/opencode.git"
    || manifest.source.tag !== `v${manifest.sdkVersion}`
    || manifest.channel !== "matterhorn"
    || manifest.bunVersion !== "1.3.14"
    || manifest.publishedArtifacts !== false
    || manifest.hostedAcceptance !== false) throw new Error("Invalid pinned source distribution");
  const requiredPatches = ["opencode-1.18.31-request-identity.patch", "opencode-1.18.31-lock-recovery.patch", "opencode-1.18.31-distribution-version.patch", "opencode-1.18.31-managed-upgrade.patch"];
  if (JSON.stringify(manifest.patches?.map(item => item.file)) !== JSON.stringify(requiredPatches)) throw new Error("The source distribution requires the reviewed identity, lock-recovery, distribution-version and managed-upgrade patches");
  for (const item of [...manifest.patches, manifest.catalog]) {
    if (!/^[A-Za-z0-9._-]+$/.test(item.file) || !/^[a-f0-9]{64}$/.test(item.sha256)
      || digest(readFileSync(join(directory, item.file))) !== item.sha256) {
      throw new Error(`Source distribution checksum failed: ${item.file}`);
    }
  }
  const catalog = JSON.parse(readFileSync(join(directory, manifest.catalog.file), "utf8"));
  const providers = Object.values(catalog);
  const models = providers.reduce((count, provider) => count + Object.keys(provider.models ?? {}).length, 0);
  if (providers.length < 1 || models < 1 || providers.length !== manifest.catalog.providers
    || models !== manifest.catalog.models || !catalog.openai?.models || !catalog.anthropic?.models
    || manifest.catalog.source !== "https://models.dev/api.json") throw new Error("A complete pinned official model catalog is required");
  if (!readFileSync(join(directory, manifest.catalog.license), "utf8").includes("MIT License")) throw new Error("Model catalog license is missing");
  return manifest;
}

export function buildEnvironment(root, inherited = process.env) {
  return {
    PATH: inherited.PATH ?? "",
    HOME: join(root, "home"), TMPDIR: join(root, "tmp"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0", CI: "1", NO_COLOR: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_MODELS_FETCH: "true",
  };
}

export function buildPinnedRuntime({ output, bun = "bun", sourceRepository, cacheDirectory }) {
  const manifest = verifyDistribution();
  const platform = `${process.platform}-${process.arch}`;
  if (!manifest.sourceBuildPlatforms.includes(platform)) throw new Error(`The maintained source distribution does not support ${platform}`);
  if (!output || !isAbsolute(output)) throw new Error("An absolute --output binary path is required");
  if (existsSync(output) || existsSync(`${output}.provenance.json`)) throw new Error("Refusing to overwrite an existing runtime or provenance file");
  if (sourceRepository && !isAbsolute(sourceRepository)) throw new Error("--source-repository must be an absolute local Git path");
  const root = mkdtempSync(join(tmpdir(), "matterhorn-runtime-build-"));
  const env = buildEnvironment(root);
  if (isAbsolute(bun)) env.PATH = `${dirname(bun)}:${env.PATH}`;
  const run = (command, args, cwd = root, extra = {}, capture = false) => {
    const result = spawnSync(command, args, { cwd, env: { ...env, ...extra }, encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", timeout: 15 * 60_000,
      detached: process.platform !== "win32", killSignal: "SIGKILL" });
    if (result.error?.code === "ETIMEDOUT" && process.platform !== "win32" && result.pid > 0) {
      try { process.kill(-result.pid, "SIGKILL"); } catch { /* Its owned group already exited. */ }
    }
    if (result.error || result.status !== 0) throw new Error(`Runtime build failed: ${command} ${args.join(" ")}${capture ? `\n${result.stderr ?? ""}` : ""}`);
    return result.stdout?.trim();
  };
  try {
    for (const path of [env.HOME, env.TMPDIR, env.XDG_CONFIG_HOME, env.XDG_DATA_HOME, env.XDG_CACHE_HOME, env.XDG_STATE_HOME]) mkdirSync(path, { mode: 0o700 });
    if (run(bun, ["--version"], root, {}, true) !== manifest.bunVersion) throw new Error(`Runtime source builds require exactly Bun ${manifest.bunVersion}`);
    const source = join(root, "source");
    run("git", ["init", "--quiet", source]);
    run("git", ["fetch", "--quiet", "--depth=1", sourceRepository ?? manifest.source.repository, manifest.source.commit], source);
    run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], source);
    if (run("git", ["rev-parse", "HEAD"], source, {}, true) !== manifest.source.commit) throw new Error("Upstream source commit mismatch");
    const sourceLock = digest(readFileSync(join(source, "bun.lock")));
    for (const patch of manifest.patches) {
      const path = join(runtimeDirectory, patch.file);
      run("git", ["apply", "--check", path], source);
      run("git", ["apply", path], source);
    }
    // Core source imports SDK/types supplied by the root workspace as well as
    // opencode's dependencies; a package-only install accidentally relies on
    // links left behind by a previous full install.
    run(bun, ["install", "--frozen-lockfile", "--ignore-scripts", "--filter", "./", "--filter", "./packages/opencode", "--cache-dir", cacheDirectory ?? join(root, "bun-cache")], source);
    if (digest(readFileSync(join(source, "bun.lock"))) !== sourceLock) throw new Error("Frozen upstream dependency lockfile changed");
    const packageDirectory = join(source, "packages/opencode");
    run(bun, ["run", "typecheck"], packageDirectory);
    // Keep the source suite bounded; the local hook-denial fixture uses the
    // upstream test-only installer override, not a registry timing dependency.
    run(bun, ["test", "test/session/prompt.test.ts", "--timeout", "30000"], packageDirectory);
    run(bun, ["test", "test/installation-version.test.ts", "test/util/lock-owner.test.ts", "test/util/flock.test.ts", "test/util/effect-flock.test.ts"], join(source, "packages/core"));
    run(bun, ["test", "test/installation/installation.test.ts"], packageDirectory);
    run(bun, ["test", "--define", 'OPENCODE_CHANNEL="matterhorn"', "--define", `OPENCODE_VERSION=${JSON.stringify(manifest.version)}`,
      "test/installation/matterhorn.test.ts"], packageDirectory);
    run(bun, ["run", "script/build.ts", "--single", ...(process.arch === "x64" ? ["--baseline"] : []), "--skip-install", "--skip-embed-web-ui"], packageDirectory, {
      OPENCODE_CHANNEL: manifest.channel, OPENCODE_VERSION: manifest.version,
      MODELS_DEV_API_JSON: join(runtimeDirectory, manifest.catalog.file),
    });
    const asset = `opencode-${platform}${process.arch === "x64" ? "-baseline" : ""}`;
    const binary = join(packageDirectory, "dist", asset, "bin/opencode");
    if (run(binary, ["--version"], root, {}, true) !== manifest.version) throw new Error("Built runtime version mismatch");
    const binarySha256 = digest(readFileSync(binary));
    const upgradeEnvironment = { ...env };
    delete upgradeEnvironment.OPENCODE_DISABLE_AUTOUPDATE;
    const upgrade = spawnSync(binary, ["upgrade", "9.9.9", "--method", "curl"], {
      cwd: root, env: upgradeEnvironment, encoding: "utf8", timeout: 15_000,
      detached: process.platform !== "win32", killSignal: "SIGKILL",
    });
    if (upgrade.error?.code === "ETIMEDOUT" && process.platform !== "win32" && upgrade.pid > 0) {
      try { process.kill(-upgrade.pid, "SIGKILL"); } catch { /* Its owned group already exited. */ }
    }
    if (upgrade.error || upgrade.status === 0
      || !`${upgrade.stdout}${upgrade.stderr}`.includes("managed by Matterhorn")
      || digest(readFileSync(binary)) !== binarySha256) throw new Error("Maintained runtime must intrinsically refuse stock upgrades");
    const provenance = { schema: manifest.schema, version: manifest.version, sdkVersion: manifest.sdkVersion,
      source: manifest.source, patches: manifest.patches, catalog: manifest.catalog, bunVersion: manifest.bunVersion,
      platform, binarySha256, upstreamLockSha256: sourceLock, stockUpgrades: "blocked",
      buildFlags: ["--single", ...(process.arch === "x64" ? ["--baseline"] : []), "--skip-install", "--skip-embed-web-ui"],
      upstreamTests: { status: "passed", knownPromptSuiteSkips: 1 }, nativeAcceptance: false, hostedAcceptance: false };
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(binary, output, constants.COPYFILE_EXCL);
    chmodSync(output, 0o755);
    writeFileSync(`${output}.provenance.json`, `${JSON.stringify(provenance, null, 2)}\n`, { flag: "wx", mode: 0o644 });
    copyFileSync(join(source, "LICENSE"), `${output}.LICENSE`, constants.COPYFILE_EXCL);
    copyFileSync(join(runtimeDirectory, manifest.catalog.license), `${output}.models.dev-LICENSE`, constants.COPYFILE_EXCL);
    return provenance;
  } finally {
    // This invocation owns the freshly allocated build directory only.
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    const names = { "--output": "output", "--bun": "bun", "--source-repository": "sourceRepository", "--cache-dir": "cacheDirectory" };
    for (let index = 0; index < args.length; index += 2) {
      const name = names[args[index]];
      if (!name || !args[index + 1] || options[name]) throw new Error("Usage: node scripts/build-pinned-opencode.mjs --output /absolute/path/opencode [--bun /path/to/bun] [--source-repository /local/git/cache] [--cache-dir /local/bun/cache]");
      options[name] = args[index + 1];
    }
    console.log(JSON.stringify(buildPinnedRuntime(options), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
