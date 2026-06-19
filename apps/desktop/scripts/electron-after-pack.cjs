const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const Module = require("node:module");

const computerUseHelperAppName = "OpenWork Computer Use.app";

const sidecarBases = [
  "opencode",
  "openwork-server",
  "openwork-orchestrator",
  "chrome-devtools-mcp",
];

function loadAsar() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const loaded = originalLoad.apply(this, [request, parent, isMain]);
    if (request === "minimatch" && loaded && typeof loaded !== "function" && typeof loaded.minimatch === "function") {
      return loaded.minimatch;
    }
    return loaded;
  };
  try {
    return require("asar");
  } finally {
    Module._load = originalLoad;
  }
}

function targetTriple(platformName, arch) {
  if (platformName === "darwin") {
    if (arch === "arm64") return "aarch64-apple-darwin";
    if (arch === "x64") return "x86_64-apple-darwin";
  }
  if (platformName === "linux") {
    if (arch === "arm64") return "aarch64-unknown-linux-gnu";
    if (arch === "x64") return "x86_64-unknown-linux-gnu";
  }
  if (platformName === "win32") {
    if (arch === "arm64") return "aarch64-pc-windows-msvc";
    if (arch === "x64") return "x86_64-pc-windows-msvc";
  }
  return null;
}

function resolveSidecarsDir(context) {
  if (context.electronPlatformName === "darwin") {
    const entries = fs.existsSync(context.appOutDir) ? fs.readdirSync(context.appOutDir) : [];
    const appName = entries.find((entry) => entry.endsWith(".app"));
    return appName ? path.join(context.appOutDir, appName, "Contents", "Resources", "sidecars") : null;
  }
  return path.join(context.appOutDir, "resources", "sidecars");
}

function resolveMacAppPath(context) {
  if (context.electronPlatformName !== "darwin") return null;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const direct = path.join(context.appOutDir, appName);
  if (fs.existsSync(direct)) return direct;

  const entries = fs.existsSync(context.appOutDir) ? fs.readdirSync(context.appOutDir) : [];
  const fallback = entries.find((entry) => entry.endsWith(".app"));
  return fallback ? path.join(context.appOutDir, fallback) : null;
}

function resolveResourcesDir(context) {
  if (context.electronPlatformName === "darwin") {
    const appPath = resolveMacAppPath(context);
    return appPath ? path.join(appPath, "Contents", "Resources") : null;
  }
  return path.join(context.appOutDir, "resources");
}

function updateMacAsarIntegrity(context, asarPath) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = resolveMacAppPath(context);
  if (!appPath) return;
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  if (!fs.existsSync(infoPlistPath)) return;

  const hash = crypto.createHash("sha256").update(fs.readFileSync(asarPath)).digest("hex");
  const result = spawnSync("/usr/libexec/PlistBuddy", [
    "-c",
    `Set :ElectronAsarIntegrity:Resources/app.asar:hash ${hash}`,
    infoPlistPath,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not update ElectronAsarIntegrity for ${asarPath}`);
  }
}

function archiveHasEntry(archiveEntries, requiredArchivePath) {
  const normalized = requiredArchivePath.replace(/^\/+/, "");
  return archiveEntries.has(normalized) || archiveEntries.has(`/${normalized}`);
}

function assertArchiveHasEntries(asar, asarPath, requiredArchivePaths) {
  const archiveEntries = new Set(asar.listPackage(asarPath));
  for (const requiredArchivePath of requiredArchivePaths) {
    if (archiveHasEntry(archiveEntries, requiredArchivePath)) continue;

    const basename = path.basename(requiredArchivePath);
    const nearbyEntries = [...archiveEntries]
      .filter((entry) => entry.endsWith(`/${basename}`) || entry.endsWith(basename))
      .slice(0, 5);
    throw new Error(
      `Packaged app.asar is missing ${requiredArchivePath}; nearby entries: ${nearbyEntries.join(", ") || "none"}`,
    );
  }
}

async function waitForArchiveEntries(asar, asarPath, requiredArchivePaths) {
  let lastError = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertArchiveHasEntries(asar, asarPath, requiredArchivePaths);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw lastError;
}

async function repairPackagedAppAsar(context) {
  const asar = loadAsar();
  const resourcesDir = resolveResourcesDir(context);
  if (!resourcesDir) return;

  const asarPath = path.join(resourcesDir, "app.asar");
  if (!fs.existsSync(asarPath)) {
    throw new Error(`Missing packaged app.asar at ${asarPath}`);
  }

  const desktopRoot = path.resolve(__dirname, "..");
  const electronSource = path.join(desktopRoot, "electron");
  const serverSource = path.join(desktopRoot, "server");
  const packageSource = path.join(desktopRoot, "package.json");
  for (const requiredPath of [electronSource, serverSource, packageSource]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(`Missing Electron package source required for app.asar: ${requiredPath}`);
    }
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "matterhorn-app-asar-"));
  try {
    asar.extractAll(asarPath, tempDir);
    asar.uncache(asarPath);
    fs.rmSync(path.join(tempDir, "electron"), { recursive: true, force: true });
    fs.rmSync(path.join(tempDir, "server"), { recursive: true, force: true });
    fs.cpSync(electronSource, path.join(tempDir, "electron"), { recursive: true });
    fs.cpSync(serverSource, path.join(tempDir, "server"), { recursive: true });
    fs.copyFileSync(packageSource, path.join(tempDir, "package.json"));

    fs.rmSync(asarPath, { force: true });
    fs.rmSync(`${asarPath}.unpacked`, { recursive: true, force: true });
    await asar.createPackageWithOptions(tempDir, asarPath, { unpack: "**/*.node" });
    asar.uncache(asarPath);

    await waitForArchiveEntries(asar, asarPath, ["electron/main.mjs", "server/dist/server.js"]);
    updateMacAsarIntegrity(context, asarPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function signComputerUseHelper(context) {
  const appPath = resolveMacAppPath(context);
  if (!appPath) return;

  const helperPath = path.join(appPath, "Contents", "Resources", "helpers", computerUseHelperAppName);
  if (!fs.existsSync(helperPath)) {
    throw new Error(`Missing Computer Use helper app at ${helperPath}`);
  }

  const identity = process.env.OPENWORK_COMPUTER_USE_CODESIGN_IDENTITY
    || process.env.CSC_NAME
    || process.env.APPLE_CODESIGN_IDENTITY
    || "-";
  const args = ["--force", "--deep", "--options", "runtime", "--sign", identity];
  if (identity !== "-") args.push("--timestamp");
  args.push(helperPath);

  const result = spawnSync("codesign", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`codesign failed for Computer Use helper app with status ${result.status}`);
  }
}

function copyExecutableTargetToAlias(sidecarsDir, targetName, aliasName) {
  const targetPath = path.join(sidecarsDir, targetName);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing packaged sidecar for target: ${targetName}`);
  }

  const aliasPath = path.join(sidecarsDir, aliasName);
  fs.copyFileSync(targetPath, aliasPath);
  try {
    fs.chmodSync(aliasPath, 0o755);
  } catch {
    // Windows and some filesystems may ignore chmod.
  }
}

async function afterPack(context) {
  await repairPackagedAppAsar(context);

  const triple = targetTriple(context.electronPlatformName, context.arch);
  if (!triple) return;

  const sidecarsDir = resolveSidecarsDir(context);
  if (!sidecarsDir || !fs.existsSync(sidecarsDir)) return;

  const isWindows = context.electronPlatformName === "win32";
  const executableSuffix = isWindows ? ".exe" : "";
  const keep = new Set();

  for (const base of sidecarBases) {
    const aliasName = `${base}${executableSuffix}`;
    const targetName = `${base}-${triple}${executableSuffix}`;
    copyExecutableTargetToAlias(sidecarsDir, targetName, aliasName);
    keep.add(aliasName);
    keep.add(targetName);
  }

  const versionsAlias = "versions.json";
  const versionsTarget = `versions.json-${triple}${executableSuffix}`;
  const versionsTargetPath = path.join(sidecarsDir, versionsTarget);
  if (!fs.existsSync(versionsTargetPath)) {
    throw new Error(`Missing packaged sidecar metadata for target: ${versionsTarget}`);
  }
  fs.copyFileSync(versionsTargetPath, path.join(sidecarsDir, versionsAlias));
  keep.add(versionsAlias);
  keep.add(versionsTarget);

  for (const entry of fs.readdirSync(sidecarsDir)) {
    if (!keep.has(entry)) {
      fs.rmSync(path.join(sidecarsDir, entry), { force: true, recursive: true });
    }
  }

  signComputerUseHelper(context);
}

module.exports = afterPack;
module.exports.default = afterPack;
