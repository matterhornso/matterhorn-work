import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalStmCredentials, STM_RELEASE_FLAG } from "./stm-runtime.js";

test("single release flag is strict and local supported shell is required", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stm-runtime-"));
  try {
    for (const value of [undefined, "0", "true", "yes"]) {
      const a = createLocalStmCredentials({ host: "127.0.0.1", platform: "darwin", env: { [STM_RELEASE_FLAG]: value }, envStorePath: join(dir, "env.json") });
      expect(await a.status()).toEqual({ state: "unavailable", code: "disabled" });
    }
    for (const host of ["0.0.0.0", "::", "example.com"]) {
      const a = createLocalStmCredentials({ host, platform: "darwin", env: { [STM_RELEASE_FLAG]: "1" }, envStorePath: join(dir, "env.json") });
      expect(await a.status()).toEqual({ state: "unavailable", code: "unsupported_environment" });
      await expect(a.connect({ consent: true })).rejects.toThrow("unsupported_environment");
    }
    const unsupported = createLocalStmCredentials({ host: "127.0.0.1", platform: "linux", env: { [STM_RELEASE_FLAG]: "1" }, envStorePath: join(dir, "env.json") });
    expect(await unsupported.status()).toEqual({ state: "unavailable", code: "unsupported_environment" });
    const local = createLocalStmCredentials({ host: "127.0.0.1", platform: "darwin", env: { [STM_RELEASE_FLAG]: "1" }, envStorePath: join(dir, "env.json") });
    expect(await local.status()).toEqual({ state: "not_connected" });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("disabled runtime keeps existing binding authoritative without reading a daemon", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stm-runtime-rollback-"));
  try {
    await writeFile(join(dir, "stm-bindings.json"), JSON.stringify({ version: 1, paired: true, bindings: [{ id: "00000000-0000-0000-0000-000000000001", envName: "OPENAI_API_KEY", tool: "fixture", label: "default", consumer: "voice:realtime", updatedAt: "2026-09-28" }] }), { mode: 0o600 });
    const a = createLocalStmCredentials({ host: "127.0.0.1", platform: "darwin", env: {}, envStorePath: join(dir, "env.json") });
    expect(await a.listBindings()).toHaveLength(1);
    await expect(a.resolveKeyForConsumer("voice:realtime", "OPENAI_API_KEY")).rejects.toThrow("disabled");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
