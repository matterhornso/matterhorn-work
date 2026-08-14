import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_workspace_mission_routes_token";
const HOST_TOKEN = "owt_workspace_mission_routes_host_token";
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  dataDir: process.env.OPENWORK_DATA_DIR,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
};

function config(port: number, root: string, readOnly = false): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1_000 },
    corsOrigins: ["*"],
    workspaces: [{
      id: "ws_mission",
      name: "Mission route workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
    }],
    authorizedRoots: [root],
    readOnly,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  } as ServerConfig;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

async function boot(readOnly = false) {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-workspace-mission-routes-"));
  dirs.push(root);
  process.env.OPENWORK_DATA_DIR = join(root, "openwork-data");
  process.env.OPENWORK_ENV_STORE = join(root, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(root, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(root, "memory");
  const server = await startServer(config(await freePort(), root, readOnly)) as Served;
  stops.push(() => server.stop(true));
  return `http://127.0.0.1:${server.port}`;
}

async function jsonFetch(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  return { response, payload: await response.json().catch(() => null) };
}

async function hostFetch(base: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-Matterhorn-Host-Token": HOST_TOKEN,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  return { response, payload: await response.json().catch(() => null) };
}

async function tokenFetch(base: string, path: string, token: string, init: RequestInit = {}) {
  return jsonFetch(base, path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
}

afterEach(async () => {
  for (const stop of stops.splice(0)) await stop();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (priorEnv.envStore === undefined) delete process.env.OPENWORK_ENV_STORE;
  else process.env.OPENWORK_ENV_STORE = priorEnv.envStore;
  if (priorEnv.dataDir === undefined) delete process.env.OPENWORK_DATA_DIR;
  else process.env.OPENWORK_DATA_DIR = priorEnv.dataDir;
  if (priorEnv.tokenStore === undefined) delete process.env.OPENWORK_TOKEN_STORE;
  else process.env.OPENWORK_TOKEN_STORE = priorEnv.tokenStore;
  if (priorEnv.memoryRoot === undefined) delete process.env.MATTERHORN_WORK_MEMORY_ROOT;
  else process.env.MATTERHORN_WORK_MEMORY_ROOT = priorEnv.memoryRoot;
});

describe("workspace mission routes", () => {
  test("stores a mission and derives attention from workflow state and evidence", async () => {
    const base = await boot();
    const empty = await jsonFetch(base, "/workspace/ws_mission/mission");
    expect(empty.response.status).toBe(200);
    expect(empty.payload.mission).toBeNull();

    const saved = await jsonFetch(base, "/workspace/ws_mission/mission", {
      method: "PATCH",
      body: JSON.stringify({
        objective: "Compare validator evidence and prepare a wallet-reviewed staking decision.",
        deskIds: ["bittensor"],
        networks: ["Bittensor mainnet"],
      }),
    });
    expect(saved.response.status).toBe(200);
    expect(saved.payload.mission.status).toBe("active");
    expect(saved.payload.mission.deskIds).toEqual(["bittensor"]);

    const staged = await jsonFetch(base, "/api/workflows/runs/stage", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws_mission",
        sessionId: "sess_attention",
        deskId: "bittensor",
        visibleUserIntent: "Compare subnet validators",
      }),
    });
    expect(staged.response.status).toBe(201);
    const runId = staged.payload.run.workflowRunId as string;
    await jsonFetch(base, `/api/workflows/runs/${runId}/start`, { method: "POST" });
    await jsonFetch(base, `/api/workflows/runs/${runId}/waiting`, {
      method: "POST",
      body: JSON.stringify({ reason: "Choose a subnet" }),
    });

    const overview = await jsonFetch(base, "/workspace/ws_mission/mission/overview");
    expect(overview.response.status).toBe(200);
    expect(overview.payload.mission.objective).toContain("validator evidence");
    expect(overview.payload.attention[0]).toMatchObject({
      kind: "needs_input",
      sessionId: "sess_attention",
      workflowRunId: runId,
    });
    expect(overview.payload.runs.summary.byStatus.waiting).toBe(1);
    expect(overview.payload.evidence.summary.total).toBeGreaterThan(0);

    const dataMap = await jsonFetch(base, "/workspace/ws_mission/backend/data-map");
    expect(dataMap.payload.stores.mission).toMatchObject({
      scope: "workspace",
      format: "json",
      containsUserContent: true,
      containsSecrets: "never",
      exportable: true,
      deletable: true,
    });
    const dataControls = await jsonFetch(base, "/workspace/ws_mission/backend/data-controls");
    expect(dataControls.payload.stores.mission.export.actions).toContainEqual(expect.objectContaining({
      id: "mission.read",
      method: "GET",
      href: "/workspace/ws_mission/mission",
    }));
    expect(dataControls.payload.stores.mission.deletion.actions).toContainEqual(expect.objectContaining({
      id: "mission.delete",
      method: "DELETE",
      destructive: true,
    }));

    const removed = await jsonFetch(base, "/workspace/ws_mission/mission", { method: "DELETE" });
    expect(removed.response.status).toBe(200);
    expect(removed.payload.mission).toBeNull();
    expect((await jsonFetch(base, "/workspace/ws_mission/mission")).payload.mission).toBeNull();
  });

  test("rejects secret-shaped mission content and blocks writes in read-only mode", async () => {
    const base = await boot();
    const rejected = await jsonFetch(base, "/workspace/ws_mission/mission", {
      method: "PATCH",
      body: JSON.stringify({ objective: `Use private key 0x${"b".repeat(64)}` }),
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.payload.code).toBe("invalid_workspace_mission");

    const readOnlyBase = await boot(true);
    const blocked = await jsonFetch(readOnlyBase, "/workspace/ws_mission/mission", {
      method: "PATCH",
      body: JSON.stringify({ objective: "A valid read-only mission" }),
    });
    expect(blocked.response.status).toBe(403);
  });

  test("keeps viewer tokens read-only across missions and workflow runs", async () => {
    const base = await boot();
    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Mission reviewer" }),
    });
    expect(viewer.response.status).toBe(201);

    const missionRead = await tokenFetch(base, "/workspace/ws_mission/mission", viewer.payload.token);
    expect(missionRead.response.status).toBe(200);
    expect(missionRead.payload.writable).toBe(false);

    const missionWrite = await tokenFetch(base, "/workspace/ws_mission/mission", viewer.payload.token, {
      method: "PATCH",
      body: JSON.stringify({ objective: "Viewer should not be able to save this" }),
    });
    expect(missionWrite.response.status).toBe(403);

    const missionDelete = await tokenFetch(base, "/workspace/ws_mission/mission", viewer.payload.token, {
      method: "DELETE",
    });
    expect(missionDelete.response.status).toBe(403);

    const stage = await tokenFetch(base, "/api/workflows/runs/stage", viewer.payload.token, {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws_mission",
        sessionId: "sess_viewer",
        deskId: "bittensor",
        visibleUserIntent: "Viewer should not start this run",
      }),
    });
    expect(stage.response.status).toBe(403);
  });
});
