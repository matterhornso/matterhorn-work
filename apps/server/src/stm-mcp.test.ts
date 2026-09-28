import { test, expect } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StmCredentials, StmMcpLaunches } from "@matterhorn-work/stm-credentials";
import { approveStmMcp, authorizeConfiguredStmMcp, parseStmMcpBindings } from "./stm-mcp.js";
import { opencodeConfigPath } from "./workspace-files.js";

test("MCP configuration keeps only an opaque grant and refuses altered or disabled commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "stm-mcp-config-"));
  const descriptorPath = join(root, "daemon.json");
  const registryPath = join(root, "bindings.json");
  const secret = "disposable-not-resolved-in-configuration";
  let resolutions = 0;
  try {
    await writeFile(descriptorPath, JSON.stringify({ port: 3456, pid: process.pid, token: "a".repeat(48) }), { mode: 0o600 });
    const credentials = new StmCredentials({ enabled: true, platform: "darwin", localDesktop: true, descriptorPath, registryPath,
      fetch: async url => {
        if (String(url).endsWith("capabilities")) return Response.json({ version: 1, backend: "fixture", backendId: "macos-keychain", selectedResolution: true });
        if (String(url).endsWith("keys")) return Response.json({ version: 1, keys: [{ tool: "fixture", label: "default", revision: "a".repeat(64), status: "active", updatedAt: "2026-09-28" }] });
        resolutions++; return Response.json({ values: { FIXTURE_KEY: secret } });
      },
    });
    await credentials.connect({ consent: true });
    const launches = new StmMcpLaunches({ credentials, registryPath: join(root, "launches.json") });
    const configPath = opencodeConfigPath(root);
    await writeFile(configPath, JSON.stringify({ mcp: { fixture: { type: "local", command: [process.execPath, "-e", "process.stdin.resume()"], enabled: true } } }));
    const grant = await approveStmMcp({ launches, workspace: root, name: "fixture", launcher: [process.execPath, "/trusted/stm-mcp-run.js"],
      bindings: [{ envName: "FIXTURE_KEY", tool: "fixture", label: "default" }], consent: true, legacyNames: [] });
    expect(await authorizeConfiguredStmMcp(grant)).toBe(true);
    const configured = await readFile(configPath, "utf8");
    expect(configured).toContain(grant.id);
    expect(configured).not.toContain(secret);
    expect(configured).not.toContain("a".repeat(48));
    expect(resolutions).toBe(0);
    await writeFile(configPath, JSON.stringify({ mcp: { fixture: { type: "local", command: [...grant.launcher, grant.id, "--unreviewed"], enabled: true } } }));
    expect(await authorizeConfiguredStmMcp(grant)).toBe(false);
    await writeFile(configPath, JSON.stringify({ mcp: { fixture: { type: "local", command: [...grant.launcher, grant.id], enabled: false } } }));
    expect(await authorizeConfiguredStmMcp(grant)).toBe(false);
    await writeFile(configPath, JSON.stringify({ mcp: { fixture: { type: "local", command: [...grant.launcher, grant.id], environment: { NODE_OPTIONS: "--unreviewed" } } } }));
    expect(await authorizeConfiguredStmMcp(grant)).toBe(false);
    await writeFile(configPath, "{}");
    expect(await authorizeConfiguredStmMcp(grant)).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("launch bindings accept only explicit metadata fields", () => {
  expect(parseStmMcpBindings([{ envName: "EXAMPLE_KEY", tool: "example", label: "default" }])).toHaveLength(1);
  for (const input of [null, [], [null], [{ envName: "EXAMPLE_KEY", tool: "example", label: "default", value: "not-allowed" }]]) {
    expect(() => parseStmMcpBindings(input)).toThrow("invalid_binding");
  }
});
