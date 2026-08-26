import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createManagedOpencodeServer,
  createManagedProcessClose,
  type ManagedOpencodeServer,
} from "./managed-opencode.js";

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});

async function waitFor(predicate: () => boolean, timeoutMs = 4_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await Bun.sleep(20);
  }
  throw new Error("Timed out waiting for managed OpenCode recovery");
}

describe("managed OpenCode supervisor", () => {
  test("restarts the managed engine after consecutive bounded health failures", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "matterhorn-managed-opencode-"));
    const executable = path.join(root, "fake-opencode.mjs");
    const attemptFile = path.join(root, "attempt.txt");
    await writeFile(executable, `#!/usr/bin/env node
import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
const value = Number.parseInt((() => { try { return readFileSync(process.env.FAKE_ATTEMPT_FILE, "utf8"); } catch { return "0"; } })(), 10) || 0;
const attempt = value + 1;
writeFileSync(process.env.FAKE_ATTEMPT_FILE, String(attempt));
if (attempt === Number(process.env.FAKE_FAIL_START_ATTEMPT || "0")) process.exit(2);
const args = process.argv.slice(2);
const readArg = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const hostname = readArg("--hostname", "127.0.0.1");
const port = Number(readArg("--port", "0"));
const server = http.createServer((request, response) => {
  if (request.url === "/global/health" && attempt === 1) { response.writeHead(503); response.end("unhealthy"); return; }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ healthy: true, attempt }));
});
server.listen(port, hostname, () => console.log("opencode server listening on http://" + hostname + ":" + port));
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
`, "utf8");
    await chmod(executable, 0o755);

    let managed: ManagedOpencodeServer | null = null;
    cleanups.push(async () => {
      await managed?.close();
      await rm(root, { recursive: true, force: true });
    });

    managed = await createManagedOpencodeServer({
      bin: executable,
      cwd: root,
      env: { FAKE_ATTEMPT_FILE: attemptFile },
      timeoutMs: 5_000,
      healthCheckIntervalMs: 30,
      healthCheckTimeoutMs: 100,
      healthFailureThreshold: 2,
      restartDelayMs: 10,
      maxRestartDelayMs: 40,
    });

    const initialPid = managed.pid;
    await waitFor(() => managed?.status().restartCount === 1);
    const recovered = managed.status();
    expect(recovered.running).toBe(true);
    expect(recovered.pid).not.toBe(initialPid);
    expect(recovered.restartFailureCount).toBe(0);
    expect(recovered.consecutiveHealthFailures).toBe(0);
    expect(recovered.lastRestartReason).toBe("health_probe_failed");
    expect(recovered.lastRestartAt).toBeString();
    expect(Number.parseInt(await readFile(attemptFile, "utf8"), 10)).toBe(2);

    const response = await fetch(`${managed.url}/global/health`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${managed.username}:${managed.password}`).toString("base64")}`,
      },
    });
    expect(response.status).toBe(200);

    await managed.close();
    const restartCount = managed.status().restartCount;
    await Bun.sleep(120);
    expect(managed.status().restartCount).toBe(restartCount);
  });

  test("retries with backoff when the first replacement process fails to start", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "matterhorn-managed-opencode-retry-"));
    const executable = path.join(root, "fake-opencode.mjs");
    const attemptFile = path.join(root, "attempt.txt");
    await writeFile(executable, `#!/usr/bin/env node
import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
const value = Number.parseInt((() => { try { return readFileSync(process.env.FAKE_ATTEMPT_FILE, "utf8"); } catch { return "0"; } })(), 10) || 0;
const attempt = value + 1;
writeFileSync(process.env.FAKE_ATTEMPT_FILE, String(attempt));
if (attempt === Number(process.env.FAKE_FAIL_START_ATTEMPT || "0")) process.exit(2);
const args = process.argv.slice(2);
const readArg = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const hostname = readArg("--hostname", "127.0.0.1");
const port = Number(readArg("--port", "0"));
const server = http.createServer((request, response) => {
  if (request.url === "/global/health" && attempt === 1) { response.writeHead(503); response.end("unhealthy"); return; }
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ healthy: true, attempt }));
});
server.listen(port, hostname, () => console.log("opencode server listening on http://" + hostname + ":" + port));
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
`, "utf8");
    await chmod(executable, 0o755);

    let managed: ManagedOpencodeServer | null = null;
    cleanups.push(async () => {
      await managed?.close();
      await rm(root, { recursive: true, force: true });
    });

    managed = await createManagedOpencodeServer({
      bin: executable,
      cwd: root,
      env: {
        FAKE_ATTEMPT_FILE: attemptFile,
        FAKE_FAIL_START_ATTEMPT: "2",
      },
      timeoutMs: 5_000,
      healthCheckIntervalMs: 30,
      healthCheckTimeoutMs: 100,
      healthFailureThreshold: 2,
      restartDelayMs: 10,
      maxRestartDelayMs: 40,
    });

    await waitFor(() => managed?.status().restartCount === 1, 5_000);
    const recovered = managed.status();
    expect(recovered.running).toBe(true);
    expect(recovered.restartFailureCount).toBe(1);
    expect(recovered.lastRestartReason).toBe("restart_failed");
    expect(Number.parseInt(await readFile(attemptFile, "utf8"), 10)).toBe(3);
  });

  test("escalates an unresponsive child once and keeps close idempotent", async () => {
    const signals: Array<NodeJS.Signals | number | undefined> = [];
    let exitListener: ((code: number | null, signal: NodeJS.Signals | null) => void) | null = null;
    const child = {
      exitCode: null,
      signalCode: null,
      killed: false,
      kill(signal?: NodeJS.Signals | number) {
        signals.push(signal);
        if (signal === "SIGKILL") exitListener?.(null, "SIGKILL");
        return true;
      },
      once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void) {
        expect(event).toBe("exit");
        exitListener = listener;
        return child;
      },
    };
    const lifecycle = createManagedProcessClose(child, { termTimeoutMs: 5, killTimeoutMs: 20 });

    await Promise.all([lifecycle.close(), lifecycle.close()]);

    expect(signals).toEqual(["SIGTERM", "SIGKILL"]);
    expect(lifecycle.isAlive()).toBe(false);
  });

  test("does not pass workspace credential-encryption keys to the model engine", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "matterhorn-managed-opencode-env-"));
    const executable = path.join(root, "fake-opencode.mjs");
    const envFile = path.join(root, "engine-env.json");
    await writeFile(executable, `#!/usr/bin/env node
import http from "node:http";
import { writeFileSync } from "node:fs";
writeFileSync(process.env.FAKE_ENV_FILE, JSON.stringify({
  matterhorn: process.env.MATTERHORN_ENCRYPTION_KEY ?? null,
  openwork: process.env.OPENWORK_ENCRYPTION_KEY ?? null,
  runtime: process.env.FAKE_RUNTIME_SETTING ?? null,
}));
const args = process.argv.slice(2);
const readArg = (name, fallback) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const hostname = readArg("--hostname", "127.0.0.1");
const port = Number(readArg("--port", "0"));
const server = http.createServer((_request, response) => { response.writeHead(200); response.end("ok"); });
server.listen(port, hostname, () => console.log("opencode server listening on http://" + hostname + ":" + port));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`, "utf8");
    await chmod(executable, 0o755);
    const previousMatterhornKey = process.env.MATTERHORN_ENCRYPTION_KEY;
    const previousOpenworkKey = process.env.OPENWORK_ENCRYPTION_KEY;
    process.env.MATTERHORN_ENCRYPTION_KEY = "must-not-reach-engine";
    process.env.OPENWORK_ENCRYPTION_KEY = "must-not-reach-engine";
    let managed: ManagedOpencodeServer | null = null;
    try {
      managed = await createManagedOpencodeServer({
        bin: executable,
        cwd: root,
        env: {
          FAKE_ENV_FILE: envFile,
          FAKE_RUNTIME_SETTING: "allowed",
          MATTERHORN_ENCRYPTION_KEY: "also-blocked",
          OPENWORK_ENCRYPTION_KEY: "also-blocked",
        },
      });
      expect(JSON.parse(await readFile(envFile, "utf8"))).toEqual({
        matterhorn: null,
        openwork: null,
        runtime: "allowed",
      });
    } finally {
      await managed?.close();
      if (previousMatterhornKey === undefined) delete process.env.MATTERHORN_ENCRYPTION_KEY;
      else process.env.MATTERHORN_ENCRYPTION_KEY = previousMatterhornKey;
      if (previousOpenworkKey === undefined) delete process.env.OPENWORK_ENCRYPTION_KEY;
      else process.env.OPENWORK_ENCRYPTION_KEY = previousOpenworkKey;
      await rm(root, { recursive: true, force: true });
    }
  });
});
