#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const desktopPackage = JSON.parse(readFileSync("apps/desktop/package.json", "utf8"));
const electronBuilderConfig = readFileSync("apps/desktop/electron-builder.yml", "utf8");
const afterPack = readFileSync("apps/desktop/scripts/electron-after-pack.cjs", "utf8");
const afterSign = readFileSync("apps/desktop/scripts/electron-after-sign.cjs", "utf8");
const desktopMain = readFileSync("apps/desktop/electron/main.mjs", "utf8");
const desktopRuntime = readFileSync("apps/desktop/electron/runtime.mjs", "utf8");
const desktopMigration = readFileSync("apps/desktop/electron/migration.mjs", "utf8");
const desktopUpdater = readFileSync("apps/desktop/electron/updater.mjs", "utf8");
const helperPrep = readFileSync("apps/desktop/scripts/prepare-computer-use-helper.mjs", "utf8");
const sidecarPrep = readFileSync("apps/desktop/scripts/prepare-sidecar.mjs", "utf8");

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

assert.match(electronBuilderConfig, /afterPack: scripts\/electron-after-pack\.cjs/);
assert.match(electronBuilderConfig, /Matterhorn Work Automation Helper\.app\/\*\*/);
assert.match(afterPack, /function loadAsar/);
assert.match(afterPack, /loaded\.minimatch/);
assert.match(afterPack, /function resolveResourcesDir/);
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
assert.match(afterPack, /Matterhorn Work Automation Helper\.app/);
assert.match(afterPack, /fs\.cpSync\(sourcePath, targetPath, \{ recursive: true \}\)/);
assert.match(afterPack, /copyComputerUseHelper\(context\)/);
assert.match(afterSign, /Matterhorn Work Automation Helper\.app/);
assert.match(desktopMain, /Matterhorn Work Automation Helper\.app/);
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
assert.match(desktopMain, /setWindowOpenHandler[\s\S]*isAllowedMainWindowUrl\(url\)/);
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
assert.match(desktopMain, /proxy-authorization/);
assert.match(desktopMain, /function readDesktopFetchResponseBody/);
assert.match(desktopMain, /Desktop fetch response exceeded the maximum size/);
assert.match(desktopMain, /sanitizeDesktopFetchResponseHeaders\(response\.headers\)/);
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
assert.match(helperPrep, /Matterhorn Work Automation Helper\.app/);
assert.match(helperPrep, /legacyHelperAppName = "OpenWork Computer Use\.app"/);
assert.match(helperPrep, /rmSync\(legacyAppPath, \{ recursive: true, force: true \}\)/);
assert.match(helperPrep, /MATTERHORN_WORK_AUTOMATION_HELPER_FORCE_BUILD/);
assert.equal(
  sidecarPrep.includes("shell: true"),
  false,
  "sidecar compilation must pass arguments directly without an injectable shell",
);
assert.equal(
  [
    electronBuilderConfig,
    afterPack,
    afterSign,
    desktopMain,
  ].some((text) => text.includes("OpenWork Computer Use")),
  false,
  "packaged helper runtime naming should use Matterhorn Work branding",
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
