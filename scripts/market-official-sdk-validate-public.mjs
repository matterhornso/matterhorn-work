#!/usr/bin/env node

/**
 * Consolidated public official-SDK validation evidence builder.
 *
 * This script consumes public/redacted official-client artifacts only. It does
 * not run SDK clients, sign, submit, broadcast, or call exchanges.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { runOfficialSdkValidationDoctor } from "./market-official-sdk-validation-doctor.mjs";
import { normalizeOfficialSdkArtifact } from "./market-official-sdk-normalize.mjs";
import { buildCapturedEvidence } from "./market-official-sdk-validation-capture.mjs";

const MODES = new Set(["fixture", "operator_owned_fixture", "operator_owned_testnet"]);
const VERSION = "matterhorn.market.official-sdk-public-validation.v1";

const FORBIDDEN_JSON_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|walletExport|wallet_export|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedAction|signed_action|signedOrder|signed_order)$/i;
const FORBIDDEN_CLI_FLAG_RE =
  /^--(?:api[-_]?secret|api[-_]?key|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signed[-_]?payload|signed[-_]?order|wallet[-_]?export|keyfile|suri|password|passphrase)$/i;

function parseArgs(argv) {
  const args = argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    if (index >= 0) return args[index + 1] ?? "";
    const inline = args.find((arg) => arg.startsWith(`${name}=`));
    return inline ? inline.slice(name.length + 1) : "";
  };
  return {
    help: args.includes("--help") || args.includes("-h"),
    json: args.includes("--json"),
    strict: args.includes("--strict"),
    mode: value("--mode"),
    inputDir: value("--input-dir"),
    outputDir: value("--output-dir"),
    hyperliquidNetwork: value("--hyperliquid-network"),
    polymarketNetwork: value("--polymarket-network"),
    hyperliquidPackageVersion: value("--hyperliquid-package-version"),
    polymarketPackageVersion: value("--polymarket-package-version"),
    polymarketExchangeAddress: value("--polymarket-exchange-address"),
    polymarketChainId: value("--polymarket-chain-id"),
    rawArgs: args,
  };
}

function usage() {
  return [
    "Matterhorn market official SDK public validation",
    "",
    "Usage:",
    "  matterhorn-work crypto sdk-validate-public --mode fixture --input-dir qa-fixtures/market-official-sdk --output-dir /tmp/matterhorn-sdk-public --strict --json",
    "  matterhorn-work crypto sdk-validate-public --mode operator_owned_testnet --input-dir /tmp/operator-public-artifacts --output-dir /tmp/matterhorn-sdk-public --strict --json",
    "",
    "Input files:",
    "  Hyperliquid: hyperliquid-official-public.json, hyperliquid-normalized-action.json, or hyperliquid-normalized-action.fixture.json",
    "  Polymarket: polymarket-official-public.json, polymarket-normalized-typed-data.json, or polymarket-normalized-typed-data.fixture.json",
    "",
    "Modes:",
    "  fixture                  Checked-in fixture evidence only.",
    "  operator_owned_fixture   Operator-owned fixture evidence only.",
    "  operator_owned_testnet   Operator-owned testnet evidence only.",
    "",
    "This command hashes public artifacts, normalizes shapes, validates the",
    "Matterhorn evidence contract, and writes public/redacted evidence only.",
    "It does not accept credentials, signatures, signed payloads, or wallet exports.",
  ].join("\n");
}

function fail(message, json) {
  if (json) process.stdout.write(`${JSON.stringify({ ok: false, ready: false, error: message }, null, 2)}\n`);
  else process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function assertNoForbiddenFlags(rawArgs) {
  for (const item of rawArgs) {
    const key = item.split("=")[0] || item;
    if (FORBIDDEN_CLI_FLAG_RE.test(key)) {
      throw new Error(`Forbidden credential-shaped flag ${key} is not accepted by SDK public validation.`);
    }
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findForbiddenJsonKey(value, path = [], depth = 0) {
  if (depth > 50) return [...path, "too_deep"].join(".");
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenJsonKey(value[index], [...path, String(index)], depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (key !== "signatureType" && FORBIDDEN_JSON_KEY_RE.test(key)) return [...path, key].join(".");
    const found = findForbiddenJsonKey(child, [...path, key], depth + 1);
    if (found) return found;
  }
  return null;
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256Json(value) {
  return sha256Text(JSON.stringify(value));
}

function findInput(inputDir, candidates, label) {
  for (const name of candidates) {
    const path = join(inputDir, name);
    if (existsSync(path)) return path;
  }
  throw new Error(`Missing ${label} public artifact in ${inputDir}. Tried: ${candidates.join(", ")}.`);
}

function readPublicJson(path, label) {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw);
  const forbidden = findForbiddenJsonKey(parsed);
  if (forbidden) throw new Error(`${label} contains forbidden credential-shaped field: ${forbidden}.`);
  return {
    path,
    file: basename(path),
    raw,
    parsed,
    sha256: sha256Text(raw),
  };
}

function validationEnv(config) {
  if (config.mode === "fixture" || config.mode === "operator_owned_fixture") {
    return {
      MARKET_OFFICIAL_SDK_VALIDATION_MODE: config.mode,
      HYPERLIQUID_VALIDATION_NETWORK: config.hyperliquidNetwork || "fixture",
      HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION: config.hyperliquidPackageVersion || "fixture-hyperliquid-python-sdk",
      POLYMARKET_VALIDATION_NETWORK: config.polymarketNetwork || "fixture",
      POLYMARKET_CHAIN_ID: config.polymarketChainId || "80002",
      POLYMARKET_EXCHANGE_ADDRESS: config.polymarketExchangeAddress || "0x0000000000000000000000000000000000000001",
      POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION: config.polymarketPackageVersion || "fixture-@polymarket/clob-client-v2",
    };
  }

  return {
    ...process.env,
    MARKET_OFFICIAL_SDK_VALIDATION_MODE: config.mode,
    ...(config.hyperliquidNetwork ? { HYPERLIQUID_VALIDATION_NETWORK: config.hyperliquidNetwork } : {}),
    ...(config.hyperliquidPackageVersion ? { HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION: config.hyperliquidPackageVersion } : {}),
    ...(config.polymarketNetwork ? { POLYMARKET_VALIDATION_NETWORK: config.polymarketNetwork } : {}),
    ...(config.polymarketChainId ? { POLYMARKET_CHAIN_ID: config.polymarketChainId } : {}),
    ...(config.polymarketExchangeAddress ? { POLYMARKET_EXCHANGE_ADDRESS: config.polymarketExchangeAddress } : {}),
    ...(config.polymarketPackageVersion ? { POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION: config.polymarketPackageVersion } : {}),
  };
}

function artifactEntry(label, artifact, normalized, normalizedPath) {
  return {
    label,
    inputFile: artifact.file,
    inputSha256: artifact.sha256,
    normalizedFile: basename(normalizedPath),
    normalizedSha256: sha256Json(normalized),
  };
}

function markdownReport(report) {
  return [
    "# Matterhorn Market SDK Public Validation",
    "",
    `Status: ${report.ready ? "READY_FOR_TEST_CUSTOMER_QA" : report.ok ? "OK_WITH_WARNINGS" : "NOT_READY"}`,
    `Mode: ${report.mode}`,
    `Generated at: ${report.generatedAt}`,
    "",
    "## Safety",
    "",
    "| Invariant | Value |",
    "| --- | --- |",
    `| Non-custodial | ${report.safety.nonCustodial} |`,
    `| Live submission enabled | ${report.safety.liveSubmissionEnabled} |`,
    `| Signs or submits | ${report.safety.signsOrSubmits} |`,
    `| Accepts secrets | ${report.safety.acceptsSecrets} |`,
    "",
    "## Artifacts",
    "",
    "| Venue | Input file | Input SHA-256 | Normalized file | Normalized SHA-256 |",
    "| --- | --- | --- | --- | --- |",
    ...report.artifacts.map((artifact) => `| ${artifact.label} | ${artifact.inputFile} | ${artifact.inputSha256} | ${artifact.normalizedFile} | ${artifact.normalizedSha256} |`),
    "",
    "## Doctor Checks",
    "",
    "| Check | Status | Summary |",
    "| --- | --- | --- |",
    ...report.doctor.checks.map((check) => `| ${check.id} | ${check.status} | ${check.summary ?? ""} |`),
    "",
    "## Warnings",
    "",
    ...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Errors",
    "",
    ...(report.errors.length ? report.errors.map((error) => `- ${error}`) : ["- none"]),
    "",
    "## Red Lines",
    "",
    "- Matterhorn did not run private SDK signing.",
    "- Matterhorn did not compute final signatures.",
    "- Matterhorn did not submit orders.",
    "- Operator-provided official-client outputs were treated as public/redacted evidence.",
    "",
  ].join("\n");
}

export function runOfficialSdkPublicValidation(config) {
  if (!config.mode || !MODES.has(config.mode)) {
    throw new Error("Explicit --mode is required. Use fixture, operator_owned_fixture, or operator_owned_testnet.");
  }
  if (!config.inputDir) throw new Error("Missing --input-dir.");
  if (!config.outputDir) throw new Error("Missing --output-dir.");

  const inputDir = resolve(config.inputDir);
  const outputDir = resolve(config.outputDir);
  mkdirSync(outputDir, { recursive: true });

  const env = validationEnv(config);
  const doctor = runOfficialSdkValidationDoctor({ env, strict: true, venue: "all" });
  if (!doctor.ok) {
    return {
      version: VERSION,
      ok: false,
      ready: false,
      mode: config.mode,
      inputDir,
      outputDir,
      doctor,
      artifacts: [],
      files: {},
      errors: doctor.errors,
      warnings: doctor.warnings,
      safety: {
        nonCustodial: true,
        liveSubmissionEnabled: false,
        signsOrSubmits: false,
        acceptsSecrets: false,
      },
    };
  }

  const hyperliquidInput = readPublicJson(findInput(inputDir, [
    "hyperliquid-official-public.json",
    "hyperliquid-normalized-action.json",
    "hyperliquid-normalized-action.fixture.json",
  ], "Hyperliquid"), "Hyperliquid public artifact");
  const polymarketInput = readPublicJson(findInput(inputDir, [
    "polymarket-official-public.json",
    "polymarket-normalized-typed-data.json",
    "polymarket-normalized-typed-data.fixture.json",
  ], "Polymarket"), "Polymarket public artifact");

  const hyperliquidNormalized = normalizeOfficialSdkArtifact(hyperliquidInput.parsed, "hyperliquid");
  const polymarketNormalized = normalizeOfficialSdkArtifact(polymarketInput.parsed, "polymarket");

  const hyperliquidNormalizedPath = join(outputDir, "hyperliquid-official-normalized-action.json");
  const polymarketNormalizedPath = join(outputDir, "polymarket-official-normalized-typed-data.json");
  writeFileSync(hyperliquidNormalizedPath, `${JSON.stringify(hyperliquidNormalized, null, 2)}\n`);
  writeFileSync(polymarketNormalizedPath, `${JSON.stringify(polymarketNormalized, null, 2)}\n`);

  const captured = buildCapturedEvidence({
    hyperliquidPackageVersion: env.HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION,
    hyperliquidNormalized,
    polymarketPackageVersion: env.POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION,
    polymarketExchangeAddress: env.POLYMARKET_EXCHANGE_ADDRESS,
    polymarketChainId: env.POLYMARKET_CHAIN_ID,
    polymarketNormalized,
  });

  const generatedAt = new Date().toISOString();
  const artifacts = [
    artifactEntry("hyperliquid", hyperliquidInput, hyperliquidNormalized, hyperliquidNormalizedPath),
    artifactEntry("polymarket", polymarketInput, polymarketNormalized, polymarketNormalizedPath),
  ];
  const errors = [...doctor.errors, ...captured.errors];
  const warnings = [...doctor.warnings, ...captured.warnings];
  const ok = doctor.ok && captured.ok;
  const ready = doctor.ready && captured.ok && warnings.length === 0;
  const evidencePath = join(outputDir, "matterhorn-market-sdk-evidence.json");
  const reportPath = join(outputDir, "matterhorn-market-sdk-public-validation.json");
  const markdownPath = join(outputDir, "matterhorn-market-sdk-public-validation.md");
  const shaPath = join(outputDir, "matterhorn-market-sdk-public-validation.sha256");
  const files = {
    hyperliquidNormalized: hyperliquidNormalizedPath,
    polymarketNormalized: polymarketNormalizedPath,
    officialSdkEvidence: evidencePath,
    publicValidationJson: reportPath,
    publicValidationMarkdown: markdownPath,
    publicValidationSha256: shaPath,
  };

  writeFileSync(evidencePath, `${JSON.stringify(captured, null, 2)}\n`);

  const report = {
    version: VERSION,
    ok,
    ready,
    mode: config.mode,
    generatedAt,
    inputDir,
    outputDir,
    doctor,
    officialSdkValidation: {
      ok: captured.ok,
      errors: captured.errors,
      warnings: captured.warnings,
      allValidated: captured.evidence.venues.every((venue) => venue.status === "validated"),
    },
    artifacts,
    files,
    errors,
    warnings,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
      requiresClientValidation: true,
    },
  };

  const reportJson = JSON.stringify(report, null, 2);
  const reportMarkdown = markdownReport(report);
  writeFileSync(reportPath, `${reportJson}\n`);
  writeFileSync(markdownPath, reportMarkdown);
  writeFileSync(shaPath, `${sha256Text(reportJson)}  ${basename(reportPath)}\n${sha256Text(reportMarkdown)}  ${basename(markdownPath)}\n`);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs(process.argv);
  if (config.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  try {
    assertNoForbiddenFlags(config.rawArgs);
    const report = runOfficialSdkPublicValidation(config);
    if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else {
      process.stdout.write(`Matterhorn official SDK public validation: ${report.ready ? "READY" : report.ok ? "OK_WITH_WARNINGS" : "NOT_READY"}\n`);
      for (const [label, file] of Object.entries(report.files)) process.stdout.write(`- ${label}: ${file}\n`);
      for (const warning of report.warnings) process.stderr.write(`Warning: ${warning}\n`);
      for (const error of report.errors) process.stderr.write(`Error: ${error}\n`);
    }
    process.exit(report.ok && (!config.strict || report.ready) ? 0 : 1);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), config.json);
  }
}
