import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import {
  findFreePort,
  makeClient,
  normalizeEvent,
  parseArgs,
  spawnOpencodeServe,
  waitForHealthy,
} from "./_util.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeSse(response, chunks) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  for (const chunk of chunks) {
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
  response.write("data: [DONE]\n\n");
  response.end();
}

function textCompletion(text) {
  return [
    {
      id: "chatcmpl-permission-result",
      object: "chat.completion.chunk",
      choices: [
        { index: 0, delta: { role: "assistant" }, finish_reason: null },
      ],
    },
    {
      id: "chatcmpl-permission-result",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    },
    {
      id: "chatcmpl-permission-result",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    },
  ];
}

function bashToolCompletion(toolName) {
  return [
    {
      id: "chatcmpl-permission-tool",
      object: "chat.completion.chunk",
      choices: [
        { index: 0, delta: { role: "assistant" }, finish_reason: null },
      ],
    },
    {
      id: "chatcmpl-permission-tool",
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "call_permission_probe",
                type: "function",
                function: {
                  name: toolName,
                  arguments: JSON.stringify({
                    command: "pwd",
                    description: "Read the current working directory",
                  }),
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: "chatcmpl-permission-tool",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
    },
  ];
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function availableToolNames(body) {
  return (Array.isArray(body?.tools) ? body.tools : [])
    .map((tool) => tool?.function?.name ?? tool?.name)
    .filter((name) => typeof name === "string");
}

const args = parseArgs(process.argv.slice(2));
const requirePermission = args.get("require") !== "false";
const probeMarker = "permission-boundary-probe";
const mockSockets = new Set();
const events = [];

let tmpdir;
let mock;
let server;
let controller;

try {
  tmpdir = await mkdtemp(path.join(os.tmpdir(), "matterhorn-permission-test-"));
  const mockPort = await findFreePort();
  const baseURL = `http://127.0.0.1:${mockPort}/v1`;

  mock = http.createServer(async (request, response) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "127.0.0.1"}`,
    );
    if (request.method === "GET" && url.pathname.endsWith("/models")) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(
        JSON.stringify({
          object: "list",
          data: [{ id: "qwen-plus", object: "model" }],
        }),
      );
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.endsWith("/chat/completions")
    ) {
      const body = await readJsonBody(request);
      const haystack = JSON.stringify(body).toLowerCase();
      const hasToolResult = (
        Array.isArray(body?.messages) ? body.messages : []
      ).some((message) => message?.role === "tool");
      if (haystack.includes(probeMarker) && !hasToolResult) {
        const toolName = availableToolNames(body).find((name) =>
          /^(bash|shell)$/i.test(name),
        );
        assert.ok(toolName, "The model request did not expose a bash tool");
        writeSse(response, bashToolCompletion(toolName));
        return;
      }
      writeSse(response, textCompletion("Permission probe completed."));
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("not found");
  });
  mock.on("connection", (socket) => {
    mockSockets.add(socket);
    socket.on("close", () => mockSockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    mock.once("error", reject);
    mock.listen(mockPort, "127.0.0.1", resolve);
  });

  await writeFile(
    path.join(tmpdir, "opencode.json"),
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        enabled_providers: ["alibaba"],
        provider: {
          alibaba: {
            options: { apiKey: "test-key", baseURL },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const port = await findFreePort();
  server = await spawnOpencodeServe({ directory: tmpdir, port });
  const client = makeClient({ baseUrl: server.baseUrl, directory: server.cwd });
  await waitForHealthy(client, { runtime: server });

  const agents = await client.app.agents();
  const agentName = agents?.[0]?.name ?? "default";
  const session = await client.session.create({
    title: "Matterhorn permission test",
    permission: [{ permission: "bash", pattern: "*", action: "ask" }],
  });

  controller = new AbortController();
  const subscription = await client.event.subscribe(undefined, {
    signal: controller.signal,
  });
  let asked = null;
  const reader = (async () => {
    try {
      for await (const raw of subscription.stream) {
        const event = normalizeEvent(raw);
        if (!event) continue;
        events.push(event);
        if (event.type === "permission.asked") {
          asked = event;
          return;
        }
      }
    } catch {
      // The subscription is intentionally aborted during cleanup.
    }
  })();

  const promptResult = client.session
    .prompt({
      sessionID: session.id,
      agent: agentName,
      model: { providerID: "alibaba", modelID: "qwen-plus" },
      parts: [
        {
          type: "text",
          text: `${probeMarker}: use the bash tool to run pwd exactly once.`,
        },
      ],
    })
    .then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error }),
    );

  const deadline = Date.now() + 10_000;
  let pending = [];
  while (!asked && pending.length === 0 && Date.now() < deadline) {
    await sleep(100);
    pending = await client.permission.list();
  }

  const eventRequest =
    asked?.properties && typeof asked.properties === "object"
      ? asked.properties
      : null;
  const request =
    eventRequest ??
    pending.find((item) => item?.sessionID === session.id) ??
    null;

  if (!request) {
    if (requirePermission) {
      assert.fail(
        `No permission request observed for ${agentName}. Events: ${events
          .map((event) => event.type)
          .join(", ")}`,
      );
    }
  } else {
    assert.equal(request.permission, "bash");
    assert.equal(typeof request.id, "string");
    await client.permission.reply({ requestID: request.id, reply: "once" });
  }

  const completed = await Promise.race([
    promptResult,
    sleep(10_000).then(() => ({
      ok: false,
      error: new Error("Prompt timed out"),
    })),
  ]);
  assert.equal(
    completed.ok,
    true,
    completed.error instanceof Error
      ? completed.error.message
      : String(completed.error),
  );

  controller.abort();
  await Promise.race([reader, sleep(500)]);
  const remaining = await client.permission.list();
  assert.equal(
    remaining.some((item) => item?.sessionID === session.id),
    false,
    "The one-time permission reply should resolve the pending request",
  );

  console.log(
    JSON.stringify({
      ok: true,
      baseUrl: server.baseUrl,
      sessionId: session.id,
      agentName,
      permissionAsked: Boolean(request),
      requestedPermission: request?.permission ?? null,
      pendingCountAfterReply: remaining.length,
      observedEventTypes: Array.from(
        new Set(events.map((event) => event.type)),
      ),
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stderr: server?.getStderr?.() ?? "",
    }),
  );
  process.exitCode = 1;
} finally {
  controller?.abort();
  if (server) await server.close().catch(() => {});
  if (mock) {
    for (const socket of mockSockets) socket.destroy();
    await new Promise((resolve) => mock.close(() => resolve()));
  }
  if (tmpdir) await rm(tmpdir, { recursive: true, force: true });
}
