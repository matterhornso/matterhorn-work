const objectSchema = (properties = {}, required = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const string = (description) => ({ type: "string", ...(description ? { description } : {}) });
const number = (description) => ({ type: "number", ...(description ? { description } : {}) });
const boolean = (description) => ({ type: "boolean", ...(description ? { description } : {}) });

export const tools = [
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
