#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import process from "node:process";

const REPORT_VERSION = "matterhorn.product-hunt-rollback-rehearsal.v1";
const DEFAULT_HEADER = "x-matterhorn-build-commit";

function parseArgs(argv) {
  const config = {
    appUrl: process.env.MATTERHORN_APP_URL ?? "",
    serverUrl: process.env.MATTERHORN_WORK_SERVER_URL ?? "",
    fromCommit: "",
    toCommit: "",
    owner: "",
    rollbackHook: "",
    rollbackArgs: [],
    healthPath: "/health",
    versionHeader: DEFAULT_HEADER,
    timeoutMs: 120_000,
    intervalMs: 2_000,
    allowLoopbackHttp: false,
    json: false,
    jsonOutput: "",
    strict: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--rollback-arg=")) {
      const value = arg.slice("--rollback-arg=".length);
      if (!value) throw new Error("--rollback-arg requires a value.");
      config.rollbackArgs.push(value);
      continue;
    }
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--app-url": config.appUrl = next(); break;
      case "--server-url": config.serverUrl = next(); break;
      case "--from-commit": config.fromCommit = next().toLowerCase(); break;
      case "--to-commit": config.toCommit = next().toLowerCase(); break;
      case "--owner": config.owner = next(); break;
      case "--rollback-hook": config.rollbackHook = next(); break;
      case "--rollback-arg": config.rollbackArgs.push(next()); break;
      case "--health-path": config.healthPath = next(); break;
      case "--version-header": config.versionHeader = next().toLowerCase(); break;
      case "--timeout-ms": config.timeoutMs = Number(next()); break;
      case "--interval-ms": config.intervalMs = Number(next()); break;
      case "--allow-loopback-http": config.allowLoopbackHttp = true; break;
      case "--json": config.json = true; break;
      case "--json-output": config.jsonOutput = next(); break;
      case "--strict": config.strict = true; break;
      case "--help":
      case "-h": config.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return config;
}

function help() {
  return [
    "Matterhorn Product Hunt rollback rehearsal",
    "",
    "Verifies the current immutable commit, invokes one explicit no-shell rollback hook, and waits for both app and API health on the target commit.",
    "Hook output and arguments are never copied into the report. Do not put credentials in hook arguments.",
    "",
    "Usage:",
    "  pnpm drill:product-hunt-rollback -- --app-url https://app.example --server-url https://api.example --from-commit <40-char-sha> --to-commit <40-char-sha> --owner <name> --rollback-hook /absolute/path/rollback --rollback-arg=--apply --strict --json-output rollback.json",
    "",
    "Production requirements:",
    "  The API must expose MATTERHORN_BUILD_COMMIT as X-Matterhorn-Build-Commit. HTTPS is mandatory.",
    "  --allow-loopback-http is only for local contract rehearsal and can never create production-ready evidence.",
  ].join("\n");
}

function cleanUrl(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  const url = new URL(value);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials.`);
  url.search = "";
  url.hash = "";
  return url;
}

function isLoopback(url) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
}

function publicUrl(url) {
  const copy = new URL(url);
  copy.search = "";
  copy.hash = "";
  return copy.toString();
}

function healthUrlFor(serverUrl, healthPath) {
  if (!healthPath.startsWith("/") || healthPath.startsWith("//")) {
    throw new Error("--health-path must be an absolute path on the configured API origin.");
  }
  const url = new URL(healthPath, serverUrl.origin);
  if (url.origin !== serverUrl.origin) throw new Error("--health-path must stay on the configured API origin.");
  return url;
}

function validateCommit(value, label) {
  if (!/^[a-f0-9]{40}$/i.test(value)) throw new Error(`${label} must be a full 40-character commit SHA.`);
}

function validate(config, appUrl, serverUrl) {
  validateCommit(config.fromCommit, "--from-commit");
  validateCommit(config.toCommit, "--to-commit");
  if (config.fromCommit === config.toCommit) throw new Error("Rollback commits must differ.");
  if (!config.owner.trim()) throw new Error("--owner is required.");
  if (!config.rollbackHook) throw new Error("--rollback-hook is required.");
  const hookPath = isAbsolute(config.rollbackHook) ? config.rollbackHook : resolve(config.rollbackHook);
  const hookStat = statSync(hookPath);
  if (!hookStat.isFile()) throw new Error("--rollback-hook must point to a file.");
  if ((hookStat.mode & 0o111) === 0) throw new Error("--rollback-hook must be executable.");
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 1_000) throw new Error("--timeout-ms must be at least 1000.");
  if (!Number.isFinite(config.intervalMs) || config.intervalMs < 50) throw new Error("--interval-ms must be at least 50.");
  if (!/^[a-z0-9-]+$/i.test(config.versionHeader)) throw new Error("--version-header must be an HTTP header name.");
  const localException = config.allowLoopbackHttp && isLoopback(appUrl) && isLoopback(serverUrl);
  if ((appUrl.protocol !== "https:" || serverUrl.protocol !== "https:") && !localException) {
    throw new Error("HTTPS app and API URLs are required. Use --allow-loopback-http only for local contract rehearsal.");
  }
  return { hookPath, localException };
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function fetchWithTimeout(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, redirect: "follow", cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function snapshot(appUrl, healthUrl, versionHeader) {
  try {
    const [app, api] = await Promise.all([fetchWithTimeout(appUrl), fetchWithTimeout(healthUrl)]);
    const appOriginOk = new URL(app.url).origin === appUrl.origin;
    const apiOriginOk = new URL(api.url).origin === healthUrl.origin;
    return {
      appOk: app.ok && appOriginOk,
      appStatus: app.status,
      apiOk: api.ok && apiOriginOk,
      apiStatus: api.status,
      commit: (api.headers.get(versionHeader) ?? "").trim().toLowerCase(),
      appOriginOk,
      apiOriginOk,
    };
  } catch (error) {
    return { appOk: false, appStatus: null, apiOk: false, apiStatus: null, commit: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function runHook(path, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(path, args, { shell: false, stdio: "ignore" });
    child.once("error", (error) => resolvePromise({ ok: false, error: error.message }));
    child.once("close", (code, signal) => resolvePromise({ ok: code === 0, code, signal }));
  });
}

async function pollForTarget(config, appUrl, healthUrl) {
  const deadline = Date.now() + config.timeoutMs;
  let consecutive = 0;
  let latest = null;
  while (Date.now() <= deadline) {
    latest = await snapshot(appUrl, healthUrl, config.versionHeader);
    if (latest.appOk && latest.apiOk && latest.commit === config.toCommit) consecutive += 1;
    else consecutive = 0;
    if (consecutive >= 2) return { verified: true, latest };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, config.intervalMs));
  }
  return { verified: false, latest };
}

function check(id, label, pass, detail) {
  return { id, label, status: pass ? "pass" : "fail", detail };
}

async function run(config) {
  const startedAt = Date.now();
  const appUrl = cleanUrl(config.appUrl, "--app-url");
  const serverUrl = cleanUrl(config.serverUrl, "--server-url");
  const { hookPath, localException } = validate(config, appUrl, serverUrl);
  const healthUrl = healthUrlFor(serverUrl, config.healthPath);
  const checks = [];
  const before = await snapshot(appUrl, healthUrl, config.versionHeader);
  const beforeHealthy = before.appOk && before.apiOk;
  const beforeCommitMatches = before.commit === config.fromCommit;
  checks.push(check("preflight_health", "App and API are healthy before rollback", beforeHealthy, {
    appStatus: before.appStatus,
    apiStatus: before.apiStatus,
    appOriginOk: before.appOriginOk,
    apiOriginOk: before.apiOriginOk,
  }));
  checks.push(check("preflight_commit", "API reports the expected source commit", beforeCommitMatches, before.commit || "missing"));

  let hook = { ok: false, skipped: true };
  let after = { verified: false, latest: before };
  if (beforeHealthy && beforeCommitMatches) {
    hook = { ...(await runHook(hookPath, config.rollbackArgs)), skipped: false };
    checks.push(check("rollback_hook", "Rollback hook exits successfully", hook.ok, hook.ok ? "exit 0" : `exit ${hook.code ?? "error"}`));
    if (hook.ok) after = await pollForTarget(config, appUrl, healthUrl);
  } else {
    checks.push(check("rollback_hook", "Rollback hook exits successfully", false, "not run because preflight failed"));
  }
  checks.push(check("target_health", "App and API are healthy on the rollback target", after.verified, {
    appStatus: after.latest?.appStatus ?? null,
    apiStatus: after.latest?.apiStatus ?? null,
    commit: after.latest?.commit || "missing",
  }));

  const failures = checks.filter((item) => item.status === "fail");
  const productionReady = failures.length === 0 && !localException && appUrl.protocol === "https:" && serverUrl.protocol === "https:";
  return {
    version: REPORT_VERSION,
    status: productionReady ? "pass" : failures.length === 0 ? "contract_pass" : "fail",
    ready: productionReady,
    capturedAt: new Date().toISOString(),
    fromCommit: config.fromCommit,
    toCommit: config.toCommit,
    owner: config.owner.trim(),
    healthVerified: after.verified,
    healthVerifiedAt: after.verified ? new Date().toISOString() : null,
    localContractRun: localException,
    appUrl: publicUrl(appUrl),
    serverUrl: publicUrl(serverUrl),
    hook: { file: basename(hookPath), sha256: sha256File(hookPath), argumentsRecorded: false },
    checks,
    durationMs: Date.now() - startedAt,
  };
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) return process.stdout.write(`${help()}\n`);
  const report = await run(config);
  const serialized = JSON.stringify(report, null, 2);
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${serialized}\n`);
  if (config.json) process.stdout.write(`${serialized}\n`);
  else process.stdout.write(`Product Hunt rollback rehearsal: ${report.ready ? "PASS" : report.status === "contract_pass" ? "LOCAL CONTRACT PASS" : "FAIL"}\n`);
  if (report.status === "fail" || (config.strict && !report.ready)) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
