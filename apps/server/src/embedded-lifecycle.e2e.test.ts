import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH") return false;
    throw error;
  }
}

async function waitForFile(path: string): Promise<string> {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const value = await readFile(path, "utf8").catch(() => "");
    if (value) return value;
    await Bun.sleep(20);
  }
  throw new Error("Isolated host lifecycle fixture did not report its result");
}

for (const mode of ["embedded_bind", "cli_bind", "embedded_stop", "embedded_setup", "route_email"]) {
  test(`host lifecycle cleans its resources at ${mode}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-host-lifecycle-"));
    const workspace = join(root, "workspace");
    const executable = join(root, "engine.mjs");
    const worker = join(root, "worker.ts");
    const occupied = mode.endsWith("bind")
      ? Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("fixture") })
      : undefined;
    let child: ReturnType<typeof Bun.spawn> | undefined;
    let stderr: Promise<string> | undefined;
    let verified = false;
    try {
      await mkdir(workspace);
      await writeFile(executable, `#!/usr/bin/env node
import http from "node:http";
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
writeFileSync(process.cwd() + "/engine-pid", String(process.pid));
const server = http.createServer((_, response) => response.end('{"healthy":true}'));
server.listen(port, "127.0.0.1", () => console.log("opencode server listening on http://127.0.0.1:" + port));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
`, { mode: 0o700 });
      await writeFile(worker, `
import { writeFileSync } from "node:fs";
import { startEmbeddedServer } from ${JSON.stringify(new URL("./embedded.ts", import.meta.url).href)};
import { MatterhornAuthStore } from ${JSON.stringify(new URL("./auth-store.ts", import.meta.url).href)};
import { startServer } from ${JSON.stringify(new URL("./server.ts", import.meta.url).href)};
import { resolveServerConfig } from ${JSON.stringify(new URL("./config.ts", import.meta.url).href)};
const mode = ${JSON.stringify(mode)};
const root = ${JSON.stringify(root)};
const intervals = new Set();
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
globalThis.setInterval = (fn, delay, ...args) => {
  const handle = originalSetInterval(fn, delay, ...args); intervals.add(handle); return handle;
};
globalThis.clearInterval = handle => { intervals.delete(handle); return originalClearInterval(handle); };
let closedAuth = 0;
const originalClose = MatterhornAuthStore.prototype.close;
MatterhornAuthStore.prototype.close = function() { closedAuth++; return originalClose.call(this); };
if (mode === "embedded_setup") MatterhornAuthStore.prototype.maintainEphemeralSecurityState = () => {
  const error = new Error("fixture_setup_failure"); error.code = "fixture_setup_failure"; throw error;
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost" && url.hostname !== "[::1]") throw new Error("fixture_network_denied");
  return nativeFetch(input, init);
};
let result;
try {
  if (mode === "route_email") {
    process.env.MATTERHORN_EMAIL_DEV_MODE = "1";
    process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "1";
    let release;
    let entered;
    const delivery = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const config = await resolveServerConfig({ host: "127.0.0.1", port: 0, workspaces: [], logRequests: false });
    const server = await startServer(config, { emailDeliver: async () => {
      entered(); await delivery; return { provider: "console" };
    } });
    const response = await fetch("http://127.0.0.1:" + server.port + "/api/auth/sign-up/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "isolated@example.test", password: "Disposable-password-123!", name: "Fixture" }),
    });
    await response.text();
    await started;
    const closing = server.stop();
    await Bun.sleep(50);
    const closedBeforeDelivery = closedAuth;
    release();
    await closing;
    result = { status: response.status, closedBeforeDelivery, closedAuth, intervals: intervals.size };
  } else if (mode === "cli_bind") {
    process.argv = [process.execPath, "cli.ts", "--host", "127.0.0.1", "--port", ${JSON.stringify(String(occupied?.port ?? 0))}, "--workspace", ${JSON.stringify(workspace)}, "--read-only", "--no-log-requests"];
    await import(${JSON.stringify(new URL("./cli.ts", import.meta.url).href)});
    result = { unexpectedSuccess: true };
  } else {
    const handle = await startEmbeddedServer({ host: "127.0.0.1", port: ${occupied?.port ?? 0},
      workspaces: [${JSON.stringify(workspace)}], readOnly: true, logRequests: false,
      manageOpencode: true, opencodeBin: ${JSON.stringify(executable)}, opencodeCwd: root,
    });
    if (mode === "embedded_stop") {
      const port = handle.port;
      const before = await fetch(handle.url + "/health");
      await before.text();
      await handle.stop();
      let rebound = false;
      try {
        const probe = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response("probe") });
        rebound = true; await probe.stop(true);
      } catch {}
      result = { stopped: true, rebound, closedAuth, intervals: intervals.size };
    } else { await handle.stop(); result = { unexpectedSuccess: true }; }
  }
} catch (error) {
  result = { rejected: true, code: error.code, name: error.name, closedAuth, intervals: intervals.size };
}
writeFileSync(root + "/result.json", JSON.stringify(result));
// Keep diagnostics stable until the parent inspects and tears down this fixture.
originalSetInterval(() => {}, 1000);
`);
      const running = Bun.spawn([process.execPath, "run", worker], {
        cwd: root, stdout: "ignore", stderr: "pipe",
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: root, USERPROFILE: root,
          XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"),
          XDG_STATE_HOME: join(root, "state"), XDG_CACHE_HOME: join(root, "cache"),
          OPENWORK_DATA_DIR: join(root, "data"), MATTERHORN_WORK_DATA_DIR: join(root, "data"),
          MATTERHORN_WORK_ENV_STORE: join(root, "env.json"), MATTERHORN_WORK_TOKEN_STORE: join(root, "tokens.json"),
          OPENWORK_MANAGE_OPENCODE: "1", OPENWORK_OPENCODE_BIN: executable,
          OPENWORK_MANAGED_OPENCODE_CWD: root,
        },
      });
      child = running;
      stderr = new Response(running.stderr).text();
      const result: unknown = JSON.parse(await waitForFile(join(root, "result.json")));
      if (mode === "route_email") expect(result).toMatchObject({ status: 202, closedBeforeDelivery: 0, closedAuth: 1, intervals: 0 });
      else if (mode.endsWith("bind")) expect(result).toMatchObject({ rejected: true, code: "EADDRINUSE", closedAuth: 1, intervals: 0 });
      else if (mode === "embedded_setup") expect(result).toMatchObject({ rejected: true, code: "fixture_setup_failure", closedAuth: 1, intervals: 0 });
      else expect(result).toMatchObject({ stopped: true, rebound: true, closedAuth: 1, intervals: 0 });
      if (mode !== "route_email") {
        const pid = Number(await readFile(join(root, "engine-pid"), "utf8"));
        expect(Number.isSafeInteger(pid) && pid > 1).toBe(true);
        expect(alive(pid)).toBe(false);
      }
      verified = true;
    } finally {
      if (child) { child.kill("SIGKILL"); await child.exited; }
      if (!verified && stderr) console.error((await stderr).slice(-4000));
      const pid = Number(await readFile(join(root, "engine-pid"), "utf8").catch(() => ""));
      if (Number.isSafeInteger(pid) && pid > 1 && alive(pid)) {
        process.kill(pid, "SIGKILL");
        const deadline = Date.now() + 2000;
        while (alive(pid) && Date.now() < deadline) await Bun.sleep(10);
        if (alive(pid)) throw new Error("Disposable engine failed to terminate during cleanup");
      }
      await occupied?.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  }, 20000);
}
