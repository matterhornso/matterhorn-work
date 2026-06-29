#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const scriptPath = join(repoRoot, "scripts/lighthouse-playwright-harness.mjs");
const docPath = join(repoRoot, "docs/performance/lighthouse-playwright-harness.md");
const packagePath = join(repoRoot, "package.json");

const script = readFileSync(scriptPath, "utf8");
const doc = readFileSync(docPath, "utf8");
const pkg = JSON.parse(readFileSync(packagePath, "utf8"));

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

assert(pkg.devDependencies?.lighthouse, "lighthouse is installed as a root dev dependency");
assert(pkg.devDependencies?.playwright, "playwright remains available to the harness");
assert(
  pkg.scripts?.["test:lighthouse-playwright"] === "node scripts/lighthouse-playwright-harness.mjs",
  "package.json exposes test:lighthouse-playwright",
);
assert(
  pkg.scripts?.["test:lighthouse-playwright-harness"] === "node scripts/lighthouse-playwright-harness.test.mjs",
  "package.json exposes test:lighthouse-playwright-harness",
);

for (const required of [
  'import lighthouse from "lighthouse"',
  'import { chromium } from "playwright"',
  "performance",
  "accessibility",
  "best-practices",
  "seo",
  "network-dependency-graph.json",
  "network-dependency-graph.dot",
  "summary.md",
  "summary.json",
  "screenshot.png",
  'waitUntil: "domcontentloaded"',
  "runLighthousePlaywrightHarness",
]) {
  assert(script.includes(required), `harness script includes ${required}`);
}

for (const required of [
  "Matterhorn Lighthouse + Playwright Harness",
  "pnpm dev:headless-web",
  "MATTERHORN_LIGHTHOUSE_URL",
  "Atomic Design Performance Checklist",
  "Graph Outputs",
  "Graphify-friendly",
  "performance",
  "accessibility",
  "best-practices",
  "SEO",
]) {
  assert(doc.includes(required), `harness doc includes ${required}`);
}

for (const forbidden of [
  "seed phrase",
  "private key",
  "raw signature",
  "signed payload",
  "wallet export",
]) {
  assert(!doc.toLowerCase().includes(`enter your ${forbidden}`), `doc does not ask users to enter ${forbidden}`);
  assert(!script.toLowerCase().includes(`enter your ${forbidden}`), `script does not ask users to enter ${forbidden}`);
}

console.log("Lighthouse Playwright harness contract passed.");
