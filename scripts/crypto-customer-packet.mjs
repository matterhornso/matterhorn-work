#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";

const args = process.argv.slice(2);

const FORBIDDEN_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|token|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedAction|signed_action)$/i;
const REQUIRED_CUSTOMER_SMOKE_STAGES = [
  "crypto.unified_chat",
  "crypto.direct_prompt_safety",
  "crypto.shared_card_contract",
  "market.execution_safety",
  "market.execution_readiness_api",
  "market.sign_request_phase1",
  "market.artifact_validation_phase2",
  "market.artifact_reconciliation",
  "market.official_sdk_validation",
  "market.customer_evidence_bundle",
  "market.customer_evidence_verify",
  "hyperliquid.readiness",
  "polymarket.readiness",
  "bittensor.customer_readiness",
];
const GIT_SHA_RE = /^[a-f0-9]{40}$/i;

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
  marketEvidenceVerify: arg("--market-evidence-verify"),
  bittensorEvidenceBundle: arg("--bittensor-evidence-bundle"),
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  strict: flag("--strict"),
  requireMarketEvidence: flag("--require-market-evidence"),
  requireBittensorEvidence: flag("--require-bittensor-evidence"),
  title: arg("--title") || "Matterhorn Work Crypto Customer Packet",
};

function usage() {
  return [
    "Usage:",
    "  node scripts/crypto-customer-packet.mjs --customer-ready-smoke /tmp/smoke.json --market-evidence-verify /tmp/market-verify.json --output /tmp/packet.md --json-output /tmp/packet.json --strict",
    "",
    "Options:",
    "  --customer-ready-smoke <path>       JSON from matterhorn-work crypto customer-smoke.",
    "  --market-evidence-verify <path>     JSON from matterhorn-work crypto evidence-verify.",
    "  --bittensor-evidence-bundle <path>  Optional JSON from scripts/bittensor-customer-evidence-bundle.mjs or bittensor-evidence-verify.",
    "  --require-market-evidence           Require accepted market evidence verification.",
    "  --require-bittensor-evidence        Require ready Bittensor evidence bundle.",
    "  --output, -o <path>                 Write Markdown packet to a file. Defaults to stdout.",
    "  --json-output <path>                Write machine-readable packet JSON.",
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
  const parsed = JSON.parse(trimmed);
  assertNoForbiddenKeys(parsed, label);
  return parsed;
}

async function evidenceFileHash(path) {
  if (!path) return { present: false, file: null, sha256: null };
  const raw = await readFile(path);
  return {
    present: true,
    file: basename(path),
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

function summarizeSmoke(path, raw) {
  if (!path || raw === null) {
    return {
      present: false,
      ready: false,
      file: null,
      pass: 0,
      fail: 0,
      skip: 0,
      errors: ["Customer-ready crypto smoke evidence is required but missing."],
      warnings: [],
    };
  }
  const stages = Array.isArray(raw.stages) ? raw.stages : [];
  const pass = Number(raw.summary?.pass ?? stages.filter((stage) => stage.status === "pass").length);
  const fail = Number(raw.summary?.fail ?? stages.filter((stage) => stage.status === "fail").length);
  const skip = Number(raw.summary?.skip ?? stages.filter((stage) => stage.status === "skip").length);
  const errors = [];
  const warnings = [];
  if (raw.ready !== true) errors.push("Customer-ready crypto smoke is not ready.");
  if (fail > 0) errors.push(`Customer-ready crypto smoke has ${fail} failing stage(s).`);
  if (raw.safety?.nonCustodial !== true) errors.push("Customer-ready crypto smoke must keep nonCustodial=true.");
  if (raw.safety?.liveSubmissionEnabled !== false) errors.push("Customer-ready crypto smoke must keep liveSubmissionEnabled=false.");
  if (raw.safety?.asksForSecrets !== false) errors.push("Customer-ready crypto smoke must keep asksForSecrets=false.");
  const generatedAt = typeof raw.metadata?.generatedAt === "string" ? raw.metadata.generatedAt : null;
  const gitSha = typeof raw.metadata?.gitSha === "string" ? raw.metadata.gitSha : null;
  const gitBranch = typeof raw.metadata?.gitBranch === "string" ? raw.metadata.gitBranch : null;
  if (!generatedAt || Number.isNaN(Date.parse(generatedAt))) errors.push("Customer-ready crypto smoke must include metadata.generatedAt.");
  if (!gitSha || !GIT_SHA_RE.test(gitSha)) errors.push("Customer-ready crypto smoke must include metadata.gitSha.");
  if (!gitBranch) errors.push("Customer-ready crypto smoke must include metadata.gitBranch.");
  const stageById = new Map(stages.map((stage) => [String(stage?.id ?? ""), stage]));
  const requiredStages = REQUIRED_CUSTOMER_SMOKE_STAGES.map((id) => {
    const stage = stageById.get(id);
    const status = typeof stage?.status === "string" ? stage.status : "missing";
    if (status !== "pass") errors.push(`Customer-ready crypto smoke required stage did not pass: ${id} (${status}).`);
    return { id, status };
  });
  if (skip > 0) warnings.push(`Customer-ready crypto smoke has ${skip} skipped stage(s).`);
  return {
    present: true,
    ready: raw.ready === true && fail === 0 && errors.length === 0,
    file: basename(path),
    generatedAt,
    gitSha,
    gitBranch,
    pass,
    fail,
    skip,
    requiredStages,
    errors,
    warnings,
  };
}

function summarizeMarketEvidence(path, raw, required) {
  if (!path || raw === null) {
    return {
      present: false,
      ready: !required,
      file: null,
      details: marketEvidenceDetails(null),
      errors: required ? ["Market evidence verification is required but missing."] : [],
      warnings: required ? [] : ["Market evidence verification is not attached."],
    };
  }
  const errors = [];
  const warnings = [];
  if (raw.ok !== true || raw.ready !== true) errors.push("Market evidence verification is not ready.");
  if (raw.safety?.nonCustodial !== true) errors.push("Market evidence verification must keep nonCustodial=true.");
  if (raw.safety?.liveSubmissionEnabled !== false) errors.push("Market evidence verification must keep liveSubmissionEnabled=false.");
  if (raw.safety?.signsOrSubmits !== false) errors.push("Market evidence verification must keep signsOrSubmits=false.");
  if (raw.safety?.acceptsSecrets !== false) errors.push("Market evidence verification must keep acceptsSecrets=false.");
  if (Array.isArray(raw.errors)) errors.push(...raw.errors.map((item) => String(item)));
  if (Array.isArray(raw.warnings)) warnings.push(...raw.warnings.map((item) => String(item)));
  return {
    present: true,
    ready: raw.ok === true && raw.ready === true && errors.length === 0,
    file: basename(path),
    status: raw.status ?? null,
    details: marketEvidenceDetails(raw),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

function marketEvidenceCheckPassed(raw, id) {
  return Array.isArray(raw?.checks) && raw.checks.some((check) => check?.id === id && check?.status === "pass");
}

function marketEvidenceDetails(raw) {
  return {
    officialSdkAccepted: marketEvidenceCheckPassed(raw, "official_sdk.accepted"),
    officialSdkAllValidated: marketEvidenceCheckPassed(raw, "official_sdk.all_validated"),
    sdkManifestAccepted: marketEvidenceCheckPassed(raw, "sdk_manifest.accepted"),
    receiptAccepted: marketEvidenceCheckPassed(raw, "receipt.accepted"),
    artifactReconciliationAccepted: marketEvidenceCheckPassed(raw, "artifact_reconciliation.accepted"),
  };
}

function summarizeBittensorEvidence(path, raw, required) {
  if (!path || raw === null) {
    return {
      present: false,
      ready: !required,
      file: null,
      errors: required ? ["Bittensor evidence bundle is required but missing."] : [],
      warnings: required ? [] : ["Bittensor evidence bundle is not attached."],
    };
  }
  const errors = [];
  const warnings = [];
  if (raw.ready !== true) errors.push("Bittensor evidence bundle is not ready.");
  if (Array.isArray(raw.errors)) errors.push(...raw.errors.map((item) => String(item)));
  if (Array.isArray(raw.warnings)) warnings.push(...raw.warnings.map((item) => String(item)));
  return {
    present: true,
    ready: raw.ready === true && errors.length === 0,
    file: basename(path),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

function bullet(text) {
  return `- ${String(text || "").replace(/\n/g, " ").trim()}`;
}

function renderMarkdown(packet) {
  const lines = [
    `# ${packet.title}`,
    "",
    `Result: ${packet.ready ? "READY_FOR_TEST_CUSTOMER_QA" : "NOT_READY"}`,
    "",
    "## Safety Posture",
    "",
    "- Non-custodial: yes",
    "- Live Hyperliquid/Polymarket submission: disabled",
    "- Secrets accepted: no",
    "- Evidence type: public/redacted only",
    "",
    "## Components",
    "",
    "| Component | Ready | Evidence |",
    "| --- | --- | --- |",
    `| Customer-ready crypto smoke | ${packet.customerReadySmoke.ready ? "yes" : "no"} | ${packet.customerReadySmoke.file ?? "missing"} |`,
    `| Market evidence verifier | ${packet.marketEvidence.ready ? "yes" : "no"} | ${packet.marketEvidence.file ?? "not attached"} |`,
    `| Bittensor evidence bundle | ${packet.bittensorEvidence.ready ? "yes" : "no"} | ${packet.bittensorEvidence.file ?? "not attached"} |`,
    "",
    "## Market Evidence Details",
    "",
    "| Check | Accepted |",
    "| --- | --- |",
    `| Official SDK evidence | ${packet.marketEvidence.details.officialSdkAccepted ? "yes" : "no"} |`,
    `| All official SDK venues validated | ${packet.marketEvidence.details.officialSdkAllValidated ? "yes" : "no"} |`,
    `| SDK manifest | ${packet.marketEvidence.details.sdkManifestAccepted ? "yes" : "no"} |`,
    `| Public receipt evidence | ${packet.marketEvidence.details.receiptAccepted ? "yes" : "no"} |`,
    `| Artifact reconciliation | ${packet.marketEvidence.details.artifactReconciliationAccepted ? "yes" : "no"} |`,
    "",
    "## Smoke Summary",
    "",
    bullet(`${packet.customerReadySmoke.pass} passed, ${packet.customerReadySmoke.fail} failed, ${packet.customerReadySmoke.skip} skipped`),
    bullet(`Smoke git SHA: ${packet.customerReadySmoke.gitSha ?? "unavailable"}`),
    bullet(`Smoke generated at: ${packet.customerReadySmoke.generatedAt ?? "unavailable"}`),
    "",
    "## Evidence Hashes",
    "",
    "| Evidence | File | SHA-256 |",
    "| --- | --- | --- |",
    `| Customer-ready crypto smoke | ${packet.inputEvidence.customerReadySmoke.file ?? "missing"} | ${packet.inputEvidence.customerReadySmoke.sha256 ?? "missing"} |`,
    `| Market evidence verifier | ${packet.inputEvidence.marketEvidenceVerify.file ?? "not attached"} | ${packet.inputEvidence.marketEvidenceVerify.sha256 ?? "not attached"} |`,
    `| Bittensor evidence bundle | ${packet.inputEvidence.bittensorEvidenceBundle.file ?? "not attached"} | ${packet.inputEvidence.bittensorEvidenceBundle.sha256 ?? "not attached"} |`,
    "",
    "## Warnings",
    "",
    ...(packet.warnings.length ? packet.warnings.map(bullet) : ["- None."]),
    "",
    "## Validation Errors",
    "",
    ...(packet.errors.length ? packet.errors.map(bullet) : ["- None."]),
    "",
    "## Red Lines",
    "",
    "- Do not treat this packet as authorization for live market submission.",
    "- Do not paste seed phrases, private keys, API secrets, raw signatures, signed payloads, or wallet exports into Matterhorn.",
    "- Do not add `/api/hyperliquid/orders/submit` or `/api/polymarket/orders/submit`.",
  ];
  return `${lines.join("\n")}\n`;
}

export async function buildCryptoCustomerPacket(config) {
  const smokeRaw = await readJson(config.customerReadySmoke, "customer-ready crypto smoke");
  const marketRaw = await readJson(config.marketEvidenceVerify, "market evidence verification");
  const bittensorRaw = await readJson(config.bittensorEvidenceBundle, "Bittensor evidence bundle");
  const customerReadySmoke = summarizeSmoke(config.customerReadySmoke, smokeRaw);
  const marketEvidence = summarizeMarketEvidence(config.marketEvidenceVerify, marketRaw, config.requireMarketEvidence);
  const bittensorEvidence = summarizeBittensorEvidence(config.bittensorEvidenceBundle, bittensorRaw, config.requireBittensorEvidence);
  const inputEvidence = {
    customerReadySmoke: await evidenceFileHash(config.customerReadySmoke),
    marketEvidenceVerify: await evidenceFileHash(config.marketEvidenceVerify),
    bittensorEvidenceBundle: await evidenceFileHash(config.bittensorEvidenceBundle),
  };
  const warnings = [
    ...customerReadySmoke.warnings,
    ...marketEvidence.warnings,
    ...bittensorEvidence.warnings,
  ];
  const errors = [
    ...customerReadySmoke.errors,
    ...marketEvidence.errors,
    ...bittensorEvidence.errors,
  ];
  const ready = customerReadySmoke.ready && marketEvidence.ready && bittensorEvidence.ready && errors.length === 0;
  const packet = {
    title: config.title,
    ready,
    customerReadySmoke,
    marketEvidence,
    bittensorEvidence,
    inputEvidence,
    warnings,
    errors,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      asksForSecrets: false,
      storesSecrets: false,
      signsOrSubmits: false,
      acceptsSecrets: false,
    },
  };
  return {
    packet,
    markdown: renderMarkdown(packet),
  };
}

async function main() {
  if (flag("--help") || flag("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await buildCryptoCustomerPacket(config);
  if (config.output) await writeFile(config.output, result.markdown);
  else process.stdout.write(result.markdown);
  if (config.jsonOutput) await writeFile(config.jsonOutput, `${JSON.stringify(result.packet, null, 2)}\n`);
  if (config.strict && !result.packet.ready) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
