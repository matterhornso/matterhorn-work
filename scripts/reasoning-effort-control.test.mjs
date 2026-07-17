#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(
  packageJson.scripts["test:reasoning-effort-control"],
  "bun test apps/app/tests/model-behavior-control.test.ts && node scripts/reasoning-effort-control.test.mjs",
);

const controlPath = "apps/app/src/components/model-behavior-select.tsx";
const routePath = "apps/app/src/react-app/shell/session-route.tsx";
const composerPath = "apps/app/src/react-app/domains/session/surface/composer/composer.tsx";
const behaviorPath = "apps/app/src/app/lib/model-behavior.ts";

const control = readFileSync(controlPath, "utf8");
const route = readFileSync(routePath, "utf8");
const composer = readFileSync(composerPath, "utf8");
const behavior = readFileSync(behaviorPath, "utf8");

for (const required of [
  'type="range"',
  "aria-valuetext={selectedLabel}",
  "onChange(next.value)",
  "onChange(option.value)",
  "onChange(null)",
  "selected.description",
  "settings.provider_default_label",
  "motion-reduce:transition-none",
]) {
  assert.ok(control.includes(required), `${controlPath} should include ${required}`);
}

assert.ok(!control.includes("@/components/ui/select"), "reasoning effort should not fall back to an opaque select menu");
assert.ok(control.includes("levels.length > 1"), "range math should handle a single supported level");
assert.ok(control.includes("Math.max(0, levels.length - 1)"), "range max should stay valid for a single level");

for (const required of [
  "modelBehaviorTitle: summary.title",
  "modelBehaviorIsProviderDefault: variant == null",
  "modelBehaviorOptions: summary.options",
  "modelVariantValue: summary.value",
]) {
  assert.ok(route.includes(required), `${routePath} should include ${required}`);
}

assert.ok(
  route.split("...(modelVariantValue ? { variant: modelVariantValue } : {})").length - 1 >= 2,
  "normal composer sends and immediate desk sends should both include the selected reasoning profile",
);

for (const required of [
  "title={props.modelBehaviorTitle}",
  "value={props.modelVariant}",
  "options={props.modelBehaviorOptions}",
  "isProviderDefault={props.modelBehaviorIsProviderDefault}",
  "onChange={props.onModelVariantChange}",
]) {
  assert.ok(composer.includes(required), `${composerPath} should include ${required}`);
}

for (const effort of ["none", "minimal", "low", "medium", "high", "xhigh"]) {
  assert.ok(behavior.includes(`"${effort}"`), `${behaviorPath} should support ${effort}`);
}

console.log("reasoning-effort-control: ok");
