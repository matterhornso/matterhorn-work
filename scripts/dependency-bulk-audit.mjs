#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import process from "node:process";

const DEFAULT_REGISTRY_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];

function parseArgs(argv) {
  const config = {
    lockfile: null,
    productionOnly: false,
    registryUrl: DEFAULT_REGISTRY_URL,
    auditLevel: "low",
    json: false,
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
      case "--lockfile":
        config.lockfile = next();
        break;
      case "--registry-url":
        config.registryUrl = next();
        break;
      case "--audit-level":
        config.auditLevel = next().toLowerCase();
        break;
      case "--json":
        config.json = true;
        break;
      case "--prod":
        config.productionOnly = true;
        break;
      case "--all":
        config.productionOnly = false;
        break;
      case "--help":
      case "-h":
        config.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!SEVERITY_ORDER.includes(config.auditLevel)) {
    throw new Error(`--audit-level must be one of: ${SEVERITY_ORDER.join(", ")}.`);
  }
  return config;
}

function help() {
  return [
    "Matterhorn dependency bulk audit",
    "",
    "Checks the workspace dependency inventory against npm's supported bulk advisory API.",
    "By default, the complete lockfile is audited so build and development dependencies are included",
    "without expanding the recursive workspace graph. Use --prod only for the installed production graph.",
    "",
    "Usage:",
    "  node scripts/dependency-bulk-audit.mjs --all --audit-level=low",
    "  node scripts/dependency-bulk-audit.mjs --prod --audit-level=low",
    "  node scripts/dependency-bulk-audit.mjs --audit-level low --json",
    "  node scripts/dependency-bulk-audit.mjs --lockfile pnpm-lock.yaml --json",
  ].join("\n");
}

function unquoteYamlKey(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function lockfileInventory(lockfileText) {
  const inventory = new Map();
  let inPackages = false;
  for (const line of lockfileText.split(/\r?\n/)) {
    if (line === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages && /^[A-Za-z][^:]*:$/.test(line)) break;
    if (!inPackages) continue;
    const match = line.match(/^  (.+):$/);
    if (!match) continue;
    const key = unquoteYamlKey(match[1]);
    const separator = key.lastIndexOf("@");
    if (separator <= 0) continue;
    const name = key.slice(0, separator);
    const version = key.slice(separator + 1).replace(/\(.+$/, "");
    if (!name || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version)) continue;
    const versions = inventory.get(name) ?? new Set();
    versions.add(version);
    inventory.set(name, versions);
  }
  return Object.fromEntries(
    [...inventory.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, versions]) => [name, [...versions].sort()]),
  );
}

function addInventoryVersion(inventory, packageName, rawVersion) {
  const version = String(rawVersion ?? "").replace(/\(.+$/, "");
  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(version)) return;
  const versions = inventory.get(packageName) ?? new Set();
  versions.add(version);
  inventory.set(packageName, versions);
}

export function packagePathInventory(packagePaths) {
  const inventory = new Map();
  for (const packagePath of packagePaths.split(/\r?\n/)) {
    const match = packagePath.match(/[\\/]node_modules[\\/]\.pnpm[\\/]([^\\/]+)[\\/]node_modules[\\/](.+)$/);
    if (!match) continue;
    const version = match[1].match(/@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?:_|$)/)?.[1];
    const packageName = match[2].replaceAll("\\", "/");
    addInventoryVersion(inventory, packageName, version);
  }
  return Object.fromEntries(
    [...inventory.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, versions]) => [name, [...versions].sort()]),
  );
}

function installedInventory(productionOnly) {
  const args = ["list", "-r"];
  if (productionOnly) args.push("--prod");
  args.push("--parseable", "--depth", "Infinity");
  const packagePaths = execFileSync("pnpm", args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return packagePathInventory(packagePaths);
}

function advisorySeverity(advisory) {
  const severity = String(advisory?.severity ?? "info").toLowerCase();
  return SEVERITY_ORDER.includes(severity) ? severity : "info";
}

function advisoryId(advisory) {
  return String(advisory?.id ?? advisory?.url?.match(/GHSA-[\w-]+/i)?.[0] ?? "unknown");
}

async function audit(config) {
  const lockfile = config.lockfile ?? (config.productionOnly ? null : "pnpm-lock.yaml");
  const inventory = lockfile
    ? lockfileInventory(readFileSync(lockfile, "utf8"))
    : installedInventory(true);
  const response = await fetch(config.registryUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "matterhorn-work-dependency-audit/1",
    },
    body: JSON.stringify(inventory),
  });
  if (!response.ok) {
    throw new Error(`npm bulk advisory API returned ${response.status}`);
  }
  const payload = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("npm bulk advisory API returned an invalid response");
  }

  const advisories = Object.entries(payload).flatMap(([packageName, entries]) =>
    (Array.isArray(entries) ? entries : []).map((advisory) => ({
      package: packageName,
      id: advisoryId(advisory),
      severity: advisorySeverity(advisory),
      title: String(advisory?.title ?? "Untitled advisory"),
      url: typeof advisory?.url === "string" ? advisory.url : null,
      vulnerableVersions: String(advisory?.vulnerable_versions ?? ""),
    })),
  ).sort((left, right) =>
    SEVERITY_ORDER.indexOf(right.severity) - SEVERITY_ORDER.indexOf(left.severity) ||
    left.package.localeCompare(right.package),
  );

  const threshold = SEVERITY_ORDER.indexOf(config.auditLevel);
  const blocking = advisories.filter((advisory) => SEVERITY_ORDER.indexOf(advisory.severity) >= threshold);
  const summary = Object.fromEntries(SEVERITY_ORDER.map((severity) => [
    severity,
    advisories.filter((advisory) => advisory.severity === severity).length,
  ]));
  return {
    version: "matterhorn.dependency-bulk-audit.v1",
    ready: blocking.length === 0,
    source: "npm-bulk-advisory-api",
    scope: lockfile
      ? "complete-lockfile"
      : "installed-production-graph",
    auditLevel: config.auditLevel,
    packageCount: Object.keys(inventory).length,
    versionCount: Object.values(inventory).reduce((total, versions) => total + versions.length, 0),
    advisoryCount: advisories.length,
    blockingCount: blocking.length,
    summary,
    advisories,
  };
}

async function main() {
  const config = parseArgs(process.argv.slice(2).flatMap((arg) => {
    if (!arg.startsWith("--audit-level=")) return [arg];
    return ["--audit-level", arg.slice("--audit-level=".length)];
  }));
  if (config.help) {
    console.log(help());
    return;
  }
  const report = await audit(config);
  if (config.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ready) {
    console.log(`Dependency audit passed: ${report.versionCount} locked versions, no ${config.auditLevel}+ advisories.`);
  } else {
    console.error(`Dependency audit failed: ${report.blockingCount} ${config.auditLevel}+ advisories.`);
    for (const advisory of report.advisories) {
      console.error(`${advisory.severity.toUpperCase()} ${advisory.package} ${advisory.id}: ${advisory.title}`);
    }
  }
  if (!report.ready) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
