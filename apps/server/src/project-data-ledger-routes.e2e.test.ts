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

const TOKEN = "owt_project_data_ledger_routes_token";
const HOST_TOKEN = "owt_project_data_ledger_routes_host_token";
const SECRET_HEX = "f".repeat(64);
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
  openworkDataDir: process.env.OPENWORK_DATA_DIR,
  tokenStore: process.env.OPENWORK_TOKEN_STORE,
  memoryRoot: process.env.MATTERHORN_WORK_MEMORY_ROOT,
  opencodeDb: process.env.OPENCODE_DB,
};
const stops: Array<() => void | Promise<void>> = [];
const dirs: string[] = [];

function restoreEnv(key: keyof typeof priorEnv, envName: string) {
  const value = priorEnv[key];
  if (value === undefined) delete process.env[envName];
  else process.env[envName] = value;
}

function baseConfig(port: number, root: string, readOnly = false): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [{
      id: "ws_ledger",
      name: "Project data ledger test workspace",
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

async function boot(options: { readOnly?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-project-data-ledger-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
  process.env.OPENCODE_DB = join(dir, "opencode.db");
  const server = await startServer(baseConfig(await getFreePort(), dir, options.readOnly ?? false)) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
}

async function jsonFetch(
  base: string,
  path: string,
  init: RequestInit = {},
  token = TOKEN,
): Promise<{ response: Response; payload: any }> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
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
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  restoreEnv("envStore", "OPENWORK_ENV_STORE");
  restoreEnv("openworkDataDir", "OPENWORK_DATA_DIR");
  restoreEnv("tokenStore", "OPENWORK_TOKEN_STORE");
  restoreEnv("memoryRoot", "MATTERHORN_WORK_MEMORY_ROOT");
  restoreEnv("opencodeDb", "OPENCODE_DB");
});

describe("project data ledger routes", () => {
  test("GET /workspace/:id/data-ledger unifies project evidence, audit, and feedback with redaction", async () => {
    const { base, dir } = await boot();

    const createdNote = await jsonFetch(base, "/workspace/ws_ledger/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Ledger note",
        body: "Capture the output receipt in the project evidence trail.",
        desk: "bittensor",
        sessionId: "sess_ledger",
        outputPath: "outputs/bittensor/sess_ledger/receipt.md",
        source: "manual",
      }),
    });
    expect(createdNote.response.status).toBe(201);

    const feedback = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({
        kind: "comment",
        target: {
          sourceType: "task",
          sourceId: "task_ledger",
          href: "/workspace/ws_ledger/session",
        },
        comment: `Helpful response, but never log Bearer supersecret123 or private key ${SECRET_HEX}.`,
      }),
    });
    expect(feedback.response.status).toBe(201);
    expect(feedback.payload.feedback.trainingUse).toBe("eval_routing_product_quality_only");
    expect(feedback.payload.feedback.redactionApplied).toBe(true);

    const ledger = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?limit=50");
    expect(ledger.response.status).toBe(200);
    expect(ledger.payload.success).toBe(true);
    expect(ledger.payload.version).toBe("matterhorn.project-data-ledger.v1");
    expect(ledger.payload.policy.trainingUse).toBe("none_by_default");
    expect(ledger.payload.policy.feedbackUse).toBe("eval_routing_product_quality_only");
    expect(ledger.payload.summary.notes).toBeGreaterThanOrEqual(1);
    expect(ledger.payload.summary.audits).toBeGreaterThanOrEqual(1);
    expect(ledger.payload.summary.feedback).toBe(1);
    expect(ledger.payload.summary.redacted).toBeGreaterThanOrEqual(1);

    const kinds = ledger.payload.items.map((item: { kind: string }) => item.kind);
    expect(kinds).toContain("note");
    expect(kinds).toContain("audit");
    expect(kinds).toContain("feedback");
    const feedbackEntry = ledger.payload.items.find((item: { kind: string }) => item.kind === "feedback");
    expect(feedbackEntry).toBeTruthy();
    expect(feedbackEntry.metadata.feedbackKind).toBe("comment");
    expect(feedbackEntry.metadata.targetSourceType).toBe("task");
    expect(feedbackEntry.metadata.targetSourceId).toBe("task_ledger");

    const serialized = JSON.stringify(ledger.payload);
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain("supersecret123");
    expect(serialized).not.toContain(SECRET_HEX);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(HOST_TOKEN);

    const dataMap = await jsonFetch(base, "/workspace/ws_ledger/backend/data-map");
    expect(dataMap.response.status).toBe(200);
    expect(dataMap.payload.stores.feedback.status).toBe("working");
    expect(dataMap.payload.stores.feedback.path).toBe(join(dir, "openwork-data", "feedback", "ws_ledger.jsonl"));
    expect(dataMap.payload.stores.feedback.containsSecrets).toBe("redacted");
  });

  test("data-ledger source and kind filters are explicit", async () => {
    const { base } = await boot();

    await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "thumbs_up" }),
    });

    const bySource = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?source=feedback");
    expect(bySource.response.status).toBe(200);
    expect(bySource.payload.items.length).toBe(1);
    expect(bySource.payload.items.every((item: { source: string }) => item.source === "feedback")).toBe(true);

    const byKind = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?kind=feedback");
    expect(byKind.response.status).toBe(200);
    expect(byKind.payload.items.length).toBe(1);
    expect(byKind.payload.items.every((item: { kind: string }) => item.kind === "feedback")).toBe(true);
  });

  test("data-ledger rejects unknown filters", async () => {
    const { base } = await boot();

    const source = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?source=private_keys");
    expect(source.response.status).toBe(400);
    expect(source.payload.code).toBe("invalid_project_data_ledger_source");

    const kind = await jsonFetch(base, "/workspace/ws_ledger/data-ledger?kind=seed_phrase");
    expect(kind.response.status).toBe(400);
    expect(kind.payload.code).toBe("invalid_project_data_ledger_kind");
  });

  test("feedback writes require collaborator scope", async () => {
    const { base } = await boot();
    const viewer = await hostFetch(base, "/tokens", {
      method: "POST",
      body: JSON.stringify({ scope: "viewer", label: "Read-only feedback tester" }),
    });
    expect(viewer.response.status).toBe(201);

    const denied = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "thumbs_up" }),
    }, viewer.payload.token);
    expect(denied.response.status).toBe(403);
    expect(denied.payload.code).toBe("forbidden");
  });

  test("feedback writes are blocked when server is read-only", async () => {
    const { base } = await boot({ readOnly: true });

    const denied = await jsonFetch(base, "/workspace/ws_ledger/feedback", {
      method: "POST",
      body: JSON.stringify({ kind: "thumbs_up" }),
    });
    expect(denied.response.status).toBe(403);
    expect(denied.payload.code).toBe("read_only");
  });
});
