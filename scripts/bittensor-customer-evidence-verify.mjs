#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const FORBIDDEN_KEY_RE =
  /^(seed|seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|token|rawSignature|raw_signature|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)$/i;
const FORBIDDEN_MARKDOWN_VALUE_RE =
  /\b(seedPhrase|mnemonic|privateKey|private_key|apiKey|api_key|apiSecret|api_secret|walletExport|wallet_export|rawSignature|raw_signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)\b\s*[:=]\s*\S+/i;

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
    requireReceiptCheck: args.includes("--require-receipt-check"),
    requireReadonlyAdapterCanary: args.includes("--require-readonly-adapter-canary"),
    requireWatchAutopilotScheduler: args.includes("--require-watch-autopilot-scheduler"),
    bundleJson: value("--bundle-json"),
    bundleMarkdown: value("--bundle-md") || value("--bundle-markdown"),
    output: value("--output") || value("-o"),
  };
}

function usage() {
  return [
    "Matterhorn Bittensor customer evidence verifier",
    "",
    "Usage:",
    "  node scripts/bittensor-customer-evidence-verify.mjs --bundle-json /tmp/bittensor-evidence.json --bundle-md /tmp/bittensor-evidence.md --strict --json",
    "",
    "The verifier is offline and public-data only. It validates the final Bittensor customer evidence bundle summary, optional Markdown, CI/readiness state, and optional receipt/canary/watch evidence.",
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

function optionalEvidence(checks, errors, summary, key, label, required) {
  const value = summary?.[key];
  if (value) {
    pushCheck(checks, errors, [], `optional.${key}`, value.ready === true, `${label} evidence must be ready when attached.`);
    return;
  }
  if (required) pushCheck(checks, errors, [], `optional.${key}.required`, false, `${label} evidence is required but absent.`);
}

export function verifyBittensorCustomerEvidenceBundle({ summary, markdown = null, options = {} }) {
  const checks = [];
  const errors = [];
  const warnings = [];

  pushCheck(checks, errors, warnings, "bundle.ready", summary?.ready === true, "Bittensor evidence bundle must be ready.");
  pushCheck(checks, errors, warnings, "bittensor.live_qa", summary?.bittensor?.ready === true, "Bittensor live QA summary must be ready.");
  pushCheck(checks, errors, warnings, "agent_control.ready", summary?.agentControl?.ready === true, "Agent control live QA summary must be ready.");
  pushCheck(checks, errors, warnings, "readiness_gate.ready", summary?.readinessGate?.ready === true, "Customer readiness gate must be ready.");
  pushCheck(checks, errors, warnings, "ci.present", Number(summary?.ci?.total ?? 0) > 0, "CI evidence must include at least one check.");
  pushCheck(checks, errors, warnings, "ci.no_failures", Array.isArray(summary?.ci?.failed) && summary.ci.failed.length === 0, "CI evidence must have no failed checks.");
  pushCheck(checks, errors, warnings, "ci.no_pending", Array.isArray(summary?.ci?.pending) && summary.ci.pending.length === 0, "CI evidence must have no pending checks.");

  optionalEvidence(checks, errors, summary, "receiptCheck", "Receipt check", options.requireReceiptCheck);
  optionalEvidence(checks, errors, summary, "readonlyAdapterCanary", "Read-only adapter canary", options.requireReadonlyAdapterCanary);
  optionalEvidence(checks, errors, summary, "watchAutopilotScheduler", "Scheduled watch autopilot", options.requireWatchAutopilotScheduler);

  if (Array.isArray(summary?.bittensor?.failedStages) && summary.bittensor.failedStages.length > 0) {
    errors.push(`Bittensor failed stages remain: ${summary.bittensor.failedStages.join(", ")}`);
  }

  if (markdown !== null) {
    pushCheck(checks, errors, warnings, "markdown.ready_result", /READY_FOR_TEST_CUSTOMERS/i.test(markdown), "Markdown bundle must show READY_FOR_TEST_CUSTOMERS.");
    pushCheck(checks, errors, warnings, "markdown.gate_summary", markdown.includes("## Gate Summary"), "Markdown bundle must include Gate Summary.");
    pushCheck(checks, errors, warnings, "markdown.customer_demo", markdown.includes("## Before Customer Demo"), "Markdown bundle must include Before Customer Demo.");
  }

  const ok = errors.length === 0;
  return {
    ok,
    ready: ok && summary?.ready === true,
    status: ok ? "READY_FOR_TEST_CUSTOMERS" : "NOT_READY",
    checks,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      signsOrBroadcasts: false,
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
    const summary = readJson(config.bundleJson, "Bittensor customer evidence bundle");
    const markdown = readMarkdown(config.bundleMarkdown);
    const result = verifyBittensorCustomerEvidenceBundle({
      summary,
      markdown,
      options: {
        requireReceiptCheck: config.requireReceiptCheck,
        requireReadonlyAdapterCanary: config.requireReadonlyAdapterCanary,
        requireWatchAutopilotScheduler: config.requireWatchAutopilotScheduler,
      },
    });
    if (config.output) writeFileSync(config.output, `${JSON.stringify(result, null, 2)}\n`);
    if (config.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`Bittensor customer evidence: ${result.ok ? "READY" : "NOT_READY"}\n`);
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
