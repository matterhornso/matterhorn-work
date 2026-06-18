#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const DEFAULT_TIMEOUT_MS = 120_000;
const FORBIDDEN_ROUTE_RE = /\/orders\/(submit|sign)|\/exchange\/submit/i;
const FORBIDDEN_SECRET_RE = /(seed phrase|private key|api secret|raw signature|signed payload|wallet export)/i;

const offlineStages = [
  ["bittensor.beta_static_gate", "Bittensor beta static release gate", ["pnpm", "test:bittensor-beta-release-gate"]],
  ["bittensor.customer_readiness", "Bittensor customer readiness gate", ["pnpm", "test:bittensor-customer-readiness-gate"]],
  ["bittensor.receipt", "Bittensor receipt check", ["pnpm", "test:bittensor-receipt-check"]],
  ["bittensor.watch_autopilot", "Bittensor watch autopilot", ["pnpm", "test:bittensor-watch-autopilot"]],
  ["bittensor.watch_scheduler", "Bittensor watch autopilot scheduler", ["pnpm", "test:bittensor-watch-autopilot-scheduler"]],
  ["bittensor.signing_handoff", "Bittensor external signing handoff check", ["pnpm", "test:bittensor-signing-handoff-check"]],
  ["bittensor.evidence_bundle", "Bittensor customer evidence bundle", ["pnpm", "test:bittensor-customer-evidence-bundle"]],
  ["bittensor.evidence_verify", "Bittensor customer evidence verifier", ["pnpm", "test:bittensor-customer-evidence-verify"]],
  ["bittensor.adapter_readonly_canary", "Bittensor read-only adapter canary", ["pnpm", "test:bittensor-adapter-readonly-canary"]],
  ["crypto.customer_readiness_ui", "Customer readiness UI contract", ["pnpm", "test:customer-readiness-ui"]],
  ["crypto.direct_prompt_safety", "Direct venue credential prompt safety", ["pnpm", "test:crypto-direct-prompt-safety"]],
  ["market.execution_safety", "Market execution safety gate", ["pnpm", "test:market-execution-safety-gate"]],
  ["market.execution_readiness", "Market execution-readiness security gate", ["pnpm", "test:market-execution-readiness-gate"]],
  ["market.submit_sign_phase0_contract", "Market submit/sign Phase 0 contract", ["pnpm", "test:market-submit-sign-contract-phase0"]],
  ["market.sign_request_phase1", "Market sign-request Phase 1 gate", ["pnpm", "test:market-sign-request-phase1"]],
  ["market.artifact_validation_phase2", "Market artifact validation Phase 2 gate", ["pnpm", "test:market-artifact-validation-phase2"]],
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
    offline: args.includes("--offline") || !args.includes("--dry-run"),
    dryRun: args.includes("--dry-run"),
    strict: args.includes("--strict"),
    json: args.includes("--json"),
    jsonOutput: arg("--json-output"),
    timeoutMs: Number(arg("--timeout-ms", String(DEFAULT_TIMEOUT_MS))),
    help: args.includes("--help") || args.includes("-h"),
  };
}

function printHelp() {
  process.stdout.write([
    "Matterhorn Work Bittensor beta release gate",
    "",
    "Usage:",
    "  pnpm smoke:bittensor-beta",
    "  node scripts/bittensor-beta-release-gate.mjs --dry-run --json",
    "  node scripts/bittensor-beta-release-gate.mjs --offline --strict --json-output /tmp/matterhorn-bittensor-beta.json",
    "",
    "This gate proves the beta is Bittensor-first while Hyperliquid and Polymarket remain preview/R&D surfaces.",
    "It never signs, submits, stores secrets, or touches customer funds.",
    "",
  ].join("\n"));
}

function stageFromTuple(tuple) {
  const [id, label, command] = tuple;
  return { id, label, command };
}

function buildStages(config) {
  return config.offline || config.dryRun ? offlineStages.map(stageFromTuple) : [];
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
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
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

async function main() {
  const config = parseArgs(process.argv);
  if (config.help) {
    printHelp();
    return;
  }
  const stages = buildStages(config);
  for (const stage of stages) assertCommandIsSafe(stage);
  const results = [];
  if (config.dryRun) {
    for (const stage of stages) results.push({ ...stage, status: "pass", dryRun: true });
  } else {
    for (const stage of stages) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await runCommand(stage, config));
    }
  }

  const report = {
    version: "matterhorn.bittensor-beta-release-gate.v1",
    ready: summarize(results).ready,
    dryRun: config.dryRun,
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
    ...summarize(results),
    stages: results,
  };

  if (config.strict && !report.ready) process.exitCode = 1;
  if (config.jsonOutput) {
    await writeFile(config.jsonOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (config.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`Matterhorn Bittensor beta release gate: ${report.ready ? "READY" : "NOT READY"}\n`);
    process.stdout.write(`Stages: ${report.summary.pass} pass, ${report.summary.fail} fail, ${report.summary.skip} skip\n`);
    for (const stage of results) {
      process.stdout.write(`- ${stage.status.toUpperCase()} ${stage.id}: ${stage.label}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
