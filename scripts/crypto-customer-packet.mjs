#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

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
    "  --bittensor-evidence-bundle <path>  Optional JSON from scripts/bittensor-customer-evidence-bundle.mjs.",
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
  if (skip > 0) warnings.push(`Customer-ready crypto smoke has ${skip} skipped stage(s).`);
  return {
    present: true,
    ready: raw.ready === true && fail === 0 && errors.length === 0,
    file: basename(path),
    pass,
    fail,
    skip,
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
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
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
    "## Smoke Summary",
    "",
    bullet(`${packet.customerReadySmoke.pass} passed, ${packet.customerReadySmoke.fail} failed, ${packet.customerReadySmoke.skip} skipped`),
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
