#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const args = process.argv.slice(2);

const FORBIDDEN_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|api[_-]?key|token|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;
const FORBIDDEN_EXACT_KEY_RE = /^(signature)$/i;

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
  bittensorLiveQa: arg("--bittensor-live-qa"),
  agentControlLiveQa: arg("--agent-control-live-qa"),
  ci: arg("--ci"),
  readinessGate: arg("--readiness-gate"),
  walletTimeline: arg("--wallet-timeline"),
  adapterCanary: arg("--adapter-canary"),
  readonlyAdapterCanary: arg("--readonly-adapter-canary"),
  receiptCheck: arg("--receipt-check"),
  watchAutopilotScheduler: arg("--watch-autopilot-scheduler"),
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  strict: flag("--strict"),
  requireAdapterCanary: flag("--require-adapter-canary"),
  requireReadonlyAdapterCanary: flag("--require-readonly-adapter-canary"),
  requireReceiptCheck: flag("--require-receipt-check"),
  requireWatchAutopilotScheduler: flag("--require-watch-autopilot-scheduler"),
  title: arg("--title") || "Matterhorn Work Bittensor Customer Evidence Bundle",
};

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-customer-evidence-bundle.mjs --bittensor-live-qa /tmp/bittensor.json --agent-control-live-qa /tmp/agent.json --ci /tmp/ci.json --readiness-gate /tmp/gate.md --output /tmp/bundle.md --strict",
    "",
    "Options:",
    "  --bittensor-live-qa <path>     JSON output from scripts/bittensor-live-qa.mjs.",
    "  --agent-control-live-qa <path>  JSON output from scripts/agent-control-live-qa.mjs.",
    "  --ci <path>                    JSON containing GitHub check/workflow conclusions.",
    "  --readiness-gate <path>        Markdown output from scripts/bittensor-customer-readiness-gate.mjs.",
    "  --wallet-timeline <path>       Optional public-data wallet timeline status/export JSON.",
    "  --adapter-canary <path>        Optional JSON from scripts/bittensor-adapter-canary-gate.mjs.",
    "  --readonly-adapter-canary <path> Optional JSON from scripts/bittensor-adapter-readonly-canary.mjs.",
    "  --receipt-check <path>         Optional JSON from scripts/bittensor-receipt-check.mjs.",
    "  --watch-autopilot-scheduler <path> Optional JSON summary from scripts/bittensor-watch-autopilot-scheduler.mjs.",
    "  --require-adapter-canary       Require adapter canary evidence to be ready.",
    "  --require-readonly-adapter-canary Require read-only adapter canary evidence to be ready.",
    "  --require-receipt-check        Require post-signer receipt check evidence to be accepted.",
    "  --require-watch-autopilot-scheduler Require scheduled watch autopilot evidence to be successful.",
    "  --output, -o <path>            Write Markdown bundle to a file. Defaults to stdout.",
    "  --json-output <path>           Write machine-readable evidence summary JSON.",
    "  --strict                       Exit nonzero when the bundle is not customer-ready.",
    "  --title <text>                 Report title.",
  ].join("\n");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function assertNoForbiddenKeys(value, label, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenKeys(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EXACT_KEY_RE.test(key) || FORBIDDEN_KEY_RE.test(key)) {
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

async function readText(path) {
  if (!path) return "";
  return readFile(path, "utf8");
}

function summaryValue(report, key) {
  const value = report?.summary?.[key];
  return Number.isFinite(value) ? value : 0;
}

function isReady(report) {
  return report?.ready === true || report?.ok === true || report?.status === "ready";
}

function stageLabel(stage) {
  return String(stage.label || stage.id || stage.name || "").trim();
}

function passedStages(report) {
  return asArray(report?.stages)
    .filter((stage) => /pass|ok|success/i.test(String(stage.status || stage.result || "")))
    .map(stageLabel)
    .filter(Boolean)
    .slice(0, 12);
}

function failedStages(report) {
  return asArray(report?.stages)
    .filter((stage) => /fail|error/i.test(String(stage.status || stage.result || "")))
    .map(stageLabel)
    .filter(Boolean);
}

function ciItems(ci) {
  return [
    ...asArray(ci?.checks),
    ...asArray(ci?.statuses),
    ...asArray(ci?.workflow_runs),
    ...asArray(ci?.runs),
    ...asArray(ci?.jobs),
  ];
}

function ciName(item) {
  return String(item.name || item.workflowName || item.context || item.check || item.title || "").trim();
}

function ciConclusion(item) {
  return String(item.conclusion || item.status || item.state || "").toLowerCase();
}

function summarizeCi(ci) {
  const items = ciItems(ci);
  const passed = items
    .filter((item) => /success|completed|pass|passed/.test(ciConclusion(item)))
    .map(ciName)
    .filter(Boolean);
  const failed = items
    .filter((item) => /failure|failed|error|cancelled|timed_out/.test(ciConclusion(item)))
    .map(ciName)
    .filter(Boolean);
  const pending = items
    .filter((item) => /pending|queued|in_progress|running/.test(ciConclusion(item)))
    .map(ciName)
    .filter(Boolean);
  return { total: items.length, passed, failed, pending };
}

function walletTimelineSummary(timeline) {
  if (!timeline) return null;
  const snapshots = Number(timeline.snapshotCount ?? timeline.snapshots?.length ?? timeline.count ?? 0);
  return {
    enabled: timeline.enabled !== false,
    snapshots,
    latestSnapshotAt: timeline.latestSnapshotAt || timeline.latest?.capturedAt || timeline.latest?.timestamp || "",
    storage: timeline.storage || timeline.location || "public-data snapshot store",
  };
}

function readinessGateReady(markdown) {
  if (!markdown) return false;
  return /READY_FOR_TEST_CUSTOMERS|passes this evidence-backed Bittensor customer-readiness gate/i.test(markdown);
}

function adapterCanarySummary(canary) {
  if (!canary) return null;
  const findings = asArray(canary.findings);
  const failCount = Number(canary.summary?.fail ?? findings.filter((finding) => /fail/i.test(String(finding.status || ""))).length ?? 0);
  const warnCount = Number(canary.summary?.warn ?? findings.filter((finding) => /warn/i.test(String(finding.status || ""))).length ?? 0);
  const ready = canary.readyForCanary === true || canary.ready === true || canary.status === "ready";
  return {
    ready,
    netuid: canary.netuid ?? null,
    serviceAdapter: canary.serviceAdapter || canary.adapter || "",
    detail: ready ? "Adapter canary gate says ready" : `${failCount} failed, ${warnCount} warnings`,
    findings: findings.slice(0, 8).map((finding) => `${finding.area || "Finding"}: ${finding.status || "unknown"}`),
  };
}

function readonlyAdapterCanarySummary(canary) {
  if (!canary) return null;
  const findings = asArray(canary.findings);
  const failCount = Number(canary.summary?.fail ?? findings.filter((finding) => /fail/i.test(String(finding.status || ""))).length ?? 0);
  const warnCount = Number(canary.summary?.warn ?? findings.filter((finding) => /warn/i.test(String(finding.status || ""))).length ?? 0);
  const ready = canary.ready === true || canary.status === "ready";
  return {
    ready,
    invoked: canary.invoked === true,
    netuid: canary.netuid ?? null,
    serviceAdapter: canary.serviceAdapter || canary.adapter || "",
    previewRequestSha256: canary.previewRequestSha256 || "",
    detail: ready ? "Read-only canary ready; invoked " + (canary.invoked === true ? "yes" : "no") : failCount + " failed, " + warnCount + " warnings",
    findings: findings.slice(0, 8).map((finding) => String(finding.area || "Finding") + ": " + String(finding.status || "unknown")),
  };
}

function receiptCheckSummary(receiptCheck) {
  if (!receiptCheck) return null;
  const findings = asArray(receiptCheck.findings);
  const failCount = Number(receiptCheck.summary?.fail ?? findings.filter((finding) => /fail/i.test(String(finding.status || ""))).length ?? 0);
  const warnCount = Number(receiptCheck.summary?.warn ?? findings.filter((finding) => /warn/i.test(String(finding.status || ""))).length ?? 0);
  const accepted = receiptCheck.accepted === true || receiptCheck.result === "RECEIPT_CAPTURED";
  const ready = accepted && failCount === 0;
  const txHash = String(receiptCheck.txHash || "").trim();
  const status = String(receiptCheck.status || "unknown").trim() || "unknown";
  const action = String(receiptCheck.action || "unknown").trim() || "unknown";
  const netuid = receiptCheck.netuid ?? null;
  return {
    ready,
    accepted,
    txHash,
    status,
    action,
    netuid,
    detail: ready ? `Receipt check accepted; status ${status}` : `${failCount} failed, ${warnCount} warnings`,
    findings: findings.slice(0, 8).map((finding) => `${finding.area || "Finding"}: ${finding.status || "unknown"}`),
    followUpPrompt: receiptCheck.followUpPrompt || "",
  };
}

function watchAutopilotSchedulerSummary(scheduler) {
  if (!scheduler) return null;
  const failedChecks = Number(scheduler.failedChecks ?? scheduler.summary?.failedChecks ?? 0);
  const iterations = Number(scheduler.iterations ?? scheduler.runs?.length ?? 0);
  const totalAlerts = Number(scheduler.totalAlerts ?? scheduler.summary?.totalAlerts ?? 0);
  const totalEvaluations = Number(scheduler.totalEvaluations ?? scheduler.summary?.totalEvaluations ?? 0);
  const ok = scheduler.ok === true || scheduler.ready === true || scheduler.status === "ready";
  const ready = ok && failedChecks === 0;
  const latestCheckedAt = scheduler.latest?.checkedAt || scheduler.latestCheckedAt || "";
  return {
    ready,
    iterations,
    totalAlerts,
    totalEvaluations,
    failedChecks,
    latestCheckedAt,
    detail: ready
      ? `${iterations} scheduled checks, ${totalAlerts} alerts, ${totalEvaluations} evaluations`
      : `${failedChecks} failed checks across ${iterations} scheduled checks`,
    safety: scheduler.safety || {},
    source: scheduler.source || "matterhorn_bittensor_watch_autopilot_scheduler",
  };
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function bullet(items, fallback = "None.") {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : fallback;
}

function basenameOrMissing(value) {
  return value ? basename(value) : "missing";
}

function renderMarkdown(summary) {
  const rows = [
    ["Bittensor live QA", summary.bittensor.ready ? "pass" : "fail", summary.bittensor.detail],
    ["Agent control live QA", summary.agentControl.ready ? "pass" : "warn", summary.agentControl.detail],
    ["Customer readiness gate", summary.readinessGate.ready ? "pass" : "warn", summary.readinessGate.detail],
    [
      "CI evidence",
      summary.ci.failed.length === 0 && summary.ci.pending.length === 0 && summary.ci.total > 0 ? "pass" : "warn",
      `${summary.ci.passed.length} passed, ${summary.ci.failed.length} failed, ${summary.ci.pending.length} pending`,
    ],
    [
      "Wallet timeline",
      summary.walletTimeline ? "pass" : "warn",
      summary.walletTimeline
        ? `${summary.walletTimeline.snapshots} public snapshots; latest ${summary.walletTimeline.latestSnapshotAt || "unknown"}`
        : "No wallet timeline evidence provided",
    ],
    [
      "Adapter canary",
      summary.adapterCanary ? (summary.adapterCanary.ready ? "pass" : "warn") : "warn",
      summary.adapterCanary
        ? summary.adapterCanary.detail
        : config.requireAdapterCanary ? "Adapter canary evidence required but missing" : "No adapter canary evidence provided",
    ],
    [
      "Read-only adapter canary",
      summary.readonlyAdapterCanary ? (summary.readonlyAdapterCanary.ready ? "pass" : "warn") : "warn",
      summary.readonlyAdapterCanary
        ? summary.readonlyAdapterCanary.detail
        : config.requireReadonlyAdapterCanary ? "Read-only adapter canary evidence required but missing" : "No read-only adapter canary evidence provided",
    ],
    [
      "Receipt check",
      summary.receiptCheck ? (summary.receiptCheck.ready ? "pass" : "warn") : "warn",
      summary.receiptCheck
        ? summary.receiptCheck.detail
        : config.requireReceiptCheck ? "Receipt check evidence required but missing" : "No post-signer receipt check evidence provided",
    ],
    [
      "Scheduled watch autopilot",
      summary.watchAutopilotScheduler ? (summary.watchAutopilotScheduler.ready ? "pass" : "warn") : "warn",
      summary.watchAutopilotScheduler
        ? summary.watchAutopilotScheduler.detail
        : config.requireWatchAutopilotScheduler ? "Scheduled watch autopilot evidence required but missing" : "No scheduled watch autopilot evidence provided",
    ],
  ];
  return [
    `# ${config.title}`,
    "",
    "## Decision",
    "",
    `- Result: ${summary.ready ? "READY_FOR_TEST_CUSTOMERS" : "NEEDS_MORE_EVIDENCE"}`,
    `- Generated at: ${summary.generatedAt}`,
    "- Safety posture: non-custodial, public wallet reads only, unsigned previews and external signer handoff only.",
    "- Redaction posture: this bundle rejects secret-shaped JSON fields and displays input basenames instead of full local paths.",
    "",
    "## Evidence Inputs",
    "",
    `- Bittensor live QA: ${basenameOrMissing(config.bittensorLiveQa)}`,
    `- Agent control live QA: ${basenameOrMissing(config.agentControlLiveQa)}`,
    `- CI evidence: ${basenameOrMissing(config.ci)}`,
    `- Customer readiness gate: ${basenameOrMissing(config.readinessGate)}`,
    `- Wallet timeline: ${basenameOrMissing(config.walletTimeline)}`,
    `- Adapter canary: ${basenameOrMissing(config.adapterCanary)}`,
    `- Read-only adapter canary: ${basenameOrMissing(config.readonlyAdapterCanary)}`,
    `- Receipt check: ${basenameOrMissing(config.receiptCheck)}`,
    `- Scheduled watch autopilot: ${basenameOrMissing(config.watchAutopilotScheduler)}`,
    "",
    "## Gate Summary",
    "",
    "| Area | Status | Detail |",
    "| --- | --- | --- |",
    ...rows.map(([area, status, detail]) => `| ${escapeCell(area)} | ${escapeCell(status)} | ${escapeCell(detail)} |`),
    "",
    "## Covered Bittensor Paths",
    "",
    bullet(summary.bittensor.passedStages),
    "",
    "## Open Bittensor Failures",
    "",
    bullet(summary.bittensor.failedStages),
    "",
    "## CI Checks Included",
    "",
    bullet(summary.ci.passed.map((name) => `${name}: passed`)),
    "",
    "## Before Customer Demo",
    "",
    "- Attach this bundle to the release notes or customer-readiness handoff.",
    "- Keep real SS58 wallet evidence public-only and redact customer-identifying notes.",
    "- Re-run the full readiness gate with `--require-wallet --require-ci` for any customer session involving wallet/stake preview.",
    "- Do not enable real subnet service adapters until the adapter canary has an allowlisted endpoint, timeout, hash confirmation, and rollback note.",
    "- After any external signer return, attach a receipt check and run a public wallet diff follow-up before calling the customer flow complete.",
    "- If monitoring ran while the operator was away, attach the scheduled watch autopilot summary and inspect any safe chat prompts before the demo.",
    "",
  ].join("\n");
}

if (flag("--help") || flag("-h")) {
  console.log(usage());
  process.exit(0);
}

const bittensor = await readJson(config.bittensorLiveQa, "Bittensor live QA");
const agentControl = await readJson(config.agentControlLiveQa, "Agent control live QA");
const ci = await readJson(config.ci, "CI");
const timeline = await readJson(config.walletTimeline, "Wallet timeline");
const adapterCanary = await readJson(config.adapterCanary, "Adapter canary");
const readonlyAdapterCanary = await readJson(config.readonlyAdapterCanary, "Read-only adapter canary");
const receiptCheck = await readJson(config.receiptCheck, "Receipt check");
const watchAutopilotScheduler = await readJson(config.watchAutopilotScheduler, "Scheduled watch autopilot");
const readinessGate = await readText(config.readinessGate);

const ciSummary = summarizeCi(ci);
const bittensorReady = isReady(bittensor) && summaryValue(bittensor, "fail") === 0;
const agentReady = !agentControl || (isReady(agentControl) && summaryValue(agentControl, "fail") === 0);
const gateReady = readinessGateReady(readinessGate);
const adapterSummary = adapterCanarySummary(adapterCanary);
const readonlyAdapterSummary = readonlyAdapterCanarySummary(readonlyAdapterCanary);
const receiptSummary = receiptCheckSummary(receiptCheck);
const watchAutopilotSchedulerSummaryValue = watchAutopilotSchedulerSummary(watchAutopilotScheduler);
const adapterReady = !config.requireAdapterCanary || adapterSummary?.ready === true;
const readonlyAdapterReady = !config.requireReadonlyAdapterCanary || readonlyAdapterSummary?.ready === true;
const receiptReady = !config.requireReceiptCheck || receiptSummary?.ready === true;
const watchAutopilotSchedulerReady = !config.requireWatchAutopilotScheduler || watchAutopilotSchedulerSummaryValue?.ready === true;
const ready = Boolean(
  bittensorReady &&
    agentReady &&
    gateReady &&
    adapterReady &&
    readonlyAdapterReady &&
    receiptReady &&
    watchAutopilotSchedulerReady &&
    ciSummary.failed.length === 0 &&
    ciSummary.pending.length === 0 &&
    ciSummary.total > 0,
);

const summary = {
  generatedAt: new Date().toISOString(),
  ready,
  bittensor: {
    ready: bittensorReady,
    detail: bittensor
      ? `${summaryValue(bittensor, "pass")} passed, ${summaryValue(bittensor, "fail")} failed, ${summaryValue(bittensor, "skip")} skipped`
      : "Missing Bittensor evidence",
    passedStages: passedStages(bittensor),
    failedStages: failedStages(bittensor),
  },
  agentControl: {
    ready: agentReady,
    detail: agentControl
      ? `${summaryValue(agentControl, "pass")} passed, ${summaryValue(agentControl, "fail")} failed`
      : "No agent-control evidence provided",
  },
  ci: ciSummary,
  readinessGate: {
    ready: gateReady,
    detail: readinessGate ? (gateReady ? "Readiness gate says ready" : "Readiness gate does not say ready") : "No readiness gate Markdown provided",
  },
  walletTimeline: walletTimelineSummary(timeline),
  adapterCanary: adapterSummary,
  readonlyAdapterCanary: readonlyAdapterSummary,
  receiptCheck: receiptSummary,
  watchAutopilotScheduler: watchAutopilotSchedulerSummaryValue,
};

const markdown = renderMarkdown(summary);
if (config.output) await writeFile(config.output, markdown, "utf8");
else console.log(markdown);
if (config.jsonOutput) await writeFile(config.jsonOutput, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
if (config.strict && !summary.ready) process.exit(1);
