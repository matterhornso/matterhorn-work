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
const productionGuide = read("docs/production-launch-configuration.md");
const panel = read("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx");
const desktopMain = read("apps/desktop/electron/main.mjs");
const workflow = read(".github/workflows/ci-tests.yml");

assert.equal(
  rootPackage.scripts["desktop:beta-doctor"],
  "node scripts/desktop-beta-first-run-doctor.mjs",
  "package.json should expose the desktop beta doctor",
);
assert.equal(
  rootPackage.scripts["desktop:release-doctor"],
  "node scripts/desktop-beta-first-run-doctor.mjs",
  "package.json should expose the stable desktop release doctor",
);
assert.equal(
  rootPackage.scripts["test:desktop-beta-first-run"],
  "node scripts/desktop-beta-first-run.test.mjs",
  "package.json should expose the desktop beta first-run gate",
);

for (const phrase of [
  "matterhorn.desktop.release-doctor.v1",
  "pnpm desktop:release-doctor",
  "--artifact-dir",
  "--server-url",
  "--markdown-output",
  "/api/crypto/readiness",
  "Bearer",
  "Protected endpoint requires a client token.",
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
  "Production Launch Configuration",
  "pnpm desktop:release-doctor",
  "signed/notarized package",
]) {
  assert.ok(productionGuide.includes(phrase), `production guide should include ${phrase}`);
}

for (const phrase of [
  "Desktop Release First-Run",
  "Gatekeeper",
  "pnpm electron:tester-artifact",
  "pnpm desktop:release-doctor",
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
  "Desktop release checks",
  "Bittensor: Read, prepare, and transfer",
  "Markets: Wallet-approved trading",
  "Public reads, unsigned staking previews, and reviewed TAO transfers.",
  "Manual execution is available in the trade ticket after exact-order review and connected-wallet approval.",
  "Eligible EOA BUY orders require compliance checks, exact review, and connected Polygon wallet authorization.",
  "Matterhorn never custodies keys or signs silently.",
  "Longevity workflow: Standalone",
  "Open install guide",
  "Copy doctor",
  "Copy tester build",
  "Automatic execution off",
  "Wallet approval per action",
  "Bittensor staking uses external signer",
  "Polymarket compliance gate",
  "Not Web3, not medical advice, and no live payments or email.",
]) {
  assert.ok(panel.includes(phrase), `Demo tab should include desktop beta copy: ${phrase}`);
}

assert.equal(
  doctor.includes("Hyperliquid and Polymarket: preview/external-signer readiness only; no live submit"),
  false,
  "release doctor must not collapse wallet-approved Hyperliquid execution into Polymarket's preview-only boundary",
);

assert.ok(workflow.includes("pnpm test:desktop-beta-first-run"), "CI should run the desktop beta first-run gate");

for (const phrase of [
  "MATTERHORN_WORK_ELECTRON_USERDATA",
  "MATTERHORN_WORK_DESKTOP_BOOTSTRAP_PATH",
  ".config\", \"matterhorn-work\", \"desktop-bootstrap.json",
  'error?.code === "ENOENT"',
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
  "/api/polymarket/orders/submit",
  "privateKey:",
  "apiSecret:",
  "rawSignature:",
  "signedPayload:",
  "Services: Workflow/future hooks",
  "Services: Coming soon",
]) {
  assert.equal(doctor.includes(forbidden), false, `doctor must not expose ${forbidden}`);
  assert.equal(doc.includes(forbidden), false, `guide must not expose ${forbidden}`);
  assert.equal(panel.includes(forbidden), false, `panel must not expose ${forbidden}`);
}

assert.equal(
  doctor.includes("/api/hyperliquid/orders/submit"),
  false,
  "release diagnostics must not expose the internal Hyperliquid submit route",
);
assert.equal(
  doc.includes("/api/hyperliquid/orders/submit"),
  false,
  "tester guidance must describe the reviewed wallet flow without exposing an internal submit route",
);
assert.ok(
  panel.includes('"/api/hyperliquid/orders/submit"'),
  "the reviewed Hyperliquid wallet ticket should call the exact-intent submit route",
);

const fixtureDir = "/tmp/matterhorn-desktop-beta-first-run-test";
rmSync(fixtureDir, { recursive: true, force: true });
mkdirSync(fixtureDir, { recursive: true });
const dmgText = "fixture dmg\n";
const zipText = "fixture zip\n";
const dmgPath = join(fixtureDir, "Matterhorn-Desks-test-arm64-unsigned.dmg");
const zipPath = join(fixtureDir, "Matterhorn-Desks-test-arm64-unsigned.zip");
writeFileSync(dmgPath, dmgText);
writeFileSync(zipPath, zipText);
writeFileSync(join(fixtureDir, "SHA256SUMS.txt"), `${sha256(dmgText)}  Matterhorn-Desks-test-arm64-unsigned.dmg\n${sha256(zipText)}  Matterhorn-Desks-test-arm64-unsigned.zip\n`);
writeFileSync(join(fixtureDir, "matterhorn-electron-local-tester-artifact.json"), `${JSON.stringify({
  kind: "matterhorn.electron.local-tester-artifact.v1",
  gitSha: "test",
  unsigned: true,
  notarized: false,
  publishEnabled: false,
  artifacts: [
    { file: dmgPath, name: "Matterhorn-Desks-test-arm64-unsigned.dmg", sha256: sha256(dmgText) },
    { file: zipPath, name: "Matterhorn-Desks-test-arm64-unsigned.zip", sha256: sha256(zipText) },
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
assert.equal(report.version, "matterhorn.desktop.release-doctor.v1");
assert.equal(report.ready, true);
assert.equal(report.copyDiagnostics.customerBoundary.bittensor, "Bittensor: public read, unsigned preview, and external-signer workflow");
assert.ok(report.checks.some((check) => check.id === "artifact.dir" && check.status === "pass"));
assert.ok(report.checks.some((check) => check.id === "server.health" && check.status === "skip"));
assert.equal(/privateKey|apiSecret|rawSignature|signedPayload/.test(result.stdout), false);

rmSync(fixtureDir, { recursive: true, force: true });

console.log("Desktop release and legacy beta first-run gate passed.");
