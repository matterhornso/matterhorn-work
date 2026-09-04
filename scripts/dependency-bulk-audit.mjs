#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import process from "node:process";

const DEFAULT_REGISTRY_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";
const DEFAULT_OSV_URL = "https://api.osv.dev";
const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];
const AUDIT_REQUEST_TIMEOUT_MS = 30_000;
const AUDIT_MAX_ATTEMPTS = 3;
const AUDIT_RETRY_DELAYS_MS = [500, 1_500];
const OSV_BATCH_SIZE = 1_000;
const OSV_MAX_PAGES = 20;
const OSV_DETAIL_CONCURRENCY = 8;

function parseArgs(argv) {
  const config = {
    lockfile: null,
    productionOnly: false,
    registryUrl: DEFAULT_REGISTRY_URL,
    osvUrl: DEFAULT_OSV_URL,
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
      case "--osv-url":
        config.osvUrl = next();
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
    "",
    "If npm's bulk advisory service is temporarily unavailable, the audit checks every locked",
    "package/version against OSV.dev. Either source reporting a vulnerability blocks the gate;",
    "an incomplete fallback response or failure of both sources also blocks the gate.",
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
  // Unknown advisory severities must never be interpreted as harmless.
  return SEVERITY_ORDER.includes(severity) ? severity : "critical";
}

function normalizeSeverity(value) {
  const severity = String(value ?? "").trim().toLowerCase();
  if (severity === "medium") return "moderate";
  return SEVERITY_ORDER.includes(severity) ? severity : null;
}

function osvSeverity(vulnerability) {
  const candidates = [
    vulnerability?.database_specific?.severity,
    ...(Array.isArray(vulnerability?.affected)
      ? vulnerability.affected.flatMap((affected) => [
          affected?.ecosystem_specific?.severity,
          affected?.database_specific?.severity,
        ])
      : []),
  ];
  for (const candidate of candidates) {
    const severity = normalizeSeverity(candidate);
    if (severity) return severity;
  }

  for (const entry of Array.isArray(vulnerability?.severity) ? vulnerability.severity : []) {
    const score = Number.parseFloat(String(entry?.score ?? ""));
    if (!Number.isFinite(score)) continue;
    if (score >= 9) return "critical";
    if (score >= 7) return "high";
    if (score >= 4) return "moderate";
    if (score > 0) return "low";
    return "info";
  }

  // A vulnerability record without a machine-readable severity must not slip
  // through a higher threshold. Conservatively block it as critical.
  return "critical";
}

function advisoryId(advisory) {
  return String(advisory?.id ?? advisory?.url?.match(/GHSA-[\w-]+/i)?.[0] ?? "unknown");
}

function npmAdvisories(payload) {
  return Object.entries(payload).flatMap(([packageName, entries]) => {
    if (!Array.isArray(entries)) {
      throw new Error(`npm bulk advisory API returned an invalid advisory list for ${packageName}`);
    }
    return entries.map((advisory) => {
      if (!advisory || typeof advisory !== "object" || Array.isArray(advisory)) {
        throw new Error(`npm bulk advisory API returned an invalid advisory for ${packageName}`);
      }
      return {
        package: packageName,
        id: advisoryId(advisory),
        severity: advisorySeverity(advisory),
        title: String(advisory.title ?? "Untitled advisory"),
        url: typeof advisory.url === "string" ? advisory.url : null,
        vulnerableVersions: String(advisory.vulnerable_versions ?? ""),
      };
    });
  });
}

function retryableAuditError(error) {
  return error?.retryable === true
    || error?.name === "TimeoutError"
    || error?.name === "AbortError"
    || error instanceof TypeError;
}

async function fetchAdvisories(registryUrl, inventory) {
  let lastError;
  for (let attempt = 0; attempt < AUDIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(registryUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "matterhorn-work-dependency-audit/1",
        },
        body: JSON.stringify(inventory),
        signal: AbortSignal.timeout(AUDIT_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const error = new Error(`npm bulk advisory API returned ${response.status}`);
        error.retryable = response.status === 408
          || response.status === 425
          || response.status === 429
          || response.status >= 500;
        throw error;
      }
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("npm bulk advisory API returned an invalid response");
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (!retryableAuditError(error) || attempt === AUDIT_MAX_ATTEMPTS - 1) break;
      await new Promise((resolve) => setTimeout(resolve, AUDIT_RETRY_DELAYS_MS[attempt]));
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  const failure = new Error(`${message} after ${AUDIT_MAX_ATTEMPTS} attempts`);
  failure.retryable = retryableAuditError(lastError);
  throw failure;
}

async function fetchOsvJson(url, init = {}) {
  let lastError;
  for (let attempt = 0; attempt < AUDIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "matterhorn-work-dependency-audit/1",
          ...init.headers,
        },
        signal: AbortSignal.timeout(AUDIT_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        const error = new Error(`OSV API returned ${response.status}`);
        error.retryable = response.status === 408
          || response.status === 425
          || response.status === 429
          || response.status >= 500;
        throw error;
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (!retryableAuditError(error) || attempt === AUDIT_MAX_ATTEMPTS - 1) break;
      await new Promise((resolve) => setTimeout(resolve, AUDIT_RETRY_DELAYS_MS[attempt]));
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${message} after ${AUDIT_MAX_ATTEMPTS} attempts`);
}

function osvQueries(inventory) {
  return Object.entries(inventory).flatMap(([packageName, versions]) =>
    versions.map((version) => ({
      packageName,
      version,
      query: {
        package: { ecosystem: "npm", name: packageName },
        version,
      },
    })),
  );
}

function validateOsvBatch(payload, expectedCount) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.results)) {
    throw new Error("OSV querybatch returned an invalid response");
  }
  if (payload.results.length !== expectedCount) {
    throw new Error(`OSV querybatch returned ${payload.results.length} results for ${expectedCount} queries`);
  }
  for (const result of payload.results) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("OSV querybatch returned an invalid result entry");
    }
    if (result.vulns !== undefined && !Array.isArray(result.vulns)) {
      throw new Error("OSV querybatch returned a non-array vulnerability list");
    }
    if (result.next_page_token !== undefined && typeof result.next_page_token !== "string") {
      throw new Error("OSV querybatch returned an invalid page token");
    }
  }
  return payload.results;
}

async function queryOsvBatch(osvUrl, entries) {
  const matches = new Map();
  let pending = entries.map((entry) => ({ ...entry, pageToken: null, seenTokens: new Set() }));
  for (let page = 0; pending.length > 0; page += 1) {
    if (page >= OSV_MAX_PAGES) {
      throw new Error(`OSV querybatch exceeded ${OSV_MAX_PAGES} pages`);
    }
    const payload = await fetchOsvJson(`${osvUrl.replace(/\/+$/, "")}/v1/querybatch`, {
      method: "POST",
      body: JSON.stringify({
        queries: pending.map(({ query, pageToken }) => pageToken
          ? { ...query, page_token: pageToken }
          : query),
      }),
    });
    const results = validateOsvBatch(payload, pending.length);
    const next = [];
    results.forEach((result, index) => {
      const entry = pending[index];
      for (const vulnerability of result.vulns ?? []) {
        const id = typeof vulnerability?.id === "string" ? vulnerability.id.trim() : "";
        if (!id) throw new Error("OSV querybatch returned a vulnerability without an id");
        const packages = matches.get(id) ?? new Map();
        const versions = packages.get(entry.packageName) ?? new Set();
        versions.add(entry.version);
        packages.set(entry.packageName, versions);
        matches.set(id, packages);
      }
      const token = result.next_page_token;
      if (!token) return;
      if (entry.seenTokens.has(token)) {
        throw new Error("OSV querybatch repeated a page token");
      }
      const seenTokens = new Set(entry.seenTokens);
      seenTokens.add(token);
      next.push({ ...entry, pageToken: token, seenTokens });
    });
    pending = next;
  }
  return matches;
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function fetchOsvAdvisories(osvUrl, inventory) {
  const entries = osvQueries(inventory);
  const matches = new Map();
  for (let offset = 0; offset < entries.length; offset += OSV_BATCH_SIZE) {
    const batchMatches = await queryOsvBatch(osvUrl, entries.slice(offset, offset + OSV_BATCH_SIZE));
    for (const [id, packages] of batchMatches) {
      const accumulated = matches.get(id) ?? new Map();
      for (const [packageName, versions] of packages) {
        const accumulatedVersions = accumulated.get(packageName) ?? new Set();
        for (const version of versions) accumulatedVersions.add(version);
        accumulated.set(packageName, accumulatedVersions);
      }
      matches.set(id, accumulated);
    }
  }

  const vulnerabilityDetails = await mapConcurrent([...matches.keys()], OSV_DETAIL_CONCURRENCY, async (id) => {
    const vulnerability = await fetchOsvJson(
      `${osvUrl.replace(/\/+$/, "")}/v1/vulns/${encodeURIComponent(id)}`,
    );
    if (!vulnerability || typeof vulnerability !== "object" || vulnerability.id !== id) {
      throw new Error(`OSV vulnerability detail mismatch for ${id}`);
    }
    return vulnerability;
  });

  return vulnerabilityDetails.flatMap((vulnerability) => {
    const packages = matches.get(vulnerability.id);
    return [...packages.entries()].map(([packageName, versions]) => ({
      package: packageName,
      id: vulnerability.id,
      severity: osvSeverity(vulnerability),
      title: String(vulnerability.summary ?? vulnerability.details ?? "Untitled advisory")
        .split("\n")[0]
        .slice(0, 300),
      url: Array.isArray(vulnerability.references)
        ? vulnerability.references.find((reference) => typeof reference?.url === "string")?.url
          ?? `https://osv.dev/vulnerability/${encodeURIComponent(vulnerability.id)}`
        : `https://osv.dev/vulnerability/${encodeURIComponent(vulnerability.id)}`,
      vulnerableVersions: [...versions].sort().join(", "),
    }));
  });
}

function buildReport({ inventory, advisories, auditLevel, lockfile, source, fallbackFrom = null }) {
  const sortedAdvisories = advisories.sort((left, right) =>
    SEVERITY_ORDER.indexOf(right.severity) - SEVERITY_ORDER.indexOf(left.severity) ||
    left.package.localeCompare(right.package),
  );
  const threshold = SEVERITY_ORDER.indexOf(auditLevel);
  const blocking = sortedAdvisories.filter(
    (advisory) => SEVERITY_ORDER.indexOf(advisory.severity) >= threshold,
  );
  const summary = Object.fromEntries(SEVERITY_ORDER.map((severity) => [
    severity,
    sortedAdvisories.filter((advisory) => advisory.severity === severity).length,
  ]));
  return {
    version: "matterhorn.dependency-bulk-audit.v1",
    ready: blocking.length === 0,
    source,
    ...(fallbackFrom ? { fallbackFrom } : {}),
    scope: lockfile ? "complete-lockfile" : "installed-production-graph",
    auditLevel,
    packageCount: Object.keys(inventory).length,
    versionCount: Object.values(inventory).reduce((total, versions) => total + versions.length, 0),
    advisoryCount: sortedAdvisories.length,
    blockingCount: blocking.length,
    summary,
    advisories: sortedAdvisories,
  };
}

async function audit(config) {
  const lockfile = config.lockfile ?? (config.productionOnly ? null : "pnpm-lock.yaml");
  const inventory = lockfile
    ? lockfileInventory(readFileSync(lockfile, "utf8"))
    : installedInventory(true);
  try {
    const payload = await fetchAdvisories(config.registryUrl, inventory);
    const advisories = npmAdvisories(payload);
    return buildReport({
      inventory,
      advisories,
      auditLevel: config.auditLevel,
      lockfile,
      source: "npm-bulk-advisory-api",
    });
  } catch (error) {
    if (error?.retryable !== true) throw error;
    const advisories = await fetchOsvAdvisories(config.osvUrl, inventory);
    return buildReport({
      inventory,
      advisories,
      auditLevel: config.auditLevel,
      lockfile,
      source: "osv-api-fallback",
      fallbackFrom: error instanceof Error ? error.message : String(error),
    });
  }
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
    const source = report.source === "osv-api-fallback"
      ? " OSV fallback completed after the npm advisory service was unavailable."
      : "";
    console.log(
      `Dependency audit passed: ${report.versionCount} locked versions, no ${config.auditLevel}+ advisories.${source}`,
    );
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
