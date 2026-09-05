#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isIP } from "node:net";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";

const INPUT_VERSION = "matterhorn.venice-private-hosted-acceptance.v1";
const OUTPUT_VERSION = "matterhorn.venice-private-hosted-readiness.v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAX_PROOF_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_INPUT_BYTES = 256 * 1024;
const MAX_EVIDENCE_BYTES = 1024 * 1024;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const FORBIDDEN_KEYS = new Set([
  "token", "authorization", "apikey", "secret", "password", "privatekey",
  "seed", "seedphrase", "mnemonic", "rawsignature", "signedpayload",
  "walletexport", "sessiontoken", "accesstoken", "refreshtoken",
]);
const FORBIDDEN_REPORT_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /["'](?:prompt|messages|parts|requestBody|responseBody|privateKey|seedPhrase|mnemonic|rawSignature|walletExport)["']\s*:/i,
  /\b(?:seed phrase|mnemonic|private key|wallet export)\s*[:=]\s*\S+/i,
]);

const UI_CHECKS = Object.freeze([
  "setupState",
  "unavailableState",
  "toggleKeyboardOperable",
  "verifiedOffState",
  "verifiedOnState",
  "busyState",
  "disclosureVisible",
]);
const REQUEST_CHECKS = Object.freeze([
  "privateRequestCompleted",
  "privateWorkspaceModeBound",
  "receiptProviderMatches",
  "receiptZeroRetention",
  "modelSubstitutionBlocked",
  "expiredProofBlocked",
  "refreshFailureBlocked",
  "secretBlockedBeforeProvider",
  "zeroUsageOnSecretBlock",
  "zeroProviderCallsOnSecretBlock",
  "crossAccountBlocked",
  "reloadRestored",
]);

function parseArgs(argv) {
  const command = argv[0] === "template" ? "template" : "evaluate";
  const config = {
    command,
    input: "",
    output: "",
    jsonOutput: "",
    expectedCommit: "",
    appUrl: "",
    now: new Date(),
    strict: false,
    json: false,
    help: false,
  };
  for (let index = command === "template" ? 1 : 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--") continue;
    if (arg === "--input") config.input = resolve(next());
    else if (arg === "--output") config.output = resolve(next());
    else if (arg === "--json-output") config.jsonOutput = resolve(next());
    else if (arg === "--expected-commit") config.expectedCommit = next().toLowerCase();
    else if (arg === "--app-url") config.appUrl = next();
    else if (arg === "--now") config.now = new Date(next());
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json") config.json = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!config.help && !COMMIT_PATTERN.test(config.expectedCommit)) {
    throw new Error("--expected-commit must be a full lowercase 40-character Git SHA.");
  }
  if (!config.help && !Number.isFinite(config.now.getTime())) {
    throw new Error("--now must be a valid timestamp.");
  }
  if (!config.help && command === "template" && (!config.output || !config.appUrl)) {
    throw new Error("template requires --output and --app-url.");
  }
  if (!config.help && command === "evaluate" && !config.input) {
    throw new Error("--input is required.");
  }
  return config;
}

function help() {
  return [
    "Matterhorn Venice Private hosted acceptance",
    "",
    "Creates or verifies redacted, exact-release evidence for the Venice Private toggle and request path.",
    "This command does not enable a provider, alter rollout mode, or contact Venice.",
    "",
    "Usage:",
    "  pnpm template:venice-private-acceptance -- --expected-commit <sha> --app-url https://candidate.example --output /absolute/path/venice-private.json",
    "  pnpm gate:venice-private-acceptance -- --input /absolute/path/venice-private.json --expected-commit <sha> --strict --json",
  ].join("\n");
}

function normalizeKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function rejectSensitiveKeys(value, path = "input") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSensitiveKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(normalizeKey(key))) throw new Error(`${path} contains a forbidden field.`);
    rejectSensitiveKeys(entry, `${path}.${key}`);
  }
}

function rejectDuplicateJsonKeys(text) {
  let cursor = 0;
  const whitespace = /\s/u;

  function skipWhitespace() {
    while (cursor < text.length && whitespace.test(text[cursor])) cursor += 1;
  }

  function readString() {
    const start = cursor;
    cursor += 1;
    let escaped = false;
    while (cursor < text.length) {
      const character = text[cursor];
      cursor += 1;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "\"") return JSON.parse(text.slice(start, cursor));
    }
    throw new Error("Acceptance input must be valid JSON.");
  }

  function readScalar() {
    while (cursor < text.length && !/[\s,}\]]/u.test(text[cursor])) cursor += 1;
  }

  function readValue() {
    skipWhitespace();
    if (text[cursor] === "{") {
      readObject();
      return;
    }
    if (text[cursor] === "[") {
      cursor += 1;
      skipWhitespace();
      if (text[cursor] === "]") {
        cursor += 1;
        return;
      }
      while (cursor < text.length) {
        readValue();
        skipWhitespace();
        if (text[cursor] === "]") {
          cursor += 1;
          return;
        }
        cursor += 1;
      }
      return;
    }
    if (text[cursor] === "\"") {
      readString();
      return;
    }
    readScalar();
  }

  function readObject() {
    cursor += 1;
    const keys = new Set();
    skipWhitespace();
    if (text[cursor] === "}") {
      cursor += 1;
      return;
    }
    while (cursor < text.length) {
      skipWhitespace();
      const key = readString();
      if (keys.has(key)) throw new Error("Acceptance input contains a duplicate JSON key.");
      keys.add(key);
      skipWhitespace();
      cursor += 1;
      readValue();
      skipWhitespace();
      if (text[cursor] === "}") {
        cursor += 1;
        return;
      }
      cursor += 1;
    }
  }

  readValue();
}

function readInputJson(path) {
  const pathStat = lstatSync(path);
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    throw new Error("Acceptance input must be a regular non-symlink file.");
  }
  let descriptor;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size <= 0 || before.size > MAX_INPUT_BYTES) {
      throw new Error("Acceptance input must be non-empty and no larger than 256 KiB.");
    }
    if (pathStat.dev !== before.dev || pathStat.ino !== before.ino) {
      throw new Error("Acceptance input changed before it was read.");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const finalPathStat = lstatSync(path);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || finalPathStat.isSymbolicLink()
      || finalPathStat.dev !== before.dev
      || finalPathStat.ino !== before.ino
    ) {
      throw new Error("Acceptance input changed while it was read.");
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Acceptance input must be valid UTF-8 JSON.");
    }
    let input;
    try {
      input = JSON.parse(text);
      rejectDuplicateJsonKeys(text);
    } catch (error) {
      if (error instanceof Error && error.message.includes("duplicate JSON key")) throw error;
      throw new Error("Acceptance input must be valid JSON.");
    }
    return input;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function onlyKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(`${label} contains an unsupported field.`);
  }
}

function safeDeployedAppUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const address = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.port && url.port !== "443")
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || isIP(address) !== 0
  ) {
    throw new Error("appUrl must be a credential-free deployed HTTPS URL.");
  }
  return url.toString();
}

function evidenceReference(root, value, label) {
  onlyKeys(value, ["path", "sha256"], label);
  if (typeof value.path !== "string" || !value.path || isAbsolute(value.path) || value.path.includes("\0")) {
    throw new Error(`${label}.path must be a non-empty relative path.`);
  }
  if (typeof value.sha256 !== "string" || !HASH_PATTERN.test(value.sha256)) {
    throw new Error(`${label}.sha256 must be a lowercase SHA-256 digest.`);
  }
  const rootReal = realpathSync(root);
  const candidate = resolve(rootReal, value.path);
  const lexicalRelative = relative(rootReal, candidate);
  if (!lexicalRelative || lexicalRelative === ".." || lexicalRelative.startsWith(`..${sep}`) || isAbsolute(lexicalRelative)) {
    throw new Error(`${label}.path must remain inside the acceptance directory.`);
  }
  const stat = lstatSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`${label}.path must name a regular non-symlink file.`);
  const real = realpathSync(candidate);
  const canonicalRelative = relative(rootReal, real);
  if (!canonicalRelative || canonicalRelative === ".." || canonicalRelative.startsWith(`..${sep}`) || isAbsolute(canonicalRelative)) {
    throw new Error(`${label}.path resolves outside the acceptance directory.`);
  }
  let descriptor;
  try {
    descriptor = openSync(real, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size <= 0 || before.size > MAX_EVIDENCE_BYTES) {
      throw new Error(`${label}.path must name a non-empty report no larger than 1 MiB.`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size) {
      throw new Error(`${label}.path changed while it was read.`);
    }
    const text = bytes.toString("utf8");
    if (Buffer.from(text, "utf8").compare(bytes) !== 0) throw new Error(`${label}.path must be valid UTF-8.`);
    if (FORBIDDEN_REPORT_PATTERNS.some((pattern) => pattern.test(text))) {
      throw new Error(`${label}.path contains content that is forbidden in acceptance evidence.`);
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== value.sha256) throw new Error(`${label}.sha256 does not match the report bytes.`);
    return { canonicalPath: real, digest };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateClosedInput(input) {
  onlyKeys(input, [
    "version", "capturedAt", "commit", "frontendCommit", "backendCommit", "appUrl",
    "provider", "ui", "requests", "evidence",
  ], "input");
  onlyKeys(input.provider, [
    "status", "id", "modelId", "proofVerifiedAt", "proofExpiresAt", "policyStatus",
    "trainingUse", "retentionDays", "selectedFromExactProof", "browserCredentialAbsent",
  ], "input.provider");
  onlyKeys(input.ui, ["status", ...UI_CHECKS], "input.ui");
  onlyKeys(input.requests, ["status", ...REQUEST_CHECKS], "input.requests");
  onlyKeys(input.evidence, ["provider", "ui", "requests"], "input.evidence");
  rejectSensitiveKeys(input);
}

function allTrue(value, keys) {
  return keys.every((key) => value?.[key] === true);
}

function check(checks, id, label, passed) {
  checks.push({ id, status: passed ? "pass" : "fail", label });
}

function evaluate(input, config) {
  validateClosedInput(input);
  const appUrl = safeDeployedAppUrl(input.appUrl);
  const capturedAt = Date.parse(input.capturedAt ?? "");
  const verifiedAt = Date.parse(input.provider?.proofVerifiedAt ?? "");
  const expiresAt = Date.parse(input.provider?.proofExpiresAt ?? "");
  const nowMs = config.now.getTime();
  const evidenceRoot = dirname(config.input);
  const evidence = [
    evidenceReference(evidenceRoot, input.evidence.provider, "input.evidence.provider"),
    evidenceReference(evidenceRoot, input.evidence.ui, "input.evidence.ui"),
    evidenceReference(evidenceRoot, input.evidence.requests, "input.evidence.requests"),
  ];
  if (new Set(evidence.map((entry) => entry.canonicalPath)).size !== evidence.length) {
    throw new Error("Each acceptance group must use a distinct evidence file.");
  }
  if (new Set(evidence.map((entry) => entry.digest)).size !== evidence.length) {
    throw new Error("Each acceptance group must use distinct evidence content.");
  }

  const checks = [];
  check(checks, "release", "Frontend, backend, and evidence use the exact candidate commit",
    input.version === INPUT_VERSION
      && input.commit === config.expectedCommit
      && input.frontendCommit === config.expectedCommit
      && input.backendCommit === config.expectedCommit);
  check(checks, "capture", "Evidence is fresh and bound to the deployed HTTPS application",
    appUrl === safeDeployedAppUrl(config.appUrl || input.appUrl)
      && Number.isFinite(capturedAt)
      && capturedAt <= nowMs + MAX_FUTURE_SKEW_MS
      && nowMs - capturedAt <= MAX_AGE_MS);
  check(checks, "provider", "The exact Venice model has a current no-training, zero-retention server proof",
    input.provider?.status === "pass"
      && input.provider?.id === "venice"
      && MODEL_PATTERN.test(input.provider?.modelId ?? "")
      && input.provider?.policyStatus === "verified_no_training"
      && input.provider?.trainingUse === "none"
      && input.provider?.retentionDays === 0
      && input.provider?.selectedFromExactProof === true
      && input.provider?.browserCredentialAbsent === true
      && Number.isFinite(verifiedAt)
      && Number.isFinite(expiresAt)
      && verifiedAt <= capturedAt
      && capturedAt < expiresAt
      && expiresAt > verifiedAt
      && expiresAt - verifiedAt <= MAX_PROOF_WINDOW_MS);
  check(checks, "ui", "All fail-closed Private control states are visible and keyboard usable",
    input.ui?.status === "pass" && allTrue(input.ui, UI_CHECKS));
  check(checks, "requests", "Private dispatch, receipts, secret blocking, reload, and tenant isolation pass",
    input.requests?.status === "pass" && allTrue(input.requests, REQUEST_CHECKS));
  check(checks, "evidence", "Provider, UI, and request evidence is distinct, redacted, and content-addressed", true);

  const blockers = checks
    .filter((entry) => entry.status === "fail")
    .map(({ id, label }) => ({ id, action: label }));
  return {
    version: OUTPUT_VERSION,
    decision: blockers.length === 0 ? "GO" : "NO-GO",
    ready: blockers.length === 0,
    commit: input.commit ?? null,
    evaluatedAt: config.now.toISOString(),
    checks,
    blockers,
  };
}

function pendingEvidence(name) {
  return { path: `reports/${name}.md`, sha256: "REPLACE_WITH_SHA256_AFTER_REDACTED_REPORT_REVIEW" };
}

function buildTemplate(config) {
  const verifiedAt = config.now.toISOString();
  return {
    version: INPUT_VERSION,
    capturedAt: verifiedAt,
    commit: config.expectedCommit,
    frontendCommit: config.expectedCommit,
    backendCommit: config.expectedCommit,
    appUrl: safeDeployedAppUrl(config.appUrl),
    provider: {
      status: "pending",
      id: "venice",
      modelId: "REPLACE_WITH_VERIFIED_MODEL_ID",
      proofVerifiedAt: verifiedAt,
      proofExpiresAt: new Date(config.now.getTime() + MAX_PROOF_WINDOW_MS).toISOString(),
      policyStatus: "pending",
      trainingUse: "pending",
      retentionDays: null,
      selectedFromExactProof: false,
      browserCredentialAbsent: false,
    },
    ui: { status: "pending", ...Object.fromEntries(UI_CHECKS.map((key) => [key, false])) },
    requests: { status: "pending", ...Object.fromEntries(REQUEST_CHECKS.map((key) => [key, false])) },
    evidence: {
      provider: pendingEvidence("venice-provider-proof"),
      ui: pendingEvidence("venice-private-ui"),
      requests: pendingEvidence("venice-private-requests"),
    },
  };
}

function writeOwnerOnly(path, content, label) {
  mkdirSync(dirname(path), { recursive: true });
  let descriptor;
  try {
    descriptor = openSync(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(descriptor, content, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error(`${label} already exists.`);
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  if (config.command === "template") {
    const template = buildTemplate(config);
    writeOwnerOnly(config.output, `${JSON.stringify(template, null, 2)}\n`, "Template output");
    process.stdout.write(`${config.output}\n`);
    return;
  }
  const input = readInputJson(config.input);
  const result = evaluate(input, config);
  if (config.jsonOutput) {
    writeOwnerOnly(config.jsonOutput, `${JSON.stringify(result, null, 2)}\n`, "Readiness output");
  }
  process.stdout.write(config.json ? `${JSON.stringify(result)}\n` : `${result.decision}\n`);
  if (config.strict && !result.ready) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`Venice Private acceptance failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
}
