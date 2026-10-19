import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sidecarTarget, validateRepository } from "./verified-opencode.js";

test("desktop target mapping stays closed over the six supported native targets", () => {
  const triples = ["aarch64-apple-darwin", "x86_64-apple-darwin", "aarch64-unknown-linux-gnu", "x86_64-unknown-linux-gnu", "aarch64-pc-windows-msvc", "x86_64-pc-windows-msvc"];
  expect(triples.map(sidecarTarget)).toEqual(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "windows-arm64", "windows-x64"]);
  for (const invalid of ["", "../../other", "x86_64-unknown-linux-musl"]) expect(() => sidecarTarget(invalid)).toThrow();
});

test("desktop downloads allow only the pinned official repository, including legacy spelling", () => {
  for (const value of [undefined, "", "anomalyco/opencode", "https://github.com/anomalyco/opencode.git"]) expect(() => validateRepository(value)).not.toThrow();
  for (const value of ["attacker/opencode", "http://github.com/anomalyco/opencode", "anomalyco/opencode/../other", "anomalyco/opencode?redirect=other"]) expect(() => validateRepository(value)).toThrow();
});

test("desktop preparation verifies before copying and never probes or extracts an old unverified sidecar", async () => {
  const source = await readFile(new URL("./prepare-sidecar.mjs", import.meta.url), "utf8");
  expect(source).toContain('"--no-env-file", join(__dirname, "verified-opencode.ts")');
  expect(source).toContain('mkdtempSync(join(tmpdir(), "matterhorn-opencode-build-"))');
  expect(source).toContain('renameSync(staged, target)');
  expect(source.indexOf('join(__dirname, "verified-opencode.ts")')).toBeLessThan(source.indexOf('copyFileSync(result.stdout.trim(), staged)'));
  expect(source).not.toMatch(/readBinaryVersion|shouldDownloadOpencode|spawnSync\("curl"|Expand-Archive|findOpencodeBinary/);
  const verifier = await readFile(new URL("./verified-opencode.ts", import.meta.url), "utf8");
  expect(verifier).toContain('new URL("../../../constants.json", import.meta.url)');
  expect(verifier).toContain("downloadVerifiedOfficialOpencode");
  expect(verifier).not.toMatch(/spawn|execFile|fetch\(/);
});

test("an existing untrusted desktop binary is never executed when official verification fails", async () => {
  const sourceUrl = new URL("./prepare-sidecar.mjs", import.meta.url);
  // Evaluate the actual top-level build flow with inert filesystem/process
  // adapters. No executable, downloader, signer or live build is run by this test.
  const source = (await readFile(sourceUrl, "utf8"))
    .replace(/^import[\s\S]*?from "[^"]+";\n/gm, "")
    .replaceAll("import.meta.url", JSON.stringify(sourceUrl.href));
  const calls: string[] = [];
  const cleanups: string[] = [];
  const candidate = "/private/build/opencode-aarch64-apple-darwin";
  expect(() => runInNewContext(source, {
    dirname, join, resolve, fileURLToPath, createHash, Buffer,
    process: { platform: "darwin", arch: "arm64", argv: ["node", "prepare-sidecar.mjs", "--outdir", "/private/build"], env: {}, exit() { throw new Error("unexpected exit"); } },
    console: { log() {}, error() {} }, tmpdir: () => "/private/tmp",
    readFileSync: () => JSON.stringify({ opencodeVersion: "v1.18.31" }),
    existsSync: (path: string) => path === candidate,
    statSync: () => ({ isFile: () => true, size: 2048 }),
    openSync: () => 7, closeSync() {}, readSync: () => 0,
    mkdtempSync: () => "/private/tmp/owned-fixture",
    rmSync: (path: string) => cleanups.push(path),
    spawnSync: (command: string) => { calls.push(command); return { status: 1, stdout: "", stderr: "synthetic digest mismatch" }; },
    copyFileSync() { throw new Error("must not publish unverified bytes"); },
  })).toThrow("synthetic digest mismatch");
  expect(calls).toEqual(["bun"]);
  expect(cleanups).toEqual(["/private/tmp/owned-fixture"]);
});
