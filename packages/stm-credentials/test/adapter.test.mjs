import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StmCredentials, spawnStmConsumer } from "../index.mjs";

async function fixture(t, overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "matterhorn-stm-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const descriptorPath = join(dir, "daemon.json");
  const registryPath = join(dir, "bindings.json");
  const token = "a".repeat(48);
  await writeFile(descriptorPath, JSON.stringify({ port: 3456, pid: process.pid, token }), { mode: 0o600 });
  const calls = [];
  const state = { offline: false, secret: "disposable-value", extra: false, badVersion: false };
  const fetch = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["x-stm-token"], token);
    assert.ok(url.startsWith("http://127.0.0.1:3456/api/integrations/v1/"));
    if (state.offline) throw new Error("sensitive-native-error");
    if (url.endsWith("capabilities")) return Response.json({ version: state.badVersion ? 2 : 1, backend: "in-memory fixture", selectedResolution: true });
    if (url.endsWith("keys")) return Response.json({ version: 1, keys: [{ tool: "example", label: "default", status: "active", updatedAt: "2026-09-28" }] });
    const input = JSON.parse(options.body);
    const values = Object.fromEntries(input.bindings.map(b => [b.envName, state.secret]));
    if (state.extra) values.UNRELATED_KEY = "never-expose";
    return Response.json({ version: 1, values });
  };
  const options = { enabled: true, localDesktop: true, platform: "darwin", descriptorPath, registryPath, fetch, ...overrides };
  return { adapter: new StmCredentials(options), options, state, calls, descriptorPath, registryPath, token };
}
const input = { envName: "EXAMPLE_API_KEY", tool: "example", label: "default", consumer: "mcp:example", consent: true };
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
