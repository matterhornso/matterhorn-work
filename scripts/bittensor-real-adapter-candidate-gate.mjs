#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const FIRST_CANARY_KINDS = new Set(["data_search", "inference"]);
const FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|authorization|api[_-]?key|token|signature|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;

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
  candidateJson: arg("--candidate-json"),
  candidateInlineJson: arg("--candidate-inline-json"),
  preferredKind: arg("--preferred-kind"),
  preferredIntent: arg("--preferred-intent", "service_call"),
  allowedHosts: (arg("--allowed-hosts") || process.env.BITTENSOR_ADAPTER_CANARY_ALLOWED_HOSTS || "").split(",").map((item) => item.trim()).filter(Boolean),
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  strict: flag("--strict"),
};

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-real-adapter-candidate-gate.mjs --candidate-json candidate.json --allowed-hosts adapter.example.com --preferred-kind data_search --preferred-intent data_search --strict",
    "",
    "Options:",
    "  --candidate-json <path>        Proposed read-only adapter candidate JSON.",
    "  --candidate-inline-json <json> Inline candidate JSON.",
    "  --allowed-hosts <csv>          Required HTTPS endpoint host allowlist.",
    "  --preferred-kind <kind>        Optional expected kind, usually data_search or inference.",
    "  --preferred-intent <intent>    Optional expected supported intent. Defaults to service_call.",
    "  --output, -o <path>            Write Markdown report.",
    "  --json-output <path>           Write machine-readable JSON summary.",
    "  --strict                       Exit nonzero when the candidate is not ready.",
  ].join("\n");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asBool(value) {
  return value === true || value === "true";
}

function addFinding(findings, status, area, detail, severity = "") {
  findings.push({ status, area, detail, severity });
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

async function readCandidate() {
  if (config.candidateInlineJson) return JSON.parse(config.candidateInlineJson);
  if (!config.candidateJson) throw new Error("Missing --candidate-json or --candidate-inline-json.");
  return JSON.parse(await readFile(config.candidateJson, "utf8"));
}

function endpointHost(endpoint, findings) {
  if (!endpoint) {
    addFinding(findings, "fail", "Endpoint", "Candidate endpoint is missing.", "P1");
    return "";
  }
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    addFinding(findings, "fail", "Endpoint", "Candidate endpoint is not a valid URL.", "P1");
    return "";
  }
  if (parsed.protocol !== "https:") {
    addFinding(findings, "fail", "Endpoint", `Real read-only candidate must use https:, received ${parsed.protocol}`, "P1");
  } else if (!config.allowedHosts.length) {
    addFinding(findings, "fail", "Endpoint allowlist", "--allowed-hosts is required for real adapter candidates.", "P1");
  } else if (!config.allowedHosts.includes(parsed.hostname)) {
    addFinding(findings, "fail", "Endpoint allowlist", `${parsed.hostname} is not in --allowed-hosts.`, "P1");
  } else {
    addFinding(findings, "pass", "Endpoint", `Endpoint host ${parsed.hostname} is allowlisted.`);
  }
  return parsed.hostname;
}

function candidateId(candidate) {
  return String(candidate.id || candidate.providerId || candidate.name || "").trim();
}

function adapterKind(candidate) {
  return String(candidate.adapterKind || candidate.serviceAdapter || candidate.kind || "").trim();
}

function supportedIntents(candidate) {
  return asArray(candidate.supportedIntents || candidate.intents).map((item) => String(item));
}

function privacy(candidate) {
  return asObject(candidate.privacy || candidate.privacyDeclaration || candidate.privacyPromises);
}

function rateLimit(candidate) {
  return asObject(candidate.rateLimit || candidate.rateLimits);
}

function rollback(candidate) {
  return asObject(candidate.rollback || candidate.rollbackPlan);
}

function summarize(candidate) {
  assertNoForbiddenKeys(candidate, "Bittensor real adapter candidate");
  const findings = [];
  const kind = adapterKind(candidate);
  const intents = supportedIntents(candidate);
  const privacyRules = privacy(candidate);
  const limits = rateLimit(candidate);
  const rollbackPlan = rollback(candidate);
  const endpoint = String(candidate.endpoint || candidate.serviceEndpoint || "");
  const host = endpointHost(endpoint, findings);
  const netuid = Number(candidate.netuid);
  const timeoutMs = Number(candidate.timeoutMs || candidate.timeout || 0);
  const task = String(candidate.canaryTask || candidate.task || "").trim();

  if (candidateId(candidate)) addFinding(findings, "pass", "Provider identity", `Candidate ${candidateId(candidate)} is identified.`);
  else addFinding(findings, "fail", "Provider identity", "Candidate id/providerId/name is missing.", "P1");

  if (Number.isInteger(netuid) && netuid >= 0) addFinding(findings, "pass", "Netuid", `Candidate targets netuid ${netuid}.`);
  else addFinding(findings, "fail", "Netuid", "Candidate netuid must be a non-negative integer.", "P1");

  if (FIRST_CANARY_KINDS.has(kind)) addFinding(findings, "pass", "Adapter kind", `Candidate kind ${kind} is allowed for the first real read-only canary lane.`);
  else addFinding(findings, "fail", "Adapter kind", `First real read-only canary must be data_search or inference, received ${kind || "missing"}.`, "P1");

  if (config.preferredKind && kind !== config.preferredKind) {
    addFinding(findings, "fail", "Adapter kind", `Expected ${config.preferredKind}, received ${kind || "missing"}.`, "P1");
  }

  if (intents.includes("service_call")) addFinding(findings, "pass", "Intent", "Candidate supports service_call.");
  else addFinding(findings, "fail", "Intent", "Candidate must support service_call for preview-confirm-invoke.", "P1");

  if (!config.preferredIntent || intents.includes(config.preferredIntent)) addFinding(findings, "pass", "Intent", `Candidate supports ${config.preferredIntent}.`);
  else addFinding(findings, "fail", "Intent", `Candidate does not support preferred intent ${config.preferredIntent}.`, "P1");

  if (asBool(privacyRules.sendsWalletData) || asBool(privacyRules.sendsKeyMaterial)) {
    addFinding(findings, "fail", "Privacy", "Candidate may send wallet data or key material.", "P0");
  } else {
    addFinding(findings, "pass", "Privacy", "Candidate declares no wallet-data or key-material sharing.");
  }

  if (timeoutMs >= 1000 && timeoutMs <= 20000) addFinding(findings, "pass", "Timeout", `Timeout ${timeoutMs}ms is bounded for a canary.`);
  else addFinding(findings, "fail", "Timeout", "Candidate timeout must be between 1000ms and 20000ms.", "P1");

  const rpm = Number(limits.requestsPerMinute || limits.rpm || 0);
  if (rpm > 0 && rpm <= 60) addFinding(findings, "pass", "Rate limit", `Rate limit ${rpm}/minute is present.`);
  else addFinding(findings, "fail", "Rate limit", "Candidate must declare a conservative requestsPerMinute/rpm <= 60.", "P1");

  if (String(candidate.costModel || "").trim()) addFinding(findings, "pass", "Cost model", `Cost model is ${candidate.costModel}.`);
  else addFinding(findings, "warn", "Cost model", "Cost model is missing; verify before customer canary.", "P2");

  if (String(candidate.requiredAuth || candidate.authModel || "none") === "none") addFinding(findings, "pass", "Authentication", "Candidate requires no adapter auth.");
  else addFinding(findings, "warn", "Authentication", "Candidate requires server-side auth review before canary.", "P2");

  if (String(rollbackPlan.owner || rollbackPlan.contact || "").trim() && String(rollbackPlan.disableEnv || rollbackPlan.disableFlag || "").trim()) {
    addFinding(findings, "pass", "Rollback", "Rollback owner/contact and disable flag are declared.");
  } else {
    addFinding(findings, "fail", "Rollback", "Candidate must declare rollback owner/contact and disable env/flag.", "P1");
  }

  if (task && !/wallet|ss58|seed|mnemonic|private key|sign/i.test(task)) {
    addFinding(findings, "pass", "Canary task", "Canary task is present and does not request wallet/signing material.");
  } else {
    addFinding(findings, "fail", "Canary task", "Canary task must be read-only and avoid wallet/signing material.", "P1");
  }

  const failCount = findings.filter((finding) => finding.status === "fail").length;
  return {
    ok: true,
    readyForReadOnlyCanary: failCount === 0,
    generatedAt: new Date().toISOString(),
    id: candidateId(candidate),
    netuid: Number.isInteger(netuid) ? netuid : null,
    adapterKind: kind,
    endpointHost: host,
    supportedIntents: intents,
    canaryTaskPreview: task ? `${task.slice(0, 80)}${task.length > 80 ? "..." : ""}` : "",
    findings,
    summary: {
      pass: findings.filter((finding) => finding.status === "pass").length,
      warn: findings.filter((finding) => finding.status === "warn").length,
      fail: failCount,
    },
    suggestedCommands: host && Number.isInteger(netuid) ? {
      canaryGate: `node scripts/bittensor-adapter-canary-gate.mjs --netuid ${netuid} --allowed-hosts ${host} --require-configured --strict`,
      readonlyCanary: `node scripts/bittensor-adapter-readonly-canary.mjs --netuid ${netuid} --intent ${config.preferredIntent || "service_call"} --task "${task || "<read-only task>"}" --allowed-hosts ${host} --confirm-invoke --allow-real-adapter-call --strict`,
    } : {},
    safety: {
      callsAdapterService: false,
      signsOrBroadcasts: false,
      acceptsCredentialMaterial: false,
      acceptsWalletSecrets: false,
      source: "matterhorn_bittensor_real_adapter_candidate_gate",
    },
  };
}

function escapeCell(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function renderMarkdown(summary) {
  const rows = summary.findings.map((finding) => `| ${escapeCell(finding.status)} | ${escapeCell(finding.area)} | ${escapeCell(finding.detail)} | ${escapeCell(finding.severity || "-")} |`).join("\n");
  return [
    "# Matterhorn Work Bittensor Real Adapter Candidate Gate",
    "",
    "## Decision",
    "",
    `- Result: ${summary.readyForReadOnlyCanary ? "READY_FOR_READONLY_CANARY" : "DO_NOT_CANARY"}`,
    `- Candidate: ${summary.id || "missing"}`,
    `- Netuid: ${summary.netuid ?? "missing"}`,
    `- Adapter kind: ${summary.adapterKind || "missing"}`,
    `- Endpoint host: ${summary.endpointHost || "missing"}`,
    "- Safety posture: candidate gate does not call the adapter, sign, submit, broadcast, transfer TAO, move stake, or accept wallet secrets.",
    "",
    "## Findings",
    "",
    "| Status | Area | Detail | Severity |",
    "| --- | --- | --- | --- |",
    rows,
    "",
    "## Suggested Next Commands",
    "",
    summary.suggestedCommands?.canaryGate ? `- Canary gate: \`${summary.suggestedCommands.canaryGate}\`` : "- Canary gate: unavailable until candidate passes basic endpoint/netuid checks.",
    summary.suggestedCommands?.readonlyCanary ? `- Read-only canary: \`${summary.suggestedCommands.readonlyCanary}\`` : "- Read-only canary: unavailable until candidate passes basic endpoint/netuid checks.",
    "",
  ].join("\n");
}

if (flag("--help") || flag("-h")) {
  console.log(usage());
  process.exit(0);
}

let summary;
try {
  summary = summarize(await readCandidate());
} catch (error) {
  summary = {
    ok: false,
    readyForReadOnlyCanary: false,
    generatedAt: new Date().toISOString(),
    id: "",
    netuid: null,
    adapterKind: "",
    endpointHost: "",
    supportedIntents: [],
    findings: [{ status: "fail", area: "Candidate gate", detail: error instanceof Error ? error.message : "Candidate gate failed.", severity: "P1" }],
    summary: { pass: 0, warn: 0, fail: 1 },
    suggestedCommands: {},
    safety: {
      callsAdapterService: false,
      signsOrBroadcasts: false,
      acceptsCredentialMaterial: false,
      acceptsWalletSecrets: false,
      source: "matterhorn_bittensor_real_adapter_candidate_gate",
    },
  };
}

const markdown = renderMarkdown(summary);
if (config.output) await writeFile(config.output, markdown, "utf8");
else console.log(markdown);
if (config.jsonOutput) await writeFile(config.jsonOutput, JSON.stringify(summary, null, 2) + "\n", "utf8");
if (config.strict && !summary.readyForReadOnlyCanary) process.exit(1);
