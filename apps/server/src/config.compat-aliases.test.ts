import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveServerConfig, type CliArgs } from "./config.js";

const managedEnvKeys = [
  "MATTERHORN_WORK_TOKEN",
  "OPENWORK_TOKEN",
  "MATTERHORN_WORK_HOST_TOKEN",
  "OPENWORK_HOST_TOKEN",
  "MATTERHORN_WORK_APPROVAL_MODE",
  "OPENWORK_APPROVAL_MODE",
  "MATTERHORN_WORK_CORS_ORIGINS",
  "OPENWORK_CORS_ORIGINS",
  "MATTERHORN_WORK_REQUEST_RATE_LIMIT_ENABLED",
  "OPENWORK_REQUEST_RATE_LIMIT_ENABLED",
  "MATTERHORN_WORK_REQUEST_RATE_LIMIT_WINDOW_MS",
  "OPENWORK_REQUEST_RATE_LIMIT_WINDOW_MS",
  "MATTERHORN_WORK_REQUEST_RATE_LIMIT_MAX",
  "OPENWORK_REQUEST_RATE_LIMIT_MAX",
  "MATTERHORN_WORK_REQUEST_RATE_LIMIT_READ_MAX",
  "OPENWORK_REQUEST_RATE_LIMIT_READ_MAX",
  "MATTERHORN_WORK_REQUEST_RATE_LIMIT_WRITE_MAX",
  "OPENWORK_REQUEST_RATE_LIMIT_WRITE_MAX",
  "MATTERHORN_WORK_WORKSPACES",
  "OPENWORK_WORKSPACES",
] as const;

const originalEnv = new Map<string, string | undefined>(
  managedEnvKeys.map((key) => [key, process.env[key]]),
);
const tempDirs: string[] = [];

function baseCli(configPath: string): CliArgs {
  return { configPath, workspaces: [] };
}

function makeConfigPath() {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-config-aliases-"));
  tempDirs.push(dir);
  const configPath = join(dir, "server.json");
  writeFileSync(configPath, "{}\n", "utf8");
  return configPath;
}

afterEach(() => {
  for (const key of managedEnvKeys) {
    const original = originalEnv.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Matterhorn Desks env aliases", () => {
  test("defaults CORS to loopback-only development origins", async () => {
    const config = await resolveServerConfig(baseCli(makeConfigPath()));

    expect(config.corsOrigins).toEqual(["loopback"]);
  });

  test("prefers MATTERHORN_WORK token env vars over legacy OPENWORK vars", async () => {
    process.env.OPENWORK_TOKEN = "legacy-client";
    process.env.MATTERHORN_WORK_TOKEN = "matterhorn-client";
    process.env.OPENWORK_HOST_TOKEN = "legacy-host";
    process.env.MATTERHORN_WORK_HOST_TOKEN = "matterhorn-host";
    process.env.OPENWORK_REQUEST_RATE_LIMIT_MAX = "50";
    process.env.MATTERHORN_WORK_REQUEST_RATE_LIMIT_MAX = "75";

    const config = await resolveServerConfig(baseCli(makeConfigPath()));

    expect(config.token).toBe("matterhorn-client");
    expect(config.hostToken).toBe("matterhorn-host");
    expect(config.tokenSource).toBe("env");
    expect(config.hostTokenSource).toBe("env");
    expect(config.requestRateLimit?.maxRequests).toBe(75);
  });

  test("falls back to legacy OPENWORK env vars", async () => {
    process.env.OPENWORK_TOKEN = "legacy-client";
    process.env.OPENWORK_HOST_TOKEN = "legacy-host";
    process.env.OPENWORK_APPROVAL_MODE = "auto";
    process.env.OPENWORK_CORS_ORIGINS = "https://one.example,https://two.example";
    process.env.OPENWORK_REQUEST_RATE_LIMIT_ENABLED = "false";
    process.env.OPENWORK_REQUEST_RATE_LIMIT_WINDOW_MS = "120000";
    process.env.OPENWORK_REQUEST_RATE_LIMIT_MAX = "400";
    process.env.OPENWORK_REQUEST_RATE_LIMIT_READ_MAX = "800";
    process.env.OPENWORK_REQUEST_RATE_LIMIT_WRITE_MAX = "200";

    const config = await resolveServerConfig(baseCli(makeConfigPath()));

    expect(config.token).toBe("legacy-client");
    expect(config.hostToken).toBe("legacy-host");
    expect(config.approval.mode).toBe("auto");
    expect(config.corsOrigins).toEqual(["https://one.example", "https://two.example"]);
    expect(config.requestRateLimit).toMatchObject({
      enabled: false,
      windowMs: 120000,
      maxRequests: 400,
      readMaxRequests: 800,
      writeMaxRequests: 200,
    });
  });

  test("explicit workspaces replace stale file authorized roots", async () => {
    const configPath = makeConfigPath();
    writeFileSync(
      configPath,
      JSON.stringify({
        workspaces: [{ path: "./stale-workspace" }],
        authorizedRoots: ["./stale-workspace"],
      }),
      "utf8",
    );
    const workspacePath = join(configPath, "..", "launch-workspace");

    const config = await resolveServerConfig({
      ...baseCli(configPath),
      workspaces: [workspacePath],
    });

    expect(config.workspaces).toHaveLength(1);
    expect(config.workspaces[0]?.path).toBe(workspacePath);
    expect(config.authorizedRoots).toEqual([workspacePath]);
  });

  test("environment workspaces replace stale file authorized roots", async () => {
    const configPath = makeConfigPath();
    writeFileSync(
      configPath,
      JSON.stringify({
        workspaces: [{ path: "./stale-workspace" }],
        authorizedRoots: ["./stale-workspace"],
      }),
      "utf8",
    );
    const workspacePath = join(configPath, "..", "environment-workspace");
    process.env.MATTERHORN_WORK_WORKSPACES = workspacePath;

    const config = await resolveServerConfig(baseCli(configPath));

    expect(config.workspaces).toHaveLength(1);
    expect(config.workspaces[0]?.path).toBe(workspacePath);
    expect(config.authorizedRoots).toEqual([workspacePath]);
  });
});
