#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
const script = readFileSync("scripts/electron-local-tester-artifact.mjs", "utf8");

assert.equal(
  rootPackage.scripts["electron:tester-artifact"],
  "node scripts/electron-local-tester-artifact.mjs",
  "package.json should expose the local Electron tester artifact helper",
);
assert.equal(
  rootPackage.scripts["test:electron-local-tester-artifact"],
  "node scripts/electron-local-tester-artifact.test.mjs",
  "package.json should expose the local Electron tester artifact test",
);

for (const expected of [
  "matterhorn.electron.local-tester-artifact.v1",
  "--output-dir",
  "--skip-build",
  "Matterhorn-Work-${sha}-arm64-unsigned.dmg",
  "Matterhorn-Work-${sha}-arm64-unsigned.zip",
  "SHA256SUMS.txt",
  "matterhorn-electron-local-tester-artifact.json",
  "privateKeysAccepted: false",
  "apiSecretsAccepted: false",
  "signingMaterialAccepted: false",
]) {
  assert.match(script, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const forbidden of [
  "privateKey =",
  "seedPhrase",
  "mnemonic",
  "signedPayload",
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
]) {
  assert.equal(script.includes(forbidden), false, `tester artifact helper must not include ${forbidden}`);
}

const distDir = "apps/desktop/dist-electron";
const outputDir = "/tmp/matterhorn-electron-local-tester-artifact-test";
rmSync(distDir, { recursive: true, force: true });
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, "matterhorn-mac-arm64-0.0.0.dmg"), "fixture dmg\n");
writeFileSync(join(distDir, "matterhorn-mac-arm64-0.0.0.zip"), "fixture zip\n");
writeFileSync(join(distDir, "matterhorn-mac-arm64-0.0.0.dmg.blockmap"), "fixture dmg blockmap\n");
writeFileSync(join(distDir, "matterhorn-mac-arm64-0.0.0.zip.blockmap"), "fixture zip blockmap\n");

const result = spawnSync("node", [
  "scripts/electron-local-tester-artifact.mjs",
  "--",
  "--skip-build",
  "--output-dir",
  outputDir,
  "--json",
], { encoding: "utf8" });

assert.equal(result.status, 0, result.stderr);
const manifest = JSON.parse(result.stdout);
assert.equal(manifest.kind, "matterhorn.electron.local-tester-artifact.v1");
assert.equal(manifest.unsigned, true);
assert.equal(manifest.notarized, false);
assert.equal(manifest.publishEnabled, false);
assert.equal(manifest.safety.privateKeysAccepted, false);
assert.equal(manifest.safety.apiSecretsAccepted, false);
assert.equal(manifest.safety.signingMaterialAccepted, false);
assert.equal(manifest.artifacts.length, 4);
assert.match(readFileSync(join(outputDir, "SHA256SUMS.txt"), "utf8"), /Matterhorn-Work-.*-arm64-unsigned\.dmg/);
assert.match(
  readFileSync(join(outputDir, "matterhorn-electron-local-tester-artifact.json"), "utf8"),
  /matterhorn\.electron\.local-tester-artifact\.v1/,
);

rmSync(outputDir, { recursive: true, force: true });
rmSync(distDir, { recursive: true, force: true });

console.log("Electron local tester artifact helper check passed.");
