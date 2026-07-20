import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const clientToken = process.env.MATTERHORN_LOCAL_CLIENT_TOKEN?.trim() || "matterhorn-local-client-token";
const hostToken = process.env.MATTERHORN_LOCAL_HOST_TOKEN?.trim() || "matterhorn-local-host-token";
const preferredServerPort = Number(process.env.MATTERHORN_LOCAL_SERVER_PORT?.trim() || "4105");
const preferredAppPort = Number(process.env.MATTERHORN_LOCAL_APP_PORT?.trim() || "5175");
const workspaceRoot = path.resolve(process.env.MATTERHORN_LOCAL_WORKSPACE?.trim() || rootDir);
const serverConfigPath = process.env.MATTERHORN_LOCAL_SERVER_CONFIG?.trim()
  ? path.resolve(process.env.MATTERHORN_LOCAL_SERVER_CONFIG.trim())
  : "";
const opencodeBaseUrl =
  process.env.MATTERHORN_LOCAL_OPENCODE_URL?.trim() ||
  process.env.OPENWORK_OPENCODE_BASE_URL?.trim() ||
  "";
const detectedOpencodeBin = findInstalledOpencodeBin();
const opencodeBin = process.env.OPENWORK_OPENCODE_BIN?.trim() || detectedOpencodeBin;
const manageOpencode =
  !opencodeBaseUrl &&
  (process.env.OPENWORK_MANAGE_OPENCODE === "1" || Boolean(opencodeBin));

const children = new Set();
let shuttingDown = false;

function printHelp() {
  console.log([
    "Matterhorn Desks local stack",
    "",
    "Environment:",
    "  MATTERHORN_LOCAL_SERVER_PORT=<port>",
    "  MATTERHORN_LOCAL_APP_PORT=<port>",
    "  MATTERHORN_LOCAL_WORKSPACE=<path>",
    "  MATTERHORN_LOCAL_SERVER_CONFIG=<server.json>",
    "  MATTERHORN_LOCAL_CLIENT_TOKEN=<token>",
    "  MATTERHORN_LOCAL_HOST_TOKEN=<token>",
    "  MATTERHORN_LOCAL_OPENCODE_URL=<url>",
    "  MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED=0|1 (local default: 1)",
    "  MATTERHORN_HYPERLIQUID_MAX_ORDER_USDC=<number> (default: 1000)",
    "",
    "A server config is the durable source of truth for multi-workspace launches.",
  ].join(os.EOL));
}

function opencodeSetupHintLines() {
  return [
    "OpenCode engine: not connected. Chats and desk tasks will show Needs setup.",
    "To enable execution, start with one of:",
    "  MATTERHORN_LOCAL_OPENCODE_URL=http://127.0.0.1:<port> pnpm dev:matterhorn-local",
    "  OPENWORK_MANAGE_OPENCODE=1 pnpm dev:matterhorn-local",
  ];
}

function canConnect(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(350);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

async function findPort(preferred) {
  for (let offset = 0; offset < 30; offset += 1) {
    const candidate = preferred + offset;
    if (!(await canConnect(candidate))) return candidate;
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a local port"));
      });
    });
  });
}

function spawnChild(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  children.add(child);

  const prefix = `[${label}]`;
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(String(chunk).split("\n").map((line) => line ? `${prefix} ${line}` : line).join("\n"));
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(String(chunk).split("\n").map((line) => line ? `${prefix} ${line}` : line).join("\n"));
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
      console.error(`${prefix} stopped with ${detail}`);
      void shutdown(1);
    }
  });
  child.once("error", (error) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`${prefix} failed to start: ${error.message}`);
      void shutdown(1);
    }
  });

  return child;
}

function opencodePlatformSubdir() {
  if (process.platform === "darwin" && process.arch === "arm64") return "darwin-arm64";
  if (process.platform === "darwin" && process.arch === "x64") return "darwin-x64";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  if (process.platform === "linux" && process.arch === "arm64") return "linux-arm64";
  if (process.platform === "win32" && process.arch === "x64") return "windows-x64";
  return "";
}

function findInstalledOpencodeBin() {
  const platformSubdir = opencodePlatformSubdir();
  if (!platformSubdir) return "";

  const sidecarsDir = path.join(os.homedir(), ".openwork", "openwork-orchestrator", "sidecars", "opencode");
  if (!existsSync(sidecarsDir)) return "";

  try {
    const versions = readdirSync(sidecarsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

    for (const version of versions) {
      const candidate = path.join(sidecarsDir, version, platformSubdir, process.platform === "win32" ? "opencode.exe" : "opencode");
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    return "";
  }

  return "";
}

async function waitForJson(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 1_500;
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (response.ok) {
        const payload = await response.json();
        if (!options.accept || options.accept(payload)) return payload;
        lastError = options.pendingMessage || "response is not ready";
      } else {
        lastError = `${response.status} ${response.statusText}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError})` : ""}`);
}

function workspaceEngineReady(payload) {
  const summary = payload?.summary;
  const blockingChecks = Array.isArray(summary?.blockingChecks) ? summary.blockingChecks : [];
  return summary?.readinessStatus === "working" && !blockingChecks.includes("opencode_connection");
}

async function waitForHttp(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError})` : ""}`);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of Array.from(children)) {
    child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const child of Array.from(children)) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }

  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void shutdown(0);
  });
}

function serverCommand() {
  if (process.env.MATTERHORN_LOCAL_USE_SERVER_BINARY !== "1") {
    const probe = spawnSync("bun", ["--version"], { stdio: "ignore" });
    if (probe.status === 0) {
      return { command: "bun", args: [path.join(rootDir, "apps", "server", "src", "cli.ts")] };
    }
  }
  const binary = path.join(rootDir, "apps", "server", "dist", "bin", "matterhorn-work-server");
  if (existsSync(binary)) return { command: binary, args: [] };
  return { command: "bun", args: [path.join(rootDir, "apps", "server", "src", "cli.ts")] };
}

function appCommand(appPort) {
  const appDir = path.join(rootDir, "apps", "app");
  const viteBin = path.join(appDir, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  const viteArgs = [
    "--host",
    "127.0.0.1",
    "--port",
    String(appPort),
    "--strictPort",
  ];

  if (existsSync(viteBin)) {
    return { command: viteBin, args: viteArgs, cwd: appDir };
  }

  const viteJs = path.join(appDir, "node_modules", "vite", "bin", "vite.js");
  if (existsSync(viteJs)) {
    return { command: process.execPath, args: [viteJs, ...viteArgs], cwd: appDir };
  }

  return {
    command: "npx",
    args: [
      "pnpm@10.27.0",
      "--filter",
      "@matterhorn-work/app",
      "exec",
      "vite",
      ...viteArgs,
    ],
    cwd: rootDir,
  };
}

async function main() {
  if (process.argv.slice(2).some((value) => value === "--help" || value === "-h")) {
    printHelp();
    return;
  }
  if (!existsSync(workspaceRoot)) {
    throw new Error(`Workspace path does not exist: ${workspaceRoot}`);
  }
  if (serverConfigPath && !existsSync(serverConfigPath)) {
    throw new Error(`Matterhorn server config does not exist: ${serverConfigPath}`);
  }

  const serverPort = await findPort(preferredServerPort);
  const appPort = await findPort(preferredAppPort);
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const appUrl = `http://127.0.0.1:${appPort}`;
  const { command, args: baseServerArgs } = serverCommand();
  const serverArgs = [
    ...baseServerArgs,
    "--host", "127.0.0.1",
    "--port", String(serverPort),
    "--token", clientToken,
    "--host-token", hostToken,
    ...(serverConfigPath ? ["--config", serverConfigPath] : ["--workspace", workspaceRoot]),
    "--approval", "auto",
    "--approval-timeout", "30000",
    "--cors", "loopback",
    "--opencode-directory", workspaceRoot,
    "--log-format", "pretty",
    "--no-log-requests",
  ];

  if (opencodeBaseUrl) {
    serverArgs.push("--opencode-base-url", opencodeBaseUrl);
  }

  console.log("Starting Matterhorn Desks local stack...");
  console.log(`Workspace: ${workspaceRoot}`);
  if (opencodeBaseUrl) {
    console.log(`OpenCode engine: ${opencodeBaseUrl}`);
  } else if (manageOpencode) {
    console.log(opencodeBin ? `OpenCode engine: managed local sidecar (${opencodeBin})` : "OpenCode engine: managed from PATH");
  } else {
    console.log(opencodeSetupHintLines().join(os.EOL));
  }

  spawnChild("server", command, serverArgs, {
    env: {
      ...process.env,
      OPENWORK_DEV_MODE: "1",
      MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED: process.env.MATTERHORN_HYPERLIQUID_EXECUTION_ENABLED ?? "1",
      ...(manageOpencode ? { OPENWORK_MANAGE_OPENCODE: "1" } : {}),
      ...(opencodeBin ? { OPENWORK_OPENCODE_BIN: opencodeBin } : {}),
    },
  });

  await waitForJson(`${serverUrl}/health`, { timeoutMs: 45_000 });
  const workspaceList = await waitForJson(`${serverUrl}/workspaces`, {
    timeoutMs: 45_000,
    requestTimeoutMs: 20_000,
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  const activeWorkspaceId =
    String(workspaceList.activeId ?? "").trim() ||
    String(workspaceList.items?.[0]?.id ?? workspaceList.workspaces?.[0]?.id ?? "").trim();

  if (!activeWorkspaceId) {
    throw new Error("Matterhorn Desks server started, but it did not report an active workspace.");
  }

  if (opencodeBaseUrl || manageOpencode) {
    console.log("Waiting for workspace agent engine readiness...");
    await waitForJson(
      `${serverUrl}/workspace/${encodeURIComponent(activeWorkspaceId)}/backend/control-plane`,
      {
        timeoutMs: 60_000,
        requestTimeoutMs: 20_000,
        headers: { Authorization: `Bearer ${clientToken}` },
        accept: workspaceEngineReady,
        pendingMessage: "workspace agent engine is still starting",
      },
    );
    console.log("Workspace agent engine is ready.");
  }

  const app = appCommand(appPort);
  spawnChild("app", app.command, app.args, {
    cwd: app.cwd,
    env: {
      ...process.env,
      CI: "true",
      OPENWORK_DEV_MODE: "1",
      VITE_MATTERHORN_WORK_URL: serverUrl,
      VITE_MATTERHORN_WORK_TOKEN: clientToken,
      VITE_MATTERHORN_WORK_HOST_TOKEN: hostToken,
      VITE_MATTERHORN_WORK_FORCE_SETTINGS: "1",
    },
  });

  await waitForHttp(appUrl, { timeoutMs: 45_000 });

  const directUrl = `${appUrl}/workspace/${encodeURIComponent(activeWorkspaceId)}/session`;
  const lines = [
    "",
    "Matterhorn Desks local app is ready.",
    `App:       ${directUrl}`,
    `Server:    ${serverUrl}`,
    `Workspace: ${workspaceRoot}`,
    `Client token: ${clientToken}`,
    `Host token:   ${hostToken}`,
    ...(opencodeBaseUrl || manageOpencode ? [] : ["", ...opencodeSetupHintLines()]),
    "",
    "Keep this command running while you test the app.",
    "",
  ];
  console.log(lines.join(os.EOL));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  void shutdown(1);
});
