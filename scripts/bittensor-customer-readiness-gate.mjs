#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const args = process.argv.slice(2);

const FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export)/i;
const REQUIRED_DOCS = [
  "docs/hermes-bittensor-usability-security-qa.md",
  "docs/bittensor-live-qa.md",
  "docs/bittensor-operator-playbook.md",
  "docs/agent-control-coverage-matrix.md",
];
const REQUIRED_CI_CHECKS = [
  /matterhorn desks tests/i,
  /i18n audit/i,
  /alpha channel/i,
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
  bittensorLiveQa: arg("--bittensor-live-qa"),
  agentControlLiveQa: arg("--agent-control-live-qa"),
  ci: arg("--ci"),
  watchAutopilotScheduler: arg("--watch-autopilot-scheduler"),
  output: arg("--output") || arg("-o"),
  strict: flag("--strict"),
  requireCi: flag("--require-ci"),
  requireWallet: flag("--require-wallet"),
  requireWatchAutopilotScheduler: flag("--require-watch-autopilot-scheduler"),
  skipDocCheck: flag("--skip-doc-check"),
  title: arg("--title") || "Matterhorn Desks Bittensor Customer Readiness Gate",
};

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-customer-readiness-gate.mjs --bittensor-live-qa /tmp/bittensor.json --agent-control-live-qa /tmp/agent.json --ci /tmp/ci.json --output report.md --strict",
    "",
    "Options:",
    "  --bittensor-live-qa <path>    JSON output from scripts/bittensor-live-qa.mjs.",
    "  --agent-control-live-qa <path> JSON output from scripts/agent-control-live-qa.mjs.",
    "  --ci <path>                   JSON with GitHub check/workflow conclusions.",
    "  --watch-autopilot-scheduler <path> JSON summary from scripts/bittensor-watch-autopilot-scheduler.mjs.",
    "  --output, -o <path>           Write Markdown report to a file. Defaults to stdout.",
    "  --strict                      Exit nonzero when the readiness gate is not ready.",
    "  --require-ci                  Treat missing CI evidence as a failure.",
    "  --require-wallet              Treat skipped wallet/stake preview coverage as a failure.",
    "  --require-watch-autopilot-scheduler Treat missing or empty scheduled watch evidence as a failure.",
    "  --skip-doc-check              Skip local required-doc existence checks, useful for isolated tests.",
    "  --title <text>                Report title.",
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
    if (FORBIDDEN_KEY_RE.test(key)) {
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

function summaryValue(report, key) {
  const value = report?.summary?.[key];
  return Number.isFinite(value) ? value : 0;
}

function hasStage(report, matcher) {
  return asArray(report?.stages).some((stage) => matcher(stage));
}

function addFinding(findings, status, area, detail, severity = "") {
  findings.push({ status, area, detail, severity });
}

function evaluateDocs(findings) {
  for (const docPath of REQUIRED_DOCS) {
    if (!existsSync(docPath)) {
      addFinding(findings, "fail", "Docs", `Missing required QA doc: ${docPath}`, "P1");
      continue;
    }
    addFinding(findings, "pass", "Docs", `Found ${docPath}`);
  }
}

function evaluateBittensor(report, findings) {
  if (!report) {
    addFinding(findings, "fail", "Bittensor live QA", "Missing Bittensor live QA JSON evidence.", "P1");
    return;
  }
  if (report.ready !== true && report.ok !== true) {
    addFinding(findings, "fail", "Bittensor live QA", "Bittensor live QA did not report ready.", "P1");
  } else {
    addFinding(findings, "pass", "Bittensor live QA", "Bittensor live QA reported ready.");
  }
  if (summaryValue(report, "fail") > 0) {
    addFinding(findings, "fail", "Bittensor live QA", `${summaryValue(report, "fail")} Bittensor stages failed.`, "P1");
  }
  const skipped = summaryValue(report, "skip");
  if (skipped > 0) {
    addFinding(findings, config.requireWallet ? "fail" : "warn", "Bittensor live QA", `${skipped} Bittensor stages were skipped.`, config.requireWallet ? "P1" : "P3");
  }
  const requiredStages = [
    ["readiness", (stage) => /readiness/.test(stage.id || "")],
    ["wallet clarification or snapshot", (stage) => /wallet|show.*tao|missing.*address/i.test(`${stage.id} ${stage.label}`)],
    ["wallet change baseline", (stage) => /wallet.*change|change_baseline|what changed/i.test(`${stage.id} ${stage.label}`)],
    ["validator comparison", (stage) => /validator/.test(stage.id || "")],
    ["staking clarification or preview", (stage) => /stake|extrinsic|handoff/.test(stage.id || "")],
    ["subnet adapter preview", (stage) => /subnet.*preview|invocation_preview|unsupported_adapter/.test(stage.id || "")],
    ["monitoring watch", (stage) => /watch|monitoring/.test(stage.id || "")],
  ];
  for (const [label, matcher] of requiredStages) {
    addFinding(
      findings,
      hasStage(report, matcher) ? "pass" : "fail",
      "Bittensor live QA",
      hasStage(report, matcher) ? `Covered ${label}.` : `Missing ${label} coverage.`,
      hasStage(report, matcher) ? "" : "P2",
    );
  }
}

function evaluateAgentControl(report, findings) {
  if (!report) {
    addFinding(findings, "warn", "Agent control live QA", "Missing agent-control live QA JSON evidence.", "P2");
    return;
  }
  if (report.ready === true || report.ok === true) {
    addFinding(findings, "pass", "Agent control live QA", "Agent control live QA reported ready.");
  } else {
    addFinding(findings, "fail", "Agent control live QA", "Agent control live QA did not report ready.", "P1");
  }
  if (summaryValue(report, "fail") > 0) {
    addFinding(findings, "fail", "Agent control live QA", `${summaryValue(report, "fail")} agent-control stages failed.`, "P1");
  }
}


function evaluateWatchAutopilotScheduler(report, findings) {
  if (!report) {
    addFinding(
      findings,
      config.requireWatchAutopilotScheduler ? "fail" : "warn",
      "Scheduled watch autopilot",
      "Missing scheduled watch autopilot summary evidence.",
      config.requireWatchAutopilotScheduler ? "P1" : "P3",
    );
    return;
  }

  if (report.ok !== true) {
    addFinding(findings, "fail", "Scheduled watch autopilot", "Scheduled watch autopilot did not report ready.", "P1");
  } else {
    addFinding(findings, "pass", "Scheduled watch autopilot", "Scheduled watch autopilot reported ready.");
  }

  const iterations = Number(report.iterations || 0);
  const totalEvaluations = Number(report.totalEvaluations || 0);
  const totalAlerts = Number(report.totalAlerts || 0);
  const failedChecks = Number(report.failedChecks || 0);
  const safety = report.safety || {};
  const notificationSummary = report.notificationSummary || {};
  const totalNotifications = Number(notificationSummary.totalNotifications || 0);
  const notificationIntents = notificationSummary.intents && typeof notificationSummary.intents === "object"
    ? Object.keys(notificationSummary.intents)
    : [];

  if (iterations > 0) {
    addFinding(findings, "pass", "Scheduled watch autopilot", `Completed ${iterations} scheduled watch checks.`);
  } else {
    addFinding(findings, "fail", "Scheduled watch autopilot", "Scheduled watch evidence has no completed iterations.", "P2");
  }

  if (failedChecks > 0) {
    addFinding(findings, "fail", "Scheduled watch autopilot", `${failedChecks} scheduled watch checks failed.`, "P1");
  }

  if (totalEvaluations > 0) {
    addFinding(findings, "pass", "Scheduled watch autopilot", `Reviewed ${totalEvaluations} watch evaluations with ${totalAlerts} alerts.`);
  } else {
    addFinding(
      findings,
      config.requireWatchAutopilotScheduler ? "fail" : "warn",
      "Scheduled watch autopilot",
      "Scheduled watch evidence contains no watch evaluations.",
      config.requireWatchAutopilotScheduler ? "P2" : "P3",
    );
  }

  if (totalAlerts > 0 && totalNotifications >= totalAlerts && notificationIntents.length > 0) {
    addFinding(findings, "pass", "Scheduled watch autopilot", `Prepared ${totalNotifications} read-only Bittensor Agent task(s) across ${notificationIntents.length} intent(s).`);
  } else if (totalAlerts > 0) {
    addFinding(findings, "warn", "Scheduled watch autopilot", "Scheduled watch alerts did not include notification intent summary evidence.", "P3");
  }

  if (safety.signsOrBroadcasts || safety.submitsTransactions || safety.invokesSubnetServices || safety.acceptsCredentialMaterial) {
    addFinding(findings, "fail", "Scheduled watch autopilot", "Scheduled watch evidence is not read-only safe.", "P0");
  } else {
    addFinding(findings, "pass", "Scheduled watch autopilot", "Scheduled watch evidence is read-only and non-custodial.");
  }
}

function checkName(item) {
  return String(item.name || item.workflowName || item.context || item.check || item.title || "");
}

function checkConclusion(item) {
  return String(item.conclusion || item.status || item.state || "").toLowerCase();
}

function flattenCi(ci) {
  return [
    ...asArray(ci?.checks),
    ...asArray(ci?.statuses),
    ...asArray(ci?.workflow_runs),
    ...asArray(ci?.runs),
    ...asArray(ci?.jobs),
  ];
}

function evaluateCi(ci, findings) {
  if (!ci) {
    addFinding(findings, config.requireCi ? "fail" : "warn", "CI", "Missing GitHub CI evidence.", config.requireCi ? "P1" : "P3");
    return;
  }
  const items = flattenCi(ci);
  for (const required of REQUIRED_CI_CHECKS) {
    const item = items.find((candidate) => required.test(checkName(candidate)));
    if (!item) {
      addFinding(findings, "fail", "CI", `Missing required check evidence: ${required}.`, "P1");
      continue;
    }
    const conclusion = checkConclusion(item);
    if (conclusion === "success" || conclusion === "completed" || conclusion === "pass" || conclusion === "passed") {
      addFinding(findings, "pass", "CI", `${checkName(item)} passed.`);
    } else {
      addFinding(findings, "fail", "CI", `${checkName(item)} was ${conclusion || "unknown"}.`, "P1");
    }
  }
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function count(findings, status) {
  return findings.filter((finding) => finding.status === status).length;
}

function renderReport({ findings, ready, inputs }) {
  const rows = findings
    .map((finding) => `| ${escapeCell(finding.status)} | ${escapeCell(finding.area)} | ${escapeCell(finding.detail)} | ${escapeCell(finding.severity || "-")} |`)
    .join("\n");
  const blockers = findings.filter((finding) => finding.status === "fail");
  return [
    `# ${config.title}`,
    "",
    "## Summary",
    "",
    `- Result: ${ready ? "READY_FOR_TEST_CUSTOMERS" : "NOT_READY"}`,
    `- Checked at: ${new Date().toISOString()}`,
    `- Pass: ${count(findings, "pass")}`,
    `- Warn: ${count(findings, "warn")}`,
    `- Fail: ${count(findings, "fail")}`,
    "",
    "## Evidence Inputs",
    "",
    `- Bittensor live QA: ${inputs.bittensorLiveQa || "missing"}`,
    `- Agent control live QA: ${inputs.agentControlLiveQa || "missing"}`,
    `- CI: ${inputs.ci || "missing"}`,
    `- Scheduled watch autopilot: ${inputs.watchAutopilotScheduler || "missing"}`,
    "",
    "## Gate Results",
    "",
    "| Status | Area | Detail | Severity |",
    "| --- | --- | --- | --- |",
    rows,
    "",
    "## Decision",
    "",
    ready
      ? "Matterhorn Desks passes this evidence-backed Bittensor customer-readiness gate."
      : "Do not share with test customers until the failing gate items are resolved and rerun.",
    "",
    "## Blockers",
    "",
    blockers.length
      ? blockers.map((finding) => `- [${finding.severity || "P?"}] ${finding.area}: ${finding.detail}`).join("\n")
      : "None.",
    "",
  ].join("\n");
}

if (flag("--help") || flag("-h")) {
  console.log(usage());
  process.exit(0);
}

const inputs = {
  bittensorLiveQa: config.bittensorLiveQa ? basename(config.bittensorLiveQa) : "",
  agentControlLiveQa: config.agentControlLiveQa ? basename(config.agentControlLiveQa) : "",
  ci: config.ci ? basename(config.ci) : "",
  watchAutopilotScheduler: config.watchAutopilotScheduler ? basename(config.watchAutopilotScheduler) : "",
};
const findings = [];

const bittensorReport = await readJson(config.bittensorLiveQa, "Bittensor live QA");
const agentControlReport = await readJson(config.agentControlLiveQa, "Agent control live QA");
const ciReport = await readJson(config.ci, "CI");
const watchAutopilotSchedulerReport = await readJson(config.watchAutopilotScheduler, "Scheduled watch autopilot");

if (config.skipDocCheck) addFinding(findings, "warn", "Docs", "Skipped required-doc existence checks.", "P3");
else evaluateDocs(findings);
evaluateBittensor(bittensorReport, findings);
evaluateAgentControl(agentControlReport, findings);
evaluateCi(ciReport, findings);
evaluateWatchAutopilotScheduler(watchAutopilotSchedulerReport, findings);

const ready = count(findings, "fail") === 0;
const markdown = renderReport({ findings, ready, inputs });

if (config.output) await writeFile(config.output, markdown, "utf8");
else console.log(markdown);

if (config.strict && !ready) process.exit(1);
