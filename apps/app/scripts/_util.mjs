import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { realpathSync, statSync } from "node:fs";

import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

export const isolatedOpencodeTestConfig = Object.freeze({
  // Defense in depth alongside OPENCODE_DISABLE_PROJECT_CONFIG below: core e2e
  // coverage never opts into an external plugin.
  plugin: [],
  permission: {
    "*": "deny",
    read: "allow",
  },
});

function resolveBasicAuthHeader() {
  const password = process.env.OPENCODE_SERVER_PASSWORD?.trim() ?? "";
  if (!password) return undefined;
  const username = process.env.OPENCODE_SERVER_USERNAME?.trim() || "opencode";
  const encoded = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

function executableExists(command) {
  if (!command) return false;
  const probe = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !probe.error || probe.error.code !== "ENOENT";
}

export function makeClient({ baseUrl, directory }) {
  const authorization = resolveBasicAuthHeader();
  return createOpencodeClient({
    baseUrl,
    directory,
    headers: authorization ? { Authorization: authorization } : undefined,
    responseStyle: "data",
    throwOnError: true,
  });
}

export async function findFreePort() {
  const server = net.createServer();
  server.unref();

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();

  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("Failed to allocate a free port");
  }

  const port = addr.port;
  server.close();
  return port;
}

export async function spawnOpencodeServe({
  directory,
  hostname = "127.0.0.1",
  port,
  corsOrigins = [],
  configContent,
}) {
  assert.ok(directory && directory.trim(), "directory is required");
  assert.ok(Number.isInteger(port) && port > 0, "port must be a positive integer");

  const cwd = realpathSync(directory);
  const args = ["serve", "--hostname", hostname, "--port", String(port)];
  for (const origin of corsOrigins) {
    args.push("--cors", origin);
  }

  const configuredEngineBin =
    process.env.MATTERHORN_WORK_ENGINE_BIN?.trim() ||
    process.env.OPENCODE_BIN?.trim();
  const engineBin = configuredEngineBin || "opencode";

  if (!executableExists(engineBin)) {
    if (configuredEngineBin) {
      throw new Error(
        `Configured Matterhorn Desks engine binary was not found: ${engineBin}. ` +
          "Update MATTERHORN_WORK_ENGINE_BIN or OPENCODE_BIN.",
      );
    }

    console.log(
      "SKIP: Matterhorn Desks engine binary is unavailable. " +
        "Install the engine or set MATTERHORN_WORK_ENGINE_BIN/OPENCODE_BIN to run live app smoke tests.",
    );
    process.exit(0);
  }

  const serializedConfig = configContent === undefined
    ? undefined
    : typeof configContent === "string"
      ? configContent
      : JSON.stringify(configContent);
  const child = spawn(engineBin, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Make it explicit we're a non-TUI client.
      OPENCODE_CLIENT: "matterhorn-work-test",
      ...(serializedConfig
        ? {
            OPENCODE_CONFIG_CONTENT: serializedConfig,
            // OpenCode merges config content after project discovery; an empty
            // plugin array cannot remove an already discovered project plugin.
            OPENCODE_DISABLE_PROJECT_CONFIG: "true",
          }
        : {}),
    },
  });

  const baseUrl = `http://${hostname}:${port}`;

  // OpenCode writes startup diagnostics to both streams depending on platform.
  // Keep a bounded combined tail so CI failures remain actionable.
  let output = "";
  let stderr = "";
  const appendOutput = (chunk) => {
    output = `${output}${String(chunk)}`.slice(-32_768);
  };
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", appendOutput);
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    const text = String(chunk);
    stderr = `${stderr}${text}`.slice(-32_768);
    appendOutput(text);
  });
  child.on("error", (error) => {
    const text = `${error instanceof Error ? error.message : String(error)}\n`;
    stderr = `${stderr}${text}`.slice(-32_768);
    appendOutput(text);
  });

  async function waitForExit(ms) {
    return Promise.race([
      once(child, "exit").then(() => true),
      new Promise((r) => setTimeout(() => r(false), ms)),
    ]);
  }

  return {
    cwd,
    baseUrl,
    child,
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) {
        return;
      }

      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }

      const exited = await waitForExit(2500);
      if (exited) {
        return;
      }

      // Force kill.
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }

      await waitForExit(2500);
    },
    getStderr() {
      return stderr;
    },
    getOutput() {
      return output;
    },
  };
}

export async function waitForHealthy(
  client,
  { timeoutMs = 15_000, pollMs = 250, requestTimeoutMs = 1_500, runtime } = {},
) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < timeoutMs) {
    if (
      runtime?.child &&
      (runtime.child.exitCode !== null || runtime.child.signalCode !== null)
    ) {
      const exit = runtime.child.exitCode === null
        ? `signal ${runtime.child.signalCode}`
        : `exit code ${runtime.child.exitCode}`;
      const diagnostics = runtime.getOutput?.().trim();
      throw new Error(
        `OpenCode exited before /global/health became ready (${exit})` +
          (diagnostics ? `:\n${diagnostics}` : "."),
      );
    }
    try {
      const health = await client.global.health({
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      assert.equal(health.healthy, true);
      assert.ok(typeof health.version === "string");
      return health;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, pollMs));
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  const diagnostics = runtime?.getOutput?.().trim();
  throw new Error(
    `Timed out waiting for /global/health after ${timeoutMs}ms: ${msg}` +
      (diagnostics ? `\nOpenCode output:\n${diagnostics}` : ""),
  );
}

export function normalizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;

  if (typeof raw.type === "string") {
    return { type: raw.type, properties: raw.properties };
  }

  if (raw.payload && typeof raw.payload === "object" && typeof raw.payload.type === "string") {
    return { type: raw.payload.type, properties: raw.payload.properties };
  }

  return null;
}

export function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    args.set(key, value);
  }
  return args;
}

export function canWriteWorkspace(directory) {
  try {
    const stat = statSync(directory);
    return stat && stat.isDirectory();
  } catch {
    return false;
  }
}
