#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { validateEvidenceBundle } from "./market-official-sdk-validation-evidence.mjs";

const args = process.argv.slice(2);

const FORBIDDEN_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|token|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedAction|signed_action)$/i;
const FORBIDDEN_OPERATOR_SUMMARY_RE =
  /\b(seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|walletExport|wallet_export|rawSignature|raw_signature|signedPayload|signed_payload|signedAction|signed_action)\b/i;
const REQUIRED_CUSTOMER_SMOKE_STAGES = [
  ["crypto.unified_chat", "Unified crypto chat router"],
  ["crypto.shared_card_contract", "Unified crypto shared-card contract"],
  ["market.execution_safety", "Market execution safety gate"],
  ["market.official_sdk_validation", "Market official SDK validation track"],
  ["market.customer_evidence_bundle", "Market customer evidence bundle"],
  ["hyperliquid.readiness", "Hyperliquid readiness gate"],
  ["polymarket.readiness", "Polymarket readiness gate"],
  ["bittensor.customer_readiness", "Bittensor customer readiness gate"],
];

function arg(name, fallback = "") {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find((item) => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function flag(name) {
  return args.includes(name);
}

const config = {
  customerReadySmoke: arg("--customer-ready-smoke"),
  officialSdkValidation: arg("--official-sdk-validation"),
  operatorSummary: arg("--operator-summary"),
  sdkManifestCheck: arg("--sdk-manifest-check"),
  receiptCheck: arg("--receipt-check"),
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  strict: flag("--strict"),
  requireOfficialSdkValidated: flag("--require-official-sdk-validated"),
  requireSdkManifestCheck: flag("--require-sdk-manifest-check"),
  requireReceiptCheck: flag("--require-receipt-check"),
  title: arg("--title") || "Matterhorn Work Market Customer Evidence Bundle",
};

function usage() {
  return [
    "Usage:",
    "  node scripts/market-customer-evidence-bundle.mjs --customer-ready-smoke /tmp/smoke.json --official-sdk-validation /tmp/sdk-evidence.json --output /tmp/market-evidence.md --json-output /tmp/market-evidence.json --strict",
    "",
    "Options:",
    "  --customer-ready-smoke <path>       JSON from scripts/customer-ready-crypto-smoke.mjs.",
    "  --official-sdk-validation <path>    JSON from scripts/market-official-sdk-validation-evidence.mjs --sample/--evidence-file --json, or the raw evidence object.",
    "  --operator-summary <path>           Optional Markdown summary from matterhorn-work crypto sdk-loop.",
    "  --sdk-manifest-check <path>         Optional JSON from matterhorn-work crypto sdk-manifest-check.",
    "  --receipt-check <path>              Optional JSON from matterhorn-work crypto receipt-check.",
    "  --require-official-sdk-validated    Require every venue status to be validated, not pending.",
    "  --require-sdk-manifest-check        Require SDK run manifest-check evidence to be accepted.",
    "  --require-receipt-check             Require public receipt-check evidence to be accepted and tied to the handoff.",
    "  --output, -o <path>                 Write Markdown bundle to a file. Defaults to stdout.",
    "  --json-output <path>                Write machine-readable summary JSON.",
    "  --strict                            Exit nonzero when not customer-ready.",
    "  --title <text>                      Report title.",
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
    // Polymarket typed-data exposes signatureType as public metadata, not a signature.
    if (key !== "signatureType" && FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(`${label} contains forbidden secret-shaped field: ${[...path, key].join(".")}`);
    }
    assertNoForbiddenKeys(child, label, [...path, key]);
  }
}

async function readJson(path, label) {
  if (!path) return null;
  const raw = await readFile(path, "utf8");
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`${label} JSON file is empty: ${path}`);
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) parsed = JSON.parse(trimmed.slice(start, end + 1));
    else throw error;
  }
  assertNoForbiddenKeys(parsed, label);
  return parsed;
}

async function readPublicText(path, label) {
  if (!path) return null;
  const raw = await readFile(path, "utf8");
  if (FORBIDDEN_OPERATOR_SUMMARY_RE.test(raw)) {
    throw new Error(`${label} contains forbidden secret-shaped content.`);
  }
  return raw;
}

function stageCounts(report) {
  const stages = Array.isArray(report?.stages) ? report.stages : [];
  return {
    pass: Number(report?.summary?.pass ?? stages.filter((stage) => stage.status === "pass").length ?? 0),
    fail: Number(report?.summary?.fail ?? stages.filter((stage) => stage.status === "fail").length ?? 0),
    skip: Number(report?.summary?.skip ?? stages.filter((stage) => stage.status === "skip").length ?? 0),
    stages,
  };
}

function summarizeRequiredSmokeStages(report) {
  const stages = Array.isArray(report?.stages) ? report.stages : [];
  return REQUIRED_CUSTOMER_SMOKE_STAGES.map(([id, label]) => {
    const stage = stages.find((item) => item?.id === id);
    return {
      id,
      label,
      status: typeof stage?.status === "string" ? stage.status : "missing",
    };
  });
}

function extractOfficialEvidence(raw) {
  return isRecord(raw?.evidence) ? raw.evidence : raw;
}

function summarizeOperatorSummary(path, raw) {
  if (!path || raw === null) {
    return {
      present: false,
      path: null,
      file: null,
      sha256: null,
      bytes: 0,
      warnings: [],
    };
  }
  const warnings = [];
  if (!/Matterhorn Market Official SDK Operator Summary/i.test(raw)) {
    warnings.push("Operator summary is attached, but it does not look like the standard Matterhorn SDK operator summary.");
  }
  if (!/Non-custodial\s*\|\s*true/i.test(raw)) {
    warnings.push("Operator summary does not explicitly show Non-custodial=true.");
  }
  if (!/Live submission enabled\s*\|\s*false/i.test(raw)) {
    warnings.push("Operator summary does not explicitly show Live submission enabled=false.");
  }
  return {
    present: true,
    path,
    file: basename(path),
    sha256: createHash("sha256").update(raw).digest("hex"),
    bytes: Buffer.byteLength(raw, "utf8"),
    warnings,
  };
}

function summarizeOfficialSdk(raw, requireValidated) {
  const evidence = extractOfficialEvidence(raw);
  const validation = validateEvidenceBundle(evidence);
  const venues = Array.isArray(evidence?.venues) ? evidence.venues : [];
  const statuses = venues.map((venue) => ({
    venue: String(venue.venue || "unknown"),
    status: String(venue.status || "unknown"),
    officialClient: String(venue.officialClient?.name || "unknown"),
    packageVersion: venue.officialClient?.packageVersion ?? null,
    validatedAt: venue.validation?.validatedAt ?? null,
  }));
  const allValidated = statuses.length > 0 && statuses.every((item) => item.status === "validated");
  const ready = validation.ok && (!requireValidated || allValidated);
  const warnings = [...validation.warnings];
  if (!allValidated) warnings.push("Official SDK evidence is accepted but still pending full official-client/testnet validation.");
  if (requireValidated && !allValidated) warnings.push("Strict validation requested: every venue must be status=validated.");
  return {
    ready,
    validation,
    statuses,
    allValidated,
    warnings,
  };
}

function summarizeReceiptCheck(path, raw, requireReceiptCheck) {
  if (!path || raw === null) {
    return {
      present: false,
      path: null,
      file: null,
      ready: !requireReceiptCheck,
      ok: false,
      matchesHandoff: false,
      venue: null,
      status: null,
      action: null,
      orderId: null,
      txHash: null,
      warnings: requireReceiptCheck ? ["Receipt-check evidence is required but not attached."] : [],
      errors: requireReceiptCheck ? ["Receipt-check evidence is required but missing."] : [],
    };
  }

  const receipt = isRecord(raw.receipt) ? raw.receipt : null;
  const safety = isRecord(raw.safety) ? raw.safety : {};
  const errors = [];
  const warnings = [];
  if (raw.ok !== true) errors.push("Receipt-check evidence was not accepted.");
  if (raw.matchesHandoff !== true) errors.push("Receipt-check evidence did not match the original handoff.");
  if (!receipt) errors.push("Receipt-check evidence is missing the public receipt summary.");
  if (receipt?.version !== "matterhorn.market.receipt.v1") {
    errors.push("Receipt-check evidence does not use matterhorn.market.receipt.v1.");
  }
  if (safety.nonCustodial !== true) errors.push("Receipt-check evidence must keep nonCustodial=true.");
  if (safety.liveSubmissionEnabled !== false) errors.push("Receipt-check evidence must keep liveSubmissionEnabled=false.");
  if (safety.signsOrSubmits !== false) errors.push("Receipt-check evidence must keep signsOrSubmits=false.");
  if (safety.acceptsSecrets !== false) errors.push("Receipt-check evidence must keep acceptsSecrets=false.");
  if (Array.isArray(raw.errors)) errors.push(...raw.errors.map((item) => String(item)));
  if (Array.isArray(raw.warnings)) warnings.push(...raw.warnings.map((item) => String(item)));
  if (Array.isArray(receipt?.warnings)) warnings.push(...receipt.warnings.map((item) => String(item)));
  if (!receipt?.orderId && !receipt?.txHash) warnings.push("Receipt-check evidence has no public order id or tx hash.");

  return {
    present: true,
    path,
    file: basename(path),
    ready: raw.ok === true && raw.matchesHandoff === true && errors.length === 0,
    ok: raw.ok === true,
    matchesHandoff: raw.matchesHandoff === true,
    venue: receipt?.venue ?? null,
    status: receipt?.status ?? null,
    action: receipt?.action ?? null,
    orderId: receipt?.orderId ?? null,
    txHash: receipt?.txHash ?? null,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  };
}

function summarizeSdkManifestCheck(path, raw, requireSdkManifestCheck) {
  if (!path || raw === null) {
    return {
      present: false,
      path: null,
      file: null,
      ready: !requireSdkManifestCheck,
      ok: false,
      status: null,
      fileCount: 0,
      venueCount: 0,
      warnings: requireSdkManifestCheck ? ["SDK run manifest-check evidence is required but not attached."] : [],
      errors: requireSdkManifestCheck ? ["SDK run manifest-check evidence is required but missing."] : [],
    };
  }

  const errors = [];
  const warnings = [];
  if (raw.ok !== true) errors.push("SDK run manifest-check evidence was not accepted.");
  if (raw.safety?.nonCustodial !== true) errors.push("SDK run manifest-check evidence must keep nonCustodial=true.");
  if (raw.safety?.liveSubmissionEnabled !== false) errors.push("SDK run manifest-check evidence must keep liveSubmissionEnabled=false.");
  if (raw.safety?.signsOrSubmits !== false) errors.push("SDK run manifest-check evidence must keep signsOrSubmits=false.");
  if (raw.safety?.acceptsSecrets !== false) errors.push("SDK run manifest-check evidence must keep acceptsSecrets=false.");
  if (raw.manifest?.version !== "matterhorn.market.sdk.run-manifest.v1") {
    errors.push("SDK run manifest-check evidence does not use matterhorn.market.sdk.run-manifest.v1.");
  }
  const fileCount = Number(raw.manifest?.fileCount ?? (Array.isArray(raw.files) ? raw.files.length : 0));
  const venueCount = Number(raw.manifest?.venueCount ?? 0);
  if (!Number.isFinite(fileCount) || fileCount <= 0) errors.push("SDK run manifest-check evidence must include at least one hashed file.");
  if (!Number.isFinite(venueCount) || venueCount <= 0) warnings.push("SDK run manifest-check evidence does not list venue status.");
  if (Array.isArray(raw.errors)) errors.push(...raw.errors.map((item) => String(item)));
  if (Array.isArray(raw.warnings)) warnings.push(...raw.warnings.map((item) => String(item)));

  return {
    present: true,
    path,
    file: basename(path),
    ready: raw.ok === true && errors.length === 0,
    ok: raw.ok === true,
    status: raw.manifest?.status ?? null,
    fileCount: Number.isFinite(fileCount) ? fileCount : 0,
    venueCount: Number.isFinite(venueCount) ? venueCount : 0,
    warnings: [...new Set(warnings)],
    errors: [...new Set(errors)],
  };
}

function markdownBullet(text) {
  return `- ${String(text || "").replace(/\n/g, " ").trim()}`;
}

function renderMarkdown(summary) {
  const smoke = summary.customerReadySmoke;
  const sdk = summary.officialSdkValidation;
  const lines = [
    `# ${summary.title}`,
    "",
    `Result: ${summary.ready ? "READY_FOR_TEST_CUSTOMER_QA" : "NOT_READY"}`,
    "",
    "## Safety Posture",
    "",
    "- Non-custodial: yes",
    "- Live Hyperliquid/Polymarket submission: disabled",
    "- Secrets accepted: no",
    "- Evidence type: public/redacted only",
    "",
    "## Customer-Ready Crypto Smoke",
    "",
    smoke.present
      ? markdownBullet(`Ready: ${smoke.ready ? "yes" : "no"} (${smoke.pass} passed, ${smoke.fail} failed, ${smoke.skip} skipped)`)
      : "- Not attached.",
    smoke.path ? markdownBullet(`Evidence file: ${basename(smoke.path)}`) : "",
    "",
    "### Required Smoke Stages",
    "",
    "| Stage | Status |",
    "| --- | --- |",
    ...(smoke.requiredStages ?? []).map((stage) => `| ${stage.label} | ${stage.status} |`),
    "",
    "## Official SDK Validation Evidence",
    "",
    markdownBullet(`Accepted by evidence validator: ${sdk.validation.ok ? "yes" : "no"}`),
    markdownBullet(`All venues fully validated: ${sdk.allValidated ? "yes" : "no"}`),
    ...(summary.officialSdkValidationPath ? [markdownBullet(`Evidence file: ${basename(summary.officialSdkValidationPath)}`)] : []),
    "",
    "| Venue | Status | Official Client | Package Version | Validated At |",
    "| --- | --- | --- | --- | --- |",
    ...sdk.statuses.map((item) =>
      `| ${item.venue} | ${item.status} | ${item.officialClient} | ${item.packageVersion ?? "pending"} | ${item.validatedAt ?? "pending"} |`),
    "",
    "## SDK Run Manifest Evidence",
    "",
    summary.sdkManifestCheck.present
      ? markdownBullet(`Attached: yes (${summary.sdkManifestCheck.file})`)
      : "- Not attached.",
    summary.sdkManifestCheck.present
      ? markdownBullet(`Accepted by manifest checker: ${summary.sdkManifestCheck.ok ? "yes" : "no"}`)
      : "",
    summary.sdkManifestCheck.present && summary.sdkManifestCheck.status
      ? markdownBullet(`Status: ${summary.sdkManifestCheck.status}`)
      : "",
    summary.sdkManifestCheck.present
      ? markdownBullet(`Hashed files: ${summary.sdkManifestCheck.fileCount}`)
      : "",
    summary.sdkManifestCheck.present
      ? markdownBullet(`Venue statuses: ${summary.sdkManifestCheck.venueCount}`)
      : "",
    "",
    "## Public Receipt Evidence",
    "",
    summary.receiptCheck.present
      ? markdownBullet(`Attached: yes (${summary.receiptCheck.file})`)
      : "- Not attached.",
    summary.receiptCheck.present
      ? markdownBullet(`Accepted by receipt checker: ${summary.receiptCheck.ok ? "yes" : "no"}`)
      : "",
    summary.receiptCheck.present
      ? markdownBullet(`Matches original handoff: ${summary.receiptCheck.matchesHandoff ? "yes" : "no"}`)
      : "",
    summary.receiptCheck.present && summary.receiptCheck.venue
      ? markdownBullet(`Venue: ${summary.receiptCheck.venue}`)
      : "",
    summary.receiptCheck.present && summary.receiptCheck.status
      ? markdownBullet(`Status: ${summary.receiptCheck.status}`)
      : "",
    summary.receiptCheck.present && summary.receiptCheck.action
      ? markdownBullet(`Action: ${summary.receiptCheck.action}`)
      : "",
    summary.receiptCheck.present && summary.receiptCheck.orderId
      ? markdownBullet(`Order ID: ${summary.receiptCheck.orderId}`)
      : "",
    summary.receiptCheck.present && summary.receiptCheck.txHash
      ? markdownBullet(`Tx hash: ${summary.receiptCheck.txHash}`)
      : "",
    "",
    "## Operator Summary",
    "",
    summary.operatorSummary.present
      ? markdownBullet(`Summary file: ${summary.operatorSummary.file}`)
      : "- Not attached.",
    summary.operatorSummary.present
      ? markdownBullet(`SHA-256: ${summary.operatorSummary.sha256}`)
      : "",
    summary.operatorSummary.present
      ? markdownBullet(`Bytes: ${summary.operatorSummary.bytes}`)
      : "",
    "",
    "## Warnings",
    "",
    ...(summary.warnings.length ? summary.warnings.map(markdownBullet) : ["- None."]),
    "",
    "## Validation Errors",
    "",
    ...(summary.errors.length ? summary.errors.map(markdownBullet) : ["- None."]),
    "",
    "## Red Lines",
    "",
    "- Do not treat pending SDK evidence as authorization for live submission.",
    "- Do not paste seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports into Matterhorn.",
    "- Do not attach raw signatures, signed payloads, API secrets, private keys, or wallet exports as market receipt evidence.",
    "- Do not add `/api/hyperliquid/orders/submit` or `/api/polymarket/orders/submit`.",
  ].filter((line) => line !== "");
  return `${lines.join("\n")}\n`;
}

export async function buildMarketCustomerEvidenceBundle(config) {
  const smokeRaw = await readJson(config.customerReadySmoke, "customer-ready crypto smoke");
  const officialRaw = await readJson(config.officialSdkValidation, "official SDK validation evidence");
  const sdkManifestCheckRaw = await readJson(config.sdkManifestCheck, "SDK run manifest-check evidence");
  const receiptCheckRaw = await readJson(config.receiptCheck, "market receipt-check evidence");
  const operatorSummaryRaw = await readPublicText(config.operatorSummary, "operator summary");
  if (!officialRaw) throw new Error("Missing --official-sdk-validation evidence JSON.");

  const smokeCounts = stageCounts(smokeRaw);
  const customerReadySmoke = {
    present: Boolean(smokeRaw),
    ready: smokeRaw?.ready === true,
    pass: smokeCounts.pass,
    fail: smokeCounts.fail,
    skip: smokeCounts.skip,
    requiredStages: summarizeRequiredSmokeStages(smokeRaw),
    path: config.customerReadySmoke,
  };
  const officialSdkValidation = summarizeOfficialSdk(officialRaw, config.requireOfficialSdkValidated);
  const sdkManifestCheck = summarizeSdkManifestCheck(config.sdkManifestCheck, sdkManifestCheckRaw, config.requireSdkManifestCheck);
  const receiptCheck = summarizeReceiptCheck(config.receiptCheck, receiptCheckRaw, config.requireReceiptCheck);
  const operatorSummary = summarizeOperatorSummary(config.operatorSummary, operatorSummaryRaw);
  const warnings = [
    ...(customerReadySmoke.present && !customerReadySmoke.ready ? ["Customer-ready crypto smoke is not ready."] : []),
    ...officialSdkValidation.warnings,
    ...sdkManifestCheck.warnings,
    ...receiptCheck.warnings,
    ...operatorSummary.warnings,
  ];
  const errors = [
    ...officialSdkValidation.validation.errors,
    ...sdkManifestCheck.errors,
    ...receiptCheck.errors,
    ...customerReadySmoke.requiredStages
      .filter((stage) => stage.status !== "pass")
      .map((stage) => `Customer-ready crypto smoke required stage did not pass: ${stage.id} (${stage.status})`),
    ...(config.requireOfficialSdkValidated && !officialSdkValidation.allValidated ? ["Official SDK evidence is not fully validated for every venue."] : []),
  ];
  const ready = (customerReadySmoke.present ? customerReadySmoke.ready : true) && officialSdkValidation.ready && sdkManifestCheck.ready && receiptCheck.ready && errors.length === 0;
  const summary = {
    title: config.title,
    ready,
    customerReadySmoke,
    officialSdkValidationPath: config.officialSdkValidation,
    officialSdkValidation,
    sdkManifestCheckPath: config.sdkManifestCheck,
    sdkManifestCheck,
    receiptCheckPath: config.receiptCheck,
    receiptCheck,
    operatorSummary,
    warnings,
    errors,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      asksForSecrets: false,
      storesSecrets: false,
    },
  };
  return {
    summary,
    markdown: renderMarkdown(summary),
  };
}

async function main() {
  if (flag("--help") || flag("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const bundle = await buildMarketCustomerEvidenceBundle(config);
  if (config.output) await writeFile(config.output, bundle.markdown);
  else process.stdout.write(bundle.markdown);
  if (config.jsonOutput) await writeFile(config.jsonOutput, `${JSON.stringify(bundle.summary, null, 2)}\n`);
  if (config.strict && !bundle.summary.ready) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
