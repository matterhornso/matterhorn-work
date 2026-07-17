#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const INPUT_VERSION = "matterhorn.product-hunt-acceptance-evidence.v1";
const OUTPUT_VERSION = "matterhorn.product-hunt-acceptance-readiness.v1";
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
    "Validates deployed two-user, real-wallet, Hyperliquid testnet, and visible OAuth connector acceptance.",
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

function check(id, gate, label, pass, evidence) {
  return { id, gate, label, status: pass ? "pass" : "fail", evidence: present(evidence) ? evidence : null };
}

function allTrue(value, keys) {
  return keys.every((key) => value?.[key] === true);
}

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

  for (const [id, label] of [["metamask", "MetaMask"], ["coinbase", "Coinbase Wallet"]]) {
    const item = input.wallets?.[id];
    checks.push(check(
      `${id}_journey`,
      "wallet.metamask_coinbase",
      `${label} connect, reject, approve, receipt, reload, and disconnect pass`,
      item?.status === "pass" && allTrue(item, ["connect", "reject", "approve", "receipt", "reload", "disconnect"]) && present(item.browser) && present(item.walletVersion),
      item?.reportPath,
    ));
  }

  const phantom = input.wallets?.phantomSui;
  checks.push(check(
    "phantom_sui_journey",
    "wallet.phantom_sui",
    "Phantom Sui connect, reject, approve handoff, receipt, reload, and disconnect pass",
    phantom?.status === "pass" && phantom?.network === "sui-testnet" && allTrue(phantom, ["connect", "reject", "approveHandoff", "receipt", "reload", "disconnect"]) && present(phantom.walletVersion),
    phantom?.reportPath,
  ));

  const hyperliquid = input.wallets?.hyperliquid;
  checks.push(check(
    "hyperliquid_testnet_journey",
    "wallet.hyperliquid_testnet",
    "Hyperliquid testnet execution and every fail-closed boundary pass",
    hyperliquid?.status === "pass" && hyperliquid?.network === "testnet" && allTrue(hyperliquid, [
      "connect", "reject", "approve", "receipt", "replayBlocked", "expiryBlocked", "limitBlocked", "killSwitchBlocked",
    ]) && present(hyperliquid.wallet) && present(hyperliquid.reportPath),
    hyperliquid?.reportPath,
  ));

  for (const [id, label] of [["newUser", "New user"], ["existingUser", "Existing user"]]) {
    const item = input.users?.[id];
    checks.push(check(
      `${id}_journey`,
      "ux.deployed_two_user_acceptance",
      `${label} can open a project, complete chat, use a desk, save a note, and inspect output`,
      item?.status === "pass" && allTrue(item, ["openProject", "chat", "desk", "note", "output"]) && present(item.tester) && present(item.reportPath),
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
      item?.status === "pass" && allTrue(item, ["connect", "reload", "toolCall", "disconnect", "revokedAccountBlocked"]) && present(item.reportPath),
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
