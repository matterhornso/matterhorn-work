import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, rm, symlink } from "node:fs/promises";
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
  while (stops.length) {
    await stops.pop()?.();
  }
  while (roots.length) {
    await rm(roots.pop()!, { recursive: true, force: true });
  }
});

async function createWorkspaceRoot(folderName?: string) {
  const root = await mkdtemp(join(tmpdir(), "openwork-session-read-"));
  const workspaceRoot = folderName ? join(root, folderName) : root;
  await mkdir(join(workspaceRoot, ".opencode"), { recursive: true });
  roots.push(root);
  return realpath(workspaceRoot);
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function startMockOpencode(input?: { invalidList?: boolean; holdCommand?: Promise<void> }) {
  const requests: Array<{ pathname: string; search: string; directory: string | null; method: string; body: unknown }> = [];
  const streamAborts = { count: 0 };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const body = request.method === "GET" || request.method === "HEAD"
        ? null
        : await request.json().catch(() => null);
      requests.push({
        pathname: url.pathname,
        search: url.search,
        directory: request.headers.get("x-opencode-directory"),
        method: request.method,
        body,
      });

      if (url.pathname === "/provider") {
        return Response.json({
          all: [
            {
              id: "openai",
              name: "OpenAI",
              source: "api",
              models: {
                "gpt-4.1": { name: "GPT 4.1" },
                "gpt-4.1-mini": { name: "GPT 4.1 Mini" },
              },
            },
            {
              id: "anthropic",
              name: "Anthropic",
              source: "api",
              models: {
                "claude-3-sonnet": { name: "Claude 3 Sonnet" },
              },
            },
          ],
          default: { openai: "gpt-4.1-mini", anthropic: "claude-3-sonnet" },
          connected: ["openai"],
        });
      }

      if (url.pathname === "/session" && request.method === "POST") {
        return Response.json({
          id: "ses_created",
          title: typeof body === "object" && body && "title" in body ? String(body.title) : "Created",
          slug: "created",
          directory: request.headers.get("x-opencode-directory"),
          time: { created: 300, updated: 300 },
        });
      }

      if (url.pathname === "/session") {
        if (input?.invalidList) {
          return Response.json({ nope: true });
        }
        return Response.json([
          {
            id: "ses_1",
            title: "Hostname Check",
            slug: "hostname-check",
            directory: request.headers.get("x-opencode-directory"),
            time: { created: 100, updated: 200 },
          },
        ]);
      }

      if (url.pathname === "/session/status") {
        return Response.json({ ses_1: { type: "busy" } });
      }

      if (url.pathname === "/event") {
        let interval: ReturnType<typeof setInterval> | null = null;
        const close = () => {
          if (interval) clearInterval(interval);
          interval = null;
          streamAborts.count += 1;
        };
        request.signal.addEventListener("abort", close, { once: true });
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: connected\n\n"));
            interval = setInterval(() => {
              controller.enqueue(new TextEncoder().encode("data: heartbeat\n\n"));
            }, 25);
          },
          cancel() {
            close();
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      }

      if (url.pathname === "/session/ses_1") {
        return Response.json({
          id: "ses_1",
          title: "Hostname Check",
          slug: "hostname-check",
          directory: request.headers.get("x-opencode-directory"),
          time: { created: 100, updated: 200 },
        });
      }

      if (url.pathname === "/session/ses_1/message") {
        return Response.json([
          {
            info: {
              id: "msg_1",
              sessionID: "ses_1",
              role: "assistant",
              time: { created: 200, completed: 250 },
            },
            parts: [
              {
                id: "prt_1",
                messageID: "msg_1",
                sessionID: "ses_1",
                type: "text",
                text: "hostname: mock-host",
              },
              {
                id: "prt_2",
                messageID: "msg_1",
                sessionID: "ses_1",
                type: "tool",
                toolCallID: "tool_1",
                toolName: "workspace.read",
                status: "completed",
                result: { ok: true, bytes: 12 },
              },
            ],
          },
        ]);
      }

      if (url.pathname === "/session/ses_1/todo") {
        return Response.json([
          {
            content: "Validate session reads",
            status: "completed",
            priority: "high",
          },
        ]);
      }

      if (url.pathname === "/session/ses_1/command" && request.method === "POST") {
        await input?.holdCommand;
        return Response.json({ ok: true });
      }

      if (url.pathname === "/session/ses_1/prompt_async" && request.method === "POST") {
        return Response.json({ ok: true });
      }

      return Response.json({ code: "not_found", message: "Not found" }, { status: 404 });
    },
  }) as Served;
  stops.push(() => server.stop(true));
  return { server, requests, streamAborts };
}

async function startOpenworkServer(input: { workspaceRoot: string; opencodeBaseUrl?: string; readOnly?: boolean }) {
  const config: ServerConfig = {
    host: "127.0.0.1",
    port: 0,
    token: "owt_test_token",
    hostToken: "owt_host_token",
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["*"],
    workspaces: [
      {
        id: "ws_1",
        name: "Workspace",
        path: input.workspaceRoot,
        preset: "starter",
        workspaceType: "local",
        ...(input.opencodeBaseUrl ? { baseUrl: input.opencodeBaseUrl } : {}),
      },
    ],
    authorizedRoots: [input.workspaceRoot],
    readOnly: input.readOnly ?? true,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
    reloadWatchers: false,
  };
  const server = await startServer(config) as Served;
  stops.push(() => server.stop(true));
  return { server, token: config.token };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function parseSseEvents(text: string) {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const id = lines.find((line) => line.startsWith("id: "))?.slice("id: ".length);
      const event = lines.find((line) => line.startsWith("event: "))?.slice("event: ".length);
      const dataLine = lines.find((line) => line.startsWith("data: "));
      return {
        id,
        event,
        data: dataLine ? JSON.parse(dataLine.slice("data: ".length)) : null,
      };
    });
}

async function waitUntil(predicate: () => boolean) {
  for (let index = 0; index < 20; index++) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

describe("workspace session read APIs", () => {
  test("lists sessions and returns session details, messages, and snapshot", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const base = `http://127.0.0.1:${openwork.server.port}`;

    const listResponse = await fetch(`${base}/workspace/ws_1/sessions?roots=true&limit=1&search=host&start=10`, {
      headers: auth(openwork.token),
    });
    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody).toEqual({
      items: [
        {
          id: "ses_1",
          title: "Hostname Check",
          slug: "hostname-check",
          directory: workspaceRoot,
          time: { created: 100, updated: 200 },
        },
      ],
    });

    const detailResponse = await fetch(`${base}/workspace/ws_1/sessions/ses_1`, {
      headers: auth(openwork.token),
    });
    expect(detailResponse.status).toBe(200);
    const detailBody = await detailResponse.json();
    expect(detailBody.item.id).toBe("ses_1");
    expect(detailBody.item.directory).toBe(workspaceRoot);

    const messagesResponse = await fetch(`${base}/workspace/ws_1/sessions/ses_1/messages?limit=5`, {
      headers: auth(openwork.token),
    });
    expect(messagesResponse.status).toBe(200);
    const messagesBody = await messagesResponse.json();
    expect(messagesBody.items).toHaveLength(1);
    expect(messagesBody.items[0]?.info.id).toBe("msg_1");
    expect(messagesBody.items[0]?.parts[0]?.text).toBe("hostname: mock-host");

    const statusResponse = await fetch(`${base}/workspace/ws_1/sessions/ses_1/status`, {
      headers: auth(openwork.token),
    });
    expect(statusResponse.status).toBe(200);
    const statusBody = await statusResponse.json();
    expect(statusBody.item.session.id).toBe("ses_1");
    expect(statusBody.item.status).toEqual({ type: "busy" });
    expect(statusBody.item.busy).toBe(true);
    expect(typeof statusBody.item.observedAt).toBe("number");

    const snapshotResponse = await fetch(`${base}/workspace/ws_1/sessions/ses_1/snapshot?limit=5`, {
      headers: auth(openwork.token),
    });
    expect(snapshotResponse.status).toBe(200);
    const snapshotBody = await snapshotResponse.json();
    expect(snapshotBody.item.session.id).toBe("ses_1");
    expect(snapshotBody.item.messages).toHaveLength(1);
    expect(snapshotBody.item.todos).toEqual([
      {
        content: "Validate session reads",
        status: "completed",
        priority: "high",
      },
    ]);
    expect(snapshotBody.item.status).toEqual({ type: "busy" });

    const listRequest = mock.requests.find((request) => request.pathname === "/session");
    expect(listRequest?.directory).toBe(workspaceRoot);
    expect(listRequest?.search).toContain("roots=true");
    expect(listRequest?.search).toContain("limit=1");
    expect(listRequest?.search).toContain("search=host");
    expect(listRequest?.search).toContain("start=10");

  });

  test("uses the canonical workspace directory when OpenCode filters sessions", async () => {
    const root = await mkdtemp(join(tmpdir(), "openwork-session-canonical-"));
    roots.push(root);
    const actualWorkspaceRoot = join(root, "actual");
    const aliasedWorkspaceRoot = join(root, "alias");
    await mkdir(join(actualWorkspaceRoot, ".opencode"), { recursive: true });
    await symlink(actualWorkspaceRoot, aliasedWorkspaceRoot, process.platform === "win32" ? "junction" : "dir");
    const canonicalWorkspaceRoot = await realpath(aliasedWorkspaceRoot);
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot: aliasedWorkspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/workspace/ws_1/sessions`, {
      headers: auth(openwork.token),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]?.directory).toBe(canonicalWorkspaceRoot);
    const listRequest = mock.requests.find((request) => request.pathname === "/session");
    expect(listRequest?.directory).toBe(canonicalWorkspaceRoot);
  });

  test("streams bounded session events with snapshot and status frames", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(
      `http://127.0.0.1:${openwork.server.port}/workspace/ws_1/sessions/ses_1/events?snapshot=true&maxEvents=2`,
      { headers: { ...auth(openwork.token), Accept: "text/event-stream" } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const events = parseSseEvents(await response.text());
    expect(events.map((event) => event.event)).toEqual(["session.snapshot", "session.status"]);
    expect(events[0]?.data).toMatchObject({
      type: "session.snapshot",
      workspaceId: "ws_1",
      sessionId: "ses_1",
      source: "matterhorn-work-server",
      payload: {
        session: { id: "ses_1" },
        status: { type: "busy" },
      },
    });
    expect(events[1]?.data).toMatchObject({
      type: "session.status",
      workspaceId: "ws_1",
      sessionId: "ses_1",
      payload: {
        session: { id: "ses_1" },
        status: { type: "busy" },
        busy: true,
      },
    });
  });

  test("streams a recoverable cursor-expired event when replay is unavailable", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(
      `http://127.0.0.1:${openwork.server.port}/workspace/ws_1/sessions/ses_1/events?since=41&maxEvents=2`,
      { headers: auth(openwork.token) },
    );
    expect(response.status).toBe(200);

    const events = parseSseEvents(await response.text());
    expect(events.map((event) => event.event)).toEqual(["error", "session.status"]);
    expect(events[0]?.id).toBe("42");
    expect(events[0]?.data).toMatchObject({
      type: "error",
      cursor: "42",
      payload: {
        code: "cursor_expired",
        recoverable: true,
      },
    });
    expect(events[1]?.data).toMatchObject({
      type: "session.status",
      cursor: "43",
      payload: {
        status: { type: "busy" },
        busy: true,
      },
    });
  });

  test("streams optional message, tool, and todo detail events from the initial snapshot", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(
      `http://127.0.0.1:${openwork.server.port}/workspace/ws_1/sessions/ses_1/events?snapshot=true&details=true&maxEvents=8`,
      { headers: auth(openwork.token) },
    );
    expect(response.status).toBe(200);

    const events = parseSseEvents(await response.text());
    expect(events.map((event) => event.event)).toEqual([
      "session.snapshot",
      "message.created",
      "message.delta",
      "tool.started",
      "tool.completed",
      "message.completed",
      "todo.updated",
      "session.status",
    ]);
    expect(events[1]?.data).toMatchObject({
      type: "message.created",
      payload: {
        messageId: "msg_1",
        role: "assistant",
        createdAt: 200,
      },
    });
    expect(events[2]?.data).toMatchObject({
      type: "message.delta",
      payload: {
        messageId: "msg_1",
        partId: "prt_1",
        delta: "hostname: mock-host",
      },
    });
    expect(events[3]?.data).toMatchObject({
      type: "tool.started",
      payload: {
        messageId: "msg_1",
        partId: "prt_2",
        toolCallId: "tool_1",
        name: "workspace.read",
      },
    });
    expect(events[4]?.data).toMatchObject({
      type: "tool.completed",
      payload: {
        messageId: "msg_1",
        partId: "prt_2",
        toolCallId: "tool_1",
        name: "workspace.read",
        ok: true,
      },
    });
    expect(JSON.stringify(events[4]?.data)).not.toContain("bytes");
    expect(events[5]?.data).toMatchObject({
      type: "message.completed",
      payload: {
        messageId: "msg_1",
        completedAt: 250,
      },
    });
    expect(events[6]?.data).toMatchObject({
      type: "todo.updated",
      payload: {
        todos: [
          {
            content: "Validate session reads",
            status: "completed",
            priority: "high",
          },
        ],
      },
    });
  });

  test("accepts guest-side rem_ workspace aliases for session reads", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/workspace/rem_ws_1/sessions`, {
      headers: auth(openwork.token),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]?.id).toBe("ses_1");
    expect(body.items[0]?.directory).toBe(workspaceRoot);
    expect(mock.requests.find((request) => request.pathname === "/session")?.directory).toBe(workspaceRoot);
  });

  test("creates sessions and submits prompts through stable workspace routes", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
      readOnly: false,
    });

    const base = `http://127.0.0.1:${openwork.server.port}`;
    const createResponse = await fetch(`${base}/workspace/ws_1/sessions`, {
      method: "POST",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Agent session" }),
    });
    expect(createResponse.status).toBe(201);
    const createBody = await createResponse.json();
    expect(createBody.item.id).toBe("ses_created");
    expect(createBody.item.title).toBe("Agent session");

    const createRequest = mock.requests.find((request) => request.method === "POST" && request.pathname === "/session");
    expect(createRequest?.directory).toBe(workspaceRoot);
    expect(createRequest?.body).toMatchObject({ title: "Agent session" });

    const promptResponse = await fetch(`${base}/workspace/ws_1/sessions/ses_1/messages`, {
      method: "POST",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Summarize this workspace",
        model: { providerID: "openai", modelID: "gpt-4.1" },
        agent: "build",
        noReply: true,
      }),
    });
    expect(promptResponse.status).toBe(202);
    await expect(promptResponse.json()).resolves.toMatchObject({ ok: true, accepted: true, sessionId: "ses_1" });

    const promptRequest = mock.requests.find((request) => request.method === "POST" && request.pathname === "/session/ses_1/prompt_async");
    expect(promptRequest?.directory).toBe(workspaceRoot);
    expect(promptRequest?.body).toMatchObject({
      model: { providerID: "openai", modelID: "gpt-4.1" },
      agent: "build",
      noReply: true,
      parts: [{ type: "text", text: "Summarize this workspace" }],
    });

    const ledgerResponse = await fetch(`${base}/workspace/ws_1/data-ledger?kind=chat&limit=10`, {
      headers: auth(openwork.token),
    });
    expect(ledgerResponse.status).toBe(200);
    const ledgerBody = await ledgerResponse.json();
    const promptEntry = ledgerBody.items.find((item: { eventType?: string }) => item.eventType === "session.prompt");
    expect(promptEntry).toMatchObject({
      kind: "chat",
      sessionId: "ses_1",
      title: "Chat prompt submitted",
      metadata: {
        auditAction: "session.prompt",
        target: "ses_1",
        modelSource: "request",
        modelProviderId: "openai",
        modelId: "gpt-4.1",
        modelRef: "openai/gpt-4.1",
        agent: "build",
        noReply: true,
      },
    });
    expect(JSON.stringify(ledgerBody)).not.toContain("Summarize this workspace");
  });

  test("submits stable route prompts with the server default model when no selection exists", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
      readOnly: false,
    });

    const base = `http://127.0.0.1:${openwork.server.port}`;
    const promptResponse = await fetch(`${base}/workspace/ws_1/sessions/ses_1/messages`, {
      method: "POST",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Use the workspace default model" }),
    });

    expect(promptResponse.status).toBe(202);
    const promptRequest = mock.requests.find((request) => request.method === "POST" && request.pathname === "/session/ses_1/prompt_async");
    expect(promptRequest?.body).toMatchObject({
      model: { providerID: "openai", modelID: "gpt-4.1-mini" },
      parts: [{ type: "text", text: "Use the workspace default model" }],
    });

    const ledgerResponse = await fetch(`${base}/workspace/ws_1/data-ledger?kind=chat&limit=10`, {
      headers: auth(openwork.token),
    });
    expect(ledgerResponse.status).toBe(200);
    const ledgerBody = await ledgerResponse.json();
    const promptEntry = ledgerBody.items.find((item: { eventType?: string }) => item.eventType === "session.prompt");
    expect(promptEntry).toMatchObject({
      metadata: {
        modelSource: "server_default",
        modelProviderId: "openai",
        modelId: "gpt-4.1-mini",
        modelRef: "openai/gpt-4.1-mini",
      },
    });
    expect(JSON.stringify(ledgerBody)).not.toContain("Use the workspace default model");
  });

  test("submits stable route prompts with the saved workspace model when request omits model", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
      readOnly: false,
    });

    const base = `http://127.0.0.1:${openwork.server.port}`;
    const saved = await fetch(`${base}/workspace/ws_1/backend/model-selection`, {
      method: "PATCH",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "openai", modelId: "gpt-4.1" }),
    });
    expect(saved.status).toBe(200);

    const promptResponse = await fetch(`${base}/workspace/ws_1/sessions/ses_1/messages`, {
      method: "POST",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Use the saved workspace model", agent: "build" }),
    });

    expect(promptResponse.status).toBe(202);
    const promptRequest = mock.requests.find((request) => request.method === "POST" && request.pathname === "/session/ses_1/prompt_async");
    expect(promptRequest?.body).toMatchObject({
      model: { providerID: "openai", modelID: "gpt-4.1" },
      agent: "build",
      parts: [{ type: "text", text: "Use the saved workspace model" }],
    });

    const ledgerResponse = await fetch(`${base}/workspace/ws_1/data-ledger?kind=chat&limit=10`, {
      headers: auth(openwork.token),
    });
    expect(ledgerResponse.status).toBe(200);
    const ledgerBody = await ledgerResponse.json();
    const promptEntry = ledgerBody.items.find((item: { eventType?: string }) => item.eventType === "session.prompt");
    expect(promptEntry).toMatchObject({
      metadata: {
        modelSource: "server_workspace_preference",
        modelProviderId: "openai",
        modelId: "gpt-4.1",
        modelRef: "openai/gpt-4.1",
        agent: "build",
      },
    });
    expect(JSON.stringify(ledgerBody)).not.toContain("Use the saved workspace model");
  });

  test("request model overrides saved workspace model for stable route prompts", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
      readOnly: false,
    });

    const base = `http://127.0.0.1:${openwork.server.port}`;
    const saved = await fetch(`${base}/workspace/ws_1/backend/model-selection`, {
      method: "PATCH",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "openai", modelId: "gpt-4.1" }),
    });
    expect(saved.status).toBe(200);

    const promptResponse = await fetch(`${base}/workspace/ws_1/sessions/ses_1/messages`, {
      method: "POST",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Use the request model",
        model: { providerID: "anthropic", modelID: "claude-3-sonnet" },
      }),
    });

    expect(promptResponse.status).toBe(202);
    const promptRequest = mock.requests.find((request) => request.method === "POST" && request.pathname === "/session/ses_1/prompt_async");
    expect(promptRequest?.body).toMatchObject({
      model: { providerID: "anthropic", modelID: "claude-3-sonnet" },
      parts: [{ type: "text", text: "Use the request model" }],
    });

    const ledgerResponse = await fetch(`${base}/workspace/ws_1/data-ledger?kind=chat&limit=10`, {
      headers: auth(openwork.token),
    });
    expect(ledgerResponse.status).toBe(200);
    const ledgerBody = await ledgerResponse.json();
    const promptEntry = ledgerBody.items.find((item: { eventType?: string }) => item.eventType === "session.prompt");
    expect(promptEntry).toMatchObject({
      metadata: {
        modelSource: "request",
        modelProviderId: "anthropic",
        modelId: "claude-3-sonnet",
        modelRef: "anthropic/claude-3-sonnet",
      },
    });
    expect(JSON.stringify(ledgerBody)).not.toContain("Use the request model");
  });

  test("rejects empty session prompts before calling upstream", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
      readOnly: false,
    });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/workspace/ws_1/sessions/ses_1/messages`, {
      method: "POST",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "invalid_payload",
      message: "message or non-empty parts is required",
    });
    expect(mock.requests.some((request) => request.pathname === "/session/ses_1/prompt_async")).toBe(false);
  });

  test("encodes non-ASCII workspace directory headers for session reads", async () => {
    const workspaceRoot = await createWorkspaceRoot("项目");
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/workspace/ws_1/sessions`, {
      headers: auth(openwork.token),
    });

    expect(response.status).toBe(200);
    const listRequest = mock.requests.find((request) => request.pathname === "/session");
    const encodedDirectory = encodeURIComponent(workspaceRoot);
    expect(listRequest?.directory).toBe(encodedDirectory);
    expect(listRequest?.search).toContain(`directory=${encodedDirectory}`);
  });

  test("encodes non-ASCII workspace directory headers for opencode proxy requests", async () => {
    const workspaceRoot = await createWorkspaceRoot("项目");
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/workspace/ws_1/opencode/session`, {
      headers: auth(openwork.token),
    });

    expect(response.status).toBe(200);
    const proxyRequest = mock.requests.find((request) => request.pathname === "/session");
    expect(proxyRequest?.directory).toBe(encodeURIComponent(workspaceRoot));
  });

  test("cancels the upstream OpenCode stream when a proxied client disconnects", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });
    const controller = new AbortController();
    const response = await fetch(
      `http://127.0.0.1:${openwork.server.port}/workspace/ws_1/opencode/event`,
      { headers: auth(openwork.token), signal: controller.signal },
    );

    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect((await reader?.read())?.done).toBe(false);
    controller.abort();
    await reader?.cancel().catch(() => undefined);

    const upstreamClosed = await (async () => {
      for (let index = 0; index < 100; index += 1) {
        if (mock.streamAborts.count > 0) return true;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return mock.streamAborts.count > 0;
    })();
    expect(upstreamClosed).toBe(true);
  }, 15_000);

  test("returns 404 when the upstream session is missing", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/workspace/ws_1/sessions/ses_missing/snapshot`, {
      headers: auth(openwork.token),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "session_not_found",
      message: "Session not found",
    });

  });

  test("returns a clean error when OpenCode is not configured for session reads", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const openwork = await startOpenworkServer({ workspaceRoot });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/workspace/ws_1/sessions`, {
      headers: auth(openwork.token),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "opencode_unconfigured",
      message: "OpenCode base URL is missing for this workspace",
    });
  });

  test("acknowledges proxied session commands before upstream completion", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const command = deferred();
    const mock = startMockOpencode({ holdCommand: command.promise });
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await Promise.race([
      fetch(`http://127.0.0.1:${openwork.server.port}/workspace/ws_1/opencode/session/ses_1/command`, {
        method: "POST",
        headers: { ...auth(openwork.token), "Content-Type": "application/json" },
        body: JSON.stringify({ command: "review", arguments: "" }),
      }),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
    ]);

    expect(response).not.toBe("timeout");
    expect(response instanceof Response ? response.status : 0).toBe(200);
    await expect(response instanceof Response ? response.json() : null).resolves.toMatchObject({ accepted: true });
    const sawCommand = await waitUntil(() => mock.requests.some((request) => request.pathname === "/session/ses_1/command"));
    command.resolve();
    expect(sawCommand).toBe(true);
  });

  test("enforces deny-by-default tools for Discuss and Plan prompts", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });
    const base = `http://127.0.0.1:${openwork.server.port}/workspace/ws_1/opencode/session/ses_1/prompt_async`;

    const discuss = await fetch(base, {
      method: "POST",
      headers: {
        ...auth(openwork.token),
        "Content-Type": "application/json",
        "X-Matterhorn-Execution-Mode": "discuss",
      },
      body: JSON.stringify({
        agent: "custom-agent",
        executionMode: "discuss",
        parts: [{ type: "text", text: "Inspect this project" }],
        tools: { "*": true, bash: true, write: true },
        system: "Existing workspace context",
      }),
    });
    expect(discuss.status).toBe(200);

    const plan = await fetch(base, {
      method: "POST",
      headers: {
        ...auth(openwork.token),
        "Content-Type": "application/json",
        "X-Matterhorn-Execution-Mode": "plan",
      },
      body: JSON.stringify({
        agent: "matterhorn-sui",
        parts: [{ type: "text", text: "Plan a safe balance review" }],
        tools: { "*": true, matterhorn_work_matterhorn_sui_preview_transfer: true },
      }),
    });
    expect(plan.status).toBe(200);

    const promptRequests = mock.requests.filter((request) => request.pathname === "/session/ses_1/prompt_async");
    expect(promptRequests).toHaveLength(2);
    expect(promptRequests[0]?.body).toMatchObject({
      agent: "custom-agent",
      tools: { "*": false },
    });
    expect(promptRequests[0]?.body).not.toHaveProperty("executionMode");
    expect(String((promptRequests[0]?.body as { system?: unknown })?.system)).toContain("Mode: discuss");
    expect(String((promptRequests[0]?.body as { system?: unknown })?.system)).toContain("Existing workspace context");
    expect(promptRequests[1]?.body).toMatchObject({
      agent: "matterhorn-sui",
      tools: {
        "*": false,
        "matterhorn-work_matterhorn_sui_get_balance": true,
      },
    });
    expect(JSON.stringify(promptRequests[1]?.body)).not.toContain("preview_transfer");
    expect(String((promptRequests[1]?.body as { system?: unknown })?.system)).toContain("Mode: plan");
  });

  test("preserves Work-mode request tools without broadening them", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/workspace/ws_1/opencode/session/ses_1/prompt_async`, {
      method: "POST",
      headers: {
        ...auth(openwork.token),
        "Content-Type": "application/json",
        "X-Matterhorn-Execution-Mode": "work",
      },
      body: JSON.stringify({
        agent: "custom-agent",
        parts: [{ type: "text", text: "Do approved work" }],
        tools: { custom_read: true, custom_write: false },
      }),
    });

    expect(response.status).toBe(200);
    const promptRequest = mock.requests.find((request) => request.pathname === "/session/ses_1/prompt_async");
    expect(promptRequest?.body).toMatchObject({ tools: { custom_read: true, custom_write: false } });
    expect(String((promptRequest?.body as { system?: unknown })?.system)).toContain("Mode: work");
  });

  test("blocks mutating session proxy routes outside Work mode", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });
    const base = `http://127.0.0.1:${openwork.server.port}/workspace/ws_1/opencode/session/ses_1`;
    const cases = [
      { method: "POST", suffix: "/command" },
      { method: "POST", suffix: "/shell" },
      { method: "POST", suffix: "/revert" },
      { method: "POST", suffix: "/fork" },
      { method: "POST", suffix: "/share" },
      { method: "POST", suffix: "/unshare" },
      { method: "POST", suffix: "/summarize" },
      { method: "PATCH", suffix: "" },
      { method: "DELETE", suffix: "" },
    ];

    for (const item of cases) {
      const response = await fetch(`${base}${item.suffix}`, {
        method: item.method,
        headers: {
          ...auth(openwork.token),
          "Content-Type": "application/json",
          "X-Matterhorn-Execution-Mode": item.suffix === "/shell" ? "plan" : "discuss",
        },
        body: JSON.stringify({ messageID: "msg_1" }),
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: "execution_mode_restricted" });
    }
    expect(mock.requests).toHaveLength(0);
  });

  test("rejects invalid and conflicting execution mode declarations", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });
    const endpoint = `http://127.0.0.1:${openwork.server.port}/workspace/ws_1/opencode/session/ses_1/prompt_async`;

    const invalid = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...auth(openwork.token),
        "Content-Type": "application/json",
        "X-Matterhorn-Execution-Mode": "autonomous",
      },
      body: JSON.stringify({ parts: [{ type: "text", text: "Hello" }] }),
    });
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ code: "invalid_execution_mode" });

    const mismatch = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...auth(openwork.token),
        "Content-Type": "application/json",
        "X-Matterhorn-Execution-Mode": "discuss",
      },
      body: JSON.stringify({
        executionMode: "plan",
        parts: [{ type: "text", text: "Hello" }],
      }),
    });
    expect(mismatch.status).toBe(400);
    await expect(mismatch.json()).resolves.toMatchObject({ code: "execution_mode_mismatch" });
    expect(mock.requests).toHaveLength(0);
  });

  test("enforces execution mode on the stable prompt route and audits changes", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
      readOnly: false,
    });
    const base = `http://127.0.0.1:${openwork.server.port}`;

    const changed = await fetch(`${base}/workspace/ws_1/sessions/ses_1/execution-mode`, {
      method: "POST",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "plan", previousMode: "discuss" }),
    });
    expect(changed.status).toBe(200);
    await expect(changed.json()).resolves.toMatchObject({ ok: true, sessionId: "ses_1", mode: "plan" });

    const prompt = await fetch(`${base}/workspace/ws_1/sessions/ses_1/messages`, {
      method: "POST",
      headers: { ...auth(openwork.token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Plan a balance review",
        agent: "matterhorn-sui",
        executionMode: "plan",
        tools: { "*": true, matterhorn_work_matterhorn_sui_preview_transfer: true },
      }),
    });
    expect(prompt.status).toBe(202);
    const promptRequest = mock.requests.find((request) => request.pathname === "/session/ses_1/prompt_async");
    expect(promptRequest?.body).toMatchObject({
      tools: {
        "*": false,
        "matterhorn-work_matterhorn_sui_get_balance": true,
      },
    });
    expect(JSON.stringify(promptRequest?.body)).not.toContain("preview_transfer");

    const auditResponse = await fetch(`${base}/workspace/ws_1/audit?limit=10`, {
      headers: auth(openwork.token),
    });
    expect(auditResponse.status).toBe(200);
    const auditBody = await auditResponse.json();
    const modeAudit = auditBody.items.find((entry: { action?: string }) => entry.action === "session.execution_mode.change");
    expect(modeAudit).toMatchObject({
      target: "ses_1",
      metadata: { executionMode: "plan", previousExecutionMode: "discuss" },
    });
  });

  test("keeps legacy /w workspace opencode proxy alias", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode();
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/w/ws_1/opencode/session`, {
      headers: auth(openwork.token),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(mock.requests.some((request) => request.pathname === "/session")).toBe(true);
  });

  test("returns 502 when OpenCode returns an invalid session list payload", async () => {
    const workspaceRoot = await createWorkspaceRoot();
    const mock = startMockOpencode({ invalidList: true });
    const openwork = await startOpenworkServer({
      workspaceRoot,
      opencodeBaseUrl: `http://127.0.0.1:${mock.server.port}`,
    });

    const response = await fetch(`http://127.0.0.1:${openwork.server.port}/workspace/ws_1/sessions`, {
      headers: auth(openwork.token),
    });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "opencode_invalid_response",
      message: "OpenCode returned invalid session list",
    });

  });
});
