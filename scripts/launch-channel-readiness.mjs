#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const EVIDENCE_VERSION = "matterhorn.launch-channel-evidence.v1";
const CHANNELS = new Set(["beta", "public-beta", "product-hunt"]);
const MAX_EVIDENCE_AGE_HOURS = Object.freeze({ beta: 24, "public-beta": 12, "product-hunt": 12 });

const COMMON_GATES = Object.freeze([
  ["scope.freeze", "Launch scope and deferred features are frozen", "Release owner"],
  ["release.exact_commit", "Evidence identifies the exact candidate commit", "Engineering"],
  ["code.app_suite", "Full app suite passes", "Engineering"],
  ["code.server_suite", "Full server suite passes", "Engineering"],
  ["code.typechecks", "App, server, and Electron typechecks pass", "Engineering"],
  ["code.production_build", "Production web and desktop builds pass", "Engineering"],
  ["code.platform_safety", "Matterhorn platform safety gate passes", "Engineering"],
  ["security.dependency_audit", "Production dependency audit is clear", "Security"],
  ["security.desktop_trust_boundary", "Desktop navigation, permission, IPC, and file-open policies pass", "Security"],
  ["ux.local_responsive_acceptance", "Core local journeys pass desktop and mobile acceptance", "Product and QA"],
  ["product.deferred_features_hidden", "Deferred services are disabled and truthfully hidden", "Product"],
]);

const BETA_GATES = Object.freeze([
  ["beta.named_tester_access", "Access is limited to the named Beta cohort", "Release owner"],
  ["beta.support_owner", "A support owner and response channel are staffed", "Operations"],
  ["beta.rollback", "The Beta rollback and kill-switch procedure is verified", "Operations"],
]);

const PUBLIC_BETA_GATES = Object.freeze([
  ["release.stable_tag", "The public candidate is built from one immutable stable tag", "Release owner"],
  ["security.credential_rotation", "Every exposed or shared credential is revoked and replacements live only in approved secret stores", "Security"],
  ["deployment.https", "The public web build is deployed behind production HTTPS", "Engineering"],
  ["deployment.exact_origin_cors", "Production CORS allows only intended origins", "Security"],
  ["deployment.security_headers", "CSP and production security headers pass", "Security"],
  ["deployment.monitoring", "Health, errors, latency, and provider failures are monitored", "Operations"],
  ["operations.backup_restore", "Backup and restore are proven on production-shaped data", "Operations"],
  ["operations.rollback_drill", "A production rollback drill succeeds", "Operations"],
  ["web.authenticated_same_origin", "Public web uses the authenticated same-origin proxy with no browser bearer credentials", "Security"],
  ["web.deployed_two_user_acceptance", "New-user and returning-user deployed web journeys pass", "Product and QA"],
  ["wallet.metamask_coinbase", "MetaMask and Coinbase Wallet acceptance passes", "Wallet QA"],
  ["wallet.phantom_sui", "Phantom Sui connect and reject/approve handoff acceptance passes", "Wallet QA"],
  ["wallet.hyperliquid_testnet", "Hyperliquid testnet reject, approve, receipt, replay, expiry, limit, and kill-switch acceptance passes", "Wallet QA"],
  ["connectors.visible_oauth", "Every visible OAuth connector passes connect, reload, tools, and disconnect", "Integration QA"],
  ["desktop.signed_notarized", "Public macOS assets are signed, notarized, stapled, and checksum-verified", "Release engineering"],
  ["desktop.clean_install", "The signed desktop app passes clean-install, update, and reinstall acceptance", "Release QA"],
  ["distribution.public_download", "The public desktop download resolves to the exact signed candidate", "Release engineering"],
  ["product.public_copy_and_legal", "Public copy, privacy policy, terms, and support links are approved", "Product and legal"],
  ["support.public_beta_channel", "A public support channel and response owner are staffed", "Operations"],
  ["support.launch_room", "Launch-room owners and incident escalation are staffed", "Operations"],
]);

const PRODUCT_HUNT_GATES = Object.freeze([
  ["release.stable_tag", "The public candidate is built from one immutable stable tag", "Release owner"],
  ["security.credential_rotation", "Every exposed or shared credential is revoked and replacements live only in approved secret stores", "Security"],
  ["deployment.https", "The exact candidate is deployed behind production HTTPS", "Engineering"],
  ["deployment.exact_origin_cors", "Production CORS allows only intended origins", "Security"],
  ["deployment.security_headers", "CSP and production security headers pass", "Security"],
  ["deployment.monitoring", "Health, errors, latency, and provider failures are monitored", "Operations"],
  ["operations.backup_restore", "Backup and restore are proven on production-shaped data", "Operations"],
  ["operations.rollback_drill", "A production rollback drill succeeds", "Operations"],
  ["ux.deployed_two_user_acceptance", "New-user and existing-user deployed journeys pass", "Product and QA"],
  ["wallet.metamask_coinbase", "MetaMask and Coinbase Wallet acceptance passes", "Wallet QA"],
  ["wallet.phantom_sui", "Phantom Sui connect and reject/approve handoff acceptance passes", "Wallet QA"],
  ["wallet.hyperliquid_testnet", "Hyperliquid testnet reject, approve, receipt, replay, expiry, limit, and kill-switch acceptance passes", "Wallet QA"],
  ["connectors.visible_oauth", "Every visible OAuth connector passes connect, reload, tools, and disconnect", "Integration QA"],
  ["desktop.signed_notarized", "Public macOS assets are signed, notarized, stapled, and checksum-verified", "Release engineering"],
  ["desktop.clean_install", "The signed desktop app passes clean-install, update, and reinstall acceptance", "Release QA"],
  ["distribution.public_download", "The public desktop download resolves to the exact signed candidate", "Release engineering"],
  ["product.public_copy_and_legal", "Public copy, privacy policy, terms, and support links are approved", "Product and legal"],
  ["support.public_beta_channel", "A public support channel and response owner are staffed", "Operations"],
  ["support.launch_room", "Launch-room owners and incident escalation are staffed", "Operations"],
]);

function parseArgs(argv) {
  const config = {
    channel: "beta",
    evidencePath: "",
    json: false,
    strict: false,
    jsonOutput: "",
    markdownOutput: "",
    now: new Date(),
    listGates: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--channel") config.channel = next();
    else if (arg.startsWith("--channel=")) config.channel = arg.slice("--channel=".length);
    else if (arg === "--evidence") config.evidencePath = next();
    else if (arg.startsWith("--evidence=")) config.evidencePath = arg.slice("--evidence=".length);
    else if (arg === "--json-output") config.jsonOutput = next();
    else if (arg === "--markdown-output") config.markdownOutput = next();
    else if (arg === "--now") config.now = new Date(next());
    else if (arg === "--json") config.json = true;
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--list-gates") config.listGates = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!CHANNELS.has(config.channel)) {
    throw new Error("--channel must be beta, public-beta, or product-hunt.");
  }
  if (Number.isNaN(config.now.getTime())) throw new Error("--now must be an ISO date-time.");
  if (!config.help && !config.listGates && !config.evidencePath) {
    throw new Error("--evidence is required.");
  }
  return config;
}

function help() {
  return [
    "Matterhorn launch-channel readiness gate",
    "",
    "Usage:",
    "  node scripts/launch-channel-readiness.mjs --channel beta --evidence <json> --strict --json",
    "  node scripts/launch-channel-readiness.mjs --channel public-beta --evidence <json> --strict --json",
    "  node scripts/launch-channel-readiness.mjs --channel product-hunt --evidence <json> --strict --json",
    "  node scripts/launch-channel-readiness.mjs --channel product-hunt --list-gates --json",
    "",
    "A pass requires fresh, non-empty evidence for every gate in the selected channel.",
    "The command reads evidence only; it never accepts credentials or performs a release.",
  ].join("\n");
}

function requiredGates(channel) {
  const rows = channel === "beta"
    ? [...COMMON_GATES, ...BETA_GATES]
    : channel === "public-beta"
      ? [...COMMON_GATES, ...PUBLIC_BETA_GATES]
      : [...COMMON_GATES, ...PRODUCT_HUNT_GATES];
  return rows.map(([id, label, owner]) => ({ id, label, owner }));
}

function rejectSecretShapedKeys(value, path = "evidence") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSecretShapedKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:token|authorization|api[-_]?key|api[-_]?secret|private[-_]?key|seed(?:[-_]?phrase)?|mnemonic|raw[-_]?signature|signed[-_]?payload|wallet[-_]?export)$/i.test(key)) {
      throw new Error(`Credential-shaped evidence key is not allowed: ${path}.${key}`);
    }
    rejectSecretShapedKeys(entry, `${path}.${key}`);
  }
}

function loadEvidence(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  rejectSecretShapedKeys(parsed);
  if (parsed.version !== EVIDENCE_VERSION) {
    throw new Error(`Evidence version must be ${EVIDENCE_VERSION}.`);
  }
  return parsed;
}

function evidenceFor(input, channel, id) {
  return input.channels?.[channel]?.gates?.[id] ?? input.common?.gates?.[id] ?? null;
}

function evaluate(config, input) {
  const capturedAt = new Date(input.capturedAt);
  const ageHours = (config.now.getTime() - capturedAt.getTime()) / 3_600_000;
  const maxAgeHours = MAX_EVIDENCE_AGE_HOURS[config.channel];
  const commit = typeof input.commit === "string" ? input.commit.trim() : "";
  const checks = requiredGates(config.channel).map((gate) => {
    const value = evidenceFor(input, config.channel, gate.id);
    const status = typeof value?.status === "string" ? value.status.trim().toLowerCase() : "missing";
    const evidence = typeof value?.evidence === "string" ? value.evidence.trim() : "";
    const passed = status === "pass" && evidence.length > 0;
    return {
      ...gate,
      status: passed ? "pass" : status === "pass" ? "missing_evidence" : status,
      evidence: evidence || null,
      note: typeof value?.note === "string" && value.note.trim() ? value.note.trim() : null,
      passed,
    };
  });

  const metaChecks = [
    {
      id: "evidence.commit",
      label: "Candidate commit is a full Git SHA",
      owner: "Release owner",
      status: /^[a-f0-9]{40}$/i.test(commit) ? "pass" : "fail",
      evidence: commit || null,
      note: null,
      passed: /^[a-f0-9]{40}$/i.test(commit),
    },
    {
      id: "evidence.freshness",
      label: `Evidence is no more than ${maxAgeHours} hours old`,
      owner: "Release owner",
      status: Number.isFinite(ageHours) && ageHours >= -0.1 && ageHours <= maxAgeHours ? "pass" : "fail",
      evidence: Number.isFinite(capturedAt.getTime()) ? input.capturedAt : null,
      note: Number.isFinite(ageHours) ? `ageHours=${ageHours.toFixed(2)}` : "capturedAt is invalid",
      passed: Number.isFinite(ageHours) && ageHours >= -0.1 && ageHours <= maxAgeHours,
    },
  ];
  const allChecks = [...metaChecks, ...checks];
  const blockers = allChecks.filter((check) => !check.passed).map((check) => ({
    id: check.id,
    owner: check.owner,
    status: check.status,
    action: check.label,
  }));
  return {
    version: "matterhorn.launch-channel-readiness.v1",
    channel: config.channel,
    decision: blockers.length === 0 ? "GO" : "NO-GO",
    ready: blockers.length === 0,
    commit: commit || null,
    capturedAt: Number.isFinite(capturedAt.getTime()) ? capturedAt.toISOString() : null,
    evaluatedAt: config.now.toISOString(),
    maxEvidenceAgeHours: maxAgeHours,
    counts: {
      required: allChecks.length,
      passed: allChecks.length - blockers.length,
      blocked: blockers.length,
    },
    blockers,
    checks: allChecks,
  };
}

function markdown(report) {
  const rows = report.checks.map((check) => (
    `| ${check.id} | ${check.passed ? "PASS" : "BLOCKED"} | ${check.owner} | ${check.evidence ?? check.note ?? "Missing"} |`
  ));
  return [
    `# Matterhorn ${report.channel === "beta" ? "Friday Beta" : report.channel === "public-beta" ? "Public Beta" : "Product Hunt"} Readiness`,
    "",
    `**Decision:** ${report.decision}`,
    `**Candidate:** ${report.commit ?? "Missing"}`,
    `**Evidence captured:** ${report.capturedAt ?? "Invalid"}`,
    "",
    "| Gate | Status | Owner | Evidence |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  if (config.listGates) {
    const payload = { channel: config.channel, gates: requiredGates(config.channel) };
    process.stdout.write(config.json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.gates.map((gate) => gate.id).join("\n")}\n`);
    return;
  }

  const report = evaluate(config, loadEvidence(config.evidencePath));
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  if (config.markdownOutput) writeFileSync(config.markdownOutput, markdown(report));
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${report.channel}: ${report.decision} (${report.counts.passed}/${report.counts.required} gates passed)\n`);
  if (config.strict && !report.ready) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
