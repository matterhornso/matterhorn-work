#!/usr/bin/env node
// Static gate for the Settings Overview page.
// Verifies the page is wired into the settings nav/route, presents all nine
// sections, carries the required safety copy, and contains no forbidden
// live-submission/custody/secret-storage claims or OpenWork/OpenCode visible copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const VIEW = "apps/app/src/react-app/domains/settings/pages/overview-view.tsx";
const view = readFileSync(VIEW, "utf8");
const types = readFileSync("apps/app/src/app/types.ts", "utf8");
const settingsPage = readFileSync("apps/app/src/react-app/domains/settings/shell/settings-page.tsx", "utf8");
const settingsRoute = readFileSync("apps/app/src/react-app/shell/settings-route.tsx", "utf8");
const appMenu = readFileSync("apps/app/src/react-app/shell/app-menu.tsx", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

// 1. Wired into package.json.
assert.equal(
  pkg.scripts?.["test:settings-overview-ui"],
  "node scripts/settings-overview-ui.test.mjs",
  "package.json should expose the settings overview UI gate",
);

// 2. Wired into the settings nav + route.
assert.ok(/"overview"/.test(types), "SettingsTab type should include 'overview'");
assert.ok(settingsPage.includes('"overview", "ai"'), "Overview should be the first global settings tab");
assert.ok(settingsPage.includes('case "overview":'), "settings-page should label/icon the overview tab");
assert.ok(settingsRoute.includes("SettingsOverviewView"), "settings-route should render SettingsOverviewView");
assert.ok(settingsRoute.includes('case "overview":'), "settings-route should route the overview tab");
assert.ok(settingsRoute.includes('tab: "overview", redirectPath: "overview"'), "empty /settings should land on overview");
assert.ok(appMenu.includes('navigate("/settings/overview")'), "the Settings menu affordance should open the overview");

// 3. All nine sections are present.
for (const title of [
  'title="Profile"',
  'title="Appearance"',
  'title="Safety & Wallets"',
  'title="Protocols"',
  'title="Extensions &amp; MCP"',
  'title="Workspaces"',
  'title="Beta Diagnostics"',
  'title="Privacy &amp; Data"',
  'title="About"',
]) {
  assert.ok(view.includes(title), `Settings overview should include section: ${title}`);
}

// 4. Required safety / boundary copy.
for (const phrase of [
  "non-custodial",
  "never holds your keys, signs silently, or moves funds",
  "external Bittensor-compatible signer",
  "Live submission is off",
  "does not submit live market trades",
  "never asks for or stores seed phrases, private keys, or API secrets",
  "stored",
]) {
  assert.ok(view.includes(phrase), `Settings overview should include safety copy: ${phrase}`);
}

// 5. Theme controls, accent preview, diagnostics, version.
for (const phrase of ["setThemeMode", "Matterhorn accent", "matterhorn-blue", "VITE_OPENWORK_APP_VERSION", "Copy command"]) {
  assert.ok(view.includes(phrase), `Settings overview should include: ${phrase}`);
}

// 6. No forbidden affirmative live/custody/secret-storage claims.
for (const forbidden of [
  "live submission is on",
  "we submit your order",
  "we will submit your",
  "we hold your keys",
  "custody of your keys",
  "store your seed phrase",
  "store your private key",
]) {
  assert.equal(view.toLowerCase().includes(forbidden), false, `Settings overview must not claim: "${forbidden}"`);
}

// 7. No OpenWork/OpenCode visible copy (the OPENWORK env-var identifier is not visible copy).
const visibleCopy = view
  .split("\n")
  .filter((line) => !line.includes("VITE_OPENWORK_APP_VERSION"))
  .join("\n");
for (const forbidden of ["openwork", "opencode"]) {
  assert.equal(visibleCopy.toLowerCase().includes(forbidden), false, `Settings overview must not show ${forbidden} copy`);
}

console.log("Settings overview UI static check passed.");
