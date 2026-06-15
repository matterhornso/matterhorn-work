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
  netuid: Number(arg("--netuid", "14")),
  capabilityJson: arg("--capability-json"),
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  allowedHosts: (arg("--allowed-hosts") || process.env.BITTENSOR_ADAPTER_CANARY_ALLOWED_HOSTS || "").split(",").map((item) => item.trim()).filter(Boolean),
  allowMock: flag("--allow-mock"),
  requireConfigured: flag("--require-configured"),
  strict: flag("--strict"),
  timeoutMs: Math.max(1_000, Number(arg("--timeout-ms", "15000")) || 15_000),
};

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-adapter-canary-gate.mjs --netuid 14 --allowed-hosts api.example.com --strict",
    "",
    "Options:",
    "  --server-url <url>          Matterhorn Work server URL.",
    "  --token <token>             Optional client bearer token.",
    "  --netuid <n>                Subnet netuid to inspect.",
    "  --capability-json <path>    Offline capability fixture for tests or canary evidence review.",
    "  --allowed-hosts <csv>       Comma-separated endpoint host allowlist for real adapters.",
    "  --allow-mock                Allow mock:// endpoints for local preview-confirm-invoke tests.",
    "  --require-configured        Fail if the adapter is not configured.",
    "  --output, -o <path>         Write Markdown report.",
    "  --json-output <path>        Write JSON summary.",
    "  --strict                    Exit nonzero when the gate is not ready.",
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

async function requestCapability() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers = config.token ? { Authorization: `Bearer ${config.token}` } : {};
    const response = await fetch(`${config.serverUrl}/api/bittensor/capabilities/${encodeURIComponent(String(config.netuid))}`, {
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(body?.message || body?.error || text || `HTTP ${response.status}`);
    return body.capability || body;
  } finally {
    clearTimeout(timer);
  }
}

async function loadCapability() {
  const capability = config.capabilityJson
    ? JSON.parse(await readFile(config.capabilityJson, "utf8"))
    : await requestCapability();
  assertNoForbiddenKeys(capability, "Bittensor adapter canary capability");
  return capability.capability || capability;
}

function addFinding(findings, status, area, detail, severity = "") {
  findings.push({ status, area, detail, severity });
}

function endpointOf(capability) {
  return capability.endpoint || capability.serviceEndpoint || capability.adapter?.endpoint || capability.adapterStatus?.endpoint || "";
}

function configuredOf(capability) {
  if (typeof capability.adapterStatus?.configured === "boolean") return capability.adapterStatus.configured;
  if (typeof capability.configured === "boolean") return capability.configured;
  return Boolean(endpointOf(capability) && capability.serviceAdapter && capability.serviceAdapter !== "none");
}

function checkEndpoint(endpoint, findings) {
  if (!endpoint) {
    addFinding(findings, "warn", "Endpoint", "No adapter endpoint is exposed in the capability manifest.", "P2");
    return;
  }
  if (endpoint.startsWith("mock://")) {
    if (config.allowMock) addFinding(findings, "pass", "Endpoint", "mock:// endpoint allowed for local adapter tests.");
    else addFinding(findings, "fail", "Endpoint", "mock:// endpoint is not allowed for a real canary without --allow-mock.", "P1");
    return;
  }
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    addFinding(findings, "fail", "Endpoint", `Endpoint is not a valid URL: ${endpoint}`, "P1");
    return;
  }
  if (parsed.protocol !== "https:") {
    addFinding(findings, "fail", "Endpoint", `Real adapter endpoint must use https:, received ${parsed.protocol}`, "P1");
  } else if (config.allowedHosts.length && !config.allowedHosts.includes(parsed.hostname)) {
    addFinding(findings, "fail", "Endpoint allowlist", `${parsed.hostname} is not in --allowed-hosts.`, "P1");
  } else {
    addFinding(findings, "pass", "Endpoint", `Endpoint host ${parsed.hostname} is allowed.`);
  }
}

function summarize(capability) {
  const findings = [];
  const endpoint = endpointOf(capability);
  const configured = configuredOf(capability);
  const serviceAdapter = capability.serviceAdapter || capability.adapter?.type || "";

  if (Number(capability.netuid) === config.netuid) addFinding(findings, "pass", "Netuid", `Capability netuid ${capability.netuid} matches.`);
  else addFinding(findings, "fail", "Netuid", `Expected netuid ${config.netuid}, received ${capability.netuid ?? "missing"}.`, "P1");

  if (serviceAdapter && serviceAdapter !== "none") addFinding(findings, "pass", "Adapter", `Service adapter is ${serviceAdapter}.`);
  else addFinding(findings, "fail", "Adapter", "No service adapter is declared.", "P1");

  if (configured) addFinding(findings, "pass", "Configuration", "Adapter is marked configured or exposes an endpoint.");
  else if (config.requireConfigured) addFinding(findings, "fail", "Configuration", "Adapter is not configured.", "P1");
  else addFinding(findings, "warn", "Configuration", "Adapter is not configured yet.", "P2");

  checkEndpoint(endpoint, findings);

  if (capability.requiredAuth && capability.requiredAuth !== "none") {
    addFinding(findings, "warn", "Authentication", `Adapter requires ${capability.requiredAuth}; verify server-side secret handling before canary.`, "P2");
  } else {
    addFinding(findings, "pass", "Authentication", "No adapter authentication is required or exposed to the client.");
  }

  if (/free|read/i.test(String(capability.costModel || ""))) addFinding(findings, "pass", "Cost model", `Cost model is ${capability.costModel}.`);
  else addFinding(findings, "warn", "Cost model", `Review cost model before customer canary: ${capability.costModel || "missing"}.`, "P2");

  const notes = Array.isArray(capability.safetyNotes) ? capability.safetyNotes.join(" ") : "";
  if (/wallet|ss58|personal|private/i.test(notes)) {
    addFinding(findings, "warn", "Privacy", "Safety notes mention wallet or personal data; review before real canary.", "P2");
  } else {
    addFinding(findings, "pass", "Privacy", "Safety notes do not indicate wallet/private-data dependency.");
  }

  const ready = findings.every((finding) => finding.status !== "fail");
  return {
    ok: true,
    readyForCanary: ready,
    generatedAt: new Date().toISOString(),
    netuid: config.netuid,
    serviceAdapter,
    endpointHost: endpoint && !endpoint.startsWith("mock://") ? (() => { try { return new URL(endpoint).hostname; } catch { return ""; } })() : endpoint ? "mock" : "",
    configured,
    findings,
    summary: {
      pass: findings.filter((finding) => finding.status === "pass").length,
      warn: findings.filter((finding) => finding.status === "warn").length,
      fail: findings.filter((finding) => finding.status === "fail").length,
    },
    safety: {
      callsAdapterService: false,
      signsOrBroadcasts: false,
      acceptsCredentialMaterial: false,
      source: "matterhorn_bittensor_adapter_canary_gate",
    },
  };
}

function escapeCell(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function renderMarkdown(summary) {
  const rows = summary.findings.map((finding) => `| ${escapeCell(finding.status)} | ${escapeCell(finding.area)} | ${escapeCell(finding.detail)} | ${escapeCell(finding.severity || "-")} |`).join("\n");
  return [
    "# Matterhorn Work Bittensor Adapter Canary Gate",
    "",
    "## Decision",
    "",
    `- Result: ${summary.readyForCanary ? "READY_FOR_CANARY" : "DO_NOT_ENABLE_CANARY"}`,
    `- Netuid: ${summary.netuid}`,
    `- Service adapter: ${summary.serviceAdapter || "missing"}`,
    "- Safety posture: this gate inspects adapter capability evidence only. It does not call the adapter service, sign, submit, broadcast, transfer TAO, or move stake.",
    "",
    "## Findings",
    "",
    "| Status | Area | Detail | Severity |",
    "| --- | --- | --- | --- |",
    rows,
    "",
  ].join("\n");
}

if (flag("--help") || flag("-h")) {
  console.log(usage());
  process.exit(0);
}

let summary;
try {
  const capability = await loadCapability();
  summary = summarize(capability);
} catch (error) {
  summary = {
    ok: false,
    readyForCanary: false,
    generatedAt: new Date().toISOString(),
    netuid: config.netuid,
    serviceAdapter: "",
    configured: false,
    findings: [{ status: "fail", area: "Canary gate", detail: error instanceof Error ? error.message : "Canary gate failed.", severity: "P1" }],
    summary: { pass: 0, warn: 0, fail: 1 },
    safety: {
      callsAdapterService: false,
      signsOrBroadcasts: false,
      acceptsCredentialMaterial: false,
      source: "matterhorn_bittensor_adapter_canary_gate",
    },
  };
}

const markdown = renderMarkdown(summary);
if (config.output) await writeFile(config.output, markdown, "utf8");
else console.log(markdown);
if (config.jsonOutput) await writeFile(config.jsonOutput, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
if (config.strict && !summary.readyForCanary) process.exit(1);
