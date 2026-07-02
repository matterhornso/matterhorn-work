#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|api[_-]?key|token|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;

function arg(name, fallback = "") {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find((item) => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function flag(name) { return args.includes(name); }

const config = {
  serverUrl: (arg("--server-url") || process.env.MATTERHORN_WORK_SERVER_URL || process.env.OPENWORK_SERVER_URL || "http://127.0.0.1:8787").replace(/\/+$/, ""),
  token: arg("--token") || process.env.MATTERHORN_WORK_TOKEN || process.env.OPENWORK_TOKEN || "",
  checkJson: arg("--check-json"),
  jsonlOutput: arg("--jsonl-output"),
  summaryOutput: arg("--summary-output"),
  iterations: Math.max(1, Math.min(1000, Number(arg("--iterations", "3")) || 3)),
  intervalMs: Math.max(0, Number(arg("--interval-ms", "60000")) || 0),
  maxAlerts: Math.max(1, Number(arg("--max-alerts", "10")) || 10),
  timeoutMs: Math.max(1_000, Number(arg("--timeout-ms", "15000")) || 15_000),
  strict: flag("--strict"),
  json: flag("--json"),
};

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-watch-autopilot-scheduler.mjs --server-url http://127.0.0.1:8787 --token <client-token> --iterations 12 --interval-ms 300000 --jsonl-output /tmp/watch.jsonl --summary-output /tmp/watch-summary.json --strict",
    "",
    "Options:",
    "  --server-url <url>       Matterhorn Work server URL.",
    "  --token <token>          Optional client bearer token.",
    "  --check-json <path>      Offline fixture used for every iteration.",
    "  --iterations <n>         Number of checks to run. Defaults to 3.",
    "  --interval-ms <ms>       Delay between checks. Defaults to 60000.",
    "  --jsonl-output <path>    Write one JSON summary per check.",
    "  --summary-output <path>  Write final aggregate JSON summary.",
    "  --max-alerts <n>         Maximum alerts retained per check.",
    "  --strict                 Exit nonzero if any check fails.",
    "  --json                   Print aggregate JSON summary.",
  ].join("\n");
}

function assertNoForbiddenKeys(value, label, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach((child, index) => assertNoForbiddenKeys(child, label, [...path, String(index)])); return; }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key)) throw new Error(`${label} contains forbidden credential or signing field: ${[...path, key].join(".")}`);
    assertNoForbiddenKeys(child, label, [...path, key]);
  }
}

function asArray(value) { return Array.isArray(value) ? value : []; }
function statusOf(evaluation = {}) { return String(evaluation.status || evaluation.state || evaluation.result || "unknown").toLowerCase(); }
function watchLabel(watch = {}) {
  return watch.label || [watch.kind || "watch", watch.netuid !== undefined ? `netuid ${watch.netuid}` : "", watch.validatorHotkey ? `validator ${watch.validatorHotkey}` : "", watch.ss58Address ? `wallet ${watch.ss58Address}` : ""].filter(Boolean).join(" ");
}
function fallbackPrompt(evaluation = {}) {
  const watch = evaluation.watch || {};
  if (watch.validatorHotkey) return `Bittensor Agent task: analyze validator ${watch.validatorHotkey}${watch.netuid !== undefined ? ` on subnet ${watch.netuid}` : ""}. Explain what changed, risks, and safe next steps without taking action.`;
  if (watch.ss58Address) return `Bittensor Agent task: review public Bittensor wallet ${watch.ss58Address}. Explain stake exposure, alerts, and safe next steps without asking for private wallet material.`;
  if (watch.netuid !== undefined) return `Bittensor Agent task: review subnet ${watch.netuid}. Explain this watch alert, likely causes, source freshness, and safe next steps.`;
  return "Bittensor Agent task: review this Bittensor watch alert and explain safe next steps without taking financial action.";
}
function normalizeAgentTaskPrompt(prompt = "") {
  const value = String(prompt || "").trim();
  if (!value) return "";
  if (/^Bittensor Agent task:/i.test(value)) return value;
  return `Bittensor Agent task: ${value}`;
}
function alertPrompt(evaluation = {}) { const action = asArray(evaluation.copilotActions)[0]; return normalizeAgentTaskPrompt(action?.prompt) || fallbackPrompt(evaluation); }
function buildNotificationSummary(alerts = []) {
  const intents = {};
  const promptSamples = [];
  for (const alert of alerts) {
    const intent = alert.notificationIntent || "unspecified";
    intents[intent] = (intents[intent] || 0) + 1;
    if (promptSamples.length < config.maxAlerts) {
      promptSamples.push({ intent, label: alert.label, prompt: alert.prompt });
    }
  }
  return { totalNotifications: alerts.length, intents, promptSamples, safety: "read_only_agent_tasks" };
}
function aggregateNotificationSummaries(runs = []) {
  const intents = {};
  const promptSamples = [];
  let totalNotifications = 0;
  for (const run of runs) {
    const summary = run.notificationSummary || {};
    totalNotifications += Number(summary.totalNotifications || 0);
    for (const [intent, count] of Object.entries(summary.intents || {})) intents[intent] = (intents[intent] || 0) + Number(count || 0);
    for (const sample of asArray(summary.promptSamples)) {
      if (promptSamples.length < config.maxAlerts) promptSamples.push(sample);
    }
  }
  return { totalNotifications, intents, promptSamples, safety: "read_only_agent_tasks" };
}

async function requestCheck() {
  if (config.checkJson) {
    const parsed = JSON.parse(await readFile(config.checkJson, "utf8"));
    assertNoForbiddenKeys(parsed, "watch check fixture");
    return parsed;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers = config.token ? { Authorization: `Bearer ${config.token}` } : {};
    const response = await fetch(`${config.serverUrl}/api/bittensor/monitoring/check`, { headers, signal: controller.signal });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    assertNoForbiddenKeys(body, "watch check response");
    if (!response.ok) throw new Error(body?.message || body?.error || text || `HTTP ${response.status}`);
    return body;
  } finally { clearTimeout(timer); }
}

function summarizeCheck(check, iteration) {
  const evaluations = asArray(check.evaluations);
  const alerts = evaluations.filter((evaluation) => /alert|fail|warning|warn/.test(statusOf(evaluation))).slice(0, config.maxAlerts);
  const statusCounts = evaluations.reduce((acc, evaluation) => { const status = statusOf(evaluation); acc[status] = (acc[status] || 0) + 1; return acc; }, {});
  const mappedAlerts = alerts.map((evaluation) => ({ alertKey: evaluation.alertKey || "", status: statusOf(evaluation), notificationIntent: evaluation.notificationIntent || "", label: watchLabel(evaluation.watch), prompt: alertPrompt(evaluation) }));
  return {
    ok: true,
    iteration,
    checkedAt: new Date().toISOString(),
    total: evaluations.length,
    alertCount: alerts.length,
    statusCounts,
    alerts: mappedAlerts,
    notificationSummary: buildNotificationSummary(mappedAlerts),
    safety: { custody: "none", signsOrBroadcasts: false, submitsTransactions: false, invokesSubnetServices: false, source: "matterhorn_bittensor_watch_autopilot_scheduler" },
  };
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
if (flag("--help") || flag("-h")) { console.log(usage()); process.exit(0); }

const runs = [];
for (let iteration = 1; iteration <= config.iterations; iteration += 1) {
  try { runs.push(summarizeCheck(await requestCheck(), iteration)); }
  catch (error) { runs.push({ ok: false, iteration, checkedAt: new Date().toISOString(), total: 0, alertCount: 0, statusCounts: {}, alerts: [], error: error instanceof Error ? error.message : "watch check failed", safety: { custody: "none", signsOrBroadcasts: false, submitsTransactions: false, invokesSubnetServices: false, source: "matterhorn_bittensor_watch_autopilot_scheduler" } }); }
  if (iteration < config.iterations && config.intervalMs > 0) await sleep(config.intervalMs);
}
const summary = {
  ok: runs.every((run) => run.ok), generatedAt: new Date().toISOString(), source: "matterhorn_bittensor_watch_autopilot_scheduler", iterations: runs.length,
  totalEvaluations: runs.reduce((sum, run) => sum + Number(run.total || 0), 0), totalAlerts: runs.reduce((sum, run) => sum + Number(run.alertCount || 0), 0), failedChecks: runs.filter((run) => !run.ok).length, latest: runs[runs.length - 1] || null,
  notificationSummary: aggregateNotificationSummaries(runs),
  safety: { custody: "none", acceptsCredentialMaterial: false, signsOrBroadcasts: false, submitsTransactions: false, invokesSubnetServices: false },
};
if (config.jsonlOutput) await writeFile(config.jsonlOutput, runs.map((run) => JSON.stringify(run)).join("\n") + "\n", "utf8");
if (config.summaryOutput) await writeFile(config.summaryOutput, JSON.stringify(summary, null, 2) + "\n", "utf8");
if (config.json || !config.summaryOutput) console.log(JSON.stringify(summary, null, 2));
if (config.strict && !summary.ok) process.exit(1);
