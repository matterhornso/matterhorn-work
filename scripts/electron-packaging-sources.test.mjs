#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs, { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const desktopPackage = JSON.parse(readFileSync("apps/desktop/package.json", "utf8"));
assert.equal(
  desktopPackage.author?.email,
  "updates@matterhorn.so",
  "desktop package metadata should use the public Matterhorn support address",
);
const electronBuilderConfig = readFileSync("apps/desktop/electron-builder.yml", "utf8");
const afterPack = readFileSync("apps/desktop/scripts/electron-after-pack.cjs", "utf8");
const afterSign = readFileSync("apps/desktop/scripts/electron-after-sign.cjs", "utf8");
const desktopMain = readFileSync("apps/desktop/electron/main.mjs", "utf8");
const desktopRuntime = readFileSync("apps/desktop/electron/runtime.mjs", "utf8");
const desktopMigration = readFileSync("apps/desktop/electron/migration.mjs", "utf8");
const desktopUpdater = readFileSync("apps/desktop/electron/updater.mjs", "utf8");
const helperPrep = readFileSync("apps/desktop/scripts/prepare-computer-use-helper.mjs", "utf8");
const computerUsePermissionSetup = readFileSync(
  "packages/handsfree/native/HandsFree/Sources/ComputerUse/PermissionSetupApp.swift",
  "utf8",
);
const electronBuild = readFileSync("apps/desktop/scripts/electron-build.mjs", "utf8");
const electronDev = readFileSync("apps/desktop/scripts/electron-dev.mjs", "utf8");
const sidecarPrep = readFileSync("apps/desktop/scripts/prepare-sidecar.mjs", "utf8");
const uiMcp = readFileSync("packages/matterhorn-work-ui-mcp/index.mjs", "utf8");
const matterhornMcp = readFileSync("packages/matterhorn-work-mcp/index.mjs", "utf8");
const agentBrowserLiveProbe = readFileSync("scripts/agent-browser-live-probe.mjs", "utf8");
const {
  archiveHasEntry,
  assertPackagedRendererUsesRelativeAssets,
} = require("../apps/desktop/scripts/electron-after-pack.cjs");

assert.equal(
  rootPackage.scripts["test:electron-packaging-sources"],
  "node scripts/electron-packaging-sources.test.mjs",
  "package.json should expose the Electron packaging source gate",
);

for (const [dependency, expected] of [
  ["hyperliquid", "^1.7.7"],
  ["viem", "^2.50.4"],
]) {
  assert.equal(
    desktopPackage.dependencies[dependency],
    expected,
    `desktop package should include server runtime dependency ${dependency}`,
  );
}
assert.equal(
  desktopPackage.devDependencies.asar,
  "3.2.0",
  "desktop package should pin the asar helper used to repair app.asar",
);
assert.equal(
  desktopPackage.desktopName,
  "Matterhorn Desks",
  "desktop package should declare the Linux desktop entry name",
);

assert.match(electronBuilderConfig, /afterPack: scripts\/electron-after-pack\.cjs/);
assert.match(electronBuilderConfig, /appId: com\.matterhorn\.desks/);
assert.match(electronBuilderConfig, /schemes:\s*\n\s+- matterhorn-desks/);
assert.match(electronBuilderConfig, /NSAllowsArbitraryLoads: false/);
assert.match(electronBuilderConfig, /NSAllowsLocalNetworking: true/);
assert.match(electronBuilderConfig, /linux:[\s\S]*executableName: matterhorn-desks/);
assert.match(electronBuilderConfig, /linux:[\s\S]*syncDesktopName: true/);
assert.match(electronBuilderConfig, /Matterhorn Desks Automation Helper\.app\/\*\*/);
assert.match(afterPack, /function loadAsar/);
assert.match(afterPack, /loaded\.minimatch/);
assert.match(afterPack, /function resolveResourcesDir/);
assert.match(afterPack, /function assertPackagedRendererUsesRelativeAssets/);
assert.match(afterPack, /OPENWORK_ELECTRON_BUILD=1/);
assert.match(afterPack, /assertPackagedRendererUsesRelativeAssets\(context\)/);
assert.match(afterPack, /function copyComputerUseHelper/);
assert.match(afterPack, /async function repairPackagedAppAsar/);
assert.match(afterPack, /asar\.extractAll/);
assert.match(afterPack, /asar\.uncache\(asarPath\)/);
assert.match(afterPack, /asar\.createPackageWithOptions/);
assert.match(afterPack, /unpack: "\*\*\/\*\.node"/);
assert.match(afterPack, /electron\/main\.mjs/);
assert.match(afterPack, /server\/dist\/server\.js/);
assert.match(afterPack, /ElectronAsarIntegrity:Resources\/app\.asar:hash/);
assert.match(afterPack, /crypto\.createHash\("sha256"\)/);
assert.equal(
  archiveHasEntry(new Set(["\\electron\\main.mjs"]), "electron/main.mjs"),
  true,
  "Windows ASAR entries should use the same normalized path contract as POSIX entries",
);
assert.equal(
  archiveHasEntry(new Set(["/server/dist/server.js"]), "server/dist/server.js"),
  true,
  "leading slashes in ASAR entries should not change archive membership",
);
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matterhorn-relative-renderer-"));
  const resourcesDir = path.join(root, "resources");
  const appDistDir = path.join(resourcesDir, "app-dist");
  fs.mkdirSync(appDistDir, { recursive: true });
  const context = {
    electronPlatformName: "linux",
    appOutDir: root,
  };
  try {
    fs.writeFileSync(
      path.join(appDistDir, "index.html"),
      '<script type="module" src="./assets/app.js"></script><link href="./assets/app.css" rel="stylesheet">',
    );
    assert.doesNotThrow(() => assertPackagedRendererUsesRelativeAssets(context));

    fs.writeFileSync(
      path.join(appDistDir, "index.html"),
      '<script type="module" src="/assets/app.js"></script>',
    );
    assert.throws(
      () => assertPackagedRendererUsesRelativeAssets(context),
      /root-relative asset/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
assert.match(afterPack, /Matterhorn Desks Automation Helper\.app/);
assert.match(afterPack, /fs\.cpSync\(sourcePath, targetPath, \{ recursive: true \}\)/);
assert.match(afterPack, /copyComputerUseHelper\(context\)/);
assert.match(afterSign, /Matterhorn Desks Automation Helper\.app/);
assert.match(desktopMain, /Matterhorn Desks Automation Helper\.app/);
assert.match(helperPrep, /<key>NSPrincipalClass<\/key>\s*<string>NSApplication<\/string>/);
assert.match(helperPrep, /<key>NSHighResolutionCapable<\/key>\s*<true\/>/);
assert.match(helperPrep, /function verifyHelperAppForPackaging/);
assert.match(helperPrep, /cpSync\(appPath, stagedAppPath, \{ recursive: true \}\)/);
assert.match(helperPrep, /codesign", \["--verify", "--deep", "--strict", "--verbose=2", stagedAppPath\]/);
assert.match(helperPrep, /verifyHelperAppForPackaging\(\);\s*process\.stdout\.write\(JSON\.stringify\(\{ ok: true, skipped: true, appPath \}/s);
assert.match(computerUsePermissionSetup, /Return to Matterhorn Desks/);
assert.doesNotMatch(computerUsePermissionSetup, /OpenWork/);
assert.match(desktopMain, /const MATTERHORN_DESKS_APP_IDENTIFIER = "com\.matterhorn\.desks"/);
assert.match(desktopMain, /const MATTERHORN_DESKS_DEV_APP_IDENTIFIER = "com\.matterhorn\.desks\.dev"/);
assert.match(desktopMain, /const DESKTOP_PROTOCOL_SCHEMES = \["matterhorn-desks", "matterhorn-work", "openwork"\]/);
assert.match(desktopMain, /entry\.startsWith\("matterhorn-desks:\/\/"\)/);
assert.match(desktopMain, /const LEGACY_APP_IDENTIFIERS = Object\.freeze/);
assert.match(desktopMain, /USER_DATA_IDENTITY_MIGRATION_MARKER/);
assert.match(desktopMain, /function migrateLegacyUserDataIdentityIfNeeded/);
assert.match(desktopMain, /cpSync\([\s\S]*errorOnExist: false/);
assert.match(desktopMain, /migrateLegacyUserDataIdentityIfNeeded\(\);/);
assert.match(desktopMain, /MATTERHORN_WORK_AUTOMATION_HELPER_BINARY/);
assert.match(desktopMain, /MATTERHORN_WORK_AUTOMATION_HELPER_APP/);
assert.match(desktopMain, /matterhornso\/matterhorn-work\/tree\/dev\/docs/);
assert.match(desktopMain, /const remoteDebugOptIn =/);
assert.match(desktopMain, /MATTERHORN_ENABLE_ELECTRON_REMOTE_DEBUG/);
assert.match(desktopMain, /const remoteDebugOptIn =\s*!app\.isPackaged &&/);
assert.match(desktopMain, /isDevMode \|\|/);
assert.match(desktopMain, /: 0;\s*if \(remoteDebugPort > 0\)/s);
assert.match(desktopMain, /const extraLaunchArgs = !app\.isPackaged/);
assert.match(desktopMain, /ELECTRON_EXTRA_LAUNCH_ARGS/);
assert.match(desktopMain, /navigationHistory\.canGoBack\(\)/);
assert.match(desktopMain, /navigationHistory\.canGoForward\(\)/);
assert.doesNotMatch(desktopMain, /\.webContents\.canGo(?:Back|Forward)\(\)/);
assert.match(desktopMain, /const matterhornToken = input\.matterhornToken \?\? input\.openworkToken \?\? null/);
assert.match(desktopMain, /matterhornWorkspaceId = input\.matterhornWorkspaceId \?\? input\.openworkWorkspaceId \?\? null/);
assert.match(desktopMain, /rawWorkspace\.matterhornToken !== workspace\.matterhornToken/);
assert.match(desktopMain, /function isAllowedDesktopFetchUrl/);
assert.match(desktopMain, /Desktop fetch is restricted to loopback endpoints by default/);
assert.match(desktopMain, /MATTERHORN_DESKTOP_FETCH_ALLOW_PUBLIC_HTTPS/);
assert.match(desktopMain, /const desktopFetchPublicHttpsOptIn =\s*!app\.isPackaged &&/);
assert.match(desktopMain, /if \(!desktopFetchPublicHttpsOptIn\) return false/);
assert.match(desktopMain, /isPrivateIpv4Literal\(parsed\.hostname\)/);
assert.match(desktopMain, /a === 0/);
assert.match(desktopMain, /a === 100 && b >= 64 && b <= 127/);
assert.match(desktopMain, /a === 198 && \(b === 18 \|\| b === 19\)/);
assert.match(desktopMain, /a >= 224/);
assert.match(desktopMain, /function isAllowedExternalUrl/);
assert.match(desktopMain, /function isAllowedExternalUrl[\s\S]*parsed\.hostname\.includes\(":"\)[\s\S]*return false/);
assert.match(desktopMain, /parsed\.protocol === "mailto:"/);
assert.match(desktopMain, /function normalizeHostnameForPolicy/);
assert.match(desktopMain, /while \(value\.endsWith\("\."\)\) value = value\.slice\(0, -1\)/);
assert.match(desktopMain, /value === "::ffff:7f00:1"/);
assert.match(desktopMain, /function isAllowedMainWindowUrl/);
assert.match(desktopMain, /isLocalRendererOrigin[\s\S]*return isAllowedMainWindowUrl\(value\)/);
assert.match(desktopMain, /trustedMainWindowOrigin && parsed\.origin === trustedMainWindowOrigin/);
assert.match(desktopMain, /trustedMainWindowFileRoot[\s\S]*isPathWithinRoot\(fileURLToPath\(parsed\), trustedMainWindowFileRoot\)/);
assert.match(desktopMain, /function isAllowedInitialMainWindowUrl[\s\S]*isLoopbackHostname\(parsed\.hostname\)/);
assert.match(desktopMain, /trustMainWindowUrl\(startUrl\)/);
assert.match(desktopMain, /trustMainWindowFile\(rendererIndexPath\)/);
assert.match(desktopMain, /setWindowOpenHandler[\s\S]*isAllowedMainWindowUrl\(url\)/);
assert.match(desktopMain, /webContents\.on\("will-navigate", guardMainWindowNavigation\)/);
assert.match(desktopMain, /webContents\.on\("will-redirect", guardMainWindowNavigation\)/);
assert.match(desktopMain, /guardMainWindowNavigation[\s\S]*event\.preventDefault\(\)/);
assert.equal(
  desktopMain.includes('url.startsWith("http://localhost")'),
  false,
  "main window popup policy must parse URLs instead of using localhost prefix checks",
);
assert.equal(
  desktopMain.includes('url.startsWith("http://127.0.0.1")'),
  false,
  "main window popup policy must parse URLs instead of using 127.0.0.1 prefix checks",
);
assert.match(desktopMain, /function isTrustedMainWindowIpcEvent/);
assert.match(desktopMain, /function requireTrustedMainWindowIpcEvent/);
assert.match(desktopMain, /function trustedMainWindowHandler/);
assert.match(desktopMain, /ALLOWED_MAIN_WINDOW_PERMISSIONS/);
assert.match(desktopMain, /clipboard-sanitized-write/);
assert.match(desktopMain, /notifications/);
assert.match(
  desktopMain,
  /shouldAllowMainWindowPermission[\s\S]*if \(!ALLOWED_MAIN_WINDOW_PERMISSIONS\.has\(permission\)\) return false;[\s\S]*if \(permission !== "media" && permission !== "audioCapture"\) return true/,
  "main window permissions must reject values outside the explicit allowlist before granting non-media permissions",
);
assert.match(desktopMain, /isTrustedMainWindowIpcEvent[\s\S]*isMainWindowWebContents\(sender\)/);
assert.match(desktopMain, /isTrustedMainWindowIpcEvent[\s\S]*isLocalRendererOrigin\(frameUrl\)/);
assert.match(desktopMain, /ipcMain\.handle\("openwork:desktop", trustedMainWindowHandler\("openwork:desktop", handleDesktopInvoke\)\)/);
assert.match(desktopMain, /registerMigrationIpc\(\{ app, ipcMain, trustedMainWindowHandler \}\)/);
assert.match(desktopMain, /registerUpdaterIpc\(\{[\s\S]*trustedMainWindowHandler,[\s\S]*\}\)/);
for (const channel of [
  "openwork:shell:openExternal",
  "openwork:shell:relaunch",
  "openwork:system:architecture",
  "openwork:browser:show",
  "openwork:browser:navigate",
  "openwork:browser:createTab",
  "openwork:browser:destroy",
]) {
  assert.match(
    desktopMain,
    new RegExp(`ipcMain\\.handle\\("${channel}", trustedMainWindowHandler\\("${channel}"`),
    `${channel} must be guarded by trustedMainWindowHandler`,
  );
}
const unguardedDesktopIpcHandlers = desktopMain
  .split("\n")
  .filter((line) => /ipcMain\.handle\("openwork:(?:desktop|shell:[^"]+|system:[^"]+|browser:[^"]+)"/.test(line))
  .filter((line) => !line.includes("trustedMainWindowHandler"))
  .map((line) => line.trim());
assert.deepEqual(
  unguardedDesktopIpcHandlers,
  [],
  "desktop, shell, system, and browser IPC handlers must be registered through trustedMainWindowHandler",
);
for (const [sourceName, source, channelPrefix] of [
  ["migration", desktopMigration, "openwork:migration"],
  ["updater", desktopUpdater, "openwork:updater"],
]) {
  assert.match(source, /trustedMainWindowHandler/);
  const unguardedModuleHandlers = source
    .split("\n")
    .filter((line) => new RegExp(`ipcMain\\.handle\\("${channelPrefix}:`).test(line))
    .filter((line) => !line.includes("trustedHandler"));
  assert.deepEqual(
    unguardedModuleHandlers,
    [],
    `${sourceName} IPC handlers must be registered through trustedHandler`,
  );
}
assert.match(desktopMain, /isAllowedExternalUrl\(targetUrl\)/);
assert.match(desktopMain, /isAllowedExternalUrl\(url\)/);
assert.match(desktopMain, /disabled: !\(url && isAllowedExternalUrl\(url\)\)/);
assert.match(desktopMain, /request\.url && isAllowedExternalUrl\(request\.url\)/);
assert.match(desktopMain, /DESKTOP_FETCH_DEFAULT_TIMEOUT_MS = 30_000/);
assert.match(desktopMain, /DESKTOP_FETCH_MAX_TIMEOUT_MS = 60_000/);
assert.match(desktopMain, /DESKTOP_FETCH_MAX_BODY_BYTES = 1_000_000/);
assert.match(desktopMain, /ALLOWED_DESKTOP_FETCH_METHODS/);
assert.match(desktopMain, /function resolveDesktopFetchMethod/);
assert.match(desktopMain, /Desktop fetch method is not allowed/);
assert.match(desktopMain, /function resolveDesktopFetchBody/);
assert.match(desktopMain, /Desktop fetch request body exceeded the maximum size/);
assert.match(desktopMain, /function sanitizeDesktopFetchHeaders/);
assert.match(desktopMain, /BLOCKED_DESKTOP_FETCH_REQUEST_HEADERS/);
assert.match(desktopMain, /BLOCKED_LOOPBACK_DESKTOP_FETCH_REQUEST_HEADERS/);
assert.match(desktopMain, /authorization/);
assert.match(desktopMain, /x-api-key/);
assert.match(desktopMain, /sanitizeDesktopFetchHeaders\(init\.headers, url\)/);
assert.match(desktopMain, /proxy-authorization/);
assert.match(desktopMain, /function readDesktopFetchResponseBody/);
assert.match(desktopMain, /Desktop fetch response exceeded the maximum size/);
assert.match(desktopMain, /sanitizeDesktopFetchResponseHeaders\(response\.headers\)/);
assert.match(desktopMain, /function resolveSafeDesktopPath/);
assert.match(desktopMain, /function initializeTrustedWorkspacePathRoots/);
assert.match(desktopMain, /await initializeTrustedWorkspacePathRoots\(\)/);
assert.match(desktopMain, /trustedWorkspacePathRoots\.add\(canonical\)/);
assert.match(desktopMain, /pathForPolicy\(canonical\) === pathForPolicy\(path\.parse\(canonical\)\.root\)/);
assert.match(desktopMain, /Desktop file access is limited to configured workspaces and locations you selected/);
assert.match(desktopMain, /BLOCKED_DESKTOP_OPEN_SUFFIXES/);
assert.match(desktopMain, /Matterhorn will not launch executable files/);
assert.match(desktopMain, /case "__openPath"[\s\S]*resolveSafeDesktopPath\(target\)/);
assert.match(desktopMain, /case "__revealItemInDir"[\s\S]*resolveSafeDesktopPath\(target, \{ revealOnly: true \}\)/);
assert.match(desktopMain, /case "pickDirectory"[\s\S]*rememberDesktopGrantedPath\(filePath, "directory"\)/);
assert.match(desktopMain, /case "pickFile"[\s\S]*rememberDesktopGrantedPath\(filePath, "file"\)/);
assert.match(desktopRuntime, /DESKTOP_MANAGED_CORS_ORIGINS = Object\.freeze\(\["loopback", "file:\/\/"\]\)/);
assert.match(desktopRuntime, /function desktopManagedCorsOrigins/);
assert.match(desktopRuntime, /function desktopManagedCorsArg/);
assert.match(desktopRuntime, /process\.env\.MATTERHORN_WORK_CORS_ORIGINS/);
assert.match(desktopRuntime, /corsOrigins: desktopManagedCorsOrigins\(\)/);
assert.equal(
  desktopRuntime.includes('corsOrigins: ["*"]'),
  false,
  "desktop-managed Matterhorn server must not default to wildcard CORS",
);
assert.equal(
  /["']--cors["']\s*,\s*["']\*["']/.test(desktopRuntime),
  false,
  "desktop-managed child processes must not launch with wildcard CORS",
);
assert.match(helperPrep, /Matterhorn Desks Automation Helper\.app/);
assert.match(helperPrep, /const bundleIdentifier = "com\.matterhorn\.desks\.computer-use"/);
assert.match(helperPrep, /function helperIdentityNeedsRefresh/);
assert.match(helperPrep, /function refreshPreparedHelperIdentity/);
assert.match(helperPrep, /spawnSync\("xattr", \["-cr", appPath\]/);
assert.ok(
  helperPrep.indexOf('spawnSync("xattr", ["-cr", appPath]') <
    helperPrep.indexOf('spawnSync("codesign", ["--force", "--deep", "--sign", "-", appPath]'),
  "automation helper extended attributes must be cleared before codesign",
);
assert.match(afterPack, /spawnSync\("xattr", \["-cr", helperPath\]/);
assert.ok(
  afterPack.indexOf('spawnSync("xattr", ["-cr", helperPath]') <
    afterPack.indexOf('spawnSync("codesign", args'),
  "packaged automation helper extended attributes must be cleared immediately before codesign",
);
assert.match(helperPrep, /legacyHelperAppName = "OpenWork Computer Use\.app"/);
assert.match(helperPrep, /rmSync\(legacyAppPath, \{ recursive: true, force: true \}\)/);
assert.match(helperPrep, /MATTERHORN_WORK_AUTOMATION_HELPER_FORCE_BUILD/);
assert.match(electronBuild, /prepare-computer-use-helper\.mjs/);
assert.match(electronDev, /prepare-computer-use-helper\.mjs/);
assert.doesNotMatch(
  electronBuild,
  /prepare-computer-use-helper\.mjs"\), "--force"/,
  "packaging should reuse a prepared helper unless MATTERHORN_WORK_AUTOMATION_HELPER_FORCE_BUILD is explicitly set",
);
assert.doesNotMatch(
  electronDev,
  /prepare-computer-use-helper\.mjs"\), "--force"/,
  "desktop development should reuse a prepared helper unless MATTERHORN_WORK_AUTOMATION_HELPER_FORCE_BUILD is explicitly set",
);
assert.equal(
  sidecarPrep.includes("shell: true"),
  false,
  "sidecar compilation must pass arguments directly without an injectable shell",
);
for (const source of [uiMcp, matterhornMcp, agentBrowserLiveProbe]) {
  assert.match(source, /com\.matterhorn\.desks/);
  assert.match(source, /com\.differentai\.openwork/);
}
assert.equal(
  [
    electronBuilderConfig,
    afterPack,
    afterSign,
    desktopMain,
  ].some((text) => text.includes("OpenWork Computer Use")),
  false,
  "packaged helper runtime naming should use Matterhorn Desks branding",
);

for (const forbiddenOpenworkCopy of [
  "OpenWork workspace discovery failed",
  "OpenWork server did not stay running",
  "OpenWork server did not report",
  "OpenWork server has no workspace",
  "OpenWork server returned no workspaces",
  "OpenWork control surface is not available yet",
  "Missing OpenWork actionId",
  "Unknown OpenWork control command",
  "Could not start OpenWork UI control bridge",
  "OpenCode binary not found",
  "OpenCode version probe failed",
  "OpenCode serve --help probe failed",
  "Orchestrator did not report OpenCode status",
  "OpenCode is not configured for a local workspace",
  "Install the OpenWork-pinned OpenCode version manually",
]) {
  assert.equal(
    [desktopMain, desktopRuntime].some((source) => source.includes(forbiddenOpenworkCopy)),
    false,
    `desktop user-facing copy should use Matterhorn branding, not "${forbiddenOpenworkCopy}"`,
  );
}

for (const forbidden of [
  "privateKey",
  "seedPhrase",
  "signedPayload",
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
]) {
  assert.equal(afterPack.includes(forbidden), false, `afterPack packaging hook must not include ${forbidden}`);
}

console.log("Electron packaging source gate passed.");
