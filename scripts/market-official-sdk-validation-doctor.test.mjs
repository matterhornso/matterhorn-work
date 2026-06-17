#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { runOfficialSdkValidationDoctor } from "./market-official-sdk-validation-doctor.mjs";

const safeEnv = {
  MARKET_OFFICIAL_SDK_VALIDATION_MODE: "operator_owned_testnet",
  HYPERLIQUID_VALIDATION_NETWORK: "hyperliquid-testnet",
  HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION: "fixture-hyperliquid-python-sdk",
  POLYMARKET_VALIDATION_NETWORK: "polygon-amoy",
  POLYMARKET_CHAIN_ID: "80002",
  POLYMARKET_EXCHANGE_ADDRESS: "0x0000000000000000000000000000000000000001",
  POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION: "fixture-@polymarket/clob-client-v2",
};

let result = runOfficialSdkValidationDoctor({ env: safeEnv, strict: true, venue: "all" });
assert.equal(result.ok, true);
assert.equal(result.ready, true);
assert.equal(result.safety.liveSubmissionEnabled, false);
assert.equal(result.safety.acceptsSecrets, false);
assert.equal(result.checks.every((check) => check.status === "pass"), true);

result = runOfficialSdkValidationDoctor({ env: {}, strict: false, venue: "all" });
assert.equal(result.ok, true);
assert.equal(result.ready, false);
assert.ok(result.warnings.length >= 1);

result = runOfficialSdkValidationDoctor({ env: {}, strict: true, venue: "all" });
assert.equal(result.ok, false);
assert.equal(result.ready, false);
assert.match(result.errors.join("\n"), /MARKET_OFFICIAL_SDK_VALIDATION_MODE/);

result = runOfficialSdkValidationDoctor({
  env: {
    ...safeEnv,
    HYPERLIQUID_VALIDATION_NETWORK: "mainnet",
    POLYMARKET_CHAIN_ID: "137",
  },
  strict: true,
  venue: "all",
});
assert.equal(result.ok, false);
assert.match(result.errors.join("\n"), /mainnet/i);

result = runOfficialSdkValidationDoctor({
  env: {
    ...safeEnv,
    HYPERLIQUID_PRIVATE_KEY: "do-not-print-me",
    POLYMARKET_API_SECRET: "do-not-print-me-either",
  },
  strict: true,
  venue: "all",
});
assert.equal(result.ok, false);
assert.match(result.errors.join("\n"), /HYPERLIQUID_PRIVATE_KEY/);
assert.match(result.errors.join("\n"), /POLYMARKET_API_SECRET/);
assert.equal(JSON.stringify(result).includes("do-not-print"), false);

const cli = spawnSync("node", ["scripts/market-official-sdk-validation-doctor.mjs", "--strict", "--json"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: { ...process.env, ...safeEnv },
});
assert.equal(cli.status, 0, cli.stderr || cli.stdout);
const parsed = JSON.parse(cli.stdout);
assert.equal(parsed.ready, true);
assert.equal(parsed.safety.printsSecretValues, false);

console.log("Market official SDK validation doctor tests passed.");
