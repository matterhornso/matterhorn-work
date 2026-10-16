import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  boundedBytes, cacheDirectory, checkedVersion, downloadVerifiedSidecar, fetchSidecar, MAX_BINARY_BYTES,
  publishCacheBytes, readCacheBytes, record, type SidecarConfig, type SidecarTarget,
} from "./sidecar-download.js";

const RELEASE_API = "https://api.github.com/repos/anomalyco/opencode/releases/tags/";
const RELEASE_DOWNLOAD = "https://github.com/anomalyco/opencode/releases/download/";
const ASSETS: Record<SidecarTarget, string> = {
  "darwin-arm64": "opencode-darwin-arm64.zip",
  "darwin-x64": "opencode-darwin-x64-baseline.zip",
  "linux-x64": "opencode-linux-x64-baseline.tar.gz",
  "linux-arm64": "opencode-linux-arm64.tar.gz",
  "windows-x64": "opencode-windows-x64-baseline.zip",
  "windows-arm64": "opencode-windows-arm64.zip",
};
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

async function releaseDigest(version: string, assetName: string, fetchImpl: typeof fetch) {
  const tag = `v${version}`;
  const url = new URL(`${RELEASE_DOWNLOAD}${encodeURIComponent(tag)}/${assetName}`);
  let response: Response;
  try {
    response = await fetchImpl(`${RELEASE_API}${encodeURIComponent(tag)}`, {
      redirect: "error", signal: AbortSignal.timeout(120_000),
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Matterhorn-Desks", "X-GitHub-Api-Version": "2022-11-28" },
    });
  } catch { throw new Error("Unable to verify the pinned OpenCode release"); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Unable to verify the pinned OpenCode release");
  }
  let release: unknown;
  try { release = JSON.parse((await boundedBytes(response, 1024 * 1024)).toString("utf8")); }
  catch { throw new Error("Invalid OpenCode release metadata"); }
  if (!record(release) || release.tag_name !== tag || !Array.isArray(release.assets)) throw new Error("Invalid OpenCode release metadata");
  const assets = release.assets.filter((candidate: unknown) => record(candidate) && candidate.name === assetName);
  const asset: unknown = assets[0];
  if (assets.length !== 1 || !record(asset) || asset.browser_download_url !== url.href
    || typeof asset.digest !== "string" || !/^sha256:[a-fA-F0-9]{64}$/.test(asset.digest)
    || typeof asset.size !== "number" || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_BINARY_BYTES) {
    throw new Error("Pinned OpenCode asset requires an official URL, size and SHA-256 digest; no legacy cache fallback is allowed");
  }
  return { url, digest: asset.digest.slice(7).toLowerCase(), size: asset.size };
}

function captureArchive(command: string, args: string[], limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Archive-tool option environment variables must not change extraction mode.
    execFile(command, args, {
      encoding: "buffer", maxBuffer: limit, timeout: 120_000, killSignal: "SIGKILL", windowsHide: true,
      env: { ...process.env, TAR_OPTIONS: "", UNZIP: "", UNZIPOPT: "", ZIPINFO: "", ZIPINFOOPT: "" },
    }, (error, stdout) => {
      if (error) reject(new Error("Unable to read the verified OpenCode archive"));
      else resolve(stdout);
    });
  });
}

function archiveEntry(listing: Buffer, target: SidecarTarget): string {
  const text = listing.toString("utf8");
  if (!Buffer.from(text).equals(listing)) throw new Error("Invalid OpenCode archive listing");
  const entries = text.split(/\r?\n/).filter(Boolean);
  const expected = target.startsWith("windows-") ? "opencode.exe" : "opencode";
  for (const entry of entries) {
    // Restrict names before passing one to native tools (including their pattern
    // matchers). No archive entry is ever used as a local output path.
    if (!/^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/.test(entry) || entry.startsWith("/") || entry.split("/").includes("..")) {
      throw new Error("Unsupported OpenCode archive entry name");
    }
  }
  const candidates = entries.filter(entry => entry.split("/").at(-1) === expected);
  if (candidates.length !== 1) throw new Error("OpenCode archive must contain exactly one selected executable");
  return candidates[0];
}

const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function executableBytes(archive: Buffer, assetName: string, directory: string, target: SidecarTarget): Promise<Buffer> {
  const temporary = await mkdtemp(join(directory, ".archive-"));
  const archivePath = join(temporary, assetName.endsWith(".zip") ? "release.zip" : "release.tar.gz");
  try {
    await writeFile(archivePath, archive, { flag: "wx", mode: 0o600 });
    const windowsZip = process.platform === "win32" && assetName.endsWith(".zip");
    const powershell = (body: string) => ["-NoProfile", "-NonInteractive", "-Command",
      `$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [IO.Compression.ZipFile]::OpenRead(${psQuote(archivePath)}); try { ${body} } finally { $zip.Dispose() }`];
    const listing = windowsZip
      ? await captureArchive("powershell", powershell("[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); $zip.Entries | ForEach-Object { [Console]::WriteLine($_.FullName) }"), 8 * 1024 * 1024)
      : assetName.endsWith(".zip")
        ? await captureArchive("unzip", ["-Z1", archivePath], 8 * 1024 * 1024)
        : await captureArchive("tar", ["-tzf", archivePath], 8 * 1024 * 1024);
    const entry = archiveEntry(listing, target);
    if (!assetName.endsWith(".zip")) {
      const details = (await captureArchive("tar", ["-tvzf", archivePath, "--", entry], 8 * 1024 * 1024)).toString("utf8").trim().split(/\r?\n/);
      if (details.length !== 1 || !details[0].startsWith("-")) throw new Error("OpenCode archive executable must be a regular file");
    } else if (!windowsZip) {
      const details = (await captureArchive("unzip", ["-Z", "-l", archivePath, entry], 8 * 1024 * 1024)).toString("utf8").split(/\r?\n/);
      const entries = details.filter(line => /^[dlcbps-][rwxstST?\-]{9}\s/.test(line));
      if (entries.length !== 1 || !entries[0].startsWith("-")) throw new Error("OpenCode archive executable must be a regular file");
    }
    // Stream only the selected entry to memory. Never unpack an archive tree or
    // follow its symlinks/hardlinks onto the host filesystem.
    const bytes = windowsZip
      ? await captureArchive("powershell", powershell(`$entry = $zip.GetEntry(${psQuote(entry)}); $kind = ($entry.ExternalAttributes -shr 16) -band 61440; if (($kind -ne 0 -and $kind -ne 32768) -or $entry.Length -gt ${MAX_BINARY_BYTES}) { throw 'Invalid entry' }; $inputStream = $entry.Open(); try { $inputStream.CopyTo([Console]::OpenStandardOutput()) } finally { $inputStream.Dispose() }`), MAX_BINARY_BYTES)
      : assetName.endsWith(".zip")
        ? await captureArchive("unzip", ["-p", archivePath, entry], MAX_BINARY_BYTES)
        : await captureArchive("tar", ["-xOzf", archivePath, "--", entry], MAX_BINARY_BYTES);
    if (!bytes.length || bytes.length > MAX_BINARY_BYTES) throw new Error("Invalid OpenCode executable size");
    return bytes;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function downloadVerifiedOpencode(options: {
  sidecar: SidecarConfig; expectedVersion: string; assetOverride?: string; fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const { sidecar } = options;
  if (!sidecar.target) return null;
  const target = sidecar.target;
  const version = checkedVersion(options.expectedVersion);
  checkedVersion(sidecar.releaseVersion);
  const sidecarBinary = await downloadVerifiedSidecar({ name: "opencode", sidecar, expectedVersion: version, fetchImpl: options.fetchImpl });
  if (sidecarBinary) return sidecarBinary.bin;
  const assetName = options.assetOverride?.trim() || ASSETS[target];
  if (!/^opencode-[A-Za-z0-9._-]+\.(zip|tar\.gz)$/.test(assetName) || assetName.includes("..")) {
    throw new Error("OpenCode asset override must be a flat official release archive name");
  }
  const release = await releaseDigest(version, assetName, options.fetchImpl ?? fetch);
  const directory = await cacheDirectory(sidecar, "opencode", version, target);
  const archiveName = assetName.endsWith(".zip") ? ".opencode-release.zip" : ".opencode-release.tar.gz";
  let archive = await readCacheBytes(join(directory, archiveName));
  if (!archive || archive.length !== release.size || sha256(archive) !== release.digest) {
    const response = await fetchSidecar(release.url, options.fetchImpl ?? fetch);
    if (!response.ok) { await response.body?.cancel(); throw new Error("OpenCode archive request failed"); }
    archive = await boundedBytes(response, release.size);
    if (archive.length !== release.size || sha256(archive) !== release.digest) throw new Error("OpenCode archive integrity check failed");
    await publishCacheBytes({ sidecar, name: "opencode", version, target, directory, filename: archiveName, bytes: archive, executable: false });
  }
  if (await cacheDirectory(sidecar, "opencode", version, target) !== directory) throw new Error("Sidecar cache root changed");
  const bytes = await executableBytes(archive, assetName, directory, target);
  return publishCacheBytes({ sidecar, name: "opencode", version, target, directory,
    filename: target.startsWith("windows-") ? "opencode.exe" : "opencode", bytes, executable: true });
}
