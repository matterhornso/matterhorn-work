#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

export const MARKET_RECEIPT_VERSION = "matterhorn.market.receipt.v1";

const FORBIDDEN_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|apiKey|api_key|apiSecret|api_secret|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;

const PUBLIC_STATUSES = new Set(["received", "pending", "filled", "cancelled", "rejected", "failed", "unknown"]);

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
    venue: value("--venue"),
    handoffFile: value("--handoff-file"),
    receiptFile: value("--receipt-file"),
    output: value("--output") || value("-o"),
  };
}

function printHelp() {
  process.stdout.write([
    "Matterhorn market public receipt checker",
    "",
    "Usage:",
    "  node scripts/market-receipt-check.mjs --venue hyperliquid --handoff-file handoff.json --receipt-file receipt.json --json",
    "  node scripts/market-receipt-check.mjs --venue polymarket --handoff-file handoff.json --receipt-file receipt.json --output receipt-check.json",
    "  node scripts/market-receipt-check.mjs --self-test",
    "",
    "Receipts must contain public status only. Do not pass private keys, API secrets, raw signatures, signed payloads, seed phrases, or wallet exports.",
    "",
  ].join("\n"));
}

function readJsonFile(path, label) {
  if (!path) throw new Error(`Missing ${label} path.`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label}: ${error.message}`);
  }
}

function forbiddenPath(value, root = []) {
  const stack = [{ value, path: root }];
  let visited = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    visited += 1;
    if (visited > 100_000) return [...current.path, "<oversized>"].join(".");
    if (Array.isArray(current.value)) {
      current.value.forEach((child, index) => stack.push({ value: child, path: [...current.path, String(index)] }));
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, child] of Object.entries(current.value)) {
      if (FORBIDDEN_KEY_RE.test(key)) return [...current.path, key].join(".");
      stack.push({ value: child, path: [...current.path, key] });
    }
  }
  return null;
}

function normalizeStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return PUBLIC_STATUSES.has(normalized) ? normalized : "unknown";
}

export function verifyMarketPublicReceipt({ venue, handoff, receipt }) {
  const forbidden = forbiddenPath(receipt, ["receipt"]);
  if (forbidden) {
    return {
      ok: false,
      matchesHandoff: false,
      receipt: null,
      errors: [`Receipt contained forbidden signing or credential material at ${forbidden}.`],
      warnings: [],
      safety: {
        nonCustodial: true,
        liveSubmissionEnabled: false,
        signsOrSubmits: false,
        acceptsSecrets: false,
      },
    };
  }

  const normalizedVenue = String(venue || "").trim().toLowerCase();
  const errors = [];
  const warnings = [];
  if (receipt.previewSha256 && receipt.previewSha256 !== handoff.previewSha256) errors.push("previewSha256 mismatch");
  if (receipt.handoffSha256 && receipt.handoffSha256 !== handoff.handoffSha256) errors.push("handoffSha256 mismatch");

  if (normalizedVenue === "hyperliquid") {
    if (receipt.asset && receipt.asset !== handoff.asset) errors.push("asset mismatch");
    if (receipt.side && receipt.side !== handoff.side) errors.push("side mismatch");
  } else if (normalizedVenue === "polymarket") {
    if (receipt.marketId && receipt.marketId !== handoff.marketId) errors.push("marketId mismatch");
    if (receipt.outcome && receipt.outcome !== handoff.outcome) errors.push("outcome mismatch");
    if (receipt.side && receipt.side !== handoff.side) errors.push("side mismatch");
  } else {
    errors.push(`unsupported venue ${venue}`);
  }

  if (!receipt.orderId && !receipt.txHash) warnings.push("receipt has no order id or tx hash");

  return {
    ok: errors.length === 0,
    matchesHandoff: errors.length === 0,
    receipt: {
      version: MARKET_RECEIPT_VERSION,
      venue: normalizedVenue,
      status: normalizeStatus(receipt.status),
      action: normalizedVenue === "polymarket" ? "buy_shares" : "place_order",
      previewSha256: receipt.previewSha256 ?? handoff.previewSha256,
      handoffSha256: receipt.handoffSha256 ?? handoff.handoffSha256,
      orderId: receipt.orderId ?? null,
      txHash: receipt.txHash ?? null,
      warnings,
    },
    errors,
    warnings,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
    },
  };
}

function runSelfTest() {
  const handoff = {
    previewSha256: "h".repeat(64),
    handoffSha256: "a".repeat(64),
    asset: "BTC",
    side: "buy",
  };
  const accepted = verifyMarketPublicReceipt({
    venue: "hyperliquid",
    handoff,
    receipt: {
      previewSha256: handoff.previewSha256,
      handoffSha256: handoff.handoffSha256,
      orderId: "order-123",
      status: "filled",
      asset: "BTC",
      side: "buy",
    },
  });
  if (!accepted.ok) throw new Error(`Self-test accepted receipt failed: ${accepted.errors.join("; ")}`);

  const rejected = verifyMarketPublicReceipt({
    venue: "hyperliquid",
    handoff,
    receipt: {
      previewSha256: handoff.previewSha256,
      handoffSha256: handoff.handoffSha256,
      status: "filled",
      signature: "0xdeadbeef",
    },
  });
  if (rejected.ok) throw new Error("Self-test secret-shaped receipt unexpectedly passed.");
  if (!rejected.errors.join(" ").includes("receipt.signature")) throw new Error("Self-test did not catch receipt.signature.");

  process.stdout.write("Market public receipt checker self-test passed.\n");
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
    const result = verifyMarketPublicReceipt({
      venue: config.venue,
      handoff: readJsonFile(config.handoffFile, "handoff"),
      receipt: readJsonFile(config.receiptFile, "receipt"),
    });
    if (config.output) writeFileSync(config.output, `${JSON.stringify(result, null, 2)}\n`);
    if (config.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else if (result.ok) {
      process.stdout.write(`Market public receipt accepted with ${result.warnings.length} warning(s).\n`);
      for (const warning of result.warnings) process.stdout.write(`- ${warning}\n`);
    } else {
      process.stderr.write(`Market public receipt rejected with ${result.errors.length} error(s).\n`);
      for (const error of result.errors) process.stderr.write(`- ${error}\n`);
    }
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
