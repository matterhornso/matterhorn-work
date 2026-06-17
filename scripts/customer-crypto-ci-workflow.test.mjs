#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/ci-tests.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

assert.equal(
  packageJson.scripts?.["test:customer-crypto-ci-workflow"],
  "node scripts/customer-crypto-ci-workflow.test.mjs",
  "package.json should expose the customer crypto CI workflow gate",
);

for (const phrase of [
  "customer-crypto-gates:",
  "name: customer-crypto-gates",
  "runs-on: ubuntu-22.04",
  "oven-sh/setup-bun@v2",
  "pnpm install --frozen-lockfile --ignore-scripts --prefer-offline",
  "pnpm test:customer-ready-crypto-smoke",
  "pnpm test:agent-control-mcp",
  "pnpm smoke:customer-ready-crypto",
]) {
  assert.ok(workflow.includes(phrase), `CI workflow should include ${phrase}`);
}

for (const forbidden of [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
  "/orders/submit",
  "/orders/sign",
  "/exchange/submit",
  "privateKey =",
  "apiSecret =",
]) {
  assert.equal(workflow.includes(forbidden), false, `CI workflow must not include ${forbidden}`);
}

console.log("Customer crypto CI workflow check passed.");
