import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadVerifiedOpencode } from "../src/opencode-download.js";
import type { SidecarConfig, SidecarTarget } from "../src/sidecar-download.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const executable = Buffer.from("synthetic OpenCode payload, never executed\n");
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function fixture(target: SidecarTarget = "linux-x64") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "matterhorn-opencode-test-")));
  roots.push(root);
  const packageDir = join(root, "package");
  await mkdir(packageDir);
  const binName = target.startsWith("windows-") ? "opencode.exe" : "opencode";
  await writeFile(join(packageDir, binName), executable, { mode: 0o700 });
  const zip = !target.startsWith("linux-");
  const assetName = zip ? `opencode-${target}.zip` : "opencode-linux-x64-baseline.tar.gz";
  const archivePath = join(root, zip ? "fixture.zip" : "fixture.tar.gz");
  const rebuild = async () => {
    await rm(archivePath, { force: true });
    if (zip) execFileSync("zip", ["-q", "-r", "-y", archivePath, "package"], { cwd: root });
    else execFileSync("tar", ["-czf", archivePath, "package"], { cwd: root });
    return readFile(archivePath);
  };
  let archive = await rebuild();
  const sidecar: SidecarConfig = {
    dir: join(root, "cache"), releaseVersion: "0.13.15", target,
    baseUrl: "https://mirror.example/releases/0.13.15", manifestUrl: "https://mirror.example/releases/0.13.15/manifest.json",
  };
  const apiUrl = "https://api.github.com/repos/anomalyco/opencode/releases/tags/v1.18.31";
  const assetUrl = `https://github.com/anomalyco/opencode/releases/download/v1.18.31/${assetName}`;
  const asset = { name: assetName, browser_download_url: assetUrl, digest: `sha256:${hash(archive)}`, size: archive.length };
  let metadata: unknown = { tag_name: "v1.18.31", assets: [asset] };
  let manifestResponse = () => new Response(null, { status: 404 });
  let binaryResponse = () => new Response(archive);
  let metadataResponse = () => Response.json(metadata);
  const calls: string[] = [];
  const fetchImpl = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(init?.signal).toBeDefined();
    expect(init?.redirect).toBe(url === apiUrl ? "error" : "manual");
    if (url === sidecar.manifestUrl) return manifestResponse();
    if (url === apiUrl) return metadataResponse();
    if (url === assetUrl || url.startsWith("https://release-assets.githubusercontent.com/")) return binaryResponse();
    throw new Error("Unexpected request");
  }, { preconnect() {} });
  const directory = join(sidecar.dir, "verified-v1", "0.13.15", "opencode", "1.18.31", target);
  return { root, packageDir, sidecar, directory, bin: join(directory, binName), asset, assetName, apiUrl, assetUrl, calls,
    options: { sidecar, expectedVersion: "1.18.31", assetOverride: assetName, fetchImpl },
    setManifest(value: () => Response) { manifestResponse = value; },
    setMetadata(value: unknown) { metadata = value; },
    setMetadataResponse(value: () => Response) { metadataResponse = value; },
    setBinary(value: () => Response) { binaryResponse = value; },
    async rebuildArchive() { archive = await rebuild(); asset.digest = `sha256:${hash(archive)}`; asset.size = archive.length; },
  };
}

test("manifest 404 and optional omissions reach the verified official fallback without running legacy cache files", async () => {
  for (const manifest of [() => new Response(null, { status: 404 }), () => Response.json({ entries: {} }),
    () => Response.json({ entries: { opencode: { version: "1.18.31", targets: {} } } })]) {
    const f = await fixture();
    f.setManifest(manifest);
    const legacyDirectory = join(f.sidecar.dir, "opencode", "1.18.31", "linux-x64");
    await mkdir(legacyDirectory, { recursive: true, mode: 0o700 });
    const legacy = join(legacyDirectory, "opencode");
    const legacyBytes = "#!/bin/sh\nexit 99\n";
    await writeFile(legacy, legacyBytes, { mode: 0o700 });
    expect(await downloadVerifiedOpencode(f.options)).toBe(f.bin);
    expect(await readFile(f.bin)).toEqual(executable);
    expect(await readFile(legacy, "utf8")).toBe(legacyBytes);
    expect(f.calls).toEqual([f.sidecar.manifestUrl, f.apiUrl, f.assetUrl]);
    expect((await lstat(f.bin)).mode & 0o777).toBe(0o700);
    expect((await readdir(f.directory)).sort()).toEqual([".opencode-release.tar.gz", "opencode"]);
  }
});

test("verified archive cache is rehashed, executable cache is never trusted, and old files remain untouched", async () => {
  const f = await fixture();
  await downloadVerifiedOpencode(f.options);
  await writeFile(f.bin, "untrusted replacement executable");
  f.calls.length = 0;
  expect(await downloadVerifiedOpencode(f.options)).toBe(f.bin);
  expect(await readFile(f.bin)).toEqual(executable);
  expect(f.calls).toEqual([f.sidecar.manifestUrl, f.apiUrl]);
  await writeFile(join(f.directory, ".opencode-release.tar.gz"), "damaged archive");
  f.calls.length = 0;
  await downloadVerifiedOpencode(f.options);
  expect(f.calls).toEqual([f.sidecar.manifestUrl, f.apiUrl, f.assetUrl]);
});

test("ZIP fallback uses the selected target filename on both host and foreign targets", async () => {
  for (const target of ["darwin-arm64", "windows-arm64"] satisfies SidecarTarget[]) {
    const f = await fixture(target);
    expect(await downloadVerifiedOpencode(f.options)).toBe(f.bin);
    expect(await readFile(f.bin)).toEqual(executable);
  }
});

test("a valid sidecar entry does not request official fallback metadata", async () => {
  const f = await fixture();
  f.setManifest(() => Response.json({ entries: { opencode: { version: "1.18.31", targets: {
    "linux-x64": { url: `${f.sidecar.baseUrl}/opencode`, sha256: hash(executable) },
  } } } }));
  const fetchImpl = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
    f.calls.push(String(input));
    return String(input) === f.sidecar.manifestUrl
      ? Response.json({ entries: { opencode: { version: "1.18.31", targets: { "linux-x64": { asset: "opencode", sha256: hash(executable) } } } } })
      : new Response(executable);
  }, { preconnect() {} });
  expect(await downloadVerifiedOpencode({ ...f.options, fetchImpl })).toBe(f.bin);
  expect(f.calls).toEqual([f.sidecar.manifestUrl, `${f.sidecar.baseUrl}/opencode`]);
});

test("invalid manifests never trigger the official fallback", async () => {
  for (const body of [{}, { entries: { opencode: { version: "9.9.9", targets: {} } } },
    { entries: { opencode: { version: "1.18.31", targets: { "linux-x64": { asset: "opencode" } } } } }]) {
    const f = await fixture();
    f.setManifest(() => Response.json(body));
    await expect(downloadVerifiedOpencode(f.options)).rejects.toThrow();
    expect(f.calls).toEqual([f.sidecar.manifestUrl]);
  }
});

test("fallback metadata requires the exact pinned release, unique asset, official URL, digest and bounded size", async () => {
  const f = await fixture();
  const invalid: unknown[] = [null, {}, { tag_name: "v9.9.9", assets: [f.asset] },
    { tag_name: "v1.18.31", assets: [] }, { tag_name: "v1.18.31", assets: [f.asset, f.asset] },
    ...[undefined, "", "sha256:abc", `sha512:${"a".repeat(64)}`].map(digest => ({ tag_name: "v1.18.31", assets: [{ ...f.asset, digest }] })),
    ...[undefined, 0, -1, 1.5, 513 * 1024 * 1024].map(size => ({ tag_name: "v1.18.31", assets: [{ ...f.asset, size }] })),
    ...["http://github.com/anomalyco/opencode/releases/download/v1.18.31/opencode-linux-x64-baseline.tar.gz", "https://unapproved.example/archive", `${f.assetUrl}?secret=value`, f.assetUrl.replace("/anomalyco/", "/another-owner/"), f.assetUrl.replace("v1.18.31", "v1.18.30")].map(browser_download_url => ({ tag_name: "v1.18.31", assets: [{ ...f.asset, browser_download_url }] })),
  ];
  for (const value of invalid) {
    f.setMetadata(value); f.calls.length = 0;
    await expect(downloadVerifiedOpencode(f.options)).rejects.toThrow();
    expect(f.calls).toEqual([f.sidecar.manifestUrl, f.apiUrl]);
    expect(await readdir(f.root)).not.toContain("cache");
  }
});

test("malformed metadata responses, missing digests and failed integrity do not reuse an old executable", async () => {
  const f = await fixture();
  await downloadVerifiedOpencode(f.options);
  await writeFile(f.bin, "existing file retained");
  for (const response of [() => new Response(null, { status: 302, headers: { location: "https://unapproved.example/metadata" } }),
    () => new Response("{}", { headers: { "content-length": "1048577" } }), () => new Response("not JSON"),
    () => new Response(null, { status: 403 })]) {
    f.setMetadataResponse(response);
    await expect(downloadVerifiedOpencode(f.options)).rejects.toThrow();
    expect(await readFile(f.bin, "utf8")).toBe("existing file retained");
  }
  f.setMetadataResponse(() => Response.json({ tag_name: "v1.18.31", assets: [{ ...f.asset, digest: `sha256:${"0".repeat(64)}` }] }));
  await expect(downloadVerifiedOpencode(f.options)).rejects.toThrow("integrity");
  expect(await readFile(f.bin, "utf8")).toBe("existing file retained");
});

test("local pins and flat asset overrides cannot introduce filesystem paths or shell arguments", async () => {
  const f = await fixture();
  for (const version of ["../1.18.31", "1.18.31;command", "v1.18.31", ""]) {
    f.calls.length = 0;
    await expect(downloadVerifiedOpencode({ ...f.options, expectedVersion: version })).rejects.toThrow();
    expect(f.calls).toEqual([]);
  }
  for (const assetOverride of ["../opencode.zip", "opencode-../../other.zip", "opencode-x.zip;command", "-opencode.zip", "https://elsewhere.example/opencode.zip", "opencode-x.exe"]) {
    f.calls.length = 0;
    await expect(downloadVerifiedOpencode({ ...f.options, assetOverride })).rejects.toThrow();
    expect(f.calls).toEqual([f.sidecar.manifestUrl]);
  }
});

test("official archive redirects stay within the exact release or GitHub release-assets CDN and are bounded", async () => {
  for (const location of ["https://evil.example/archive", "http://github.com/anomalyco/opencode/releases/download/v1.18.31/x", "https://github.com/other/repo/releases/download/v1.18.31/x", "https://release-assets.githubusercontent.com.evil.example/x"]) {
    const f = await fixture();
    f.setBinary(() => new Response(null, { status: 302, headers: { location } }));
    await expect(downloadVerifiedOpencode(f.options)).rejects.toThrow("redirect");
    expect(f.calls).toEqual([f.sidecar.manifestUrl, f.apiUrl, f.assetUrl]);
    expect(await readdir(f.directory)).toEqual([]);
  }
  const f = await fixture();
  let first = true;
  const archive = await readFile(join(f.root, "fixture.tar.gz"));
  f.setBinary(() => { if (first) { first = false; return new Response(null, { status: 302, headers: { location: "https://release-assets.githubusercontent.com/verified" } }); } return new Response(archive); });
  expect(await downloadVerifiedOpencode(f.options)).toBe(f.bin);
  const loop = await fixture();
  loop.setBinary(() => new Response(null, { status: 302, headers: { location: loop.assetUrl } }));
  await expect(downloadVerifiedOpencode(loop.options)).rejects.toThrow("redirect");
  expect(loop.calls.length).toBe(8);
});

test("archive entry selection rejects links, duplicate executables and unsafe names without unpacking a tree", async () => {
  for (const target of ["linux-x64", "darwin-arm64"] satisfies SidecarTarget[]) {
    const f = await fixture(target);
    const outside = join(f.root, "outside");
    await writeFile(outside, "preserve me");
    await rm(join(f.packageDir, "opencode"));
    await symlink(outside, join(f.packageDir, "opencode"));
    await f.rebuildArchive();
    await expect(downloadVerifiedOpencode(f.options)).rejects.toThrow("regular file");
    expect(await readFile(outside, "utf8")).toBe("preserve me");
    expect(await readdir(f.directory)).not.toContain("opencode");
    expect((await readdir(f.directory)).some(name => name.startsWith(".archive-"))).toBe(false);
  }
  const f = await fixture();
  await mkdir(join(f.packageDir, "duplicate"));
  await writeFile(join(f.packageDir, "duplicate", "opencode"), executable);
  await f.rebuildArchive();
  await expect(downloadVerifiedOpencode(f.options)).rejects.toThrow("exactly one");
  await rm(join(f.packageDir, "duplicate"), { recursive: true });
  await writeFile(join(f.packageDir, "wildcard*"), "rejected");
  await f.rebuildArchive();
  await expect(downloadVerifiedOpencode(f.options)).rejects.toThrow("entry name");
});

test("cache roots, descendants and files writable by other Unix users are rejected without mutation", async () => {
  if (process.platform === "win32") return;
  for (const select of [(f: Awaited<ReturnType<typeof fixture>>) => f.sidecar.dir,
    (f: Awaited<ReturnType<typeof fixture>>) => f.directory,
    (f: Awaited<ReturnType<typeof fixture>>) => join(f.directory, ".opencode-release.tar.gz"),
    (f: Awaited<ReturnType<typeof fixture>>) => f.bin]) {
    const f = await fixture();
    await downloadVerifiedOpencode(f.options);
    const path = select(f);
    const info = await lstat(path);
    await chmod(path, info.isDirectory() ? 0o770 : 0o660);
    await expect(downloadVerifiedOpencode(f.options)).rejects.toThrow("cache");
    expect((await lstat(path)).mode & 0o777).toBe(info.isDirectory() ? 0o770 : 0o660);
    expect(await readFile(f.bin)).toEqual(executable);
  }
});

test("CLI downloaded and auto resolution both use the tested fallback helper, without legacy probes", async () => {
  const cli = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
  const wrapper = cli.slice(cli.indexOf("async function resolveOpencodeDownload("), cli.indexOf("async function sha256File("));
  expect(wrapper).toContain("downloadVerifiedOpencode");
  expect(wrapper).not.toContain("readCliVersion");
  expect(wrapper).not.toContain("fileExists");
  const resolver = cli.slice(cli.indexOf("async function resolveOpencodeBin("), cli.indexOf("async function resolveOpenCodeRouterBin("));
  expect([...resolver.matchAll(/resolveOpencodeDownload\(/g)].length).toBe(2);
  expect(cli).not.toContain("resolveVerifiedOpencodeReleaseAsset");
  expect(cli).not.toContain("Expand-Archive");
});
