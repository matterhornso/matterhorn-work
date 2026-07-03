import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

const TOKEN = "owt_notes_routes_token";
const HOST_TOKEN = "owt_notes_routes_host_token";
const priorEnv = {
  envStore: process.env.OPENWORK_ENV_STORE,
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
      id: "ws_notes",
      name: "Notes test workspace",
      path: root,
      preset: "starter",
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
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-notes-routes-"));
  dirs.push(dir);
  process.env.OPENWORK_ENV_STORE = join(dir, "env.json");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(dir, "memory");
  const server = await startServer(baseConfig(await getFreePort(), dir)) as Served;
  stops.push(() => server.stop(true));
  return { base: `http://127.0.0.1:${server.port}`, dir };
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
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

afterEach(async () => {
  while (stops.length) {
    await stops.pop()?.();
  }
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
  if (priorEnv.envStore === undefined) delete process.env.OPENWORK_ENV_STORE;
  else process.env.OPENWORK_ENV_STORE = priorEnv.envStore;
  if (priorEnv.tokenStore === undefined) delete process.env.OPENWORK_TOKEN_STORE;
  else process.env.OPENWORK_TOKEN_STORE = priorEnv.tokenStore;
  if (priorEnv.memoryRoot === undefined) delete process.env.MATTERHORN_WORK_MEMORY_ROOT;
  else process.env.MATTERHORN_WORK_MEMORY_ROOT = priorEnv.memoryRoot;
});

describe("Matterhorn notes API routes", () => {
  test("saves project notes, writes daily markdown, and creates Memory suggestions only for review", async () => {
    const { base, dir } = await boot();

    const created = await jsonFetch(base, "/workspace/ws_notes/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Longevity program idea",
        body: "Package a 4-week mobility and nutrition education program for founders.",
        tags: ["Longevity", "Client Plan"],
        desk: "longevity",
        sessionId: "sess_longevity_1",
        taskId: "task_longevity_1",
        outputPath: "outputs/longevity/sess_longevity_1/program.md",
        source: "quick_jot",
      }),
    });
    expect(created.response.status).toBe(201);
    expect(created.payload.success).toBe(true);
    const note = created.payload.note as Record<string, unknown>;
    expect(note.title).toBe("Longevity program idea");
    expect(note.filePath).toMatch(/^notes\/\d{4}-\d{2}-\d{2}\.md$/);
    expect(note.tags).toContain("longevity");
    expect(note.tags).toContain("client-plan");
    expect(note.links).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "desk", id: "longevity" }),
      expect.objectContaining({ kind: "session", id: "sess_longevity_1" }),
      expect.objectContaining({ kind: "task", id: "task_longevity_1" }),
      expect.objectContaining({ kind: "output", path: "outputs/longevity/sess_longevity_1/program.md" }),
    ]));

    const markdownPath = join(dir, note.filePath as string);
    const markdown = await readFile(markdownPath, "utf8");
    expect(markdown).toContain("# Matterhorn Notes");
    expect(markdown).toContain("Nothing here becomes Matterhorn Memory unless you explicitly send a note to Memory review.");
    expect(markdown).toContain("Longevity program idea");
    expect(markdown).toContain("outputs/longevity/sess_longevity_1/program.md");

    const listed = await jsonFetch(base, "/workspace/ws_notes/notes?desk=longevity&tags=longevity&limit=5");
    expect(listed.response.status).toBe(200);
    expect(listed.payload.count).toBe(1);

    const updated = await jsonFetch(base, `/workspace/ws_notes/notes/${note.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        body: "Updated: package a 4-week offline longevity plan with weekly check-ins.",
        tags: ["longevity", "offline"],
      }),
    });
    expect(updated.response.status).toBe(200);
    expect(updated.payload.note.body).toContain("offline longevity");

    const suggested = await jsonFetch(base, `/workspace/ws_notes/notes/${note.id}/memory-suggestion`, {
      method: "POST",
      body: JSON.stringify({
        kind: "user_preference",
        reason: "User wants this note available for later Longevity planning.",
      }),
    });
    expect(suggested.response.status).toBe(200);
    expect(suggested.payload.suggestionStatus).toBe("pending");
    expect(suggested.payload.note.memorySuggestionId).toBe(suggested.payload.suggestionId);

    const memorySearch = await jsonFetch(base, "/api/memory/search?tags=user-note&limit=5");
    expect(memorySearch.response.status).toBe(200);
    expect(memorySearch.payload.count).toBe(0);

    const memorySuggestions = await jsonFetch(base, "/api/memory/suggestions?desk=wellness&limit=5");
    expect(memorySuggestions.response.status).toBe(200);
    expect(memorySuggestions.payload.count).toBe(1);
    expect(memorySuggestions.payload.entries[0].suggestion.source).toBe("user_note");
    expect(memorySuggestions.payload.entries[0].suggestion.canAutoCapture).toBe(false);
    expect(memorySuggestions.payload.entries[0].suggestion.requiresExplicitConsent).toBe(true);

    const deleted = await jsonFetch(base, `/workspace/ws_notes/notes/${note.id}`, { method: "DELETE" });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.deleted).toBe(true);
    expect(existsSync(markdownPath)).toBe(false);
  });

  test("blocks secret-shaped notes from becoming Memory suggestions", async () => {
    const { base } = await boot();

    const created = await jsonFetch(base, "/workspace/ws_notes/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Do not remember",
        body: "private key 0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        tags: ["security"],
      }),
    });
    expect(created.response.status).toBe(201);
    const note = created.payload.note as Record<string, unknown>;

    const suggested = await jsonFetch(base, `/workspace/ws_notes/notes/${note.id}/memory-suggestion`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(suggested.response.status).toBe(200);
    expect(suggested.payload.suggestionStatus).toBe("blocked");

    const memorySearch = await jsonFetch(base, "/api/memory/search?tags=user-note&limit=5");
    expect(memorySearch.response.status).toBe(200);
    expect(memorySearch.payload.count).toBe(0);
  });
});
