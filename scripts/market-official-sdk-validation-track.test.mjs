#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
let failures = 0;

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function pass(label) {
  console.log(`PASS ${label}`);
}

function fail(label, detail = "missing") {
  failures += 1;
  console.error(`FAIL ${label}`);
  console.error(`  ${detail}`);
}

function mustContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (text.includes(needle)) pass(`${path} contains ${needle}`);
    else fail(`${path} contains ${needle}`);
  }
  return text;
}

function mustNotContain(path, needles) {
  const text = read(path);
  for (const needle of needles) {
    if (text.includes(needle)) fail(`${path} excludes ${needle}`, "present");
    else pass(`${path} excludes ${needle}`);
  }
  return text;
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["test:market-official-sdk-validation-track"] === "node scripts/market-official-sdk-validation-track.test.mjs") {
  pass("package.json exposes test:market-official-sdk-validation-track");
} else {
  fail("package.json exposes test:market-official-sdk-validation-track");
}

mustContain("docs/market-official-sdk-validation.md", [
  "Hyperliquid's official SDK",
  "@polymarket/clob-client",
  "requiresClientValidation: true",
  "canSubmit: false",
  "externalSignerOnly: true",
  "Matterhorn must not ask for, store, log, transmit, or import seed phrases",
  "Matterhorn must not add `/api/hyperliquid/orders/submit` or `/api/polymarket/orders/submit`",
  "Testnet validation must happen outside Matterhorn's server process",
  "Redacted Matterhorn typed-data template",
  "Official-client normalized typed-data/order",
]);

mustContain("docs/hyperliquid-read-preview.md", [
  "requiresClientValidation",
  "official Hyperliquid SDK",
  "Matterhorn does **not** compute the `connectionId`",
  "canSubmit: false",
]);

mustContain("docs/polymarket-read-preview.md", [
  "requiresClientValidation",
  "@polymarket/clob-client",
  "never the signature, API key, or submission",
  "canSubmit: false",
]);

const hyperliquidTool = mustContain("apps/server/src/tools/hyperliquid.ts", [
  "requiresClientValidation: true",
  "clientMustCompute",
  "connectionId",
  "official Hyperliquid SDK",
  "canSubmit: false",
  "externalSignerOnly: true",
]);
if (/requiresClientValidation:\s*false/.test(hyperliquidTool)) fail("Hyperliquid payloads keep requiresClientValidation true", "found false");
else pass("Hyperliquid payloads keep requiresClientValidation true");
if (/canSubmit:\s*true/.test(hyperliquidTool)) fail("Hyperliquid payloads never enable canSubmit", "found true");
else pass("Hyperliquid payloads never enable canSubmit");

const polymarketTool = mustContain("apps/server/src/tools/polymarket.ts", [
  "requiresClientValidation: true",
  "walletMustSet",
  "@polymarket/clob-client",
  "POLYMARKET_EXCHANGE_ADDRESS",
  "canSubmit: false",
  "externalSignerOnly: true",
]);
if (/requiresClientValidation:\s*false/.test(polymarketTool)) fail("Polymarket payloads keep requiresClientValidation true", "found false");
else pass("Polymarket payloads keep requiresClientValidation true");
if (/canSubmit:\s*true/.test(polymarketTool)) fail("Polymarket payloads never enable canSubmit", "found true");
else pass("Polymarket payloads never enable canSubmit");

mustNotContain("apps/server/src/server.ts", [
  "/api/hyperliquid/orders/submit",
  "/api/polymarket/orders/submit",
]);

for (const [label, text] of [["Hyperliquid", hyperliquidTool], ["Polymarket", polymarketTool]]) {
  for (const forbidden of ["privateKey =", "apiSecret =", "seedPhrase =", "mnemonic ="]) {
    if (text.includes(forbidden)) fail(`${label} SDK validation track excludes ${forbidden}`, "present");
    else pass(`${label} SDK validation track excludes ${forbidden}`);
  }
}

if (failures > 0) {
  console.error(`Market official SDK validation track gate failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log("Market official SDK validation track gate passed.");
