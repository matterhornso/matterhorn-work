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
import { fileURLToPath } from "node:url";

const INPUT_VERSION = "matterhorn.crypto-coworkers-acceptance-evidence.v1";
const OUTPUT_VERSION = "matterhorn.crypto-coworkers-acceptance-readiness.v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const SDK_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SDK_PROVENANCE_VERSION = "matterhorn.crypto-app-sdk-provenance.v1";
const SDK_PACKAGE = "@matterhorn-work/crypto-app-sdk";
const SDK_REGISTRY = "https://registry.npmjs.org/";
const SDK_REPOSITORY = "https://github.com/matterhornso/matterhorn-work";
const SDK_WORKFLOW = ".github/workflows/publish-crypto-app-sdk.yml";
const SDK_BUILDER = "https://github.com/actions/runner/github-hosted";
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN_KEYS = new Set([
  "token",
  "authorization",
  "apikey",
  "secret",
  "password",
  "privatekey",
  "seed",
  "seedphrase",
  "mnemonic",
  "rawsignature",
  "signedpayload",
  "walletexport",
  "sessionkey",
  "sessiontoken",
  "accesstoken",
  "refreshtoken",
  "authtoken",
]);
const FORBIDDEN_EVIDENCE_PATTERNS = Object.freeze([
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*\b/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /["'](?:apiKey|secret|password|privateKey|seedPhrase|mnemonic|rawSignature|signedPayload|walletExport)["']\s*:\s*["'][^"']+["']/i,
  /\b(?:seed phrase|mnemonic|private key|wallet export)\s*[:=]\s*\S+/i,
]);

const COWORKER_SCENARIOS = Object.freeze({
  marketAnalyst: ["publicResearch", "citationsPreserved"],
  riskMonitor: ["watchCreated", "alertCannotSubmit"],
  transactionCoordinator: ["prepareOnly", "walletReviewRequired"],
  treasuryCoworker: ["structuredState", "noWalletAuthority"],
});

const COWORKER_COMMON = Object.freeze([
  "created",
  "explicitResourceGrant",
  "modelCompletion",
  "runReceipt",
  "tokenBudgetEnforced",
  "pauseBlocksNewWork",
  "revokeBlocksNewWork",
  "crossTenantBlocked",
]);

const CERTIFICATION_SCENARIOS = Object.freeze({
  sui: {
    network: "sui-testnet",
    required: ["liveRead", "financialSimulation", "sealedRuntimeReport", "promoted", "revisionPinned", "noSubmitAuthority"],
  },
  hyperliquid: {
    network: "testnet",
    required: ["liveRead", "orderPreview", "sealedRuntimeReport", "promoted", "revisionPinned", "noSubmitAuthority"],
  },
  bittensor: {
    network: "test",
    required: ["pythonSdkSidecar", "liveRead", "transferPreview", "stakePreview", "unstakePreview", "sealedRuntimeReport", "promoted", "revisionPinned", "noSubmitAuthority"],
  },
  polymarket: {
    network: "mainnet-public-readonly",
    required: ["signedManifests", "liveDiscovery", "liveOrderbook", "sealedRuntimeReport", "promoted", "revisionPinned", "noCredentialAuthority", "noTransactionAuthority"],
  },
});

const TRANSACTION_SCENARIOS = Object.freeze({
  sui: {
    network: "sui-testnet",
    required: ["prepare", "simulate", "reject", "expire", "tamperBlocked", "refresh", "walletOnly", "receiptReconciled"],
  },
  hyperliquid: {
    network: "testnet",
    required: ["prepare", "simulate", "reject", "expire", "tamperBlocked", "refresh", "walletOnly", "receiptReconciled"],
  },
  bittensor: {
    network: "test",
    required: ["transferPreview", "stakePreview", "unstakePreview", "reject", "expire", "tamperBlocked", "refresh", "walletOnly", "receiptReconciled"],
  },
  polymarket: {
    network: "mainnet-public-readonly",
    required: ["discovery", "orderbook", "regionDisclosure", "transactionAuthorityAbsent", "safeDeferralVisible"],
  },
});

function parseArgs(argv) {
  const command = argv[0] === "template" ? "template" : "evaluate";
  const config = {
    command,
    evidence: "",
    expectedCommit: "",
    appUrl: "",
    output: "",
    now: new Date(),
    strict: false,
    json: false,
    jsonOutput: "",
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
    if (arg === "--evidence") config.evidence = resolve(next());
    else if (arg === "--expected-commit") config.expectedCommit = next().toLowerCase();
    else if (arg === "--app-url") config.appUrl = next();
    else if (arg === "--output") config.output = resolve(next());
    else if (arg === "--now") config.now = new Date(next());
    else if (arg === "--json-output") config.jsonOutput = resolve(next());
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json") config.json = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!config.help && command === "evaluate" && !config.evidence) throw new Error("--evidence is required.");
  if (!config.help && !COMMIT_PATTERN.test(config.expectedCommit)) {
    throw new Error("--expected-commit must be a full 40-character Git SHA.");
  }
  if (!config.help && command === "template") {
    if (!config.output) throw new Error("template requires --output.");
    if (!config.appUrl) throw new Error("template requires --app-url.");
  }
  if (!config.help && command === "evaluate" && config.output) {
    throw new Error("Use --json-output when evaluating evidence.");
  }
  if (!Number.isFinite(config.now.getTime())) throw new Error("--now must be a valid timestamp.");
  return config;
}

function help() {
  return [
    "Matterhorn Guarded Crypto Coworkers acceptance gate",
    "",
    "Binds live certification, coworker, wallet-airlock, encrypted-evidence, developer-platform,",
    "tenant-isolation, recovery, and shadow-rollout outcomes to one exact release commit.",
    "Evidence files are referenced by relative path and exact SHA-256. Credentials, signing material,",
    "wallet exports, private keys, and session tokens are forbidden from the evidence manifest.",
    "",
    "Usage:",
    "  pnpm template:crypto-coworkers-acceptance -- --expected-commit <sha> --app-url https://app.example --output acceptance.json",
    "  pnpm gate:crypto-coworkers-acceptance -- --evidence acceptance.json --expected-commit <sha> --json --strict",
  ].join("\n");
}

function safeDeployedAppUrl(value) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const address = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  const deployed = url.protocol === "https:"
    && !url.username
    && !url.password
    && !url.search
    && !url.hash
    && (!url.port || url.port === "443")
    && hostname !== "localhost"
    && !hostname.endsWith(".localhost")
    && !hostname.endsWith(".local")
    && isIP(address) === 0;
  if (!deployed) {
    throw new Error("--app-url must be a credential-free deployed HTTPS URL.");
  }
  return url.toString();
}

function pendingFields(keys) {
  return Object.fromEntries(keys.map((key) => [key, false]));
}

function pendingEvidence(name) {
  return {
    path: `reports/${name}.md`,
    sha256: "REPLACE_WITH_SHA256_AFTER_REDACTED_REPORT_REVIEW",
  };
}

function buildPendingTemplate(config) {
  const expected = expectedRuntime();
  return {
    version: INPUT_VERSION,
    capturedAt: config.now.toISOString(),
    commit: config.expectedCommit,
    environment: "deployed",
    appUrl: safeDeployedAppUrl(config.appUrl),
    runtime: {
      status: "pending",
      openworkVersion: expected.openwork.version,
      openworkCommit: expected.openwork.commit,
      opencodeVersion: expected.opencode.version,
      opencodeCommit: expected.opencode.commit,
      opencodeSdkVersion: expected.opencode.sdkVersion,
      permissionDenyByDefault: false,
      evidence: pendingEvidence("runtime"),
    },
    certifications: Object.fromEntries(Object.entries(CERTIFICATION_SCENARIOS).map(([id, scenario]) => [id, {
      status: "pending",
      network: scenario.network,
      ...pendingFields(scenario.required),
      evidence: pendingEvidence(`certification-${id}`),
    }])),
    coworkers: Object.fromEntries(Object.entries(COWORKER_SCENARIOS).map(([id, required]) => [id, {
      status: "pending",
      ...pendingFields([...COWORKER_COMMON, ...required]),
      evidence: pendingEvidence(`coworker-${id}`),
    }])),
    transactions: Object.fromEntries(Object.entries(TRANSACTION_SCENARIOS).map(([id, scenario]) => [id, {
      status: "pending",
      network: scenario.network,
      ...pendingFields(scenario.required),
      evidence: pendingEvidence(`transaction-${id}`),
    }])),
    encryptedEvidence: {
      status: "pending",
      ...pendingFields([
        "explicitOptIn", "ciphertextOnly", "exactReadback", "suiCertification",
        "tamperBlocked", "renewalWalletOnly", "expiryBlocked", "deleted",
        "recoveryKeyDestroyed", "publicScanNonIdentifying", "restoreDrill", "erasureLedgerVerified",
        "anchorWalletOnly", "anchorExactBinding", "anchorImmutable",
        "anchorMutationBlocked", "anchorReplayBlocked", "anchorPublicScanNonIdentifying",
      ]),
      evidence: pendingEvidence("walrus-sui-evidence"),
    },
    developerPlatform: {
      status: "pending",
      ...pendingFields([
        "quickstartUnder30Minutes", "localConformance", "signedRevision",
        "failedOutcomeVisible", "passedOutcomeVisible", "inviteSingleUse",
        "connectionWithoutChatCredentials", "codexGuardedClient", "claudeCodeGuardedClient",
        "genericMcpGuardedClient", "meteringTenantSafe", "sdkPackageGate", "sdkPublished",
        "packageProvenanceVerified",
      ]),
      evidence: pendingEvidence("developer-platform"),
      sdkProvenance: {
        path: "reports/crypto-app-sdk-provenance.json",
        sha256: "REPLACE_WITH_SHA256_AFTER_REDACTED_REPORT_REVIEW",
      },
    },
    designPartners: {
      status: "pending",
      count: 0,
      inviteOnly: false,
      noChatCredentials: false,
      noWalletAuthority: false,
      evidence: pendingEvidence("design-partners"),
    },
    rollout: {
      status: "pending",
      mode: "shadow",
      hours: 0,
      unexplainedDenials: 0,
      allBypassesReviewed: false,
      rollbackProven: false,
      sequentialProtocolReview: false,
      evidence: pendingEvidence("shadow-rollout"),
    },
    operations: {
      status: "pending",
      ...pendingFields([
        "twoAccountIsolation", "tenantExportIsolation", "hostBackupRestore", "deletionResume",
        "privacyFirewall", "capabilityAdversarial", "accessibility", "responsive", "performance", "rollback",
      ]),
      evidence: pendingEvidence("hosted-operations"),
    },
  };
}

function writeOwnerOnlyFile(path, content, label) {
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

function writePendingTemplate(config) {
  const template = buildPendingTemplate(config);
  rejectSensitiveKeys(template);
  validateClosedInput(template);
  writeOwnerOnlyFile(config.output, `${JSON.stringify(template, null, 2)}\n`, "Template output");
  return template;
}

function rejectSensitiveKeys(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (FORBIDDEN_KEYS.has(normalizedKey)) {
      throw new Error(`Credential or signing material is not allowed in acceptance evidence: ${path}.${key}`);
    }
    rejectSensitiveKeys(item, `${path}.${key}`);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function relativePathEscapesBase(offset) {
  return !offset || offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset);
}

function resolveEvidenceTarget(referencePath, evidencePath) {
  const base = resolve(dirname(evidencePath));
  const target = resolve(base, referencePath);
  const offset = relative(base, target);
  if (relativePathEscapesBase(offset)) return null;

  // O_NOFOLLOW protects only the final path component. Reject every symlink in
  // the report path as well so a linked parent cannot escape the packet.
  let cursor = base;
  for (const component of offset.split(sep)) {
    cursor = resolve(cursor, component);
    if (lstatSync(cursor).isSymbolicLink()) return null;
  }

  const canonicalBase = realpathSync(base);
  const canonicalTarget = realpathSync(target);
  if (relativePathEscapesBase(relative(canonicalBase, canonicalTarget))) return null;
  return { target, canonicalTarget };
}

function readEvidenceReference(reference, evidencePath) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) return null;
  if (Object.keys(reference).some((key) => !["path", "sha256"].includes(key))) return null;
  if (typeof reference.path !== "string" || !reference.path.trim() || isAbsolute(reference.path)) return null;
  if (!HASH_PATTERN.test(reference.sha256 ?? "")) return null;
  let descriptor;
  try {
    const resolved = resolveEvidenceTarget(reference.path, evidencePath);
    if (!resolved) return null;
    const { target, canonicalTarget } = resolved;
    descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_EVIDENCE_BYTES) return null;
    const pathStat = lstatSync(target);
    if (pathStat.isSymbolicLink() || pathStat.dev !== stat.dev || pathStat.ino !== stat.ino) return null;
    const content = readFileSync(descriptor);
    if (sha256(content) !== reference.sha256.toLowerCase()) return null;
    const text = content.toString("utf8");
    if (FORBIDDEN_EVIDENCE_PATTERNS.some((pattern) => pattern.test(text))) return null;
    const finalPathStat = lstatSync(target);
    if (finalPathStat.isSymbolicLink() || finalPathStat.dev !== stat.dev || finalPathStat.ino !== stat.ino) return null;
    if (realpathSync(target) !== canonicalTarget) return null;
    return content;
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function evidenceReferenceReady(reference, evidencePath) {
  return Buffer.isBuffer(readEvidenceReference(reference, evidencePath));
}

function readAcceptanceManifest(path) {
  let descriptor;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_EVIDENCE_BYTES) {
      throw new Error("Acceptance evidence must be a non-empty regular file no larger than 5 MiB.");
    }
    return JSON.parse(readFileSync(descriptor, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ELOOP") {
      throw new Error("Acceptance evidence must be a regular non-symlink file.");
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function exactKeys(value, keys) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function sdkProvenanceReady(reference, evidencePath, expectedCommit) {
  const content = readEvidenceReference(reference, evidencePath);
  if (!Buffer.isBuffer(content)) return false;
  try {
    const report = JSON.parse(content.toString("utf8"));
    rejectSensitiveKeys(report, "sdkProvenance");
    if (!exactKeys(report, ["version", "decision", "package", "source", "checks"])) return false;
    if (!exactKeys(report.package, ["name", "version", "registry", "integrity"])) return false;
    if (!exactKeys(report.source, ["repository", "commit", "workflow", "workflowRef", "builder", "invocation"])) return false;
    if (!exactKeys(report.checks, [
      "registrySignature",
      "publishAttestation",
      "provenanceAttestation",
      "transparencyLog",
      "lifecycleScripts",
    ])) return false;
    const invocationPattern = /^https:\/\/github\.com\/matterhornso\/matterhorn-work\/actions\/runs\/[1-9]\d*\/attempts\/[1-9]\d*$/;
    return report.version === SDK_PROVENANCE_VERSION
      && report.decision === "GO"
      && report.package.name === SDK_PACKAGE
      && SDK_VERSION_PATTERN.test(report.package.version ?? "")
      && report.package.registry === SDK_REGISTRY
      && report.package.integrity === "sha512"
      && report.source.repository === SDK_REPOSITORY
      && report.source.commit === expectedCommit
      && report.source.workflow === SDK_WORKFLOW
      && typeof report.source.workflowRef === "string"
      && report.source.workflowRef.startsWith("refs/")
      && report.source.builder === SDK_BUILDER
      && invocationPattern.test(report.source.invocation ?? "")
      && report.checks.registrySignature === "verified"
      && report.checks.publishAttestation === "verified"
      && report.checks.provenanceAttestation === "verified"
      && report.checks.transparencyLog === "verified"
      && report.checks.lifecycleScripts === "disabled_during_verification";
  } catch {
    return false;
  }
}

function allTrue(value, keys) {
  return keys.every((key) => value?.[key] === true);
}

function onlyKeys(value, allowed, path) {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${path} contains unsupported fields.`);
}

function validateClosedInput(input) {
  onlyKeys(input, [
    "version", "capturedAt", "commit", "environment", "appUrl", "runtime",
    "certifications", "coworkers", "transactions", "encryptedEvidence",
    "developerPlatform", "designPartners", "rollout", "operations",
  ], "evidence");
  onlyKeys(input.runtime, [
    "status", "openworkVersion", "openworkCommit", "opencodeVersion", "opencodeCommit",
    "opencodeSdkVersion", "permissionDenyByDefault", "evidence",
  ], "evidence.runtime");

  onlyKeys(input.certifications, Object.keys(CERTIFICATION_SCENARIOS), "evidence.certifications");
  for (const [id, scenario] of Object.entries(CERTIFICATION_SCENARIOS)) {
    onlyKeys(input.certifications?.[id], ["status", "network", ...scenario.required, "evidence"], `evidence.certifications.${id}`);
  }

  onlyKeys(input.coworkers, Object.keys(COWORKER_SCENARIOS), "evidence.coworkers");
  for (const [id, fields] of Object.entries(COWORKER_SCENARIOS)) {
    onlyKeys(input.coworkers?.[id], ["status", ...COWORKER_COMMON, ...fields, "evidence"], `evidence.coworkers.${id}`);
  }

  onlyKeys(input.transactions, Object.keys(TRANSACTION_SCENARIOS), "evidence.transactions");
  for (const [id, scenario] of Object.entries(TRANSACTION_SCENARIOS)) {
    onlyKeys(input.transactions?.[id], ["status", "network", ...scenario.required, "evidence"], `evidence.transactions.${id}`);
  }

  onlyKeys(input.encryptedEvidence, [
    "status", "explicitOptIn", "ciphertextOnly", "exactReadback", "suiCertification",
    "tamperBlocked", "renewalWalletOnly", "expiryBlocked", "deleted", "recoveryKeyDestroyed",
    "publicScanNonIdentifying", "restoreDrill", "erasureLedgerVerified", "evidence",
    "anchorWalletOnly", "anchorExactBinding", "anchorImmutable",
    "anchorMutationBlocked", "anchorReplayBlocked", "anchorPublicScanNonIdentifying",
  ], "evidence.encryptedEvidence");
  onlyKeys(input.developerPlatform, [
    "status", "quickstartUnder30Minutes", "localConformance", "signedRevision",
    "failedOutcomeVisible", "passedOutcomeVisible", "inviteSingleUse",
    "connectionWithoutChatCredentials", "codexGuardedClient", "claudeCodeGuardedClient",
    "genericMcpGuardedClient", "meteringTenantSafe", "sdkPackageGate", "sdkPublished",
    "packageProvenanceVerified", "evidence", "sdkProvenance",
  ], "evidence.developerPlatform");
  onlyKeys(input.designPartners, [
    "status", "count", "inviteOnly", "noChatCredentials", "noWalletAuthority", "evidence",
  ], "evidence.designPartners");
  onlyKeys(input.rollout, [
    "status", "mode", "hours", "unexplainedDenials", "allBypassesReviewed",
    "rollbackProven", "sequentialProtocolReview", "evidence",
  ], "evidence.rollout");
  onlyKeys(input.operations, [
    "status", "twoAccountIsolation", "tenantExportIsolation", "hostBackupRestore",
    "deletionResume", "privacyFirewall", "capabilityAdversarial", "accessibility",
    "responsive", "performance", "rollback", "evidence",
  ], "evidence.operations");
}

function acceptanceEvidenceReferences(input) {
  return [
    ["runtime", input.runtime?.evidence],
    ...Object.keys(CERTIFICATION_SCENARIOS).map((id) => [
      `certifications.${id}`,
      input.certifications?.[id]?.evidence,
    ]),
    ...Object.keys(COWORKER_SCENARIOS).map((id) => [
      `coworkers.${id}`,
      input.coworkers?.[id]?.evidence,
    ]),
    ...Object.keys(TRANSACTION_SCENARIOS).map((id) => [
      `transactions.${id}`,
      input.transactions?.[id]?.evidence,
    ]),
    ["encryptedEvidence", input.encryptedEvidence?.evidence],
    ["developerPlatform", input.developerPlatform?.evidence],
    ["developerPlatform.sdkProvenance", input.developerPlatform?.sdkProvenance],
    ["designPartners", input.designPartners?.evidence],
    ["rollout", input.rollout?.evidence],
    ["operations", input.operations?.evidence],
  ];
}

function validateIndependentEvidenceReferences(input, evidencePath) {
  const pathOwners = new Map();
  const hashOwners = new Map();
  for (const [label, reference] of acceptanceEvidenceReferences(input)) {
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) continue;
    if (typeof reference.path === "string" && reference.path.trim() && !isAbsolute(reference.path)) {
      const canonicalCandidate = resolve(dirname(evidencePath), reference.path);
      const prior = pathOwners.get(canonicalCandidate);
      if (prior) throw new Error(`Acceptance evidence report is reused by ${prior} and ${label}.`);
      pathOwners.set(canonicalCandidate, label);
    }
    if (HASH_PATTERN.test(reference.sha256 ?? "")) {
      const normalizedHash = reference.sha256.toLowerCase();
      const prior = hashOwners.get(normalizedHash);
      if (prior) throw new Error(`Acceptance evidence content is reused by ${prior} and ${label}.`);
      hashOwners.set(normalizedHash, label);
    }
  }
}

function check(checks, id, gate, label, pass, evidence = null) {
  checks.push({
    id,
    gate,
    label,
    status: pass ? "pass" : "fail",
    evidence: evidence?.path ?? null,
    evidenceSha256: evidence?.sha256 ?? null,
  });
}

function scenarioPass(item, required, evidencePath) {
  return item?.status === "pass"
    && allTrue(item, required)
    && evidenceReferenceReady(item.evidence, evidencePath);
}

function expectedRuntime() {
  const constants = JSON.parse(readFileSync(resolve(scriptRoot, "constants.json"), "utf8"));
  const upstream = JSON.parse(readFileSync(resolve(scriptRoot, "upstream-compatibility.json"), "utf8"));
  return {
    openwork: {
      version: constants.openworkUpstreamVersion,
      commit: upstream.openwork?.commit,
    },
    opencode: {
      version: `v${String(constants.opencodeVersion ?? "").replace(/^v/, "")}`,
      commit: upstream.opencode?.commit,
      sdkVersion: String(constants.opencodeVersion ?? "").replace(/^v/, ""),
    },
  };
}

function evaluate(input, config) {
  if (input.version !== INPUT_VERSION) throw new Error(`Evidence version must be ${INPUT_VERSION}.`);
  rejectSensitiveKeys(input);
  validateClosedInput(input);
  validateIndependentEvidenceReferences(input, config.evidence);

  const checks = [];
  const capturedAt = new Date(input.capturedAt);
  const fresh = Number.isFinite(capturedAt.getTime())
    && config.now.getTime() >= capturedAt.getTime() - 60_000
    && config.now.getTime() - capturedAt.getTime() <= MAX_AGE_MS;
  let deployed = false;
  try {
    safeDeployedAppUrl(input.appUrl);
    deployed = true;
  } catch {
    deployed = false;
  }

  check(checks, "exact_commit", "release.exact_commit", "Acceptance identifies the exact candidate commit", input.commit === config.expectedCommit);
  check(checks, "fresh_evidence", "release.freshness", "Acceptance evidence is no more than 12 hours old", fresh);
  check(checks, "deployed_https", "release.deployed_https", "Acceptance ran against a credential-free deployed HTTPS URL", input.environment === "deployed" && deployed);

  const expected = expectedRuntime();
  const runtime = input.runtime;
  check(
    checks,
    "runtime_compatibility",
    "runtime.pinned_compatibility",
    `Deployed runtime proves ${expected.openwork.version} with ${expected.opencode.version} and the matching SDK`,
    runtime?.status === "pass"
      && runtime.openworkVersion === expected.openwork.version
      && runtime.openworkCommit === expected.openwork.commit
      && runtime.opencodeVersion === expected.opencode.version
      && runtime.opencodeCommit === expected.opencode.commit
      && runtime.opencodeSdkVersion === expected.opencode.sdkVersion
      && runtime.permissionDenyByDefault === true
      && evidenceReferenceReady(runtime.evidence, config.evidence),
    runtime?.evidence,
  );

  for (const [id, scenario] of Object.entries(CERTIFICATION_SCENARIOS)) {
    const item = input.certifications?.[id];
    check(
      checks,
      `certification_${id}`,
      `gateway.${id}_certification`,
      `${id} has a sealed, promoted, authority-bounded live certification for the exact network and revision`,
      item?.network === scenario.network && scenarioPass(item, scenario.required, config.evidence),
      item?.evidence,
    );
  }

  for (const [id, roleRequired] of Object.entries(COWORKER_SCENARIOS)) {
    const item = input.coworkers?.[id];
    check(
      checks,
      `coworker_${id}`,
      `coworkers.${id}`,
      `${id} completes chat, explicit resource access, receipt, budget, lifecycle, and isolation acceptance`,
      scenarioPass(item, [...COWORKER_COMMON, ...roleRequired], config.evidence),
      item?.evidence,
    );
  }

  for (const [id, scenario] of Object.entries(TRANSACTION_SCENARIOS)) {
    const item = input.transactions?.[id];
    check(
      checks,
      `transaction_${id}`,
      `transactions.${id}_airlock`,
      `${id} proves its supported exact-network transaction-airlock or explicit safe read-only boundary`,
      item?.network === scenario.network && scenarioPass(item, scenario.required, config.evidence),
      item?.evidence,
    );
  }

  const encryptedEvidence = input.encryptedEvidence;
  check(
    checks,
    "encrypted_evidence_lifecycle",
    "evidence.walrus_sui_lifecycle",
    "Agent Files and run evidence pass opt-in ciphertext publication, verification, wallet-only immutable anchoring, renewal, expiry, deletion, key destruction, public scan, and restore",
    scenarioPass(encryptedEvidence, [
      "explicitOptIn",
      "ciphertextOnly",
      "exactReadback",
      "suiCertification",
      "tamperBlocked",
      "renewalWalletOnly",
      "expiryBlocked",
      "deleted",
      "recoveryKeyDestroyed",
      "publicScanNonIdentifying",
      "restoreDrill",
      "erasureLedgerVerified",
      "anchorWalletOnly",
      "anchorExactBinding",
      "anchorImmutable",
      "anchorMutationBlocked",
      "anchorReplayBlocked",
      "anchorPublicScanNonIdentifying",
    ], config.evidence),
    encryptedEvidence?.evidence,
  );

  const developer = input.developerPlatform;
  check(
    checks,
    "developer_platform",
    "developer.invite_platform",
    "Developer quickstart, certification, invite, guarded MCP clients, package provenance, and private metering pass",
    scenarioPass(developer, [
      "quickstartUnder30Minutes",
      "localConformance",
      "signedRevision",
      "failedOutcomeVisible",
      "passedOutcomeVisible",
      "inviteSingleUse",
      "connectionWithoutChatCredentials",
      "codexGuardedClient",
      "claudeCodeGuardedClient",
      "genericMcpGuardedClient",
      "meteringTenantSafe",
      "sdkPackageGate",
      "sdkPublished",
      "packageProvenanceVerified",
    ], config.evidence)
      && sdkProvenanceReady(developer?.sdkProvenance, config.evidence, config.expectedCommit),
    developer?.evidence,
  );

  const partners = input.designPartners;
  check(
    checks,
    "design_partners",
    "rollout.design_partners",
    "Three to five design-partner apps complete invite-only onboarding without chat credentials or wallet authority",
    partners?.status === "pass"
      && Number.isInteger(partners.count)
      && partners.count >= 3
      && partners.count <= 5
      && allTrue(partners, ["inviteOnly", "noChatCredentials", "noWalletAuthority"])
      && evidenceReferenceReady(partners.evidence, config.evidence),
    partners?.evidence,
  );

  const rollout = input.rollout;
  check(
    checks,
    "shadow_rollout",
    "rollout.shadow_window",
    "An uninterrupted 48-hour invite-only shadow window completes with no unexplained denials and a proven rollback",
    rollout?.status === "pass"
      && rollout.mode === "shadow"
      && Number.isFinite(rollout.hours)
      && rollout.hours >= 48
      && rollout.unexplainedDenials === 0
      && allTrue(rollout, ["allBypassesReviewed", "rollbackProven", "sequentialProtocolReview"])
      && evidenceReferenceReady(rollout.evidence, config.evidence),
    rollout?.evidence,
  );

  const operations = input.operations;
  check(
    checks,
    "hosted_operations",
    "operations.hosted_acceptance",
    "Hosted two-account isolation, backup/restore, deletion, privacy, accessibility, responsive, performance, and rollback gates pass",
    scenarioPass(operations, [
      "twoAccountIsolation",
      "tenantExportIsolation",
      "hostBackupRestore",
      "deletionResume",
      "privacyFirewall",
      "capabilityAdversarial",
      "accessibility",
      "responsive",
      "performance",
      "rollback",
    ], config.evidence),
    operations?.evidence,
  );

  const blockers = checks
    .filter((item) => item.status === "fail")
    .map(({ id, gate, label }) => ({ id, gate, action: label }));
  return {
    version: OUTPUT_VERSION,
    decision: blockers.length === 0 ? "GO" : "NO-GO",
    ready: blockers.length === 0,
    commit: input.commit ?? null,
    evaluatedAt: config.now.toISOString(),
    runtime: expected,
    checks,
    blockers,
  };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  if (config.command === "template") {
    const template = writePendingTemplate(config);
    if (config.json) process.stdout.write(`${JSON.stringify(template, null, 2)}\n`);
    else process.stdout.write(`Pending acceptance template written to ${config.output}.\n`);
    return;
  }
  const input = readAcceptanceManifest(config.evidence);
  const report = evaluate(input, config);
  if (config.jsonOutput) {
    writeOwnerOnlyFile(
      config.jsonOutput,
      `${JSON.stringify(report, null, 2)}\n`,
      "Readiness output",
    );
  }
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Guarded Crypto Coworkers acceptance: ${report.decision}\n`);
  if (config.strict && !report.ready) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
