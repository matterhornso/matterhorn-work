#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("apps/app/src/app/index.css", "utf8");
const theme = readFileSync("apps/app/src/app/theme.ts", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

assert.equal(
  pkg.scripts?.["test:matterhorn-theme-readability"],
  "node scripts/matterhorn-theme-readability.test.mjs",
  "package.json should expose the Matterhorn theme readability gate",
);

for (const phrase of [
  "--matterhorn-blue: #D1F2FF",
  "--matterhorn-ink: #0C0C0C",
  "--matterhorn-sky: #38bdf8",
  "--matterhorn-emerald: #22c55e",
  "--matterhorn-amber: #f59e0b",
  "--matterhorn-rose: #ec4899",
  "--matterhorn-violet: #8b5cf6",
]) {
  assert.ok(css.includes(phrase), `theme should expose a brighter Matterhorn accent palette: ${phrase}`);
}

for (const phrase of [
  "--dls-app-bg: #f6f9ff",
  "--dls-canvas: #eef7ff",
  "--dls-border: #b9dceb",
  "--dls-text-secondary: #555c6d",
  "--dls-hover: rgba(56, 189, 248, 0.12)",
]) {
  assert.ok(css.includes(phrase), `light theme should avoid a flat grayscale shell: ${phrase}`);
}

for (const phrase of [
  '[data-theme="dark"]',
  "--dls-app-bg: #070a10",
  "--dls-canvas: #111827",
  "--dls-surface-muted: #182033",
  "--dls-text-primary: #fafcff",
  "--dls-text-secondary: #b4bdca",
  "--dls-hover: rgba(56, 189, 248, 0.13)",
]) {
  assert.ok(css.includes(phrase), `dark theme should be brighter and more legible: ${phrase}`);
}

const chartValues = [...css.matchAll(/--chart-[1-5]: ([^;]+);/g)].map((match) => match[1]);
assert.ok(new Set(chartValues).size >= 5, "chart/accent palette should not collapse into one hue");

assert.ok(theme.includes('"matterhorn-work.react.settings.theme-mode"'), "theme preference key should use Matterhorn-native naming");
assert.ok(theme.includes('"openwork.react.settings.theme-mode"'), "theme preference should keep legacy OpenWork fallback");
assert.ok(theme.includes('"openwork.themePref"'), "theme preference should keep older OpenWork fallback");

console.log("Matterhorn theme readability gate passed.");
