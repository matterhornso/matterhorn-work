import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
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
  return workspaceRoot;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function startMockOpencode(input?: { invalidList?: boolean; holdCommand?: Promise<void> }) {
  const requests: Array<{ pathname: string; search: string; directory: string | null; method: string; body: unknown }> = [];
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
  return { server, requests };
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
