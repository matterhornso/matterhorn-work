import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { isIP } from "node:net";

export const ACCEPTANCE_REPORT_VERSION = "matterhorn.crypto-coworkers-acceptance-report.v1";
export const ACCEPTANCE_REPORT_SIGNATURE_DOMAIN = "matterhorn:crypto-coworkers-acceptance-report:v1";
export const ACCEPTANCE_REPORT_PRODUCER = "matterhorn_acceptance_runner";

const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 60 * 1000;
const MAX_WINDOW_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_REPORT_BYTES = 256 * 1024;
const MAX_OUTCOMES = 64;
const MAX_ARTIFACTS = 32;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const GROUP_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const OUTCOME_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/;
const RUNNER_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{86}$/;

const FORBIDDEN_FIELD_NAMES = new Set([
  "accountid",
  "accesstoken",
  "apikey",
  "attachment",
  "attachmentbytes",
  "attachmentcontent",
  "attachments",
  "authorization",
  "bearertoken",
  "credential",
  "mnemonic",
  "password",
  "privateattachment",
  "privatekey",
  "prompt",
  "prompts",
  "rawprompt",
  "rawsignature",
  "rawtooloutput",
  "rawtooloutputs",
  "refreshtoken",
  "secret",
  "seed",
  "seedphrase",
  "sessionid",
  "signedpayload",
  "tooloutput",
  "tooloutputs",
  "userid",
  "userids",
  "walletaddress",
  "walletaddresses",
  "walletexport",
  "walletidentifier",
  "walletsignature",
  "workspaceid",
  "workspaceids",
]);

const FORBIDDEN_STRING_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:seed phrase|mnemonic|private key|wallet export)\s*[:=]\s*\S+/i,
]);

const ROOT_KEYS = Object.freeze([
  "version",
  "group",
  "release",
  "window",
  "producer",
  "outcomes",
  "artifacts",
  "attestation",
]);
const RELEASE_KEYS = Object.freeze(["commit", "appOrigin", "environment"]);
const WINDOW_KEYS = Object.freeze(["startedAt", "completedAt"]);
const PRODUCER_KEYS = Object.freeze(["kind", "runnerVersion", "runId"]);
const ARTIFACT_KEYS = Object.freeze(["kind", "sha256"]);
const ATTESTATION_KEYS = Object.freeze(["algorithm", "keyId", "signature"]);

export class MatterhornAcceptanceReportError extends Error {
  constructor(code) {
    super(code);
    this.name = "MatterhornAcceptanceReportError";
    this.code = code;
  }
}

function fail(code) {
  throw new MatterhornAcceptanceReportError(code);
}

function isRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactKeys(value, expected, code) {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value);
  if (actual.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    fail(code);
  }
}

function requireAllowedKeys(value, required, allowed, code) {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value);
  if (required.some((key) => !Object.hasOwn(value, key))
    || actual.some((key) => !allowed.includes(key))) {
    fail(code);
  }
}

function canonicalValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("acceptance_report_canonical_value_invalid");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, item]) => {
          if (item === undefined) fail("acceptance_report_canonical_value_invalid");
          return [key, canonicalValue(item)];
        }),
    );
  }
  fail("acceptance_report_canonical_value_invalid");
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function unsignedReport(report) {
  if (!isRecord(report)) fail("acceptance_report_invalid");
  return Object.fromEntries(Object.entries(report).filter(([key]) => key !== "attestation"));
}

export function canonicalAcceptanceReportPayload(report) {
  return canonicalJson({
    domain: ACCEPTANCE_REPORT_SIGNATURE_DOMAIN,
    report: unsignedReport(report),
  });
}

function reportHash(report) {
  return createHash("sha256").update(canonicalJson(report), "utf8").digest("hex");
}

function normalizeFieldName(value) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function rejectSensitiveContent(value, path = "report") {
  if (typeof value === "string") {
    if (FORBIDDEN_STRING_PATTERNS.some((pattern) => pattern.test(value))) {
      fail("acceptance_report_sensitive_content_forbidden");
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveContent(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const signatureField = path === "report.attestation" && key === "signature";
    if (signatureField) continue;
    if (!signatureField && FORBIDDEN_FIELD_NAMES.has(normalizeFieldName(key))) {
      fail("acceptance_report_sensitive_field_forbidden");
    }
    rejectSensitiveContent(item, `${path}.${key}`);
  }
}

function normalizeOrigin(value) {
  if (typeof value !== "string" || value.length > 2048) {
    fail("acceptance_report_origin_invalid");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("acceptance_report_origin_invalid");
  }
  const hostname = url.hostname.toLowerCase();
  const address = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const safe = url.protocol === "https:"
    && !url.username
    && !url.password
    && !url.search
    && !url.hash
    && (!url.port || url.port === "443")
    && (url.pathname === "" || url.pathname === "/")
    && hostname !== "localhost"
    && !hostname.endsWith(".localhost")
    && !hostname.endsWith(".local")
    && isIP(address) === 0;
  if (!safe || value !== url.origin) fail("acceptance_report_origin_invalid");
  return url.origin;
}

function parseTimestamp(value, code) {
  if (typeof value !== "string" || value.length !== 24) fail(code);
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== value) fail(code);
  return timestamp.getTime();
}

function parseReferenceTime(value, code) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) fail(code);
  return timestamp;
}

function validateOutcomes(actual, expected) {
  if (!isRecord(actual)) fail("acceptance_report_outcomes_invalid");
  if (!isRecord(expected)) fail("acceptance_report_expected_outcomes_required");
  const keys = Object.keys(actual);
  const expectedKeys = Object.keys(expected);
  if (keys.length < 1 || keys.length > MAX_OUTCOMES) fail("acceptance_report_outcomes_invalid");
  if (keys.length !== expectedKeys.length || expectedKeys.some((key) => !Object.hasOwn(actual, key))) {
    fail("acceptance_report_outcomes_mismatch");
  }
  for (const key of keys) {
    if (!OUTCOME_PATTERN.test(key) || typeof actual[key] !== "boolean") {
      fail("acceptance_report_outcomes_invalid");
    }
    if (typeof expected[key] !== "boolean" || actual[key] !== expected[key]) {
      fail("acceptance_report_outcomes_mismatch");
    }
  }
}

function validateArtifacts(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_ARTIFACTS) {
    fail("acceptance_report_artifacts_invalid");
  }
  const hashes = new Set();
  for (const artifact of value) {
    requireExactKeys(artifact, ARTIFACT_KEYS, "acceptance_report_artifact_invalid");
    if (artifact.kind !== "redacted_result" || !HASH_PATTERN.test(artifact.sha256 ?? "")) {
      fail("acceptance_report_artifact_invalid");
    }
    if (hashes.has(artifact.sha256)) fail("acceptance_report_artifact_reused");
    hashes.add(artifact.sha256);
  }
  return [...hashes];
}

function decodeSignature(value) {
  if (typeof value !== "string" || !SIGNATURE_PATTERN.test(value)) {
    fail("acceptance_report_signature_invalid");
  }
  let decoded;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    fail("acceptance_report_signature_invalid");
  }
  if (decoded.length !== 64 || decoded.toString("base64url") !== value) {
    fail("acceptance_report_signature_invalid");
  }
  return decoded;
}

function trustedPublicKey(trustedKeys, keyId) {
  if (!Array.isArray(trustedKeys) || trustedKeys.length < 1 || trustedKeys.length > 32) {
    fail("acceptance_report_keyring_invalid");
  }
  const matching = trustedKeys.filter((candidate) => candidate?.keyId === keyId);
  if (matching.length !== 1 || matching[0]?.algorithm !== "ed25519") {
    fail("acceptance_report_key_untrusted");
  }
  const source = matching[0].publicKey;
  if ((typeof source === "string" && /PRIVATE KEY/i.test(source))
    || (Buffer.isBuffer(source) && /PRIVATE KEY/i.test(source.toString("utf8")))) {
    fail("acceptance_report_key_invalid");
  }
  try {
    const key = source
      && typeof source === "object"
      && "type" in source
      && "asymmetricKeyType" in source
      ? source
      : createPublicKey(source);
    if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
      fail("acceptance_report_key_invalid");
    }
    return key;
  } catch (error) {
    if (error instanceof MatterhornAcceptanceReportError) throw error;
    fail("acceptance_report_key_invalid");
  }
}

function validateReportShape(report, options) {
  let serialized;
  try {
    serialized = JSON.stringify(report);
  } catch {
    fail("acceptance_report_invalid");
  }
  if (!serialized || Buffer.byteLength(serialized, "utf8") > MAX_REPORT_BYTES) {
    fail("acceptance_report_size_invalid");
  }
  requireExactKeys(report, ROOT_KEYS, "acceptance_report_invalid");
  requireExactKeys(report.release, RELEASE_KEYS, "acceptance_report_release_invalid");
  requireExactKeys(report.window, WINDOW_KEYS, "acceptance_report_window_invalid");
  requireExactKeys(report.producer, PRODUCER_KEYS, "acceptance_report_producer_invalid");
  requireExactKeys(report.attestation, ATTESTATION_KEYS, "acceptance_report_attestation_invalid");
  rejectSensitiveContent(report);

  if (report.version !== ACCEPTANCE_REPORT_VERSION) fail("acceptance_report_version_invalid");
  if (!GROUP_PATTERN.test(report.group ?? "") || report.group !== options.expectedGroup) {
    fail("acceptance_report_group_mismatch");
  }
  if (!COMMIT_PATTERN.test(report.release.commit ?? "")
    || report.release.commit !== options.expectedCommit) {
    fail("acceptance_report_commit_mismatch");
  }
  const origin = normalizeOrigin(report.release.appOrigin);
  if (origin !== normalizeOrigin(options.expectedAppOrigin)) fail("acceptance_report_origin_mismatch");
  const expectedEnvironment = options.expectedEnvironment ?? "deployed";
  if (report.release.environment !== "deployed" || expectedEnvironment !== "deployed") {
    fail("acceptance_report_environment_mismatch");
  }

  if (report.producer.kind !== ACCEPTANCE_REPORT_PRODUCER
    || !RUNNER_VERSION_PATTERN.test(report.producer.runnerVersion ?? "")
    || !RUN_ID_PATTERN.test(report.producer.runId ?? "")) {
    fail("acceptance_report_producer_invalid");
  }
  validateOutcomes(report.outcomes, options.expectedOutcomes);
  const artifactHashes = validateArtifacts(report.artifacts);

  if (report.attestation.algorithm !== "ed25519"
    || !KEY_ID_PATTERN.test(report.attestation.keyId ?? "")) {
    fail("acceptance_report_attestation_invalid");
  }

  return { origin, artifactHashes };
}

function validateWindow(report, options) {
  const startedAt = parseTimestamp(report.window.startedAt, "acceptance_report_window_invalid");
  const completedAt = parseTimestamp(report.window.completedAt, "acceptance_report_window_invalid");
  const capturedAt = parseReferenceTime(options.capturedAt, "acceptance_report_capture_time_invalid");
  const now = parseReferenceTime(options.now ?? new Date(), "acceptance_report_now_invalid");
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const minDurationMs = options.minDurationMs ?? 0;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || maxAgeMs > 7 * 24 * 60 * 60 * 1000) {
    fail("acceptance_report_max_age_invalid");
  }
  if (!Number.isFinite(minDurationMs) || minDurationMs < 0 || minDurationMs > 7 * 24 * 60 * 60 * 1000) {
    fail("acceptance_report_min_duration_invalid");
  }
  if (startedAt > completedAt
    || completedAt - startedAt < minDurationMs
    || completedAt - startedAt > MAX_WINDOW_DURATION_MS) {
    fail("acceptance_report_window_invalid");
  }
  if (completedAt > capturedAt + CLOCK_TOLERANCE_MS || completedAt > now + CLOCK_TOLERANCE_MS) {
    fail("acceptance_report_window_future");
  }
  if (capturedAt - completedAt > maxAgeMs || now - completedAt > maxAgeMs) {
    fail("acceptance_report_window_stale");
  }
  return { startedAt, completedAt };
}

function requireOptions(options) {
  if (!isRecord(options)) fail("acceptance_report_options_invalid");
  if (!GROUP_PATTERN.test(options.expectedGroup ?? "")) fail("acceptance_report_expected_group_invalid");
  if (!COMMIT_PATTERN.test(options.expectedCommit ?? "")) fail("acceptance_report_expected_commit_invalid");
  normalizeOrigin(options.expectedAppOrigin);
  if (!Object.hasOwn(options, "capturedAt")) fail("acceptance_report_capture_time_invalid");
}

export function verifyCryptoCoworkersAcceptanceReport(report, options) {
  requireOptions(options);
  const { origin, artifactHashes } = validateReportShape(report, options);
  const { startedAt, completedAt } = validateWindow(report, options);
  const signature = decodeSignature(report.attestation.signature);
  const key = trustedPublicKey(options.trustedKeys, report.attestation.keyId);
  const verified = verifySignature(
    null,
    Buffer.from(canonicalAcceptanceReportPayload(report), "utf8"),
    key,
    signature,
  );
  if (!verified) fail("acceptance_report_signature_invalid");

  return Object.freeze({
    version: ACCEPTANCE_REPORT_VERSION,
    group: report.group,
    commit: report.release.commit,
    appOrigin: origin,
    environment: "deployed",
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    runnerVersion: report.producer.runnerVersion,
    runId: report.producer.runId,
    keyId: report.attestation.keyId,
    outcomes: Object.freeze({ ...report.outcomes }),
    artifactHashes: Object.freeze([...artifactHashes]),
    reportHash: reportHash(report),
    attestationHash: createHash("sha256").update(signature).digest("hex"),
  });
}

function rejectReuse(seen, value, code) {
  if (seen.has(value)) fail(code);
  seen.add(value);
}

export function verifyCryptoCoworkersAcceptanceReportSet(entries, options) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 64) {
    fail("acceptance_report_set_invalid");
  }
  const groups = new Set();
  const runIds = new Set();
  const reportHashes = new Set();
  const attestations = new Set();
  const artifactHashes = new Set();
  return Object.freeze(entries.map((entry) => {
    if (!isRecord(entry)) fail("acceptance_report_set_invalid");
    requireAllowedKeys(
      entry,
      ["report", "expectedGroup", "expectedOutcomes"],
      ["report", "expectedGroup", "expectedOutcomes", "maxAgeMs", "minDurationMs"],
      "acceptance_report_set_invalid",
    );
    const verified = verifyCryptoCoworkersAcceptanceReport(entry.report, {
      ...options,
      expectedGroup: entry.expectedGroup,
      expectedOutcomes: entry.expectedOutcomes,
      maxAgeMs: entry.maxAgeMs,
      minDurationMs: entry.minDurationMs,
    });
    rejectReuse(groups, verified.group, "acceptance_report_group_reused");
    rejectReuse(runIds, verified.runId, "acceptance_report_run_reused");
    rejectReuse(reportHashes, verified.reportHash, "acceptance_report_hash_reused");
    rejectReuse(attestations, verified.attestationHash, "acceptance_report_signature_reused");
    verified.artifactHashes.forEach((hash) => rejectReuse(artifactHashes, hash, "acceptance_report_artifact_reused"));
    return verified;
  }));
}
