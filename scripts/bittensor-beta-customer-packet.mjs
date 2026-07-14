#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const PACKET_BASENAME = "matterhorn-bittensor-beta-rc";
const FORBIDDEN_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|token|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)$/i;
const FORBIDDEN_MARKDOWN_VALUE_RE =
  /\b(seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|walletExport|wallet_export|rawSignature|raw_signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)\b\s*[:=]\s*\S+/i;
const REQUIRED_BETA_STAGES = [
  "bittensor.beta_static_gate",
  "bittensor.customer_readiness",
  "bittensor.receipt",
  "bittensor.watch_autopilot",
  "bittensor.watch_scheduler",
  "bittensor.signing_handoff",
  "bittensor.evidence_bundle",
  "bittensor.evidence_verify",
  "bittensor.adapter_readonly_canary",
  "market.execution_safety",
  "market.execution_readiness",
  "market.submit_sign_phase0_contract",
  "market.sign_request_phase1",
  "market.artifact_validation_phase2",
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
  outputDir: arg("--output-dir", "/tmp/matterhorn-bittensor-beta-rc"),
  betaGate: arg("--beta-gate"),
  customerReadySmoke: arg("--customer-ready-smoke"),
  bittensorEvidenceVerify: arg("--bittensor-evidence-verify"),
  livePublicQa: arg("--live-public-qa"),
  browserQa: arg("--browser-qa"),
  fixture: flag("--fixture"),
  strict: flag("--strict"),
  json: flag("--json"),
  help: flag("--help") || flag("-h"),
};

function usage() {
  return [
    "Matterhorn Work Bittensor beta customer packet",
    "",
    "Usage:",
    "  node scripts/bittensor-beta-customer-packet.mjs --output-dir /tmp/matterhorn-bittensor-beta-rc --fixture --json",
    "  node scripts/bittensor-beta-customer-packet.mjs --output-dir /tmp/matterhorn-bittensor-beta-rc --beta-gate /tmp/beta.json --customer-ready-smoke /tmp/smoke.json --bittensor-evidence-verify /tmp/bittensor-verify.json --browser-qa /tmp/browser-qa.md --strict --json",
    "",
    "Inputs are public/redacted evidence only. Do not attach seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, or customer funds.",
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
    if (FORBIDDEN_KEY_RE.test(key)) {
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

async function readMarkdown(path, label) {
  if (!path) return null;
  const raw = await readFile(path, "utf8");
  if (FORBIDDEN_MARKDOWN_VALUE_RE.test(raw)) {
    throw new Error(`${label} contains forbidden secret-shaped assignment text.`);
  }
  return raw;
}

async function evidenceHash(path) {
  if (!path) return null;
  const raw = await readFile(path);
  return {
    file: basename(path),
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

function gitValue(gitArgs) {
  try {
    return execFileSync("git", gitArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function fixtureBetaGate() {
  return {
    version: "matterhorn.bittensor-beta-release-gate.v1",
    ready: true,
    dryRun: true,
    metadata: {
      generatedAt: new Date().toISOString(),
      gitSha: gitValue(["rev-parse", "HEAD"]),
      gitBranch: gitValue(["branch", "--show-current"]),
    },
    safety: {
      betaScope: "bittensor",
      nonCustodial: true,
      asksForSecrets: false,
      bittensorExternalSignerRequired: true,
      marketExecutionEnabled: false,
      liveSubmissionEnabled: false,
      hyperliquidPolymarketStatus: "preview_r_and_d_only",
    },
    summary: { pass: REQUIRED_BETA_STAGES.length, fail: 0, skip: 0 },
    stages: REQUIRED_BETA_STAGES.map((id) => ({
      id,
      label: id.replace(/[._]/g, " "),
      status: "pass",
      fixture: true,
    })),
  };
}

function summarizeBetaGate(raw) {
  if (!raw) {
    return {
      present: false,
      ready: false,
      errors: ["Bittensor beta gate evidence is missing."],
      warnings: [],
    };
  }
  const stages = Array.isArray(raw.stages) ? raw.stages : [];
  const stageById = new Map(stages.map((stage) => [String(stage?.id ?? ""), stage]));
  const errors = [];
  const warnings = [];
  if (raw.ready !== true) errors.push("Bittensor beta gate is not ready.");
  if (raw.safety?.betaScope !== "bittensor") errors.push("Beta gate must declare betaScope=bittensor.");
  if (raw.safety?.nonCustodial !== true) errors.push("Beta gate must keep nonCustodial=true.");
  if (raw.safety?.asksForSecrets !== false) errors.push("Beta gate must keep asksForSecrets=false.");
  if (raw.safety?.marketExecutionEnabled !== false) errors.push("Beta gate must keep marketExecutionEnabled=false.");
  if (raw.safety?.liveSubmissionEnabled !== false) errors.push("Beta gate must keep liveSubmissionEnabled=false.");
  for (const id of REQUIRED_BETA_STAGES) {
    const status = String(stageById.get(id)?.status ?? "missing");
    if (status !== "pass") errors.push(`Required beta stage did not pass: ${id} (${status}).`);
  }
  const skip = Number(raw.summary?.skip ?? stages.filter((stage) => stage.status === "skip").length);
  if (skip > 0) warnings.push(`Bittensor beta gate has ${skip} skipped stage(s).`);
  return {
    present: true,
    ready: errors.length === 0,
    generatedAt: raw.metadata?.generatedAt ?? null,
    gitSha: raw.metadata?.gitSha ?? null,
    gitBranch: raw.metadata?.gitBranch ?? null,
    pass: Number(raw.summary?.pass ?? stages.filter((stage) => stage.status === "pass").length),
    fail: Number(raw.summary?.fail ?? stages.filter((stage) => stage.status === "fail").length),
    skip,
    requiredStages: REQUIRED_BETA_STAGES.map((id) => ({ id, status: String(stageById.get(id)?.status ?? "missing") })),
    errors,
    warnings,
  };
}

function summarizeCustomerSmoke(raw) {
  if (!raw) return { present: false, ready: false, warnings: [], errors: ["Customer-ready crypto smoke evidence not attached."] };
  const errors = [];
  if (raw.ready !== true) errors.push("Customer-ready crypto smoke is not ready.");
  if (raw.safety?.nonCustodial !== true) errors.push("Customer-ready crypto smoke must keep nonCustodial=true.");
  if (raw.safety?.liveSubmissionEnabled !== false) errors.push("Customer-ready crypto smoke must keep liveSubmissionEnabled=false.");
  if (raw.safety?.asksForSecrets !== false) errors.push("Customer-ready crypto smoke must keep asksForSecrets=false.");
  return {
    present: true,
    ready: errors.length === 0,
    pass: Number(raw.summary?.pass ?? 0),
    fail: Number(raw.summary?.fail ?? 0),
    skip: Number(raw.summary?.skip ?? 0),
    errors,
    warnings: [],
  };
}

function summarizeBittensorEvidence(raw) {
  if (!raw) return { present: false, ready: false, warnings: [], errors: ["Bittensor evidence verification not attached."] };
  const errors = [];
  if (raw.ready !== true && raw.ok !== true) errors.push("Bittensor evidence verification is not ready.");
  if (raw.safety?.nonCustodial !== true) errors.push("Bittensor evidence verification must keep nonCustodial=true.");
  if (raw.safety?.liveSubmissionEnabled !== false) errors.push("Bittensor evidence verification must keep liveSubmissionEnabled=false.");
  return {
    present: true,
    ready: errors.length === 0,
    status: raw.status ?? null,
    errors,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
  };
}

function summarizeLivePublicQa(raw) {
  if (!raw) return { present: false, ready: true, warnings: ["Live public-data QA not attached; fixture fallback is acceptable before public inputs are available."], errors: [] };
  const statusText = String(raw.status ?? raw.result ?? "");
  const fixtureFallback = /SKIPPED_WITH_FIXTURE_FALLBACK/i.test(statusText) || raw.fixture === true;
  const ready = raw.ready === true || raw.ok === true || fixtureFallback;
  return {
    present: true,
    ready,
    fixtureFallback,
    status: raw.status ?? raw.result ?? null,
    errors: ready ? [] : ["Live public-data QA is attached but not ready."],
    warnings: fixtureFallback
      ? ["Live public-data QA used fallback for one or more optional evidence stages. Review the attached report and complete any launch-required inputs before full go-live."]
      : [],
  };
}

function summarizeBrowserQa(markdown) {
  if (!markdown) return { present: false, ready: false, errors: ["Browser QA checklist is missing."], warnings: [] };
  const required = [
    "Bittensor desk",
    "Show my TAO balance",
    "Find useful subnets",
    "Compare validators",
    "Prepare staking preview",
    "public SS58",
    "degraded provider",
    "external signer",
    "launched session",
    "mobile",
    "tablet",
    "desktop",
  ];
  const errors = required.filter((item) => !markdown.toLowerCase().includes(item.toLowerCase())).map((item) => `Browser QA markdown missing: ${item}`);
  return {
    present: true,
    ready: errors.length === 0,
    errors,
    warnings: [],
  };
}

function renderMarkdown(packet) {
  const lines = [
    "# Matterhorn Work Bittensor Beta Release Candidate Packet",
    "",
    `Result: ${packet.ready ? "READY_FOR_TEST_CUSTOMER_QA" : "NOT_READY"}`,
    "",
    "## Release Branch",
    "",
    "- Recommended branch: `beta/bittensor` from latest green `dev`.",
    "- Required app flag: `VITE_MATTERHORN_BITTENSOR_BETA=1`.",
    "- Required runtime flag: `BITTENSOR_BETA_ENABLED=true`.",
    "- Market execution flags: `MARKETS_LIVE_SUBMIT_ENABLED=false`, `EXPERIMENTAL_MARKET_EXECUTION=false`.",
    "",
    "## Safety Boundary",
    "",
    "- Bittensor is the customer-facing beta surface.",
    "- Hyperliquid and Polymarket remain preview/R&D-only and are not part of the beta launch promise.",
    "- No seed phrases, private keys, API secrets, raw signatures, signed payloads, wallet exports, custody, or live market submission.",
    "- Bittensor actions require an external signer before anything can be broadcast.",
    "",
    "## Evidence Summary",
    "",
    `- Bittensor beta gate: ${packet.evidence.betaGate.ready ? "ready" : "not ready"}`,
    `- Customer-ready crypto smoke: ${packet.evidence.customerReadySmoke.ready ? "ready" : packet.evidence.customerReadySmoke.present ? "not ready" : "not attached"}`,
    `- Bittensor evidence verification: ${packet.evidence.bittensorEvidence.ready ? "ready" : packet.evidence.bittensorEvidence.present ? "not ready" : "not attached"}`,
    `- Live public-data QA: ${packet.evidence.livePublicQa.ready ? "ready" : packet.evidence.livePublicQa.present ? "not ready" : "not attached"}`,
    `- Browser QA: ${packet.evidence.browserQa.ready ? "ready" : packet.evidence.browserQa.present ? "not ready" : "not attached"}`,
    "",
    "## Customer Demo Checklist",
    "",
    "- Open the Bittensor desk with beta mode enabled.",
    "- Confirm the desk exposes balance, subnet, validator, and staking-preview tasks.",
    "- Test `show my TAO` with a public SS58 address.",
    "- Test `where am I staked?` using the same public address.",
    "- Test subnet discovery for image generation.",
    "- Test validator comparison on subnet 14.",
    "- Test staking preview with explicit netuid and validator hotkey.",
    "- Confirm every action says external signer required.",
    "",
    "## Rollback Plan",
    "",
    "- Turn off `VITE_MATTERHORN_BITTENSOR_BETA` in the app build.",
    "- Turn off `BITTENSOR_BETA_ENABLED` in runtime config.",
    "- Keep `MARKETS_LIVE_SUBMIT_ENABLED=false` and `EXPERIMENTAL_MARKET_EXECUTION=false`.",
    "- Revert customer testers to the previous stable Matterhorn Work build.",
    "- Preserve the packet JSON/Markdown and issue ledger for postmortem.",
  ];
  if (packet.errors.length) {
    lines.push("", "## Blocking Issues", "", ...packet.errors.map((error) => `- ${error}`));
  }
  if (packet.warnings.length) {
    lines.push("", "## Warnings", "", ...packet.warnings.map((warning) => `- ${warning}`));
  }
  lines.push("", "## Evidence Hashes", "");
  for (const hash of packet.hashes.filter(Boolean)) {
    lines.push(`- ${hash.file}: ${hash.sha256}`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  if (config.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!config.fixture && !config.betaGate) {
    throw new Error("--beta-gate is required unless --fixture is set.");
  }

  await mkdir(config.outputDir, { recursive: true });
  const betaGateRaw = config.fixture && !config.betaGate ? fixtureBetaGate() : await readJson(config.betaGate, "Bittensor beta gate");
  const customerSmokeRaw = await readJson(config.customerReadySmoke, "Customer-ready crypto smoke");
  const bittensorEvidenceRaw = await readJson(config.bittensorEvidenceVerify, "Bittensor evidence verification");
  const livePublicQaRaw = await readJson(config.livePublicQa, "Live public-data QA");
  const browserQaMarkdown = await readMarkdown(config.browserQa, "Browser QA checklist");

  const evidence = {
    betaGate: summarizeBetaGate(betaGateRaw),
    customerReadySmoke: summarizeCustomerSmoke(customerSmokeRaw),
    bittensorEvidence: summarizeBittensorEvidence(bittensorEvidenceRaw),
    livePublicQa: summarizeLivePublicQa(livePublicQaRaw),
    browserQa: summarizeBrowserQa(browserQaMarkdown),
  };
  const errors = [
    ...evidence.betaGate.errors,
    ...evidence.customerReadySmoke.errors,
    ...evidence.bittensorEvidence.errors,
    ...evidence.livePublicQa.errors,
    ...evidence.browserQa.errors,
  ];
  const warnings = [
    ...evidence.betaGate.warnings,
    ...evidence.customerReadySmoke.warnings,
    ...evidence.bittensorEvidence.warnings,
    ...evidence.livePublicQa.warnings,
    ...evidence.browserQa.warnings,
  ];
  if (config.fixture) warnings.push("Fixture mode is for packet shape validation only; replace with real evidence before go-live.");

  const hashes = [
    await evidenceHash(config.betaGate),
    await evidenceHash(config.customerReadySmoke),
    await evidenceHash(config.bittensorEvidenceVerify),
    await evidenceHash(config.livePublicQa),
    await evidenceHash(config.browserQa),
  ];
  const packet = {
    version: "matterhorn.bittensor-beta-rc-packet.v1",
    ready: errors.length === 0 && evidence.betaGate.ready === true && evidence.browserQa.ready === true,
    generatedAt: new Date().toISOString(),
    git: {
      sha: gitValue(["rev-parse", "HEAD"]),
      branch: gitValue(["branch", "--show-current"]),
    },
    fixture: config.fixture,
    safety: {
      betaScope: "bittensor",
      nonCustodial: true,
      asksForSecrets: false,
      liveSubmissionEnabled: false,
      marketExecutionEnabled: false,
      bittensorExternalSignerRequired: true,
    },
    evidence,
    hashes: hashes.filter(Boolean),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    nextActions: errors.length
      ? ["Fix blocking issues, rerun pnpm smoke:bittensor-beta, rerun browser QA, regenerate this packet."]
      : ["Cut beta/bittensor from the same SHA, attach packet artifacts, and start limited test-customer onboarding."],
  };

  const jsonPath = join(config.outputDir, `${PACKET_BASENAME}.json`);
  const mdPath = join(config.outputDir, `${PACKET_BASENAME}.md`);
  const shaPath = join(config.outputDir, `${PACKET_BASENAME}.sha256`);
  const markdown = renderMarkdown(packet);
  await writeFile(jsonPath, `${JSON.stringify(packet, null, 2)}\n`, "utf8");
  await writeFile(mdPath, markdown, "utf8");
  const jsonSha = createHash("sha256").update(await readFile(jsonPath)).digest("hex");
  const mdSha = createHash("sha256").update(await readFile(mdPath)).digest("hex");
  await writeFile(shaPath, `${jsonSha}  ${basename(jsonPath)}\n${mdSha}  ${basename(mdPath)}\n`, "utf8");

  const summary = {
    ready: packet.ready,
    status: packet.ready ? "READY_FOR_TEST_CUSTOMER_QA" : "NOT_READY",
    outputDir: config.outputDir,
    files: {
      json: jsonPath,
      markdown: mdPath,
      sha256: shaPath,
    },
    errors: packet.errors,
    warnings: packet.warnings,
  };
  if (config.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  else {
    process.stdout.write(`Bittensor beta RC packet: ${summary.status}\n`);
    process.stdout.write(`- ${jsonPath}\n- ${mdPath}\n- ${shaPath}\n`);
  }
  if (config.strict && !packet.ready) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
