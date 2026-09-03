#!/usr/bin/env node

/**
 * A deliberately small external-client boundary for Matterhorn.
 *
 * This executable must remain dependency-free and must not import the broad
 * operator MCP. Account clients can ask Matterhorn to run guarded coworker
 * sessions; they cannot construct server policy or reach wallet authority.
 */

const PACKAGE_VERSION = "0.1.0";
const SERVER_INFO_NAME = "matterhorn-guarded-mcp";

function positiveEnvironmentInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    process.stderr.write(`${name} must be an integer from ${minimum} to ${maximum}.\n`);
    process.exit(64);
  }
  return parsed;
}

function serverOrigin() {
  const raw = process.env.MATTERHORN_WORK_SERVER_URL
    || process.env.MATTERHORN_SERVER_URL
    || process.env.OPENWORK_SERVER_URL
    || "http://127.0.0.1:8787";
  try {
    const parsed = new URL(raw);
    if (
      !["http:", "https:"].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || (parsed.pathname !== "" && parsed.pathname !== "/")
    ) {
      throw new Error("invalid origin");
    }
    return parsed.origin;
  } catch {
    process.stderr.write("MATTERHORN_WORK_SERVER_URL must be an HTTP(S) origin without credentials, path, query, or fragment.\n");
    process.exit(64);
  }
}

const LEGACY_PROFILE = String(process.env.MATTERHORN_WORK_MCP_PROFILE || "guarded_client")
  .trim()
  .toLowerCase();
if (!["guarded", "guarded_client"].includes(LEGACY_PROFILE)) {
  process.stderr.write("Matterhorn Guarded MCP cannot enable a broader tool profile.\n");
  process.exit(64);
}

const SERVER = serverOrigin();
const CLIENT_TOKEN = process.env.MATTERHORN_WORK_TOKEN
  || process.env.OPENWORK_TOKEN
  || process.env.MATTERHORN_TOKEN
  || "";
const REQUEST_TIMEOUT_MS = positiveEnvironmentInteger(
  "MATTERHORN_WORK_MCP_TIMEOUT_MS",
  15_000,
  250,
  120_000,
);
const MAX_RESPONSE_BYTES = positiveEnvironmentInteger(
  "MATTERHORN_WORK_MCP_MAX_RESPONSE_BYTES",
  1_048_576,
  16_384,
  4_194_304,
);
const MAX_INPUT_BYTES = positiveEnvironmentInteger(
  "MATTERHORN_WORK_MCP_MAX_INPUT_BYTES",
  524_288,
  16_384,
  1_048_576,
);

const objectSchema = (properties = {}, required = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const string = (description) => ({ type: "string", ...(description ? { description } : {}) });
const number = (description) => ({ type: "number", ...(description ? { description } : {}) });
const boolean = (description) => ({ type: "boolean", ...(description ? { description } : {}) });

const tools = [
  {
    name: "matterhorn_status",
    description: "Check Matterhorn service readiness without exposing configuration or host details.",
    inputSchema: objectSchema(),
  },
  {
    name: "matterhorn_list_workspaces",
    description: "List only the Matterhorn workspaces visible to this account token.",
    inputSchema: objectSchema(),
  },
  {
    name: "matterhorn_create_session",
    description: "Create a chat session in an authorized Matterhorn workspace.",
    inputSchema: objectSchema({
      workspaceId: string(),
      title: string("Optional initial session title."),
    }, ["workspaceId"]),
  },
  {
    name: "matterhorn_list_sessions",
    description: "List chat sessions in an authorized Matterhorn workspace.",
    inputSchema: objectSchema({
      workspaceId: string(),
      roots: boolean("Include root sessions when supported."),
      start: number("Non-negative pagination offset."),
      search: string("Optional search filter."),
      limit: number("Positive item limit."),
    }, ["workspaceId"]),
  },
  {
    name: "matterhorn_get_session",
    description: "Read one authorized Matterhorn chat session.",
    inputSchema: objectSchema({ workspaceId: string(), sessionId: string() }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_get_session_messages",
    description: "Read messages from one authorized Matterhorn chat session.",
    inputSchema: objectSchema({
      workspaceId: string(),
      sessionId: string(),
      limit: number("Positive message limit."),
    }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_submit_session_prompt",
    description: "Submit a request through Matterhorn's authoritative privacy, usage, coworker, and tool-policy gateway.",
    inputSchema: objectSchema({
      workspaceId: string(),
      sessionId: string(),
      message: string("Plain user request."),
      parts: { type: "array", description: "Structured user message parts verified by Matterhorn." },
      messageID: string("Optional client message identifier."),
      model: {
        type: "object",
        description: "Optional provider and model selection.",
        properties: { providerID: string(), modelID: string() },
        required: ["providerID", "modelID"],
        additionalProperties: false,
      },
      agentId: string("Optional Matterhorn agent selected for this request."),
      coworkerId: string("Optional approved coworker selected for this request."),
      attachmentIds: { type: "array", items: string(), description: "Workspace attachment ids selected for this request." },
      agentFileIds: { type: "array", items: string(), description: "Encrypted Agent File ids approved for the selected coworker." },
      memoryIds: { type: "array", items: string(), description: "Matterhorn Memory ids selected for this request." },
      privacyMode: {
        type: "string",
        enum: ["public_research", "private_workspace", "transaction"],
        description: "Requested privacy mode. Matterhorn may only escalate sensitivity.",
      },
      executionMode: {
        type: "string",
        enum: ["discuss", "plan", "work"],
        description: "Requested execution mode. Server policy remains authoritative.",
      },
      variant: string("Optional prompt variant."),
      noReply: boolean("Queue the user message without asking for an engine reply."),
      reasoningEffort: string("Optional reasoning-effort hint."),
      reasoning_effort: string("Optional snake-case reasoning-effort hint."),
    }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_get_session_status",
    description: "Read bounded execution status for one authorized session.",
    inputSchema: objectSchema({ workspaceId: string(), sessionId: string() }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_watch_session_events",
    description: "Read a bounded batch of authorized session progress events.",
    inputSchema: objectSchema({
      workspaceId: string(),
      sessionId: string(),
      maxEvents: number("Positive event cap, limited to 50."),
      snapshot: boolean("Request an initial session snapshot event."),
      details: boolean("Include bounded snapshot detail events."),
      since: string("Optional reconnect cursor."),
      limit: number("Optional message limit for the initial snapshot."),
      heartbeatMs: number("Optional bounded stream heartbeat interval."),
    }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_get_session_snapshot",
    description: "Read a bounded combined session, message, task, and status snapshot.",
    inputSchema: objectSchema({
      workspaceId: string(),
      sessionId: string(),
      limit: number("Positive message limit."),
    }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_delete_session",
    description: "Delete one authorized Matterhorn chat session.",
    inputSchema: objectSchema({ workspaceId: string(), sessionId: string() }, ["workspaceId", "sessionId"]),
  },
];

const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

function jsonRpc(id, result) {
  return `${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`;
}

function jsonRpcError(id, code, message) {
  return `${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`;
}

function textResult(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text", text }] };
}

function typeMatches(value, expected) {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expected;
}

function validateArguments(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Matterhorn tool arguments must be an object.");
  }
  const schema = tool.inputSchema;
  const allowed = new Set(Object.keys(schema.properties || {}));
  if (Object.keys(args).some((name) => !allowed.has(name))) {
    throw new Error("This argument is not available in the Matterhorn Guarded MCP.");
  }
  for (const name of schema.required || []) {
    if (!(name in args)) throw new Error(`Missing required Matterhorn argument: ${name}.`);
  }
  for (const [name, value] of Object.entries(args)) {
    const property = schema.properties[name];
    if (!typeMatches(value, property.type)) {
      throw new Error(`Matterhorn argument has the wrong type: ${name}.`);
    }
    if (property.enum && !property.enum.includes(value)) {
      throw new Error(`Matterhorn argument is not an allowed value: ${name}.`);
    }
    if (property.type === "object") {
      const nestedAllowed = new Set(Object.keys(property.properties || {}));
      if (Object.keys(value).some((key) => !nestedAllowed.has(key))) {
        throw new Error(`Matterhorn argument contains an unsupported field: ${name}.`);
      }
      for (const required of property.required || []) {
        if (!(required in value) || !typeMatches(value[required], property.properties[required].type)) {
          throw new Error(`Matterhorn argument is missing a valid field: ${name}.${required}.`);
        }
      }
    }
    if (property.type === "array" && property.items?.type) {
      if (value.some((item) => !typeMatches(item, property.items.type))) {
        throw new Error(`Matterhorn argument contains an invalid item: ${name}.`);
      }
    }
  }
}

function requireClientToken() {
  if (!CLIENT_TOKEN) throw new Error("MATTERHORN_WORK_TOKEN is required for Matterhorn account tools.");
}

function buildUrl(path, query = null) {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, `${SERVER}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readBoundedText(response) {
  const declared = Number.parseInt(response.headers.get("content-length") || "0", 10);
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new Error("Matterhorn response exceeded the guarded size limit.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Matterhorn response exceeded the guarded size limit.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function parseResponse(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const SAFE_SERVER_ERRORS = new Map([
  ["provider_privacy_unverified", "This request needs privacy review in Matterhorn before it can be sent."],
  ["consent_required", "This request needs one-time privacy review in Matterhorn before it can be sent."],
  ["secret_detected", "Matterhorn blocked credential or signing material before provider contact."],
  ["model_usage_exceeded", "This workspace has reached its current model-usage allowance."],
  ["hosted_operation_not_allowed", "This operation is not available to hosted account clients."],
  ["wallet_airlock_required", "Continue in Matterhorn's connected-wallet review to approve this action."],
]);

function safeServerError(status, parsed) {
  const candidate = typeof parsed?.code === "string"
    ? parsed.code
    : typeof parsed?.error?.code === "string"
      ? parsed.error.code
      : "";
  const code = /^[a-z][a-z0-9_]{1,63}$/.test(candidate) ? candidate : "request_failed";
  if (status === 401 || status === 403) {
    return "Matterhorn denied this account-scoped request. Check the account connection in Matterhorn.";
  }
  return SAFE_SERVER_ERRORS.get(code) || `Matterhorn request failed (${code}, HTTP ${status}).`;
}

async function callServer(path, { method = "GET", body = null, query = null, accept = null, auth = true } = {}) {
  if (auth) requireClientToken();
  const url = buildUrl(path, query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = {};
    if (auth) headers.Authorization = `Bearer ${CLIENT_TOKEN}`;
    if (body !== null) headers["Content-Type"] = "application/json";
    if (accept) headers.Accept = accept;
    const response = await fetch(url, {
      method,
      headers,
      signal: controller.signal,
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    });
    const text = await readBoundedText(response);
    const parsed = parseResponse(text);
    if (!response.ok) throw new Error(safeServerError(response.status, parsed));
    if (text && parsed === null) throw new Error("Matterhorn returned an invalid guarded response.");
    return parsed ?? { ok: true };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Matterhorn request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parsePositiveInteger(value, fallback, maximum, label) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`);
  return Math.min(value, maximum);
}

function parseSseEvents(text) {
  return text
    .trim()
    .split(/\n\n+/)
    .filter(Boolean)
    .map((block) => {
      const event = {};
      for (const line of block.split("\n")) {
        if (line.startsWith("id: ")) event.id = line.slice(4);
        if (line.startsWith("event: ")) event.event = line.slice(7);
        if (line.startsWith("data: ")) {
          const raw = line.slice(6);
          try { event.data = JSON.parse(raw); } catch { event.data = raw; }
        }
      }
      return event;
    });
}

async function callSessionEventStream(args) {
  const maxEvents = parsePositiveInteger(args.maxEvents, 10, 50, "maxEvents");
  const url = buildUrl(
    `/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/events`,
    {
      maxEvents,
      snapshot: args.snapshot,
      details: args.details,
      since: args.since,
      limit: args.limit,
      heartbeatMs: args.heartbeatMs,
    },
  );
  requireClientToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${CLIENT_TOKEN}`, Accept: "text/event-stream" },
      signal: controller.signal,
    });
    const text = await readBoundedText(response);
    if (!response.ok) throw new Error(safeServerError(response.status, parseResponse(text)));
    const events = parseSseEvents(text);
    const last = events.at(-1);
    const lastCursor = last?.id ?? last?.data?.cursor ?? null;
    return {
      ok: true,
      workspaceId: args.workspaceId,
      sessionId: args.sessionId,
      maxEvents,
      events,
      count: events.length,
      lastCursor,
      nextSince: lastCursor,
    };
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Matterhorn event request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function status() {
  const health = await callServer("/health", { auth: false });
  requireClientToken();
  const [serviceStatus, capabilities] = await Promise.all([
    callServer("/status"),
    callServer("/capabilities"),
  ]);
  return { serverUrl: SERVER, health, status: serviceStatus, capabilities };
}

async function handleTool(name, args) {
  switch (name) {
    case "matterhorn_status":
      return status();
    case "matterhorn_list_workspaces":
      return callServer("/workspaces");
    case "matterhorn_create_session":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions`, {
        method: "POST",
        body: typeof args.title === "string" ? { title: args.title } : {},
      });
    case "matterhorn_list_sessions":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions`, {
        query: { roots: args.roots, start: args.start, search: args.search, limit: args.limit },
      });
    case "matterhorn_get_session":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}`);
    case "matterhorn_get_session_messages":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/messages`, {
        query: { limit: args.limit },
      });
    case "matterhorn_submit_session_prompt": {
      const body = {};
      for (const key of [
        "message", "parts", "messageID", "model", "agentId", "coworkerId",
        "attachmentIds", "agentFileIds", "memoryIds", "privacyMode",
        "executionMode", "variant", "noReply", "reasoningEffort", "reasoning_effort",
      ]) {
        if (args[key] !== undefined) body[key] = args[key];
      }
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/messages`, {
        method: "POST",
        body,
      });
    }
    case "matterhorn_get_session_status":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/status`);
    case "matterhorn_watch_session_events":
      return callSessionEventStream(args);
    case "matterhorn_get_session_snapshot":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}/snapshot`, {
        query: { limit: args.limit },
      });
    case "matterhorn_delete_session":
      return callServer(`/workspace/${encodeURIComponent(args.workspaceId)}/sessions/${encodeURIComponent(args.sessionId)}`, { method: "DELETE" });
    default:
      throw new Error("Tool is not available in the Matterhorn Guarded MCP.");
  }
}

let inputBuffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  if (Buffer.byteLength(inputBuffer, "utf8") > MAX_INPUT_BYTES) {
    inputBuffer = "";
    process.stderr.write("Matterhorn Guarded MCP input exceeded the size limit.\n");
    return;
  }
  const lines = inputBuffer.split("\n");
  inputBuffer = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      void handleMessage(JSON.parse(trimmed));
    } catch {
      process.stderr.write("Matterhorn Guarded MCP received invalid JSON.\n");
    }
  }
});

async function handleMessage(message) {
  const { id, method } = message;
  if (method === "initialize") {
    process.stdout.write(jsonRpc(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_INFO_NAME, version: PACKAGE_VERSION },
    }));
    return;
  }
  if (method === "notifications/initialized") return;
  if (method === "tools/list") {
    process.stdout.write(jsonRpc(id, { tools }));
    return;
  }
  if (method === "tools/call") {
    const name = message.params?.name;
    const tool = toolByName.get(name);
    if (!tool) {
      process.stdout.write(jsonRpcError(id, -32601, "Tool is not available in the Matterhorn Guarded MCP."));
      return;
    }
    try {
      const args = message.params?.arguments ?? {};
      validateArguments(tool, args);
      const result = await handleTool(name, args);
      process.stdout.write(jsonRpc(id, textResult(result)));
    } catch (error) {
      process.stdout.write(jsonRpcError(id, -32000, error?.message || "Matterhorn guarded request failed."));
    }
    return;
  }
  if (id !== undefined) {
    process.stdout.write(jsonRpcError(id, -32601, "Method is not available in the Matterhorn Guarded MCP."));
  }
}

process.stderr.write(`Matterhorn Guarded MCP v${PACKAGE_VERSION} ready (11 account-scoped tools).\n`);
