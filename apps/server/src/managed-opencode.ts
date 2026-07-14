import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import { randomUUID } from "node:crypto";

export type ManagedOpencodeServer = {
  url: string;
  username: string;
  password: string;
  readonly pid: number | null;
  status: () => ManagedOpencodeStatus;
  close: () => void;
};

export type ManagedOpencodeStatus = {
  running: boolean;
  pid: number | null;
  restartCount: number;
  restartFailureCount: number;
  consecutiveHealthFailures: number;
  lastRestartReason: string | null;
  lastRestartAt: string | null;
};

export type ManagedOpencodeEvent =
  | { type: "health_failure"; consecutiveFailures: number; threshold: number }
  | { type: "restart_scheduled"; reason: string; delayMs: number }
  | { type: "restarted"; reason: string; restartCount: number; pid: number | null }
  | { type: "restart_failed"; reason: string; message: string };

function randomSecret(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

async function findFreePort(hostname: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Failed to resolve free port"));
      });
    });
  });
}

export async function createManagedOpencodeServer(options: {
  bin?: string;
  cwd: string;
  hostname?: string;
  port?: number;
  timeoutMs?: number;
  healthCheckIntervalMs?: number;
  healthCheckTimeoutMs?: number;
  healthFailureThreshold?: number;
  restartDelayMs?: number;
  maxRestartDelayMs?: number;
  env?: Record<string, string | undefined>;
  onEvent?: (event: ManagedOpencodeEvent) => void;
}): Promise<ManagedOpencodeServer> {
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? await findFreePort(hostname);
  const username = randomSecret();
  const password = randomSecret();
  const args = ["serve", "--hostname", hostname, "--port", String(port), "--cors", "*"];
  const url = `http://${hostname}:${port}`;
  const healthCheckIntervalMs = Math.max(25, options.healthCheckIntervalMs ?? 5_000);
  const healthCheckTimeoutMs = Math.max(25, options.healthCheckTimeoutMs ?? 1_500);
  const healthFailureThreshold = Math.max(1, options.healthFailureThreshold ?? 3);
  const restartDelayMs = Math.max(10, options.restartDelayMs ?? 500);
  const maxRestartDelayMs = Math.max(restartDelayMs, options.maxRestartDelayMs ?? 10_000);
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  let child: ChildProcess | null = null;
  let stopped = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;
  let probeInFlight = false;
  let restarting = false;
  let restartCount = 0;
  let restartFailureCount = 0;
  let consecutiveHealthFailures = 0;
  let lastRestartReason: string | null = null;
  let lastRestartAt: string | null = null;

  const spawnChild = async (): Promise<ChildProcess> => {
    const nextChild = spawn(options.bin?.trim() || "opencode", args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        OPENCODE_SERVER_USERNAME: username,
        OPENCODE_SERVER_PASSWORD: password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Timeout waiting for OpenCode server after ${options.timeoutMs ?? 15_000}ms`)),
          options.timeoutMs ?? 15_000,
        );
        let output = "";
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        };
        nextChild.stdout?.on("data", (chunk) => {
          output += chunk.toString();
          for (const line of output.split("\n")) {
            if (!line.startsWith("opencode server listening")) continue;
            const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
            if (!match?.[1]) return fail(new Error(`Failed to parse OpenCode server URL from: ${line}`));
            if (match[1].replace(/\/+$/, "") !== url) {
              return fail(new Error(`Managed OpenCode listened on an unexpected URL: ${match[1]}`));
            }
            done();
          }
        });
        nextChild.stderr?.on("data", (chunk) => {
          output += chunk.toString();
        });
        nextChild.once("error", (error) => fail(error));
        nextChild.once("exit", (code) => {
          fail(new Error(`OpenCode server exited with code ${code}${output.trim() ? `\n${output}` : ""}`));
        });
      });
    } catch (error) {
      if (!nextChild.killed && nextChild.exitCode === null) nextChild.kill("SIGKILL");
      throw error;
    }

    return nextChild;
  };

  const restartBackoffMs = () => Math.min(
    maxRestartDelayMs,
    restartDelayMs * (2 ** Math.min(restartCount + restartFailureCount, 5)),
  );

  const scheduleRestart = (reason: string) => {
    if (stopped || restarting || restartTimer) return;
    const delayMs = restartBackoffMs();
    options.onEvent?.({ type: "restart_scheduled", reason, delayMs });
    restartTimer = setTimeout(async () => {
      restartTimer = null;
      if (stopped) return;
      restarting = true;
      const previous = child;
      child = null;
      if (previous && !previous.killed) previous.kill("SIGKILL");
      try {
        const nextChild = await spawnChild();
        if (stopped) {
          nextChild.kill("SIGTERM");
          return;
        }
        child = nextChild;
        restartCount += 1;
        consecutiveHealthFailures = 0;
        lastRestartReason = reason;
        lastRestartAt = new Date().toISOString();
        options.onEvent?.({ type: "restarted", reason, restartCount, pid: nextChild.pid ?? null });
        nextChild.once("exit", () => {
          if (!stopped && child === nextChild) {
            child = null;
            scheduleRestart("process_exit");
          }
        });
      } catch (error) {
        options.onEvent?.({
          type: "restart_failed",
          reason,
          message: error instanceof Error ? error.message : String(error),
        });
        restartFailureCount += 1;
        restarting = false;
        scheduleRestart("restart_failed");
        return;
      } finally {
        restarting = false;
      }
    }, delayMs);
    restartTimer.unref?.();
  };

  child = await spawnChild();
  child.once("exit", () => {
    if (!stopped && child) {
      child = null;
      scheduleRestart("process_exit");
    }
  });

  healthTimer = setInterval(async () => {
    if (stopped || restarting || probeInFlight || !child) return;
    probeInFlight = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), healthCheckTimeoutMs);
    try {
      const response = await fetch(`${url}/global/health`, {
        signal: controller.signal,
        headers: { Authorization: authorization },
      });
      if (!response.ok) throw new Error(`health_${response.status}`);
      consecutiveHealthFailures = 0;
    } catch {
      consecutiveHealthFailures += 1;
      options.onEvent?.({
        type: "health_failure",
        consecutiveFailures: consecutiveHealthFailures,
        threshold: healthFailureThreshold,
      });
      if (consecutiveHealthFailures >= healthFailureThreshold) {
        scheduleRestart("health_probe_failed");
      }
    } finally {
      clearTimeout(timeout);
      probeInFlight = false;
    }
  }, healthCheckIntervalMs);
  healthTimer.unref?.();

  return {
    url,
    username,
    password,
    get pid() {
      return child?.pid ?? null;
    },
    status() {
      return {
        running: Boolean(child && child.exitCode === null && !child.killed),
        pid: child?.pid ?? null,
        restartCount,
        restartFailureCount,
        consecutiveHealthFailures,
        lastRestartReason,
        lastRestartAt,
      };
    },
    close() {
      stopped = true;
      if (healthTimer) clearInterval(healthTimer);
      if (restartTimer) clearTimeout(restartTimer);
      if (child && !child.killed) child.kill("SIGTERM");
      child = null;
    },
  };
}
