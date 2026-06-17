#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildMarketCustomerEvidenceBundle } from "./market-customer-evidence-bundle.mjs";
import { buildCapturedEvidence } from "./market-official-sdk-validation-capture.mjs";
import { runOfficialSdkValidationDoctor } from "./market-official-sdk-validation-doctor.mjs";
import { normalizeOfficialSdkArtifact } from "./market-official-sdk-normalize.mjs";

const FIXTURE_ENV = {
  MARKET_OFFICIAL_SDK_VALIDATION_MODE: "fixture",
  HYPERLIQUID_VALIDATION_NETWORK: "fixture",
  HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION: "fixture-hyperliquid-python-sdk",
  POLYMARKET_VALIDATION_NETWORK: "fixture",
  POLYMARKET_CHAIN_ID: "80002",
  POLYMARKET_EXCHANGE_ADDRESS: "0x0000000000000000000000000000000000000001",
  POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION: "fixture-@polymarket/clob-client-v2",
};

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
    fixture: args.includes("--fixture"),
    requireOfficialSdkValidated: args.includes("--require-official-sdk-validated"),
    outputDir: value("--output-dir") || "/tmp/matterhorn-market-sdk-operator-loop",
    customerReadySmoke: value("--customer-ready-smoke"),
    hyperliquidOfficialPublic: value("--hyperliquid-official-public"),
    polymarketOfficialPublic: value("--polymarket-official-public"),
    hyperliquidPackageVersion: value("--hyperliquid-package-version"),
    polymarketPackageVersion: value("--polymarket-package-version"),
    polymarketExchangeAddress: value("--polymarket-exchange-address"),
    polymarketChainId: value("--polymarket-chain-id"),
  };
}

function usage() {
  return [
    "Matterhorn market official SDK operator loop",
    "",
    "Usage:",
    "  node scripts/market-official-sdk-operator-loop.mjs --fixture --output-dir /tmp/matterhorn-market-sdk --json",
    "  node scripts/market-official-sdk-operator-loop.mjs \\",
    "    --hyperliquid-official-public /tmp/operator-hyperliquid-public.json \\",
    "    --polymarket-official-public /tmp/operator-polymarket-public.json \\",
    "    --customer-ready-smoke /tmp/matterhorn-crypto-smoke.json \\",
    "    --output-dir /tmp/matterhorn-market-sdk --json",
    "",
    "This command chains doctor -> normalize -> capture evidence -> optional customer bundle.",
    "Inputs must be public/redacted official-client JSON. It does not run SDKs, sign, submit, or call exchanges.",
  ].join("\n");
}

function readJson(path, label) {
  if (!path) throw new Error(`Missing ${label}.`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function fixturePath(name) {
  return join(process.cwd(), "qa-fixtures/market-official-sdk", name);
}

function operatorEnv(config) {
  if (config.fixture) return FIXTURE_ENV;
  return {
    ...process.env,
    ...(config.hyperliquidPackageVersion ? { HYPERLIQUID_OFFICIAL_SDK_PACKAGE_VERSION: config.hyperliquidPackageVersion } : {}),
    ...(config.polymarketPackageVersion ? { POLYMARKET_OFFICIAL_SDK_PACKAGE_VERSION: config.polymarketPackageVersion } : {}),
    ...(config.polymarketExchangeAddress ? { POLYMARKET_EXCHANGE_ADDRESS: config.polymarketExchangeAddress } : {}),
    ...(config.polymarketChainId ? { POLYMARKET_CHAIN_ID: config.polymarketChainId } : {}),
  };
}

function formatCheck(check) {
  return `| ${check.id} | ${check.status} | ${check.summary ?? ""} |`;
}

function buildOperatorSummary({ outputDir, doctor, captured, customerBundle, files, ready, ok, errors, warnings }) {
  const status = ready ? "READY_FOR_TEST_CUSTOMER_QA" : ok ? "OK_WITH_WARNINGS" : "NOT_READY";
  const venues = Array.isArray(captured?.evidence?.venues) ? captured.evidence.venues : [];
  return [
    "# Matterhorn Market Official SDK Operator Summary",
    "",
    `Status: ${status}`,
    `Output directory: ${outputDir}`,
    "",
    "## Safety",
    "",
    "| Invariant | Value |",
    "| --- | --- |",
    "| Non-custodial | true |",
    "| Live submission enabled | false |",
    "| Signs or submits | false |",
    "| Accepts secrets | false |",
    "",
    "## Doctor Checks",
    "",
    "| Check | Status | Summary |",
    "| --- | --- | --- |",
    ...(doctor?.checks ?? []).map(formatCheck),
    "",
    "## Venue Validation",
    "",
    "| Venue | Status | Official client | Package/version |",
    "| --- | --- | --- | --- |",
    ...venues.map((venue) => `| ${venue.venue} | ${venue.status} | ${venue.officialClient?.name ?? ""} | ${venue.officialClient?.packageVersion ?? ""} |`),
    "",
    "## Generated Files",
    "",
    ...Object.entries(files).map(([label, file]) => `- ${label}: ${file}`),
    "",
    "## Customer Evidence",
    "",
    customerBundle
      ? `Customer evidence status: ${customerBundle.summary.ready ? "READY_FOR_TEST_CUSTOMER_QA" : "NOT_READY"}`
      : "Customer evidence bundle: not requested",
    "",
    "## Warnings",
    "",
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Errors",
    "",
    ...(errors.length ? errors.map((error) => `- ${error}`) : ["- none"]),
    "",
  ].join("\n");
}

export async function runMarketOfficialSdkOperatorLoop(config) {
  const outputDir = resolve(config.outputDir || "/tmp/matterhorn-market-sdk-operator-loop");
  mkdirSync(outputDir, { recursive: true });

  const env = operatorEnv(config);
  const doctor = runOfficialSdkValidationDoctor({ env, strict: true, venue: "all" });
  if (!doctor.ok) {
    return {
      ok: false,
      ready: false,
      outputDir,
      doctor,
      errors: doctor.errors,
      warnings: doctor.warnings,
      files: {},
    };
  }

  const hyperliquidInput = config.fixture
    ? fixturePath("hyperliquid-normalized-action.fixture.json")
    : config.hyperliquidOfficialPublic;
  const polymarketInput = config.fixture
    ? fixturePath("polymarket-normalized-typed-data.fixture.json")
    : config.polymarketOfficialPublic;
  const hyperliquidNormalized = normalizeOfficialSdkArtifact(readJson(hyperliquidInput, "--hyperliquid-official-public"), "hyperliquid");
  const polymarketNormalized = normalizeOfficialSdkArtifact(readJson(polymarketInput, "--polymarket-official-public"), "polymarket");

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
  const evidencePath = join(outputDir, "matterhorn-market-sdk-evidence.json");
  writeFileSync(evidencePath, `${JSON.stringify(captured, null, 2)}\n`);

  const files = {
    hyperliquidNormalized: hyperliquidNormalizedPath,
    polymarketNormalized: polymarketNormalizedPath,
    officialSdkEvidence: evidencePath,
  };
  let customerBundle = null;
  let customerEvidenceMarkdownPath = null;
  let customerEvidenceJsonPath = null;
  if (config.customerReadySmoke) {
    customerEvidenceMarkdownPath = join(outputDir, "matterhorn-market-customer-evidence.md");
    customerEvidenceJsonPath = join(outputDir, "matterhorn-market-customer-evidence.json");
    customerBundle = await buildMarketCustomerEvidenceBundle({
      title: "Matterhorn Work Market Customer Evidence Bundle",
      customerReadySmoke: config.customerReadySmoke,
      officialSdkValidation: evidencePath,
      requireOfficialSdkValidated: Boolean(config.requireOfficialSdkValidated),
    });
    files.customerEvidenceMarkdown = customerEvidenceMarkdownPath;
    files.customerEvidenceJson = customerEvidenceJsonPath;
  }

  const errors = [...doctor.errors, ...captured.errors, ...(customerBundle?.summary.errors ?? [])];
  const warnings = [...doctor.warnings, ...captured.warnings, ...(customerBundle?.summary.warnings ?? [])];
  const ok = captured.ok && (!customerBundle || customerBundle.summary.ready);
  const ready = captured.ok && doctor.ready && (!customerBundle || customerBundle.summary.ready);
  const summaryPath = join(outputDir, "matterhorn-market-sdk-operator-summary.md");
  files.operatorSummaryMarkdown = summaryPath;
  writeFileSync(summaryPath, buildOperatorSummary({
    outputDir,
    doctor,
    captured,
    customerBundle,
    files,
    ready,
    ok,
    errors,
    warnings,
  }));

  if (config.customerReadySmoke) {
    customerBundle = await buildMarketCustomerEvidenceBundle({
      title: "Matterhorn Work Market Customer Evidence Bundle",
      customerReadySmoke: config.customerReadySmoke,
      officialSdkValidation: evidencePath,
      operatorSummary: summaryPath,
      requireOfficialSdkValidated: Boolean(config.requireOfficialSdkValidated),
    });
    writeFileSync(customerEvidenceMarkdownPath, customerBundle.markdown);
    writeFileSync(customerEvidenceJsonPath, `${JSON.stringify(customerBundle.summary, null, 2)}\n`);
  }

  return {
    ok,
    ready,
    outputDir,
    doctor,
    officialSdkValidation: {
      ok: captured.ok,
      errors: captured.errors,
      warnings: captured.warnings,
      allValidated: captured.evidence.venues.every((venue) => venue.status === "validated"),
    },
    customerEvidence: customerBundle?.summary ?? null,
    errors,
    warnings,
    files,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs(process.argv);
  if (config.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  runMarketOfficialSdkOperatorLoop(config)
    .then((result) => {
      if (config.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      else {
        process.stdout.write(`Matterhorn market official SDK operator loop: ${result.ready ? "READY" : result.ok ? "OK_WITH_WARNINGS" : "NOT_READY"}\n`);
        for (const [label, file] of Object.entries(result.files)) process.stdout.write(`- ${label}: ${file}\n`);
        for (const warning of result.warnings) process.stderr.write(`Warning: ${warning}\n`);
        for (const error of result.errors) process.stderr.write(`Error: ${error}\n`);
      }
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
