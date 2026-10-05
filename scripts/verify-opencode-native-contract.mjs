#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, createReadStream, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeSuite = "apps/server/src/opencode-compaction-contract.e2e.test.ts";
const minimumCases = 30;

export function findRuntimeBinary(name = "opencode", searchPath = process.env.PATH ?? "") {
  const candidates = isAbsolute(name) || name.includes("/") || name.includes("\\")
    ? [resolve(name)] : searchPath.split(delimiter).filter(Boolean).map(directory => join(directory, name));
  for (const candidate of candidates) {
    try { accessSync(candidate, constants.X_OK); return realpathSync(candidate); }
    catch { /* Try only the explicitly supplied path or PATH entries. */ }
  }
  return null;
}

export function isolatedRuntimeEnvironment(root, inherited = process.env) {
  return {
    PATH: inherited.PATH ?? "",
    ...(inherited.SystemRoot ? { SystemRoot: inherited.SystemRoot } : {}),
    HOME: root, USERPROFILE: root,
    TMPDIR: join(root, "tmp"), TMP: join(root, "tmp"), TEMP: join(root, "tmp"),
    XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"),
    XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config"),
    OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_MODELS_FETCH: "true",
    OPENCODE_DISABLE_PROJECT_CONFIG: "true",
    CI: "1", NO_COLOR: "1",
  };
}

export function assertNativeReport(xml) {
  const count = [...xml.matchAll(/<testcase(?:\s|>)/g)].length;
  if (!/<testsuites(?:\s|>)/.test(xml) || !/<\/testsuites>/.test(xml)
    || count < minimumCases || /<(?:skipped|failure|error)(?:\s|\/?>)/.test(xml)) {
    throw new Error(`Native runtime contract needs at least ${minimumCases} passing cases and no skips/failures; report is incomplete or unsuccessful`);
  }
  return count;
}

async function binaryDigest(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

export async function verifyNativeRuntime({ binary, expectedVersion, runner = "bun" }) {
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(expectedVersion ?? "")) {
    throw new Error("An exact expected runtime version is required");
  }
  const executable = findRuntimeBinary(binary);
  if (!executable) throw new Error("The selected OpenCode binary is missing or not executable");
  const testRunner = findRuntimeBinary(runner);
  if (!testRunner) throw new Error("Bun is required to verify the native runtime contract");
  const binarySha256 = await binaryDigest(executable);
  const root = mkdtempSync(join(tmpdir(), "matterhorn-native-release-"));
  try {
    for (const directory of ["tmp", "config", "data", "cache", "state"]) mkdirSync(join(root, directory), { mode: 0o700 });
    const env = isolatedRuntimeEnvironment(root);
    const version = spawnSync(executable, ["--version"], { cwd: root, env, encoding: "utf8", timeout: 15_000, killSignal: "SIGKILL" });
    if (version.error || version.status !== 0 || version.stdout.trim().replace(/^v/, "") !== expectedVersion) {
      throw new Error(`Selected runtime did not report the exact expected version ${expectedVersion}`);
    }
    const reportPath = join(root, "native.xml");
    const result = spawnSync(testRunner, ["test", nativeSuite, "--bail=1", "--reporter=junit", `--reporter-outfile=${reportPath}`], {
      cwd: repository, env: { ...env, MATTERHORN_TEST_OPENCODE_BIN: executable, MATTERHORN_TEST_OPENCODE_VERSION: expectedVersion },
      stdio: "inherit", timeout: 10 * 60_000, killSignal: "SIGKILL", detached: process.platform !== "win32",
    });
    if (result.error || result.status !== 0) {
      // On a timeout, the test runner cannot execute its normal native-child cleanup.
      if (process.platform !== "win32" && result.pid > 0) {
        try { process.kill(-result.pid, "SIGKILL"); } catch { /* Its isolated process group already exited. */ }
      }
      throw new Error("Native runtime contract failed; this binary is not accepted for release");
    }
    const tests = assertNativeReport(readFileSync(reportPath, "utf8"));
    if (await binaryDigest(executable) !== binarySha256) throw new Error("Selected runtime binary changed during verification");
    return { version: expectedVersion, binarySha256, tests,
      provider: "synthetic-loopback", hostedAcceptance: false };
  } finally {
    // Only this invocation's freshly allocated disposable directory is removed.
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--binary" || args[2] !== "--expected-version") {
      throw new Error("Usage: node scripts/verify-opencode-native-contract.mjs --binary /absolute/path/opencode --expected-version VERSION");
    }
    console.log(JSON.stringify(await verifyNativeRuntime({ binary: args[1], expectedVersion: args[3] }), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Native runtime verification failed");
    process.exitCode = 1;
  }
}
