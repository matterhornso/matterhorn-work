#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const template = readFileSync(".env.example", "utf8");
const activeEntries = new Map();

for (const rawLine of template.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  assert.ok(separator > 0, `Invalid active environment line: ${line}`);
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim();
  assert.ok(!activeEntries.has(key), `Duplicate environment key: ${key}`);
  activeEntries.set(key, value);
}

const requiredActiveKeys = [
  "MATTERHORN_WORK_SERVER_URL",
  "MATTERHORN_WORK_TOKEN",
  "MATTERHORN_WORKSPACE_ID",
  "MATTERHORN_APP_URL",
  "OPENWORK_HOST",
  "OPENWORK_PORT",
  "MATTERHORN_WORK_HOST_TOKEN",
  "MATTERHORN_WORK_WORKSPACES",
  "MATTERHORN_WORK_OPENCODE_BASE_URL",
  "MATTERHORN_WORK_OPENCODE_USERNAME",
  "MATTERHORN_WORK_OPENCODE_PASSWORD",
  "MATTERHORN_WORK_APPROVAL_MODE",
  "MATTERHORN_WORK_CORS_ORIGINS",
  "MATTERHORN_WORK_REQUEST_RATE_LIMIT_ENABLED",
  "MATTERHORN_BILLING_MODE",
  "MATTERHORN_BILLING_PROVIDER",
  "MATTERHORN_STRIPE_SECRET_KEY",
  "MATTERHORN_STRIPE_WEBHOOK_SECRET",
  "MATTERHORN_STRIPE_PRICE_ID_PLUS",
  "MATTERHORN_STRIPE_PRICE_ID_MAX",
  "MATTERHORN_STRIPE_TEST_CUSTOMER_ID",
  "MATTERHORN_IMAGE_PROVIDER",
  "OPENAI_API_KEY",
  "MATTERHORN_WALRUS_PUBLISHER_URL",
  "MATTERHORN_WALRUS_RELAY_URL",
  "MATTERHORN_WALRUS_STORAGE_EPOCHS",
  "MATTERHORN_SUI_NETWORK",
  "MATTERHORN_SUI_NFT_PACKAGE_ID",
  "MATTERHORN_SUI_NFT_MODULE_NAME",
  "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
  "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
  "VITE_MATTERHORN_WORK_URL",
  "VITE_MATTERHORN_CLOUD_ENABLED",
];

for (const key of requiredActiveKeys) {
  assert.ok(activeEntries.has(key), `.env.example must include ${key}`);
  assert.notEqual(activeEntries.get(key), "", `.env.example must not leave ${key} blank`);
}

for (const key of [
  "MATTERHORN_WORK_TOKEN",
  "MATTERHORN_WORK_HOST_TOKEN",
  "MATTERHORN_WORK_OPENCODE_USERNAME",
  "MATTERHORN_WORK_OPENCODE_PASSWORD",
  "MATTERHORN_STRIPE_SECRET_KEY",
  "MATTERHORN_STRIPE_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
]) {
  assert.match(activeEntries.get(key), /^<[^>]+>$/, `${key} must remain a redacted placeholder`);
}

assert.equal(activeEntries.get("OPENWORK_HOST"), "127.0.0.1", "backend should bind to loopback behind the deployment proxy");
assert.equal(activeEntries.get("MATTERHORN_WORK_APPROVAL_MODE"), "manual");
assert.equal(activeEntries.get("MATTERHORN_WORK_REQUEST_RATE_LIMIT_ENABLED"), "true");
assert.equal(activeEntries.get("MATTERHORN_BILLING_MODE"), "phase1_stripe_test");
assert.equal(activeEntries.get("MATTERHORN_BILLING_PROVIDER"), "stripe");
assert.equal(activeEntries.get("MATTERHORN_IMAGE_PROVIDER"), "openai");
assert.equal(activeEntries.get("MATTERHORN_SUI_NETWORK"), "sui-testnet");
assert.equal(activeEntries.get("VITE_MATTERHORN_CLOUD_ENABLED"), "0", "Cloud stays off until its separate acceptance gate passes");

const corsOrigins = activeEntries.get("MATTERHORN_WORK_CORS_ORIGINS");
assert.ok(corsOrigins.startsWith("https://"), "production CORS must name an HTTPS app origin");
assert.ok(!corsOrigins.includes("*"), "production CORS must never use a wildcard");
assert.ok(!/localhost|127\.0\.0\.1/i.test(corsOrigins), "production CORS must not use a loopback app origin");

for (const key of ["MATTERHORN_WORK_SERVER_URL", "MATTERHORN_APP_URL", "VITE_MATTERHORN_WORK_URL", "MATTERHORN_WALRUS_PUBLISHER_URL", "MATTERHORN_WALRUS_RELAY_URL"]) {
  assert.ok(activeEntries.get(key).startsWith("https://"), `${key} must use HTTPS in the launch template`);
}

assert.ok(!/(?:sk_live_|sk_test_|whsec_)[A-Za-z0-9]/.test(template), "template must not contain Stripe credentials");
assert.ok(!/OPENAI_API_KEY=(?!<)/.test(template), "template must not contain an OpenAI credential");

const serverConfig = readFileSync("apps/server/src/config.ts", "utf8");
for (const suffix of [
  "TOKEN",
  "HOST_TOKEN",
  "WORKSPACES",
  "OPENCODE_BASE_URL",
  "OPENCODE_USERNAME",
  "OPENCODE_PASSWORD",
  "APPROVAL_MODE",
  "CORS_ORIGINS",
  "REQUEST_RATE_LIMIT_ENABLED",
]) {
  assert.ok(serverConfig.includes(`readMatterhornEnv(\"${suffix}\")`), `server config must read MATTERHORN_WORK_${suffix}`);
}

const billing = readFileSync("apps/server/src/billing.ts", "utf8");
for (const key of requiredActiveKeys.filter((key) => key.startsWith("MATTERHORN_BILLING_") || key.startsWith("MATTERHORN_STRIPE_"))) {
  assert.ok(billing.includes(`env.${key}`), `billing runtime must read ${key}`);
}

const imageProvider = readFileSync("apps/server/src/image-generation-provider.ts", "utf8");
for (const key of ["MATTERHORN_IMAGE_PROVIDER", "OPENAI_API_KEY", "MATTERHORN_IMAGE_MODEL", "MATTERHORN_IMAGE_SIZE", "MATTERHORN_IMAGE_QUALITY", "MATTERHORN_IMAGE_FORMAT"]) {
  assert.ok(imageProvider.includes(`env.${key}`), `image provider runtime must read ${key}`);
}

const mediaReadiness = readFileSync("scripts/generated-media-production-readiness.mjs", "utf8");
for (const key of requiredActiveKeys.filter((key) => key.startsWith("MATTERHORN_WALRUS_") || key.startsWith("MATTERHORN_SUI_"))) {
  assert.ok(mediaReadiness.includes(`envVar: \"${key}\"`), `generated-media readiness must track ${key}`);
}

const appProviders = readFileSync("apps/app/src/react-app/shell/providers.tsx", "utf8");
assert.ok(appProviders.includes("VITE_MATTERHORN_WORK_URL"), "web app must read VITE_MATTERHORN_WORK_URL");

const rcPack = readFileSync("scripts/monday-beta-rc-pack.mjs", "utf8");
for (const key of ["MATTERHORN_WORK_SERVER_URL", "MATTERHORN_WORK_TOKEN", "MATTERHORN_WORKSPACE_ID", "MATTERHORN_APP_URL"]) {
  assert.ok(rcPack.includes(`process.env.${key}`), `release pack must read ${key}`);
}

const guide = readFileSync("docs/production-launch-configuration.md", "utf8");
for (const phrase of [
  "Connect wallet",
  "Connect provider",
  "Platform setup",
  "Configure cloud",
  "phase1_stripe_test",
  "--require-production",
  "--include-generated-media-flow",
  "pnpm test:matterhorn-platform-safety",
  "pnpm --filter matterhorn-work-orchestrator build:sidecars",
  "node scripts/release/review.mjs --strict --json",
  "pnpm desktop:release-doctor",
  "pnpm smoke:desktop-packaged-clean-profile",
]) {
  assert.ok(guide.includes(phrase), `production launch guide must explain ${phrase}`);
}

const docsIndex = readFileSync("docs/README.md", "utf8");
assert.ok(docsIndex.includes("production-launch-configuration.md"), "docs index must link the production launch guide");
assert.ok(docsIndex.includes("friday-production-go-live-readiness-2026-07-17.md"), "docs index must link the Friday production readiness ledger");
assert.ok(docsIndex.includes("friday-production-go-live-execution-2026-07-17.md"), "docs index must link the Friday production execution runbook");

console.log("Matterhorn production launch environment contract passed.");
