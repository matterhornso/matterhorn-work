#!/usr/bin/env node
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";

const INPUT_VERSION = "matterhorn.product-hunt-acceptance-evidence.v2";
const OUTPUT_VERSION = "matterhorn.product-hunt-acceptance-readiness.v2";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function parseArgs(argv) {
  const config = { evidence: "", expectedOauth: [], now: new Date(), strict: false, json: false, jsonOutput: "", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    if (arg === "--evidence") config.evidence = next();
    else if (arg === "--expected-oauth") config.expectedOauth = next().split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    else if (arg === "--now") config.now = new Date(next());
    else if (arg === "--json-output") config.jsonOutput = next();
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json") config.json = true;
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!config.help && !config.evidence) throw new Error("--evidence is required.");
  return config;
}

function help() {
  return [
    "Matterhorn Product Hunt external acceptance gate",
    "",
    "Validates deployed signup, two-account isolation, guarded crypto-agent, real-wallet, and visible OAuth acceptance.",
    "Evidence must describe outcomes only. Private keys, seed phrases, wallet exports, signatures, signed payloads, and auth credentials are rejected.",
    "",
    "Usage:",
    "  pnpm gate:product-hunt-acceptance -- --evidence acceptance.json --expected-oauth notion,linear --json --strict",
  ].join("\n");
}

function rejectSecrets(value, path = "evidence") {
  if (Array.isArray(value)) return value.forEach((item, index) => rejectSecrets(item, `${path}[${index}]`));
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (/token|authorization|api.?key|secret|private.?key|seed|mnemonic|raw.?signature|signed.?payload|wallet.?export/i.test(key)) {
      throw new Error(`Credential or signing material is not allowed in evidence: ${path}.${key}`);
    }
    rejectSecrets(item, `${path}.${key}`);
  }
}

function present(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function evidenceFileReady(path, evidencePath) {
  if (typeof path !== "string" || !path.trim() || isAbsolute(path)) return false;
  const base = resolve(dirname(evidencePath));
  const target = resolve(base, path);
  const offset = relative(base, target);
  if (!offset || offset.startsWith("..") || isAbsolute(offset) || !existsSync(target)) return false;
  try {
    const stat = statSync(target);
    return stat.isFile() && stat.size > 0 && stat.size <= 5 * 1024 * 1024;
  } catch {
    return false;
  }
}

function check(id, gate, label, pass, evidence) {
  return { id, gate, label, status: pass ? "pass" : "fail", evidence: present(evidence) ? evidence : null };
}

function allTrue(value, keys) {
  return keys.every((key) => value?.[key] === true);
}

const GUARDED_DESK_SCENARIOS = Object.freeze({
  bittensor: {
    label: "Bittensor",
    network: "testnet",
    protocol: ["balance", "validatorComparison", "transferPreview", "stakePreview"],
  },
  hyperliquid: {
    label: "Hyperliquid",
    network: "testnet",
    protocol: ["markets", "positions", "orderbook", "orderPreview", "modifyCancelPreview", "closePreview"],
  },
  polymarket: {
    label: "Polymarket",
    network: "preview",
    protocol: ["discovery", "complianceBlock", "eligiblePreview", "walletTicket"],
  },
  sui: {
    label: "Sui",
    network: "sui-testnet",
    protocol: ["balance", "nativeTransferPreview", "coinTransferPreview", "objectTransferPreview"],
  },
});

const GUARDED_DESK_COMMON = [
  "publicResearch",
  "privateContextFlow",
  "modelCompletion",
  "runReceipt",
  "prepare",
  "reject",
  "expiryBlocked",
  "tamperBlocked",
  "walletReview",
  "receiptReconciled",
  "reload",
];

function evaluate(input, config) {
  if (input.version !== INPUT_VERSION) throw new Error(`Evidence version must be ${INPUT_VERSION}.`);
  rejectSecrets(input);
  const capturedAt = new Date(input.capturedAt);
  const fresh = Number.isFinite(capturedAt.getTime()) && config.now.getTime() >= capturedAt.getTime() - 60_000 && config.now.getTime() - capturedAt.getTime() <= MAX_AGE_MS;
  const deployed = /^https:\/\//.test(input.appUrl ?? "") && input.environment === "deployed";
  const checks = [
    check("evidence_commit", "release.exact_commit", "Evidence identifies a full candidate commit", /^[a-f0-9]{40}$/i.test(input.commit ?? ""), input.commit),
    check("evidence_fresh", "ux.deployed_two_user_acceptance", "Evidence is no more than 12 hours old", fresh, input.capturedAt),
    check("deployed_https", "ux.deployed_two_user_acceptance", "Acceptance ran on the deployed HTTPS app", deployed, input.appUrl),
  ];

  const signup = input.authentication?.signup;
  checks.push(check(
    "signup_journey",
    "auth.public_signup",
    "Create account, Turnstile, legal acceptance, email verification, sign in/out, and password reset pass",
    signup?.status === "pass" && allTrue(signup, [
      "createAccount", "turnstile", "legalAcceptance", "verificationEmail", "verifyEmail", "signIn", "signOut", "passwordReset",
    ]) && present(signup.tester) && evidenceFileReady(signup.reportPath, config.evidence),
    signup?.reportPath,
  ));

  const isolation = input.authentication?.twoAccountIsolation;
  checks.push(check(
    "two_account_isolation",
    "security.two_account_isolation",
    "Two accounts cannot cross-read workspaces, preflights, grants, receipts, memories, or reviewed actions",
    isolation?.status === "pass" && allTrue(isolation, [
      "workspaces", "preflights", "grants", "receipts", "memories", "actions",
    ]) && present(isolation.tester) && evidenceFileReady(isolation.reportPath, config.evidence),
    isolation?.reportPath,
  ));

  const privacy = input.agentRuntime?.privacy;
  checks.push(check(
    "privacy_firewall",
    "agent.privacy_firewall",
    "Sensitive input is blocked before usage/provider contact and private consent is exact, disclosed, and mutation-safe",
    privacy?.status === "pass" && allTrue(privacy, [
      "sensitiveBlocked", "usageReservationZeroOnBlock", "providerContactZeroOnBlock", "privateConsentRequired",
      "consentExactBinding", "consentMutationBlocked", "providerDisclosed",
    ]) && evidenceFileReady(privacy.reportPath, config.evidence),
    privacy?.reportPath,
  ));

  const capability = input.agentRuntime?.capability;
  checks.push(check(
    "capability_adversarial",
    "agent.capability_enforcement",
    "Wrong-desk/tool/access, replay, mutation, cross-tenant/session, and submit-capability attacks fail closed",
    capability?.status === "pass" && allTrue(capability, [
      "wrongDeskBlocked", "wrongToolBlocked", "readCannotPrepare", "replayBlocked", "argumentMutationBlocked",
      "crossWorkspaceBlocked", "crossSessionBlocked", "noSubmitCapability",
    ]) && evidenceFileReady(capability.reportPath, config.evidence),
    capability?.reportPath,
  ));

  const genericCrypto = input.agentRuntime?.genericCrypto;
  checks.push(check(
    "generic_crypto_journey",
    "agent.generic_crypto",
    "Generic crypto chat completes public and private-context flows with model, privacy, usage, tool, and reload receipts",
    genericCrypto?.status === "pass" && allTrue(genericCrypto, [
      "publicResearch", "privateContextFlow", "modelCompletion", "runReceipt", "privacyReceipt", "usageReceipt", "toolReceipt", "reload",
    ]) && evidenceFileReady(genericCrypto.reportPath, config.evidence),
    genericCrypto?.reportPath,
  ));

  for (const [id, scenario] of Object.entries(GUARDED_DESK_SCENARIOS)) {
    const item = input.agentRuntime?.desks?.[id];
    checks.push(check(
      `${id}_guarded_journey`,
      `agent.${id}_guarded_journey`,
      `${scenario.label} completes public/private model work, guarded prepare negatives, exact wallet review, receipt reconciliation, and protocol scenarios`,
      item?.status === "pass"
        && item?.network === scenario.network
        && allTrue(item, [...GUARDED_DESK_COMMON, ...scenario.protocol])
        && evidenceFileReady(item.reportPath, config.evidence),
      item?.reportPath,
    ));
  }

  for (const [id, label] of [["metamask", "MetaMask"], ["coinbase", "Coinbase Wallet"]]) {
    const item = input.wallets?.[id];
    checks.push(check(
      `${id}_journey`,
      "wallet.metamask_coinbase",
      `${label} connect, reject, approve, receipt, reload, and disconnect pass`,
      item?.status === "pass" && allTrue(item, ["connect", "reject", "approve", "receipt", "reload", "disconnect"]) && present(item.browser) && present(item.walletVersion) && evidenceFileReady(item.reportPath, config.evidence),
      item?.reportPath,
    ));
  }

  const phantom = input.wallets?.phantomSui;
  checks.push(check(
    "phantom_sui_journey",
    "wallet.phantom_sui",
    "Phantom Sui connect, reject, approve handoff, receipt, reload, and disconnect pass",
    phantom?.status === "pass" && phantom?.network === "sui-testnet" && allTrue(phantom, ["connect", "reject", "approveHandoff", "receipt", "reload", "disconnect"]) && present(phantom.walletVersion) && evidenceFileReady(phantom.reportPath, config.evidence),
    phantom?.reportPath,
  ));

  const hyperliquid = input.wallets?.hyperliquid;
  checks.push(check(
    "hyperliquid_testnet_journey",
    "wallet.hyperliquid_testnet",
    "Hyperliquid testnet execution and every fail-closed boundary pass",
    hyperliquid?.status === "pass" && hyperliquid?.network === "testnet" && allTrue(hyperliquid, [
      "connect", "reject", "approve", "receipt", "replayBlocked", "expiryBlocked", "limitBlocked", "killSwitchBlocked",
    ]) && present(hyperliquid.wallet) && evidenceFileReady(hyperliquid.reportPath, config.evidence),
    hyperliquid?.reportPath,
  ));

  for (const [id, label] of [["newUser", "New user"], ["existingUser", "Existing user"]]) {
    const item = input.users?.[id];
    checks.push(check(
      `${id}_journey`,
      "ux.deployed_two_user_acceptance",
      `${label} can open a project, complete chat, use a desk, save a note, and inspect output`,
      item?.status === "pass" && allTrue(item, ["openProject", "chat", "desk", "note", "output"]) && present(item.tester) && evidenceFileReady(item.reportPath, config.evidence),
      item?.reportPath,
    ));
  }

  const visibleOauth = Array.isArray(input.oauth?.visible) ? input.oauth.visible : [];
  const byId = new Map(visibleOauth.map((item) => [String(item.id ?? "").toLowerCase(), item]));
  for (const id of config.expectedOauth) {
    const item = byId.get(id);
    checks.push(check(
      `oauth_${id}`,
      "connectors.visible_oauth",
      `${id} connect, reload, tool call, disconnect, and revoked-account behavior pass`,
      item?.status === "pass" && allTrue(item, ["connect", "reload", "toolCall", "disconnect", "revokedAccountBlocked"]) && evidenceFileReady(item.reportPath, config.evidence),
      item?.reportPath,
    ));
  }
  const unexpectedVisible = visibleOauth.filter((item) => !config.expectedOauth.includes(String(item.id ?? "").toLowerCase()));
  checks.push(check(
    "oauth_visible_set",
    "connectors.visible_oauth",
    "The tested OAuth set exactly matches the build allowlist",
    unexpectedVisible.length === 0 && visibleOauth.length === config.expectedOauth.length,
    visibleOauth.map((item) => item.id).join(", ") || "none",
  ));

  const blockers = checks.filter((item) => item.status === "fail").map(({ id, gate, label }) => ({ id, gate, action: label }));
  const acceptedOauthConnectors = blockers.some((item) => item.gate === "connectors.visible_oauth") ? [] : [...config.expectedOauth];
  return {
    version: OUTPUT_VERSION,
    decision: blockers.length ? "NO-GO" : "GO",
    ready: blockers.length === 0,
    commit: input.commit ?? null,
    evaluatedAt: config.now.toISOString(),
    acceptedOauthConnectors,
    buildEnvironment: acceptedOauthConnectors.length ? `VITE_MATTERHORN_PUBLIC_OAUTH_CONNECTORS=${acceptedOauthConnectors.join(",")}` : "VITE_MATTERHORN_PUBLIC_OAUTH_CONNECTORS=",
    checks,
    blockers,
  };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) return process.stdout.write(`${help()}\n`);
  const input = JSON.parse(readFileSync(config.evidence, "utf8"));
  const report = evaluate(input, config);
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Product Hunt external acceptance: ${report.decision}\n`);
  if (config.strict && !report.ready) process.exitCode = 1;
}

try { main(); } catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
