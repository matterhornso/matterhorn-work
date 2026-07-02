#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|api[_-]?key|token|signature|signedPayload|signed_payload)/i;

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
  serverUrl: (arg("--server-url") || process.env.MATTERHORN_WORK_SERVER_URL || process.env.OPENWORK_SERVER_URL || "http://127.0.0.1:8787").replace(/\/+$/, ""),
  token: arg("--token") || process.env.MATTERHORN_WORK_TOKEN || process.env.OPENWORK_TOKEN || "",
  checkJson: arg("--check-json"),
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  maxAlerts: Math.max(1, Number(arg("--max-alerts", "10")) || 10),
  timeoutMs: Math.max(1_000, Number(arg("--timeout-ms", "15000")) || 15_000),
  strict: flag("--strict"),
  json: flag("--json"),
};

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-watch-autopilot.mjs --server-url http://127.0.0.1:8787 --token <client-token> --output /tmp/bittensor-watch-autopilot.md --strict",
    "",
    "Options:",
    "  --server-url <url>        Matterhorn Work server URL. Defaults to MATTERHORN_WORK_SERVER_URL or localhost.",
    "  --token <token>           Optional client bearer token.",
    "  --check-json <path>       Offline test/input fixture for a monitoring check response.",
    "  --output, -o <path>       Write Markdown report to a file. Defaults to stdout unless --json is set.",
    "  --json-output <path>      Write machine-readable JSON summary.",
    "  --max-alerts <n>          Maximum alert prompts to include. Defaults to 10.",
    "  --timeout-ms <ms>         Request timeout. Defaults to 15000.",
    "  --strict                  Exit nonzero if the watch check cannot run.",
    "  --json                    Print JSON summary instead of Markdown.",
  ].join("\n");
}

function assertNoForbiddenKeys(value, label, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenKeys(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(`${label} contains forbidden credential or signing field: ${[...path, key].join(".")}`);
    }
    assertNoForbiddenKeys(child, label, [...path, key]);
  }
}

async function request(pathname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers = config.token ? { Authorization: `Bearer ${config.token}` } : {};
    const response = await fetch(`${config.serverUrl}${pathname}`, { headers, signal: controller.signal });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = body?.message || body?.error || text || `HTTP ${response.status}`;
      throw new Error(`${pathname} failed: ${message}`);
    }
    assertNoForbiddenKeys(body, `response ${pathname}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function watchLabel(watch = {}) {
  return watch.label || [
    watch.kind || "watch",
    watch.netuid !== undefined ? `netuid ${watch.netuid}` : "",
    watch.validatorHotkey ? `validator ${watch.validatorHotkey}` : "",
    watch.ss58Address ? `wallet ${watch.ss58Address}` : "",
  ].filter(Boolean).join(" ");
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

function alertPrompt(evaluation = {}) {
  const action = asArray(evaluation.copilotActions)[0];
  return normalizeAgentTaskPrompt(action?.prompt) || fallbackPrompt(evaluation);
}

function statusOf(evaluation = {}) {
  return String(evaluation.status || evaluation.state || evaluation.result || "unknown").toLowerCase();
}

function buildNotificationSummary(alerts = []) {
  const intents = {};
  const prompts = [];
  for (const alert of alerts) {
    const intent = alert.notificationIntent || "unspecified";
    intents[intent] = (intents[intent] || 0) + 1;
    if (prompts.length < config.maxAlerts) {
      prompts.push({
        intent,
        label: alert.label,
        prompt: alert.prompt,
      });
    }
  }
  return {
    totalNotifications: alerts.length,
    intents,
    promptSamples: prompts,
    safety: "read_only_agent_tasks",
  };
}

function summarize(check) {
  const evaluations = asArray(check.evaluations);
  const alerts = evaluations.filter((evaluation) => /alert|fail|warning|warn/.test(statusOf(evaluation))).slice(0, config.maxAlerts);
  const statusCounts = evaluations.reduce((acc, evaluation) => {
    const status = statusOf(evaluation);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const mappedAlerts = alerts.map((evaluation) => ({
    alertKey: evaluation.alertKey || "",
    status: statusOf(evaluation),
    notificationIntent: evaluation.notificationIntent || "",
    label: watchLabel(evaluation.watch),
    watch: evaluation.watch || {},
    prompt: alertPrompt(evaluation),
    consequence: "This is a read-only operator prompt. Matterhorn does not sign, submit, broadcast, stake, unstake, transfer, or invoke subnet services from this report.",
  }));
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: "matterhorn_bittensor_watch_autopilot",
    total: evaluations.length,
    alertCount: alerts.length,
    statusCounts,
    alerts: mappedAlerts,
    notificationSummary: buildNotificationSummary(mappedAlerts),
    safety: {
      custody: "none",
      acceptsCredentialMaterial: false,
      signsOrBroadcasts: false,
      submitsTransactions: false,
      invokesSubnetServices: false,
    },
  };
}

function escapeCell(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function renderMarkdown(summary) {
  const alertRows = summary.alerts.length
    ? summary.alerts.map((alert) => `| ${escapeCell(alert.status)} | ${escapeCell(alert.label)} | ${escapeCell(alert.notificationIntent || "-")} | ${escapeCell(alert.prompt)} |`).join("\n")
    : "| ok | No active alerts | - | No operator prompt needed. |";
  const notificationRows = Object.entries(summary.notificationSummary?.intents || {}).length
    ? Object.entries(summary.notificationSummary.intents).map(([intent, count]) => `| ${escapeCell(intent)} | ${escapeCell(count)} |`).join("\n")
    : "| none | 0 |";
  return [
    "# Matterhorn Work Bittensor Watch Autopilot",
    "",
    "## Decision",
    "",
    "- Result: READ_ONLY_ALERT_REPORT",
    `- Generated at: ${summary.generatedAt}`,
    "- Safety posture: this report creates Bittensor Agent tasks only. It never signs, submits, broadcasts, moves stake, transfers TAO, or invokes subnet services.",
    "",
    "## Summary",
    "",
    `- Evaluations: ${summary.total}`,
    `- Alerts: ${summary.alertCount}`,
    `- Status counts: ${Object.entries(summary.statusCounts).map(([key, value]) => `${key}=${value}`).join(", ") || "none"}`,
    "",
    "## Notification Summary",
    "",
    "- Notification intents are local/operator review hints only. They do not sign, submit, broadcast, or trigger wallet actions.",
    `- Task samples: ${summary.notificationSummary?.promptSamples?.length ?? 0}`,
    "",
    "| Intent | Count |",
    "| --- | ---: |",
    notificationRows,
    "",
    "## Alert Tasks",
    "",
    "| Status | Watch | Intent | Task |",
    "| --- | --- | --- | --- |",
    alertRows,
    "",
  ].join("\n");
}

if (flag("--help") || flag("-h")) {
  console.log(usage());
  process.exit(0);
}

let summary;
try {
  const check = config.checkJson
    ? JSON.parse(await readFile(config.checkJson, "utf8"))
    : await request("/api/bittensor/monitoring/check");
  assertNoForbiddenKeys(check, config.checkJson ? "check fixture" : "watch check");
  summary = summarize(check);
} catch (error) {
  summary = {
    ok: false,
    generatedAt: new Date().toISOString(),
    source: "matterhorn_bittensor_watch_autopilot",
    total: 0,
    alertCount: 0,
    statusCounts: {},
    alerts: [],
    error: error instanceof Error ? error.message : "Bittensor watch autopilot failed.",
    safety: {
      custody: "none",
      acceptsCredentialMaterial: false,
      signsOrBroadcasts: false,
      submitsTransactions: false,
      invokesSubnetServices: false,
    },
  };
}

const markdown = summary.ok ? renderMarkdown(summary) : `# Matterhorn Work Bittensor Watch Autopilot\n\n- Result: WATCH_CHECK_FAILED\n- Error: ${summary.error}\n- Safety posture: no action was taken.\n`;
if (config.output) await writeFile(config.output, markdown, "utf8");
if (config.jsonOutput) await writeFile(config.jsonOutput, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
if (config.json) console.log(JSON.stringify(summary, null, 2));
else if (!config.output) console.log(markdown);
if (config.strict && !summary.ok) process.exit(1);
