import { test, expect } from "bun:test";
import { mkdtemp, writeFile, readFile, rm, realpath, symlink, chmod } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { StmCredentials, StmMcpLaunches } from "@matterhorn-work/stm-credentials";
import { EnvService } from "./env-file.js";
import { migrateStmMcp, reviewStmMcpConfiguration, authorizeConfiguredStmMcp, eligibleStmToolSecret } from "./stm-mcp.js";
import { opencodeConfigPath } from "./workspace-files.js";

test("MCP migration commits only after verification, configures one approved tool and resumes idempotently", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "stm-migration-tool-")));
  try {
    const path = join(root, "env.json"), descriptorPath = join(root, "daemon.json");
    const source = new EnvService({ path });
    await source.upsertMany([{ key: "FIXTURE_API_KEY", value: "selected-disposable-fixture" }, { key: "KEEP", value: "untouched-fixture" }]);
    await writeFile(descriptorPath, JSON.stringify({ port: 4321, pid: process.pid, token: "a".repeat(48) }), { mode: 0o600 });
    const vault = new Map<string, string>(); let writes = 0;
    const credentials = new StmCredentials({ enabled: true, localDesktop: true, platform: "darwin", descriptorPath, registryPath: join(root, "stm-bindings.json"), fetch: async (url, init) => {
      if (url.endsWith("capabilities")) return Response.json({ version: 1, backend: "fake storage", backendId: "macos-keychain", selectedResolution: true, revisionedWrites: true });
      const body = JSON.parse(String(init.body));
      if (url.endsWith("keys")) {
        const identity = `${body.tool}/${body.label}`;
        if (vault.has(identity)) return new Response(null, { status: 412 });
        writes++; vault.set(identity, body.value); return Response.json({ version: 1 });
      }
      const binding = body.bindings[0];
      return Response.json({ version: 1, values: { [binding.envName]: vault.get(`${binding.tool}/${binding.label}`) }, revisions: { [binding.envName]: "d".repeat(64) } });
    } });
    await credentials.connect({ consent: true });
    const launches = new StmMcpLaunches({ credentials, registryPath: join(root, "launches.json") });
    await writeFile(opencodeConfigPath(root), JSON.stringify({ mcp: { fixture: { type: "local", command: [process.execPath, "-e", "process.stdin.resume()"], enabled: true } } }));
    const input = { credentials, launches, source: source.migrationSource(), id: randomUUID(), workspace: root, name: "fixture", launcher: [process.execPath, "/fixture/stm-runner.js"], envNames: ["FIXTURE_API_KEY"], backend: "fake storage", expectedConfiguration: JSON.stringify(await reviewStmMcpConfiguration(root, "fixture")) };
    const grant = await migrateStmMcp(input);
    expect(await authorizeConfiguredStmMcp(grant)).toBe(true);
    expect(grant.active).toBeNull();
    expect(await source.get("FIXTURE_API_KEY")).toBe("selected-disposable-fixture");
    const config = await readFile(opencodeConfigPath(root), "utf8");
    expect(config).not.toContain("selected-disposable-fixture"); expect(config).toContain(grant.id);
    await expect(EnvService.readForInjection(path)).rejects.toThrow("plaintext_conflict");
    const retry = await migrateStmMcp({ ...input, expectedConfiguration: JSON.stringify(await reviewStmMcpConfiguration(root, "fixture")) });
    expect(retry.id).toBe(grant.id); expect(writes).toBe(1);
    await credentials.finishMigration(input.id, { consent: true }, source.migrationSource());
    expect(await EnvService.readForInjection(path)).toEqual({ KEEP: "untouched-fixture" });
    expect(await credentials.resolveForConsumer(`mcp:${grant.id}`)).toEqual({ FIXTURE_API_KEY: "selected-disposable-fixture" });
    await expect(launches.approveMigrated({ id: input.id, workspace: root, name: "different", command: grant.command, launcher: grant.launcher, consent: true })).rejects.toThrow("migration_conflict");
    await expect(migrateStmMcp({ ...input, envNames: ["KEEP"], expectedConfiguration: JSON.stringify(await reviewStmMcpConfiguration(root, "fixture")) })).rejects.toThrow("migration_conflict");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("migration source is owner-only, no-follow, serializes other writers and detects external edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "stm-migration-source-"));
  try {
    const path = join(root, "env.json"), env = new EnvService({ path });
    await env.upsertMany([{ key: "FIXTURE_API_KEY", value: "disposable" }]);
    const source = env.migrationSource();
    await source.withEntries(["FIXTURE_API_KEY"], async entries => {
      expect(entries).toHaveLength(1);
      await expect(new EnvService({ path }).upsertMany([{ key: "OTHER", value: "not-written" }])).rejects.toThrow("environment_busy");
      const raw = await readFile(path, "utf8");
      await writeFile(path, raw.replace("disposable", "modified"));
      await expect(source.assertUnchanged()).rejects.toThrow("migration_source_changed");
      await expect(source.removeSelected()).rejects.toThrow("migration_source_changed");
    });
    await chmod(path, 0o644);
    await expect(env.migrationSource().withEntries(["FIXTURE_API_KEY"], async () => {})).rejects.toThrow("migration_source_unsafe");
    await chmod(path, 0o600);
    await symlink(path, join(root, "link.json"));
    await expect(new EnvService({ path: join(root, "link.json") }).migrationSource().withEntries(["FIXTURE_API_KEY"], async () => {})).rejects.toThrow("migration_source_unavailable");
    expect(await readFile(path, "utf8")).toContain("modified");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("tool migration eligibility excludes wallet, seed, process and non-credential names", () => {
  for (const name of ["PRIVATE_KEY", "WALLET_API_KEY", "HOTKEY_API_TOKEN", "SEED", "MNEMONIC", "PATH", "NODE_API_KEY", "MATTERHORN_WORK_API_KEY", "PUBLIC_NAME"]) expect(eligibleStmToolSecret(name)).toBe(false);
  for (const name of ["EXAMPLE_API_KEY", "SERVICE_API_TOKEN", "SERVICE_CLIENT_SECRET"]) expect(eligibleStmToolSecret(name)).toBe(true);
});
