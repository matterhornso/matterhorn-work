#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const FORBIDDEN_CREDENTIAL_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|walletExport|wallet_export|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedAction|signed_action|signedExtrinsic|signed_extrinsic)$/i;

const POLYMARKET_MESSAGE_FIELDS = [
  "salt",
  "maker",
  "signer",
  "taker",
  "tokenId",
  "makerAmount",
  "takerAmount",
  "expiration",
  "nonce",
  "feeRateBps",
  "side",
  "signatureType",
];

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function findForbiddenCredentialKey(value, path = [], depth = 0) {
  if (depth > 50) return [...path, "too_deep"].join(".");
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenCredentialKey(value[index], [...path, String(index)], depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (key !== "signatureType" && FORBIDDEN_CREDENTIAL_KEY_RE.test(key)) return [...path, key].join(".");
    const found = findForbiddenCredentialKey(child, [...path, key], depth + 1);
    if (found) return found;
  }
  return null;
}

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
    venue: value("--venue"),
    input: value("--input"),
    output: value("--output") || value("-o"),
  };
}

function usage() {
  return [
    "Matterhorn market official SDK artifact normalizer",
    "",
    "Usage:",
    "  node scripts/market-official-sdk-normalize.mjs --venue hyperliquid --input <official-client-public.json> --output /tmp/hyperliquid-normalized.json",
    "  node scripts/market-official-sdk-normalize.mjs --venue polymarket --input <official-client-public.json> --output /tmp/polymarket-normalized.json",
    "",
    "The input must be public/redacted official-client output. This script rejects",
    "private keys, API secrets, raw signatures, signed payloads, and wallet exports.",
    "It does not run official SDKs, sign orders, submit orders, or call exchanges.",
  ].join("\n");
}

function readInput(path) {
  if (!path) throw new Error("Missing --input.");
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const forbidden = findForbiddenCredentialKey(parsed);
  if (forbidden) throw new Error(`Input contains forbidden credential-shaped field: ${forbidden}`);
  return parsed;
}

function coerceString(value, label) {
  if (value === null || value === undefined || value === "") throw new Error(`Missing ${label}.`);
  return String(value);
}

function normalizeHyperliquid(input) {
  const action = isRecord(input.action) ? input.action : input;
  if (!isRecord(action)) throw new Error("Hyperliquid input must be an object.");
  if (action.type !== "order") throw new Error("Hyperliquid normalized action must be type=order.");
  if (!Array.isArray(action.orders) || action.orders.length === 0) throw new Error("Hyperliquid normalized action must include orders.");
  const grouping = action.grouping ?? "na";
  if (!["na", "normalTpsl", "positionTpsl"].includes(grouping)) throw new Error("Hyperliquid grouping must be na, normalTpsl, or positionTpsl.");
  return {
    type: "order",
    grouping,
    orders: action.orders.map((order, index) => {
      if (!isRecord(order)) throw new Error(`Hyperliquid order ${index} must be an object.`);
      const t = isRecord(order.t) ? order.t : null;
      if (!t || (!isRecord(t.limit) && !isRecord(t.trigger))) throw new Error(`Hyperliquid order ${index} must include t.limit or t.trigger.`);
      return {
        a: Number(order.a),
        b: Boolean(order.b),
        p: coerceString(order.p, `orders[${index}].p`),
        s: coerceString(order.s, `orders[${index}].s`),
        r: Boolean(order.r),
        t,
      };
    }),
    operatorRedaction: {
      walletFieldsRemoved: true,
      submissionFieldsRemoved: true,
      normalizedBy: "matterhorn-work",
    },
  };
}

function pickObject(source, fields) {
  const out = {};
  for (const field of fields) {
    if (field in source) out[field] = source[field];
  }
  return out;
}

function normalizePolymarket(input) {
  const typedData = isRecord(input.typedData) ? input.typedData : input;
  if (!isRecord(typedData)) throw new Error("Polymarket input must be an object.");
  const domain = isRecord(typedData.domain) ? typedData.domain : null;
  const types = isRecord(typedData.types) ? typedData.types : null;
  const message = isRecord(typedData.message) ? typedData.message : typedData;
  if (!domain) throw new Error("Polymarket typed data must include domain.");
  if (!types || !Array.isArray(types.Order)) throw new Error("Polymarket typed data must include types.Order.");
  if (!isRecord(message)) throw new Error("Polymarket typed data must include message.");
  const normalizedMessage = pickObject(message, POLYMARKET_MESSAGE_FIELDS);
  for (const field of ["makerAmount", "takerAmount", "signatureType"]) {
    if (!(field in normalizedMessage)) throw new Error(`Polymarket message must include ${field}.`);
  }
  return {
    domain: {
      name: coerceString(domain.name, "domain.name"),
      version: coerceString(domain.version ?? "1", "domain.version"),
      chainId: Number(domain.chainId),
      verifyingContract: coerceString(domain.verifyingContract, "domain.verifyingContract"),
    },
    primaryType: typedData.primaryType ?? "Order",
    types: { Order: types.Order },
    message: normalizedMessage,
    operatorRedaction: {
      walletFieldsArePlaceholders: true,
      submissionFieldsRemoved: true,
      normalizedBy: "matterhorn-work",
    },
  };
}

export function normalizeOfficialSdkArtifact(input, venue) {
  if (venue === "hyperliquid") return normalizeHyperliquid(input);
  if (venue === "polymarket") return normalizePolymarket(input);
  throw new Error("Unsupported --venue. Use hyperliquid or polymarket.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs(process.argv);
  if (config.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  try {
    const normalized = normalizeOfficialSdkArtifact(readInput(config.input), config.venue);
    const output = `${JSON.stringify(normalized, null, 2)}\n`;
    if (config.output) writeFileSync(config.output, output);
    if (config.json || !config.output) process.stdout.write(output);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
