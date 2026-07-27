import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const packagePath = resolve(repoRoot, "packages", "handsfree", "native", "HandsFree");
const iconPath = resolve(desktopRoot, "resources", "icons", "icon.icns");
const productName = "HandsFreeComputerUse";
const helperExecutableName = "ComputerUse";
const helperAppName = "Matterhorn Desks Automation Helper.app";
const legacyHelperAppName = "OpenWork Computer Use.app";
const bundleIdentifier = "com.matterhorn.desks.computer-use";

const readArg = (name) => {
  const raw = process.argv.slice(2);
  const direct = raw.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = raw.indexOf(name);
  if (index >= 0 && raw[index + 1]) return raw[index + 1];
  return null;
};

const hasFlag = (name) => process.argv.slice(2).includes(name);
const outDir = resolve(readArg("--outdir") ?? join(desktopRoot, "resources", "helpers"));
const force = hasFlag("--force") || process.env.MATTERHORN_WORK_AUTOMATION_HELPER_FORCE_BUILD === "1" || process.env.OPENWORK_COMPUTER_USE_FORCE_BUILD === "1";
const appPath = join(outDir, helperAppName);
const legacyAppPath = join(outDir, legacyHelperAppName);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(`${command} ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
  return result;
}

function signHelperApp() {
  if (process.platform !== "darwin") return;
  const cleanup = spawnSync("xattr", ["-cr", appPath], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (cleanup.error) {
    if (cleanup.error.code === "ENOENT") {
      throw new Error("xattr is required to prepare the Matterhorn Desks automation helper app");
    }
    throw cleanup.error;
  }
  if (cleanup.status !== 0) {
    throw new Error(`Failed to clear extended attributes from ${appPath}: ${cleanup.stderr?.trim() ?? "unknown error"}`);
  }
  const result = spawnSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error("codesign is required to prepare the Matterhorn Desks automation helper app");
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Failed to codesign ${appPath}: ${result.stderr?.trim() ?? "unknown error"}`);
  }
}

function verifyHelperAppForPackaging() {
  if (process.platform !== "darwin") return;

  // This project can live in a File Provider-managed folder. Stage with the same
  // Node copy primitive used by afterPack so Finder metadata cannot invalidate
  // the helper's signature in the packaged application.
  const stagingRoot = mkdtempSync(join(tmpdir(), "matterhorn-desks-helper-verify-"));
  const stagedAppPath = join(stagingRoot, helperAppName);
  try {
    cpSync(appPath, stagedAppPath, { recursive: true });
    const result = spawnSync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", stagedAppPath], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`Prepared Matterhorn Desks automation helper did not verify: ${result.stderr?.trim() ?? "unknown error"}`);
    }
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function infoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>Matterhorn Desks Automation Helper</string>
  <key>CFBundleExecutable</key>
  <string>${helperExecutableName}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleIdentifier}</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Matterhorn Desks Automation Helper</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
</dict>
</plist>
`;
}

function helperIdentityNeedsRefresh() {
  const infoPath = join(appPath, "Contents", "Info.plist");
  try {
    const existing = readFileSync(infoPath, "utf8");
    return !existing.includes(`<string>${bundleIdentifier}</string>`) ||
      !existing.includes("<string>Matterhorn Desks Automation Helper</string>") ||
      !existing.includes("<string>NSApplication</string>") ||
      !existing.includes("<key>NSHighResolutionCapable</key>");
  } catch {
    return true;
  }
}

function refreshPreparedHelperIdentity() {
  mkdirSync(join(appPath, "Contents", "MacOS"), { recursive: true });
  mkdirSync(join(appPath, "Contents", "Resources"), { recursive: true });
  writeFileSync(join(appPath, "Contents", "Info.plist"), infoPlist(), "utf8");
  writeFileSync(join(appPath, "Contents", "PkgInfo"), "APPL????", "utf8");
  if (existsSync(iconPath)) {
    copyFileSync(iconPath, join(appPath, "Contents", "Resources", "AppIcon.icns"));
  }
  chmodSync(join(appPath, "Contents", "MacOS", helperExecutableName), 0o755);
  signHelperApp();
  verifyHelperAppForPackaging();
}

if (process.platform !== "darwin") {
  process.stdout.write(JSON.stringify({ ok: true, skipped: true, reason: "computer-use-helper-is-macos-only" }, null, 2) + "\n");
  process.exit(0);
}

rmSync(legacyAppPath, { recursive: true, force: true });

if (!force && existsSync(join(appPath, "Contents", "MacOS", helperExecutableName))) {
  if (helperIdentityNeedsRefresh()) {
    refreshPreparedHelperIdentity();
    process.stdout.write(JSON.stringify({ ok: true, refreshed: true, appPath }, null, 2) + "\n");
    process.exit(0);
  }
  verifyHelperAppForPackaging();
  process.stdout.write(JSON.stringify({ ok: true, skipped: true, appPath }, null, 2) + "\n");
  process.exit(0);
}

run("swift", ["build", "--package-path", packagePath, "-c", "release", "--product", productName], { stdio: "inherit" });
const binPathResult = run("swift", ["build", "--package-path", packagePath, "-c", "release", "--show-bin-path"]);
const binDir = binPathResult.stdout.trim();
const builtExecutable = join(binDir, productName);
if (!existsSync(builtExecutable)) {
  throw new Error(`Swift build succeeded, but ${builtExecutable} was not found`);
}

rmSync(appPath, { recursive: true, force: true });
mkdirSync(join(appPath, "Contents", "MacOS"), { recursive: true });
mkdirSync(join(appPath, "Contents", "Resources"), { recursive: true });
writeFileSync(join(appPath, "Contents", "Info.plist"), infoPlist(), "utf8");
writeFileSync(join(appPath, "Contents", "PkgInfo"), "APPL????", "utf8");
copyFileSync(builtExecutable, join(appPath, "Contents", "MacOS", helperExecutableName));
if (existsSync(iconPath)) {
  copyFileSync(iconPath, join(appPath, "Contents", "Resources", "AppIcon.icns"));
}
chmodSync(join(appPath, "Contents", "MacOS", helperExecutableName), 0o755);
signHelperApp();
verifyHelperAppForPackaging();

process.stdout.write(JSON.stringify({ ok: true, appPath, executable: join(appPath, "Contents", "MacOS", helperExecutableName) }, null, 2) + "\n");
