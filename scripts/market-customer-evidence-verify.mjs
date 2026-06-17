#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const REQUIRED_SMOKE_STAGES = [
  "crypto.unified_chat",
  "crypto.direct_prompt_safety",
  "crypto.shared_card_contract",
  "market.execution_safety",
  "market.official_sdk_validation",
  "market.customer_evidence_bundle",
  "hyperliquid.readiness",
  "polymarket.readiness",
  "bittensor.customer_readiness",
];

const FORBIDDEN_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|token|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedAction|signed_action)$/i;
const FORBIDDEN_MARKDOWN_VALUE_RE =
  /\b(seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|walletExport|wallet_export|rawSignature|raw_signature|signedPayload|signed_payload|signedAction|signed_action)\b\s*[:=]\s*\S+/i;

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
    requireOfficialSdkValidated: args.includes("--require-official-sdk-validated"),
    requireSdkManifestCheck: args.includes("--require-sdk-manifest-check"),
    requireReceiptCheck: args.includes("--require-receipt-check"),
    bundleJson: value("--bundle-json"),
    bundleMarkdown: value("--bundle-md") || value("--bundle-markdown"),
    output: value("--output") || value("-o"),
  };
}

function usage() {
  return [
    "Matterhorn market customer evidence verifier",
    "",
    "Usage:",
    "  node scripts/market-customer-evidence-verify.mjs --bundle-json /tmp/market-evidence.json --bundle-md /tmp/market-evidence.md --strict --json",
    "",
    "The verifier is offline and public-data only. It validates the final evidence bundle summary, optional Markdown, safety flags, required smoke stages, and attached SDK manifest/receipt claims.",
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
    // EIP-712 typed-data uses signatureType as public metadata, not signing material.
    if (key !== "signatureType" && FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(`${label} contains forbidden secret-shaped field: ${[...path, key].join(".")}`);
    }
    assertNoForbiddenKeys(child, label, [...path, key]);
  }
}

function readJson(path, label) {
  if (!path) throw new Error(`Missing ${label} path.`);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  assertNoForbiddenKeys(parsed, label);
  return parsed;
}

function readMarkdown(path) {
  if (!path) return null;
  const raw = readFileSync(path, "utf8");
  if (FORBIDDEN_MARKDOWN_VALUE_RE.test(raw)) {
    throw new Error(`${basename(path)} contains forbidden secret-shaped assignment text.`);
  }
  return raw;
}

function pushCheck(checks, errors, warnings, id, ok, message, severity = "error") {
  checks.push({ id, status: ok ? "pass" : severity, message });
  if (ok) return;
  if (severity === "warning") warnings.push(message);
  else errors.push(message);
}

export function verifyMarketCustomerEvidenceBundle({ summary, markdown = null, options = {} }) {
  const checks = [];
  const errors = [];
  const warnings = [];

  pushCheck(checks, errors, warnings, "bundle.ready", summary?.ready === true, "Evidence bundle summary must be ready.");
  pushCheck(checks, errors, warnings, "safety.non_custodial", summary?.safety?.nonCustodial === true, "Evidence bundle must keep nonCustodial=true.");
  pushCheck(checks, errors, warnings, "safety.live_submission_disabled", summary?.safety?.liveSubmissionEnabled === false, "Evidence bundle must keep liveSubmissionEnabled=false.");
  pushCheck(checks, errors, warnings, "safety.no_secret_request", summary?.safety?.asksForSecrets === false, "Evidence bundle must keep asksForSecrets=false.");
  pushCheck(checks, errors, warnings, "safety.no_secret_storage", summary?.safety?.storesSecrets === false, "Evidence bundle must keep storesSecrets=false.");

  const requiredStages = Array.isArray(summary?.customerReadySmoke?.requiredStages)
    ? summary.customerReadySmoke.requiredStages
    : [];
  const stageById = new Map(requiredStages.map((stage) => [stage.id, stage]));
  for (const id of REQUIRED_SMOKE_STAGES) {
    const stage = stageById.get(id);
    pushCheck(checks, errors, warnings, `smoke.${id}`, stage?.status === "pass", `Required smoke stage must pass: ${id}.`);
  }

  pushCheck(
    checks,
    errors,
    warnings,
    "official_sdk.accepted",
    summary?.officialSdkValidation?.validation?.ok === true && summary?.officialSdkValidation?.ready === true,
    "Official SDK evidence must be accepted by the validator.",
  );
  if (options.requireOfficialSdkValidated) {
    pushCheck(
      checks,
      errors,
      warnings,
      "official_sdk.all_validated",
      summary?.officialSdkValidation?.allValidated === true,
      "Every venue must be status=validated when --require-official-sdk-validated is set.",
    );
  }

  const sdkManifest = summary?.sdkManifestCheck;
  if (sdkManifest?.present) {
    pushCheck(
      checks,
      errors,
      warnings,
      "sdk_manifest.accepted",
      sdkManifest.ready === true && sdkManifest.ok === true && Number(sdkManifest.fileCount) > 0,
      "Attached SDK run manifest-check evidence must be accepted and include hashed files.",
    );
  } else if (options.requireSdkManifestCheck) {
    pushCheck(checks, errors, warnings, "sdk_manifest.required", false, "SDK run manifest-check evidence is required but absent.");
  }

  const receipt = summary?.receiptCheck;
  if (receipt?.present) {
    pushCheck(
      checks,
      errors,
      warnings,
      "receipt.accepted",
      receipt.ready === true && receipt.ok === true && receipt.matchesHandoff === true,
      "Attached receipt-check evidence must be accepted and match the original handoff.",
    );
  } else if (options.requireReceiptCheck) {
    pushCheck(checks, errors, warnings, "receipt.required", false, "Receipt-check evidence is required but absent.");
  }

  if (Array.isArray(summary?.errors) && summary.errors.length > 0) {
    for (const error of summary.errors) errors.push(`Bundle summary error: ${String(error)}`);
    checks.push({ id: "bundle.errors", status: "error", message: "Evidence bundle summary includes validation errors." });
  }
  if (Array.isArray(summary?.warnings)) {
    warnings.push(...summary.warnings.map((item) => `Bundle summary warning: ${String(item)}`));
  }

  if (markdown !== null) {
    pushCheck(checks, errors, warnings, "markdown.ready_result", /Result:\s*READY_FOR_TEST_CUSTOMER_QA/i.test(markdown), "Markdown bundle must show READY_FOR_TEST_CUSTOMER_QA.");
    pushCheck(checks, errors, warnings, "markdown.safety_posture", markdown.includes("## Safety Posture"), "Markdown bundle must include Safety Posture.");
    pushCheck(checks, errors, warnings, "markdown.red_lines", markdown.includes("## Red Lines"), "Markdown bundle must include Red Lines.");
    if (sdkManifest?.present) {
      pushCheck(checks, errors, warnings, "markdown.sdk_manifest", markdown.includes("## SDK Run Manifest Evidence"), "Markdown bundle must include SDK Run Manifest Evidence.");
    }
    if (receipt?.present) {
      pushCheck(checks, errors, warnings, "markdown.receipt", markdown.includes("## Public Receipt Evidence"), "Markdown bundle must include Public Receipt Evidence.");
    }
  }

  const ok = errors.length === 0;
  return {
    ok,
    ready: ok && summary?.ready === true,
    status: ok ? "READY_FOR_TEST_CUSTOMER_QA" : "NOT_READY",
    checks,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs(process.argv);
  if (config.help) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }

  try {
    const summary = readJson(config.bundleJson, "market customer evidence bundle");
    const markdown = readMarkdown(config.bundleMarkdown);
    const result = verifyMarketCustomerEvidenceBundle({
      summary,
      markdown,
      options: {
        requireOfficialSdkValidated: config.requireOfficialSdkValidated,
        requireSdkManifestCheck: config.requireSdkManifestCheck,
        requireReceiptCheck: config.requireReceiptCheck,
      },
    });
    if (config.output) writeFileSync(config.output, `${JSON.stringify(result, null, 2)}\n`);
    if (config.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`Market customer evidence: ${result.ok ? "READY" : "NOT_READY"}\n`);
      for (const check of result.checks) process.stdout.write(`- ${check.status.toUpperCase()} ${check.id}: ${check.message}\n`);
      for (const warning of result.warnings) process.stderr.write(`Warning: ${warning}\n`);
      for (const error of result.errors) process.stderr.write(`Error: ${error}\n`);
    }
    process.exit(config.strict && !result.ok ? 1 : 0);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
