import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { StmCredentials, StmError } from "../index.mjs";

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "stm-migration-fixture-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const descriptorPath = join(dir, "daemon.json"), registryPath = join(dir, "bindings.json");
  await writeFile(descriptorPath, JSON.stringify({ port: 4321, pid: process.pid, token: "a".repeat(48) }), { mode: 0o600 });
  const vault = new Map();
  const state = { backend: "fixture only", disconnectAfterWrite: false, changed: false, removalFails: false, resolveFails: false, writes: 0 };
  const fetch = async (url, init) => {
    if (url.endsWith("capabilities")) return Response.json({ version: 1, backend: state.backend, backendId: "macos-keychain", selectedResolution: true, revisionedWrites: true });
    const body = JSON.parse(init.body);
    if (url.endsWith("keys")) {
      const identity = `${body.tool}/${body.label}`;
      if (vault.has(identity)) return new Response(null, { status: 412 });
      state.writes++;
      vault.set(identity, { value: body.value, revision: randomBytes(32).toString("hex") });
      if (state.disconnectAfterWrite) { state.disconnectAfterWrite = false; throw new Error("private transport detail"); }
      return Response.json({ version: 1 });
    }
    if (state.resolveFails) return new Response(null, { status: 503 });
    const b = body.bindings[0], key = vault.get(`${b.tool}/${b.label}`);
    return Response.json({ version: 1, values: { [b.envName]: key?.value }, revisions: { [b.envName]: key?.revision } });
  };
  const options = { enabled: true, localDesktop: true, platform: "darwin", registryPath, descriptorPath, fetch };
  const adapter = new StmCredentials(options);
  await adapter.connect({ consent: true });
  let rows = [{ key: "TEST_VOICE_KEY", value: "disposable-fixture-secret", updatedAt: 7 }, { key: "KEEP_KEY", value: "unrelated-fixture", updatedAt: 2 }];
  let selected = [];
  const source = {
    async withEntries(keys, fn) { selected = keys; return fn(rows.filter(r => keys.includes(r.key))); },
    async assertUnchanged() { if (state.changed) throw new StmError("migration_source_changed"); },
    async removeSelected() { if (state.removalFails) throw new Error("disk-full-fixture"); await this.assertUnchanged(); rows = rows.filter(r => !selected.includes(r.key)); },
  };
  const input = { id: randomUUID(), backend: state.backend, selections: [{ envName: "TEST_VOICE_KEY", consumer: "voice:realtime" }], consent: true };
  return { adapter, options, source, input, state, vault, registryPath, rows: () => rows };
}

test("two-stage migration verifies selected values, stores only metadata, and preserves unrelated entries", async t => {
  const f = await fixture(t);
  await assert.rejects(f.adapter.migrateSelected({ ...f.input, consent: false }, f.source), /consent_required/);
  assert.equal(f.state.writes, 0);
  const job = await f.adapter.migrateSelected(f.input, f.source);
  assert.equal(job.state, "published");
  assert.equal(f.rows().length, 2);
  assert.equal(f.vault.size, 1);
  for (const path of [f.registryPath, f.registryPath + ".migrations"]) {
    const persisted = await readFile(path, "utf8");
    assert.ok(!persisted.includes("disposable-fixture-secret"));
    assert.ok(!persisted.includes("unrelated-fixture"));
    assert.ok(!persisted.includes('"value"'));
  }
  await assert.rejects(f.adapter.unlink(job.entries[0].binding.id), /migration_cleanup_required/);
  await assert.rejects(f.adapter.resolveForConsumer("voice:realtime", { TEST_VOICE_KEY: "stale" }), /plaintext_conflict/);
  await assert.rejects(f.adapter.finishMigration(job.id, { consent: false }, f.source), /consent_required/);
  await f.adapter.finishMigration(job.id, { consent: true }, f.source);
  assert.deepEqual(f.rows().map(r => r.key), ["KEEP_KEY"]);
  assert.equal((await f.adapter.listMigrations())[0].state, "complete");
  assert.deepEqual(await f.adapter.resolveForConsumer("voice:realtime"), { TEST_VOICE_KEY: "disposable-fixture-secret" });
  await f.adapter.finishMigration(job.id, { consent: true }, f.source);
  assert.equal(f.state.writes, 1);
});

test("interrupted remote creation resumes after restart with the same key, never overwriting", async t => {
  const f = await fixture(t); f.state.disconnectAfterWrite = true;
  await assert.rejects(f.adapter.migrateSelected(f.input, f.source), /credential_update_uncertain/);
  assert.equal((await f.adapter.listMigrations())[0].state, "prepared");
  assert.equal((await f.adapter.listBindings()).length, 0);
  const restarted = new StmCredentials(f.options);
  assert.equal((await restarted.migrateSelected(f.input, f.source)).state, "published");
  assert.equal(f.state.writes, 1);
  await assert.rejects(restarted.migrateSelected({ ...f.input, selections: [{ envName: "KEEP_KEY", consumer: "voice:realtime" }] }, f.source), /migration_conflict/);
});

test("changed source and wrong imported value cannot publish references", async t => {
  const f = await fixture(t); f.state.disconnectAfterWrite = true;
  await assert.rejects(f.adapter.migrateSelected(f.input, f.source));
  f.rows()[0].value = "edited-fixture";
  await assert.rejects(f.adapter.migrateSelected(f.input, f.source), /migration_verification_failed/);
  assert.equal((await f.adapter.listBindings()).length, 0);
  assert.equal(f.state.writes, 1);
});

test("source edit between verification and publication fails closed", async t => {
  const f = await fixture(t); f.state.changed = true;
  await assert.rejects(f.adapter.migrateSelected(f.input, f.source), /migration_source_changed/);
  assert.equal((await f.adapter.listBindings()).length, 0);
  assert.equal(f.rows().length, 2);
});

test("storage backend changes, unavailable vault, and stale revisions prevent plaintext removal", async t => {
  const f = await fixture(t); await f.adapter.migrateSelected(f.input, f.source);
  f.state.backend = "another backend";
  await assert.rejects(f.adapter.finishMigration(f.input.id, { consent: true }, f.source), /migration_backend_changed/);
  f.state.backend = f.input.backend; f.state.resolveFails = true;
  await assert.rejects(f.adapter.finishMigration(f.input.id, { consent: true }, f.source));
  f.state.resolveFails = false;
  for (const value of f.vault.values()) value.revision = "f".repeat(64);
  await assert.rejects(f.adapter.finishMigration(f.input.id, { consent: true }, f.source), /migration_source_changed/);
  assert.equal(f.rows().length, 2);
});

test("failed plaintext write retains published references and can resume without new imports", async t => {
  const f = await fixture(t); await f.adapter.migrateSelected(f.input, f.source);
  f.state.removalFails = true;
  await assert.rejects(f.adapter.finishMigration(f.input.id, { consent: true }, f.source));
  assert.equal((await f.adapter.listMigrations())[0].state, "published");
  assert.equal(f.rows().length, 2);
  f.state.removalFails = false;
  await new StmCredentials(f.options).finishMigration(f.input.id, { consent: true }, f.source);
  assert.equal(f.state.writes, 1);
});

test("flag rollback retains references and refuses resolution or cleanup", async t => {
  const f = await fixture(t); await f.adapter.migrateSelected(f.input, f.source);
  const disabled = new StmCredentials({ ...f.options, enabled: false });
  assert.equal((await disabled.listBindings()).length, 1);
  await assert.rejects(disabled.finishMigration(f.input.id, { consent: true }, f.source), /disabled/);
  await assert.rejects(disabled.resolveForConsumer("voice:realtime"), /disabled/);
});

test("restart reconciles published references when the journal commit was interrupted", async t => {
  const f = await fixture(t);
  const job = await f.adapter.migrateSelected(f.input, f.source);
  // Reproduce the durable boundary after registry rename, before journal rename.
  await writeFile(f.registryPath + ".migrations", JSON.stringify([{ ...job, state: "prepared" }]), { mode: 0o600 });
  const restarted = new StmCredentials(f.options);
  await restarted.migrateSelected(f.input, f.source);
  assert.equal((await restarted.listBindings()).length, 1);
  assert.equal((await restarted.listBindings())[0].id, job.entries[0].binding.id);
  assert.equal((await restarted.listMigrations())[0].state, "published");
  assert.equal(f.state.writes, 1);
  assert.equal(f.rows().length, 2);
});

test("restart finishes a removed source entry without reimporting or restoring plaintext", async t => {
  const f = await fixture(t);
  const job = await f.adapter.migrateSelected(f.input, f.source);
  await f.adapter.finishMigration(job.id, { consent: true }, f.source);
  // Reproduce the durable boundary after source rename, before completion journal.
  await writeFile(f.registryPath + ".migrations", JSON.stringify([job]), { mode: 0o600 });
  const restarted = new StmCredentials(f.options);
  await restarted.finishMigration(job.id, { consent: true }, f.source);
  assert.equal((await restarted.listMigrations())[0].state, "complete");
  assert.deepEqual(f.rows().map(r => r.key), ["KEEP_KEY"]);
  assert.equal(f.state.writes, 1);
});
