#!/usr/bin/env node
// Static gate for the Settings Overview page.
// Verifies the page is wired into the settings nav/route, presents all nine
// sections, carries the required safety copy, and contains no forbidden
// live-submission/custody/secret-storage claims or OpenWork/OpenCode visible copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const VIEW = "apps/app/src/react-app/domains/settings/pages/overview-view.tsx";
const view = readFileSync(VIEW, "utf8");
const generalView = readFileSync("apps/app/src/react-app/domains/settings/pages/general-view.tsx", "utf8");
const environmentView = readFileSync("apps/app/src/react-app/domains/settings/pages/environment-view.tsx", "utf8");
const recoveryView = readFileSync("apps/app/src/react-app/domains/settings/pages/recovery-view.tsx", "utf8");
const types = readFileSync("apps/app/src/app/types.ts", "utf8");
const settingsPage = readFileSync("apps/app/src/react-app/domains/settings/shell/settings-page.tsx", "utf8");
const settingsShell = readFileSync("apps/app/src/react-app/domains/settings/shell/settings-shell.tsx", "utf8");
const settingsRoute = readFileSync("apps/app/src/react-app/shell/settings-route.tsx", "utf8");
const appMenu = readFileSync("apps/app/src/react-app/shell/app-menu.tsx", "utf8");
const commandPalette = readFileSync("apps/app/src/react-app/shell/command-palette.tsx", "utf8");
const webUnavailable = readFileSync("apps/app/src/react-app/design-system/web-unavailable-surface.tsx", "utf8");
const locale = readFileSync("apps/app/src/i18n/locales/en.ts", "utf8");
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
  'title="MCPs &amp; Connectors"',
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

// 5b. Settings directory tells the truth about readiness instead of implying
// every scaffolded surface is production-ready.
for (const status of ["Ready", "Needs setup", "Preview", "Desktop only", "Cloud only", "Developer"]) {
  assert.ok(settingsPage.includes(status), `Settings navigation should include status badge: ${status}`);
  assert.ok(generalView.includes(status), `Settings hub should include status badge: ${status}`);
}
assert.ok(settingsShell.includes("getSettingsTabStatus"), "Compact settings menu should show readiness badges");
assert.ok(settingsPage.includes("getWorkspaceSettingsTabs(developerMode = false)"), "Workspace settings should be gated by developer mode");
assert.ok(settingsPage.includes('if (developerMode) tabs.push("marketplace", "advanced");'), "Agent templates and Advanced should be developer-gated");
assert.ok(settingsPage.includes('return developerMode ? ["cloud-account", "cloud-workers"] : ["cloud-account"];'), "Cloud Workers should be developer-gated");
assert.ok(generalView.includes("developerOnly: true"), "Demo/developer settings cards should be hidden unless developer mode is on");
assert.ok(generalView.includes('title: "Matterhorn Cloud"'), "Settings hub should use Matterhorn Cloud branding");
assert.ok(generalView.includes('title: "Advanced"'), "Advanced settings should remain documented as a developer-only technical surface");
assert.ok(generalView.includes('title: "Cloud Workers Preview"'), "Cloud Workers should remain documented as a developer-gated cloud-only surface");
assert.ok(generalView.includes('title: "Environment"'), "Environment settings should remain documented for developer mode");
assert.ok(generalView.includes('title: "Recovery"'), "Recovery settings should remain documented for developer mode");
assert.ok(settingsPage.includes('case "advanced":'), "Advanced should have an explicit readiness status");
assert.ok(settingsPage.includes('return "Developer";'), "Developer-only surfaces should be labeled explicitly");
assert.ok(!settingsPage.includes('Agent Marketplace"'), "Customer-facing settings nav should not advertise Agent Marketplace as live");

// 5c. Environment and Recovery should be honest about token/desktop/preview limits.
for (const phrase of [
  "Developer setting: this editor manages local runtime environment variables only",
  "Local runtime token unavailable. Environment editing is disabled for this session.",
]) {
  assert.ok(environmentView.includes(phrase), `Environment settings should include: ${phrase}`);
}
assert.ok(
  recoveryView.includes("Preview diagnostics: reset, repair, and Docker cleanup actions are intentionally disabled"),
  "Recovery should explain that destructive repair actions are preview/disabled in beta",
);

// 5d. Support links and web fallback should be Matterhorn-owned.
assert.ok(commandPalette.includes("https://matterhorn.work/feedback"), "Feedback command should use Matterhorn-owned feedback URL");
assert.ok(commandPalette.includes("https://matterhorn.work/docs"), "Docs command should use Matterhorn-owned docs URL");
assert.equal(commandPalette.includes("settings-recovery"), false, "Recovery should not be exposed as a normal command-palette shortcut");
assert.ok(webUnavailable.includes("https://matterhorn.work"), "Web unavailable fallback should link to Matterhorn-owned site");
assert.equal(webUnavailable.includes("openworklabs.com"), false, "Web unavailable fallback must not link to OpenWork Labs");
assert.equal(locale.includes("openwork-dev-data"), false, "Reset copy should not expose legacy OpenWork data folder names");

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
