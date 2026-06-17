#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import {
  sampleEvidence,
  validateEvidenceBundle,
} from "./market-official-sdk-validation-evidence.mjs";

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
    selfTest: args.includes("--self-test"),
    output: value("--output") || value("-o"),
    generatedAt: value("--generated-at"),
    validatedAt: value("--validated-at"),
    hyperliquidNormalized: value("--hyperliquid-normalized"),
    hyperliquidPackageVersion: value("--hyperliquid-package-version"),
    hyperliquidPublicReceipt: value("--hyperliquid-public-receipt"),
    polymarketNormalized: value("--polymarket-normalized"),
    polymarketPackageVersion: value("--polymarket-package-version"),
    polymarketExchangeAddress: value("--polymarket-exchange-address"),
    polymarketChainId: value("--polymarket-chain-id"),
    polymarketPublicReceipt: value("--polymarket-public-receipt"),
  };
}

function printHelp() {
  process.stdout.write([
    "Matterhorn market official SDK validation capture",
    "",
    "Usage:",
    "  node scripts/market-official-sdk-validation-capture.mjs --json",
    "  node scripts/market-official-sdk-validation-capture.mjs \\",
    "    --hyperliquid-normalized <redacted-action.json> \\",
    "    --hyperliquid-package-version <version> \\",
    "    --polymarket-normalized <redacted-typed-data.json> \\",
    "    --polymarket-package-version <version> \\",
    "    --output /tmp/matterhorn-market-sdk-evidence.json",
    "",
    "The normalized JSON files must be public/redacted official-client output.",
    "Hyperliquid evidence must come from hyperliquid-python-sdk.",
    "Polymarket evidence must come from @polymarket/clob-client-v2 or @polymarket/clob-client.",
    "Captured evidence is still validated for canSubmit:false and liveSubmissionEnabled:false.",
    "Do not pass private keys, API secrets, raw signatures, signed payloads, or wallet exports.",
    "",
  ].join("\n"));
}

function readJsonFile(path, label) {
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label}: ${error.message}`);
  }
}

function publicHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedArtifact(kind, value) {
  if (!value) return null;
  return {
    kind,
    source: "operator_redacted_official_client_json",
    sha256: publicHash(value),
    content: value,
  };
}

function captureVenue(evidence, venueName, config) {
  const venue = evidence.venues.find((entry) => entry.venue === venueName);
  if (!venue) throw new Error(`Missing sample venue ${venueName}.`);

  if (venueName === "hyperliquid") {
    const normalized = normalizedArtifact("hyperliquid-official-normalized-action", config.hyperliquidNormalized);
    if (!normalized) return;
    venue.status = "validated";
    venue.officialClient.packageVersion = config.hyperliquidPackageVersion || null;
    venue.validation = {
      validatedAt: config.validatedAt,
      officialClientNormalized: normalized,
      differences: [],
      publicReceipt: config.hyperliquidPublicReceipt ?? null,
    };
    return;
  }

  if (venueName === "polymarket") {
    const normalized = normalizedArtifact("polymarket-official-normalized-typed-data-or-order", config.polymarketNormalized);
    if (!normalized) return;
    venue.status = "validated";
    venue.officialClient.packageVersion = config.polymarketPackageVersion || null;
    venue.environment = {
      ...venue.environment,
      exchangeAddress: config.polymarketExchangeAddress || null,
      chainId: config.polymarketChainId ? Number(config.polymarketChainId) : null,
    };
    venue.validation = {
      validatedAt: config.validatedAt,
      officialClientNormalized: normalized,
      differences: [],
      publicReceipt: config.polymarketPublicReceipt ?? null,
    };
  }
}

export function buildCapturedEvidence(input = {}) {
  const generatedAt = input.generatedAt || new Date().toISOString();
  const validatedAt = input.validatedAt || generatedAt;
  const evidence = sampleEvidence();
  evidence.generatedAt = generatedAt;

  const config = {
    ...input,
    validatedAt,
    hyperliquidNormalized: input.hyperliquidNormalized ?? null,
    hyperliquidPublicReceipt: input.hyperliquidPublicReceipt ?? null,
    polymarketNormalized: input.polymarketNormalized ?? null,
    polymarketPublicReceipt: input.polymarketPublicReceipt ?? null,
  };

  captureVenue(evidence, "hyperliquid", config);
  captureVenue(evidence, "polymarket", config);
  const validation = validateEvidenceBundle(evidence);
  return { ...validation, evidence };
}

function loadCaptureInput(config) {
  return {
    generatedAt: config.generatedAt,
    validatedAt: config.validatedAt,
    hyperliquidNormalized: readJsonFile(config.hyperliquidNormalized, "Hyperliquid normalized official-client artifact"),
    hyperliquidPackageVersion: config.hyperliquidPackageVersion,
    hyperliquidPublicReceipt: readJsonFile(config.hyperliquidPublicReceipt, "Hyperliquid public receipt"),
    polymarketNormalized: readJsonFile(config.polymarketNormalized, "Polymarket normalized official-client artifact"),
    polymarketPackageVersion: config.polymarketPackageVersion,
    polymarketExchangeAddress: config.polymarketExchangeAddress,
    polymarketChainId: config.polymarketChainId,
    polymarketPublicReceipt: readJsonFile(config.polymarketPublicReceipt, "Polymarket public receipt"),
  };
}

function runSelfTest() {
  const result = buildCapturedEvidence({
    generatedAt: new Date(0).toISOString(),
    validatedAt: new Date(0).toISOString(),
    hyperliquidPackageVersion: "0.15.0",
    hyperliquidNormalized: {
      type: "order",
      grouping: "na",
      orders: [{ a: 0, b: true, p: "3000", s: "0.01", r: false, t: { limit: { tif: "Gtc" } } }],
      clientMustCompute: ["nonce", "connectionId", "signature"],
    },
    polymarketPackageVersion: "4.22.0",
    polymarketExchangeAddress: "0x0000000000000000000000000000000000000001",
    polymarketChainId: "80002",
    polymarketNormalized: {
      domain: { name: "Polymarket CTF Exchange", chainId: 80002 },
      primaryType: "Order",
      types: { Order: [{ name: "maker", type: "address" }] },
      message: { signatureType: 0, makerAmount: "1000000", takerAmount: "500000" },
    },
  });
  if (!result.ok) throw new Error(`Self-test evidence failed validation: ${result.errors.join("; ")}`);
  if (!result.evidence.venues.every((venue) => venue.status === "validated")) throw new Error("Self-test did not mark both venues validated.");

  const negative = buildCapturedEvidence({
    generatedAt: new Date(0).toISOString(),
    hyperliquidPackageVersion: "0.15.0",
    hyperliquidNormalized: { rawSignature: "0xdeadbeef" },
  });
  if (negative.ok) throw new Error("Negative self-test unexpectedly accepted rawSignature.");
  process.stdout.write("Market official SDK validation capture self-test passed.\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs(process.argv);
  if (config.help) {
    printHelp();
    process.exit(0);
  }
  if (config.selfTest) {
    runSelfTest();
    process.exit(0);
  }

  try {
    const result = buildCapturedEvidence(loadCaptureInput(config));
    const output = JSON.stringify(result, null, 2);
    if (config.output) writeFileSync(config.output, `${output}\n`);
    if (config.json || !config.output) process.stdout.write(`${output}\n`);
    else if (result.ok) process.stdout.write(`Market official SDK validation evidence written to ${config.output}\n`);
    if (!result.ok) {
      for (const error of result.errors) process.stderr.write(`- ${error}\n`);
    }
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
