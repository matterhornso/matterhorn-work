import { constants } from "node:fs";
import { open, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const MAX_FILE = 32_768;
const MAX_RESPONSE = 600_000;
const forbidden = /^(MATTERHORN_WORK_|OPENWORK_|OPENCODE_|STM_|LD_|DYLD_|NODE_|BUN_|PYTHON|RUBY|PERL|GIT_|npm_)/i;
const processNames = new Set(["PATH", "HOME", "SHELL", "ENV", "BASH_ENV", "ZDOTDIR", "IFS", "CDPATH", "COMSPEC", "PATHEXT", "SYSTEMROOT", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "__PROTO__", "CONSTRUCTOR", "PROTOTYPE"]);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const segment = value => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,127}$/.test(value);
export const safeSecretEnvName = value => typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value) && !forbidden.test(value) && !processNames.has(value.toUpperCase());

export class StmError extends Error {
  constructor(code) { super(`STM: ${code}`); this.name = "StmError"; this.code = code; }
}
const fail = code => { throw new StmError(code); };

// Validate the opened descriptor, never lstat(path) followed by readFile(path).
async function privateJson(path, missingAllowed = false) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await file.stat();
    if (!before.isFile() || before.size > MAX_FILE || before.uid !== process.getuid?.() || (before.mode & 0o077) !== 0) fail("unsafe_file");
    const bytes = Buffer.alloc(MAX_FILE + 1);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    const after = await file.stat();
    if (bytesRead > MAX_FILE || before.size !== bytesRead || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail("unsafe_file");
    return JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
  } catch (error) {
    if (missingAllowed && error?.code === "ENOENT") return null;
    if (error instanceof StmError) throw error;
    fail("unavailable_or_invalid_file");
  } finally { await file?.close(); }
}

async function writePrivate(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.stm-${randomUUID()}.tmp`);
  let file;
  try {
    file = await open(temp, "wx", 0o600);
    await file.writeFile(JSON.stringify(value) + "\n");
    await file.sync();
    await file.close(); file = undefined;
    await rename(temp, path);
  } catch { fail("registry_write_failed"); }
  finally { await file?.close(); await rm(temp, { force: true }).catch(() => {}); }
}

function validBinding(b) {
  return object(b) && typeof b.id === "string" && /^[a-f0-9-]{36}$/.test(b.id) && safeSecretEnvName(b.envName)
    && segment(b.tool) && segment(b.label) && typeof b.consumer === "string" && /^(mcp:[a-z0-9_-]{1,128}|voice:realtime)$/.test(b.consumer)
    && typeof b.updatedAt === "string" && Number.isFinite(Date.parse(b.updatedAt))
    && Object.keys(b).every(k => ["id", "envName", "tool", "label", "consumer", "updatedAt"].includes(k));
}

export class StmCredentials {
  #options; #queue = Promise.resolve();
  constructor(options = {}) {
    this.#options = {
      enabled: false, localDesktop: false, platform: process.platform,
      descriptorPath: join(homedir(), ".subscribetome", "daemon.json"),
      registryPath: join(homedir(), ".config", "openwork", "stm-bindings.json"),
      fetch: globalThis.fetch, ...options,
    };
  }
  #supported() {
    if (!this.#options.enabled) fail("disabled");
    if (!this.#options.localDesktop || this.#options.platform !== "darwin") fail("unsupported_environment");
  }
  async #registry() {
    const r = await privateJson(this.#options.registryPath, true);
    if (r === null) return { version: 1, paired: false, bindings: [] };
    if (!object(r) || r.version !== 1 || typeof r.paired !== "boolean" || !Array.isArray(r.bindings) || r.bindings.length > 32 || !r.bindings.every(validBinding) || Object.keys(r).some(k => !["version", "paired", "bindings"].includes(k))) fail("invalid_registry");
    if (new Set(r.bindings.map(b => b.envName.toUpperCase())).size !== r.bindings.length || new Set(r.bindings.map(b => b.id)).size !== r.bindings.length) fail("invalid_registry");
    return r;
  }
  async #request(path, body) {
    this.#supported();
    const info = await privateJson(this.#options.descriptorPath);
    if (!object(info) || !Number.isInteger(info.port) || info.port < 1 || info.port > 65535 || !Number.isInteger(info.pid) || info.pid < 1 || typeof info.token !== "string" || !/^[a-f0-9]{48}$/.test(info.token)) fail("invalid_descriptor");
    let response;
    try {
      response = await this.#options.fetch(`http://127.0.0.1:${info.port}/api/integrations/v1/${path}`, {
        method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(3000),
        headers: { "x-stm-token": info.token, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) { await response.body?.cancel(); fail(response.status === 401 ? "reconnect_required" : "request_failed"); }
      const reader = response.body?.getReader();
      if (!reader) fail("invalid_response");
      let size = 0; const chunks = [];
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE) fail("invalid_response");
          chunks.push(value);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } finally { await reader.cancel().catch(() => {}); }
    } catch (error) {
      if (error instanceof StmError) throw error;
      fail("connection_failed");
    }
  }
  async #handshake() {
    const c = await this.#request("capabilities");
    if (!object(c) || c.version !== 1 || c.selectedResolution !== true || typeof c.backend !== "string" || c.backend.length > 128 || !c.backend.trim()) fail("incompatible_daemon");
    return { version: 1, backend: c.backend };
  }
  #mutate(fn) {
    const locked = async () => {
      const path = this.#options.registryPath + ".lock";
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      let lock;
      try { lock = await open(path, "wx", 0o600); }
      catch { fail("registry_busy"); }
      // Fail closed on a stale lock after a crash. Do not steal another writer's
      // lock on a timer; manual recovery must first establish no writer is alive.
      try { return await fn(); }
      finally { await lock.close(); await rm(path, { force: true }); }
    };
    const next = this.#queue.then(locked, locked);
    this.#queue = next.then(() => {}, () => {});
    return next;
  }
  async status() {
    try {
      this.#supported();
      const r = await this.#registry();
      if (!r.paired) return { state: "not_connected" };
      return { state: "connected", ...await this.#handshake() };
    } catch (error) { return { state: "unavailable", code: error instanceof StmError ? error.code : "unavailable" }; }
  }
  async connect({ consent } = {}) {
    this.#supported();
    if (consent !== true) fail("consent_required");
    return this.#mutate(async () => {
      const capability = await this.#handshake();
      const r = await this.#registry();
      await writePrivate(this.#options.registryPath, { ...r, paired: true });
      return { state: "connected", ...capability };
    });
  }
  async listBindings() { return (await this.#registry()).bindings; }
  async inventory() {
    this.#supported();
    if (!(await this.#registry()).paired) fail("not_connected");
    await this.#handshake();
    const r = await this.#request("keys");
    if (!object(r) || r.version !== 1 || !Array.isArray(r.keys) || r.keys.length > 2048) fail("invalid_response");
    return r.keys.map(k => {
      if (!object(k) || !segment(k.tool) || !segment(k.label) || !["active", "revoked"].includes(k.status) || typeof k.updatedAt !== "string") fail("invalid_response");
      return { tool: k.tool, label: k.label, status: k.status, updatedAt: k.updatedAt };
    });
  }
  async link({ envName, tool, label, consumer, consent }, legacyNames = []) {
    this.#supported();
    if (consent !== true) fail("consent_required");
    const binding = { id: randomUUID(), envName, tool, label, consumer, updatedAt: new Date().toISOString() };
    if (!validBinding(binding)) fail("invalid_binding");
    if (legacyNames.includes(envName) || Object.hasOwn(process.env, envName)) fail("plaintext_conflict");
    return this.#mutate(async () => {
      const inventory = await this.inventory();
      if (!inventory.some(k => k.tool === tool && k.label === label && k.status === "active")) fail("key_unavailable");
      const r = await this.#registry();
      if (r.bindings.length >= 32 || r.bindings.some(b => b.envName.toUpperCase() === envName.toUpperCase())) fail("binding_conflict");
      await writePrivate(this.#options.registryPath, { ...r, bindings: [...r.bindings, binding] });
      return binding;
    });
  }
  async unlink(id) {
    this.#supported();
    return this.#mutate(async () => {
      const r = await this.#registry();
      await writePrivate(this.#options.registryPath, { ...r, bindings: r.bindings.filter(b => b.id !== id) });
      // No STM revoke/delete: the key may be used by unrelated consumers.
    });
  }
  async resolveForConsumer(consumer, inherited = {}) {
    const registry = await this.#registry();
    const selected = registry.bindings.filter(b => b.consumer === consumer);
    if (!selected.length) return {};
    this.#supported();
    if (!registry.paired) fail("not_connected");
    for (const b of selected) if (Object.hasOwn(inherited, b.envName) || Object.hasOwn(process.env, b.envName)) fail("plaintext_conflict");
    await this.#handshake();
    const r = await this.#request("resolve", { version: 1, bindings: selected.map(({ envName, tool, label }) => ({ envName, tool, label })) });
    if (!object(r) || r.version !== 1 || !object(r.values) || Object.keys(r.values).length !== selected.length) fail("invalid_response");
    const values = {};
    for (const b of selected) {
      const v = r.values[b.envName];
      if (!Object.hasOwn(r.values, b.envName) || typeof v !== "string" || !v || v.includes("\0") || Buffer.byteLength(v) > 16_384) fail("invalid_response");
      values[b.envName] = v;
    }
    return values;
  }
}

// Call only at an approved tool's actual spawn boundary, never buildChildEnv or
// Object.assign(process.env). Existing children keep their snapshot until exit.
export async function spawnStmConsumer({ credentials, consumer, command, args = [], cwd, inherited = process.env, authorize, stdio = "pipe" }) {
  if (!/^mcp:[a-z0-9_-]{1,128}$/.test(consumer) || typeof command !== "string" || !command || command.includes("\0") || !Array.isArray(args) || args.some(arg => typeof arg !== "string" || arg.includes("\0"))) fail("invalid_consumer");
  const launchArgs = [...args];
  const base = { ...inherited };
  if (typeof authorize !== "function" || await authorize({ consumer, command, args: [...launchArgs], cwd }) !== true) fail("permission_denied");
  const bindings = await credentials.listBindings();
  // Never forward a stale secret belonging to another STM consumer.
  for (const binding of bindings) if (binding.consumer !== consumer) delete base[binding.envName];
  const selected = await credentials.resolveForConsumer(consumer, base);
  return spawn(command, launchArgs, { cwd, env: { ...base, ...selected }, shell: false, stdio });
}
