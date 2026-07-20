#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const args = process.argv.slice(2);
const FORBIDDEN_KEY_RE =
  /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|signedPayload|signed_payload)/i;
const FORBIDDEN_EXACT_KEY_RE = /^(signature|signedExtrinsic|signed_extrinsic|signedPayload|signed_payload)$/i;

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
  handoffPath: arg("--handoff"),
  handoffJson: arg("--handoff-json"),
  expectedSha: arg("--expected-sha") || arg("--expected-payload-sha256"),
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  now: arg("--now"),
  strict: flag("--strict"),
};

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-signing-handoff-check.mjs --handoff /tmp/handoff.json --expected-sha <payloadSha256> --strict",
    "",
    "Options:",
    "  --handoff <path>                  JSON output from Bittensor external-signing handoff.",
    "  --handoff-json <json>             Inline handoff JSON for scripts or MCP wrappers.",
    "  --expected-sha <sha256>           Optional expected payload SHA-256 from the preview.",
    "  --output, -o <path>               Write Markdown report to a file. Defaults to stdout.",
    "  --json-output <path>              Write machine-readable summary JSON.",
    "  --now <iso>                       Override current time for tests.",
    "  --strict                          Exit nonzero when the handoff is not safe to sign.",
  ].join("\n");
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function assertNoForbiddenKeys(value, label, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoForbiddenKeys(child, label, [...path, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_EXACT_KEY_RE.test(key) || FORBIDDEN_KEY_RE.test(key)) {
      throw new Error(`${label} contains forbidden signing or credential field: ${[...path, key].join(".")}`);
    }
    assertNoForbiddenKeys(child, label, [...path, key]);
  }
}

async function readHandoff() {
  if (config.handoffJson) return JSON.parse(config.handoffJson);
  if (!config.handoffPath) throw new Error("Missing --handoff or --handoff-json.");
  const raw = await readFile(config.handoffPath, "utf8");
  return JSON.parse(raw);
}

function getHandoffEnvelope(input) {
  const root = asObject(input);
  return asObject(root.handoff).payloadSha256 ? asObject(root.handoff) : root;
}

function normalizeSha(value) {
  return String(value || "").trim().toLowerCase();
}

function addFinding(findings, status, area, detail, severity = "") {
  findings.push({ status, area, detail, severity });
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(normalizeSha(value));
}

function checkExpiry(value, now) {
  if (!value) return { status: "warn", detail: "No expiry timestamp is present." };
  const expiresAtMs = Date.parse(value);
  if (!Number.isFinite(expiresAtMs)) return { status: "fail", detail: `Expiry is not a valid timestamp: ${value}` };
  if (expiresAtMs <= now.getTime()) return { status: "fail", detail: `Handoff expired at ${value}.` };
  return { status: "pass", detail: `Handoff expires at ${value}.` };
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

function renderMarkdown(summary) {
  const rows = summary.findings
    .map((finding) => `| ${escapeCell(finding.status)} | ${escapeCell(finding.area)} | ${escapeCell(finding.detail)} | ${escapeCell(finding.severity || "-")} |`)
    .join("\n");
  return [
    "# Matterhorn Desks Bittensor Signing Handoff Check",
    "",
    "## Decision",
    "",
    `- Result: ${summary.readyToSign ? "READY_FOR_EXTERNAL_SIGNER" : "DO_NOT_SIGN"}`,
    `- Handoff source: ${summary.inputLabel}`,
    "- Safety posture: this check validates an unsigned handoff only. Matterhorn still does not import keys, sign payloads, or broadcast by default.",
    "",
    "## Handoff Summary",
    "",
    `- Payload SHA-256: ${summary.payloadSha256 || "missing"}`,
    `- Action: ${summary.action || "unknown"}`,
    `- Netuid: ${summary.netuid ?? "unknown"}`,
    `- Amount TAO: ${summary.amountTao ?? "unknown"}`,
    `- Expires at: ${summary.expiresAt || "missing"}`,
    "",
    "## Checks",
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

const input = await readHandoff();
assertNoForbiddenKeys(input, "Bittensor signing handoff");

const handoff = getHandoffEnvelope(input);
const preview = asObject(input.preview || handoff.preview || handoff.unsignedPreview);
const payloadSha256 = normalizeSha(handoff.payloadSha256 || handoff.requestSha256 || input.payloadSha256);
const expectedSha = normalizeSha(config.expectedSha);
const now = config.now ? new Date(config.now) : new Date();
const findings = [];

if (isSha256(payloadSha256)) addFinding(findings, "pass", "Payload hash", "Payload SHA-256 is present and well formed.");
else addFinding(findings, "fail", "Payload hash", "Missing or invalid 64-character payload SHA-256.", "P1");

if (expectedSha) {
  if (!isSha256(expectedSha)) addFinding(findings, "fail", "Expected hash", "--expected-sha is not a valid SHA-256.", "P1");
  else if (expectedSha !== payloadSha256) addFinding(findings, "fail", "Expected hash", "Expected payload SHA-256 does not match the handoff payload SHA-256.", "P1");
  else addFinding(findings, "pass", "Expected hash", "Expected payload SHA-256 matches the handoff.");
}

const expiry = checkExpiry(handoff.expiresAt || input.expiresAt, now);
addFinding(findings, expiry.status, "Expiry", expiry.detail, expiry.status === "fail" ? "P1" : expiry.status === "warn" ? "P2" : "");

if (preview.action || handoff.action || input.action) addFinding(findings, "pass", "Action context", "Action context is present.");
else addFinding(findings, "warn", "Action context", "No action context was found in the handoff.", "P2");

if (preview.requiresExternalSignature === true || handoff.requiresExternalSignature === true || input.requiresExternalSignature === true) {
  addFinding(findings, "pass", "External signer", "Handoff explicitly requires an external signer.");
} else {
  addFinding(findings, "warn", "External signer", "Handoff does not explicitly mark external signer requirement.", "P2");
}

const readyToSign = count(findings, "fail") === 0;
const summary = {
  readyToSign,
  inputLabel: config.handoffPath ? basename(config.handoffPath) : "inline-json",
  payloadSha256,
  action: preview.action || handoff.action || input.action || "",
  netuid: preview.netuid ?? handoff.netuid ?? input.netuid ?? null,
  amountTao: preview.amountTao ?? handoff.amountTao ?? input.amountTao ?? null,
  expiresAt: handoff.expiresAt || input.expiresAt || "",
  findings,
  summary: {
    pass: count(findings, "pass"),
    warn: count(findings, "warn"),
    fail: count(findings, "fail"),
  },
};

const markdown = renderMarkdown(summary);
if (config.output) await writeFile(config.output, markdown, "utf8");
else console.log(markdown);
if (config.jsonOutput) await writeFile(config.jsonOutput, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
if (config.strict && !readyToSign) process.exit(1);
