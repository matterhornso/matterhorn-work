#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

function read(path) {
  return readFileSync(path, "utf8");
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

const rootPackage = JSON.parse(read("package.json"));
const doctor = read("scripts/desktop-beta-first-run-doctor.mjs");
const doc = read("docs/desktop-beta-first-run.md");
const panel = read("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx");
const desktopMain = read("apps/desktop/electron/main.mjs");
const workflow = read(".github/workflows/ci-tests.yml");

assert.equal(
  rootPackage.scripts["desktop:beta-doctor"],
  "node scripts/desktop-beta-first-run-doctor.mjs",
  "package.json should expose the desktop beta doctor",
);
assert.equal(
  rootPackage.scripts["test:desktop-beta-first-run"],
  "node scripts/desktop-beta-first-run.test.mjs",
  "package.json should expose the desktop beta first-run gate",
);

for (const phrase of [
  "matterhorn.desktop-beta.first-run-doctor.v1",
  "--artifact-dir",
  "--server-url",
  "--markdown-output",
  "/api/crypto/readiness",
  "Bearer",
  "testerArtifactCommand",
  "customerBoundary",
  "Bittensor",
  "Hyperliquid",
  "Polymarket",
  "servicesWellness",
]) {
  assert.ok(doctor.includes(phrase), `doctor should include ${phrase}`);
}

for (const phrase of [
  "Desktop Beta First-Run",
  "Gatekeeper",
  "pnpm electron:tester-artifact",
  "pnpm desktop:beta-doctor",
  "matterhorn-electron-local-tester-artifact.json",
  "SHA256SUMS.txt",
  "First-Run UI Checklist",
  "Logs And Diagnostics",
  "No seed phrases",
  "no live market submit",
  "no live payments",
  "no live email",
  "no live provider execution",
]) {
  assert.ok(doc.includes(phrase), `first-run guide should include ${phrase}`);
}

for (const phrase of [
  "Desktop beta",
  "Bittensor: Beta-ready",
  "Hyperliquid/Polymarket: Preview only",
  "Services: Coming soon",
  "Open install guide",
  "Copy doctor",
  "Copy tester build",
  "No market submit",
  "External signer required",
]) {
  assert.ok(panel.includes(phrase), `Demo tab should include desktop beta copy: ${phrase}`);
}

assert.ok(workflow.includes("pnpm test:desktop-beta-first-run"), "CI should run the desktop beta first-run gate");

for (const phrase of [
  "MATTERHORN_WORK_ELECTRON_USERDATA",
  "MATTERHORN_WORK_DESKTOP_BOOTSTRAP_PATH",
  ".config\", \"matterhorn-work\", \"desktop-bootstrap.json",
  "if (response.status === 404) return null",
]) {
  assert.ok(desktopMain.includes(phrase), `desktop startup should include ${phrase}`);
}

assert.ok(
  desktopMain.indexOf("MATTERHORN_WORK_ELECTRON_USERDATA") < desktopMain.indexOf("OPENWORK_ELECTRON_USERDATA"),
  "Matterhorn user-data override should be preferred over legacy OpenWork override",
);
assert.ok(
  desktopMain.indexOf("MATTERHORN_WORK_DESKTOP_BOOTSTRAP_PATH") < desktopMain.indexOf("OPENWORK_DESKTOP_BOOTSTRAP_PATH"),
  "Matterhorn bootstrap override should be preferred over legacy OpenWork override",
);

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
  "Services: Workflow/future hooks",
]) {
  assert.equal(doctor.includes(forbidden), false, `doctor must not expose ${forbidden}`);
  assert.equal(doc.includes(forbidden), false, `guide must not expose ${forbidden}`);
  assert.equal(panel.includes(forbidden), false, `panel must not expose ${forbidden}`);
}

const fixtureDir = "/tmp/matterhorn-desktop-beta-first-run-test";
rmSync(fixtureDir, { recursive: true, force: true });
mkdirSync(fixtureDir, { recursive: true });
const dmgText = "fixture dmg\n";
const zipText = "fixture zip\n";
const dmgPath = join(fixtureDir, "Matterhorn-Work-test-arm64-unsigned.dmg");
const zipPath = join(fixtureDir, "Matterhorn-Work-test-arm64-unsigned.zip");
writeFileSync(dmgPath, dmgText);
writeFileSync(zipPath, zipText);
writeFileSync(join(fixtureDir, "SHA256SUMS.txt"), `${sha256(dmgText)}  Matterhorn-Work-test-arm64-unsigned.dmg\n${sha256(zipText)}  Matterhorn-Work-test-arm64-unsigned.zip\n`);
writeFileSync(join(fixtureDir, "matterhorn-electron-local-tester-artifact.json"), `${JSON.stringify({
  kind: "matterhorn.electron.local-tester-artifact.v1",
  gitSha: "test",
  unsigned: true,
  notarized: false,
  publishEnabled: false,
  artifacts: [
    { file: dmgPath, name: "Matterhorn-Work-test-arm64-unsigned.dmg", sha256: sha256(dmgText) },
    { file: zipPath, name: "Matterhorn-Work-test-arm64-unsigned.zip", sha256: sha256(zipText) },
  ],
  safety: {
    privateKeysAccepted: false,
    apiSecretsAccepted: false,
    signingMaterialAccepted: false,
  },
}, null, 2)}\n`);

const result = spawnSync("node", [
  "scripts/desktop-beta-first-run-doctor.mjs",
  "--artifact-dir",
  fixtureDir,
  "--strict",
  "--json",
], { encoding: "utf8" });
assert.equal(result.status, 0, result.stderr);
const report = JSON.parse(result.stdout);
assert.equal(report.version, "matterhorn.desktop-beta.first-run-doctor.v1");
assert.equal(report.ready, true);
assert.equal(report.copyDiagnostics.customerBoundary.bittensor, "Beta-ready read/preview/external-signer workflow");
assert.ok(report.checks.some((check) => check.id === "artifact.dir" && check.status === "pass"));
assert.ok(report.checks.some((check) => check.id === "server.health" && check.status === "skip"));
assert.equal(/privateKey|apiSecret|rawSignature|signedPayload/.test(result.stdout), false);

rmSync(fixtureDir, { recursive: true, force: true });

console.log("Desktop beta first-run gate passed.");
