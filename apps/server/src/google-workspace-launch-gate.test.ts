import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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
