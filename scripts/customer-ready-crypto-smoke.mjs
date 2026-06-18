#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const DEFAULT_TIMEOUT_MS = 120_000;

const FORBIDDEN_ROUTE_RE = /\/orders\/(submit|sign)|\/exchange\/submit/i;
const FORBIDDEN_SECRET_RE = /(seed phrase|private key|api secret|raw signature|signed payload|wallet export)/i;

const offlineStages = [
  ["crypto.unified_chat", "Unified crypto chat router", ["pnpm", "test:unified-crypto-chat"]],
  ["crypto.direct_prompt_safety", "Direct venue credential prompt safety", ["pnpm", "test:crypto-direct-prompt-safety"]],
  ["crypto.shared_card_contract", "Unified crypto shared-card contract", ["pnpm", "test:unified-crypto-shared-card-contract"]],
  ["crypto.cli", "Unified crypto CLI fallback smoke", ["pnpm", "test:crypto-cli-fallback"]],
  ["crypto.agent_operator_loop", "Crypto agent operator loop", ["pnpm", "test:agent-crypto-operator-loop"]],
  ["crypto.hermes_customer_qa", "Hermes crypto customer QA handoff", ["pnpm", "test:hermes-crypto-customer-qa"]],
  ["crypto.readiness_api", "Unified crypto readiness API contract", ["pnpm", "test:crypto-readiness-api"]],
  ["crypto.customer_readiness_ui", "Customer readiness UI contract", ["pnpm", "test:customer-readiness-ui"]],
  ["market.safety_contract", "Market shared safety contract", ["pnpm", "test:market-safety-contract"]],
  ["market.execution_safety", "Market execution safety gate", ["pnpm", "test:market-execution-safety-gate"]],
  ["market.execution_readiness", "Market execution-readiness security gate", ["pnpm", "test:market-execution-readiness-gate"]],
  ["market.submit_sign_phase0_contract", "Market submit/sign Phase 0 contract", ["pnpm", "test:market-submit-sign-contract-phase0"]],
  ["market.sign_request_phase1", "Market sign-request Phase 1 gate", ["pnpm", "test:market-sign-request-phase1"]],
  ["market.artifact_validation_phase2", "Market artifact validation Phase 2 gate", ["pnpm", "test:market-artifact-validation-phase2"]],
  ["market.official_sdk_validation", "Market official SDK validation track", ["pnpm", "test:market-official-sdk-validation-track"]],
  ["market.official_sdk_capture", "Market official SDK validation capture", ["pnpm", "test:market-official-sdk-validation-capture"]],
  ["market.official_sdk_doctor", "Market official SDK validation doctor", ["pnpm", "test:market-official-sdk-validation-doctor"]],
  ["market.official_sdk_normalize", "Market official SDK artifact normalizer", ["pnpm", "test:market-official-sdk-normalize"]],
  ["market.official_sdk_operator_loop", "Market official SDK operator loop", ["pnpm", "test:market-official-sdk-operator-loop"]],
  ["market.official_sdk_validate_public", "Market official SDK public validation", ["pnpm", "test:market-official-sdk-validate-public"]],
  ["market.official_sdk_operator_artifacts", "Market official SDK operator artifact examples", ["pnpm", "test:market-official-sdk-operator-artifacts"]],
  ["market.official_sdk_manifest_check", "Market official SDK run manifest checker", ["pnpm", "test:market-sdk-run-manifest-check"]],
  ["market.official_sdk_fixtures", "Market official SDK validation fixtures", ["pnpm", "test:market-official-sdk-validation-fixtures"]],
  ["market.customer_evidence_bundle", "Market customer evidence bundle", ["pnpm", "test:market-customer-evidence-bundle"]],
  ["market.customer_evidence_verify", "Market customer evidence verifier", ["pnpm", "test:market-customer-evidence-verify"]],
  ["crypto.customer_packet", "Crypto customer packet manifest", ["pnpm", "test:crypto-customer-packet"]],
  ["market.receipt_qa", "Market public receipt QA", ["pnpm", "test:market-receipt-qa"]],
  ["market.receipt_evidence", "Market receipt evidence docs/checks", ["pnpm", "test:market-receipt-evidence"]],
  ["hyperliquid.readiness", "Hyperliquid readiness gate", ["pnpm", "test:hyperliquid-readiness-gate"]],
  ["polymarket.readiness", "Polymarket readiness gate", ["pnpm", "test:polymarket-readiness-gate"]],
  ["hyperliquid.read_preview", "Hyperliquid read-preview self-test", ["pnpm", "test:hyperliquid-read-preview-qa"]],
  ["polymarket.read_preview", "Polymarket read-preview self-test", ["pnpm", "test:polymarket-read-preview-qa"]],
  ["hyperliquid.cli", "Hyperliquid CLI fallback smoke", ["pnpm", "test:hyperliquid-cli-fallback"]],
  ["polymarket.cli", "Polymarket CLI fallback smoke", ["pnpm", "test:polymarket-cli-fallback"]],
  ["market.watch_workflows", "Market watch and alert workflows", ["pnpm", "test:market-watch-workflows"]],
  ["market.live_readonly_self_test", "Market live read-only smoke self-test", ["pnpm", "test:market-live-readonly-smoke"]],
  ["bittensor.customer_readiness", "Bittensor customer readiness gate", ["pnpm", "test:bittensor-customer-readiness-gate"]],
  ["bittensor.receipt", "Bittensor receipt check", ["pnpm", "test:bittensor-receipt-check"]],
  ["bittensor.watch_autopilot", "Bittensor watch autopilot", ["pnpm", "test:bittensor-watch-autopilot"]],
  ["bittensor.watch_scheduler", "Bittensor watch autopilot scheduler", ["pnpm", "test:bittensor-watch-autopilot-scheduler"]],
  ["bittensor.signing_handoff", "Bittensor signing handoff check", ["pnpm", "test:bittensor-signing-handoff-check"]],
  ["bittensor.evidence_bundle", "Bittensor customer evidence bundle", ["pnpm", "test:bittensor-customer-evidence-bundle"]],
  ["bittensor.evidence_verify", "Bittensor customer evidence verifier", ["pnpm", "test:bittensor-customer-evidence-verify"]],
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const arg = (name, fallback = "") => {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1]) return args[index + 1];
    const inline = args.find((item) => item.startsWith(`${name}=`));
    return inline ? inline.slice(name.length + 1) : fallback;
  };
  return {
    offline: args.includes("--offline") || (!args.includes("--include-live-server") && !args.includes("--dry-run")),
    includeLiveServer: args.includes("--include-live-server"),
    dryRun: args.includes("--dry-run"),
    strict: args.includes("--strict"),
    json: args.includes("--json"),
    jsonOutput: arg("--json-output"),
    help: args.includes("--help") || args.includes("-h"),
    serverUrl: arg("--server-url", process.env.MATTERHORN_WORK_SERVER_URL || ""),
    token: arg("--token", process.env.MATTERHORN_WORK_TOKEN || ""),
    timeoutMs: Number(arg("--timeout-ms", String(DEFAULT_TIMEOUT_MS))),
  };
}

function printHelp() {
  process.stdout.write([
    "Matterhorn Work customer-ready crypto smoke",
    "",
    "Usage:",
    "  node scripts/customer-ready-crypto-smoke.mjs --dry-run --json",
    "  node scripts/customer-ready-crypto-smoke.mjs --offline --strict --json-output /tmp/matterhorn-crypto-smoke.json",
    "  node scripts/customer-ready-crypto-smoke.mjs --offline --strict",
    "  node scripts/customer-ready-crypto-smoke.mjs --offline --include-live-server --server-url <url> --token <token> --strict --json",
    "",
    "This runner orchestrates existing Bittensor, Hyperliquid, Polymarket, receipt, readiness, and safety gates.",
    "It never submits orders, signs transactions, requests secrets, or touches real funds.",
    "",
  ].join("\n"));
}

function stageFromTuple(tuple) {
  const [id, label, command] = tuple;
  return { id, label, command };
}

function buildStages(config) {
  const stages = [];
  if (config.offline || config.dryRun) {
    stages.push(...offlineStages.map(stageFromTuple));
  }
  if (config.includeLiveServer || config.dryRun) {
    const command = [
      "node",
      "scripts/market-live-readonly-smoke.mjs",
      "--server-url",
      config.serverUrl || "$MATTERHORN_WORK_SERVER_URL",
      "--token",
      config.token ? "<redacted-client-token>" : "$MATTERHORN_WORK_TOKEN",
      "--strict",
      "--json",
    ];
    stages.push({
      id: "market.live_readonly_server",
      label: "Market live local-server read/preview/handoff smoke",
      command,
      requires: ["MATTERHORN_WORK_SERVER_URL", "MATTERHORN_WORK_TOKEN"],
    });
  }
  return stages;
}

function assertCommandIsSafe(stage) {
  const commandText = stage.command.join(" ");
  if (FORBIDDEN_ROUTE_RE.test(commandText)) {
    throw new Error(`${stage.id} references a forbidden submit/sign route`);
  }
}

function redactOutput(text) {
  return String(text || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>")
    .replace(/(MATTERHORN_WORK_TOKEN=)[^\s]+/g, "$1<redacted>")
    .slice(-8000);
}

function runCommand(stage, config) {
  assertCommandIsSafe(stage);
  const [bin, ...args] = stage.command;
  const effectiveArgs = stage.id === "market.live_readonly_server"
    ? [
        "scripts/market-live-readonly-smoke.mjs",
        "--server-url",
        config.serverUrl,
        "--token",
        config.token,
        "--strict",
        "--json",
      ]
    : args;

  return new Promise((resolve) => {
    if (stage.requires?.length) {
      const missing = [];
      if (!config.serverUrl) missing.push("MATTERHORN_WORK_SERVER_URL");
      if (!config.token) missing.push("MATTERHORN_WORK_TOKEN");
      if (missing.length) {
        resolve({
          id: stage.id,
          label: stage.label,
          status: "skip",
          reason: `Missing ${missing.join(", ")}`,
          command: stage.command,
        });
        return;
      }
    }

    const startedAt = Date.now();
    const child = spawn(bin, effectiveArgs, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, config.timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`;
      const secretTextWarning = FORBIDDEN_SECRET_RE.test(combined)
        ? "Output contains secret-topic safety language; verify this is warning copy, not leaked material."
        : null;
      resolve({
        id: stage.id,
        label: stage.label,
        status: code === 0 ? "pass" : "fail",
        exitCode: code,
        signal,
        durationMs: Date.now() - startedAt,
        command: stage.command,
        stdout: redactOutput(stdout),
        stderr: redactOutput(stderr),
        warnings: secretTextWarning ? [secretTextWarning] : [],
      });
    });
  });
}

function summarize(results) {
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const result of results) {
    if (result.status === "pass") counts.pass += 1;
    else if (result.status === "skip") counts.skip += 1;
    else counts.fail += 1;
  }
  return {
    ready: counts.fail === 0,
    summary: counts,
  };
}

function gitValue(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

function buildMetadata() {
  return {
    generatedAt: new Date().toISOString(),
    gitSha: process.env.GITHUB_SHA || gitValue(["rev-parse", "HEAD"]),
    gitBranch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
  };
}

function printHuman(report) {
  process.stdout.write(`Matterhorn Work customer-ready crypto smoke: ${report.ready ? "READY" : "NOT_READY"}\n`);
  for (const stage of report.stages) {
    const suffix = stage.status === "skip" ? ` (${stage.reason})` : "";
    process.stdout.write(`- ${stage.status.toUpperCase()} ${stage.id}: ${stage.label}${suffix}\n`);
  }
}

export async function runCustomerReadyCryptoSmoke(config) {
  const stages = buildStages(config);
  for (const stage of stages) assertCommandIsSafe(stage);
  if (config.dryRun) {
    return {
      ready: true,
      dryRun: true,
      metadata: buildMetadata(),
      summary: { pass: 0, fail: 0, skip: 0 },
      stages: stages.map((stage) => ({ ...stage, status: "planned" })),
      safety: {
        nonCustodial: true,
        liveSubmissionEnabled: false,
        asksForSecrets: false,
      },
    };
  }

  const results = [];
  for (const stage of stages) {
    results.push(await runCommand(stage, config));
    if (config.strict && results.at(-1)?.status === "fail") break;
  }
  const summary = summarize(results);
  return {
    ...summary,
    dryRun: false,
    metadata: buildMetadata(),
    stages: results,
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      asksForSecrets: false,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = parseArgs(process.argv);
  if (config.help) {
    printHelp();
    process.exit(0);
  }
  const report = await runCustomerReadyCryptoSmoke(config);
  if (config.jsonOutput) await writeFile(config.jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printHuman(report);
  process.exit(config.strict && !report.ready ? 1 : 0);
}
