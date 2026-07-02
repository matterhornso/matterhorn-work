import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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
const opencodeBaseUrl =
  process.env.MATTERHORN_LOCAL_OPENCODE_URL?.trim() ||
  process.env.OPENWORK_OPENCODE_BASE_URL?.trim() ||
  "";

const children = new Set();
let shuttingDown = false;

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

async function waitForJson(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return await response.json();
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError})` : ""}`);
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

async function main() {
  if (!existsSync(workspaceRoot)) {
    throw new Error(`Workspace path does not exist: ${workspaceRoot}`);
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
    "--workspace", workspaceRoot,
    "--approval", "auto",
    "--approval-timeout", "30000",
    "--cors", "*",
    "--opencode-directory", workspaceRoot,
    "--log-format", "pretty",
    "--no-log-requests",
  ];

  if (opencodeBaseUrl) {
    serverArgs.push("--opencode-base-url", opencodeBaseUrl);
  }

  console.log("Starting Matterhorn Work local stack...");
  console.log(`Workspace: ${workspaceRoot}`);
  if (!opencodeBaseUrl) {
    console.log("OpenCode engine: not provided. Chat creation may stay disabled until an engine is connected.");
  }

  spawnChild("server", command, serverArgs, {
    env: {
      ...process.env,
      OPENWORK_DEV_MODE: "1",
    },
  });

  await waitForJson(`${serverUrl}/health`, { timeoutMs: 45_000 });
  const workspaceList = await waitForJson(`${serverUrl}/workspaces`, {
    timeoutMs: 15_000,
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  const activeWorkspaceId =
    String(workspaceList.activeId ?? "").trim() ||
    String(workspaceList.items?.[0]?.id ?? workspaceList.workspaces?.[0]?.id ?? "").trim();

  if (!activeWorkspaceId) {
    throw new Error("Matterhorn Work server started, but it did not report an active workspace.");
  }

  spawnChild(
    "app",
    "npx",
    [
      "pnpm@10.27.0",
      "--filter",
      "@matterhorn-work/app",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(appPort),
      "--strictPort",
    ],
    {
      env: {
        ...process.env,
        CI: "true",
        OPENWORK_DEV_MODE: "1",
        VITE_MATTERHORN_WORK_URL: serverUrl,
        VITE_MATTERHORN_WORK_TOKEN: clientToken,
        VITE_MATTERHORN_WORK_HOST_TOKEN: hostToken,
        VITE_MATTERHORN_WORK_FORCE_SETTINGS: "1",
      },
    },
  );

  await waitForHttp(appUrl, { timeoutMs: 45_000 });

  const directUrl = `${appUrl}/workspace/${encodeURIComponent(activeWorkspaceId)}/session`;
  const lines = [
    "",
    "Matterhorn Work local app is ready.",
    `App:       ${directUrl}`,
    `Server:    ${serverUrl}`,
    `Workspace: ${workspaceRoot}`,
    `Client token: ${clientToken}`,
    `Host token:   ${hostToken}`,
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
