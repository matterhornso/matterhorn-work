import { constants, openSync, fstatSync, readSync, closeSync } from "node:fs";
import { open, mkdir, rename, rm, realpath } from "node:fs/promises";
import { dirname, join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const MAX_FILE = 32_768;
const MAX_RESPONSE = 600_000;
const forbidden = /^(MATTERHORN_WORK_|OPENWORK_|OPENCODE_|STM_|LD_|DYLD_|NODE_|BUN_|PYTHON|RUBY|PERL|GIT_|npm_)/i;
const processNames = new Set(["PATH", "HOME", "SHELL", "ENV", "BASH_ENV", "ZDOTDIR", "IFS", "CDPATH", "COMSPEC", "PATHEXT", "SYSTEMROOT", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "__PROTO__", "CONSTRUCTOR", "PROTOTYPE"]);
// Shared legacy-loader policy. The stricter STM policy below additionally blocks
// process control variables; non-adopters retain their existing legacy behavior.
export const isReservedLegacyEnvKey = key => ["MATTERHORN_WORK_", "OPENWORK_", "OPENCODE_"].some(prefix => key.startsWith(prefix));
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
  const payload = JSON.stringify(value) + "\n";
  if (Buffer.byteLength(payload) > MAX_FILE) fail("registry_capacity_exceeded");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.stm-${randomUUID()}.tmp`);
  let file;
  try {
    file = await open(temp, "wx", 0o600);
    await file.writeFile(payload);
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
    && typeof b.storageBackend === "string" && b.storageBackend.length <= 128
    && (b.credentialRevision === null || validRevision(b.credentialRevision)) && typeof b.restartRequired === "boolean"
    && (b.appliedRevision === null || validRevision(b.appliedRevision))
    && Object.keys(b).every(k => ["id", "envName", "tool", "label", "consumer", "updatedAt", "storageBackend", "credentialRevision", "appliedRevision", "restartRequired"].includes(k));
}

const validRevision = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function credentialMetadata(k) {
  if (!object(k) || !segment(k.tool) || !segment(k.label) || !["active", "revoked"].includes(k.status) || typeof k.updatedAt !== "string" || !Number.isFinite(Date.parse(k.updatedAt)) || !validRevision(k.revision)) fail("invalid_response");
  return { tool: k.tool, label: k.label, status: k.status, updatedAt: k.updatedAt, revision: k.revision };
}

function registryMetadata(r) {
  if (r === null) return { version: 3, paired: false, bindings: [] };
  if (!object(r) || ![1, 2, 3].includes(r.version) || typeof r.paired !== "boolean" || !Array.isArray(r.bindings) || r.bindings.length > 32 || Object.keys(r).some(k => !["version", "paired", "bindings"].includes(k))) fail("invalid_registry");
  const bindings = r.bindings.map(b => {
    if (!object(b) || r.version === 3) return b;
    const legacy = r.version === 1 ? { storageBackend: "unknown", credentialRevision: null, restartRequired: true, ...b } : b;
    // Older registries never recorded applied revisions. Keep that uncertainty
    // explicit rather than assuming the currently running child is up to date.
    return { ...legacy, appliedRevision: null, restartRequired: typeof legacy.consumer === "string" && legacy.consumer.startsWith("mcp:") ? true : legacy.restartRequired };
  });
  if (!bindings.every(validBinding) || new Set(bindings.map(b => b.envName.toUpperCase())).size !== bindings.length || new Set(bindings.map(b => b.id)).size !== bindings.length) fail("invalid_registry");
  return { version: 3, paired: r.paired, bindings };
}

// The synchronous CLI/desktop spawn boundaries only read private metadata.
// They never open the daemon descriptor, resolve keys, or change process.env.
// Keep this check active on flag rollback: migrated names must not reappear as
// ordinary inherited plaintext. Missing registry preserves non-adopter behavior.
export function assertNoStmEnvironmentConflicts(environment, registryPath) {
  let fd;
  let raw;
  try {
    fd = openSync(registryPath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > MAX_FILE || before.uid !== process.getuid?.() || (before.mode & 0o077) !== 0) fail("unsafe_file");
    const bytes = Buffer.alloc(MAX_FILE + 1);
    const count = readSync(fd, bytes, 0, bytes.length, 0);
    const after = fstatSync(fd);
    if (count > MAX_FILE || before.size !== count || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail("unsafe_file");
    raw = JSON.parse(bytes.subarray(0, count).toString("utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return;
    if (error instanceof StmError) throw error;
    fail("unavailable_or_invalid_file");
  } finally { if (fd !== undefined) closeSync(fd); }
  const bound = new Set(registryMetadata(raw).bindings.map(b => b.envName.toUpperCase()));
  if (Object.entries(environment).some(([key, value]) => value !== undefined && bound.has(key.toUpperCase()))) fail("plaintext_conflict");
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
    return registryMetadata(r);
  }
  async #request(path, body, rediscover = true, write = false) {
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
      if (!response.ok) {
        await response.body?.cancel();
        // A daemon restart rotates its token/port. Re-open the private descriptor
        // once; never trust a response-provided URL and never retry indefinitely.
        // Mutations are never retried, even after authentication failure.
        if (response.status === 401 && rediscover && !write) return this.#request(path, body, false);
        if (response.status === 401) fail("reconnect_required");
        if (response.status === 412) fail("credential_revision_conflict");
        if (write && response.status === 400) fail("invalid_credential_update");
        fail(write ? "credential_update_uncertain" : "request_failed");
      }
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
      if (error instanceof StmError && (!write || error.code !== "invalid_response")) throw error;
      fail(write ? "credential_update_uncertain" : "connection_failed");
    }
  }
  async #handshake() {
    const c = await this.#request("capabilities");
    if (!object(c) || c.version !== 1 || c.selectedResolution !== true || typeof c.backend !== "string" || c.backend.length > 128 || !c.backend.trim()) fail("incompatible_daemon");
    return { version: 1, backend: c.backend, revisionedWrites: c.revisionedWrites === true };
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
      const { version, backend } = await this.#handshake();
      return { state: "connected", version, backend };
    } catch (error) { return { state: "unavailable", code: error instanceof StmError ? error.code : "unavailable" }; }
  }
  async connect({ consent } = {}) {
    this.#supported();
    if (consent !== true) fail("consent_required");
    return this.#mutate(async () => {
      const capability = await this.#handshake();
      const r = await this.#registry();
      await writePrivate(this.#options.registryPath, { ...r, paired: true });
      return { state: "connected", version: capability.version, backend: capability.backend };
    });
  }
  async listBindings() { return (await this.#registry()).bindings; }
  async inventory() {
    return (await this.#inventorySnapshot()).keys;
  }
  async #inventorySnapshot() {
    this.#supported();
    if (!(await this.#registry()).paired) fail("not_connected");
    const capability = await this.#handshake();
    const r = await this.#request("keys");
    if (!object(r) || r.version !== 1 || !Array.isArray(r.keys) || r.keys.length > 2048) fail("invalid_response");
    const keys = r.keys.map(credentialMetadata);
    if (new Set(keys.map(k => `${k.tool}/${k.label}`)).size !== keys.length) fail("invalid_response");
    return { keys, backend: capability.backend };
  }
  async refreshBindings() {
    this.#supported();
    // Serialize with local metadata writes/acknowledgements. STM's actual
    // inventory can change after this request; checkedAt is not a live lease.
    return this.#mutate(async () => {
      const snapshot = await this.#inventorySnapshot();
      const registry = await this.#registry();
      const checkedAt = new Date().toISOString();
      const items = registry.bindings.map(binding => {
        const key = snapshot.keys.find(k => k.tool === binding.tool && k.label === binding.label);
        const credentialState = key ? (key.status === "active" ? "available" : "revoked") : "missing";
        binding.credentialRevision = key?.revision ?? null;
        binding.storageBackend = snapshot.backend;
        binding.restartRequired = binding.consumer.startsWith("mcp:") && (credentialState !== "available" || binding.appliedRevision !== key.revision);
        binding.updatedAt = checkedAt;
        return { ...binding, credentialState };
      });
      await writePrivate(this.#options.registryPath, registry);
      return { checkedAt, backend: snapshot.backend, items };
    });
  }
  async saveCredential({ tool, label, value, expectedRevision, consent }) {
    this.#supported();
    if (consent !== true) fail("consent_required");
    if (!segment(tool) || !segment(label) || typeof value !== "string" || !value || value.includes("\0") || Buffer.byteLength(value) > 16_384 || !(expectedRevision === null || validRevision(expectedRevision))) fail("invalid_credential_update");
    if (!(await this.#registry()).paired) fail("not_connected");
    const capability = await this.#handshake();
    if (!capability.revisionedWrites) fail("incompatible_daemon");
    const result = await this.#request("keys", { version: 1, tool, label, value, expectedRevision }, false, true);
    let key;
    try {
      if (!object(result) || result.version !== 1 || typeof result.oldValueCleanupPending !== "boolean") fail("invalid_response");
      key = credentialMetadata(result.key);
      if (key.tool !== tool || key.label !== label || key.status !== "active") fail("invalid_response");
    } catch { fail("credential_update_uncertain"); }
    // Only metadata enters the registry. If bookkeeping fails after the remote
    // write, signal uncertainty rather than retrying or exporting the value.
    let restartRequired = false;
    try {
      await this.#mutate(async () => {
        const r = await this.#registry();
        const bindings = r.bindings.map(b => {
          if (b.tool !== tool || b.label !== label) return b;
          const needsRestart = b.consumer.startsWith("mcp:");
          restartRequired ||= needsRestart;
          return { ...b, storageBackend: capability.backend, credentialRevision: key.revision, restartRequired: needsRestart, updatedAt: new Date().toISOString() };
        });
        await writePrivate(this.#options.registryPath, { ...r, bindings });
      });
    } catch { fail("credential_update_uncertain"); }
    return { key, oldValueCleanupPending: result.oldValueCleanupPending, restartRequired };
  }
  async link({ envName, tool, label, consumer, consent }, legacyNames = []) {
    this.#supported();
    if (consent !== true) fail("consent_required");
    const binding = { id: randomUUID(), envName, tool, label, consumer, updatedAt: new Date().toISOString(), storageBackend: "unknown", credentialRevision: null, appliedRevision: null, restartRequired: typeof consumer === "string" && consumer.startsWith("mcp:") };
    if (!validBinding(binding)) fail("invalid_binding");
    if (legacyNames.includes(envName) || Object.hasOwn(process.env, envName)) fail("plaintext_conflict");
    return this.#mutate(async () => {
      const inventory = await this.inventory();
      const key = inventory.find(k => k.tool === tool && k.label === label && k.status === "active");
      if (!key) fail("key_unavailable");
      const capability = await this.#handshake();
      binding.storageBackend = capability.backend;
      binding.credentialRevision = key.revision;
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
    return this.#resolveSelected(registry, selected, inherited);
  }
  async resolveSnapshotForConsumer(consumer, inherited = {}, bindingIds) {
    const registry = await this.#registry();
    const selected = registry.bindings.filter(b => b.consumer === consumer);
    if (!selected.length) fail("consumer_not_authorized");
    if (bindingIds && (selected.length !== bindingIds.length || selected.some(b => !bindingIds.includes(b.id)))) fail("launch_binding_changed");
    return this.#resolveSelected(registry, selected, inherited, true);
  }
  async acknowledgeMcpStart(consumer, bindingIds, revisions) {
    this.#supported();
    if (typeof consumer !== "string" || !consumer.startsWith("mcp:") || !object(revisions)) fail("invalid_consumer");
    return this.#mutate(async () => {
      const registry = await this.#registry();
      const selected = registry.bindings.filter(b => b.consumer === consumer);
      if (!selected.length || selected.length !== bindingIds.length || selected.some(b => !bindingIds.includes(b.id) || !validRevision(revisions[b.envName]))) fail("launch_binding_changed");
      for (const binding of selected) {
        // A concurrent rotation after resolution must keep restart pending.
        binding.appliedRevision = revisions[binding.envName];
        binding.restartRequired = binding.credentialRevision !== revisions[binding.envName];
      }
      await writePrivate(this.#options.registryPath, registry);
    });
  }
  async resolveKeyForConsumer(consumer, envName, inherited = {}) {
    if (!safeSecretEnvName(envName)) fail("invalid_binding");
    const registry = await this.#registry();
    const binding = registry.bindings.find(b => b.envName === envName);
    if (!binding) return undefined;
    // An existing binding is authoritative even when the caller lacks its grant.
    // Never treat permission failure as absence and fall back to a plaintext key.
    if (binding.consumer !== consumer) fail("consumer_not_authorized");
    return (await this.#resolveSelected(registry, [binding], inherited))[envName];
  }
  async #resolveSelected(registry, selected, inherited, includeRevisions = false) {
    if (!selected.length) return {};
    this.#supported();
    if (!registry.paired) fail("not_connected");
    const selectedNames = new Set(selected.map(b => b.envName.toUpperCase()));
    for (const env of [inherited, process.env]) if (Object.entries(env).some(([name, value]) => value !== undefined && selectedNames.has(name.toUpperCase()))) fail("plaintext_conflict");
    await this.#handshake();
    const r = await this.#request("resolve", { version: 1, bindings: selected.map(({ envName, tool, label }) => ({ envName, tool, label })), ...(includeRevisions ? { includeRevisions: true } : {}) });
    if (!object(r) || r.version !== 1 || !object(r.values) || Object.keys(r.values).length !== selected.length) fail("invalid_response");
    const values = {};
    for (const b of selected) {
      const v = r.values[b.envName];
      if (!Object.hasOwn(r.values, b.envName) || typeof v !== "string" || !v || v.includes("\0") || Buffer.byteLength(v) > 16_384) fail("invalid_response");
      values[b.envName] = v;
    }
    if (!includeRevisions) return values;
    if (!object(r.revisions) || Object.keys(r.revisions).length !== selected.length || selected.some(b => !Object.hasOwn(r.revisions, b.envName) || !validRevision(r.revisions[b.envName]))) fail("invalid_response");
    return { values, revisions: Object.fromEntries(selected.map(b => [b.envName, r.revisions[b.envName]])) };
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

const grantId = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const commandVector = value => Array.isArray(value) && value.length > 0 && value.length <= 128 && value.every(arg => typeof arg === "string" && arg.length <= 4096 && !arg.includes("\0")) && isAbsolute(value[0]);
function validGrant(g) {
  return object(g) && grantId(g.id) && typeof g.workspace === "string" && isAbsolute(g.workspace)
    && segment(g.name) && commandVector(g.command) && commandVector(g.launcher)
    && Array.isArray(g.bindingIds) && g.bindingIds.length > 0 && g.bindingIds.length <= 32 && g.bindingIds.every(grantId)
    && new Set(g.bindingIds).size === g.bindingIds.length && typeof g.revoked === "boolean"
    && typeof g.createdAt === "string" && Number.isFinite(Date.parse(g.createdAt))
    && (g.active === null || (object(g.active) && grantId(g.active.id) && (g.active.pid === null || (Number.isInteger(g.active.pid) && g.active.pid > 0))
      && object(g.active.revisions) && Object.keys(g.active.revisions).length <= 32 && Object.entries(g.active.revisions).every(([key, revision]) => safeSecretEnvName(key) && validRevision(revision))
      && Object.keys(g.active).every(key => ["id", "pid", "revisions"].includes(key))))
    && Object.keys(g).every(key => ["id", "workspace", "name", "command", "launcher", "bindingIds", "revoked", "createdAt", "active"].includes(key));
}

/** Private launch grants are not execution permissions for model tool calls.
 * The runtime must still apply its normal workspace/session/tool policy, and
 * supply a launch authorization check against the current MCP configuration.
 * A grant binds selected names to one canonical workspace and reviewed command.
 */
export class StmMcpLaunches {
  #credentials; #path; #queue = Promise.resolve();
  constructor({ credentials, registryPath }) {
    this.#credentials = credentials;
    this.#path = registryPath;
  }
  async #read() {
    const r = await privateJson(this.#path, true);
    if (r === null) return { version: 1, grants: [] };
    if (!object(r) || r.version !== 1 || !Array.isArray(r.grants) || r.grants.length > 32 || !r.grants.every(validGrant)
      || new Set(r.grants.map(g => g.id)).size !== r.grants.length || Object.keys(r).some(k => !["version", "grants"].includes(k))) fail("invalid_launch_registry");
    return r;
  }
  #change(fn) {
    const run = async () => {
      await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
      let lock;
      try { lock = await open(this.#path + ".lock", "wx", 0o600); } catch { fail("registry_busy"); }
      try { return await fn(await this.#read()); }
      finally { await lock.close(); await rm(this.#path + ".lock", { force: true }); }
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.then(() => {}, () => {});
    return next;
  }
  async list() { return (await this.#read()).grants; }
  async approve({ workspace, name, command, launcher, bindings, consent }, legacyNames = []) {
    if (consent !== true) fail("consent_required");
    if (!segment(name) || !commandVector(command) || !commandVector(launcher) || typeof workspace !== "string" || !isAbsolute(workspace)
      || !Array.isArray(bindings) || bindings.length === 0 || bindings.length > 32
      || bindings.some(b => !object(b) || !safeSecretEnvName(b.envName) || !segment(b.tool) || !segment(b.label))) fail("invalid_launch_grant");
    const commandCopy = [...command];
    const runner = [...launcher];
    const selection = bindings.map(b => ({ envName: b.envName, tool: b.tool, label: b.label }));
    const canonical = await realpath(workspace).catch(() => fail("invalid_launch_grant"));
    const executable = await realpath(commandCopy[0]).catch(() => fail("invalid_launch_grant"));
    const reviewed = [executable, ...commandCopy.slice(1)];
    return this.#change(async registry => {
      if (registry.grants.length >= 32 || registry.grants.some(g => !g.revoked && g.workspace === canonical && g.name === name)) fail("launch_grant_conflict");
      const id = randomUUID();
      const linked = [];
      try {
        for (const binding of selection) linked.push(await this.#credentials.link({ ...binding, consumer: `mcp:${id}`, consent: true }, legacyNames));
        const grant = { id, workspace: canonical, name, command: reviewed, launcher: runner, bindingIds: linked.map(b => b.id), revoked: false, createdAt: new Date().toISOString(), active: null };
        if (!validGrant(grant)) fail("invalid_launch_grant");
        await writePrivate(this.#path, { ...registry, grants: [...registry.grants, grant] });
        return grant;
      } catch (error) {
        // A partial grant is never launchable. Best-effort cleanup removes only
        // references created by this operation, never the user's STM keys.
        for (const binding of linked) await this.#credentials.unlink(binding.id).catch(() => {});
        throw error;
      }
    });
  }
  async revoke(id) {
    return this.#change(async registry => {
      const grant = registry.grants.find(g => g.id === id);
      if (!grant) fail("launch_grant_unavailable");
      grant.revoked = true;
      await writePrivate(this.#path, registry);
      // Do not kill an in-flight tool or pretend to erase its existing memory.
      // Bindings remain authoritative, blocking stale-plaintext downgrade.
    });
  }
  async recoverExited(id, { expectedLaunchId, consent }) {
    if (consent !== true) fail("consent_required");
    if (!grantId(id) || !grantId(expectedLaunchId)) fail("invalid_launch_grant");
    return this.#change(async registry => {
      const grant = registry.grants.find(g => g.id === id);
      if (!grant?.active || grant.active.id !== expectedLaunchId) fail("launch_recovery_conflict");
      // A crash between durable intent and PID publication has no reliable
      // process identity. Do not guess that the child was never spawned.
      if (grant.active.pid === null) fail("launch_recovery_uncertain");
      try { process.kill(grant.active.pid, 0); }
      catch (error) {
        // ESRCH is the only accepted evidence of absence. EPERM, reused PIDs
        // and all other uncertainty keep the record blocked. Never kill here.
        if (error?.code !== "ESRCH") fail("process_state_unavailable");
        grant.active = null;
        await writePrivate(this.#path, registry);
        return;
      }
      fail("consumer_still_running");
    });
  }
  async #clearExited(id, launchId) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await this.#change(async latest => {
          const current = latest.grants.find(g => g.id === id);
          if (current?.active?.id === launchId) { current.active = null; await writePrivate(this.#path, latest); }
        });
        return;
      } catch (error) {
        if (!(error instanceof StmError) || error.code !== "registry_busy" || attempt === 9) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    // Bounded contention retry only. Never steal stale locks or forget an
    // uncertain record; explicit recovery must verify the recorded process.
  }
  async start(id, { cwd, authorize, inherited = process.env, stdio = "pipe" }) {
    if (!grantId(id) || typeof authorize !== "function") fail("permission_denied");
    const canonical = await realpath(cwd).catch(() => fail("workspace_mismatch"));
    const base = { ...inherited };
    return this.#change(async registry => {
      const grant = registry.grants.find(g => g.id === id);
      if (!grant || grant.revoked) fail("launch_grant_unavailable");
      if (grant.workspace !== canonical) fail("workspace_mismatch");
      if (grant.active) fail("consumer_already_running");
      // Give the caller a detached metadata snapshot, not a mutable grant.
      if (await authorize(structuredClone(grant)) !== true) fail("permission_denied");
      const all = await this.#credentials.listBindings();
      const selected = all.filter(b => b.consumer === `mcp:${id}`);
      if (selected.length !== grant.bindingIds.length || selected.some(b => !grant.bindingIds.includes(b.id))) fail("launch_binding_changed");
      const unrelated = new Set(all.filter(b => b.consumer !== `mcp:${id}`).map(b => b.envName.toUpperCase()));
      for (const key of Object.keys(base)) if (unrelated.has(key.toUpperCase())) delete base[key];
      const snapshot = await this.#credentials.resolveSnapshotForConsumer(`mcp:${id}`, base, grant.bindingIds);
      // Recheck just before spawn; authorization must never be replaced by a
      // credential binding or by a previous successful connection.
      if (await authorize(structuredClone(grant)) !== true) fail("permission_denied");
      const launchId = randomUUID();
      // Publish launch intent before spawn. A crash must never leave an
      // unrecorded child with credentials and an apparently unused grant.
      grant.active = { id: launchId, pid: null, revisions: snapshot.revisions };
      await writePrivate(this.#path, registry);
      const child = spawn(grant.command[0], grant.command.slice(1), { cwd: canonical, env: { ...base, ...snapshot.values }, shell: false, stdio });
      const clear = () => this.#clearExited(id, launchId);
      child.once("exit", clear);
      try {
        await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", () => reject(new StmError("consumer_start_failed"))); });
        grant.active = { id: launchId, pid: child.pid, revisions: snapshot.revisions };
        await writePrivate(this.#path, registry);
        await this.#credentials.acknowledgeMcpStart(`mcp:${id}`, grant.bindingIds, snapshot.revisions);
        if (child.exitCode !== null || child.signalCode !== null) void clear();
        return child;
      } catch (error) {
        if (child.pid === undefined) void clear(); // spawn error: no child exists
        else child.kill("SIGTERM");
        throw error;
      }
    });
  }
}
