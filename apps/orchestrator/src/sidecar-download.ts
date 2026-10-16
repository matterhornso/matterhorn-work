import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

export type SidecarName = "openwork-server" | "opencode-router" | "opencode";
export type SidecarTarget = "darwin-arm64" | "darwin-x64" | "linux-x64" | "linux-arm64" | "windows-x64" | "windows-arm64";
export type SidecarConfig = {
  dir: string;
  baseUrl: string;
  manifestUrl: string;
  releaseVersion: string;
  target: SidecarTarget | null;
};

const MAX_MANIFEST_BYTES = 1024 * 1024;
export const MAX_BINARY_BYTES = 512 * 1024 * 1024;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const GITHUB_RELEASE_PATHS = ["/matterhornso/matterhorn-work/releases/download/", "/anomalyco/opencode/releases/download/"];

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function checkedVersion(value: string): string {
  if (value.length > 100 || !VERSION.test(value)) throw new Error("Invalid pinned sidecar version");
  return value;
}

function checkedUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid sidecar URL"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password || url.hash) {
    throw new Error("Sidecars require HTTPS or loopback HTTP without URL credentials or fragments");
  }
  return url;
}

function withinBase(url: URL, base: URL): boolean {
  const prefix = `${base.pathname.replace(/\/$/, "")}/`;
  return url.origin === base.origin && url.pathname.startsWith(prefix);
}

function isOfficialRelease(url: URL): boolean {
  return url.origin === "https://github.com" && GITHUB_RELEASE_PATHS.some(path => url.pathname.startsWith(path));
}

export async function fetchSidecar(url: URL, fetchImpl: typeof fetch): Promise<Response> {
  const initial = url;
  const signal = AbortSignal.timeout(120_000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    let response: Response;
    try { response = await fetchImpl(url.href, { redirect: "manual", signal }); }
    catch { throw new Error("Sidecar request failed"); }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location || redirects === 5) throw new Error("Invalid sidecar redirect");
    let next: URL;
    try { next = checkedUrl(new URL(location, url).href); } catch { throw new Error("Invalid sidecar redirect"); }
    const sameOrigin = next.origin === initial.origin
      && (!isOfficialRelease(initial) || next.pathname.startsWith(initial.pathname.slice(0, initial.pathname.lastIndexOf("/") + 1)));
    const officialCdn = isOfficialRelease(initial)
      && next.origin === "https://release-assets.githubusercontent.com";
    if (!sameOrigin && !officialCdn) throw new Error("Untrusted sidecar redirect origin");
    url = next;
  }
  throw new Error("Too many sidecar redirects");
}

export async function boundedBytes(response: Response, limit: number): Promise<Buffer> {
  const size = response.headers.get("content-length");
  if (size !== null && (!/^\d+$/.test(size) || Number(size) > limit)) {
    await response.body?.cancel();
    throw new Error("Sidecar response exceeds size limit");
  }
  if (!response.body) throw new Error("Empty sidecar response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error("Sidecar response exceeds size limit");
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => {});
    throw new Error("Invalid or oversized sidecar response");
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

function selectAsset(manifest: unknown, name: SidecarName, target: SidecarTarget, expectedVersion: string, base: URL) {
  if (!record(manifest) || !record(manifest.entries)) throw new Error("Invalid sidecar manifest");
  const entry = manifest.entries[name];
  // Official manifests may omit an optional sidecar/platform; callers retain
  // their separately verified fallback. Invalid entries never use that fallback.
  if (entry === undefined) return null;
  if (!record(entry) || entry.version !== expectedVersion || !record(entry.targets)) throw new Error("Sidecar manifest version or entry mismatch");
  const asset = entry.targets[target];
  if (asset === undefined) return null;
  if (!record(asset) || typeof asset.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(asset.sha256)) throw new Error("Sidecar requires an exact SHA-256 digest");
  if (asset.size !== undefined && (typeof asset.size !== "number" || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_BINARY_BYTES)) throw new Error("Invalid sidecar asset size");
  if (asset.asset !== undefined && (typeof asset.asset !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(asset.asset) || asset.asset.includes(".."))) throw new Error("Invalid sidecar asset name");
  if (asset.url !== undefined && typeof asset.url !== "string") throw new Error("Invalid sidecar asset URL");
  const url = typeof asset.url === "string"
    ? checkedUrl(asset.url)
    : typeof asset.asset === "string"
      ? checkedUrl(`${base.href.replace(/\/$/, "")}/${asset.asset}`)
      : null;
  if (!url || !withinBase(url, base) || /%2f|%5c|%2e|%00/i.test(url.pathname)) throw new Error("Sidecar asset is outside the configured download base");
  return { url, sha256: asset.sha256.toLowerCase(), size: typeof asset.size === "number" ? asset.size : undefined };
}

function trustedCacheOwner(info: { uid: number; mode: number }): boolean {
  return process.platform === "win32" || (typeof process.getuid === "function"
    && info.uid === process.getuid() && (info.mode & 0o022) === 0);
}

export async function cacheDirectory(config: SidecarConfig, name: SidecarName, version: string, target: SidecarTarget): Promise<string> {
  // The operator chooses the root. All descendants are locally determined and
  // symlink-free; legacy remote-named caches are never executed or removed.
  await mkdir(resolve(config.dir), { recursive: true, mode: 0o700 });
  let directory = await realpath(resolve(config.dir));
  const rootInfo = await lstat(directory);
  if (!rootInfo.isDirectory() || !trustedCacheOwner(rootInfo)) throw new Error("Unsafe sidecar cache directory ownership or permissions");
  for (const component of ["verified-v1", checkedVersion(config.releaseVersion), name, checkedVersion(version), target]) {
    directory = join(directory, component);
    await mkdir(directory, { mode: 0o700 }).catch(error => {
      if (!record(error) || error.code !== "EEXIST") throw error;
    });
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !info.isDirectory() || !trustedCacheOwner(info)) throw new Error("Unsafe sidecar cache directory");
  }
  return directory;
}

async function assertCacheFile(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || !trustedCacheOwner(info)) throw new Error("Unsafe sidecar cache file");
    return true;
  } catch (error) {
    if (record(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

export async function readCacheBytes(path: string): Promise<Buffer | null> {
  if (!await assertCacheFile(path)) return null;
  const cached = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await cached.stat();
    if (!info.isFile() || info.nlink !== 1 || !trustedCacheOwner(info) || info.size > MAX_BINARY_BYTES) throw new Error("Unsafe sidecar cache file");
    return await cached.readFile();
  } finally { await cached.close(); }
}

export async function publishCacheBytes(options: {
  sidecar: SidecarConfig; name: SidecarName; version: string; target: SidecarTarget;
  directory: string; filename: string; bytes: Buffer; executable: boolean;
}): Promise<string> {
  const { sidecar, name, version, target, directory, filename, bytes, executable } = options;
  if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename === "." || filename === "..") throw new Error("Invalid local cache filename");
  const destination = join(directory, filename);
  const temporary = join(directory, `.download-${randomUUID()}`);
  try {
    if (await cacheDirectory(sidecar, name, version, target) !== directory) throw new Error("Sidecar cache root changed");
    await assertCacheFile(destination);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.chmod(executable ? 0o700 : 0o600);
    } finally { await handle.close(); }
    await assertCacheFile(destination);
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
  return destination;
}

export async function downloadVerifiedSidecar(options: {
  name: SidecarName;
  sidecar: SidecarConfig;
  expectedVersion: string;
  fetchImpl?: typeof fetch;
}): Promise<{ bin: string; source: "downloaded"; expectedVersion: string } | null> {
  const { name, sidecar } = options;
  if (!sidecar.target) return null;
  const target = sidecar.target;
  const expectedVersion = checkedVersion(options.expectedVersion);
  checkedVersion(sidecar.releaseVersion);
  const base = checkedUrl(sidecar.baseUrl);
  if (base.search) throw new Error("Sidecar download base must not contain a query");
  const manifestUrl = checkedUrl(sidecar.manifestUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchSidecar(manifestUrl, fetchImpl);
  if (response.status === 404) { await response.body?.cancel(); return null; }
  if (!response.ok) { await response.body?.cancel(); throw new Error("Sidecar manifest request failed"); }
  let manifest: unknown;
  try { manifest = JSON.parse((await boundedBytes(response, MAX_MANIFEST_BYTES)).toString("utf8")); }
  catch { throw new Error("Invalid sidecar manifest response"); }
  const asset = selectAsset(manifest, name, target, expectedVersion, base);
  if (!asset) return null;
  const directory = await cacheDirectory(sidecar, name, expectedVersion, target);
  const bin = join(directory, target.startsWith("windows-") ? `${name}.exe` : name);
  const cached = await readCacheBytes(bin);
  if (cached && createHash("sha256").update(cached).digest("hex") === asset.sha256
      && (asset.size === undefined || cached.length === asset.size)) {
    // Republish verified bytes so a legacy non-executable mode is repaired without
    // following a pathname while changing permissions.
    await publishCacheBytes({ sidecar, name, version: expectedVersion, target, directory, filename: target.startsWith("windows-") ? `${name}.exe` : name, bytes: cached, executable: true });
    return { bin, source: "downloaded", expectedVersion };
  }
  const binary = await fetchSidecar(asset.url, fetchImpl);
  if (!binary.ok) { await binary.body?.cancel(); throw new Error("Sidecar binary request failed"); }
  const bytes = await boundedBytes(binary, asset.size ?? MAX_BINARY_BYTES);
  if ((asset.size !== undefined && bytes.length !== asset.size) || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("Sidecar integrity check failed");
  await publishCacheBytes({ sidecar, name, version: expectedVersion, target, directory, filename: target.startsWith("windows-") ? `${name}.exe` : name, bytes, executable: true });
  return { bin, source: "downloaded", expectedVersion };
}
