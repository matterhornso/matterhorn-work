#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const packageJson = JSON.parse(read("package.json"));
assert.equal(
  packageJson.scripts?.["test:matterhorn-design-system"],
  "node scripts/matterhorn-design-system.test.mjs",
  "package.json should expose the Matterhorn design system gate",
);

const design = read("DESIGN.md");
const uiDesign = read("docs/ui/matterhorn-design-system.md");
const css = read("apps/app/src/app/index.css");
const all = `${design}\n${uiDesign}\n${css}`;

for (const phrase of [
  "desk-first",
  "Home, Bittensor, Hyperliquid, Polymarket, Longevity, Memory, MCPs, and Settings",
  "#0C0C0C",
  "#D1F2FF",
  "Matterhorn logo",
  "Aeonik",
  "electric cyan",
  "blue / green",
  "purple / amber",
  "coral / mint",
  "gold / slate",
  "Safety Strip",
  "Can submit",
  "Live submission",
  "External signer/client required",
  "SS58",
  "coldkey",
  "hotkey",
  "Prepare stake preview",
  "Prepare unstake preview",
  "Prepare transfer preview",
  "Compliance-blocked previews must not expose executable price, size, or share fields",
  "safe offline optimization workflows",
  "No hidden saves",
  "No hidden memory saves",
  "No horizontal overflow",
  "composer does not overlap cards",
]) {
  assert.ok(all.includes(phrase), `design contract should include: ${phrase}`);
}

for (const token of [
  "--desk-bittensor",
  "--desk-hyperliquid",
  "--desk-polymarket",
  "--desk-wellness",
  "--desk-memory",
  "--status-preview",
  "--status-blocked",
  "--nav-rail-width",
]) {
  assert.ok(css.includes(token), `app theme should expose semantic token: ${token}`);
}

for (const forbidden of [
  "Customer-facing `Services` primary nav is allowed",
  "Hyperliquid live submit is enabled",
  "Polymarket live submit is enabled",
  "Show a seed phrase field",
  "Show a private key field",
  "Show a raw signature field",
]) {
  assert.equal(all.includes(forbidden), false, `design contract must not include forbidden claim: ${forbidden}`);
}

console.log("Matterhorn design system gate passed.");
