#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const args = process.argv.slice(2);
const FORBIDDEN_KEY_RE = /(seed|mnemonic|private|secret|password|passphrase|keyfile|suri|walletExport|wallet_export|signedPayload|signed_payload|signedExtrinsic|signed_extrinsic)/i;
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
  receiptPath: arg("--receipt"),
  receiptJson: arg("--receipt-json"),
  expectedPayloadSha: arg("--expected-payload-sha") || arg("--expected-sha"),
  expectedAction: arg("--expected-action"),
  expectedNetuid: arg("--expected-netuid"),
  output: arg("--output") || arg("-o"),
  jsonOutput: arg("--json-output"),
  strict: flag("--strict"),
};

function usage() {
  return [
    "Usage:",
    "  node scripts/bittensor-receipt-check.mjs --receipt /tmp/bittensor-receipt.json --expected-payload-sha <sha256> --strict",
    "",
    "Options:",
    "  --receipt <path>              JSON receipt returned after external signing/submission.",
    "  --receipt-json <json>         Inline receipt JSON.",
    "  --expected-payload-sha <sha>  Optional payload SHA-256 from the original handoff.",
    "  --expected-action <action>    Optional expected action such as stake.",
    "  --expected-netuid <netuid>    Optional expected subnet netuid.",
    "  --output, -o <path>           Write Markdown report.",
    "  --json-output <path>          Write machine-readable JSON summary.",
    "  --strict                      Exit nonzero when receipt needs review.",
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

async function readReceipt() {
  if (config.receiptJson) return JSON.parse(config.receiptJson);
  if (!config.receiptPath) throw new Error("Missing --receipt or --receipt-json.");
  return JSON.parse(await readFile(config.receiptPath, "utf8"));
}

function normalizeSha(value) {
  return String(value || "").trim().toLowerCase();
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(normalizeSha(value));
}

function isHash(value) {
  return /^0x[a-f0-9]{64}$/i.test(String(value || "").trim());
}

function addFinding(findings, status, area, detail, severity = "") {
  findings.push({ status, area, detail, severity });
}

function receiptEnvelope(input) {
  const root = asObject(input);
  return asObject(root.receipt).txHash || asObject(root.result).txHash ? asObject(root.receipt || root.result) : root;
}

function statusOf(receipt) {
  return String(receipt.status || receipt.result || receipt.state || "").toLowerCase();
}

function receiptSucceeded(status) {
  return /finalized|success|submitted|in_block|included|broadcast/.test(status);
}

function escapeCell(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function count(findings, status) {
  return findings.filter((finding) => finding.status === status).length;
}

function renderMarkdown(summary) {
  const rows = summary.findings.map((finding) => `| ${escapeCell(finding.status)} | ${escapeCell(finding.area)} | ${escapeCell(finding.detail)} | ${escapeCell(finding.severity || "-")} |`).join("\n");
  return [
    "# Matterhorn Work Bittensor Receipt Check",
    "",
    "## Decision",
    "",
    `- Result: ${summary.accepted ? "RECEIPT_CAPTURED" : "REVIEW_RECEIPT"}`,
    `- Receipt source: ${summary.inputLabel}`,
    "- Safety posture: this check validates a post-signing receipt only. Matterhorn does not import keys, accept raw signatures, or store signed payloads.",
    "",
    "## Receipt Summary",
    "",
    `- Status: ${summary.status || "unknown"}`,
    `- Transaction hash: ${summary.txHash || "missing"}`,
    `- Block hash: ${summary.blockHash || "missing"}`,
    `- Payload SHA-256: ${summary.payloadSha256 || "missing"}`,
    `- Action: ${summary.action || "unknown"}`,
    `- Netuid: ${summary.netuid ?? "unknown"}`,
    "",
    "## Suggested Follow-Up Prompt",
    "",
    summary.followUpPrompt,
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

const input = await readReceipt();
assertNoForbiddenKeys(input, "Bittensor receipt");
const receipt = receiptEnvelope(input);
const payloadSha256 = normalizeSha(receipt.payloadSha256 || receipt.requestSha256 || input.payloadSha256);
const expectedPayloadSha = normalizeSha(config.expectedPayloadSha);
const txHash = String(receipt.txHash || receipt.hash || "").trim();
const blockHash = String(receipt.blockHash || receipt.block || "").trim();
const status = statusOf(receipt);
const action = String(receipt.action || asObject(receipt.preview).action || input.action || "").trim();
const netuid = receipt.netuid ?? asObject(receipt.preview).netuid ?? input.netuid ?? null;
const findings = [];

if (txHash && isHash(txHash)) addFinding(findings, "pass", "Transaction hash", "Transaction hash is present and well formed.");
else addFinding(findings, "warn", "Transaction hash", "Transaction hash is missing or not a 0x-prefixed 32-byte hash.", "P2");

if (blockHash) {
  if (isHash(blockHash)) addFinding(findings, "pass", "Block hash", "Block hash is present and well formed.");
  else addFinding(findings, "warn", "Block hash", "Block hash is present but not a 0x-prefixed 32-byte hash.", "P2");
} else {
  addFinding(findings, "warn", "Block hash", "No block hash is present yet; receipt may not be finalized.", "P2");
}

if (receiptSucceeded(status)) addFinding(findings, "pass", "Status", `Receipt status is ${status}.`);
else addFinding(findings, "warn", "Status", `Receipt status needs review: ${status || "missing"}.`, "P2");

if (expectedPayloadSha) {
  if (!isSha256(expectedPayloadSha)) addFinding(findings, "fail", "Expected payload hash", "--expected-payload-sha is not a valid SHA-256.", "P1");
  else if (expectedPayloadSha !== payloadSha256) addFinding(findings, "fail", "Payload hash", "Receipt payload SHA-256 does not match the original handoff.", "P1");
  else addFinding(findings, "pass", "Payload hash", "Receipt payload SHA-256 matches the original handoff.");
} else if (payloadSha256) {
  addFinding(findings, isSha256(payloadSha256) ? "pass" : "warn", "Payload hash", isSha256(payloadSha256) ? "Payload SHA-256 is present." : "Payload SHA-256 is malformed.", isSha256(payloadSha256) ? "" : "P2");
} else {
  addFinding(findings, "warn", "Payload hash", "No payload SHA-256 is present to connect receipt to handoff.", "P2");
}

if (config.expectedAction) {
  if (action === config.expectedAction) addFinding(findings, "pass", "Action", `Action matches ${config.expectedAction}.`);
  else addFinding(findings, "fail", "Action", `Expected action ${config.expectedAction}, received ${action || "missing"}.`, "P1");
}

if (config.expectedNetuid) {
  if (String(netuid) === String(config.expectedNetuid)) addFinding(findings, "pass", "Netuid", `Netuid matches ${config.expectedNetuid}.`);
  else addFinding(findings, "fail", "Netuid", `Expected netuid ${config.expectedNetuid}, received ${netuid ?? "missing"}.`, "P1");
}

const accepted = count(findings, "fail") === 0;
const followUpPrompt = netuid !== null
  ? `Bittensor Agent task: compare my public wallet state after this ${action || "Bittensor"} receipt on subnet ${netuid}. Explain what changed, source freshness, and any safe next steps without asking for seed phrases or private keys.`
  : `Bittensor Agent task: review this Bittensor receipt and compare my public wallet state after finality. Explain what changed and any safe next steps without asking for seed phrases or private keys.`;

const summary = {
  ok: true,
  accepted,
  inputLabel: config.receiptPath ? basename(config.receiptPath) : "inline-json",
  txHash,
  blockHash,
  payloadSha256,
  status,
  action,
  netuid,
  findings,
  followUpPrompt,
  summary: {
    pass: count(findings, "pass"),
    warn: count(findings, "warn"),
    fail: count(findings, "fail"),
  },
  safety: {
    custody: "none",
    acceptsCredentialMaterial: false,
    acceptsRawSignatures: false,
    storesSignedPayloads: false,
    source: "matterhorn_bittensor_receipt_check",
  },
};

const markdown = renderMarkdown(summary);
if (config.output) await writeFile(config.output, markdown, "utf8");
else console.log(markdown);
if (config.jsonOutput) await writeFile(config.jsonOutput, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
if (config.strict && !accepted) process.exit(1);
