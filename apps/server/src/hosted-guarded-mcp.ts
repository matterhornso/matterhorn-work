const JSON_RPC_VERSION = "2.0";
const JSON_CONTENT_TYPE = "application/json";
const EVENT_STREAM_CONTENT_TYPE = "text/event-stream";
const MAX_TOOL_TEXT_BYTES = 1_048_576;

export const HOSTED_GUARDED_MCP_PROTOCOL_VERSION = "2025-11-25";
export const HOSTED_GUARDED_MCP_SUPPORTED_PROTOCOL_VERSIONS = new Set([
  HOSTED_GUARDED_MCP_PROTOCOL_VERSION,
  "2025-06-18",
  "2025-03-26",
]);

type JsonSchema = {
  type: string;
  description?: string;
  enum?: readonly string[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
};

export type HostedGuardedMcpTool = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

const objectSchema = (
  properties: Record<string, JsonSchema> = {},
  required: readonly string[] = [],
): JsonSchema => ({
  type: "object",
  properties,
  ...(required.length > 0 ? { required } : {}),
  additionalProperties: false,
});
const stringSchema = (description?: string): JsonSchema => ({
  type: "string",
  ...(description ? { description } : {}),
});
const numberSchema = (description?: string): JsonSchema => ({
  type: "number",
  ...(description ? { description } : {}),
});
const booleanSchema = (description?: string): JsonSchema => ({
  type: "boolean",
  ...(description ? { description } : {}),
});

export const HOSTED_GUARDED_MCP_TOOLS: readonly HostedGuardedMcpTool[] = [
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
      workspaceId: stringSchema(),
      title: stringSchema("Optional initial session title."),
    }, ["workspaceId"]),
  },
  {
    name: "matterhorn_list_sessions",
    description: "List chat sessions in an authorized Matterhorn workspace.",
    inputSchema: objectSchema({
      workspaceId: stringSchema(),
      roots: booleanSchema("Include root sessions when supported."),
      start: numberSchema("Non-negative pagination offset."),
      search: stringSchema("Optional search filter."),
      limit: numberSchema("Positive item limit."),
    }, ["workspaceId"]),
  },
  {
    name: "matterhorn_get_session",
    description: "Read one authorized Matterhorn chat session.",
    inputSchema: objectSchema({
      workspaceId: stringSchema(),
      sessionId: stringSchema(),
    }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_get_session_messages",
    description: "Read messages from one authorized Matterhorn chat session.",
    inputSchema: objectSchema({
      workspaceId: stringSchema(),
      sessionId: stringSchema(),
      limit: numberSchema("Positive message limit."),
    }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_submit_session_prompt",
    description: "Submit a request through Matterhorn's authoritative privacy, usage, coworker, and tool-policy gateway.",
    inputSchema: objectSchema({
      workspaceId: stringSchema(),
      sessionId: stringSchema(),
      message: stringSchema("Plain user request."),
      parts: { type: "array", description: "Structured user message parts verified by Matterhorn." },
      messageID: stringSchema("Optional client message identifier."),
      model: {
        ...objectSchema({ providerID: stringSchema(), modelID: stringSchema() }, ["providerID", "modelID"]),
        description: "Optional provider and model selection.",
      },
      agentId: stringSchema("Optional Matterhorn agent selected for this request."),
      coworkerId: stringSchema("Optional approved coworker selected for this request."),
      attachmentIds: { type: "array", items: stringSchema(), description: "Workspace attachment ids selected for this request." },
      agentFileIds: { type: "array", items: stringSchema(), description: "Encrypted Agent File ids approved for the selected coworker." },
      memoryIds: { type: "array", items: stringSchema(), description: "Matterhorn Memory ids selected for this request." },
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
      variant: stringSchema("Optional prompt variant."),
      noReply: booleanSchema("Queue the user message without asking for an engine reply."),
      reasoningEffort: stringSchema("Optional reasoning-effort hint."),
      reasoning_effort: stringSchema("Optional snake-case reasoning-effort hint."),
    }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_get_session_status",
    description: "Read bounded execution status for one authorized session.",
    inputSchema: objectSchema({ workspaceId: stringSchema(), sessionId: stringSchema() }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_watch_session_events",
    description: "Read a bounded batch of authorized session progress events.",
    inputSchema: objectSchema({
      workspaceId: stringSchema(),
      sessionId: stringSchema(),
      maxEvents: numberSchema("Positive event cap, limited to 50."),
      snapshot: booleanSchema("Request an initial session snapshot event."),
      details: booleanSchema("Include bounded snapshot detail events."),
      since: stringSchema("Optional reconnect cursor."),
      limit: numberSchema("Optional message limit for the initial snapshot."),
      heartbeatMs: numberSchema("Optional bounded stream heartbeat interval."),
    }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_get_session_snapshot",
    description: "Read a bounded combined session, message, task, and status snapshot.",
    inputSchema: objectSchema({
      workspaceId: stringSchema(),
      sessionId: stringSchema(),
      limit: numberSchema("Positive message limit."),
    }, ["workspaceId", "sessionId"]),
  },
  {
    name: "matterhorn_delete_session",
    description: "Delete one authorized Matterhorn chat session.",
    inputSchema: objectSchema({ workspaceId: stringSchema(), sessionId: stringSchema() }, ["workspaceId", "sessionId"]),
  },
] as const;

const toolByName = new Map(HOSTED_GUARDED_MCP_TOOLS.map((tool) => [tool.name, tool]));

export type HostedGuardedMcpInvocation = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  accept?: "application/json" | "text/event-stream";
};

export type HostedGuardedMcpInvoker = (
  invocation: HostedGuardedMcpInvocation,
) => Promise<unknown>;

export class HostedGuardedMcpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedGuardedMcpToolError";
  }
}

type JsonRpcId = string | number | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validJsonRpcId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function jsonRpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: JSON_RPC_VERSION, id, result });
}

function jsonRpcError(id: JsonRpcId, code: number, message: string, status = 200): Response {
  return jsonResponse({ jsonrpc: JSON_RPC_VERSION, id, error: { code, message } }, status);
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function acceptedMediaTypes(request: Request): Set<string> {
  return new Set(
    (request.headers.get("accept") ?? "")
      .split(",")
      .map((part) => part.split(";", 1)[0]?.trim().toLowerCase())
      .filter((part): part is string => Boolean(part)),
  );
}

function validateTransportHeaders(request: Request, method: string | null): Response | null {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== JSON_CONTENT_TYPE) {
    return jsonRpcError(null, -32600, "Matterhorn MCP requires an application/json request.", 415);
  }
  const accept = acceptedMediaTypes(request);
  if (!accept.has(JSON_CONTENT_TYPE) || !accept.has(EVENT_STREAM_CONTENT_TYPE)) {
    return jsonRpcError(null, -32600, "Matterhorn MCP clients must accept JSON and event streams.", 406);
  }
  if (method !== "initialize") {
    const version = request.headers.get("mcp-protocol-version")?.trim() || "2025-03-26";
    if (!HOSTED_GUARDED_MCP_SUPPORTED_PROTOCOL_VERSIONS.has(version)) {
      return jsonRpcError(null, -32600, "Unsupported MCP protocol version.", 400);
    }
  }
  return null;
}

function typeMatches(value: unknown, expected: string): boolean {
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return isRecord(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expected;
}

function validateArguments(tool: HostedGuardedMcpTool, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new HostedGuardedMcpToolError("Matterhorn tool arguments must be an object.");
  }
  const properties = tool.inputSchema.properties ?? {};
  const allowed = new Set(Object.keys(properties));
  if (Object.keys(value).some((name) => !allowed.has(name))) {
    throw new HostedGuardedMcpToolError("This argument is not available in the Matterhorn Guarded MCP.");
  }
  for (const name of tool.inputSchema.required ?? []) {
    if (!hasOwn(value, name)) {
      throw new HostedGuardedMcpToolError(`Missing required Matterhorn argument: ${name}.`);
    }
  }
  for (const [name, item] of Object.entries(value)) {
    const property = properties[name];
    if (!property || !typeMatches(item, property.type)) {
      throw new HostedGuardedMcpToolError(`Matterhorn argument has the wrong type: ${name}.`);
    }
    if (property.enum && !property.enum.includes(item as string)) {
      throw new HostedGuardedMcpToolError(`Matterhorn argument is not an allowed value: ${name}.`);
    }
    if (property.type === "object" && isRecord(item)) {
      const nestedProperties = property.properties ?? {};
      const nestedAllowed = new Set(Object.keys(nestedProperties));
      if (Object.keys(item).some((key) => !nestedAllowed.has(key))) {
        throw new HostedGuardedMcpToolError(`Matterhorn argument contains an unsupported field: ${name}.`);
      }
      for (const required of property.required ?? []) {
        const nested = item[required];
        if (!hasOwn(item, required) || !typeMatches(nested, nestedProperties[required]?.type ?? "never")) {
          throw new HostedGuardedMcpToolError(`Matterhorn argument is missing a valid field: ${name}.${required}.`);
        }
      }
    }
    if (property.type === "array" && Array.isArray(item)) {
      if (item.length > 64) {
        throw new HostedGuardedMcpToolError(`Matterhorn argument has too many items: ${name}.`);
      }
      if (property.items?.type && item.some((entry) => !typeMatches(entry, property.items?.type ?? "never"))) {
        throw new HostedGuardedMcpToolError(`Matterhorn argument contains an invalid item: ${name}.`);
      }
    }
  }
  return value;
}

function requiredString(args: Record<string, unknown>, name: string): string {
  const value = typeof args[name] === "string" ? args[name].trim() : "";
  if (!value || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new HostedGuardedMcpToolError(`Matterhorn argument is invalid: ${name}.`);
  }
  return value;
}

function optionalPositiveInteger(
  args: Record<string, unknown>,
  name: string,
  maximum: number,
): number | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new HostedGuardedMcpToolError(`${name} must be a positive integer.`);
  }
  return Math.min(value as number, maximum);
}

function optionalNonNegativeInteger(
  args: Record<string, unknown>,
  name: string,
): number | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new HostedGuardedMcpToolError(`${name} must be a non-negative integer.`);
  }
  return value as number;
}

function workspacePath(args: Record<string, unknown>, suffix = ""): string {
  return `/workspace/${encodeURIComponent(requiredString(args, "workspaceId"))}${suffix}`;
}

function sessionPath(args: Record<string, unknown>, suffix = ""): string {
  return workspacePath(args, `/sessions/${encodeURIComponent(requiredString(args, "sessionId"))}${suffix}`);
}

function promptBody(args: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of [
    "message", "parts", "messageID", "model", "agentId", "coworkerId",
    "attachmentIds", "agentFileIds", "memoryIds", "privacyMode",
    "executionMode", "variant", "noReply", "reasoningEffort", "reasoning_effort",
  ]) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  return body;
}

async function invokeTool(
  name: string,
  args: Record<string, unknown>,
  invoke: HostedGuardedMcpInvoker,
): Promise<unknown> {
  switch (name) {
    case "matterhorn_status": {
      const [readiness, workspaceAccess] = await Promise.all([
        invoke({ method: "GET", path: "/health/ready" }),
        invoke({ method: "GET", path: "/workspaces" }),
      ]);
      const workspaces = isRecord(workspaceAccess) && Array.isArray(workspaceAccess.items)
        ? workspaceAccess.items.length
        : 0;
      return { readiness, accountAccess: true, workspaceCount: workspaces };
    }
    case "matterhorn_list_workspaces":
      return invoke({ method: "GET", path: "/workspaces" });
    case "matterhorn_create_session": {
      const title = typeof args.title === "string" && args.title.trim()
        ? args.title.trim().slice(0, 512)
        : undefined;
      return invoke({
        method: "POST",
        path: workspacePath(args, "/sessions"),
        body: title ? { title } : {},
      });
    }
    case "matterhorn_list_sessions":
      return invoke({
        method: "GET",
        path: workspacePath(args, "/sessions"),
        query: {
          roots: typeof args.roots === "boolean" ? args.roots : undefined,
          start: optionalNonNegativeInteger(args, "start"),
          search: typeof args.search === "string" ? args.search.slice(0, 512) : undefined,
          limit: optionalPositiveInteger(args, "limit", 500),
        },
      });
    case "matterhorn_get_session":
      return invoke({ method: "GET", path: sessionPath(args) });
    case "matterhorn_get_session_messages":
      return invoke({
        method: "GET",
        path: sessionPath(args, "/messages"),
        query: { limit: optionalPositiveInteger(args, "limit", 500) },
      });
    case "matterhorn_submit_session_prompt":
      return invoke({
        method: "POST",
        path: sessionPath(args, "/messages"),
        body: promptBody(args),
      });
    case "matterhorn_get_session_status":
      return invoke({ method: "GET", path: sessionPath(args, "/status") });
    case "matterhorn_watch_session_events":
      return invoke({
        method: "GET",
        path: sessionPath(args, "/events"),
        query: {
          maxEvents: optionalPositiveInteger(args, "maxEvents", 50) ?? 1,
          snapshot: typeof args.snapshot === "boolean" ? args.snapshot : undefined,
          details: typeof args.details === "boolean" ? args.details : undefined,
          since: typeof args.since === "string" ? args.since.slice(0, 512) : undefined,
          limit: optionalPositiveInteger(args, "limit", 500),
          heartbeatMs: optionalPositiveInteger(args, "heartbeatMs", 120_000),
        },
        accept: "text/event-stream",
      });
    case "matterhorn_get_session_snapshot":
      return invoke({
        method: "GET",
        path: sessionPath(args, "/snapshot"),
        query: { limit: optionalPositiveInteger(args, "limit", 500) },
      });
    case "matterhorn_delete_session":
      return invoke({ method: "DELETE", path: sessionPath(args) });
    default:
      throw new HostedGuardedMcpToolError("Tool is not available in the Matterhorn Guarded MCP.");
  }
}

function textToolResult(value: unknown): { content: Array<{ type: "text"; text: string }> } {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (Buffer.byteLength(text, "utf8") > MAX_TOOL_TEXT_BYTES) {
    throw new HostedGuardedMcpToolError("Matterhorn response exceeded the guarded size limit.");
  }
  return { content: [{ type: "text", text }] };
}

function safeToolFailure(error: unknown): string {
  return error instanceof HostedGuardedMcpToolError
    ? error.message
    : "Matterhorn could not complete this guarded request.";
}

function initializeResult(serverVersion: string): Record<string, unknown> {
  return {
    protocolVersion: HOSTED_GUARDED_MCP_PROTOCOL_VERSION,
    capabilities: { tools: {} },
    serverInfo: {
      name: "matterhorn-hosted-guarded-mcp",
      version: serverVersion,
    },
    instructions: "Use these account-scoped chat tools only. Wallet signing, submission, shell, plugins, and server settings are unavailable.",
  };
}

export async function handleHostedGuardedMcpPost(input: {
  request: Request;
  payload: unknown;
  invoke: HostedGuardedMcpInvoker;
  serverVersion: string;
}): Promise<Response> {
  const { request, payload, invoke, serverVersion } = input;
  const method = isRecord(payload) && typeof payload.method === "string" ? payload.method : null;
  const invalidHeaders = validateTransportHeaders(request, method);
  if (invalidHeaders) return invalidHeaders;

  if (!isRecord(payload)) {
    return jsonRpcError(null, -32600, "Matterhorn MCP requires one JSON-RPC object.");
  }
  if (payload.jsonrpc !== JSON_RPC_VERSION) {
    return jsonRpcError(null, -32600, "Invalid JSON-RPC request.");
  }

  const hasId = hasOwn(payload, "id");
  if (hasId && !validJsonRpcId(payload.id)) {
    return jsonRpcError(null, -32600, "Invalid JSON-RPC request id.");
  }
  const id: JsonRpcId = hasId ? payload.id as JsonRpcId : null;

  // This stateless server never issues requests to the client. Valid client
  // responses therefore have no side effects and are acknowledged only.
  if (typeof payload.method !== "string") {
    if (hasOwn(payload, "result") || hasOwn(payload, "error")) {
      return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    return jsonRpcError(id, -32600, "Invalid JSON-RPC request.");
  }

  if (!hasId) {
    // Notifications never receive JSON-RPC responses. Only initialized is
    // meaningful to this stateless transport; all others are safely ignored.
    return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  if (payload.params !== undefined && !isRecord(payload.params)) {
    return jsonRpcError(id, -32602, "Invalid MCP parameters.");
  }

  if (payload.method === "initialize") {
    const params = payload.params;
    if (
      !isRecord(params)
      || typeof params.protocolVersion !== "string"
      || !isRecord(params.capabilities)
      || !isRecord(params.clientInfo)
      || typeof params.clientInfo.name !== "string"
      || typeof params.clientInfo.version !== "string"
    ) {
      return jsonRpcError(id, -32602, "Invalid MCP initialization parameters.");
    }
    return jsonRpcResult(id, initializeResult(serverVersion));
  }

  if (payload.method === "ping") {
    return jsonRpcResult(id, {});
  }

  if (payload.method === "tools/list") {
    return jsonRpcResult(id, { tools: HOSTED_GUARDED_MCP_TOOLS });
  }

  if (payload.method === "tools/call") {
    const params = payload.params;
    if (!isRecord(params) || typeof params.name !== "string") {
      return jsonRpcError(id, -32602, "A Matterhorn tool name is required.");
    }
    const tool = toolByName.get(params.name);
    if (!tool) {
      return jsonRpcError(id, -32601, "Tool is not available in the Matterhorn Guarded MCP.");
    }
    let args: Record<string, unknown>;
    try {
      args = validateArguments(tool, params.arguments ?? {});
    } catch (error) {
      return jsonRpcError(id, -32602, safeToolFailure(error));
    }
    try {
      const result = await invokeTool(tool.name, args, invoke);
      return jsonRpcResult(id, textToolResult(result));
    } catch (error) {
      return jsonRpcResult(id, {
        isError: true,
        content: [{ type: "text", text: safeToolFailure(error) }],
      });
    }
  }

  return jsonRpcError(id, -32601, "Method is not available in the Matterhorn Guarded MCP.");
}

export function hostedGuardedMcpMethodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: "POST",
      "Cache-Control": "no-store",
    },
  });
}

export function hostedGuardedMcpParseError(): Response {
  return jsonRpcError(null, -32700, "Invalid JSON.", 400);
}
