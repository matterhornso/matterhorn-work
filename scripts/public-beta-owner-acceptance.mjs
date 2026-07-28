#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const INPUT_VERSION = "matterhorn.public-beta-owner-acceptance-input.v1";
const REPORT_VERSION = "matterhorn.public-beta-owner-acceptance.v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const scriptRoot = dirname(fileURLToPath(import.meta.url));

const REPORT_VERSIONS = Object.freeze({
  candidate: "matterhorn.public-beta-candidate-certifier.v1",
  ownerApproval: "matterhorn.release-owner-approval.v1",
  deployment: "matterhorn.product-hunt-deployment-probe.v1",
  operations: "matterhorn.product-hunt-operations-readiness.v2",
  acceptance: "matterhorn.product-hunt-acceptance-readiness.v1",
  desktop: "matterhorn.desktop-public-release-verification.v1",
});

function parseArgs(argv) {
  const config = {
    input: "",
    outputDir: "",
    repoRoot: process.cwd(),
    now: new Date(),
    strict: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--input") config.input = next();
    else if (arg === "--output-dir") config.outputDir = next();
    else if (arg === "--repo-root") config.repoRoot = next();
    else if (arg === "--now") config.now = new Date(next());
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json") config.json = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!config.help) {
    if (!config.input) throw new Error("--input is required.");
    if (!config.outputDir) throw new Error("--output-dir is required.");
    if (Number.isNaN(config.now.getTime())) throw new Error("--now must be an ISO date-time.");
  }
  return config;
}

function help() {
  return [
    "Matterhorn Public Beta owner acceptance",
    "",
    "Binds the certified candidate, deployed web probe, operations drill, real",
    "wallet/OAuth acceptance, signed desktop verification, and human approvals",
    "to one immutable commit and one fail-closed Public Beta decision.",
    "",
    "The input contains evidence references and outcomes only. Never put API keys,",
    "wallet secrets, signing credentials, session tokens, or raw signatures in it.",
    "",
    "Usage:",
    "  pnpm public-beta:owner-acceptance -- --input owner-input.json --output-dir qa-reports/public-beta/final --strict --json",
  ].join("\n");
}

function rejectSecrets(value, path = "input") {
  if (typeof value === "string") {
    if (/(?:^|\s)(?:Bearer\s+\S{16,}|(?:sk|pk|rk|ghp|xoxb)[-_][A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|0x[a-f0-9]{128,})(?:\s|$)/i.test(value)) {
      throw new Error(`Credential or signing material is not allowed in ${path}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSecrets(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:token|authorization|password|passphrase|api[-_]?key|api[-_]?secret|client[-_]?secret|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signed[-_]?payload|wallet[-_]?export)$/i.test(key)) {
      throw new Error(`Credential or signing material is not allowed: ${path}.${key}`);
    }
    rejectSecrets(entry, `${path}.${key}`);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function present(value) {
  return typeof value === "string"
    ? value.trim().length > 0
    : value !== undefined && value !== null;
}

function isFresh(value, now) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    && now.getTime() >= date.getTime() - 60_000
    && now.getTime() - date.getTime() <= MAX_AGE_MS;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    const sensitiveQuery = [...url.searchParams.keys()].some((key) => (
      /token|authorization|api.?key|secret|signature|credential/i.test(key)
    ));
    return url.protocol === "https:" && !url.username && !url.password && !sensitiveQuery;
  } catch {
    return false;
  }
}

function resolveLocalPath(reference, bases) {
  if (isAbsolute(reference)) return reference;
  for (const base of bases) {
    const candidate = resolve(base, reference);
    if (existsSync(candidate)) return candidate;
  }
  return resolve(bases[0], reference);
}

function evidenceReference(reference, bases) {
  if (!present(reference)) return { ok: false, display: null };
  const value = String(reference).trim();
  if (safeHttpsUrl(value)) return { ok: true, display: value };
  const path = resolveLocalPath(value, bases);
  const ok = existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
  return { ok, display: value };
}

function readJsonReference(label, reference, bases) {
  if (!present(reference)) throw new Error(`${label} report path is required.`);
  const path = resolveLocalPath(String(reference).trim(), bases);
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`${label} report does not exist: ${reference}`);
  }
  const source = readFileSync(path, "utf8");
  const value = JSON.parse(source);
  rejectSecrets(value, label);
  return { path, source, value };
}

function check(id, gate, label, passed, evidence, note = null) {
  return {
    id,
    gate,
    label,
    status: passed ? "pass" : "fail",
    evidence: present(evidence) ? evidence : null,
    note,
    passed,
  };
}

function checkMap(report) {
  return new Map((report?.checks ?? []).map((entry) => [entry.id, entry]));
}

function reportChecksPass(report, ids) {
  const byId = checkMap(report);
  return ids.every((id) => byId.get(id)?.status === "pass");
}

function allChecksWithPrefixPass(report, prefixes) {
  const entries = report?.checks ?? [];
  const matches = entries.filter((entry) => prefixes.some((prefix) => entry.id.startsWith(prefix)));
  return matches.length > 0 && matches.every((entry) => entry.status === "pass");
}

function reportEvidencePasses(report, ids, bases) {
  const byId = checkMap(report);
  return ids.every((id) => evidenceReference(byId.get(id)?.evidence, bases).ok);
}

function gitOutput(repoRoot, args) {
  try {
    return execFileSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function candidateIntegrityPasses(report) {
  if (report?.integrity?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/i.test(report.integrity.digest ?? "")) {
    return false;
  }
  const { integrity: _integrity, ...unsigned } = report;
  return sha256(stableJson(unsigned)) === report.integrity.digest;
}

function gateEvidence(checks, gate, evidence, note) {
  const relevant = checks.filter((entry) => entry.gate === gate);
  const passed = relevant.length > 0 && relevant.every((entry) => entry.passed);
  const failed = relevant.filter((entry) => !entry.passed).map((entry) => entry.label);
  return {
    status: passed ? "pass" : "blocked",
    ...(passed && evidence ? { evidence } : {}),
    note: passed ? note : failed.join("; ") || "Required evidence is missing.",
  };
}

function markdown(report) {
  const rows = report.checks.map((entry) => (
    `| ${entry.gate} | ${entry.passed ? "PASS" : "BLOCKED"} | ${entry.label} | ${entry.evidence ?? entry.note ?? "Missing"} |`
  ));
  return [
    "# Matterhorn Public Beta Owner Acceptance",
    "",
    `**Decision:** ${report.decision}`,
    `**Candidate:** \`${report.commit}\``,
    `**Tag:** \`${report.tag}\``,
    `**Generated:** ${report.generatedAt}`,
    "",
    "| Gate | Status | Check | Evidence |",
    "|---|---|---|---|",
    ...rows,
    "",
    ...(report.blockers.length
      ? ["## Blockers", "", ...report.blockers.map((entry) => `- **${entry.gate}:** ${entry.action}`), ""]
      : []),
  ].join("\n");
}

function evaluate(config) {
  const repoRoot = resolve(config.repoRoot);
  const inputPath = resolve(config.input);
  const inputDir = dirname(inputPath);
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  rejectSecrets(input);
  if (input.version !== INPUT_VERSION) {
    throw new Error(`Input version must be ${INPUT_VERSION}.`);
  }

  const commit = String(input.commit ?? "").trim().toLowerCase();
  const tag = String(input.tag ?? "").trim();
  if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error("input.commit must be a full Git SHA.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(tag)) throw new Error("input.tag is invalid.");

  const bases = [inputDir, repoRoot];
  const reports = {};
  for (const name of Object.keys(REPORT_VERSIONS)) {
    reports[name] = readJsonReference(name, input.reports?.[name], bases);
  }

  const candidate = reports.candidate.value;
  const approval = reports.ownerApproval.value;
  const deployment = reports.deployment.value;
  const operations = reports.operations.value;
  const acceptance = reports.acceptance.value;
  const desktop = reports.desktop.value;
  const expectedOauth = Array.isArray(input.expectedOauthConnectors)
    ? input.expectedOauthConnectors.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
    : [];

  const launchEvidenceReference = candidate?.artifacts?.launchEvidence;
  const candidateEvidence = readJsonReference(
    "candidate launch evidence",
    launchEvidenceReference,
    [dirname(reports.candidate.path), repoRoot],
  ).value;

  const checks = [];
  const add = (...args) => checks.push(check(...args));
  const candidateReady = candidate.version === REPORT_VERSIONS.candidate
    && candidate.localReady === true
    && candidate.immutable === true
    && candidate.sourceStable === true
    && candidate.readyForOwnerGates === true
    && candidate.source?.head === commit
    && candidate.finalSource?.head === commit
    && candidate.source?.dirty === false
    && candidate.finalSource?.dirty === false;
  add("candidate_report", "release.exact_commit", "Certified candidate is immutable, stable, and locally green", candidateReady, input.reports.candidate);
  add("candidate_integrity", "release.exact_commit", "Candidate report integrity digest is valid", candidateIntegrityPasses(candidate), input.reports.candidate);
  add("candidate_launch_evidence", "release.exact_commit", "Candidate launch evidence matches the exact commit", candidateEvidence.version === "matterhorn.launch-channel-evidence.v1" && candidateEvidence.commit === commit, launchEvidenceReference);
  add("owner_input_fresh", "release.exact_commit", "Owner acceptance input is no more than 12 hours old", isFresh(input.capturedAt, config.now), input.capturedAt);

  const approvalPass = approval.version === REPORT_VERSIONS.ownerApproval
    && approval.candidate?.commit === commit
    && approval.candidate?.tag === tag
    && approval.candidate?.tagResolvesToCommit === true
    && approval.scope?.status === "frozen"
    && approval.scope?.channel === "public-beta"
    && approval.scope?.deferredFeaturesRemainHidden === true;
  add("scope_approval", "scope.freeze", "Release owner froze the Public Beta scope and deferred features", approvalPass, input.reports.ownerApproval);

  const resolvedTag = gitOutput(repoRoot, ["rev-parse", `${tag}^{commit}`]).toLowerCase();
  const annotatedTag = gitOutput(repoRoot, ["cat-file", "-t", `refs/tags/${tag}`]) === "tag";
  add("stable_tag_commit", "release.stable_tag", "Annotated release tag resolves to the exact candidate", resolvedTag === commit && annotatedTag, `${tag} -> ${resolvedTag || "missing"}`);

  const rotation = input.manual?.exposedKeyRotation ?? {};
  const rotationRef = evidenceReference(rotation.reportPath, bases);
  add(
    "exposed_key_rotation",
    "security.credential_rotation",
    "Every exposed or shared key is revoked and replacements live only in the approved secret store",
    rotation.status === "pass"
      && rotation.allExposedKeysRevoked === true
      && rotation.replacementsInSecretStore === true
      && present(rotation.owner)
      && present(rotation.reviewedAt)
      && rotationRef.ok,
    rotationRef.display,
  );

  const deploymentMeta = deployment.version === REPORT_VERSIONS.deployment
    && deployment.ready === true
    && deployment.metadata?.expectedCommit === commit
    && deployment.metadata?.localContractRun === false
    && isFresh(deployment.metadata?.generatedAt, config.now);
  add("deployment_report", "deployment.https", "Deployment probe is fresh, production-ready, and bound to the candidate", deploymentMeta, input.reports.deployment);
  add("deployment_https", "deployment.https", "Application and API use production HTTPS", reportChecksPass(deployment, ["https", "app_response", "api_health", "api_build_commit"]) && safeHttpsUrl(deployment.metadata?.appUrl) && safeHttpsUrl(deployment.metadata?.serverUrl), deployment.metadata?.appUrl);
  add("deployment_cors", "deployment.exact_origin_cors", "Trusted CORS is exact and the untrusted challenge origin is rejected", deploymentMeta && reportChecksPass(deployment, ["cors_trusted_origin", "cors_vary_origin", "cors_untrusted_origin"]), input.reports.deployment);
  add("deployment_headers", "deployment.security_headers", "App and API security headers pass", deploymentMeta && reportChecksPass(deployment, [
    "app_nosniff", "app_referrer", "app_permissions", "app_framing", "app_hsts",
    "api_nosniff", "api_referrer", "api_permissions", "api_framing", "api_hsts",
  ]), input.reports.deployment);
  add("same_origin_proxy", "web.authenticated_same_origin", "API and engine routes stay on the app origin and deny unauthenticated probes", deploymentMeta && reportChecksPass(deployment, [
    "app_workspace_proxy_origin", "app_workspace_proxy", "app_engine_proxy_origin", "app_engine_proxy",
  ]), input.reports.deployment);

  const operationsMeta = operations.version === REPORT_VERSIONS.operations
    && operations.ready === true
    && operations.commit === commit
    && isFresh(operations.evaluatedAt, config.now);
  const operationsBases = [dirname(reports.operations.path), ...bases];
  add("operations_monitoring", "deployment.monitoring", "Monitoring and alert-delivery evidence pass", operationsMeta && allChecksWithPrefixPass(operations, ["monitoring_"]) && reportEvidencePasses(operations, ["monitoring_status"], operationsBases), input.reports.operations);
  add("operations_recovery", "operations.backup_restore", "Workspace and encrypted full user-data recovery pass", operationsMeta && allChecksWithPrefixPass(operations, ["backup_", "user_data_recovery_"]) && reportEvidencePasses(operations, ["backup_status", "user_data_recovery_status"], operationsBases), input.reports.operations);
  add("operations_rollback", "operations.rollback_drill", "Rollback between immutable commits restores health", operationsMeta && allChecksWithPrefixPass(operations, ["rollback_"]) && reportEvidencePasses(operations, ["rollback_status"], operationsBases), input.reports.operations);

  const acceptanceIdentity = acceptance.version === REPORT_VERSIONS.acceptance
    && acceptance.commit === commit
    && isFresh(acceptance.evaluatedAt, config.now);
  const acceptanceMeta = acceptanceIdentity && acceptance.ready === true;
  const acceptanceBases = [dirname(reports.acceptance.path), ...bases];
  add("two_user_acceptance", "web.deployed_two_user_acceptance", "New-user and returning-user deployed journeys pass with evidence", acceptanceMeta && reportChecksPass(acceptance, ["evidence_fresh", "deployed_https", "newUser_journey", "existingUser_journey"]) && reportEvidencePasses(acceptance, ["newUser_journey", "existingUser_journey"], acceptanceBases), input.reports.acceptance);
  add("evm_wallet_acceptance", "wallet.metamask_coinbase", "MetaMask and Coinbase Wallet journeys pass with evidence", acceptanceMeta && reportChecksPass(acceptance, ["metamask_journey", "coinbase_journey"]) && reportEvidencePasses(acceptance, ["metamask_journey", "coinbase_journey"], acceptanceBases), input.reports.acceptance);
  add("sui_wallet_acceptance", "wallet.phantom_sui", "Phantom Sui reject and approve-handoff journeys pass with evidence", acceptanceMeta && reportChecksPass(acceptance, ["phantom_sui_journey"]) && reportEvidencePasses(acceptance, ["phantom_sui_journey"], acceptanceBases), input.reports.acceptance);
  add("hyperliquid_acceptance", "wallet.hyperliquid_testnet", "Hyperliquid testnet execution and fail-closed boundaries pass with evidence", acceptanceMeta && reportChecksPass(acceptance, ["hyperliquid_testnet_journey"]) && reportEvidencePasses(acceptance, ["hyperliquid_testnet_journey"], acceptanceBases), input.reports.acceptance);
  const oauthIds = expectedOauth.map((id) => `oauth_${id}`);
  add("oauth_acceptance", "connectors.visible_oauth", "Every and only allowlisted OAuth connector passes acceptance", acceptanceIdentity && reportChecksPass(acceptance, [...oauthIds, "oauth_visible_set"]) && expectedOauth.length === (acceptance.acceptedOauthConnectors?.length ?? 0) && expectedOauth.every((id) => acceptance.acceptedOauthConnectors.includes(id)) && reportEvidencePasses(acceptance, oauthIds, acceptanceBases), expectedOauth.join(", ") || "No public OAuth connectors");

  const desktopMeta = desktop.version === REPORT_VERSIONS.desktop
    && desktop.ready === true
    && desktop.sourceCommit === commit
    && desktop.localContract === false
    && isFresh(desktop.capturedAt, config.now)
    && Array.isArray(desktop.artifacts)
    && desktop.artifacts.length >= 2
    && desktop.artifacts.every((entry) => /^[a-f0-9]{64}$/i.test(entry.sha256 ?? ""));
  add("desktop_signed", "desktop.signed_notarized", "Signed, notarized, stapled, Gatekeeper-approved desktop artifacts pass", desktopMeta, input.reports.desktop);

  const cleanInstall = input.manual?.cleanInstall ?? {};
  const cleanInstallRef = evidenceReference(cleanInstall.reportPath, bases);
  add("desktop_clean_install", "desktop.clean_install", "Clean install, update, and reinstall pass on the signed candidate", cleanInstall.status === "pass" && cleanInstall.cleanInstall === true && cleanInstall.update === true && cleanInstall.reinstall === true && present(cleanInstall.tester) && isFresh(cleanInstall.testedAt, config.now) && cleanInstallRef.ok, cleanInstallRef.display);

  const publicDownload = input.manual?.publicDownload ?? {};
  const publicDownloadRef = evidenceReference(publicDownload.reportPath, bases);
  const desktopArtifact = desktop.artifacts?.find((entry) => entry.file === publicDownload.artifactFile);
  add("public_download", "distribution.public_download", "Public download resolves to the exact signed candidate artifact and checksum", publicDownload.status === "pass" && safeHttpsUrl(publicDownload.url) && publicDownload.resolvesToCandidate === true && /^[a-f0-9]{64}$/i.test(publicDownload.sha256 ?? "") && desktopArtifact?.sha256 === publicDownload.sha256 && publicDownloadRef.ok, publicDownload.url);

  const legal = input.manual?.legal ?? {};
  const legalRef = evidenceReference(legal.reportPath, bases);
  add("legal_approval", "product.public_copy_and_legal", "Public copy, privacy, terms, and support links are approved", legal.status === "pass" && present(legal.approver) && present(legal.approvedAt) && safeHttpsUrl(legal.privacyUrl) && safeHttpsUrl(legal.termsUrl) && safeHttpsUrl(legal.supportUrl) && legalRef.ok, legalRef.display);

  const support = input.manual?.support ?? {};
  const supportRef = evidenceReference(support.reportPath, bases);
  add("support_channel", "support.public_beta_channel", "Public support channel, owner, and response target are staffed", support.status === "pass" && present(support.owner) && safeHttpsUrl(support.channelUrl) && present(support.responseTarget) && supportRef.ok, support.channelUrl);

  const launchRoom = input.manual?.launchRoom ?? {};
  const launchRoomRef = evidenceReference(launchRoom.reportPath, bases);
  add("launch_room", "support.launch_room", "Incident, rollback, security, and support owners are staffed in the launch room", launchRoom.status === "pass" && safeHttpsUrl(launchRoom.channelUrl) && ["incidentCommander", "rollbackOwner", "securityOwner", "supportOwner"].every((key) => present(launchRoom[key])) && launchRoomRef.ok, launchRoom.channelUrl);

  const launchEvidence = structuredClone(candidateEvidence);
  launchEvidence.capturedAt = input.capturedAt;
  launchEvidence.commit = commit;
  launchEvidence.common ??= { gates: {} };
  launchEvidence.common.gates ??= {};
  launchEvidence.common.gates["scope.freeze"] = gateEvidence(checks, "scope.freeze", input.reports.ownerApproval, "Release owner approved the frozen Public Beta scope.");
  launchEvidence.common.gates["release.exact_commit"] = gateEvidence(checks, "release.exact_commit", input.reports.candidate, "Candidate and owner evidence are fresh, intact, and commit-bound.");
  launchEvidence.channels ??= {};
  launchEvidence.channels["public-beta"] ??= { gates: {} };
  launchEvidence.channels["public-beta"].gates ??= {};
  const publicGates = launchEvidence.channels["public-beta"].gates;
  for (const gate of [
    "release.stable_tag",
    "security.credential_rotation",
    "deployment.https",
    "deployment.exact_origin_cors",
    "deployment.security_headers",
    "deployment.monitoring",
    "operations.backup_restore",
    "operations.rollback_drill",
    "web.authenticated_same_origin",
    "web.deployed_two_user_acceptance",
    "wallet.metamask_coinbase",
    "wallet.phantom_sui",
    "wallet.hyperliquid_testnet",
    "connectors.visible_oauth",
    "desktop.signed_notarized",
    "desktop.clean_install",
    "distribution.public_download",
    "product.public_copy_and_legal",
    "support.public_beta_channel",
    "support.launch_room",
  ]) {
    const evidence = checks.find((entry) => entry.gate === gate)?.evidence ?? inputPath;
    publicGates[gate] = gateEvidence(checks, gate, evidence, `Validated by ${REPORT_VERSION}.`);
  }

  return { repoRoot, input, inputPath, commit, tag, reports, checks, launchEvidence };
}

function writeOutputs(config, evaluated) {
  const outputDir = resolve(config.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const evidencePath = join(outputDir, "launch-evidence.json");
  const readinessPath = join(outputDir, "launch-readiness.json");
  const readinessMarkdownPath = join(outputDir, "launch-readiness.md");
  writeFileSync(evidencePath, `${JSON.stringify(evaluated.launchEvidence, null, 2)}\n`);

  const readinessResult = spawnSync(process.execPath, [
    join(scriptRoot, "launch-channel-readiness.mjs"),
    "--channel", "public-beta",
    "--evidence", evidencePath,
    "--now", config.now.toISOString(),
    "--json-output", readinessPath,
    "--markdown-output", readinessMarkdownPath,
    "--json",
  ], {
    cwd: evaluated.repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (readinessResult.status !== 0) {
    throw new Error(`Launch readiness evaluation failed: ${readinessResult.stderr.trim()}`);
  }
  const readiness = JSON.parse(readinessResult.stdout);
  const checkBlockers = evaluated.checks
    .filter((entry) => !entry.passed)
    .map((entry) => ({ gate: entry.gate, id: entry.id, action: entry.label }));
  const inheritedBlockers = readiness.blockers
    .filter((entry) => !checkBlockers.some((blocker) => blocker.gate === entry.id))
    .map((entry) => ({ gate: entry.id, id: entry.id, action: entry.action }));
  const blockers = [...checkBlockers, ...inheritedBlockers];
  const report = {
    version: REPORT_VERSION,
    decision: readiness.ready && blockers.length === 0 ? "GO" : "NO-GO",
    ready: readiness.ready && blockers.length === 0,
    commit: evaluated.commit,
    tag: evaluated.tag,
    generatedAt: config.now.toISOString(),
    input: evaluated.inputPath,
    launchReadiness: {
      decision: readiness.decision,
      required: readiness.counts.required,
      passed: readiness.counts.passed,
      blocked: readiness.counts.blocked,
    },
    checks: evaluated.checks,
    blockers,
    artifacts: {
      launchEvidence: evidencePath,
      launchReadiness: readinessPath,
      launchReadinessMarkdown: readinessMarkdownPath,
    },
  };
  const reportPath = join(outputDir, "public-beta-owner-acceptance.json");
  const markdownPath = join(outputDir, "public-beta-owner-acceptance.md");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, `${markdown(report)}\n`);
  return report;
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const report = writeOutputs(config, evaluate(config));
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Matterhorn Public Beta owner acceptance: ${report.decision}\n`);
  if (config.strict && !report.ready) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
