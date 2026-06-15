#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
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
  serverUrl: (arg("--server-url") || process.env.MATTERHORN_WORK_SERVER_URL || process.env.OPENWORK_SERVER_URL || "http://127.0.0.1:8787").replace(/\/+$/, ""),
  token: arg("--token") || process.env.MATTERHORN_WORK_TOKEN || process.env.OPENWORK_TOKEN || "",
  netuid: Number(arg("--netuid", "14")),
  intent: arg("--intent", "service_call"),
  task: arg("--task", "Matterhorn read-only Bittensor adapter canary"),
  ss58Address: arg("--ss58-address"),
  allowedHosts: (arg("--allowed-hosts") || process.env.BITTENSOR_ADAPTER_CANARY_ALLOWED_HOSTS || "").split(",").map((item) => item.trim()).filter(Boolean),
  allowMock: flag("--allow-mock"),
  allowRealAdapterCall: flag("--allow-real-adapter-call"),
  confirmInvoke: flag("--confirm-invoke"),
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  strict: flag("--strict"),
  timeoutMs: Math.max(1_000, Number(arg("--timeout-ms", "20000")) || 20_000),
};

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-adapter-readonly-canary.mjs --netuid 14 --allowed-hosts adapter.example.com --confirm-invoke --allow-real-adapter-call --strict",
    "",
    "Options:",
    "  --server-url <url>              Matterhorn Work server URL.",
    "  --token <token>                 Optional client bearer token.",
    "  --netuid <n>                    Subnet netuid.",
    "  --intent <intent>               Defaults to service_call.",
    "  --task <text>                   Visible read-only task text sent through preview/invoke.",
    "  --ss58-address <address>        Optional public SS58 routing context.",
    "  --allowed-hosts <csv>           Required host allowlist for real adapter endpoints.",
    "  --allow-mock                    Allow mock:// endpoints for local tests.",
    "  --confirm-invoke                Invoke only after preview request hash is captured.",
    "  --allow-real-adapter-call       Required with --confirm-invoke for non-mock endpoints.",
    "  --output, -o <path>             Write Markdown report.",
    "  --json-output <path>            Write JSON summary.",
    "  --strict                        Exit nonzero when the canary is not ready.",
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

function endpointOf(capability) {
  return capability.endpoint || capability.serviceEndpoint || capability.adapter?.endpoint || capability.adapterStatus?.endpoint || "";
}

function serviceAdapterOf(capability) {
  return capability.serviceAdapter || capability.adapter?.type || "";
}

function addFinding(findings, status, area, detail, severity = "") {
  findings.push({ status, area, detail, severity });
}

function hashLooksSafe(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

function endpointPolicy(capability, findings) {
  const endpoint = endpointOf(capability);
  if (!endpoint) {
    addFinding(findings, "fail", "Endpoint", "Capability does not expose an adapter endpoint.", "P1");
    return { endpoint, mock: false, real: false, host: "" };
  }
  if (endpoint.startsWith("mock://")) {
    if (config.allowMock) addFinding(findings, "pass", "Endpoint", "mock:// endpoint allowed for local canary tests.");
    else addFinding(findings, "fail", "Endpoint", "mock:// endpoint requires --allow-mock.", "P1");
    return { endpoint, mock: true, real: false, host: "mock" };
  }
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    addFinding(findings, "fail", "Endpoint", `Endpoint is not a valid URL: ${endpoint}`, "P1");
    return { endpoint, mock: false, real: true, host: "" };
  }
  if (parsed.protocol !== "https:") addFinding(findings, "fail", "Endpoint", `Real adapter endpoint must use https:, received ${parsed.protocol}`, "P1");
  else if (!config.allowedHosts.length) addFinding(findings, "fail", "Endpoint allowlist", "--allowed-hosts is required for real adapter canaries.", "P1");
  else if (!config.allowedHosts.includes(parsed.hostname)) addFinding(findings, "fail", "Endpoint allowlist", `${parsed.hostname} is not in --allowed-hosts.`, "P1");
  else addFinding(findings, "pass", "Endpoint", `Endpoint host ${parsed.hostname} is allowlisted.`);
  return { endpoint, mock: false, real: true, host: parsed.hostname };
}

async function requestJson(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers = { ...(options.headers || {}) };
    if (config.token) headers.Authorization = `Bearer ${config.token}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${config.serverUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    assertNoForbiddenKeys(body, `Response from ${path}`);
    if (!response.ok) throw new Error(body?.message || body?.error || text || `HTTP ${response.status}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function escapeCell(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function renderMarkdown(summary) {
  return [
    "# Matterhorn Work Bittensor Read-Only Adapter Canary",
    "",
    "## Decision",
    "",
    `- Result: ${summary.ready ? "READ_ONLY_CANARY_READY" : "READ_ONLY_CANARY_BLOCKED"}`,
    `- Netuid: ${summary.netuid}`,
    `- Service adapter: ${summary.serviceAdapter || "missing"}`,
    `- Invoked: ${summary.invoked ? "yes" : "no"}`,
    "- Safety posture: no signing, no custody, no TAO transfer, no wallet secrets. Invoke requires explicit confirmation and endpoint policy.",
    "",
    "## Findings",
    "",
    "| Status | Area | Detail | Severity |",
    "| --- | --- | --- | --- |",
    ...summary.findings.map((finding) => `| ${escapeCell(finding.status)} | ${escapeCell(finding.area)} | ${escapeCell(finding.detail)} | ${escapeCell(finding.severity || "-")} |`),
    "",
  ].join("\n");
}

if (flag("--help") || flag("-h")) {
  console.log(usage());
  process.exit(0);
}

const findings = [];
let capability = null;
let preview = null;
let invocation = null;
let endpoint = { endpoint: "", mock: false, real: false, host: "" };
try {
  const capabilityResponse = await requestJson(`/api/bittensor/capabilities/${encodeURIComponent(String(config.netuid))}`);
  capability = capabilityResponse.capability || capabilityResponse;
  assertNoForbiddenKeys(capability, "Bittensor adapter capability");
  endpoint = endpointPolicy(capability, findings);
  const serviceAdapter = serviceAdapterOf(capability);
  if (Number(capability.netuid) === config.netuid) addFinding(findings, "pass", "Netuid", `Capability netuid ${capability.netuid} matches.`);
  else addFinding(findings, "fail", "Netuid", `Expected netuid ${config.netuid}, received ${capability.netuid ?? "missing"}.`, "P1");
  if (serviceAdapter && serviceAdapter !== "none" && serviceAdapter !== "unsupported") addFinding(findings, "pass", "Adapter", `Service adapter is ${serviceAdapter}.`);
  else addFinding(findings, "fail", "Adapter", "No callable service adapter is declared.", "P1");

  const previewResponse = await requestJson(`/api/bittensor/subnets/${encodeURIComponent(String(config.netuid))}/preview`, {
    method: "POST",
    body: { intent: config.intent, task: config.task, ss58Address: config.ss58Address || null },
  });
  preview = previewResponse.preview || previewResponse;
  assertNoForbiddenKeys(preview, "Bittensor adapter preview");
  if (preview.supported === true) addFinding(findings, "pass", "Preview", "Preview reports adapter support.");
  else addFinding(findings, "fail", "Preview", "Preview does not report adapter support.", "P1");
  if (hashLooksSafe(preview.requestSha256)) addFinding(findings, "pass", "Request hash", "Preview returned a 64-character request SHA-256.");
  else addFinding(findings, "fail", "Request hash", "Preview did not return a valid request SHA-256.", "P1");

  if (config.confirmInvoke) {
    if (endpoint.real && !config.allowRealAdapterCall) {
      addFinding(findings, "fail", "Invoke confirmation", "Real adapter invoke requires --allow-real-adapter-call.", "P1");
    } else if (findings.some((finding) => finding.status === "fail")) {
      addFinding(findings, "fail", "Invoke confirmation", "Invoke skipped because preflight findings failed.", "P1");
    } else {
      const invokeResponse = await requestJson(`/api/bittensor/subnets/${encodeURIComponent(String(config.netuid))}/invoke`, {
        method: "POST",
        body: {
          intent: config.intent,
          task: config.task,
          ss58Address: config.ss58Address || null,
          previewRequestSha256: preview.requestSha256,
          reviewedRequestSha256: preview.requestSha256,
        },
      });
      invocation = invokeResponse.invocation || invokeResponse;
      assertNoForbiddenKeys(invocation, "Bittensor adapter invocation");
      if (invocation.supported === true) addFinding(findings, "pass", "Invoke", "Hash-confirmed adapter invocation returned supported=true.");
      else addFinding(findings, "fail", "Invoke", "Adapter invocation did not return supported=true.", "P1");
    }
  } else {
    addFinding(findings, "warn", "Invoke", "Invoke was not attempted; pass --confirm-invoke after reviewing the preview hash.", "P2");
  }
} catch (error) {
  addFinding(findings, "fail", "Canary", error instanceof Error ? error.message : "Read-only canary failed.", "P1");
}

const failCount = findings.filter((finding) => finding.status === "fail").length;
const summary = {
  ok: true,
  ready: failCount === 0 && (config.confirmInvoke ? Boolean(invocation?.supported) : Boolean(preview?.supported)),
  generatedAt: new Date().toISOString(),
  netuid: config.netuid,
  serviceAdapter: capability ? serviceAdapterOf(capability) : "",
  endpointHost: endpoint.host,
  previewRequestSha256: preview?.requestSha256 || "",
  invoked: Boolean(invocation),
  findings,
  summary: {
    pass: findings.filter((finding) => finding.status === "pass").length,
    warn: findings.filter((finding) => finding.status === "warn").length,
    fail: failCount,
  },
  safety: {
    custody: "none",
    signsOrBroadcasts: false,
    acceptsCredentialMaterial: false,
    callsAdapterService: Boolean(invocation),
    requiresExplicitInvokeConfirmation: true,
    source: "matterhorn_bittensor_adapter_readonly_canary",
  },
};

const markdown = renderMarkdown(summary);
if (config.output) await writeFile(config.output, markdown, "utf8");
else console.log(markdown);
if (config.jsonOutput) await writeFile(config.jsonOutput, JSON.stringify(summary, null, 2) + "\n", "utf8");
if (config.strict && !summary.ready) process.exit(1);
