#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describeElectronUpdaterError } from "../apps/desktop/electron/updater.mjs";

const settingsRoute = readFileSync("apps/app/src/react-app/shell/settings-route.tsx", "utf8");
assert.match(
  settingsRoute,
  /readStoredBoolean\(SETTINGS_UPDATE_AUTO_CHECK_KEY, false\)/,
  "fresh desktop profiles should wait for an explicit update check",
);

assert.equal(
  describeElectronUpdaterError(Object.assign(new Error("raw request headers"), {
    code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
  })),
  "This update channel is not published yet.",
);
assert.equal(
  describeElectronUpdaterError(new Error('Cannot find channel "latest-mac.yml" update info: HTTP 404 with bearer secret')),
  "This update channel is not published yet.",
);
assert.equal(
  describeElectronUpdaterError(new Error("request failed with Authorization: Bearer secret-value")),
  "Update check failed. Try again later.",
);

console.log("Electron updater first-run safety gate passed.");
