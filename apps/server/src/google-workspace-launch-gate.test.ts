import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createCipheriv } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { googleWorkspaceStatus } from "./extensions/google-workspace.js";

const credentialKeys = [
  "MATTERHORN_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID",
  "MATTERHORN_GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET",
  "MATTERHORN_GOOGLE_WORKSPACE_TOKEN_BROKER_URL",
  "GOOGLE_WORKSPACE_OAUTH_CLIENT_ID",
  "GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET",
  "GOOGLE_WORKSPACE_TOKEN_BROKER_URL",
  "OPENWORK_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID",
  "OPENWORK_GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET",
  "OPENWORK_GOOGLE_WORKSPACE_TOKEN_BROKER_URL",
  "MATTERHORN_ENCRYPTION_KEY",
  "OPENWORK_ENCRYPTION_KEY",
  "MATTERHORN_GOOGLE_WORKSPACE_ALLOW_PLAINTEXT_VAULT",
  "OPENWORK_GOOGLE_WORKSPACE_ALLOW_PLAINTEXT_VAULT",
] as const;

const originalEnvironment = new Map<string, string | undefined>();
let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "matterhorn-google-workspace-gate-"));
  for (const key of credentialKeys) {
    originalEnvironment.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of credentialKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnvironment.clear();
  await rm(root, { recursive: true, force: true });
});

describe("Google Workspace public launch gate", () => {
  test("status reads never create or replace an unavailable encryption key", async () => {
    const vaultDir = join(root, "extensions", "google-workspace");
    await mkdir(vaultDir, { recursive: true });
    const envelope = JSON.stringify({ iv: "synthetic", tag: "synthetic", data: "synthetic" });
    const vaultPath = join(vaultDir, "oauth.vault");
    const keyPath = join(root, "vault-key");
    await writeFile(vaultPath, envelope);
    const config = { configPath: join(root, "server.json") } as never;
    expect(await googleWorkspaceStatus(config)).toMatchObject({ error: "Google Workspace vault key is unavailable" });
    await expect(stat(keyPath)).rejects.toMatchObject({ code: "ENOENT" });
    await writeFile(keyPath, "invalid-synthetic-key\n");
    expect(await googleWorkspaceStatus(config)).toMatchObject({ error: "Google Workspace vault key is unavailable" });
    expect(await readFile(keyPath, "utf8")).toBe("invalid-synthetic-key\n");
    expect(await readFile(vaultPath, "utf8")).toBe(envelope);
  });

  test("status still reads a valid encrypted fixture without changing stored bytes", async () => {
    const vaultDir = join(root, "extensions", "google-workspace");
    await mkdir(vaultDir, { recursive: true });
    const key = Buffer.alloc(32, 7);
    const iv = Buffer.alloc(12, 3);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify({ token: { accessToken: "synthetic-fixture-token" } }), "utf8"), cipher.final()]);
    const envelope = JSON.stringify({ iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: encrypted.toString("base64") });
    const vaultPath = join(vaultDir, "oauth.vault");
    const keyPath = join(root, "vault-key");
    await writeFile(vaultPath, envelope);
    await writeFile(keyPath, key.toString("base64"));
    const status = await googleWorkspaceStatus({ configPath: join(root, "server.json") } as never);
    expect(status.connected).toBe(true);
    expect(status.error).toBeNull();
    expect(await readFile(keyPath, "utf8")).toBe(key.toString("base64"));
    expect(await readFile(vaultPath, "utf8")).toBe(envelope);
  });

  test("fails closed when reviewed Matterhorn OAuth credentials are absent", async () => {
    const status = await googleWorkspaceStatus({
      configPath: join(root, "server.json"),
    } as never);

    expect(status.configured).toBe(false);
    expect(status.connected).toBe(false);
    expect(status.missing).toEqual([
      "MATTERHORN_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID",
      "MATTERHORN_GOOGLE_WORKSPACE_OAUTH_CLIENT_SECRET or MATTERHORN_GOOGLE_WORKSPACE_TOKEN_BROKER_URL",
    ]);
  });

  test("accepts the canonical Matterhorn client and broker variables", async () => {
    process.env.MATTERHORN_GOOGLE_WORKSPACE_OAUTH_CLIENT_ID = "matterhorn-client.apps.googleusercontent.com";
    process.env.MATTERHORN_GOOGLE_WORKSPACE_TOKEN_BROKER_URL = "https://oauth.matterhorn.work/google";

    const status = await googleWorkspaceStatus({
      configPath: join(root, "server.json"),
    } as never);

    expect(status.configured).toBe(true);
    expect(status.connected).toBe(false);
    expect(status.missing).toEqual([]);
  });
});
