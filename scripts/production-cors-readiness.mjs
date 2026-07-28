#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const REPORT_VERSION = "matterhorn.production-cors-readiness.v1";

const corsEnvKeys = [
  "MATTERHORN_WORK_CORS_ORIGINS",
  "OPENWORK_CORS_ORIGINS",
];

function parseArgs(argv) {
  const config = {
    requireProduction: false,
    json: false,
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

    switch (arg) {
      case "--require-production":
        config.requireProduction = true;
        break;
      case "--json":
        config.json = true;
        break;
      case "--json-output":
        config.jsonOutput = next();
        break;
      case "--help":
      case "-h":
        config.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return config;
}

function help() {
  return [
    "Matterhorn production CORS readiness",
    "",
    "Checks that the local Matterhorn server defaults to loopback CORS and that product/dev launchers do not rely on implicit wildcard CORS.",
    "This command performs no network requests and does not read or print auth tokens.",
    "",
    "Usage:",
    "  pnpm smoke:production-cors-readiness",
    "  node scripts/production-cors-readiness.mjs --require-production",
    "  node scripts/production-cors-readiness.mjs --json-output cors-readiness.json",
    "",
    "Exit behavior:",
    "  Default: exits nonzero when a required source contract is missing or wildcard CORS is active in the current environment.",
    "  --require-production: same exit behavior, with production-oriented report copy for release gates.",
  ].join("\n");
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function status(pass, label, summary, details = {}) {
  return {
    id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    label,
    status: pass ? "pass" : "fail",
    summary,
    ...details,
  };
}

function hasLoopbackCorsArg(source) {
  return /["']--cors["']\s*,\s*["']loopback["']/.test(source);
}

function hasWildcardCorsArg(source) {
  return /["']--cors["']\s*,\s*["']\*["']/.test(source) || /--cors\s+\*/.test(source);
}

function splitCorsOrigins(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function collectEnvCors() {
  return corsEnvKeys
    .map((key) => ({
      key,
      configured: typeof process.env[key] === "string" && process.env[key].trim().length > 0,
      origins: splitCorsOrigins(process.env[key]),
    }))
    .filter((entry) => entry.configured);
}

function runProductionCorsReadiness(config) {
  const packageJson = JSON.parse(readText("package.json"));
  const serverConfig = readText("apps/server/src/config.ts");
  const configAliasesTest = readText("apps/server/src/config.compat-aliases.test.ts");
  const devMatterhornLocal = readText("scripts/dev-matterhorn-local.mjs");
  const devHeadlessWeb = readText("scripts/dev-headless-web.ts");
  const generatedMediaSmoke = readText("scripts/dev-generated-media-smoke.mjs");
  const packageScripts = packageJson.scripts ?? {};
  const envCors = collectEnvCors();
  const wildcardEnv = envCors.filter((entry) => entry.origins.includes("*"));

  const checks = [
    status(
      /\?\?\s*\["loopback"\]/.test(serverConfig),
      "Server default",
      "Server config falls back to loopback CORS when no CLI, env, or file CORS origin is provided.",
      { source: "apps/server/src/config.ts" },
    ),
    status(
      configAliasesTest.includes("defaults CORS to loopback-only development origins") &&
        configAliasesTest.includes('expect(config.corsOrigins).toEqual(["loopback"])'),
      "Config regression test",
      "The server config regression suite locks the loopback default.",
      { source: "apps/server/src/config.compat-aliases.test.ts" },
    ),
    status(
      packageScripts["dev:matterhorn-local"] === "node scripts/dev-matterhorn-local.mjs" &&
        hasLoopbackCorsArg(devMatterhornLocal) &&
        !hasWildcardCorsArg(devMatterhornLocal),
      "Local dev launcher",
      "The local Matterhorn web stack passes --cors loopback instead of wildcard CORS.",
      { source: "scripts/dev-matterhorn-local.mjs" },
    ),
    status(
      packageScripts["dev:generated-media-smoke"] === "node scripts/dev-generated-media-smoke.mjs" &&
        hasLoopbackCorsArg(generatedMediaSmoke) &&
        !hasWildcardCorsArg(generatedMediaSmoke),
      "Generated media smoke launcher",
      "The generated-media browser smoke stack passes --cors loopback instead of wildcard CORS.",
      { source: "scripts/dev-generated-media-smoke.mjs" },
    ),
    status(
      packageScripts["dev:headless-web"] === "OPENWORK_DEV_MODE=1 bun scripts/dev-headless-web.ts" &&
        hasLoopbackCorsArg(devHeadlessWeb) &&
        !hasWildcardCorsArg(devHeadlessWeb),
      "Headless web launcher",
      "The dynamic-port web stack passes --cors loopback instead of relying on a fixed development origin.",
      { source: "scripts/dev-headless-web.ts" },
    ),
    status(
      wildcardEnv.length === 0,
      "Environment CORS",
      wildcardEnv.length === 0
        ? "No active Matterhorn CORS environment variable is set to wildcard."
        : "Wildcard CORS is explicitly configured in the current environment.",
      {
        configuredKeys: envCors.map((entry) => entry.key),
        wildcardKeys: wildcardEnv.map((entry) => entry.key),
      },
    ),
  ];

  const failures = checks.filter((check) => check.status !== "pass");
  return {
    version: REPORT_VERSION,
    ok: failures.length === 0,
    ready: failures.length === 0,
    requireProduction: config.requireProduction,
    metadata: {
      generatedAt: new Date().toISOString(),
      checkedFiles: [
        "apps/server/src/config.ts",
        "apps/server/src/config.compat-aliases.test.ts",
        "scripts/dev-matterhorn-local.mjs",
        "scripts/dev-headless-web.ts",
        "scripts/dev-generated-media-smoke.mjs",
        "package.json",
      ],
    },
    policy: {
      defaultCors: "loopback",
      wildcardAllowedOnlyWhenExplicit: true,
      productionWildcardAllowed: false,
      checkedEnvKeys: corsEnvKeys,
    },
    checks,
    failures: failures.map((check) => ({
      id: check.id,
      label: check.label,
      summary: check.summary,
    })),
  };
}

function emitReport(report, config) {
  const serialized = JSON.stringify(report, null, 2);
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${serialized}\n`);
  if (config.json) {
    process.stdout.write(`${serialized}\n`);
    return;
  }

  process.stdout.write(`Matterhorn production CORS readiness: ${report.ready ? "PASS" : "FAIL"}\n`);
  process.stdout.write("Default CORS: loopback. Wildcard CORS is allowed only when explicitly configured for local development.\n");
  for (const check of report.checks) {
    process.stdout.write(`- ${check.status.toUpperCase()} ${check.label}: ${check.summary}\n`);
  }
  if (config.jsonOutput) process.stdout.write(`JSON report: ${config.jsonOutput}\n`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    console.log(help());
    return;
  }

  const report = runProductionCorsReadiness(config);
  emitReport(report, config);
  if (!report.ok || (config.requireProduction && !report.ready)) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
