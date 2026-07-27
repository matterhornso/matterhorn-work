#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
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
  "--dist-dir",
  "--output-dir",
  "--skip-build",
  "--help",
  "Matterhorn-Desks-${sha}-arm64-unsigned.dmg",
  "Matterhorn-Desks-${sha}-arm64-unsigned.zip",
  "SHA256SUMS.txt",
  "matterhorn-electron-local-tester-artifact.json",
  "gitWorktreeState",
  "changedPathCount",
  "preserveOnlyPathCount",
  "preserveOnly",
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

const helpResult = spawnSync("node", [
  "scripts/electron-local-tester-artifact.mjs",
  "--help",
], { encoding: "utf8" });
assert.equal(helpResult.status, 0, helpResult.stderr);
assert.match(helpResult.stdout, /Matterhorn Desks unsigned macOS tester artifact helper/);
assert.match(helpResult.stdout, /--output-dir/);

const fixtureRoot = mkdtempSync(join(os.tmpdir(), "matterhorn-electron-local-tester-artifact-test-"));
const distDir = join(fixtureRoot, "dist-electron");
const outputDir = join(fixtureRoot, "artifact");
mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, "matterhorn-mac-arm64-0.0.0.dmg"), "fixture dmg\n");
writeFileSync(join(distDir, "matterhorn-mac-arm64-0.0.0.zip"), "fixture zip\n");
writeFileSync(join(distDir, "matterhorn-mac-arm64-0.0.0.dmg.blockmap"), "fixture dmg blockmap\n");
writeFileSync(join(distDir, "matterhorn-mac-arm64-0.0.0.zip.blockmap"), "fixture zip blockmap\n");

const result = spawnSync("node", [
  "scripts/electron-local-tester-artifact.mjs",
  "--",
  "--skip-build",
  "--dist-dir",
  distDir,
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
assert.equal(typeof manifest.source.gitSha, "string");
assert.equal(typeof manifest.source.dirty, "boolean");
assert.equal(typeof manifest.source.changedPathCount, "number");
assert.equal(typeof manifest.source.preserveOnlyPathCount, "number");
assert.equal(typeof manifest.source.preserveOnly, "boolean");
assert.equal(manifest.safety.privateKeysAccepted, false);
assert.equal(manifest.safety.apiSecretsAccepted, false);
assert.equal(manifest.safety.signingMaterialAccepted, false);
assert.equal(manifest.artifacts.length, 4);
assert.match(readFileSync(join(outputDir, "SHA256SUMS.txt"), "utf8"), /Matterhorn-Desks-.*-arm64-unsigned\.dmg/);
assert.match(
  readFileSync(join(outputDir, "matterhorn-electron-local-tester-artifact.json"), "utf8"),
  /matterhorn\.electron\.local-tester-artifact\.v1/,
);

rmSync(fixtureRoot, { recursive: true, force: true });

console.log("Electron local tester artifact helper check passed.");
