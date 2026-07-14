import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createManagedOpencodeServer, type ManagedOpencodeServer } from "./managed-opencode.js";

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
      managed?.close();
      await rm(root, { recursive: true, force: true });
    });

    managed = await createManagedOpencodeServer({
      bin: executable,
      cwd: root,
      env: { FAKE_ATTEMPT_FILE: attemptFile },
      timeoutMs: 2_000,
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

    managed.close();
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
      managed?.close();
      await rm(root, { recursive: true, force: true });
    });

    managed = await createManagedOpencodeServer({
      bin: executable,
      cwd: root,
      env: {
        FAKE_ATTEMPT_FILE: attemptFile,
        FAKE_FAIL_START_ATTEMPT: "2",
      },
      timeoutMs: 1_500,
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
});
