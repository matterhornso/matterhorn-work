#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { validateEvidenceBundle } from "./market-official-sdk-validation-evidence.mjs";

const args = process.argv.slice(2);

const FORBIDDEN_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|token|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedAction|signed_action)$/i;

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
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  strict: flag("--strict"),
  requireOfficialSdkValidated: flag("--require-official-sdk-validated"),
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
    "  --require-official-sdk-validated    Require every venue status to be validated, not pending.",
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

function stageCounts(report) {
  const stages = Array.isArray(report?.stages) ? report.stages : [];
  return {
    pass: Number(report?.summary?.pass ?? stages.filter((stage) => stage.status === "pass").length ?? 0),
    fail: Number(report?.summary?.fail ?? stages.filter((stage) => stage.status === "fail").length ?? 0),
    skip: Number(report?.summary?.skip ?? stages.filter((stage) => stage.status === "skip").length ?? 0),
    stages,
  };
}

function extractOfficialEvidence(raw) {
  return isRecord(raw?.evidence) ? raw.evidence : raw;
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
    "- Do not add `/api/hyperliquid/orders/submit` or `/api/polymarket/orders/submit`.",
  ].filter((line) => line !== "");
  return `${lines.join("\n")}\n`;
}

export async function buildMarketCustomerEvidenceBundle(config) {
  const smokeRaw = await readJson(config.customerReadySmoke, "customer-ready crypto smoke");
  const officialRaw = await readJson(config.officialSdkValidation, "official SDK validation evidence");
  if (!officialRaw) throw new Error("Missing --official-sdk-validation evidence JSON.");

  const smokeCounts = stageCounts(smokeRaw);
  const customerReadySmoke = {
    present: Boolean(smokeRaw),
    ready: smokeRaw?.ready === true,
    pass: smokeCounts.pass,
    fail: smokeCounts.fail,
    skip: smokeCounts.skip,
    path: config.customerReadySmoke,
  };
  const officialSdkValidation = summarizeOfficialSdk(officialRaw, config.requireOfficialSdkValidated);
  const warnings = [
    ...(customerReadySmoke.present && !customerReadySmoke.ready ? ["Customer-ready crypto smoke is not ready."] : []),
    ...officialSdkValidation.warnings,
  ];
  const errors = [
    ...officialSdkValidation.validation.errors,
    ...(config.requireOfficialSdkValidated && !officialSdkValidation.allValidated ? ["Official SDK evidence is not fully validated for every venue."] : []),
  ];
  const ready = (customerReadySmoke.present ? customerReadySmoke.ready : true) && officialSdkValidation.ready && errors.length === 0;
  const summary = {
    title: config.title,
    ready,
    customerReadySmoke,
    officialSdkValidationPath: config.officialSdkValidation,
    officialSdkValidation,
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
