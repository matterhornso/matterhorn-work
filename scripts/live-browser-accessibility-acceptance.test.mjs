#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseArgs,
  validateConfig,
} from "./live-browser-accessibility-acceptance.mjs";

const script = readFileSync(
  "scripts/live-browser-accessibility-acceptance.mjs",
  "utf8",
);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const parsed = parseArgs([
  "--",
  "--browser",
  "safari",
  "--app-url",
  "https://matterhorn-desks-canary.vercel.app/",
  "--strict",
]);
assert.equal(parsed.browser, "safari");
assert.equal(parsed.strict, true);
assert.equal(
  validateConfig(parsed).origin,
  "https://matterhorn-desks-canary.vercel.app",
);

assert.throws(
  () => validateConfig({ ...parsed, browser: "chrome" }),
  /firefox or safari/,
  "only the release browsers are accepted",
);
assert.throws(
  () => validateConfig({ ...parsed, appUrl: "http://example.com" }),
  /must use HTTPS/,
  "remote plaintext URLs are rejected",
);
assert.throws(
  () =>
    validateConfig({
      ...parsed,
      webdriverUrl: "http://webdriver.example.com:4444",
    }),
  /must be loopback/,
  "remote WebDriver endpoints are rejected",
);
assert.equal(
  validateConfig({
    ...parsed,
    appUrl: "http://127.0.0.1:5175",
    allowLoopbackHttp: true,
  }).hostname,
  "127.0.0.1",
  "explicit local HTTP remains available for development",
);

for (const required of [
  "Matterhorn live browser accessibility acceptance",
  "Allow remote automation",
  "horizontalOverflow",
  "unnamedControlCount",
  "keyboard_order",
  "focus_visible",
  "320, 375, 768, 1024, 1440",
  "It never reads cookies, local storage, passwords, wallet data, or browser history.",
]) {
  assert.ok(
    script.includes(required),
    `acceptance harness includes ${required}`,
  );
}

for (const forbidden of [
  "document.cookie",
  "localStorage",
  "sessionStorage",
  "getAllCookies",
  "password.value",
]) {
  assert.equal(
    script.includes(forbidden),
    false,
    `acceptance harness does not access ${forbidden}`,
  );
}

assert.equal(
  packageJson.scripts?.["accept:live-browser"],
  "node scripts/live-browser-accessibility-acceptance.mjs",
  "package.json exposes the live browser acceptance command",
);
assert.equal(
  packageJson.scripts?.["test:live-browser-acceptance"],
  "node scripts/live-browser-accessibility-acceptance.test.mjs",
  "package.json exposes the harness contract test",
);

console.log("Live browser accessibility acceptance contract passed.");
