#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const clientToken = process.env.MATTERHORN_MEDIA_SMOKE_CLIENT_TOKEN?.trim() || "matterhorn-media-smoke-client-token";
const hostToken = process.env.MATTERHORN_MEDIA_SMOKE_HOST_TOKEN?.trim() || "matterhorn-media-smoke-host-token";
const preferredServerPort = Number(process.env.MATTERHORN_MEDIA_SMOKE_SERVER_PORT?.trim() || "4125");
const preferredAppPort = Number(process.env.MATTERHORN_MEDIA_SMOKE_APP_PORT?.trim() || "5282");
const workspaceRoot = path.resolve(process.env.MATTERHORN_MEDIA_SMOKE_WORKSPACE?.trim() || rootDir);
const storageEpochs = process.env.MATTERHORN_MEDIA_SMOKE_WALRUS_EPOCHS?.trim() || "3";
const requestRateLimitMax = process.env.MATTERHORN_MEDIA_SMOKE_REQUEST_RATE_LIMIT_MAX?.trim() || "5000";
const parsedPromptResponseDelayMs = Number(process.env.MATTERHORN_MEDIA_SMOKE_RESPONSE_DELAY_MS?.trim() || "0");
const promptResponseDelayMs = Number.isFinite(parsedPromptResponseDelayMs)
  ? Math.min(10_000, Math.max(0, Math.floor(parsedPromptResponseDelayMs)))
  : 0;

const fakeSuiIds = {
  nftPackage: "0x1111111111111111111111111111111111111111111111111111111111111111",
  kioskPackage: "0x2222222222222222222222222222222222222222222222222222222222222222",
  transferPolicyPackage: "0x3333333333333333333333333333333333333333333333333333333333333333",
  kiosk: "0x4444444444444444444444444444444444444444444444444444444444444444",
  kioskOwnerCap: "0x5555555555555555555555555555555555555555555555555555555555555555",
  transferPolicy: "0x6666666666666666666666666666666666666666666666666666666666666666",
};

const children = new Set();
let fakeWalrusServer;
let fakeOpencodeServer;
let shuttingDown = false;

function help() {
  return [
    "Matterhorn generated-media smoke launcher",
    "",
    "Starts a local Matterhorn Desks app wired to:",
    "- a fake loopback OpenCode engine for browser chat sessions",
    "- mock image generation",
    "- a fake loopback Walrus publisher/relay",
    "- preview-only Sui package, Kiosk, and TransferPolicy ids",
    "- a local Max billing context so repeated QA runs do not exhaust free-plan limits",
    "",
    "Usage:",
    "  node scripts/dev-generated-media-smoke.mjs",
    "",
    "Useful env vars:",
    "  MATTERHORN_MEDIA_SMOKE_WORKSPACE=/path/to/workspace",
    "  MATTERHORN_MEDIA_SMOKE_SERVER_PORT=4125",
    "  MATTERHORN_MEDIA_SMOKE_APP_PORT=5282",
    "  MATTERHORN_MEDIA_SMOKE_REQUEST_RATE_LIMIT_MAX=5000",
    "  MATTERHORN_MEDIA_SMOKE_RESPONSE_DELAY_MS=2500  # inspect active agent states",
    "",
    "The request budget applies only to this synthetic loopback QA stack.",
    "No OpenAI key, wallet secret, seed phrase, or server-side signing is used.",
  ].join(os.EOL);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(help());
  process.exit(0);
}

function canConnect(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(350);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

async function findPort(preferred) {
  for (let offset = 0; offset < 30; offset += 1) {
    const candidate = preferred + offset;
    if (!(await canConnect(candidate))) return candidate;
  }

  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a local port"));
      });
    });
  });
}

function spawnChild(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  children.add(child);

  const prefix = `[${label}]`;
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(String(chunk).split("\n").map((line) => line ? `${prefix} ${line}` : line).join("\n"));
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(String(chunk).split("\n").map((line) => line ? `${prefix} ${line}` : line).join("\n"));
  });
  child.once("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) {
      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 1}`;
      console.error(`${prefix} stopped with ${detail}`);
      void shutdown(1);
    }
  });
  child.once("error", (error) => {
    children.delete(child);
    if (!shuttingDown) {
      console.error(`${prefix} failed to start: ${error.message}`);
      void shutdown(1);
    }
  });

  return child;
}

function serverCommand() {
  const probe = spawnSync("bun", ["--version"], { stdio: "ignore" });
  if (probe.status === 0) {
    return { command: "bun", args: [path.join(rootDir, "apps", "server", "src", "cli.ts")] };
  }
  const binary = path.join(rootDir, "apps", "server", "dist", "bin", "matterhorn-work-server");
  if (existsSync(binary)) return { command: binary, args: [] };
  throw new Error("Bun or a built Matterhorn Desks server binary is required.");
}

function appCommand(appPort) {
  const appDir = path.join(rootDir, "apps", "app");
  const viteBin = path.join(appDir, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  const rootViteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
  const viteArgs = [
    "--host",
    "127.0.0.1",
    "--port",
    String(appPort),
    "--strictPort",
  ];

  if (existsSync(viteBin)) {
    return { command: viteBin, args: viteArgs, cwd: appDir };
  }

  if (existsSync(rootViteBin)) {
    return { command: process.execPath, args: [rootViteBin, ...viteArgs], cwd: appDir };
  }

  return {
    command: "npx",
    args: [
      "pnpm@10.27.0",
      "--filter",
      "@matterhorn-work/app",
      "exec",
      "vite",
      ...viteArgs,
    ],
    cwd: rootDir,
  };
}

function startFakeWalrus() {
  const blobs = new Map();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "authorization, content-type");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === "PUT" && url.pathname === "/v1/blobs") {
      const chunks = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      const blobId = `matterhorn_smoke_blob_${String(blobs.size + 1).padStart(3, "0")}`;
      blobs.set(blobId, {
        bytes,
        contentType: request.headers["content-type"] || "application/octet-stream",
      });
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        newlyCreated: {
          blobObject: {
            id: `0xsmokeblob${String(blobs.size).padStart(4, "0")}`,
            blobId,
            storage: { endEpoch: 42 },
          },
        },
      }));
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/v1/blobs/")) {
      const blobId = decodeURIComponent(url.pathname.replace("/v1/blobs/", ""));
      const blob = blobs.get(blobId);
      if (!blob) {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: "Fake Walrus blob not found." }));
        return;
      }
      response.writeHead(200, { "Content-Type": blob.contentType });
      response.end(blob.bytes);
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "Fake Walrus route not found." }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      fakeWalrusServer = server;
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Could not start fake Walrus server."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return null;
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function startFakeOpencode() {
  const sessions = new Map();
  const messages = new Map();
  let sessionSequence = 0;
  let messageSequence = 0;

  const json = (response, status, payload) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload));
  };

  const requestDirectory = (request) => {
    const raw = request.headers["x-opencode-directory"];
    if (typeof raw !== "string" || !raw.trim()) return workspaceRoot;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  const appendAssistantMessage = (sessionId, parentId, text, now) => {
    messageSequence += 1;
    const messageId = `msg_smoke_${String(messageSequence).padStart(3, "0")}`;
    const partId = `prt_smoke_${String(messageSequence).padStart(3, "0")}`;
    const nextMessages = messages.get(sessionId) || [];
    nextMessages.push({
      info: {
        id: messageId,
        sessionID: sessionId,
        role: "assistant",
        time: { created: now, completed: now },
        parentID: parentId,
        modelID: "smoke-model",
        providerID: "matterhorn-smoke",
        mode: "work",
        agent: "matterhorn",
        path: { cwd: workspaceRoot, root: workspaceRoot },
        cost: 0,
        tokens: {
          input: 0,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        finish: "stop",
      },
      parts: [
        {
          id: partId,
          messageID: messageId,
          sessionID: sessionId,
          type: "text",
          text,
        },
      ],
    });
    messages.set(sessionId, nextMessages);
  };

  const seedAssistantResponse = (sessionId, now) => {
    appendAssistantMessage(
      sessionId,
      "",
      "QA-only simulator. Live models, markets, wallets, and submissions are unavailable in this workspace.",
      now,
    );
  };

  const createSession = (request, body) => {
    sessionSequence += 1;
    const id = `ses_generated_media_smoke_${String(sessionSequence).padStart(3, "0")}`;
    const now = Math.floor(Date.now() / 1000);
    const title = typeof body?.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Generated media smoke";
    const session = {
      id,
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "generated-media-smoke",
      directory: requestDirectory(request),
      time: { created: now, updated: now },
    };
    sessions.set(id, session);
    messages.set(id, []);
    seedAssistantResponse(id, now);
    return session;
  };

  const ensureSession = (sessionId, request) => {
    const existing = sessions.get(sessionId);
    if (existing) return existing;
    const now = Math.floor(Date.now() / 1000);
    const session = {
      id: sessionId,
      title: "Generated media smoke",
      slug: "generated-media-smoke",
      directory: requestDirectory(request),
      time: { created: now, updated: now },
    };
    sessions.set(sessionId, session);
    messages.set(sessionId, []);
    seedAssistantResponse(sessionId, now);
    return session;
  };

  const providerList = {
    all: [
      {
        id: "opencode",
        name: "Matterhorn included catalog",
        source: "config",
        models: {
          "big-pickle": { name: "Big Pickle" },
        },
      },
      {
        id: "matterhorn-smoke",
        name: "Matterhorn smoke provider",
        source: "config",
        models: {
          "smoke-model": { name: "Smoke model" },
        },
      },
    ],
    default: {
      opencode: "big-pickle",
      "matterhorn-smoke": "smoke-model",
    },
    connected: ["opencode", "matterhorn-smoke"],
  };
  const mcpStatuses = {
    wallet: { status: "connected" },
    crypto: { status: "connected" },
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "authorization, content-type, x-opencode-directory");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if ((url.pathname === "/health" || url.pathname === "/global/health") && request.method === "GET") {
      json(response, 200, { healthy: true });
      return;
    }

    if (url.pathname === "/config" && request.method === "GET") {
      json(response, 200, {
        disabled_providers: [],
        provider: providerList.default,
      });
      return;
    }

    if (url.pathname === "/config/providers" && request.method === "GET") {
      json(response, 200, providerList);
      return;
    }

    if (url.pathname === "/provider" && request.method === "GET") {
      json(response, 200, providerList);
      return;
    }

    if (url.pathname === "/provider/auth" && request.method === "GET") {
      json(response, 200, {
        anthropic: [{ type: "api", label: "API key" }],
      });
      return;
    }

    if (url.pathname === "/mcp" && request.method === "GET") {
      json(response, 200, mcpStatuses);
      return;
    }

    if (url.pathname === "/command" && request.method === "GET") {
      json(response, 200, [
        {
          name: "help",
          description: "Show the available Matterhorn Desks actions.",
          source: "command",
        },
      ]);
      return;
    }

    if (url.pathname === "/event" && request.method === "GET") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      response.write(": fake OpenCode event stream\n\n");
      response.end();
      return;
    }

    if ((url.pathname === "/permission" || url.pathname === "/question") && request.method === "GET") {
      json(response, 200, []);
      return;
    }

    if ((url.pathname === "/permission" || url.pathname === "/question") && request.method === "POST") {
      json(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/session" && request.method === "POST") {
      const body = await readJsonBody(request);
      json(response, 200, createSession(request, body));
      return;
    }

    if (url.pathname === "/session" && request.method === "GET") {
      json(response, 200, Array.from(sessions.values()).sort((a, b) => b.time.updated - a.time.updated));
      return;
    }

    if (url.pathname === "/session/status" && request.method === "GET") {
      json(
        response,
        200,
        Object.fromEntries(Array.from(sessions.keys()).map((sessionId) => [sessionId, { type: "idle" }])),
      );
      return;
    }

    const sessionMatch = url.pathname.match(/^\/session\/([^/]+)(?:\/([^/]+))?$/);
    if (sessionMatch) {
      const sessionId = decodeURIComponent(sessionMatch[1] || "");
      const action = sessionMatch[2] ? decodeURIComponent(sessionMatch[2]) : "";
      const session = request.method === "GET" || request.method === "HEAD"
        ? ensureSession(sessionId, request)
        : sessions.get(sessionId);
      if (!session) {
        json(response, 404, { code: "not_found", message: "Fake OpenCode session not found." });
        return;
      }

      if (request.method === "HEAD") {
        response.writeHead(200);
        response.end();
        return;
      }

      if (!action && request.method === "GET") {
        json(response, 200, session);
        return;
      }

      if (!action && request.method === "PATCH") {
        const body = await readJsonBody(request);
        const title = typeof body?.title === "string" && body.title.trim()
          ? body.title.trim()
          : session.title;
        const now = Math.floor(Date.now() / 1000);
        const updatedSession = {
          ...session,
          title,
          slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || session.slug,
          time: { ...session.time, updated: now },
        };
        sessions.set(sessionId, updatedSession);
        json(response, 200, updatedSession);
        return;
      }

      if (action === "message" && request.method === "GET") {
        json(response, 200, messages.get(sessionId) || []);
        return;
      }

      if (action === "todo" && request.method === "GET") {
        json(response, 200, []);
        return;
      }

      if (action === "revert" && request.method === "POST") {
        const body = await readJsonBody(request);
        const messageID = typeof body?.messageID === "string" ? body.messageID.trim() : "";
        const sessionMessages = messages.get(sessionId) || [];
        if (!messageID || !sessionMessages.some((message) => message.info?.id === messageID)) {
          json(response, 400, { code: "invalid_message", message: "Fake OpenCode revert target was not found." });
          return;
        }
        session.revert = { messageID };
        sessions.set(sessionId, session);
        json(response, 200, session);
        return;
      }

      if (action === "prompt_async" && request.method === "POST") {
        const body = await readJsonBody(request);
        const now = Math.floor(Date.now() / 1000);
        const textPart = Array.isArray(body?.parts)
          ? body.parts.find((part) => part && typeof part === "object" && part.type === "text")
          : null;
        const text = typeof textPart?.text === "string" && textPart.text.trim()
          ? textPart.text.trim()
          : "Generated media smoke prompt";
        const currentMessages = messages.get(sessionId) || [];
        const revertMessageID = typeof session.revert?.messageID === "string"
          ? session.revert.messageID
          : "";
        const revertIndex = revertMessageID
          ? currentMessages.findIndex((message) => message.info?.id === revertMessageID)
          : -1;
        const nextMessages = revertIndex >= 0
          ? currentMessages.slice(0, revertIndex + 1)
          : currentMessages;
        const revertTarget = revertIndex >= 0 ? nextMessages[revertIndex] : null;
        const revertTargetText = revertTarget?.parts?.find((part) => part?.type === "text")?.text?.trim();
        let userMessageId = "";

        if (revertTarget?.info?.role === "user" && revertTargetText === text) {
          userMessageId = revertTarget.info.id;
        } else {
          messageSequence += 1;
          userMessageId = `msg_smoke_${String(messageSequence).padStart(3, "0")}`;
          nextMessages.push({
            info: {
              id: userMessageId,
              sessionID: sessionId,
              role: "user",
              time: { created: now },
              agent: "matterhorn",
              model: {
                providerID: "matterhorn-smoke",
                modelID: "smoke-model",
              },
            },
            parts: [
              {
                id: `prt_smoke_${String(messageSequence).padStart(3, "0")}`,
                messageID: userMessageId,
                sessionID: sessionId,
                type: "text",
                text,
              },
            ],
          });
        }

        delete session.revert;
        messages.set(sessionId, nextMessages);
        if (promptResponseDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, promptResponseDelayMs));
        }
        appendAssistantMessage(
          sessionId,
          userMessageId,
          "QA-only simulator: this request was recorded for interface testing. No live model, market, wallet, or submission was called.",
          now,
        );
        session.time.updated = now;
        sessions.set(sessionId, session);
        json(response, 200, { ok: true });
        return;
      }

      if (action === "command" && request.method === "POST") {
        json(response, 200, { ok: true });
        return;
      }

      if (!action && request.method === "DELETE") {
        sessions.delete(sessionId);
        messages.delete(sessionId);
        json(response, 200, { ok: true });
        return;
      }
    }

    json(response, 404, { code: "not_found", message: "Fake OpenCode route not found." });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      fakeOpencodeServer = server;
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Could not start fake OpenCode server."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function waitForJson(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: options.headers,
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return await response.json();
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError})` : ""}`);
}

async function waitForHttp(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? ` (${lastError})` : ""}`);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of Array.from(children)) {
    child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  for (const child of Array.from(children)) {
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  fakeWalrusServer?.close();
  fakeOpencodeServer?.close();

  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void shutdown(0);
  });
}

async function main() {
  if (!existsSync(workspaceRoot)) {
    throw new Error(`Workspace path does not exist: ${workspaceRoot}`);
  }

  const fakeWalrusUrl = await startFakeWalrus();
  const fakeOpencodeUrl = await startFakeOpencode();
  const serverPort = await findPort(preferredServerPort);
  const appPort = await findPort(preferredAppPort);
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const appUrl = `http://127.0.0.1:${appPort}`;
  const { command, args: baseServerArgs } = serverCommand();
  const serverArgs = [
    ...baseServerArgs,
    "--host", "127.0.0.1",
    "--port", String(serverPort),
    "--token", clientToken,
    "--host-token", hostToken,
    "--workspace", workspaceRoot,
    "--approval", "auto",
    "--approval-timeout", "30000",
    "--cors", "loopback",
    "--opencode-directory", workspaceRoot,
    "--opencode-base-url", fakeOpencodeUrl,
    "--log-format", "pretty",
    "--no-log-requests",
  ];

  console.log("Starting Matterhorn generated-media smoke stack...");
  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Fake OpenCode: ${fakeOpencodeUrl}`);
  console.log(`Fake Walrus: ${fakeWalrusUrl}`);
  console.log("Image generation: mock provider, no OpenAI key required.");
  console.log("Sui: preview-only fake package/Kiosk/TransferPolicy ids; no custody or signing.");
  console.log("Billing: local Max plan for repeatable smoke testing; no payment provider is used.");
  console.log(`QA request budget: ${requestRateLimitMax} requests per 60-second loopback bucket.`);

  spawnChild("server", command, serverArgs, {
    env: {
      ...process.env,
      OPENWORK_DEV_MODE: "1",
      MATTERHORN_WORK_REQUEST_RATE_LIMIT_MAX: requestRateLimitMax,
      MATTERHORN_BILLING_CURRENT_PLAN: "max",
      MATTERHORN_BILLING_ACCOUNT_PATH: path.join(os.tmpdir(), `matterhorn-generated-media-smoke-billing-${process.pid}.json`),
      MATTERHORN_IMAGE_PROVIDER: "mock",
      MATTERHORN_WALRUS_PUBLISHER_URL: fakeWalrusUrl,
      MATTERHORN_WALRUS_RELAY_URL: fakeWalrusUrl,
      MATTERHORN_WALRUS_STORAGE_EPOCHS: storageEpochs,
      MATTERHORN_SUI_NETWORK: "sui-testnet",
      MATTERHORN_SUI_NFT_PACKAGE_ID: fakeSuiIds.nftPackage,
      MATTERHORN_SUI_NFT_MODULE_NAME: "matterhorn_media",
      MATTERHORN_SUI_NFT_TYPE: `${fakeSuiIds.nftPackage}::matterhorn_media::MatterhornNFT`,
      MATTERHORN_SUI_KIOSK_PACKAGE_ID: fakeSuiIds.kioskPackage,
      MATTERHORN_SUI_KIOSK_ID: fakeSuiIds.kiosk,
      MATTERHORN_SUI_KIOSK_OWNER_CAP_ID: fakeSuiIds.kioskOwnerCap,
      MATTERHORN_SUI_TRANSFER_POLICY_ID: fakeSuiIds.transferPolicy,
      MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID: fakeSuiIds.transferPolicyPackage,
    },
  });

  await waitForJson(`${serverUrl}/health`, { timeoutMs: 45_000 });
  const workspaceList = await waitForJson(`${serverUrl}/workspaces`, {
    timeoutMs: 45_000,
    headers: { Authorization: `Bearer ${clientToken}` },
  });
  const activeWorkspaceId =
    String(workspaceList.activeId ?? "").trim() ||
    String(workspaceList.items?.[0]?.id ?? workspaceList.workspaces?.[0]?.id ?? "").trim();

  if (!activeWorkspaceId) {
    throw new Error("Matterhorn Desks server started, but it did not report an active workspace.");
  }

  const billingStatus = await waitForJson(
    `${serverUrl}/workspace/${encodeURIComponent(activeWorkspaceId)}/billing/status`,
    {
      timeoutMs: 45_000,
      headers: { Authorization: `Bearer ${clientToken}` },
    },
  );
  const smokePlanId = billingStatus?.status?.subscription?.planId;
  const imageLimit = billingStatus?.status?.usage?.generatedImages?.limit;
  if (smokePlanId !== "max" || imageLimit !== null) {
    throw new Error(
      `Generated-media smoke billing isolation failed: expected Max with unlimited images, received ${smokePlanId || "unknown"} with limit ${String(imageLimit)}.`,
    );
  }

  const app = appCommand(appPort);
  spawnChild("app", app.command, app.args, {
    cwd: app.cwd,
    env: {
      ...process.env,
      CI: "true",
      OPENWORK_DEV_MODE: "1",
      VITE_MATTERHORN_DEV_API_TARGET: serverUrl,
      VITE_MATTERHORN_WORK_URL: serverUrl,
      VITE_MATTERHORN_WORK_TOKEN: clientToken,
      VITE_MATTERHORN_WORK_HOST_TOKEN: hostToken,
      VITE_MATTERHORN_WORK_FORCE_SETTINGS: "1",
      // The disposable server below supplies a mock image provider and storage relay.
      // Enable the otherwise launch-gated UI only for this end-to-end smoke fixture.
      VITE_MATTERHORN_GENERATED_MEDIA_ENABLED: "1",
    },
  });

  await waitForHttp(appUrl, { timeoutMs: 45_000 });

  const sessionUrl = `${appUrl}/workspace/${encodeURIComponent(activeWorkspaceId)}/session`;
  const settingsUrl = `${appUrl}/workspace/${encodeURIComponent(activeWorkspaceId)}/settings/overview`;
  const lines = [
    "",
    "Matterhorn generated-media smoke app is ready.",
    `App:       ${sessionUrl}`,
    `Settings:  ${settingsUrl}`,
    `Server:    ${serverUrl}`,
    `OpenCode:  ${fakeOpencodeUrl}`,
    `Walrus:    ${fakeWalrusUrl}`,
    `Workspace: ${workspaceRoot}`,
    `Client token: ${clientToken}`,
    "",
    "Suggested smoke flow:",
    "1. Open the App link, create or open a chat session, and generate an image.",
    "2. Click Make NFT on the generated image.",
    "3. Prepare/upload to Walrus; the fake publisher stores and serves the image bytes locally.",
    "4. Prepare mint/listing previews; they produce wallet handoff plans only.",
    "",
    "Keep this command running while you test the generated-media flow.",
    "",
  ];
  console.log(lines.join(os.EOL));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  void shutdown(1);
});
