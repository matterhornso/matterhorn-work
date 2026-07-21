#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    app: "apps/desktop/dist-electron/mac-arm64/Matterhorn Desks.app",
    artifactDir: "",
    timeoutMs: 45_000,
    strict: false,
    json: false,
    keepUserData: false,
    serverUrl: "",
    token: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--keep-user-data") options.keepUserData = true;
    else if (arg === "--app") options.app = argv[++index] || "";
    else if (arg.startsWith("--app=")) options.app = arg.slice("--app=".length);
    else if (arg === "--artifact-dir") options.artifactDir = argv[++index] || "";
    else if (arg.startsWith("--artifact-dir=")) options.artifactDir = arg.slice("--artifact-dir=".length);
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    else if (arg === "--server-url") options.serverUrl = argv[++index] || "";
    else if (arg.startsWith("--server-url=")) options.serverUrl = arg.slice("--server-url=".length);
    else if (arg === "--token") options.token = argv[++index] || "";
    else if (arg.startsWith("--token=")) options.token = arg.slice("--token=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function helpText() {
  return `Matterhorn packaged desktop clean-profile smoke

Usage:
  node scripts/desktop-packaged-clean-profile-smoke.mjs [options]

Options:
  --app <path>          Matterhorn Desks.app to launch.
  --artifact-dir <dir>  Tester artifact directory containing the ZIP manifest.
  --server-url <url>    Optional Matterhorn backend for remote-connect checks.
  --token <token>       Client token paired with --server-url.
  --timeout-ms <ms>     Startup timeout. Default: 45000.
  --keep-user-data      Preserve the temporary profile for inspection.
  --strict              Exit nonzero when a check fails.
  --json                Print the machine-readable report.
  --help, -h            Show this help text.

The smoke uses an isolated temporary profile and removes it by default.`;
}

function boundedOutput(current, chunk) {
  return `${current}${String(chunk)}`.slice(-20_000);
}

async function waitFor(predicate, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function fetchJson(url, options = {}, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(helpText());
  process.exit(0);
}
let appBundle = path.resolve(options.app);
let artifactSource = null;
let extractionDir = null;
let executable = "";
const checks = [];
const routes = [
  ["route.settings.general", "/settings/general"],
  ["route.settings.extensions", "/settings/extensions"],
  ["route.settings.providers", "/settings/ai"],
  ["route.settings.appearance", "/settings/appearance"],
  ["route.session", "/welcome"],
];
let child = null;
let stdout = "";
let stderr = "";
let userDataDir = null;
let failure = null;
let browserOpenResult = null;
let lastControlSnapshotResult = null;
let lastBrowserSnapshotResult = null;

try {
  if (process.platform !== "darwin") throw new Error("Packaged clean-profile smoke currently requires macOS.");
  if (options.artifactDir) {
    const artifactDir = path.resolve(options.artifactDir);
    const manifest = JSON.parse(await readFile(path.join(artifactDir, "matterhorn-electron-local-tester-artifact.json"), "utf8"));
    const zip = manifest.artifacts?.find((artifact) => artifact?.name?.endsWith(".zip"));
    const localZip = zip?.name ? path.join(artifactDir, zip.name) : "";
    const zipFile = localZip && existsSync(localZip) ? localZip : zip?.file;
    if (!zipFile || !existsSync(zipFile)) throw new Error("Tester artifact manifest does not point to a readable ZIP.");
    extractionDir = await mkdtemp(path.join(os.tmpdir(), "matterhorn-packaged-artifact-"));
    const extracted = spawnSync("ditto", ["-x", "-k", zipFile, extractionDir], { encoding: "utf8" });
    if (extracted.status !== 0) throw new Error(`Could not extract tester artifact ZIP: ${extracted.stderr || extracted.stdout}`);
    appBundle = path.join(extractionDir, "Matterhorn Desks.app");
    artifactSource = zipFile;
  }
  const plistPath = path.join(appBundle, "Contents", "Info.plist");
  const plistResult = spawnSync("plutil", ["-convert", "json", "-o", "-", plistPath], { encoding: "utf8" });
  if (plistResult.status !== 0) throw new Error("Could not inspect the packaged Matterhorn URL schemes.");
  const plist = JSON.parse(plistResult.stdout);
  const executableName = typeof plist.CFBundleExecutable === "string"
    ? plist.CFBundleExecutable.trim()
    : "";
  if (!executableName) throw new Error("Packaged Matterhorn bundle does not declare CFBundleExecutable.");
  executable = path.join(appBundle, "Contents", "MacOS", executableName);
  if (!existsSync(executable)) throw new Error(`Packaged Matterhorn executable not found: ${executable}`);
  const protocolSchemes = (plist.CFBundleURLTypes ?? []).flatMap((entry) => entry?.CFBundleURLSchemes ?? []);
  if (!protocolSchemes.includes("matterhorn-work")) {
    throw new Error("Packaged Matterhorn does not register the matterhorn-work URL scheme.");
  }
  checks.push({ id: "protocol.matterhorn_work", status: "pass" });

  userDataDir = await mkdtemp(path.join(os.tmpdir(), "matterhorn-packaged-clean-profile-"));
  child = spawn(executable, [], {
    cwd: path.dirname(executable),
    env: {
      ...process.env,
      MATTERHORN_WORK_ELECTRON_USERDATA: userDataDir,
      OPENWORK_DATA_DIR: path.join(userDataDir, "data"),
      OPENWORK_DEV_MODE: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => { stdout = boundedOutput(stdout, chunk); });
  child.stderr?.on("data", (chunk) => { stderr = boundedOutput(stderr, chunk); });

  const discoveryPath = path.join(userDataDir, "matterhorn-work-ui-control.json");
  const discovery = await waitFor(async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Packaged app exited before first-run control was ready (${child.exitCode ?? child.signalCode}).`);
    }
    if (!existsSync(discoveryPath)) return null;
    try {
      return JSON.parse(await readFile(discoveryPath, "utf8"));
    } catch {
      return null;
    }
  }, options.timeoutMs, "packaged first-run control bridge");

  const health = await fetchJson(`${discovery.baseUrl}/health`);
  if (!health.response.ok || health.body?.ok !== true || health.body?.app !== "Matterhorn Desks") {
    throw new Error("Packaged first-run control health did not report Matterhorn Desks ready.");
  }
  checks.push({ id: "control.health", status: "pass" });

  const unauthorized = await fetchJson(`${discovery.baseUrl}/snapshot`);
  if (unauthorized.response.status !== 401) throw new Error("Packaged control snapshot was accessible without its bearer token.");
  checks.push({ id: "control.auth", status: "pass" });

  const headers = {
    authorization: `Bearer ${discovery.token}`,
    "content-type": "application/json",
  };
  const initial = await waitFor(async () => {
    const snapshot = await fetchJson(`${discovery.baseUrl}/snapshot`, { headers });
    if (!snapshot.response.ok || snapshot.body?.ok !== true) return null;
    if (snapshot.body.route !== "/welcome") return null;
    return snapshot;
  }, options.timeoutMs, "fresh packaged profile to reach /welcome");
  checks.push({ id: "first_run.welcome", status: "pass" });

  const actionList = Array.isArray(initial.body?.actions) ? initial.body.actions : [];
  for (const [actionId] of routes) {
    if (!actionList.some((action) => action?.id === actionId && action?.disabled !== true)) {
      throw new Error(`Packaged first-run action is unavailable: ${actionId}`);
    }
  }
  checks.push({ id: "first_run.actions", status: "pass", count: actionList.length });

  for (const [actionId, expectedRoute] of routes) {
    const executed = await fetchJson(`${discovery.baseUrl}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ actionId, args: {} }),
    });
    if (!executed.response.ok || executed.body?.ok !== true) {
      throw new Error(`Packaged first-run action failed: ${actionId}`);
    }
    await waitFor(async () => {
      const snapshot = await fetchJson(`${discovery.baseUrl}/snapshot`, { headers });
      return snapshot.body?.route === expectedRoute ? snapshot.body : null;
    }, 5_000, `${actionId} to reach ${expectedRoute}`);
    checks.push({ id: actionId, status: "pass", route: expectedRoute });
  }

  if (options.serverUrl || options.token) {
    if (!options.serverUrl || !options.token) {
      throw new Error("Packaged deep-link smoke requires both --server-url and --token.");
    }
    const deepLink = new URL("matterhorn-work://connect-remote");
    deepLink.searchParams.set("matterhornHostUrl", options.serverUrl);
    deepLink.searchParams.set("matterhornToken", options.token);
    deepLink.searchParams.set("workerName", "Packaged deep-link smoke");
    deepLink.searchParams.set("autoConnect", "true");
    const opened = spawnSync("open", ["-a", appBundle, deepLink.toString()], {
      encoding: "utf8",
    });
    if (opened.status !== 0) {
      throw new Error("macOS could not deliver the Matterhorn remote-connect link.");
    }

    const connected = await waitFor(async () => {
      const snapshot = await fetchJson(`${discovery.baseUrl}/snapshot`, { headers });
      return /^\/workspace\/[^/]+\/session$/.test(snapshot.body?.route ?? "")
        ? snapshot.body
        : null;
    }, options.timeoutMs, "packaged remote-connect deep link");
    checks.push({ id: "deep_link.launchservices_remote_workspace", status: "pass", route: connected.route });

    const authenticatedWorkspaceActions = await waitFor(async () => {
      const snapshot = await fetchJson(`${discovery.baseUrl}/snapshot`, { headers });
      const actions = Array.isArray(snapshot.body?.actions) ? snapshot.body.actions : [];
      const createTask = actions.find((action) => action?.id === "session.create_task");
      return createTask && createTask.disabled !== true ? actions : null;
    }, options.timeoutMs, "packaged remote workspace authenticated actions");
    checks.push({
      id: "deep_link.authenticated_workspace_actions",
      status: "pass",
      count: authenticatedWorkspaceActions.filter((action) => action?.id?.startsWith("session.")).length,
    });

    const browserActions = await waitFor(async () => {
      const snapshot = await fetchJson(`${discovery.baseUrl}/snapshot`, { headers });
      const actions = Array.isArray(snapshot.body?.actions) ? snapshot.body.actions : [];
      return ["browser.open_panel", "browser.open"].every((id) =>
        actions.some((action) => action?.id === id && action?.disabled !== true),
      ) ? actions : null;
    }, 10_000, "packaged embedded-browser actions");
    checks.push({ id: "browser.actions", status: "pass", count: browserActions.length });

    const browserTargetUrl = `${options.serverUrl.replace(/\/+$/, "")}/health`;
    const openedBrowser = await fetchJson(`${discovery.baseUrl}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        actionId: "browser.open",
        args: { url: browserTargetUrl, newTab: true },
      }),
    });
    browserOpenResult = openedBrowser.body;
    if (!openedBrowser.response.ok || openedBrowser.body?.ok !== true) {
      throw new Error("Packaged embedded browser could not open its loopback health target.");
    }

    const browserState = await waitFor(async () => {
      const controlSnapshot = await fetchJson(`${discovery.baseUrl}/snapshot`, { headers });
      lastControlSnapshotResult = controlSnapshot.body;
      const snapshot = await fetchJson(`${discovery.baseUrl}/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify({ actionId: "browser.snapshot", args: {} }),
      });
      lastBrowserSnapshotResult = snapshot.body;
      const state = snapshot.body?.result;
      const tabs = Array.isArray(state?.tabs) ? state.tabs : [];
      return tabs.some((tab) => tab?.url === browserTargetUrl) ? state : null;
    }, 10_000, "packaged embedded browser navigation");
    checks.push({ id: "browser.loopback_navigation", status: "pass", tabCount: browserState.tabs.length });

    const closedBrowser = await fetchJson(`${discovery.baseUrl}/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ actionId: "browser.close_panel", args: {} }),
    });
    if (!closedBrowser.response.ok || closedBrowser.body?.ok !== true) {
      throw new Error("Packaged embedded browser panel did not close cleanly.");
    }
    checks.push({ id: "browser.close_panel", status: "pass" });
  }

  if (child.exitCode !== null || child.signalCode !== null) throw new Error("Packaged app did not remain running after first-run navigation.");
  checks.push({ id: "process.stable", status: "pass" });
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  if (child) await stopProcess(child);
  if (userDataDir && !options.keepUserData) await rm(userDataDir, { recursive: true, force: true });
  if (extractionDir) await rm(extractionDir, { recursive: true, force: true });
}

const forbiddenRuntimeNoise = [
  "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
  "Cannot find channel \"latest-mac.yml\" update info",
];
for (const text of forbiddenRuntimeNoise) {
  if (!failure && `${stdout}\n${stderr}`.includes(text)) failure = `Packaged first run emitted updater failure noise: ${text}`;
}
if (!failure && options.token && `${stdout}\n${stderr}`.includes(options.token)) {
  failure = "Packaged deep-link smoke exposed its access token in runtime output.";
}

const report = {
  version: "matterhorn.desktop-packaged-clean-profile-smoke.v1",
  generatedAt: new Date().toISOString(),
  ready: !failure,
  appBundle,
  artifactSource,
  summary: { pass: checks.length, fail: failure ? 1 : 0 },
  checks,
  error: failure,
  diagnostics: {
    browserOpenResult,
    lastControlSnapshotResult,
    lastBrowserSnapshotResult,
  },
  userDataRemoved: Boolean(userDataDir && !options.keepUserData),
};

if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  console.log(`Matterhorn packaged clean-profile smoke: ${report.ready ? "READY" : "NOT READY"}`);
  for (const check of checks) console.log(`[${check.status}] ${check.id}`);
  if (failure) console.error(failure);
}

if (options.strict && !report.ready) process.exit(1);
