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

const TOKEN = "owt_workflow_run_routes_token";
const HOST_TOKEN = "owt_workflow_run_routes_host_token";
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  openworkDataDir: process.env.OPENWORK_DATA_DIR,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function baseConfig(port: number, root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [{
      id: "ws_longevity",
      name: "Longevity test workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
    }],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
  } as ServerConfig;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-workflow-run-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
  const server = await startServer(baseConfig(await getFreePort(), dir)) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
}

async function jsonFetch(base: string, path: string, init?: RequestInit): Promise<{ response: Response; payload: unknown }> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

describe("workflow run routes", () => {
  afterEach(async () => {
    for (const stop of stops) {
      await stop();
    }
    stops.length = 0;
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    dirs.length = 0;
    process.env.OPENWORK_ENV_STORE = priorEnv.envStore;
    process.env.OPENWORK_DATA_DIR = priorEnv.openworkDataDir;
    process.env.OPENWORK_TOKEN_STORE = priorEnv.tokenStore;
    process.env.MATTERHORN_WORK_MEMORY_ROOT = priorEnv.memoryRoot;
  });

  test("POST /api/workflows/runs/stage creates a Longevity run", async () => {
    const { base } = await boot();
    const { response, payload } = await jsonFetch(base, "/api/workflows/runs/stage", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws_longevity",
        sessionId: "sess_longevity_1",
        deskId: "wellness",
        visibleUserIntent: "Build a Longevity program for my clients",
      }),
    });

    expect(response.status).toBe(201);
    const run = (payload as Record<string, unknown>)?.run as Record<string, unknown>;
    expect(run?.deskId).toBe("wellness");
    expect(run?.agentId).toBe("matterhorn-longevity");
    expect(run?.workflowId).toBe("wellness_creator_services");
    expect(run?.status).toBe("staged");
    expect(run?.outputBasePath).toBe("outputs/longevity/sess_longevity_1/");
    expect(run?.workflowManifestRef).toBe("matterhorn.workflow.manifest.v1/wellness_creator_services");
    expect(typeof run?.hiddenAgentInstructions).toBe("string");
  });

  test("POST /api/workflows/runs/stage creates a dedicated Hyperliquid run", async () => {
    const { base } = await boot();
    const { response, payload } = await jsonFetch(base, "/api/workflows/runs/stage", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws_longevity",
        sessionId: "sess_hl_1",
        deskId: "hyperliquid",
        visibleUserIntent: "Show BTC orderbook context",
      }),
    });

    expect(response.status).toBe(201);
    const run = (payload as Record<string, unknown>)?.run as Record<string, unknown>;
    expect(run?.deskId).toBe("hyperliquid");
    expect(run?.agentId).toBe("matterhorn-hyperliquid");
    expect(run?.workflowId).toBe("hyperliquid_preview");
    expect(run?.stageId).toBe("stage_1_market_read");
    expect(run?.outputBasePath).toBe("outputs/hyperliquid/sess_hl_1/");
  });

  test("POST /api/workflows/runs/:id/start transitions to running", async () => {
    const { base } = await boot();
    const { payload: stagedPayload } = await jsonFetch(base, "/api/workflows/runs/stage", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws_longevity",
        sessionId: "sess_longevity_2",
        deskId: "wellness",
        visibleUserIntent: "Build a Longevity program",
      }),
    });
    const runId = ((stagedPayload as Record<string, unknown>)?.run as Record<string, unknown>)?.workflowRunId as string;

    const { response, payload } = await jsonFetch(base, `/api/workflows/runs/${runId}/start`, {
      method: "POST",
    });

    expect(response.status).toBe(200);
    const run = (payload as Record<string, unknown>)?.run as Record<string, unknown>;
    expect(run?.status).toBe("running");

    const { payload: eventsPayload } = await jsonFetch(base, `/api/workflows/runs/${runId}/events`);
    const events = ((eventsPayload as Record<string, unknown>)?.events ?? []) as Array<{ type: string }>;
    expect(events.map((event) => event.type)).toContain("workflow.started");
  });

  test("GET /api/workflows/runs lists runs with filters", async () => {
    const { base } = await boot();
    await jsonFetch(base, "/api/workflows/runs/stage", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws_longevity",
        sessionId: "sess_longevity_3",
        deskId: "wellness",
        visibleUserIntent: "A",
      }),
    });

    const { response, payload } = await jsonFetch(base, "/api/workflows/runs?deskId=wellness&limit=10");
    expect(response.status).toBe(200);
    const items = ((payload as Record<string, unknown>)?.items ?? []) as unknown[];
    expect(items.length).toBeGreaterThan(0);
  });

  test("workflow event mutation routes append durable events", async () => {
    const { base } = await boot();
    const { payload: stagedPayload } = await jsonFetch(base, "/api/workflows/runs/stage", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "ws_longevity",
        sessionId: "sess_longevity_4",
        deskId: "longevity",
        visibleUserIntent: "Start a Longevity program",
      }),
    });
    const runId = ((stagedPayload as Record<string, unknown>)?.run as Record<string, unknown>)?.workflowRunId as string;

    await jsonFetch(base, `/api/workflows/runs/${runId}/start`, { method: "POST" });
    await jsonFetch(base, `/api/workflows/runs/${runId}/stage`, {
      method: "POST",
      body: JSON.stringify({ stageId: "stage_2_goals_constraints" }),
    });
    await jsonFetch(base, `/api/workflows/runs/${runId}/artifact`, {
      method: "POST",
      body: JSON.stringify({ path: "outputs/longevity/sess_longevity_4/goals.md" }),
    });
    await jsonFetch(base, `/api/workflows/runs/${runId}/complete`, { method: "POST" });

    const { payload: eventsPayload } = await jsonFetch(base, `/api/workflows/runs/${runId}/events`);
    const events = ((eventsPayload as Record<string, unknown>)?.events ?? []) as Array<{ type: string }>;
    expect(events.map((event) => event.type)).toContain("workflow.stage_started");
    expect(events.map((event) => event.type)).toContain("workflow.artifact_saved");
    expect(events.at(-1)?.type).toBe("workflow.completed");

    const { payload: taskRunsPayload } = await jsonFetch(base, "/workspace/ws_longevity/task-runs?limit=10");
    const taskRuns = ((taskRunsPayload as Record<string, unknown>)?.runs ?? []) as Array<{
      taskId: string;
      desk: string;
      status: string;
      artifactPaths: string[];
    }>;
    const taskRun = taskRuns.find((item) => item.taskId === runId);
    expect(taskRun?.desk).toBe("wellness");
    expect(taskRun?.status).toBe("completed");
    expect(taskRun?.artifactPaths).toContain("outputs/longevity/sess_longevity_4/goals.md");
  });

});
