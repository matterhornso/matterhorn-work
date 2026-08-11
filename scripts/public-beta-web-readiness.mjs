#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import process from "node:process";

const REPORT_VERSION = "matterhorn.public-beta-web-readiness.v1";

function parseArgs(argv) {
  const config = {
    json: false,
    strict: false,
    jsonOutput: "",
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

    if (arg === "--json") config.json = true;
    else if (arg === "--strict") config.strict = true;
    else if (arg === "--json-output") config.jsonOutput = next();
    else if (arg === "--help" || arg === "-h") config.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return config;
}

function help() {
  return [
    "Matterhorn public Beta web readiness gate",
    "",
    "Usage:",
    "  pnpm gate:public-beta-web --json",
    "",
    "Checks public-web configuration only. It never prints or reads credential values.",
  ].join("\n");
}

function readEnv(key) {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
}

function enabled(key) {
  return /^(1|true|yes|on)$/i.test(readEnv(key));
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function urlOrNull(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function configuredVariableNames(keys) {
  return keys.filter((key) => readEnv(key)).join(", ");
}

function positiveInteger(key) {
  const value = Number(readEnv(key));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function check(id, label, owner, passed, note = null) {
  return {
    id,
    label,
    owner,
    status: passed ? "pass" : "blocked",
    passed,
    note,
  };
}

function evaluate() {
  const browserCredentialVariables = [
    "VITE_MATTERHORN_WORK_TOKEN",
    "VITE_MATTERHORN_WORK_HOST_TOKEN",
    "VITE_OPENWORK_TOKEN",
    "VITE_OPENWORK_HOST_TOKEN",
  ];
  const directBackendVariables = [
    "VITE_MATTERHORN_WORK_URL",
    "VITE_MATTERHORN_WORK_PORT",
    "VITE_MATTERHORN_WORK_FORCE_SETTINGS",
    "VITE_OPENWORK_URL",
    "VITE_OPENWORK_PORT",
    "VITE_OPENWORK_FORCE_SETTINGS",
    "VITE_OPENCODE_URL",
  ];
  const configuredCredentials = configuredVariableNames(browserCredentialVariables);
  const configuredDirectBackend = configuredVariableNames(directBackendVariables);
  const appUrl = readEnv("MATTERHORN_APP_URL");
  const cloudUrl = readEnv("VITE_MATTERHORN_CLOUD_URL");
  const cloudApiUrl = readEnv("VITE_MATTERHORN_CLOUD_API_URL");
  const publicProxyMode = readEnv("MATTERHORN_PUBLIC_PROXY_MODE").toLowerCase();
  const controlPlaneUrl = readEnv("MATTERHORN_CONTROL_PLANE_URL");
  const proxySecretConfigured = readEnv("MATTERHORN_PROXY_SECRET").length >= 32;
  const app = urlOrNull(appUrl);
  const cloud = urlOrNull(cloudUrl);
  const cloudApi = urlOrNull(cloudApiUrl);
  const usageDaily = positiveInteger("MATTERHORN_MODEL_USAGE_DAILY_LIMIT");
  const usageMonthly = positiveInteger("MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT");
  const usageGlobalDaily = positiveInteger("MATTERHORN_MODEL_USAGE_GLOBAL_DAILY_LIMIT");
  const usageGlobalMonthly = positiveInteger("MATTERHORN_MODEL_USAGE_GLOBAL_MONTHLY_LIMIT");
  const usageReservation = positiveInteger("MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS");
  const signupCapacity = positiveInteger("MATTERHORN_SIGNUP_MAX_ACCOUNTS");

  const checks = [
    check(
      "web.deployment",
      "The public build declares Matterhorn web deployment mode",
      "Engineering",
      readEnv("VITE_MATTERHORN_DEPLOYMENT").toLowerCase() === "web",
      "VITE_MATTERHORN_DEPLOYMENT must be web.",
    ),
    check(
      "web.public_beta",
      "The public Beta web mode is explicitly enabled",
      "Release owner",
      enabled("VITE_MATTERHORN_PUBLIC_BETA"),
      "VITE_MATTERHORN_PUBLIC_BETA must be true.",
    ),
    check(
      "web.reviewed_desk_actions",
      "Wallet-reviewed desk actions are explicitly enabled",
      "Release owner",
      enabled("VITE_MATTERHORN_REVIEWED_DESK_ACTIONS_ENABLED"),
      "VITE_MATTERHORN_REVIEWED_DESK_ACTIONS_ENABLED must be true to expose transaction preparation and wallet review in public Beta.",
    ),
    check(
      "web.require_signin",
      "Public web requires a Matterhorn Cloud sign-in before workspace access",
      "Security",
      enabled("VITE_MATTERHORN_REQUIRE_SIGNIN"),
      "VITE_MATTERHORN_REQUIRE_SIGNIN must be true.",
    ),
    check(
      "web.cloud_enabled",
      "Matterhorn Cloud is enabled for the public web account flow",
      "Engineering",
      enabled("VITE_MATTERHORN_CLOUD_ENABLED"),
      "VITE_MATTERHORN_CLOUD_ENABLED must be true.",
    ),
    check(
      "web.app_https",
      "The public application URL uses HTTPS",
      "Engineering",
      isHttpsUrl(appUrl),
      "MATTERHORN_APP_URL must be an HTTPS URL.",
    ),
    check(
      "web.cloud_https",
      "The Matterhorn Cloud sign-in URL uses HTTPS",
      "Engineering",
      isHttpsUrl(cloudUrl),
      "VITE_MATTERHORN_CLOUD_URL must be an HTTPS URL.",
    ),
    check(
      "web.cloud_api_https",
      "The Matterhorn Cloud API URL uses HTTPS",
      "Engineering",
      isHttpsUrl(cloudApiUrl),
      "VITE_MATTERHORN_CLOUD_API_URL must be an HTTPS URL.",
    ),
    check(
      "web.cloud_same_origin",
      "The account UI stays on the public application origin",
      "Security",
      Boolean(app && cloud && cloud.origin === app.origin),
      "VITE_MATTERHORN_CLOUD_URL must use the exact MATTERHORN_APP_URL origin.",
    ),
    check(
      "web.cloud_api_same_origin",
      "The browser account API uses the same-origin /api/den proxy",
      "Security",
      Boolean(app && cloudApi && cloudApi.origin === app.origin && cloudApi.pathname.replace(/\/+$/, "") === "/api/den"),
      "VITE_MATTERHORN_CLOUD_API_URL must be the app origin followed by /api/den.",
    ),
    check(
      "web.no_browser_bearer_credentials",
      "No client or host bearer credential is exposed through a Vite build variable",
      "Security",
      !configuredCredentials,
      configuredCredentials
        ? `Remove these public-build variables: ${configuredCredentials}.`
        : "No browser credential variables are configured.",
    ),
    check(
      "web.same_origin_proxy",
      "No public build variable bypasses the authenticated same-origin proxy",
      "Security",
      !configuredDirectBackend,
      configuredDirectBackend
        ? `Remove these public-build variables: ${configuredDirectBackend}.`
        : "No direct backend build variables are configured.",
    ),
    check(
      "web.proxy_configured",
      "The deployment declares authenticated same-origin API and engine proxy routing",
      "Platform",
      publicProxyMode === "same-origin",
      "MATTERHORN_PUBLIC_PROXY_MODE must be same-origin after /workspaces and /opencode routes are configured. The live deployment probe supplies the proof.",
    ),
    check(
      "web.proxy_upstream",
      "The server-only proxy upstream uses HTTPS",
      "Platform",
      isHttpsUrl(controlPlaneUrl),
      "MATTERHORN_CONTROL_PLANE_URL must be an HTTPS server-only environment variable.",
    ),
    check(
      "web.proxy_secret",
      "The same-origin proxy authenticates to the backend with a server secret",
      "Security",
      proxySecretConfigured,
      "MATTERHORN_PROXY_SECRET must be a high-entropy server-only value of at least 32 characters.",
    ),
    check(
      "signup.inference_provider",
      "The managed ASI:Cloud inference credential is configured server-side",
      "Platform",
      readEnv("CUDOS_API_KEY").length >= 16,
      "CUDOS_API_KEY must be configured in the backend secret manager.",
    ),
    check(
      "signup.account_creation",
      "Public account creation is explicitly enabled",
      "Release owner",
      enabled("MATTERHORN_SIGNUPS_ENABLED"),
      "MATTERHORN_SIGNUPS_ENABLED must be true for an intentional signup launch.",
    ),
    check(
      "signup.capacity",
      "The public beta has an explicit account capacity",
      "Release owner",
      signupCapacity !== null,
      "MATTERHORN_SIGNUP_MAX_ACCOUNTS must be a positive integer.",
    ),
    check(
      "signup.usage_enforcement",
      "Per-account model usage enforcement is fail-closed",
      "Security",
      readEnv("MATTERHORN_MODEL_USAGE_ENFORCEMENT").toLowerCase() === "hard",
      "MATTERHORN_MODEL_USAGE_ENFORCEMENT must be hard before opening signups.",
    ),
    check(
      "signup.user_allowance",
      "Daily and monthly account allowances are explicit and valid",
      "Product",
      Boolean(usageDaily && usageMonthly && usageMonthly >= usageDaily),
      "Set positive MATTERHORN_MODEL_USAGE_DAILY_LIMIT and MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT values; monthly must be at least daily.",
    ),
    check(
      "signup.platform_allowance",
      "Daily and monthly platform spend guards are explicit and valid",
      "Platform",
      Boolean(usageGlobalDaily && usageGlobalMonthly && usageGlobalMonthly >= usageGlobalDaily),
      "Set positive MATTERHORN_MODEL_USAGE_GLOBAL_DAILY_LIMIT and MATTERHORN_MODEL_USAGE_GLOBAL_MONTHLY_LIMIT values; monthly must be at least daily.",
    ),
    check(
      "signup.usage_reservation",
      "Each model request reserves a bounded allowance before dispatch",
      "Security",
      Boolean(
        usageReservation && usageDaily && usageGlobalDaily &&
        usageReservation <= usageDaily && usageReservation <= usageGlobalDaily
      ),
      "MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS must be positive and no greater than either daily limit.",
    ),
  ];
  const blockers = checks.filter((entry) => !entry.passed);

  return {
    version: REPORT_VERSION,
    decision: blockers.length === 0 ? "GO" : "NO-GO",
    ready: blockers.length === 0,
    counts: {
      required: checks.length,
      passed: checks.length - blockers.length,
      blocked: blockers.length,
    },
    checks,
    blockers: blockers.map(({ id, label, owner, status, note }) => ({
      id,
      label,
      owner,
      status,
      note,
    })),
  };
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }

  const report = evaluate();
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${JSON.stringify(report, null, 2)}\n`);
  if (config.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`Matterhorn public Beta web readiness: ${report.decision} (${report.counts.passed}/${report.counts.required} checks passed)\n`);
  if (config.strict && !report.ready) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
