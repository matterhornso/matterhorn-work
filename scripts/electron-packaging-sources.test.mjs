#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const desktopPackage = JSON.parse(readFileSync("apps/desktop/package.json", "utf8"));
const electronBuilderConfig = readFileSync("apps/desktop/electron-builder.yml", "utf8");
const afterPack = readFileSync("apps/desktop/scripts/electron-after-pack.cjs", "utf8");
const afterSign = readFileSync("apps/desktop/scripts/electron-after-sign.cjs", "utf8");
const desktopMain = readFileSync("apps/desktop/electron/main.mjs", "utf8");
const helperPrep = readFileSync("apps/desktop/scripts/prepare-computer-use-helper.mjs", "utf8");

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
assert.match(afterSign, /Matterhorn Work Automation Helper\.app/);
assert.match(desktopMain, /Matterhorn Work Automation Helper\.app/);
assert.match(desktopMain, /MATTERHORN_WORK_AUTOMATION_HELPER_BINARY/);
assert.match(desktopMain, /MATTERHORN_WORK_AUTOMATION_HELPER_APP/);
assert.match(desktopMain, /matterhornso\/matterhorn-work\/tree\/dev\/docs/);
assert.match(helperPrep, /Matterhorn Work Automation Helper\.app/);
assert.match(helperPrep, /MATTERHORN_WORK_AUTOMATION_HELPER_FORCE_BUILD/);
assert.equal(
  [
    electronBuilderConfig,
    afterPack,
    afterSign,
    desktopMain,
    helperPrep,
  ].some((text) => text.includes("OpenWork Computer Use")),
  false,
  "packaged helper naming should use Matterhorn Work branding",
);

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
