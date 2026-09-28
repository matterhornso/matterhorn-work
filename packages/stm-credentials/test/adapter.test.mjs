import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, chmod, symlink, mkdir } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { StmCredentials, StmMcpLaunches, StmError, spawnStmConsumer, assertNoStmEnvironmentConflicts } from "../index.mjs";

async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "matterhorn-stm-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const descriptorPath = join(dir, "daemon.json");
  const registryPath = join(dir, "bindings.json");
  const token = "a".repeat(48);
  await writeFile(descriptorPath, JSON.stringify({ port: 3456, pid: process.pid, token }), { mode: 0o600 });
  const calls = [];
  const state = { offline: false, secret: "disposable-value", extra: false, badVersion: false, revision: "d".repeat(64), writeCount: 0, writeFailure: false, writeStatus: 0, keyStatus: "active", missing: false, duplicate: false };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["x-stm-token"], token);
    assert.ok(url.startsWith("http://127.0.0.1:3456/api/integrations/v1/"));
    if (state.offline) throw new Error("sensitive-native-error");
    if (url.endsWith("capabilities")) return Response.json({ version: state.badVersion ? 2 : 1, backend: "in-memory fixture", selectedResolution: true, revisionedWrites: true });
    if (url.endsWith("keys") && options.method === "POST") {
      state.writeCount++;
      if (state.writeFailure) throw new Error("ambiguous secret-bearing failure");
      if (state.writeStatus) return new Response("ignored", { status: state.writeStatus });
      state.secret = JSON.parse(options.body).value;
      state.revision = "e".repeat(64);
      return Response.json({ version: 1, key: { tool: "example", label: "default", status: "active", updatedAt: "2026-09-28", revision: state.revision }, oldValueCleanupPending: false });
    }
    if (url.endsWith("keys")) {
      const key = { tool: "example", label: "default", status: state.keyStatus, updatedAt: "2026-09-28", revision: state.revision };
      return Response.json({ version: 1, keys: state.missing ? [] : state.duplicate ? [key, key] : [key] });
    }
    if (state.missing || state.keyStatus === "revoked") return new Response(null, { status: 404 });
    const input = JSON.parse(options.body);
    const values = Object.fromEntries(input.bindings.map(b => [b.envName, state.secret]));
    if (state.extra) values.UNRELATED_KEY = "never-expose";
    return Response.json({ version: 1, values, ...(input.includeRevisions ? { revisions: Object.fromEntries(input.bindings.map(b => [b.envName, state.revision])) } : {}) });
  };
  const options = { enabled: true, localDesktop: true, platform: "darwin", descriptorPath, registryPath, fetch, ...overrides };
  return { adapter: new StmCredentials(options), options, state, calls, descriptorPath, registryPath, token };
}
const input = { envName: "EXAMPLE_API_KEY", tool: "example", label: "default", consumer: "mcp:example", consent: true };

test("real HTTP transport refuses redirects and oversized or stalled bodies without pairing", { timeout: 15000 }, async t => {
  const f = await fixture(t, { fetch: globalThis.fetch });
  let mode = "redirect";
  let requests = 0;
  let redirected = 0;
  const server = createServer((req, res) => {
    requests++;
    if (req.url === "/forbidden") { redirected++; res.end("must-not-be-contacted"); return; }
    if (mode === "redirect") { res.writeHead(302, { location: "/forbidden" }); res.end(); }
    else if (mode === "oversized") res.end("x".repeat(600_001));
    else { res.writeHead(200, { "content-type": "application/json" }); res.write('{"version":'); }
  });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  await writeFile(f.descriptorPath, JSON.stringify({ port: server.address().port, pid: process.pid, token: f.token }), { mode: 0o600 });
  await assert.rejects(f.adapter.connect({ consent: true }), /connection_failed/);
  assert.equal(redirected, 0);
  mode = "oversized";
  await assert.rejects(f.adapter.connect({ consent: true }), /invalid_response/);
  mode = "stalled";
  const started = Date.now();
  await assert.rejects(f.adapter.connect({ consent: true }), /connection_failed/);
  assert.ok(Date.now() - started < 8000, "body reading must honor the request deadline");
  assert.equal(requests, 3, "transport failures must not retry or follow redirects");
  assert.deepEqual(await f.adapter.listBindings(), []);
  assert.deepEqual(await f.adapter.status(), { state: "not_connected" });
  await assert.rejects(readFile(f.registryPath), { code: "ENOENT" });
});

async function launchFixture(t, command) {
  const f = await fixture(t);
  await f.adapter.connect({ consent: true });
  const workspace = join(f.registryPath, "..", "workspace"); await mkdir(workspace);
  const launchPath = join(workspace, "launches.json");
  const launches = new StmMcpLaunches({ credentials: f.adapter, registryPath: launchPath });
  const grant = await launches.approve({ workspace, name: "fixture", launcher: [process.execPath, "trusted-launcher.mjs"],
    command: command ?? [process.execPath, "-e", "process.stdin.resume()"], bindings: [input], consent: true });
  return { ...f, workspace, launchPath, launches, grant };
}

test("recovery refuses live or changed launches and only clears a proven exited PID", async t => {
  const f = await launchFixture(t);
  const child = await f.launches.start(f.grant.id, { cwd: f.workspace, authorize: () => true });
  t.after(() => child.kill());
  const active = (await f.launches.list())[0].active;
  const request = { expectedLaunchId: active.id, consent: true };
  await assert.rejects(f.launches.recoverExited(f.grant.id, { ...request, consent: false }), /consent_required/);
  await assert.rejects(f.launches.recoverExited(f.grant.id, { ...request, expectedLaunchId: randomUUID() }), /launch_recovery_conflict/);
  await assert.rejects(f.launches.recoverExited(f.grant.id, request), /consumer_still_running/);
  assert.equal(child.exitCode, null);
  // Exhaust bounded cleanup retries to reproduce a stale record after exit.
  const lock = f.launchPath + ".lock";
  await writeFile(lock, "", { flag: "wx", mode: 0o600 });
  const exited = once(child, "exit"); child.kill(); await exited;
  await new Promise(resolve => setTimeout(resolve, 600));
  await assert.rejects(f.launches.recoverExited(f.grant.id, request), /registry_busy/);
  assert.equal((await f.launches.list())[0].active.id, active.id);
  await rm(lock); // only this test's lock, after its writer has stopped
  await f.launches.revoke(f.grant.id);
  const before = f.calls.length;
  await f.launches.recoverExited(f.grant.id, request);
  assert.equal((await f.launches.list())[0].active, null);
  assert.equal((await f.launches.list())[0].revoked, true);
  assert.equal(f.calls.length, before);
  assert.equal((await f.adapter.listBindings()).length, 1);
  await assert.rejects(f.launches.recoverExited(f.grant.id, request), /launch_recovery_conflict/);
});

test("same-instance grant listings are serialized with atomic metadata replacement", async t => {
  const f = await launchFixture(t);
  let writing = true;
  const writer = (async () => {
    try { for (let i = 0; i < 60; i++) await f.launches.revoke(f.grant.id); }
    finally { writing = false; }
  })();
  try { while (writing) assert.equal((await f.launches.list()).length, 1); }
  finally { await writer; }
  assert.equal((await f.launches.list())[0].revoked, true);
});

test("same-instance binding listings are serialized with applied revision writes", async t => {
  const f = await fixture(t);
  await f.adapter.connect({ consent: true });
  const binding = await f.adapter.link(input);
  let writing = true;
  const writer = (async () => {
    try {
      for (let i = 0; i < 60; i++) await f.adapter.acknowledgeMcpStart(input.consumer, [binding.id], { EXAMPLE_API_KEY: f.state.revision });
    } finally { writing = false; }
  })();
  try { while (writing) assert.equal((await f.adapter.listBindings()).length, 1); }
  finally { await writer; }
  assert.equal((await f.adapter.listBindings())[0].appliedRevision, f.state.revision);
});

test("exit bookkeeping retries transient registry contention without stealing locks", async t => {
  const f = await launchFixture(t);
  const child = await f.launches.start(f.grant.id, { cwd: f.workspace, authorize: () => true });
  t.after(() => child.kill());
  const lock = f.launchPath + ".lock";
  await writeFile(lock, "", { flag: "wx", mode: 0o600 });
  const before = f.calls.length;
  const exited = once(child, "exit"); child.kill(); await exited;
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await readFile(lock, "utf8"), "");
  assert.notEqual((await f.launches.list())[0].active, null);
  await rm(lock);
  for (let i = 0; i < 100 && (await f.launches.list())[0].active; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await f.launches.list())[0].active, null);
  assert.equal(f.calls.length, before);
});

test("durable launch intent precedes child execution and unknown PID recovery fails closed", async t => {
  const f = await launchFixture(t);
  const registry = JSON.parse(await readFile(f.launchPath, "utf8"));
  registry.grants[0].command = [process.execPath, "-e", `const fs=require('node:fs');const r=JSON.parse(fs.readFileSync(${JSON.stringify(f.launchPath)},'utf8'));process.stdout.write(JSON.stringify({recorded:Boolean(r.grants[0].active)}));process.stdin.resume()`];
  await writeFile(f.launchPath, JSON.stringify(registry));
  const child = await f.launches.start(f.grant.id, { cwd: f.workspace, authorize: () => true });
  t.after(() => child.kill());
  let output = "";
  child.stdout.on("data", data => { output += String(data); });
  for (let i = 0; i < 100 && !output; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(JSON.parse(output), { recorded: true });
  const done = once(child, "exit"); child.kill(); await done;
  for (let i = 0; i < 100 && (await f.launches.list())[0].active; i++) await new Promise(resolve => setTimeout(resolve, 10));
  registry.grants[0].active = { id: randomUUID(), pid: null, revisions: { EXAMPLE_API_KEY: f.state.revision } };
  await writeFile(f.launchPath, JSON.stringify(registry));
  const before = f.calls.length;
  await assert.rejects(f.launches.recoverExited(f.grant.id, { expectedLaunchId: registry.grants[0].active.id, consent: true }), /launch_recovery_uncertain/);
  await assert.rejects(f.launches.start(f.grant.id, { cwd: f.workspace, authorize: () => true }), /consumer_already_running/);
  assert.equal(f.calls.length, before);
});

test("confirmed spawn failure clears only its own unused launch intent", async t => {
  const dir = await mkdtemp(join(tmpdir(), "stm-removed-executable-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const executable = join(dir, "fixture");
  await writeFile(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
  const f = await launchFixture(t, [executable]);
  await rm(executable);
  await assert.rejects(f.launches.start(f.grant.id, { cwd: f.workspace, authorize: () => true }), /consumer_start_failed/);
  for (let i = 0; i < 100 && (await f.launches.list())[0].active; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await f.launches.list())[0].active, null);
  assert.equal((await f.adapter.listBindings()).length, 1);
});

test("post-spawn acknowledgement failure reaps a tool that ignores SIGTERM", async t => {
  const f = await launchFixture(t);
  const ready = join(f.workspace, "ready.json");
  const registry = JSON.parse(await readFile(f.launchPath, "utf8"));
  registry.grants[0].command = [process.execPath, "-e", `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid}));setInterval(()=>{},1000)`];
  await writeFile(f.launchPath, JSON.stringify(registry));
  let pid;
  t.after(() => { if (pid) { try { process.kill(pid, "SIGKILL"); } catch {} } });
  f.adapter.acknowledgeMcpStart = async () => {
    for (let i = 0; i < 100 && !pid; i++) {
      const data = await readFile(ready, "utf8").catch(() => "");
      if (data) pid = JSON.parse(data).pid;
      else await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(pid, "fixture installed its SIGTERM handler before failing acknowledgement");
    throw new StmError("registry_write_failed");
  };
  await assert.rejects(f.launches.start(f.grant.id, { cwd: f.workspace, authorize: () => true }), /registry_write_failed/);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  pid = undefined;
  for (let i = 0; i < 100 && (await f.launches.list())[0].active; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await f.launches.list())[0].active, null);
  assert.equal((await f.adapter.listBindings()).length, 1);
});

test("workspace-bound launch grants enforce consent, configuration authorization and binding identity", async t => {
  const f = await fixture(t);
  await f.adapter.connect({ consent: true });
  const root = join(f.registryPath, "..");
  const workspace = join(root, "workspace");
  const elsewhere = join(root, "elsewhere");
  await mkdir(workspace); await mkdir(elsewhere);
  const launches = new StmMcpLaunches({ credentials: f.adapter, registryPath: join(root, "launches.json") });
  const request = { workspace, name: "fixture", command: [process.execPath, "-e", "process.stdin.resume()"],
    launcher: [process.execPath, "trusted-launcher.mjs"], bindings: [input], consent: false };
  await assert.rejects(launches.approve(request), /consent_required/);
  const grant = await launches.approve({ ...request, consent: true });
  assert.equal(grant.bindingIds.length, 1);
  assert.equal((await f.adapter.listBindings())[0].consumer, `mcp:${grant.id}`);
  await assert.rejects(launches.start(grant.id, { cwd: elsewhere, authorize: () => true }), /workspace_mismatch/);
  await assert.rejects(launches.start(grant.id, { cwd: workspace, authorize: () => false }), /permission_denied/);
  assert.equal(f.calls.some(c => c.url.endsWith("resolve")), false);
  const disabled = new StmMcpLaunches({ credentials: new StmCredentials({ ...f.options, enabled: false }), registryPath: join(root, "launches.json") });
  await assert.rejects(disabled.start(grant.id, { cwd: workspace, authorize: () => true }), /disabled/);
  await f.adapter.unlink(grant.bindingIds[0]);
  await assert.rejects(launches.start(grant.id, { cwd: workspace, authorize: () => true }), /launch_binding_changed/);
  assert.equal((await readFile(join(root, "launches.json"), "utf8")).includes(f.state.secret), false);
  assert.equal((await readFile(join(root, "launches.json"), "utf8")).includes(f.token), false);
});

test("running consumer keeps its snapshot; only a new approved launch receives rotation", async t => {
  const f = await fixture(t);
  await f.adapter.connect({ consent: true });
  const root = join(f.registryPath, "..");
  const workspace = join(root, "workspace"); await mkdir(workspace);
  const launches = new StmMcpLaunches({ credentials: f.adapter, registryPath: join(root, "launches.json") });
  const grant = await launches.approve({ workspace, name: "fixture", launcher: [process.execPath, "trusted-launcher.mjs"],
    command: [process.execPath, "-e", 'process.stdin.on("data", () => process.stdout.write(JSON.stringify({length: process.env.EXAMPLE_API_KEY.length, other: Boolean(process.env.OTHER_KEY)}) + "\\n"))'],
    bindings: [input], consent: true });
  await f.adapter.link({ ...input, envName: "OTHER_KEY", consumer: "mcp:unrelated" });
  const children = [];
  t.after(() => { for (const child of children) child.kill(); });
  const start = async () => {
    const child = await launches.start(grant.id, { cwd: workspace, authorize: () => true, inherited: { ...process.env, OTHER_KEY: "stale-other-fixture" } });
    children.push(child); return child;
  };
  const query = async child => { const data = once(child.stdout, "data"); child.stdin.write("check\n"); return JSON.parse(String((await data)[0])); };
  const first = await start();
  assert.equal((await f.adapter.listBindings()).find(b => b.envName === "EXAMPLE_API_KEY").restartRequired, false);
  const oldLength = f.state.secret.length;
  assert.deepEqual(await query(first), { length: oldLength, other: false });
  assert.deepEqual((await launches.list())[0].active.revisions, { EXAMPLE_API_KEY: "d".repeat(64) });
  await f.adapter.saveCredential({ tool: "example", label: "default", value: "a-longer-rotated-fake-credential", expectedRevision: f.state.revision, consent: true });
  assert.equal((await f.adapter.listBindings()).find(b => b.envName === "EXAMPLE_API_KEY").restartRequired, true);
  assert.deepEqual(await query(first), { length: oldLength, other: false });
  await assert.rejects(start(), /consumer_already_running/);
  const exited = once(first, "exit"); first.kill(); await exited;
  // Exit bookkeeping is serialized and async. Wait for its authoritative state.
  for (let i = 0; i < 100 && (await launches.list())[0].active; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal((await launches.list())[0].active, null);
  const second = await start();
  assert.equal((await f.adapter.listBindings()).find(b => b.envName === "EXAMPLE_API_KEY").restartRequired, false);
  assert.deepEqual(await query(second), { length: f.state.secret.length, other: false });
  assert.deepEqual((await launches.list())[0].active.revisions, { EXAMPLE_API_KEY: "e".repeat(64) });
  await launches.revoke(grant.id);
  assert.deepEqual(await query(second), { length: f.state.secret.length, other: false });
  await assert.rejects(start(), /launch_grant_unavailable/);
  const done = once(second, "exit"); second.kill(); await done;
  for (let i = 0; i < 100 && (await launches.list())[0].active; i++) await new Promise(r => setTimeout(r, 10));
});

test("generic child boundary rejects bound plaintext without discovery or global mutation", async t => {
  const f = await paired(t);
  const calls = f.calls.length;
  const inherited = { EXAMPLE_API_KEY: "stale-fixture", UNRELATED: "keep" };
  const before = { ...process.env };
  assert.throws(() => assertNoStmEnvironmentConflicts(inherited, f.registryPath), /^StmError: STM: plaintext_conflict$/);
  assert.throws(() => assertNoStmEnvironmentConflicts({ example_api_key: "" }, f.registryPath), /plaintext_conflict/);
  assertNoStmEnvironmentConflicts({ UNRELATED: "keep", EXAMPLE_API_KEY: undefined }, f.registryPath);
  assertNoStmEnvironmentConflicts(inherited, join(f.registryPath, "..", "missing.json"));
  assert.deepEqual(inherited, { EXAMPLE_API_KEY: "stale-fixture", UNRELATED: "keep" });
  assert.deepEqual({ ...process.env }, before);
  assert.equal(f.calls.length, calls);
});

test("generic boundary rejects unsafe and corrupt metadata even with no supplied variables", async t => {
  const f = await paired(t);
  await chmod(f.registryPath, 0o644);
  assert.throws(() => assertNoStmEnvironmentConflicts({}, f.registryPath), /unsafe_file/);
  await chmod(f.registryPath, 0o600);
  const linked = f.registryPath + ".link";
  await symlink(f.registryPath, linked);
  assert.throws(() => assertNoStmEnvironmentConflicts({}, linked), /unavailable_or_invalid_file/);
  await writeFile(f.registryPath, "{");
  assert.throws(() => assertNoStmEnvironmentConflicts({}, f.registryPath), /unavailable_or_invalid_file/);
  await writeFile(f.registryPath, JSON.stringify({ version: 2, paired: true, bindings: [{ envName: "ignored" }] }));
  assert.throws(() => assertNoStmEnvironmentConflicts({}, f.registryPath), /invalid_registry/);
});
async function paired(t) {
  const f = await fixture(t);
  await f.adapter.connect({ consent: true });
  await f.adapter.link(input);
  return f;
}

test("default-off and hosted modes never contact STM", async t => {
  for (const options of [{ enabled: false }, { localDesktop: false }, { platform: "win32" }]) {
    const f = await fixture(t, options);
    assert.equal((await f.adapter.status()).state, "unavailable");
    await assert.rejects(f.adapter.connect({ consent: true }));
    assert.equal(f.calls.length, 0);
  }
});
test("pairing and linking require explicit consent", async t => {
  const f = await fixture(t);
  await assert.rejects(f.adapter.connect({ consent: false }), /consent_required/);
  await assert.rejects(f.adapter.link({ ...input, consent: false }), /consent_required/);
  assert.equal(f.calls.length, 0);
});
test("metadata stays usable offline; values and tokens never persist", async t => {
  const f = await paired(t);
  assert.equal(f.calls.some(c => c.url.endsWith("resolve")), false);
  const file = await readFile(f.registryPath, "utf8");
  assert.equal(file.includes(f.token), false);
  assert.equal(file.includes(f.state.secret), false);
  f.state.offline = true;
  assert.equal((await f.adapter.listBindings()).length, 1);
  assert.equal((await f.adapter.status()).code, "connection_failed");
  await assert.rejects(f.adapter.resolveForConsumer("mcp:example"), /^StmError: STM: connection_failed$/);
  assert.deepEqual(await f.adapter.resolveForConsumer("mcp:unrelated"), {});
});
test("selected consumer only; no global mutation or value cache; next call sees rotation", async t => {
  const f = await paired(t);
  const before = { ...process.env };
  assert.deepEqual(await f.adapter.resolveForConsumer("mcp:example"), { EXAMPLE_API_KEY: "disposable-value" });
  f.state.secret = "rotated-fixture-value";
  assert.deepEqual(await f.adapter.resolveForConsumer("mcp:example"), { EXAMPLE_API_KEY: "rotated-fixture-value" });
  assert.deepEqual({ ...process.env }, before);
  const body = JSON.parse(f.calls.find(c => c.url.endsWith("resolve")).options.body);
  assert.deepEqual(body, { version: 1, bindings: [{ envName: input.envName, tool: input.tool, label: input.label }] });
});
test("feature rollback does not permit fallback for an existing binding", async t => {
  const f = await paired(t);
  const disabled = new StmCredentials({ ...f.options, enabled: false });
  await assert.rejects(disabled.resolveForConsumer("mcp:example", { EXAMPLE_API_KEY: "stale" }), /disabled/);
  assert.equal((await disabled.listBindings()).length, 1);
});
test("plaintext conflicts fail before resolving; inherited values cannot shadow STM", async t => {
  const f = await paired(t);
  await assert.rejects(f.adapter.resolveForConsumer("mcp:example", { EXAMPLE_API_KEY: "stale" }), /plaintext_conflict/);
  assert.equal(f.calls.some(c => c.url.endsWith("resolve")), false);
  await assert.rejects(f.adapter.link({ ...input, envName: "OTHER_KEY" }, ["OTHER_KEY"]), /plaintext_conflict/);
});
test("unlink does not revoke the underlying shared key", async t => {
  const f = await paired(t);
  const [b] = await f.adapter.listBindings();
  const count = f.calls.length;
  await f.adapter.unlink(b.id);
  assert.equal(f.calls.length, count);
  assert.deepEqual(await f.adapter.listBindings(), []);
});
test("unsafe file permissions, symlinks, invalid and oversized descriptors are refused", async t => {
  for (const bad of ["mode", "symlink", "json", "large"]) {
    const f = await fixture(t);
    if (bad === "mode") await chmod(f.descriptorPath, 0o644);
    if (bad === "symlink") { await rm(f.descriptorPath); await symlink(f.registryPath, f.descriptorPath); }
    if (bad === "json") await writeFile(f.descriptorPath, "{}");
    if (bad === "large") await writeFile(f.descriptorPath, "x".repeat(33_000));
    await assert.rejects(f.adapter.connect({ consent: true }));
    assert.equal(f.calls.length, 0);
  }
});
test("incompatible handshake and extra returned secrets fail closed", async t => {
  const f = await paired(t);
  f.state.badVersion = true;
  await assert.rejects(f.adapter.resolveForConsumer("mcp:example"), /incompatible_daemon/);
  f.state.badVersion = false; f.state.extra = true;
  await assert.rejects(f.adapter.resolveForConsumer("mcp:example"), /invalid_response/);
});
test("duplicate and unsafe bindings are refused without persistent values", async t => {
  const f = await paired(t);
  await assert.rejects(f.adapter.link(input), /binding_conflict/);
  await assert.rejects(f.adapter.link({ ...input, envName: "NODE_OPTIONS" }), /invalid_binding/);
  await assert.rejects(f.adapter.link({ ...input, envName: "KEY", consumer: "arbitrary-shell" }), /invalid_binding/);
});

test("real disposable child receives only approved selection; denial resolves nothing", async t => {
  const f = await paired(t);
  await f.adapter.link({ ...input, envName: "OTHER_TOOL_KEY", consumer: "mcp:other" });
  const options = { credentials: f.adapter, consumer: "mcp:example", command: process.execPath,
    args: ["-e", 'process.stdout.write(JSON.stringify({ selected: Boolean(process.env.EXAMPLE_API_KEY), other: Boolean(process.env.OTHER_TOOL_KEY) }))'],
    inherited: { OTHER_TOOL_KEY: "stale-other-secret" }, authorize: () => false };
  await assert.rejects(spawnStmConsumer(options), /permission_denied/);
  assert.equal(f.calls.some(c => c.url.endsWith("resolve")), false);
  const child = await spawnStmConsumer({ ...options, authorize: () => true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stdout = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  await new Promise((resolve, reject) => { child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(new Error("fixture child failed"))); });
  assert.deepEqual(JSON.parse(stdout), { selected: true, other: false });
  assert.equal(stdout.includes(f.state.secret), false);
  assert.equal(process.env.EXAMPLE_API_KEY, undefined);
});

test("stale registry lock blocks writes without losing existing bindings", async t => {
  const f = await paired(t);
  await writeFile(f.registryPath + ".lock", "", { mode: 0o600 });
  await assert.rejects(f.adapter.unlink((await f.adapter.listBindings())[0].id), /registry_busy/);
  assert.equal((await f.adapter.listBindings()).length, 1);
});

test("case-fold aliases cannot collide", async t => {
  const f = await paired(t);
  await assert.rejects(f.adapter.link({ ...input, envName: "example_api_key" }), /binding_conflict/);
});

test("unauthorized and oversized responses never expose body content", async t => {
  const f = await paired(t);
  for (const fetch of [async () => new Response("sensitive-fixture", { status: 401 }), async () => new Response("x".repeat(600_001))]) {
    const a = new StmCredentials({ ...f.options, fetch });
    const state = await a.status();
    assert.equal(state.state, "unavailable");
    assert.ok(["reconnect_required", "invalid_response"].includes(state.code));
    assert.equal(JSON.stringify(state).includes("sensitive-fixture"), false);
  }
});

test("named resolution reads one key, refuses a different consumer, and distinguishes absence", async t => {
  const f = await paired(t);
  await f.adapter.link({ ...input, envName: "SECOND_API_KEY" });
  assert.equal(await f.adapter.resolveKeyForConsumer("mcp:example", "EXAMPLE_API_KEY"), "disposable-value");
  const call = f.calls.find(c => c.url.endsWith("resolve"));
  assert.equal(JSON.parse(call.options.body).bindings.length, 1);
  await assert.rejects(f.adapter.resolveKeyForConsumer("voice:realtime", "EXAMPLE_API_KEY"), /consumer_not_authorized/);
  assert.equal(await f.adapter.resolveKeyForConsumer("voice:realtime", "MISSING_KEY"), undefined);
});

test("401 rediscovery reloads rotated descriptor once, with a strict retry bound", async t => {
  const f = await paired(t);
  let attempts = 0;
  const rotatedToken = "c".repeat(48);
  const a = new StmCredentials({ ...f.options, fetch: async (_url, options) => {
    attempts++;
    if (attempts === 1) {
      assert.equal(options.headers["x-stm-token"], f.token);
      await writeFile(f.descriptorPath, JSON.stringify({ port: 3456, pid: process.pid, token: rotatedToken }));
      return new Response("ignored-secret-error", { status: 401 });
    }
    assert.equal(options.headers["x-stm-token"], rotatedToken);
    return Response.json({ version: 1, selectedResolution: true, backend: "in-memory fixture" });
  } });
  assert.equal((await a.status()).state, "connected");
  assert.equal(attempts, 2);
  attempts = 0;
  const b = new StmCredentials({ ...f.options, fetch: async () => { attempts++; return new Response(null, { status: 401 }); } });
  assert.deepEqual(await b.status(), { state: "unavailable", code: "reconnect_required" });
  assert.equal(attempts, 2);
});

test("revisioned writes require consent; only metadata and restart state persist", async t => {
  const f = await paired(t);
  const input = { tool: "example", label: "default", value: "replacement-disposable-value", expectedRevision: f.state.revision, consent: true };
  await assert.rejects(f.adapter.saveCredential({ ...input, consent: false }), /consent_required/);
  assert.equal(f.state.writeCount, 0);
  const result = await f.adapter.saveCredential(input);
  assert.equal(result.key.revision, f.state.revision);
  assert.equal(result.restartRequired, true);
  assert.equal(f.state.writeCount, 1);
  const [binding] = await f.adapter.listBindings();
  assert.equal(binding.credentialRevision, f.state.revision);
  assert.equal(binding.storageBackend, "in-memory fixture");
  assert.equal(binding.restartRequired, true);
  assert.equal((await readFile(f.registryPath, "utf8")).includes(input.value), false);
  assert.equal(JSON.stringify(result).includes(input.value), false);
});

test("ambiguous mutations and revision conflicts are never automatically retried", async t => {
  const f = await paired(t);
  const input = { tool: "example", label: "default", value: "disposable-write", expectedRevision: f.state.revision, consent: true };
  f.state.writeFailure = true;
  await assert.rejects(f.adapter.saveCredential(input), /credential_update_uncertain/);
  assert.equal(f.state.writeCount, 1);
  f.state.writeFailure = false;
  for (const [status, code] of [[401, "reconnect_required"], [412, "credential_revision_conflict"], [503, "credential_update_uncertain"]]) {
    f.state.writeStatus = status;
    const before = f.state.writeCount;
    await assert.rejects(f.adapter.saveCredential(input), new RegExp(code));
    assert.equal(f.state.writeCount, before + 1);
  }
});

test("voice uses credentials per call and does not claim a child restart is required", async t => {
  const f = await fixture(t);
  await f.adapter.connect({ consent: true });
  const binding = await f.adapter.link({ ...input, envName: "OPENAI_REALTIME_API_KEY", consumer: "voice:realtime" });
  assert.equal(binding.restartRequired, false);
  const result = await f.adapter.saveCredential({ tool: "example", label: "default", value: "voice-fixture-replacement", expectedRevision: f.state.revision, consent: true });
  assert.equal(result.restartRequired, false);
  assert.equal((await f.adapter.listBindings())[0].restartRequired, false);
});

test("refresh observes external rotation, revocation and removal without resolving secrets", async t => {
  const f = await paired(t);
  const [binding] = await f.adapter.listBindings();
  await f.adapter.acknowledgeMcpStart(input.consumer, [binding.id], { EXAMPLE_API_KEY: f.state.revision });
  assert.equal((await f.adapter.refreshBindings()).items[0].restartRequired, false);
  f.state.revision = "e".repeat(64); f.state.secret = "externally-rotated-fixture";
  const rotated = await f.adapter.refreshBindings();
  assert.equal(rotated.items[0].credentialState, "available");
  assert.equal(rotated.items[0].credentialRevision, f.state.revision);
  assert.equal(rotated.items[0].appliedRevision, "d".repeat(64));
  assert.equal(rotated.items[0].restartRequired, true);
  // A launch of an older in-flight snapshot must not erase the newer revision.
  await f.adapter.acknowledgeMcpStart(input.consumer, [binding.id], { EXAMPLE_API_KEY: "d".repeat(64) });
  assert.equal((await f.adapter.listBindings())[0].restartRequired, true);
  await f.adapter.acknowledgeMcpStart(input.consumer, [binding.id], { EXAMPLE_API_KEY: f.state.revision });
  assert.equal((await f.adapter.refreshBindings()).items[0].restartRequired, false);
  f.state.keyStatus = "revoked"; f.state.revision = "f".repeat(64);
  const revoked = await f.adapter.refreshBindings();
  assert.equal(revoked.items[0].credentialState, "revoked");
  assert.equal(revoked.items[0].restartRequired, true);
  f.state.missing = true;
  const missing = await f.adapter.refreshBindings();
  assert.equal(missing.items[0].credentialState, "missing");
  assert.equal(missing.items[0].credentialRevision, null);
  assert.equal((await f.adapter.listBindings()).length, 1);
  assert.equal(f.calls.some(call => call.url.endsWith("resolve")), false);
  assert.equal(JSON.stringify(missing).includes(f.state.secret), false);
  assert.equal((await readFile(f.registryPath, "utf8")).includes(f.token), false);
  await assert.rejects(f.adapter.resolveForConsumer(input.consumer), /request_failed/);
});

test("failed metadata refresh preserves last-known bindings and does not assume readiness", async t => {
  const f = await paired(t);
  const before = await readFile(f.registryPath, "utf8");
  f.state.offline = true;
  await assert.rejects(f.adapter.refreshBindings(), /^StmError: STM: connection_failed$/);
  assert.equal(await readFile(f.registryPath, "utf8"), before);
  f.state.offline = false; f.state.duplicate = true;
  await assert.rejects(f.adapter.refreshBindings(), /invalid_response/);
  assert.equal(await readFile(f.registryPath, "utf8"), before);
  f.state.duplicate = false;
  const disabled = new StmCredentials({ ...f.options, enabled: false });
  const count = f.calls.length;
  await assert.rejects(disabled.refreshBindings(), /disabled/);
  assert.equal(f.calls.length, count);
  assert.equal((await disabled.listBindings()).length, 1);
});

test("v2 bindings preserve authority but never infer an applied revision", async t => {
  const f = await paired(t);
  const registry = JSON.parse(await readFile(f.registryPath, "utf8"));
  registry.version = 2;
  delete registry.bindings[0].appliedRevision;
  registry.bindings[0].restartRequired = false;
  await writeFile(f.registryPath, JSON.stringify(registry));
  const [binding] = await f.adapter.listBindings();
  assert.equal(binding.appliedRevision, null);
  assert.equal(binding.restartRequired, true);
  assert.throws(() => assertNoStmEnvironmentConflicts({ EXAMPLE_API_KEY: "stale" }, f.registryPath), /plaintext_conflict/);
  await f.adapter.refreshBindings();
  const upgraded = JSON.parse(await readFile(f.registryPath, "utf8"));
  assert.equal(upgraded.version, 3);
  assert.equal(upgraded.bindings[0].appliedRevision, null);
  assert.equal(upgraded.bindings[0].restartRequired, true);
});

test("refresh keeps voice per-call and reconciles a newly applied external revision", async t => {
  const f = await fixture(t);
  await f.adapter.connect({ consent: true });
  const voice = await f.adapter.link({ ...input, envName: "OPENAI_REALTIME_API_KEY", consumer: "voice:realtime" });
  const mcp = await f.adapter.link(input);
  // External rotation may land between the metadata read and a selected resolve.
  f.state.revision = "e".repeat(64);
  await f.adapter.acknowledgeMcpStart(input.consumer, [mcp.id], { EXAMPLE_API_KEY: f.state.revision });
  assert.equal((await f.adapter.listBindings()).find(b => b.id === mcp.id).restartRequired, true);
  const refreshed = await f.adapter.refreshBindings();
  assert.equal(refreshed.items.find(b => b.id === mcp.id).restartRequired, false);
  f.state.keyStatus = "revoked";
  const revoked = await f.adapter.refreshBindings();
  assert.equal(revoked.items.find(b => b.id === voice.id).credentialState, "revoked");
  assert.equal(revoked.items.find(b => b.id === voice.id).restartRequired, false);
  await assert.rejects(f.adapter.resolveKeyForConsumer("voice:realtime", voice.envName), /request_failed/);
});
