#!/usr/bin/env node

/**
 * matterhorn-work-mcp
 *
 * Unified MCP server for Matterhorn Work server control. This stdio server is
 * meant for Claude Code, Codex, Cursor, and other agent environments that need
 * to inspect or operate a running Matterhorn Work server without scraping the UI.
 */

const SERVER =
  process.env.MATTERHORN_WORK_SERVER_URL ||
  process.env.MATTERHORN_SERVER_URL ||
  process.env.OPENWORK_SERVER_URL ||
  "http://localhost:8787";

const CLIENT_TOKEN =
  process.env.MATTERHORN_WORK_TOKEN ||
  process.env.OPENWORK_TOKEN ||
  process.env.MATTERHORN_TOKEN ||
  "";

const HOST_TOKEN =
  process.env.MATTERHORN_WORK_HOST_TOKEN ||
  process.env.OPENWORK_HOST_TOKEN ||
  process.env.MATTERHORN_HOST_TOKEN ||
  "";

const REQUEST_TIMEOUT_MS = Number(process.env.MATTERHORN_WORK_MCP_TIMEOUT_MS || 15_000);
const MAX_TEXT_BYTES = Number(process.env.MATTERHORN_WORK_MCP_MAX_TEXT_BYTES || 512_000);

const tools = [
  {
    name: "matterhorn_status",
    description: "Read Matterhorn Work server health, status, and capability summary.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_list_workspaces",
    description: "List Matterhorn Work server workspaces visible to the configured client token.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_create_file_session",
    description: "Create a short-lived file session for a workspace. Use readOnly=true unless writes are explicitly needed.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: { type: "string" },
        readOnly: { type: "boolean", description: "When true, request a read-only file session." },
        ttlSeconds: { type: "number" },
      },
      required: ["workspaceId"],
    },
  },
  {
    name: "matterhorn_file_catalog",
    description: "List files in an existing Matterhorn Work file session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        prefix: { type: "string" },
        after: { type: "string" },
        limit: { type: "number" },
        includeDirs: { type: "boolean" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "matterhorn_read_files",
    description: "Read one or more workspace files through an existing file session. Text files are decoded for agent use.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
      },
      required: ["sessionId", "paths"],
    },
  },
  {
    name: "matterhorn_write_files",
    description: "Write files through a writable file session. Requires a collaborator/owner token and normal Matterhorn approvals.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        writes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" },
              contentBase64: { type: "string" },
              ifMatchRevision: { type: "string" },
              force: { type: "boolean" },
            },
            required: ["path"],
          },
        },
      },
      required: ["sessionId", "writes"],
    },
  },
  {
    name: "matterhorn_close_file_session",
    description: "Close a Matterhorn Work file session.",
    inputSchema: {
      type: "object",
      properties: { sessionId: { type: "string" } },
      required: ["sessionId"],
    },
  },
  {
    name: "matterhorn_list_approvals",
    description: "List pending Matterhorn Work host approval requests. Requires MATTERHORN_WORK_HOST_TOKEN.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "matterhorn_reply_approval",
    description: "Approve or deny a pending Matterhorn Work approval request. Requires MATTERHORN_WORK_HOST_TOKEN.",
    inputSchema: {
      type: "object",
      properties: {
        approvalId: { type: "string" },
        reply: { type: "string", enum: ["allow", "deny"] },
      },
      required: ["approvalId", "reply"],
    },
  },
  {
    name: "matterhorn_bittensor_chat",
    description: "Run the safe Matterhorn Work Bittensor chat workflow against the configured server.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        contextId: { type: "string" },
        context: { type: "object" },
        ss58Address: { type: "string" },
        netuid: { type: "number" },
        amountTao: { type: "string" },
        validatorHotkey: { type: "string" },
        coldkey: { type: "string" },
        recipient: { type: "string" },
        destination: { type: "string" },
        limit: { type: "number" },
        strategy: { type: "string", enum: ["balanced", "yield", "safety"] },
        rateTolerance: { type: "number" },
      },
      required: ["message"],
    },
  },
  {
    name: "matterhorn_bittensor_readiness",
    description: "Run the Matterhorn Work Bittensor readiness audit on the configured server.",
    inputSchema: { type: "object", properties: {} },
  },
];

function jsonRpc(id, result) {
  return `${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`;
}

function jsonRpcError(id, code, message) {
  return `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`;
}

function textResult(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function requireToken(kind) {
  if (kind === "host" && !HOST_TOKEN) {
    throw new Error("MATTERHORN_WORK_HOST_TOKEN is required for host approval tools.");
  }
  if (kind === "client" && !CLIENT_TOKEN) {
    throw new Error("MATTERHORN_WORK_TOKEN is required for server client tools.");
  }
}

function headersFor(kind, hasBody = false) {
  const headers = {};
  if (hasBody) headers["Content-Type"] = "application/json";
  if (kind === "host") {
    requireToken("host");
    headers["X-Matterhorn-Host-Token"] = HOST_TOKEN;
  } else if (kind === "client") {
    requireToken("client");
    headers.Authorization = `Bearer ${CLIENT_TOKEN}`;
  }
  return headers;
}

function buildUrl(path, query = null) {
  const base = SERVER.replace(/\/+$/, "");
  const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function callServer(path, { method = "GET", auth = "client", body = null, query = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const url = buildUrl(path, query);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: headersFor(auth, Boolean(body)),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { text };
      }
    }
    if (!response.ok) {
      const message = parsed?.message || parsed?.error || text || `HTTP ${response.status}`;
      throw new Error(`${method} ${url.pathname} failed: ${message}`);
    }
    return parsed ?? { ok: true };
  } finally {
    clearTimeout(timer);
  }
}

function decodeFileItem(item) {
  if (!item?.ok || typeof item.contentBase64 !== "string") return item;
  const bytes = Buffer.from(item.contentBase64, "base64");
  const looksText = !bytes.includes(0);
  const decoded = {
    ...item,
    contentBase64: undefined,
    contentEncoding: "utf8",
    truncated: bytes.length > MAX_TEXT_BYTES,
  };
  if (!looksText) {
    return { ...item, contentEncoding: "base64", binary: true };
  }
  decoded.content = bytes.subarray(0, MAX_TEXT_BYTES).toString("utf8");
  return decoded;
}

function encodeWrite(write) {
  if (!write || typeof write !== "object") return write;
  if (typeof write.contentBase64 === "string") return write;
  if (typeof write.content === "string") {
    const { content, ...rest } = write;
    return { ...rest, contentBase64: Buffer.from(content, "utf8").toString("base64") };
  }
  return write;
}

async function matterhornStatus() {
  const [health, status, capabilities] = await Promise.allSettled([
    callServer("/health", { auth: "none" }),
    callServer("/status"),
    callServer("/capabilities"),
  ]);
  const unwrap = (result) => result.status === "fulfilled" ? result.value : { ok: false, error: result.reason?.message || "unavailable" };
  return {
    serverUrl: SERVER,
    health: unwrap(health),
    status: unwrap(status),
    capabilities: unwrap(capabilities),
  };
}

async function handleTool(name, args = {}) {
  switch (name) {
    case "matterhorn_status":
      return matterhornStatus();
    case "matterhorn_list_workspaces":
      return callServer("/workspaces");
    case "matterhorn_create_file_session":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/files/sessions`, {
        method: "POST",
        body: { write: args.readOnly === true ? false : true, ttlSeconds: args.ttlSeconds },
      });
    case "matterhorn_file_catalog":
      return callServer(`/files/sessions/${encodeURIComponent(args.sessionId)}/catalog/snapshot`, {
        query: {
          prefix: args.prefix,
          after: args.after,
          limit: args.limit,
          includeDirs: args.includeDirs,
        },
      });
    case "matterhorn_read_files": {
      const result = await callServer(`/files/sessions/${encodeURIComponent(args.sessionId)}/read-batch`, {
        method: "POST",
        body: { paths: args.paths },
      });
      return { ...result, items: Array.isArray(result.items) ? result.items.map(decodeFileItem) : result.items };
    }
    case "matterhorn_write_files":
      return callServer(`/files/sessions/${encodeURIComponent(args.sessionId)}/write-batch`, {
        method: "POST",
        body: { writes: (args.writes || []).map(encodeWrite) },
      });
    case "matterhorn_close_file_session":
      return callServer(`/files/sessions/${encodeURIComponent(args.sessionId)}`, { method: "DELETE" });
    case "matterhorn_list_approvals":
      return callServer("/approvals", { auth: "host" });
    case "matterhorn_reply_approval":
      return callServer(`/approvals/${encodeURIComponent(args.approvalId)}`, {
        method: "POST",
        auth: "host",
        body: { reply: args.reply === "allow" ? "allow" : "deny" },
      });
    case "matterhorn_bittensor_chat":
      return callServer("/api/bittensor/chat/execute", { method: "POST", body: args });
    case "matterhorn_bittensor_readiness":
      return callServer("/api/bittensor/readiness");
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      void handleMessage(JSON.parse(trimmed));
    } catch {
      process.stderr.write(`MCP parse error: ${trimmed.slice(0, 200)}\n`);
    }
  }
});

async function handleMessage(msg) {
  const { method, id } = msg;
  switch (method) {
    case "initialize":
      return process.stdout.write(jsonRpc(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "matterhorn-work-mcp", version: "0.1.0" },
      }));
    case "notifications/initialized":
      return;
    case "tools/list":
      return process.stdout.write(jsonRpc(id, { tools }));
    case "tools/call": {
      const { name, arguments: args } = msg.params ?? {};
      try {
        const result = await handleTool(name, args ?? {});
        return process.stdout.write(jsonRpc(id, textResult(result)));
      } catch (error) {
        return process.stdout.write(jsonRpcError(id, -32000, error?.message || `${name} failed`));
      }
    }
    default:
      process.stderr.write(`MCP unknown method: ${method}\n`);
  }
}

process.stderr.write("Matterhorn Work MCP Server v0.1.0 ready\n");
