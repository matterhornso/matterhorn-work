import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const stops: Array<() => void | Promise<void>> = [];
const roots: string[] = [];

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) await rm(roots.pop()!, { recursive: true, force: true });
});

describe("workspace persistence", () => {
  test("creates the server config when a local workspace is added", async () => {
    const root = await mkdtemp(join(tmpdir(), "matterhorn-workspaces-"));
    roots.push(root);
    const initialWorkspace = join(root, "initial");
    const addedWorkspace = join(root, "added");
    const configPath = join(root, "server.json");
    const config: ServerConfig = {
      host: "127.0.0.1",
      port: 0,
      token: "client-token",
      hostToken: "host-token",
      configPath,
      approval: { mode: "auto", timeoutMs: 1000 },
      corsOrigins: ["*"],
      workspaces: [{
        id: "ws_initial",
        name: "Initial",
        path: initialWorkspace,
        preset: "starter",
        workspaceType: "local",
      }],
      authorizedRoots: [root, initialWorkspace],
      readOnly: false,
      startedAt: Date.now(),
      tokenSource: "cli",
      hostTokenSource: "cli",
      logFormat: "pretty",
      logRequests: false,
    };
    const server = await startServer(config) as Served;
    stops.push(() => server.stop(true));

    const response = await fetch(`http://127.0.0.1:${server.port}/workspaces/local`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Matterhorn-Host-Token": config.hostToken,
      },
      body: JSON.stringify({
        folderPath: addedWorkspace,
        name: "Added workspace",
        preset: "starter",
      }),
    });

    expect(response.status).toBe(201);
    expect((await response.json()).persisted).toBe(true);
    const persisted = JSON.parse(await readFile(configPath, "utf8"));
    expect(persisted.workspaces).toHaveLength(2);
    expect(persisted.workspaces[0]).toMatchObject({
      name: "Added workspace",
      path: addedWorkspace,
      workspaceType: "local",
    });
    expect(persisted.authorizedRoots).toContain(addedWorkspace);
  });
});
