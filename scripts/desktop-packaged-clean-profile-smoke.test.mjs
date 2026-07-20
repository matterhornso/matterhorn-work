#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(
  packageJson.scripts?.["smoke:desktop-packaged-clean-profile"],
  "node scripts/desktop-packaged-clean-profile-smoke.mjs",
);
assert.equal(
  packageJson.scripts?.["test:desktop-packaged-clean-profile-smoke"],
  "node scripts/desktop-packaged-clean-profile-smoke.test.mjs",
);

const source = readFileSync("scripts/desktop-packaged-clean-profile-smoke.mjs", "utf8");
for (const required of [
  "matterhorn.desktop-packaged-clean-profile-smoke.v1",
  "MATTERHORN_WORK_ELECTRON_USERDATA",
  "matterhorn-work-ui-control.json",
  "matterhorn-electron-local-tester-artifact.json",
  "CFBundleExecutable",
  'health.body?.app !== "Matterhorn Desks"',
  "control.auth",
  "protocol.matterhorn_work",
  "first_run.welcome",
  "route.settings.general",
  "route.settings.extensions",
  "route.settings.providers",
  "route.settings.appearance",
  "route.session",
  "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
  "deep_link.launchservices_remote_workspace",
  "deep_link.authenticated_workspace_actions",
  'spawnSync("open", ["-a", appBundle, deepLink.toString()]',
  "browser.actions",
  "browser.loopback_navigation",
  "browser.close_panel",
  "--server-url",
  "--token",
  "--artifact-dir",
]) {
  assert.ok(source.includes(required), `clean-profile smoke missing ${required}`);
}

const help = spawnSync("node", ["scripts/desktop-packaged-clean-profile-smoke.mjs", "--help"], {
  encoding: "utf8",
});
assert.equal(help.status, 0, help.stderr || help.stdout);
assert.match(help.stdout, /Matterhorn packaged desktop clean-profile smoke/);
assert.match(help.stdout, /--artifact-dir/);
assert.match(help.stdout, /--server-url/);

const dryRun = spawnSync("node", ["scripts/monday-beta-rc-pack.mjs", "--dry-run", "--json"], {
  encoding: "utf8",
  maxBuffer: 10 * 1024 * 1024,
});
assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
const report = JSON.parse(dryRun.stdout);
assert.ok(report.stages.some((stage) => stage.id === "desktop.clean_profile"));

console.log("Desktop packaged clean-profile smoke contract passed.");
