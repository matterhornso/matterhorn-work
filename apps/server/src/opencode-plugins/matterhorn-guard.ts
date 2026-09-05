import { MATTERHORN_CRYPTO_COMPACTION_CONTEXT } from "../opencode-compaction-policy.js";

type PluginContext = {
  directory?: string;
};

type ToolHookInput = {
  tool: string;
  sessionID: string;
  callID: string;
  messageID?: string;
};

type ToolHookOutput = {
  args: Record<string, unknown>;
};

type SystemHookInput = {
  sessionID: string;
  model: {
    providerID: string;
    id?: string;
    modelID?: string;
  };
};

type SystemHookOutput = {
  system: string[];
};

type MessagesHookOutput = {
  messages: unknown[];
};

type OpenCodeEvent = {
  type?: string;
  properties?: Record<string, unknown>;
};

type AssistantUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
};

const CAPABILITY_CALL_ARGUMENT = "_matterhornCallId";
const pendingUsage = new Map<string, AssistantUsage>();
const runIdByAssistantMessage = new Map<string, string>();
const runIdByCall = new Map<string, string>();
const pendingCompactionSessions = new Set<string>();

const PROVIDER_SYSTEM_MAX_BYTES = 256 * 1_024;
const PROVIDER_MESSAGES_MAX_COUNT = 2_048;
const PROVIDER_MESSAGES_MAX_BYTES = 16 * 1_024 * 1_024;

function authoritativeMessageGatewayRequired(): boolean {
  return String(process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED || "").trim() === "1";
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function guardedMode(): "off" | "shadow" | "enforce" {
  const mode = String(process.env.MATTERHORN_GUARDED_RUNTIME_MODE || "").trim().toLowerCase();
  if (mode === "shadow" || mode === "enforce") return mode;
  return "off";
}

function serverSettings(): { url: string; secret: string } {
  return {
    url: String(process.env.OPENWORK_SERVER_URL || "").replace(/\/+$/, ""),
    secret: String(process.env.MATTERHORN_AGENT_RUNTIME_SECRET || ""),
  };
}

function providerMessageSessionId(messages: unknown[]): string {
  if (messages.length === 0 || messages.length > PROVIDER_MESSAGES_MAX_COUNT) {
    throw new Error("Matterhorn could not safely validate the final provider messages.");
  }
  let sessionId = "";
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new Error("Matterhorn could not safely validate the final provider messages.");
    }
    const info = Reflect.get(message, "info");
    const parts = Reflect.get(message, "parts");
    const candidate = info && typeof info === "object" && !Array.isArray(info)
      ? Reflect.get(info, "sessionID")
      : null;
    if (typeof candidate !== "string" || !candidate.trim() || !Array.isArray(parts)) {
      throw new Error("Matterhorn could not safely validate the final provider messages.");
    }
    if (!sessionId) sessionId = candidate.trim();
    if (sessionId !== candidate.trim()) {
      throw new Error("Matterhorn final provider messages crossed chat boundaries.");
    }
  }
  return sessionId;
}

async function postInternal(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const settings = serverSettings();
  if (!settings.url || !settings.secret) throw new Error("Matterhorn guarded runtime is not configured.");
  const response = await fetch(`${settings.url}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Matterhorn-Agent-Runtime-Secret": settings.secret,
    },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload === "object" && !Array.isArray(payload)
      && typeof Reflect.get(payload, "message") === "string"
      ? String(Reflect.get(payload, "message"))
      : "Matterhorn denied this guarded runtime action.";
    throw new Error(message);
  }
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? Object.fromEntries(Object.entries(payload))
    : {};
}

function assistantUsage(value: unknown): {
  sessionId: string;
  assistantMessageId: string;
  userMessageId: string;
  completed: boolean;
  failed: boolean;
  usage: AssistantUsage;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const info = Reflect.get(value, "info");
  if (!info || typeof info !== "object" || Array.isArray(info) || Reflect.get(info, "role") !== "assistant") return null;
  const sessionId = Reflect.get(info, "sessionID");
  const assistantMessageId = Reflect.get(info, "id");
  const userMessageId = Reflect.get(info, "parentID");
  const tokens = Reflect.get(info, "tokens");
  if (
    typeof sessionId !== "string"
    || typeof assistantMessageId !== "string"
    || typeof userMessageId !== "string"
    || !tokens
    || typeof tokens !== "object"
    || Array.isArray(tokens)
  ) return null;
  const time = Reflect.get(info, "time");
  const cache = Reflect.get(tokens, "cache");
  const numeric = (item: unknown) => typeof item === "number" && Number.isFinite(item) ? Math.max(0, item) : 0;
  return {
    sessionId,
    assistantMessageId,
    userMessageId,
    completed: Boolean(time && typeof time === "object" && typeof Reflect.get(time, "completed") === "number"),
    failed: Boolean(Reflect.get(info, "error")),
    usage: {
      inputTokens: numeric(Reflect.get(tokens, "input")),
      outputTokens: numeric(Reflect.get(tokens, "output")),
      reasoningTokens: numeric(Reflect.get(tokens, "reasoning")),
      cacheReadTokens: cache && typeof cache === "object" ? numeric(Reflect.get(cache, "read")) : 0,
      cacheWriteTokens: cache && typeof cache === "object" ? numeric(Reflect.get(cache, "write")) : 0,
      estimatedCostUsd: numeric(Reflect.get(info, "cost")),
    },
  };
}

async function completeRun(runId: string, status: "success" | "cancelled" | "error"): Promise<void> {
  const usage = pendingUsage.get(runId);
  pendingUsage.delete(runId);
  try {
    await postInternal("/internal/agent-runs/complete", { runId, status, ...(usage ? { usage } : {}) });
  } catch (error) {
    if (guardedMode() === "enforce") throw error;
  } finally {
    for (const [callId, boundRunId] of runIdByCall) {
      if (boundRunId === runId) runIdByCall.delete(callId);
    }
  }
}

async function bindAssistantMessage(input: ReturnType<typeof assistantUsage> & {}): Promise<string | null> {
  if (!input) return null;
  const existing = runIdByAssistantMessage.get(input.assistantMessageId);
  if (existing) return existing;
  try {
    const response = await postInternal("/internal/agent-runs/bind-message", {
      sessionId: input.sessionId,
      userMessageId: input.userMessageId,
      assistantMessageId: input.assistantMessageId,
    });
    const runId = typeof response.runId === "string" ? response.runId : "";
    if (!runId) throw new Error("Matterhorn message binding did not return a run id.");
    runIdByAssistantMessage.set(input.assistantMessageId, runId);
    return runId;
  } catch (error) {
    if (guardedMode() === "enforce") throw error;
    return null;
  }
}

export const MatterhornGuard = async (context: PluginContext) => ({
  "experimental.chat.messages.transform": async (_input: Record<string, never>, output: MessagesHookOutput) => {
    if (!authoritativeMessageGatewayRequired()) return;
    if (!Array.isArray(output.messages)) {
      throw new Error("Matterhorn could not safely validate the final provider messages.");
    }
    const sessionId = providerMessageSessionId(output.messages);
    let serialized = "";
    try {
      serialized = JSON.stringify(output.messages);
    } catch {
      throw new Error("Matterhorn could not safely validate the final provider messages.");
    }
    if (!serialized || Buffer.byteLength(serialized, "utf8") > PROVIDER_MESSAGES_MAX_BYTES) {
      throw new Error("Matterhorn final provider messages are too large to validate safely.");
    }
    const payload = await postInternal("/internal/agent-runs/provider-messages", {
      workspaceDirectory: context.directory ?? null,
      sessionId,
      messages: output.messages,
    });
    if (
      payload.accepted !== true
      || typeof payload.runId !== "string"
      || !payload.runId
      || typeof payload.messagesHash !== "string"
      || !/^[a-f0-9]{64}$/.test(payload.messagesHash)
    ) {
      throw new Error("Matterhorn provider-message validation response was invalid.");
    }
    // This is the last managed message-transform hook. It does not rewrite or
    // retain messages; it proves the exact final array was checked before the
    // following system hook can release provider-bound system context.
  },
  "experimental.chat.system.transform": async (input: SystemHookInput, output: SystemHookOutput) => {
    if (!authoritativeMessageGatewayRequired()) return;
    const sessionId = typeof input.sessionID === "string" ? input.sessionID.trim() : "";
    const providerId = input.model.providerID.trim();
    const modelId = (input.model.id ?? input.model.modelID ?? "").trim();
    const purpose = pendingCompactionSessions.delete(sessionId) ? "compaction" : "message";
    if (!sessionId || !providerId || !modelId) {
      throw new Error("Matterhorn could not bind the provider request to an exact accepted run.");
    }
    const payload = await postInternal("/internal/agent-runs/provider-system", {
      workspaceDirectory: context.directory ?? null,
      sessionId,
      providerId,
      modelId,
      purpose,
    });
    const system = payload.system;
    const runId = payload.runId;
    const systemHash = payload.systemHash;
    if (
      !Array.isArray(system)
      || system.length !== 1
      || typeof system[0] !== "string"
      || system[0].length === 0
      || Buffer.byteLength(system[0], "utf8") > PROVIDER_SYSTEM_MAX_BYTES
      || typeof runId !== "string"
      || runId.length === 0
      || typeof systemHash !== "string"
      || systemHash.length === 0
    ) {
      throw new Error("Matterhorn provider system binding response was invalid.");
    }
    if (await sha256Text(system[0]) !== systemHash) {
      throw new Error("Matterhorn provider system binding hash did not match its content.");
    }
    // This hook runs last in the managed plugin list. Replace every late
    // OpenCode/provider addition with only the exact system bytes already
    // classified and authorized by the Matterhorn message gateway.
    output.system.splice(0, output.system.length, system[0]);
  },
  "tool.execute.before": async (input: ToolHookInput, output: ToolHookOutput) => {
    if (guardedMode() === "off" || !input.tool.startsWith("matterhorn-work_")) return;
    try {
      const runId = runIdByCall.get(input.callID)
        ?? (input.messageID ? runIdByAssistantMessage.get(input.messageID) : undefined);
      if (!runId) throw new Error("Matterhorn could not bind this tool call to an exact accepted run.");
      const payload = await postInternal("/internal/agent-capabilities/authorize", {
        workspaceDirectory: context.directory ?? null,
        runId,
        sessionId: input.sessionID,
        callId: input.callID,
        toolName: input.tool,
        args: output.args,
      });
      if (payload.accepted !== true || payload.callId !== input.callID) {
        throw new Error("Matterhorn capability staging response was invalid.");
      }
      // The signed capability never leaves the Matterhorn server. OpenCode
      // sees only its own non-secret call id, which the MCP bridge redeems
      // atomically and strips before hashing or backend forwarding.
      output.args[CAPABILITY_CALL_ARGUMENT] = input.callID;
    } catch (error) {
      if (guardedMode() === "enforce") throw error;
    }
  },
  event: async ({ event }: { event: OpenCodeEvent }) => {
    if (event.type === "message.updated") {
      const observed = assistantUsage(event.properties);
      if (!observed) return;
      const runId = await bindAssistantMessage(observed);
      if (!runId) return;
      pendingUsage.set(runId, observed.usage);
      if (observed.completed || observed.failed) {
        await completeRun(runId, observed.failed ? "error" : "success");
        runIdByAssistantMessage.delete(observed.assistantMessageId);
      }
      return;
    }
    if (event.type === "message.part.updated") {
      const part = event.properties?.part;
      if (!part || typeof part !== "object" || Array.isArray(part) || Reflect.get(part, "type") !== "tool") return;
      const callId = Reflect.get(part, "callID");
      const messageId = Reflect.get(part, "messageID");
      if (typeof callId !== "string" || typeof messageId !== "string") return;
      const runId = runIdByAssistantMessage.get(messageId);
      if (runId) runIdByCall.set(callId, runId);
    }
  },
  "experimental.session.compacting": async (
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ) => {
    pendingCompactionSessions.add(input.sessionID);
    output.context.push(MATTERHORN_CRYPTO_COMPACTION_CONTEXT);
  },
});

export default MatterhornGuard;
