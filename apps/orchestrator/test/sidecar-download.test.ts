import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { downloadVerifiedSidecar, type SidecarConfig, type SidecarName, type SidecarTarget } from "../src/sidecar-download.js";

const temporaryRoots: string[] = [];
afterEach(async () => {
  for (const path of temporaryRoots.splice(0)) await rm(path, { recursive: true, force: true });
});
const bytes = Buffer.from("synthetic sidecar bytes; never executed");
const digest = createHash("sha256").update(bytes).digest("hex");

async function fixture(name: SidecarName = "openwork-server", target: SidecarTarget = "linux-x64") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "matterhorn-sidecar-test-")));
  temporaryRoots.push(root);
  const sidecar: SidecarConfig = {
    dir: join(root, "cache"), releaseVersion: "1.2.3", target,
    baseUrl: "https://mirror.example/releases/1.2.3", manifestUrl: "https://mirror.example/releases/1.2.3/manifest.json",
  };
  const asset = { asset: "custom-name", sha256: digest, size: bytes.length };
  const entry = { version: "1.2.3", targets: { [target]: asset } };
  const manifest = { version: "1.2.3", entries: { [name]: entry } };
  const calls: string[] = [];
  let binaryBody = bytes;
  let manifestBody: unknown = manifest;
  const fetchImpl = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    expect(init?.redirect).toBe("manual");
    expect(init?.signal).toBeDefined();
    return url === sidecar.manifestUrl ? Response.json(manifestBody) : new Response(binaryBody);
  }, { preconnect() {} });
  const options = { name, sidecar, expectedVersion: "1.2.3", fetchImpl };
  const directory = join(sidecar.dir, "verified-v1", "1.2.3", name, "1.2.3", target);
  return { root, sidecar, asset, entry, manifest, calls, options, directory, bin: join(directory, target.startsWith("windows-") ? `${name}.exe` : name),
    setManifest(value: unknown) { manifestBody = value; }, setBytes(value: Buffer) { binaryBody = value; } };
}

test("verified bytes use locally pinned paths for all sidecars, and cached bytes are reverified", async () => {
  for (const name of ["openwork-server", "opencode-router", "opencode"] satisfies SidecarName[]) {
    const f = await fixture(name);
    const result = await downloadVerifiedSidecar(f.options);
    expect(result).toEqual({ bin: f.bin, source: "downloaded", expectedVersion: "1.2.3" });
    expect(await readFile(f.bin)).toEqual(bytes);
    expect(f.calls).toEqual([f.sidecar.manifestUrl, `${f.sidecar.baseUrl}/custom-name`]);
    expect((await lstat(f.bin)).mode & 0o777).toBe(0o700);
    await downloadVerifiedSidecar(f.options);
    expect(f.calls.length).toBe(3);
    await writeFile(f.bin, "damaged cache");
    await downloadVerifiedSidecar(f.options);
    expect(f.calls.length).toBe(5);
    expect(await readFile(f.bin)).toEqual(bytes);
  }
});

test("cache filenames use the locally selected target, including Windows and prereleases", async () => {
  const f = await fixture("opencode-router", "windows-x64");
  expect((await downloadVerifiedSidecar(f.options))?.bin).toBe(f.bin);
  expect(f.bin.endsWith("opencode-router.exe")).toBe(true);
  f.options.expectedVersion = "1.2.3-alpha.1+build.4";
  f.entry.version = f.options.expectedVersion;
  expect((await downloadVerifiedSidecar(f.options))?.expectedVersion).toBe(f.options.expectedVersion);
});

test("remote executable names cannot change the local command or touch legacy caches", async () => {
  const f = await fixture();
  const legacy = join(f.sidecar.dir, "1.2.3", "linux-x64", "custom-name");
  await mkdir(join(f.sidecar.dir, "1.2.3", "linux-x64"), { recursive: true });
  await writeFile(legacy, "legacy bytes remain");
  f.asset.asset = "remote-script.js";
  expect((await downloadVerifiedSidecar(f.options))?.bin).toBe(f.bin);
  expect(await readFile(legacy, "utf8")).toBe("legacy bytes remain");
  expect(await readdir(f.directory)).toEqual(["openwork-server"]);
});

test("invalid entries, versions, digests, assets and sizes stop before binary fetch or cache writes", async () => {
  const cases: unknown[] = [null, [], {}, { entries: [] }, { entries: { "openwork-server": null } },
    ...["9.9.9", "../1.2.3", "1.2.3;echo", null].map(version => ({ entries: { "openwork-server": { version, targets: {} } } })),
    ...[{}, { sha256: "a" }, { sha256: digest, asset: "../outside" }, { sha256: digest, asset: "..\\outside" },
      { sha256: digest, asset: "/outside" }, { sha256: digest, asset: "a;command" },
      { sha256: digest, asset: "good", size: -1 }, { sha256: digest, asset: "good", size: 1.5 },
      { sha256: digest, asset: "good", size: 513 * 1024 * 1024 }, { sha256: digest, url: 42 },
      { sha256: digest, url: "https://elsewhere.example/sidecar" },
      { sha256: digest, url: "https://mirror.example/releases/1.2.30/sidecar" },
      { sha256: digest, url: "https://mirror.example/releases/1.2.3/%2foutside" },
    ].map(asset => ({ entries: { "openwork-server": { version: "1.2.3", targets: { "linux-x64": asset } } } })),
  ];
  for (const malformed of cases) {
    const f = await fixture(); f.setManifest(malformed);
    await expect(downloadVerifiedSidecar(f.options)).rejects.toThrow();
    expect(f.calls).toEqual([f.sidecar.manifestUrl]);
    expect(await readdir(f.root)).toEqual([]);
  }
});

test("invalid local pins and insecure or credential-bearing origins are rejected before requests", async () => {
  for (const invalid of ["http://mirror.example/releases", "ftp://mirror.example/releases", "https://user:password@mirror.example/releases", "https://mirror.example/releases#fragment"]) {
    const f = await fixture(); f.sidecar.baseUrl = invalid;
    await expect(downloadVerifiedSidecar(f.options)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  }
  const f = await fixture();
  await expect(downloadVerifiedSidecar({ ...f.options, expectedVersion: "../../outside" })).rejects.toThrow();
  expect(f.calls).toEqual([]);
});

test("operator HTTPS and loopback mirrors work without permitting undeclared asset origins", async () => {
  for (const origin of ["https://operator.example", "http://127.0.0.1:4321", "http://[::1]:4321", "http://localhost:4321"]) {
    const f = await fixture();
    f.sidecar.baseUrl = `${origin}/releases`; f.sidecar.manifestUrl = `${origin}/releases/manifest`;
    expect((await downloadVerifiedSidecar(f.options))?.bin).toBe(f.bin);
  }
  const f = await fixture();
  f.sidecar.manifestUrl = "https://metadata.example/manifest";
  expect((await downloadVerifiedSidecar(f.options))?.bin).toBe(f.bin);
});

test("checksum and size failures never replace existing bytes or publish a partial executable", async () => {
  const f = await fixture();
  await mkdir(f.directory, { recursive: true });
  await writeFile(f.bin, "existing bytes");
  f.setBytes(Buffer.alloc(bytes.length, 1));
  await expect(downloadVerifiedSidecar(f.options)).rejects.toThrow("integrity");
  expect(await readFile(f.bin, "utf8")).toBe("existing bytes");
  expect(await readdir(f.directory)).toEqual(["openwork-server"]);
  f.setBytes(Buffer.from("short"));
  await expect(downloadVerifiedSidecar(f.options)).rejects.toThrow("integrity");
  f.setBytes(Buffer.alloc(bytes.length + 1));
  await expect(downloadVerifiedSidecar(f.options)).rejects.toThrow("oversized");
});

test("symlinked cache directories, symlink files and hardlinks are rejected without changing targets", async () => {
  for (const attack of ["directory", "file", "hardlink"]) {
    const f = await fixture();
    const outside = join(f.root, "outside");
    await mkdir(outside); await writeFile(join(outside, "protected"), "unchanged");
    if (attack === "directory") {
      await mkdir(f.sidecar.dir); await symlink(outside, join(f.sidecar.dir, "verified-v1"));
    } else {
      await mkdir(f.directory, { recursive: true });
      if (attack === "file") await symlink(join(outside, "protected"), f.bin);
      else await link(join(outside, "protected"), f.bin);
    }
    await expect(downloadVerifiedSidecar(f.options)).rejects.toThrow("Unsafe sidecar cache");
    expect(await readFile(join(outside, "protected"), "utf8")).toBe("unchanged");
    expect(f.calls).toEqual([f.sidecar.manifestUrl]);
  }
});

test("redirects are bounded and cannot leave an approved origin or downgrade transport", async () => {
  for (const location of ["https://unapproved.example/asset", "http://mirror.example/asset", "https://user:pass@mirror.example/asset"]) {
    const f = await fixture(); const calls: string[] = [];
    const fetchImpl = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
      calls.push(String(input)); return new Response(null, { status: 302, headers: { location } });
    }, { preconnect() {} });
    await expect(downloadVerifiedSidecar({ ...f.options, fetchImpl })).rejects.toThrow("redirect");
    expect(calls).toEqual([f.sidecar.manifestUrl]);
  }
  const f = await fixture(); let requests = 0;
  const fetchImpl = Object.assign(async () => { requests++; return new Response(null, { status: 302, headers: { location: f.sidecar.manifestUrl } }); }, { preconnect() {} });
  await expect(downloadVerifiedSidecar({ ...f.options, fetchImpl })).rejects.toThrow("redirect");
  expect(requests).toBe(6);
});

test("official GitHub release redirect accepts only its exact CDN origin and release path", async () => {
  for (const cdn of ["https://release-assets.githubusercontent.com", "https://release-assets.githubusercontent.com.evil.example", "https://github.com/different-ai/openwork/releases/download/v1"]) {
    const f = await fixture();
    f.sidecar.baseUrl = "https://github.com/matterhornso/matterhorn-work/releases/download/openwork-orchestrator-v1.2.3";
    f.sidecar.manifestUrl = `${f.sidecar.baseUrl}/manifest.json`;
    const calls: string[] = [];
    const fetchImpl = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input); calls.push(url);
      if (url === f.sidecar.manifestUrl) return new Response(null, { status: 302, headers: { location: `${cdn}/manifest.json?signature=synthetic` } });
      return url.includes("manifest.json") ? Response.json(f.manifest) : new Response(bytes);
    }, { preconnect() {} });
    if (cdn === "https://release-assets.githubusercontent.com") expect((await downloadVerifiedSidecar({ ...f.options, fetchImpl }))?.bin).toBe(f.bin);
    else { await expect(downloadVerifiedSidecar({ ...f.options, fetchImpl })).rejects.toThrow("redirect"); expect(calls.length).toBe(1); }
  }
});

test("official manifest and binary CDN redirects preserve digest checks and fixed executable names", async () => {
  const f = await fixture();
  f.sidecar.baseUrl = "https://github.com/matterhornso/matterhorn-work/releases/download/openwork-orchestrator-v1.2.3";
  f.sidecar.manifestUrl = `${f.sidecar.baseUrl}/manifest.json`;
  const calls: string[] = [];
  const fetchImpl = Object.assign(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input); calls.push(url);
    expect(init?.redirect).toBe("manual");
    if (url.startsWith(f.sidecar.baseUrl)) return new Response(null, { status: 302, headers: {
      location: url.endsWith("manifest.json") ? "https://release-assets.githubusercontent.com/manifest" : "https://release-assets.githubusercontent.com/binary?signature=synthetic",
    } });
    return url.endsWith("/manifest") ? Response.json(f.manifest) : new Response(bytes);
  }, { preconnect() {} });
  expect((await downloadVerifiedSidecar({ ...f.options, fetchImpl }))?.bin).toBe(f.bin);
  expect(calls.length).toBe(4);
  expect(await readFile(f.bin)).toEqual(bytes);
});

test("an explicitly configured CDN can serve an absolute signed asset URL", async () => {
  const f = await fixture();
  f.sidecar.baseUrl = "https://cdn.example/sidecars";
  f.setManifest({ entries: { "openwork-server": { version: "1.2.3", targets: { "linux-x64": {
    url: "https://cdn.example/sidecars/binary?signature=synthetic", sha256: digest,
  } } } } });
  expect((await downloadVerifiedSidecar(f.options))?.bin).toBe(f.bin);
  expect(f.calls).toEqual([f.sidecar.manifestUrl, "https://cdn.example/sidecars/binary?signature=synthetic"]);
});

test("cache directory replacement during download is rejected before publishing bytes", async () => {
  const f = await fixture(); const outside = join(f.root, "outside"); await mkdir(outside);
  const fetchImpl = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
    if (String(input) === f.sidecar.manifestUrl) return Response.json(f.manifest);
    await rm(f.directory, { recursive: true });
    await symlink(outside, f.directory);
    return new Response(bytes);
  }, { preconnect() {} });
  await expect(downloadVerifiedSidecar({ ...f.options, fetchImpl })).rejects.toThrow("Unsafe sidecar cache directory");
  expect(await readdir(outside)).toEqual([]);
});

test("binary redirect rejection preserves cached bytes and does not fall back", async () => {
  const f = await fixture(); await mkdir(f.directory, { recursive: true }); await writeFile(f.bin, "existing cache");
  let calls = 0;
  const fetchImpl = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
    calls++;
    return String(input) === f.sidecar.manifestUrl ? Response.json(f.manifest)
      : new Response(null, { status: 302, headers: { location: "https://unapproved.example/binary" } });
  }, { preconnect() {} });
  await expect(downloadVerifiedSidecar({ ...f.options, fetchImpl })).rejects.toThrow("redirect");
  expect(calls).toBe(2);
  expect(await readFile(f.bin, "utf8")).toBe("existing cache");
});

test("oversized or invalid manifest content fails closed, absent optional entries allow verified fallback", async () => {
  for (const response of [new Response("not JSON"), new Response(" ".repeat(1024 * 1024 + 1)), new Response("{}", { headers: { "content-length": "1048577" } }), new Response("", { status: 500 })]) {
    const f = await fixture();
    const fetchImpl = Object.assign(async () => response, { preconnect() {} });
    await expect(downloadVerifiedSidecar({ ...f.options, fetchImpl })).rejects.toThrow();
    expect(await readdir(f.root)).toEqual([]);
  }
  const f = await fixture(); f.setManifest({ entries: {} });
  expect(await downloadVerifiedSidecar(f.options)).toBeNull();
  const fetchImpl = Object.assign(async () => new Response(null, { status: 404 }), { preconnect() {} });
  expect(await downloadVerifiedSidecar({ ...f.options, fetchImpl })).toBeNull();
});

test("CLI integration pins every downloaded sidecar and compiles server/router version constants", async () => {
  const cli = await readFile(new URL("../src/cli.ts", import.meta.url), "utf8");
  const calls = [...cli.matchAll(/downloadSidecarBinary\(\{([\s\S]*?)\}\)/g)];
  expect(calls.length).toBe(4);
  for (const call of calls) expect(call[1]).toContain("expectedVersion");
  expect(cli).not.toContain("fetchRemoteManifest");
  expect(cli).toContain("A locally pinned version is required");
  const build = await readFile(new URL("../script/build.ts", import.meta.url), "utf8");
  expect(build).toContain("__OPENWORK_PINNED_SERVER_VERSION__");
  expect(build).toContain("__OPENWORK_PINNED_ROUTER_VERSION__");
});
