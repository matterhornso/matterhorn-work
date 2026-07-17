#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import process from "node:process";

const REPORT_VERSION = "matterhorn.product-hunt-deployment-probe.v1";
const DEFAULT_UNTRUSTED_ORIGIN = "https://untrusted.invalid";

function parseArgs(argv) {
  const config = {
    appUrl: process.env.MATTERHORN_APP_URL ?? "",
    serverUrl: process.env.MATTERHORN_WORK_SERVER_URL ?? "",
    allowedOrigin: process.env.MATTERHORN_APP_ORIGIN ?? "",
    untrustedOrigin: DEFAULT_UNTRUSTED_ORIGIN,
    expectedCommit: process.env.MATTERHORN_BUILD_COMMIT ?? "",
    healthPath: "/health",
    json: false,
    jsonOutput: "",
    strict: false,
    allowLoopbackHttp: false,
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
      case "--app-url": config.appUrl = next(); break;
      case "--server-url": config.serverUrl = next(); break;
      case "--allowed-origin": config.allowedOrigin = next(); break;
      case "--untrusted-origin": config.untrustedOrigin = next(); break;
      case "--expected-commit": config.expectedCommit = next().toLowerCase(); break;
      case "--health-path": config.healthPath = next(); break;
      case "--json": config.json = true; break;
      case "--json-output": config.jsonOutput = next(); break;
      case "--strict": config.strict = true; break;
      case "--allow-loopback-http": config.allowLoopbackHttp = true; break;
      case "--help":
      case "-h": config.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return config;
}

function help() {
  return [
    "Matterhorn Product Hunt deployment probe",
    "",
    "Performs safe live checks against the deployed app and API. It never reads or prints auth tokens.",
    "",
    "Usage:",
    "  pnpm smoke:product-hunt-deployment -- --app-url https://app.example/workspace/ws/session --server-url https://api.example --expected-commit <40-char-sha>",
    "  node scripts/product-hunt-deployment-probe.mjs --app-url $MATTERHORN_APP_URL --server-url $MATTERHORN_WORK_SERVER_URL --strict --json-output deployment.json",
    "",
    "Required in strict mode:",
    "  HTTPS app and API, successful responses, defensive security headers, exact-origin CORS, and rejection of an untrusted origin.",
    "  --allow-loopback-http is only for local contract tests and can never produce production-ready evidence.",
  ].join("\n");
}

function cleanUrl(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  const url = new URL(value);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials.`);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${label} must use HTTP or HTTPS.`);
  url.search = "";
  url.hash = "";
  return url;
}

function cleanOrigin(value, label) {
  const url = cleanUrl(value, label);
  return url.origin;
}

function healthUrlFor(serverUrl, healthPath) {
  if (!healthPath.startsWith("/") || healthPath.startsWith("//")) {
    throw new Error("--health-path must be an absolute path on the configured API origin.");
  }
  const url = new URL(healthPath, serverUrl.origin);
  if (url.origin !== serverUrl.origin) throw new Error("--health-path must stay on the configured API origin.");
  return url;
}

function isLoopback(url) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
}

function publicUrl(url) {
  const copy = new URL(url);
  copy.search = "";
  copy.hash = "";
  copy.username = "";
  copy.password = "";
  return copy.toString();
}

function check(id, label, pass, summary, details = {}) {
  return { id, label, status: pass ? "pass" : "fail", summary, ...details };
}

function headerCheck(prefix, response, options = {}) {
  const headers = response.headers;
  const csp = headers.get("content-security-policy") ?? "";
  const frameProtected = headers.get("x-frame-options")?.toUpperCase() === "DENY" || /frame-ancestors\s+'none'/i.test(csp);
  const cspProtected = frameProtected && /base-uri\s+'none'/i.test(csp) && /object-src\s+'none'/i.test(csp);
  const permissions = headers.get("permissions-policy") ?? "";
  const referrerPolicy = headers.get("referrer-policy")?.toLowerCase() ?? "";
  const checks = [
    check(`${prefix}_nosniff`, "Content type protection", headers.get("x-content-type-options")?.toLowerCase() === "nosniff", "X-Content-Type-Options is nosniff."),
    check(`${prefix}_referrer`, "Referrer policy", ["no-referrer", "strict-origin-when-cross-origin"].includes(referrerPolicy), "Referrer-Policy prevents cross-origin path disclosure."),
    check(`${prefix}_permissions`, "Permissions policy", /camera=\(\)/i.test(permissions) && /microphone=\(\)/i.test(permissions), "Camera and microphone access are disabled by policy."),
    check(`${prefix}_framing`, "Content security policy", cspProtected, "CSP denies framing, base URI changes, and object embedding."),
  ];
  if (options.requireHsts) {
    checks.push(check(`${prefix}_hsts`, "Transport security", /max-age=(?:[1-9]\d*)/i.test(headers.get("strict-transport-security") ?? ""), "Strict-Transport-Security has a positive max-age."));
  }
  return checks;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timeout);
  }
}

async function runProbe(config) {
  const appUrl = cleanUrl(config.appUrl, "--app-url");
  const serverUrl = cleanUrl(config.serverUrl, "--server-url");
  const allowedOrigin = config.allowedOrigin ? cleanOrigin(config.allowedOrigin, "--allowed-origin") : appUrl.origin;
  const untrustedOrigin = cleanOrigin(config.untrustedOrigin, "--untrusted-origin");
  if (!/^[a-f0-9]{40}$/i.test(config.expectedCommit)) {
    throw new Error("--expected-commit must be a full 40-character commit SHA.");
  }
  if (allowedOrigin === untrustedOrigin) throw new Error("The trusted and untrusted origins must differ.");

  const localHttp = appUrl.protocol !== "https:" || serverUrl.protocol !== "https:";
  const localException = config.allowLoopbackHttp && isLoopback(appUrl) && isLoopback(serverUrl);
  const checks = [
    check("https", "HTTPS", !localHttp || localException, localException
      ? "Loopback HTTP is allowed for this local contract run; the report is not production ready."
      : "The app and API use HTTPS."),
  ];

  let appResponse;
  let healthResponse;
  try {
    appResponse = await fetchWithTimeout(appUrl);
    checks.push(check("app_response", "App response", appResponse.ok, `App returned HTTP ${appResponse.status}.`));
    checks.push(check("app_response_origin", "App response origin", new URL(appResponse.url).origin === appUrl.origin, "The app response stays on the configured origin."));
    checks.push(...headerCheck("app", appResponse, { requireHsts: appUrl.protocol === "https:" }));
  } catch (error) {
    checks.push(check("app_response", "App response", false, `App request failed: ${error instanceof Error ? error.message : String(error)}`));
    checks.push(check("app_response_origin", "App response origin", false, "The app response origin could not be verified."));
  }

  const healthUrl = healthUrlFor(serverUrl, config.healthPath);
  try {
    healthResponse = await fetchWithTimeout(healthUrl);
    checks.push(check("api_health", "API health", healthResponse.ok, `API health returned HTTP ${healthResponse.status}.`));
    checks.push(check("api_response_origin", "API response origin", new URL(healthResponse.url).origin === serverUrl.origin, "The API health response stays on the configured origin."));
    const deployedCommit = (healthResponse.headers.get("x-matterhorn-build-commit") ?? "").trim().toLowerCase();
    checks.push(check(
      "api_build_commit",
      "Deployed API commit",
      deployedCommit === config.expectedCommit,
      deployedCommit ? `API reports ${deployedCommit}.` : "API did not report X-Matterhorn-Build-Commit.",
    ));
    checks.push(...headerCheck("api", healthResponse, { requireHsts: serverUrl.protocol === "https:" }));
  } catch (error) {
    checks.push(check("api_health", "API health", false, `API health request failed: ${error instanceof Error ? error.message : String(error)}`));
    checks.push(check("api_response_origin", "API response origin", false, "The API response origin could not be verified."));
    checks.push(check("api_build_commit", "Deployed API commit", false, "API build commit could not be verified."));
  }

  try {
    const trusted = await fetchWithTimeout(healthUrl, {
      method: "OPTIONS",
      headers: { origin: allowedOrigin, "access-control-request-method": "GET" },
    });
    checks.push(check(
      "cors_trusted_origin",
      "Trusted origin CORS",
      trusted.status >= 200 && trusted.status < 300 && trusted.headers.get("access-control-allow-origin") === allowedOrigin,
      "The API preflight echoes only the exact app origin.",
      { statusCode: trusted.status },
    ));
    checks.push(check(
      "cors_vary_origin",
      "CORS cache isolation",
      (trusted.headers.get("vary") ?? "").toLowerCase().split(",").map((value) => value.trim()).includes("origin"),
      "Trusted preflight varies caches by Origin.",
    ));
  } catch (error) {
    checks.push(check("cors_trusted_origin", "Trusted origin CORS", false, `Trusted preflight failed: ${error instanceof Error ? error.message : String(error)}`));
    checks.push(check("cors_vary_origin", "CORS cache isolation", false, "Trusted preflight did not return a response."));
  }

  try {
    const untrusted = await fetchWithTimeout(healthUrl, {
      method: "OPTIONS",
      headers: { origin: untrustedOrigin, "access-control-request-method": "GET" },
    });
    checks.push(check(
      "cors_untrusted_origin",
      "Untrusted origin rejection",
      !untrusted.headers.get("access-control-allow-origin"),
      "The API does not grant CORS access to the untrusted challenge origin.",
      { statusCode: untrusted.status },
    ));
  } catch (error) {
    checks.push(check("cors_untrusted_origin", "Untrusted origin rejection", false, `Untrusted preflight failed: ${error instanceof Error ? error.message : String(error)}`));
  }

  const failures = checks.filter((item) => item.status === "fail");
  const productionReady = failures.length === 0 && !localException && appUrl.protocol === "https:" && serverUrl.protocol === "https:";
  return {
    version: REPORT_VERSION,
    ok: failures.length === 0,
    ready: productionReady,
    metadata: {
      generatedAt: new Date().toISOString(),
      appUrl: publicUrl(appUrl),
      serverUrl: publicUrl(serverUrl),
      healthPath: config.healthPath,
      expectedCommit: config.expectedCommit,
      allowedOrigin,
      untrustedOrigin,
      localContractRun: localException,
    },
    checks,
    failures: failures.map(({ id, label, summary }) => ({ id, label, summary })),
  };
}

function emit(report, config) {
  const serialized = JSON.stringify(report, null, 2);
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${serialized}\n`);
  if (config.json) {
    process.stdout.write(`${serialized}\n`);
    return;
  }
  process.stdout.write(`Matterhorn Product Hunt deployment probe: ${report.ready ? "READY" : report.ok ? "LOCAL CONTRACT PASS" : "BLOCKED"}\n`);
  for (const item of report.checks) process.stdout.write(`- ${item.status.toUpperCase()} ${item.label}: ${item.summary}\n`);
  if (config.jsonOutput) process.stdout.write(`JSON report: ${config.jsonOutput}\n`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    process.stdout.write(`${help()}\n`);
    return;
  }
  const report = await runProbe(config);
  emit(report, config);
  if (!report.ok || (config.strict && !report.ready)) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
