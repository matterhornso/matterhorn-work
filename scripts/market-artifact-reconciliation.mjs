#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const VERSION = "matterhorn.market.artifact-reconciliation.v1";
const VALIDATION_VERSION = "matterhorn.market.artifact-validation.v1";
const RECEIPT_VERSION = "matterhorn.market.receipt.v1";
const SHA256_RE = /^[a-f0-9]{64}$/i;
const VENUES = ["hyperliquid", "polymarket"];
const FORBIDDEN_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|token|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedAction|signed_action|signedOrder|signed_order|exchangePayload|exchange_payload)$/i;

const args = process.argv.slice(2);

function value(name, fallback = "") {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find((item) => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function flag(name) {
  return args.includes(name);
}

function usage() {
  return [
    "Matterhorn market artifact reconciliation",
    "",
    "Usage:",
    "  node scripts/market-artifact-reconciliation.mjs --hyperliquid-artifact-validation /tmp/hl.json --polymarket-artifact-validation /tmp/poly.json --output /tmp/reconciliation.md --json-output /tmp/reconciliation.json --strict",
    "",
    "Options:",
    "  --hyperliquid-artifact-validation <path>   JSON from hyperliquid validate-artifact.",
    "  --polymarket-artifact-validation <path>    JSON from polymarket validate-artifact.",
    "  --require-hyperliquid                      Fail if Hyperliquid artifact validation is not attached.",
    "  --require-polymarket                       Fail if Polymarket artifact validation is not attached.",
    "  --output, -o <path>                        Write Markdown evidence.",
    "  --json-output <path>                       Write machine-readable evidence.",
    "  --strict                                   Exit nonzero when not ready.",
    "",
    "This checker accepts public/redacted artifact-validation metadata only. It never accepts raw signatures, signed payloads, API secrets, private keys, wallet exports, or exchange submission payloads.",
  ].join("\n");
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertNoForbiddenKeys(value, label, path = []) {
  if (!isRecord(value) && !Array.isArray(value)) return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenKeys(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "signatureType" && FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(`${label} contains forbidden secret-shaped field: ${[...path, key].join(".")}`);
    }
    assertNoForbiddenKeys(child, label, [...path, key]);
  }
}

async function readJson(path, label) {
  if (!path) return null;
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  assertNoForbiddenKeys(parsed, label);
  return parsed;
}

function extractValidation(raw) {
  if (isRecord(raw?.validation)) return raw.validation;
  if (isRecord(raw?.result?.validation)) return raw.result.validation;
  return raw;
}

function extractReceipt(raw, validation) {
  if (isRecord(validation?.publicAuditReceiptCandidate)) return validation.publicAuditReceiptCandidate;
  if (isRecord(raw?.receiptCandidate)) return raw.receiptCandidate;
  if (isRecord(raw?.publicAuditReceiptCandidate)) return raw.publicAuditReceiptCandidate;
  return null;
}

function optionalSha(value) {
  return typeof value === "string" && SHA256_RE.test(value) ? value : null;
}

function summarizeVenue({ venue, path, raw, required }) {
  if (!path || raw === null) {
    return {
      venue,
      present: false,
      file: null,
      ready: !required,
      status: "missing",
      receiptCandidate: null,
      hashes: {},
      warnings: required ? [`${venue} artifact-validation evidence is required but not attached.`] : [],
      errors: required ? [`Missing ${venue} artifact-validation evidence.`] : [],
    };
  }

  const validation = extractValidation(raw);
  const receipt = extractReceipt(raw, validation);
  const errors = [];
  const warnings = [];

  if (validation?.version !== VALIDATION_VERSION) errors.push(`Invalid validation version for ${venue}.`);
  if (validation?.venue !== venue) errors.push(`Artifact-validation venue must be ${venue}.`);
  if (validation?.status !== "accepted_public_metadata") errors.push(`${venue} artifact validation was not accepted.`);
  if (validation?.validationMode !== undefined && validation.validationMode !== "public_redacted_metadata") {
    errors.push(`${venue} validationMode must be public_redacted_metadata.`);
  }
  if (validation?.matchesSignRequest !== true) errors.push(`${venue} artifact did not match the sign request.`);
  if (validation?.signedArtifactRedacted !== true) errors.push(`${venue} artifact must be marked signedArtifactRedacted=true.`);
  if (validation?.redactedMetadataAccepted !== true) errors.push(`${venue} redacted metadata was not accepted.`);
  if (validation?.signedArtifactAccepted !== false) errors.push(`${venue} must keep signedArtifactAccepted=false.`);
  if (validation?.submitSignedAllowedByContract !== false) errors.push(`${venue} must keep submitSignedAllowedByContract=false.`);
  if (validation?.canSubmit !== false) errors.push(`${venue} must keep canSubmit=false.`);
  if (validation?.liveSubmissionEnabled !== false) errors.push(`${venue} must keep liveSubmissionEnabled=false.`);
  if (!optionalSha(validation?.signRequestSha256)) errors.push(`${venue} validation must include signRequestSha256.`);
  if (!optionalSha(validation?.signedArtifactPublicHash)) errors.push(`${venue} validation must include signedArtifactPublicHash.`);
  if (Array.isArray(validation?.errors) && validation.errors.length > 0) {
    errors.push(...validation.errors.map((item) => `${venue} validation error: ${String(item)}`));
  }
  if (Array.isArray(validation?.warnings)) warnings.push(...validation.warnings.map((item) => String(item)));

  if (!receipt) {
    errors.push(`${venue} validation must include a public audit receipt candidate.`);
  } else {
    if (receipt.version !== RECEIPT_VERSION) errors.push(`${venue} receipt candidate must use ${RECEIPT_VERSION}.`);
    if (receipt.venue !== venue) errors.push(`${venue} receipt candidate venue mismatch.`);
    if (receipt.status !== "received") errors.push(`${venue} receipt candidate status must be received.`);
    if (optionalSha(receipt.previewSha256) === null) warnings.push(`${venue} receipt candidate does not include previewSha256.`);
    if (optionalSha(receipt.handoffSha256) === null) warnings.push(`${venue} receipt candidate does not include handoffSha256.`);
    const receiptWarnings = Array.isArray(receipt.warnings) ? receipt.warnings.map((item) => String(item)) : [];
    warnings.push(...receiptWarnings);
    if (!receiptWarnings.some((item) => /not exchange submission evidence/i.test(item))) {
      warnings.push(`${venue} receipt candidate should explicitly say it is not exchange submission evidence.`);
    }
  }

  const hashes = {
    signRequestSha256: optionalSha(validation?.signRequestSha256),
    previewSha256: optionalSha(receipt?.previewSha256),
    handoffSha256: optionalSha(receipt?.handoffSha256),
    signedArtifactPublicHash: optionalSha(validation?.signedArtifactPublicHash),
  };

  return {
    venue,
    present: true,
    file: basename(path),
    ready: errors.length === 0,
    status: validation?.status ?? "unknown",
    receiptCandidate: receipt
      ? {
          version: receipt.version ?? null,
          venue: receipt.venue ?? null,
          status: receipt.status ?? null,
          action: receipt.action ?? null,
          previewSha256: hashes.previewSha256,
          handoffSha256: hashes.handoffSha256,
          orderId: receipt.orderId ?? null,
          txHash: receipt.txHash ?? null,
          warnings: Array.isArray(receipt.warnings) ? receipt.warnings.map((item) => String(item)) : [],
        }
      : null,
    hashes,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Matterhorn Market Artifact Reconciliation",
    "",
    `Result: ${report.ready ? "READY_FOR_CUSTOMER_EVIDENCE" : "NOT_READY"}`,
    "",
    "## Safety",
    "",
    "- Public/redacted metadata only: yes",
    "- Non-custodial: yes",
    "- Matterhorn signs or submits: no",
    "- Live market submission: off",
    "- Raw signatures or signed payloads accepted: no",
    "",
    "## Venue Results",
    "",
    "| Venue | Present | Ready | Status | Validation File |",
    "| --- | --- | --- | --- | --- |",
    ...report.venues.map((item) =>
      `| ${item.venue} | ${item.present ? "yes" : "no"} | ${item.ready ? "yes" : "no"} | ${item.status} | ${item.file ?? "-"} |`),
    "",
    "## Public Audit Receipt Candidates",
    "",
  ];
  for (const item of report.venues.filter((venue) => venue.receiptCandidate)) {
    lines.push(`### ${item.venue}`);
    lines.push("");
    lines.push(`- Action: ${item.receiptCandidate.action ?? "unknown"}`);
    lines.push(`- Status: ${item.receiptCandidate.status ?? "unknown"}`);
    lines.push(`- Sign request SHA-256: ${item.hashes.signRequestSha256 ?? "missing"}`);
    lines.push(`- Preview SHA-256: ${item.hashes.previewSha256 ?? "missing"}`);
    lines.push(`- Handoff SHA-256: ${item.hashes.handoffSha256 ?? "missing"}`);
    lines.push(`- Signed artifact public hash: ${item.hashes.signedArtifactPublicHash ?? "missing"}`);
    lines.push("");
  }
  lines.push("## Warnings");
  lines.push("");
  lines.push(...(report.warnings.length ? report.warnings.map((item) => `- ${item}`) : ["- None."]));
  lines.push("");
  lines.push("## Errors");
  lines.push("");
  lines.push(...(report.errors.length ? report.errors.map((item) => `- ${item}`) : ["- None."]));
  lines.push("");
  lines.push("## Red Lines");
  lines.push("");
  lines.push("- This is not exchange submission evidence and is not proof of live trading.");
  lines.push("- Do not attach seed phrases, private keys, API secrets, raw signatures, signed payloads, exchange payloads, or wallet exports.");
  lines.push("- Do not add market submit/sign routes until a separate security review explicitly approves them.");
  return `${lines.join("\n")}\n`;
}

export async function buildMarketArtifactReconciliation(config) {
  const hyperliquidRaw = await readJson(config.hyperliquidArtifactValidation, "hyperliquid artifact validation");
  const polymarketRaw = await readJson(config.polymarketArtifactValidation, "polymarket artifact validation");
  const venues = [
    summarizeVenue({
      venue: "hyperliquid",
      path: config.hyperliquidArtifactValidation,
      raw: hyperliquidRaw,
      required: config.requireHyperliquid,
    }),
    summarizeVenue({
      venue: "polymarket",
      path: config.polymarketArtifactValidation,
      raw: polymarketRaw,
      required: config.requirePolymarket,
    }),
  ];
  const attached = venues.filter((venue) => venue.present);
  const warnings = [...new Set(venues.flatMap((venue) => venue.warnings))];
  const errors = [
    ...(attached.length === 0 ? ["Attach at least one venue artifact-validation result."] : []),
    ...venues.flatMap((venue) => venue.errors),
  ];
  const report = {
    version: VERSION,
    ready: attached.length > 0 && errors.length === 0,
    generatedAt: new Date().toISOString(),
    venues,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
      publicMetadataOnly: true,
    },
  };
  return {
    report,
    markdown: renderMarkdown(report),
  };
}

async function main() {
  if (flag("--help") || flag("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const output = await buildMarketArtifactReconciliation({
    hyperliquidArtifactValidation: value("--hyperliquid-artifact-validation"),
    polymarketArtifactValidation: value("--polymarket-artifact-validation"),
    requireHyperliquid: flag("--require-hyperliquid"),
    requirePolymarket: flag("--require-polymarket"),
  });
  const markdownPath = value("--output") || value("-o");
  const jsonPath = value("--json-output");
  const wantsJson = flag("--json");
  if (markdownPath) await writeFile(markdownPath, output.markdown);
  else if (!wantsJson) process.stdout.write(output.markdown);
  if (jsonPath) await writeFile(jsonPath, `${JSON.stringify(output.report, null, 2)}\n`);
  if (wantsJson) process.stdout.write(`${JSON.stringify(output.report, null, 2)}\n`);
  if (flag("--strict") && !output.report.ready) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
