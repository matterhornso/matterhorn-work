import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createManagedOpencodeServer, type ManagedOpencodeServer, type ManagedOpencodeEvent } from "./managed-opencode.js";

function alive(pid: number) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitFor<T>(read: () => Promise<T | undefined>, timeoutMs = 4000): Promise<T> {
  const stop = Date.now() + timeoutMs;
  while (Date.now() < stop) {
    const result = await read();
    if (result !== undefined) return result;
    await Bun.sleep(10);
  }
  throw new Error("Disposable lifecycle fixture did not reach its boundary");
}

for (const announce of [false, true]) test(`close joins replacement startup before resolving, announce=${announce}`, async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-managed-close-race-"));
  const executable = join(root, "fixture.mjs");
  const attempts = join(root, "attempts");
  const marker = join(root, "replacement-started");
  const release = join(root, "announce");
  const events: ManagedOpencodeEvent[] = [];
  let managed: ManagedOpencodeServer | undefined;
  let replacementPid: number | undefined;
  let initialPid: number | null = null;
  try {
    await writeFile(executable, `#!/usr/bin/env node
import http from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const root = process.cwd();
const attempts = root + "/attempts";
const attempt = existsSync(attempts) ? Number(readFileSync(attempts, "utf8")) + 1 : 1;
writeFileSync(attempts, String(attempt));
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
const server = http.createServer((_, response) => { response.writeHead(attempt === 1 ? 503 : 200); response.end("fixture"); });
process.on("SIGTERM", () => {});
if (attempt === 1) server.listen(port, "127.0.0.1", () => console.log("opencode server listening on http://127.0.0.1:" + port));
else {
  writeFileSync(root + "/replacement-started", String(process.pid));
  const timer = setInterval(() => {
    if (!existsSync(root + "/announce")) return;
    clearInterval(timer);
    server.listen(port, "127.0.0.1", () => console.log("opencode server listening on http://127.0.0.1:" + port));
  }, 10);
}
`, { mode: 0o700 });
    await chmod(executable, 0o700);
    managed = await createManagedOpencodeServer({
      bin: executable, cwd: root, timeoutMs: 4000,
      healthCheckIntervalMs: 25, healthCheckTimeoutMs: 100, healthFailureThreshold: 1,
      restartDelayMs: 10, onEvent: event => events.push(event),
    });
    initialPid = managed.pid;
    replacementPid = await waitFor(async () => {
      const text = await readFile(marker, "utf8").catch(() => "");
      const pid = Number(text);
      return Number.isSafeInteger(pid) && pid > 1 ? pid : undefined;
    });
    expect(alive(replacementPid)).toBe(true);
    const closing = managed.close();
    const sameClosing = managed.close();
    expect(sameClosing).toBe(closing);
    if (announce) await writeFile(release, "go");
    await closing;
    expect(alive(replacementPid)).toBe(false);
    if (initialPid) expect(alive(initialPid)).toBe(false);
    expect(managed.status().running).toBe(false);
    const eventCount = events.length;
    // Observe beyond the restart interval: shutdown must not schedule another child.
    await Bun.sleep(100);
    expect(await readFile(attempts, "utf8")).toBe("2");
    expect(events).toHaveLength(eventCount);
  } finally {
    await managed?.close().catch(() => {});
    for (const pid of [replacementPid, initialPid]) {
      if (!pid || !alive(pid)) continue;
      process.kill(pid, "SIGKILL");
      await waitFor(async () => !alive(pid) ? true : undefined);
    }
    await rm(root, { recursive: true, force: true });
  }
}, 10000);

test("missing executable preserves the spawn failure instead of reporting failed process termination", async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-managed-missing-bin-"));
  try {
    await expect(createManagedOpencodeServer({ bin: join(root, "missing"), cwd: root, port: 34341 }))
      .rejects.toThrow("ENOENT");
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const boundary of ["health_pending", "previous_stopping"]) test(`shutdown at ${boundary} does not emit late failures or start another engine`, async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-managed-stop-boundary-"));
  const executable = join(root, "fixture.mjs");
  const events: ManagedOpencodeEvent[] = [];
  let managed: ManagedOpencodeServer | undefined;
  let pid: number | null = null;
  try {
    await writeFile(executable, `#!/usr/bin/env node
import http from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";
const root = process.cwd();
appendFileSync(root + "/attempts", "started\\n");
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
process.on("SIGTERM", () => writeFileSync(root + "/stopping", "yes"));
const server = http.createServer((_, response) => {
  writeFileSync(root + "/probe", "yes");
  if (${JSON.stringify(boundary)} === "previous_stopping") { response.writeHead(503); response.end("fixture"); }
});
server.listen(port, "127.0.0.1", () => console.log("opencode server listening on http://127.0.0.1:" + port));
`, { mode: 0o700 });
    managed = await createManagedOpencodeServer({ bin: executable, cwd: root,
      healthCheckIntervalMs: 25, healthCheckTimeoutMs: 2000, healthFailureThreshold: 1,
      restartDelayMs: 10, onEvent: event => events.push(event),
    });
    pid = managed.pid;
    const marker = join(root, boundary === "health_pending" ? "probe" : "stopping");
    await waitFor(async () => await readFile(marker, "utf8").catch(() => undefined));
    const before = events.length;
    await managed.close();
    if (!pid) throw new Error("Fixture process has no PID");
    expect(alive(pid)).toBe(false);
    expect(managed.pid).toBeNull();
    expect(managed.status().running).toBe(false);
    await Bun.sleep(100);
    expect(events).toHaveLength(before);
    expect(await readFile(join(root, "attempts"), "utf8")).toBe("started\n");
  } finally {
    await managed?.close().catch(() => {});
    if (pid && alive(pid)) {
      const cleanupPid = pid;
      process.kill(cleanupPid, "SIGKILL");
      await waitFor(async () => !alive(cleanupPid) ? true : undefined);
    }
    await rm(root, { recursive: true, force: true });
  }
}, 10000);

for (const failure of ["timeout", "wrong_url", "early_exit"]) test(`failed startup (${failure}) leaves no engine behind`, async () => {
  const root = await mkdtemp(join(tmpdir(), "matterhorn-managed-start-failure-"));
  const executable = join(root, "fixture.mjs");
  let managed: ManagedOpencodeServer | undefined;
  let pid: number | undefined;
  try {
    await writeFile(executable, `#!/usr/bin/env node
import { writeFileSync } from "node:fs";
writeFileSync(process.cwd() + "/pid", String(process.pid));
process.on("SIGTERM", () => {});
if (${JSON.stringify(failure)} === "early_exit") process.exit(9);
if (${JSON.stringify(failure)} === "wrong_url") console.log("opencode server listening on http://127.0.0.1:1");
setInterval(() => {}, 100);
`, { mode: 0o700 });
    const expected = failure === "timeout" ? "Timeout waiting" : failure === "wrong_url" ? "unexpected URL" : "before becoming ready";
    const starting = createManagedOpencodeServer({ bin: executable, cwd: root, timeoutMs: 1000 });
    // Retain an unexpected success so the fixture can still be cleaned up.
    await expect(starting.then(result => { managed = result; return result; })).rejects.toThrow(expected);
    pid = Number(await readFile(join(root, "pid"), "utf8"));
    expect(Number.isSafeInteger(pid) && pid > 1).toBe(true);
    expect(alive(pid)).toBe(false);
  } finally {
    await managed?.close().catch(() => {});
    if (pid && alive(pid)) {
      const cleanupPid = pid;
      process.kill(cleanupPid, "SIGKILL");
      await waitFor(async () => !alive(cleanupPid) ? true : undefined);
    }
    await rm(root, { recursive: true, force: true });
  }
}, 10000);
