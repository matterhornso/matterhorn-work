import { MATTERHORN_CRYPTO_COMPACTION_CONTEXT } from "../opencode-compaction-policy.js";
import { resolveConfinedWorkspacePath } from "../workspace-path-boundary.js";
import { MATTERHORN_COMPACTION_REQUEST } from "../opencode-compaction-request.js";

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
  messageID?: string;
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

type MessageHookInput = { sessionID: string; messageID?: string };
type MessageHookOutput = {
  message: { id: string; sessionID: string; model: { providerID: string; modelID: string } };
  parts: Array<Record<string, unknown>>;
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
const pendingUsage = new Map<string, Map<string, AssistantUsage>>();
const runIdByAssistantMessage = new Map<string, string>();
const runIdByCall = new Map<string, string>();

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
    // Internal credentials must never follow a redirect to another service.
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
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
  cancelled: boolean;
  finish: string | null;
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
    completed: Boolean(time && typeof time === "object" && typeof Reflect.get(time, "completed") === "number"
      && typeof Reflect.get(info, "finish") === "string"
      && !["tool-calls", "unknown"].includes(String(Reflect.get(info, "finish")))),
    failed: Boolean(Reflect.get(info, "error")),
    cancelled: Reflect.get(info, "error")?.name === "MessageAbortedError",
    finish: typeof Reflect.get(info, "finish") === "string" ? String(Reflect.get(info, "finish")) : null,
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

async function completeRun(runId: string, status: "success" | "partial" | "cancelled" | "error"): Promise<void> {
  const steps = pendingUsage.get(runId);
  const usage = steps ? [...steps.values()].reduce((total, step) => ({
    inputTokens: total.inputTokens + step.inputTokens,
    outputTokens: total.outputTokens + step.outputTokens,
    reasoningTokens: total.reasoningTokens + step.reasoningTokens,
    cacheReadTokens: total.cacheReadTokens + step.cacheReadTokens,
    cacheWriteTokens: total.cacheWriteTokens + step.cacheWriteTokens,
    estimatedCostUsd: total.estimatedCostUsd + step.estimatedCostUsd,
  }), { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCostUsd: 0 }) : undefined;
  try {
    const response = await postInternal("/internal/agent-runs/complete", { runId, status, ...(usage ? { usage } : {}) });
    if (response.ok !== true) throw new Error("Matterhorn settlement acknowledgement was invalid.");
  } catch (error) {
    // Keep every model step and its run binding for a replay after a lost or
    // rejected acknowledgement. Never replay model/tool execution here.
    if (guardedMode() === "enforce") throw error;
    return;
  }
  pendingUsage.delete(runId);
  for (const [messageId, boundRunId] of runIdByAssistantMessage) {
    if (boundRunId === runId) runIdByAssistantMessage.delete(messageId);
  }
  for (const [callId, boundRunId] of runIdByCall) {
    if (boundRunId === runId) runIdByCall.delete(callId);
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

export const MatterhornGuard = async (context: PluginContext) => {
  // OpenCode retries LLM.stream without repeating messages.transform. Keep only
  // a bounded, short-lived snapshot for that exact run; never persist its text.
  const pendingCompactionSessions = new Set<string>();
  const retryMessages = new Map<string, { serialized: string; messages: unknown[]; runId: string; sessionId: string; expiresAt: number; used: boolean; purpose: "message" | "compaction" }>();
  return ({
  "chat.message": async (input: MessageHookInput, output: MessageHookOutput) => {
    const markers = output.parts.filter(part => {
      const metadata = part.metadata;
      return metadata !== null && typeof metadata === "object" && Object.hasOwn(metadata, MATTERHORN_COMPACTION_REQUEST);
    });
    if (!markers.length) return;
    const part = markers[0];
    const metadata = part.metadata;
    const runId = metadata !== null && typeof metadata === "object" ? Reflect.get(metadata, MATTERHORN_COMPACTION_REQUEST) : undefined;
    if (markers.length !== 1 || output.parts.length !== 1 || typeof runId !== "string" || !runId.trim()
      || part.type !== "text" || part.text !== "" || part.synthetic !== true || part.ignored !== true
      || typeof part.id !== "string" || !part.id || !input.messageID
      || output.message.id !== input.messageID || output.message.sessionID !== input.sessionID
      || part.messageID !== input.messageID || part.sessionID !== input.sessionID) {
      throw new Error("Matterhorn could not validate this compaction request.");
    }
    // Never fall back to ordinary chat, even with guarded tools switched off.
    // Failed or stale authorization must occur before the runtime saves a part.
    const claimed = await postInternal("/internal/agent-runs/claim-compaction", {
      workspaceDirectory: context.directory ?? null, runId, sessionId: input.sessionID,
      messageId: input.messageID, providerId: output.message.model.providerID, modelId: output.message.model.modelID,
    });
    if (claimed.runId !== runId || claimed.messageId !== input.messageID) {
      throw new Error("Matterhorn could not bind this compaction request.");
    }
    // OpenCode keeps the original array reference after this hook. Mutate it
    // in place so its own compaction engine consumes the exact bound parent.
    output.parts.splice(0, output.parts.length, { id: part.id, sessionID: input.sessionID,
      messageID: input.messageID, type: "compaction", auto: false });
  },
  "experimental.chat.messages.transform": async (input: { sessionID?: string; messageID?: string }, output: MessagesHookOutput) => {
    if (!authoritativeMessageGatewayRequired()) return;
    if (!Array.isArray(output.messages)) {
      throw new Error("Matterhorn could not safely validate the final provider messages.");
    }
    const sessionId = providerMessageSessionId(output.messages);
    const messageId = input.messageID;
    if (input.sessionID !== sessionId || typeof messageId !== "string" || !messageId.trim()) {
      throw new Error("The runtime cannot verify this request's identity. Ask the workspace owner to update it.");
    }
    const purpose = pendingCompactionSessions.delete(messageId) ? "compaction" : "message";
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
      messageId,
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
    for (const [id, entry] of retryMessages) {
      if (entry.expiresAt <= Date.now()) retryMessages.delete(id);
    }
    retryMessages.delete(messageId);
    // Limit retained context across sessions to two maximum-sized batches.
    while (retryMessages.size >= 32 || [...retryMessages.values()].reduce((size, entry) => size + Buffer.byteLength(entry.serialized), 0)
      + Buffer.byteLength(serialized) > 2 * PROVIDER_MESSAGES_MAX_BYTES) {
      const oldest = retryMessages.keys().next().value;
      if (oldest === undefined) break;
      retryMessages.delete(oldest);
    }
    const expiresAt = Date.now() + 120_000;
    retryMessages.set(messageId, { serialized, messages: output.messages, runId: payload.runId, sessionId, expiresAt, used: false, purpose });
    // Capture only scalar keys: an evicted context must not stay alive in a timer.
    setTimeout(() => {
      if (retryMessages.get(messageId)?.expiresAt === expiresAt) retryMessages.delete(messageId);
    }, 120_000).unref();
  },
  "experimental.chat.system.transform": async (input: SystemHookInput, output: SystemHookOutput) => {
    if (!authoritativeMessageGatewayRequired()) return;
    const sessionId = typeof input.sessionID === "string" ? input.sessionID.trim() : "";
    const providerId = input.model.providerID.trim();
    const modelId = (input.model.id ?? input.model.modelID ?? "").trim();
    const messageId = input.messageID;
    if (!sessionId || !providerId || !modelId || typeof messageId !== "string" || !messageId.trim()) {
      throw new Error("Matterhorn could not bind the provider request to an exact accepted run.");
    }
    const retry = retryMessages.get(messageId);
    if (!retry || retry.sessionId !== sessionId || retry.expiresAt <= Date.now()) {
      retryMessages.delete(messageId);
      throw new Error("Provider message validation is missing or expired. Retry this message from the chat.");
    }
    if (JSON.stringify(retry.messages) !== retry.serialized) {
      retryMessages.delete(messageId);
      throw new Error("The provider messages changed after validation. Retry this message from the chat.");
    }
    if (retry.used) {
      const validated = await postInternal("/internal/agent-runs/provider-messages", {
        workspaceDirectory: context.directory ?? null, sessionId, messageId,
        expectedRunId: retry.runId, messages: JSON.parse(retry.serialized),
      });
      if (validated.accepted !== true || validated.runId !== retry.runId) {
        throw new Error("The provider retry no longer belongs to this active run.");
      }
    }
    const payload = await postInternal("/internal/agent-runs/provider-system", {
      workspaceDirectory: context.directory ?? null,
      sessionId,
      providerId,
      modelId,
      purpose: retry.purpose,
      expectedRunId: retry.runId,
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
    if (retry.runId !== runId) throw new Error("The provider context changed runs during validation.");
    retry.used = true;
    // This hook runs last in the managed plugin list. Replace every late
    // OpenCode/provider addition with only the exact system bytes already
    // classified and authorized by the Matterhorn message gateway.
    output.system.splice(0, output.system.length, system[0]);
  },
  "tool.execute.before": async (input: ToolHookInput, output: ToolHookOutput) => {
    if (authoritativeMessageGatewayRequired() && ["read", "write", "edit", "glob", "grep", "list"].includes(input.tool)) {
      if (!context.directory) throw new Error("Matterhorn could not establish the authorized workspace.");
      const field = ["read", "write", "edit"].includes(input.tool) ? "filePath" : "path";
      const requested = output.args[field];
      if (requested !== undefined && typeof requested !== "string") throw new Error("Invalid workspace tool path");
      // Pass the canonical path to the tool as well as checking it. A link's
      // lexical in-workspace spelling must not bypass external_directory.
      output.args[field] = resolveConfinedWorkspacePath(context.directory, requested ?? ".");
    }
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
      const steps = pendingUsage.get(runId) ?? new Map<string, AssistantUsage>();
      steps.set(observed.assistantMessageId, observed.usage);
      pendingUsage.set(runId, steps);
      if (observed.completed || observed.failed) {
        for (const [messageId, snapshot] of retryMessages) {
          if (snapshot.runId === runId && snapshot.sessionId === observed.sessionId) retryMessages.delete(messageId);
        }
        await completeRun(runId, observed.cancelled ? "cancelled" : observed.failed ? "error" : observed.finish === "stop" ? "success" : "partial");
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
    input: { sessionID: string; messageID?: string },
    output: { context: string[]; prompt?: string },
  ) => {
    if (authoritativeMessageGatewayRequired() && !input.messageID) {
      throw new Error("The runtime cannot verify this summary request. Ask the workspace owner to update it.");
    }
    if (input.messageID) pendingCompactionSessions.add(input.messageID);
    output.context.push(MATTERHORN_CRYPTO_COMPACTION_CONTEXT);
  },
  });
};

export default MatterhornGuard;
