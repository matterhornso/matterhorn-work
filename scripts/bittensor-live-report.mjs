#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);

const arg = (name, fallback = undefined) => {
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  const inline = args.find((item) => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};

const flag = (name) => args.includes(name);

const config = {
  input: arg("--input") || arg("-i") || "",
  output: arg("--output") || arg("-o") || "",
  title: arg("--title") || "Matterhorn Desks Bittensor Live Readiness Report",
  strict: flag("--strict"),
};

const FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export)/i;

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-live-report.mjs --input bittensor-live-qa.json --output docs/bittensor-live-readiness-report.md",
    "  node scripts/bittensor-live-qa.mjs --json ... | node scripts/bittensor-live-report.mjs --output report.md",
    "",
    "Options:",
    "  --input, -i <path>    Read Bittensor live QA JSON from a file. Defaults to stdin.",
    "  --output, -o <path>   Write Markdown report to a file. Defaults to stdout.",
    "  --title <text>        Report title.",
    "  --strict              Exit nonzero if the report is not ready.",
  ].join("\n");
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => resolve(raw));
    process.stdin.on("error", reject);
  });
}

async function readInput() {
  if (flag("--help") || flag("-h")) {
    console.log(usage());
    process.exit(0);
  }
  if (config.input) return readFile(config.input, "utf8");
  return readStdin();
}

function parseReport(raw) {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("No Bittensor live QA JSON was provided.");
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw error;
  }
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function summaryValue(report, key) {
  const value = report?.summary?.[key];
  return Number.isFinite(value) ? value : 0;
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function stageDetail(stage) {
  const parts = [];
  if (stage.error) parts.push(`error: ${stage.error}`);
  if (stage.hint) parts.push(`hint: ${stage.hint}`);
  if (stage.execution) parts.push(`execution: ${stage.execution}`);
  if (stage.cards) parts.push(`cards: ${formatValue(stage.cards)}`);
  if (stage.readinessStatus) parts.push(`readiness: ${stage.readinessStatus}`);
  if (stage.capabilityCount !== undefined) parts.push(`capabilities: ${stage.capabilityCount}`);
  if (stage.capabilityLevel) parts.push(`capability: ${stage.capabilityLevel}`);
  if (stage.serviceAdapter) parts.push(`adapter: ${stage.serviceAdapter}`);
  if (stage.contextId) parts.push(`context: ${stage.contextId}`);
  if (stage.requiresExternalSignature !== undefined) parts.push(`external signature: ${stage.requiresExternalSignature}`);
  if (stage.payloadSha256) parts.push(`payload sha256: ${stage.payloadSha256}`);
  if (stage.requiresConfirmation !== undefined) parts.push(`requires confirmation: ${stage.requiresConfirmation}`);
  if (stage.requestSha256) parts.push(`request sha256: ${stage.requestSha256}`);
  if (stage.adapterSupported !== undefined && stage.adapterSupported !== null) parts.push(`adapter supported: ${stage.adapterSupported}`);
  if (stage.watchId) parts.push(`watch: ${stage.watchId}`);
  if (stage.watchCount !== undefined) parts.push(`watches: ${stage.watchCount}`);
  if (stage.evaluationCount !== undefined) parts.push(`evaluations: ${stage.evaluationCount}`);
  if (stage.alertCount !== undefined) parts.push(`alerts: ${stage.alertCount}`);
  if (stage.alertKey) parts.push(`alert key: ${stage.alertKey}`);
  if (stage.notificationIntent) parts.push(`notification: ${stage.notificationIntent}`);
  if (stage.clarificationQuestion) parts.push(`question: ${stage.clarificationQuestion}`);
  return parts.join("; ") || "-";
}

function statusEmoji(status) {
  if (status === "pass") return "pass";
  if (status === "warn") return "warn";
  if (status === "fail") return "fail";
  if (status === "skip") return "skip";
  return status || "unknown";
}

function sectionForStatus(report, status, title) {
  const stages = asArray(report.stages).filter((stage) => stage.status === status);
  if (!stages.length) return `## ${title}\n\nNone.\n`;
  const rows = stages.map((stage) => `| ${escapeCell(stage.id)} | ${escapeCell(stage.label)} | ${escapeCell(stageDetail(stage))} |`).join("\n");
  return [
    `## ${title}`,
    "",
    "| Stage | Check | Detail |",
    "| --- | --- | --- |",
    rows,
    "",
  ].join("\n");
}

function nextActions(report) {
  const actions = [];
  for (const stage of asArray(report.stages)) {
    if (stage.status === "fail" && stage.error) actions.push(`Fix ${stage.id}: ${stage.error}`);
    if ((stage.status === "warn" || stage.status === "skip") && stage.hint) actions.push(stage.hint);
  }
  for (const item of asArray(report.nextSteps)) {
    if (typeof item === "string" && item.trim()) actions.push(item.trim());
  }
  return [...new Set(actions)];
}

function renderArtifacts(report) {
  const artifacts = report.artifacts && typeof report.artifacts === "object" ? report.artifacts : {};
  const entries = Object.entries(artifacts);
  if (!entries.length) return "## Artifacts\n\nNone.\n";
  const rows = entries
    .map(([key, value]) => `| ${escapeCell(key)} | ${escapeCell(formatValue(value))} |`)
    .join("\n");
  return [
    "## Artifacts",
    "",
    "| Key | Value |",
    "| --- | --- |",
    rows,
    "",
  ].join("\n");
}

function renderReport(report) {
  assertNoForbiddenKeys(report, "Bittensor live readiness report");
  const ready = report.ready === true || report.ok === true;
  const checkedAt = report.checkedAt || new Date().toISOString();
  const serverUrl = report.serverUrl || "-";
  const stages = asArray(report.stages);
  const statusRows = stages
    .map((stage) => `| ${escapeCell(statusEmoji(stage.status))} | ${escapeCell(stage.id)} | ${escapeCell(stage.label)} | ${escapeCell(stageDetail(stage))} |`)
    .join("\n");
  const actions = nextActions(report);

  return [
    `# ${config.title}`,
    "",
    "## Summary",
    "",
    `- Result: ${ready ? "ready" : "not ready"}`,
    `- Checked at: ${checkedAt}`,
    `- Server URL: ${serverUrl}`,
    `- Pass: ${summaryValue(report, "pass")}`,
    `- Warn: ${summaryValue(report, "warn")}`,
    `- Fail: ${summaryValue(report, "fail")}`,
    `- Skip: ${summaryValue(report, "skip")}`,
    `- Requests: ${formatValue(report.requestCount)}`,
    "",
    "## Stage Table",
    "",
    stages.length ? "| Status | Stage | Check | Detail |\n| --- | --- | --- | --- |\n" + statusRows : "No stages were reported.",
    "",
    sectionForStatus(report, "fail", "Failures"),
    sectionForStatus(report, "warn", "Warnings"),
    sectionForStatus(report, "skip", "Skipped Coverage"),
    renderArtifacts(report),
    "## Recommended Next Actions",
    "",
    actions.length ? actions.map((action) => `- ${action}`).join("\n") : "- No follow-up actions reported by the harness.",
    "",
    "## Safety Notes",
    "",
    "- This report is generated from public/read-only Bittensor QA output.",
    "- Do not attach seed phrases, mnemonics, private keys, keyfiles, SURI strings, or wallet exports to live-readiness reports.",
    "- Staking checks should remain unsigned previews requiring an external signature.",
    "",
  ].join("\n");
}

const raw = await readInput();
const report = parseReport(raw);
const markdown = renderReport(report);

if (config.output) {
  await writeFile(config.output, markdown, "utf8");
} else {
  process.stdout.write(markdown);
}

const ready = report.ready === true || report.ok === true;
if (config.strict && !ready) {
  process.exitCode = 1;
}
