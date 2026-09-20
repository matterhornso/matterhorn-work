// Combined local gateway + pinned runtime + real guard plugin + synthetic
// inference. No production accounts, external model calls or wallet activity.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer as createHttpServer } from "node:http";
import { startServer } from "../apps/server/src/server";
import { resolveMatterhornManagedAgentPrompt } from "../apps/server/src/workspace-init";
import { matterhornGuardPluginPath } from "../apps/server/src/matterhorn-guard-plugin-path";
import { MANAGED_OPENCODE_PERMISSION_POLICY } from "../apps/server/src/managed-opencode-runtime-config";
import type { ServerConfig } from "../apps/server/src/types";
import { createClient } from "../apps/app/src/app/lib/opencode";
import { abortSession } from "../apps/app/src/app/lib/opencode-session";

const binary = process.env.MATTERHORN_QA_OPENCODE_BIN;
if (!binary) throw new Error("Set MATTERHORN_QA_OPENCODE_BIN to the pinned OpenCode 1.18.31 executable");
const lostAck = process.argv.includes("--lost-ack");
const retryAfterLostAck = process.argv.includes("--retry-after-lost-ack");
const abortRejected = process.argv.includes("--abort-rejected");
const abortInFlight = process.argv.includes("--abort-in-flight") || abortRejected;
let rejectAbortRequests = false;
const outsideRead = process.argv.includes("--read-outside-root");
const symlinkRead = process.argv.includes("--read-symlink-outside");
if (outsideRead && symlinkRead) throw new Error("Run direct and symlink boundary controls separately");
const toolProbe = process.argv.includes("--read-tool-loop") || outsideRead || symlinkRead ? "read" : process.argv.includes("--denied-write-tool") ? "write" : undefined;
if (toolProbe && (lostAck || abortInFlight)) throw new Error("Run tool probes separately from transport/cancellation probes");
if (retryAfterLostAck && !lostAck) throw new Error("Retry probe requires --lost-ack");
if (abortInFlight && lostAck) throw new Error("Run abort and lost-ack probes independently");
let dropAcknowledgements = lostAck;
if (createHash("sha256").update(readFileSync(binary)).digest("hex") !== (process.env.MATTERHORN_QA_OPENCODE_SHA256 ?? "16c960ba77421da11b53e785f359b73f328a86118b48feb4af143db5d9afb198")) throw new Error("Runtime digest mismatch");
const root = realpathSync(mkdtempSync(join(tmpdir(), "mh-gateway-guard-")));
const workspace = join(root, "workspace");
mkdirSync(workspace);
const outsideFixturePath = join(root, "synthetic-outside-workspace.txt");
const readFixturePath = outsideRead ? outsideFixturePath : join(workspace, "synthetic-read-fixture.txt");
const writeFixturePath = join(workspace, "synthetic-denied-write.txt");
if (toolProbe) {
  writeFileSync(symlinkRead ? outsideFixturePath : readFixturePath, "SYNTHETIC_READ_QA_MARKER\nThis is generated test data, not user information.\n");
  if (symlinkRead) symlinkSync(outsideFixturePath, readFixturePath);
}
const runtimeSecret = randomBytes(32).toString("hex");
const password = randomBytes(32).toString("hex");
const token = randomBytes(32).toString("hex");
const testEnv = {
  MATTERHORN_WORK_DATA_DIR: join(root, "matterhorn"), OPENWORK_DATA_DIR: join(root, "matterhorn"),
  MATTERHORN_AUTH_DB: join(root, "auth.db"), MATTERHORN_WORK_MEMORY_ROOT: join(root, "memory"),
  OPENWORK_ENV_STORE: join(root, "env.json"), OPENWORK_TOKEN_STORE: join(root, "tokens.json"),
  MATTERHORN_MODEL_USAGE_DB: join(root, "usage.db"), MATTERHORN_MODEL_USAGE_ENFORCEMENT: "hard",
  MATTERHORN_MODEL_USAGE_DAILY_LIMIT: "1000000", MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT: "1000000",
  MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS: "10000", MATTERHORN_GUARDED_RUNTIME_MODE: "off",
  MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED: "1", MATTERHORN_AGENT_RUNTIME_SECRET: runtimeSecret,
  MATTERHORN_CAPABILITY_SIGNING_SECRET: randomBytes(32).toString("hex"),
};
Object.assign(process.env, testEnv);
let modelCalls = 0;
let holdModelResponse = false;
let providerDisconnects = 0;
let toolProbeActive = false;
let toolRequested = false;
let requestedToolAdvertised = false;
let toolResultReachedProvider = false;
const stub = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  if (new URL(request.url).pathname !== "/v1/chat/completions") return new Response("Not found", { status: 404 });
  const requestBody = await request.json();
  modelCalls++;
  if (modelCalls > 12) return new Response("Synthetic call cap", { status: 429 });
  const common = { id: `qa_${modelCalls}`, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "fixture" };
  if (toolProbeActive) {
    if (!toolRequested) {
      toolRequested = true;
      requestedToolAdvertised = Array.isArray(requestBody.tools) && requestBody.tools.some((tool: { function?: { name?: string } }) => tool.function?.name === toolProbe);
      const args = toolProbe === "read" ? { filePath: readFixturePath } : { filePath: writeFixturePath, content: "SYNTHETIC_WRITE_SHOULD_BE_DENIED" };
      const chunks = [
        { ...common, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_synthetic_boundary", type: "function", function: { name: toolProbe, arguments: JSON.stringify(args) } }] }, finish_reason: null }] },
        { ...common, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
        { ...common, choices: [], usage: { prompt_tokens: 900, completion_tokens: 100, total_tokens: 1000 } },
      ];
      return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
    }
    toolResultReachedProvider = JSON.stringify(requestBody.messages).includes("SYNTHETIC_READ_QA_MARKER");
  }
  if (holdModelResponse) {
    let disconnected = false;
    const disconnectedOnce = () => { if (!disconnected) { disconnected = true; providerDisconnects++; } };
    request.signal.addEventListener("abort", disconnectedOnce, { once: true });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ ...common,
          choices: [{ index: 0, delta: { role: "assistant", content: "SYNTHETIC_PARTIAL_BEFORE_STOP" }, finish_reason: null }],
        })}\n\n`));
      },
      cancel() { disconnectedOnce(); },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  }
  const chunks = [
    { ...common, choices: [{ index: 0, delta: { role: "assistant", content: "SYNTHETIC_GUARD_QA_OK" }, finish_reason: null }] },
    { ...common, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    { ...common, choices: [], usage: { prompt_tokens: 900, completion_tokens: 100, total_tokens: 1000 } },
  ];
  return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
} });
const holder = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
const runtimePort = holder.port;
await holder.stop(true);
const actualRuntimeBase = `http://127.0.0.1:${runtimePort}`;
let gatewayRuntimeBase = actualRuntimeBase;
let transport: ReturnType<typeof createHttpServer> | undefined;
let promptPostAttempts = 0;
let completedBeforeDrop = 0;
if (lostAck || abortRejected) {
  transport = createHttpServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
    incoming.on("end", () => {
      void (async () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (["host", "connection", "content-length", "transfer-encoding"].includes(key) || value === undefined) continue;
          headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        const body = Buffer.concat(chunks);
        const pathname = new URL(incoming.url ?? "/", actualRuntimeBase).pathname;
        if (rejectAbortRequests && incoming.method === "POST" && /^\/session\/[^/]+\/abort$/.test(pathname)) {
          outgoing.writeHead(503, { "content-type": "application/json" });
          outgoing.end(JSON.stringify({ code: "synthetic_abort_unavailable", message: "Synthetic abort failure" }));
          return;
        }
        const response = await fetch(`${actualRuntimeBase}${incoming.url}`, { method: incoming.method, headers, ...(body.length ? { body } : {}), signal: AbortSignal.timeout(10000) });
        const bytes = await response.arrayBuffer();
        if (dropAcknowledgements && incoming.method === "POST" && /^\/session\/[^/]+\/prompt_async$/.test(pathname)) {
          promptPostAttempts++;
          // Hold the runtime's successful acknowledgement until its history
          // proves completion, then lose the acknowledgement on the wire.
          // This models uncertain delivery without mocking runtime usage.
          const historyPath = pathname.replace(/\/prompt_async$/, "/message");
          let completed = false;
          for (let attempt = 0; attempt < 40; attempt++) {
            const history = await fetch(`${actualRuntimeBase}${historyPath}`, { headers, signal: AbortSignal.timeout(2000) });
            const messages = await history.json();
            const assistant = Array.isArray(messages) ? messages.filter(message => message?.info?.role === "assistant").at(-1) : undefined;
            if (assistant?.info?.finish === "stop") { completed = true; break; }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (completed) completedBeforeDrop++;
          incoming.socket.destroy();
          outgoing.destroy();
          return;
        }
        outgoing.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json" });
        outgoing.end(Buffer.from(bytes));
      })().catch(() => { incoming.socket.destroy(); outgoing.destroy(); });
    });
  });
  await new Promise<void>(resolve => transport?.listen(0, "127.0.0.1", resolve));
  const address = transport.address();
  if (!address || typeof address === "string") throw new Error("QA transport port unavailable");
  gatewayRuntimeBase = `http://127.0.0.1:${address.port}`;
}
const config: ServerConfig = {
  host: "127.0.0.1", port: 0, token, hostToken: randomBytes(32).toString("hex"),
  approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: ["http://127.0.0.1"],
  workspaces: [{ id: "ws_guard_qa", name: "Guard QA", path: workspace, preset: "starter", workspaceType: "local", baseUrl: gatewayRuntimeBase, opencodeUsername: "qa", opencodePassword: password }],
  authorizedRoots: [workspace], readOnly: false, startedAt: Date.now(), tokenSource: "cli", hostTokenSource: "cli", logFormat: "pretty", logRequests: false, reloadWatchers: false,
};
const gateway = await startServer(config);
const gatewayBase = `http://127.0.0.1:${gateway.port}`;
const guardObservations: Array<{ path: string; status: number; code?: string }> = [];
const guardBridge = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/internal/")) return new Response("Not found", { status: 404 });
  const response = await fetch(`${gatewayBase}${path}`, { method: request.method, headers: request.headers, body: await request.arrayBuffer() });
  const payload = await response.clone().json().catch(() => ({}));
  guardObservations.push({ path, status: response.status, ...(typeof payload.code === "string" ? { code: payload.code } : {}) });
  return response;
} });
const agents = ["matterhorn", "matterhorn-bittensor", "matterhorn-hyperliquid", "matterhorn-polymarket", "matterhorn-sui"];
const runtimeConfig = {
  model: "fixture/fixture", small_model: "fixture/fixture", enabled_providers: ["fixture"], autoupdate: false, share: "disabled",
  compaction: { auto: false, prune: false }, permission: outsideRead || symlinkRead ? MANAGED_OPENCODE_PERMISSION_POLICY : { "*": "deny" }, plugin: [matterhornGuardPluginPath()],
  agent: { title: { disable: true }, ...Object.fromEntries(agents.map(id => [id, { mode: "primary", prompt: resolveMatterhornManagedAgentPrompt(id), steps: toolProbe ? 3 : 1 }])) },
  provider: { fixture: { npm: "@ai-sdk/openai-compatible", name: "Loopback synthetic QA", options: { baseURL: `http://127.0.0.1:${stub.port}/v1`, apiKey: "synthetic-only" }, models: { fixture: { name: "Fixture", limit: { context: 32768, output: 1024 }, tool_call: true } } } },
};
const runtime = Bun.spawn({ cmd: [binary, "serve", "--hostname", "127.0.0.1", "--port", String(runtimePort)], cwd: workspace,
  env: { PATH: process.env.PATH ?? "", TMPDIR: root, ...testEnv, OPENWORK_SERVER_URL: `http://127.0.0.1:${guardBridge.port}`,
    XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"), XDG_STATE_HOME: join(root, "state"),
    OPENCODE_CONFIG_DIR: join(root, "config"), OPENCODE_CONFIG_CONTENT: JSON.stringify(runtimeConfig),
    OPENCODE_DISABLE_PROJECT_CONFIG: "true", OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_MODELS_FETCH: "true", OPENCODE_SERVER_USERNAME: "qa", OPENCODE_SERVER_PASSWORD: password,
  }, stdout: "ignore", stderr: "ignore" });
const watchdog = setTimeout(() => runtime.kill(), 60_000);
const runtimeAuth = `Basic ${Buffer.from(`qa:${password}`).toString("base64")}`;
async function request(base: string, authorization: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { authorization, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
const api = (path: string, body?: unknown) => request(gatewayBase, `Bearer ${token}`, path, body);
const runtimeApi = (path: string, body?: unknown) => request(`http://127.0.0.1:${runtimePort}`, runtimeAuth, path, body);
async function until(check: () => Promise<boolean>, label: string) {
  for (let i = 0; i < 80; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(`QA timeout: ${label}`);
}
try {
  await until(async () => { try { const health = await runtimeApi("/global/health"); return health.data?.healthy && health.data.version === "1.18.31"; } catch { return false; } }, "runtime boot");
  const results = [];
  let firstSessionPath: string | undefined;
  let retryCausedAdditionalInference = false;
  let cancellationPassed = !abortInFlight;
  let failedStopReportedSuccess = false;
  let toolProbePassed = !toolProbe;
  for (const agentId of agents) {
    const created = await api("/workspace/ws_guard_qa/sessions", { title: `Synthetic ${agentId}`, agentId });
    if (created.status !== 201) throw new Error(`Session create: ${created.status} ${created.data?.code}`);
    const sessionId = created.data.item.id;
    const body = { messageID: `req_fixture_${agentId}`, message: "Explain what public information this desk can research. This is a synthetic QA check.", agentId, model: { providerID: "fixture", modelID: "fixture" } };
    const path = `/workspace/ws_guard_qa/sessions/${sessionId}`;
    firstSessionPath ??= path;
    const preflight = await api(`${path}/messages/preflight`, body);
    const beforeCalls = modelCalls;
    const beforePosts = promptPostAttempts;
    const sent = await api(`${path}/messages`, body);
    let terminal = false;
    let finish: string | undefined;
    let error: string | undefined;
    let runtimeTokens: number | undefined;
    let promptTextCopies: number | undefined;
    if (sent.status === 202 || lostAck) {
      await until(async () => {
        const history = await api(`${path}/messages`);
        const assistant = history.data?.items?.filter((m: { info: { role: string } }) => m.info.role === "assistant").at(-1);
        const tokens = assistant?.info?.tokens;
        runtimeTokens = tokens ? (tokens.total ?? ((tokens.input ?? 0) + (tokens.output ?? 0) + (tokens.reasoning ?? 0) + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0))) : undefined;
        promptTextCopies = history.data?.items?.filter((m: { info: { role: string } }) => m.info.role === "user").flatMap((m: { parts: Array<{ type: string; text?: string }> }) => m.parts).filter((part: { type: string; text?: string }) => part.type === "text" && part.text === body.message).length;
        finish = assistant?.info?.finish;
        error = assistant?.info?.error?.message ?? assistant?.info?.error?.name;
        terminal = Boolean(finish || error);
        return terminal;
      }, `${agentId} response`);
    }
    results.push({ agentId, preflight: preflight.data?.decision, status: sent.status, code: sent.data?.code, modelCalls: modelCalls - beforeCalls, ...(lostAck ? { promptPostAttempts: promptPostAttempts - beforePosts } : {}), finish, runtimeTokens, promptTextCopies, error });
    console.log(JSON.stringify({ probe: "gateway-runtime-guard-desk", ...results.at(-1) }));
  }
  if (firstSessionPath) {
    const followup = await api(`${firstSessionPath}/messages/preflight`, { message: "Continue with public information only.", agentId: "matterhorn", model: { providerID: "fixture", modelID: "fixture" } });
    console.log(JSON.stringify({ probe: "followup-after-transport-result", lostAck, status: followup.status, decision: followup.data?.decision, effectiveMode: followup.data?.effectiveMode, detectedLabels: followup.data?.detectedData?.labels }));
    if (retryAfterLostAck) {
      // The production client now retains this request identity on a lost ack.
      // This is an API reproduction, not a browser click or hook execution.
      // Restore transport first, so any new inference is not another fault.
      dropAcknowledgements = false;
      const beforeHistory = await api(`${firstSessionPath}/messages`);
      const beforeMessages = beforeHistory.data?.items ?? [];
      const beforeIds = new Set(beforeMessages.map((message: { info: { id: string } }) => message.info.id));
      const beforeCalls = modelCalls;
      const resent = await api(`${firstSessionPath}/messages`, {
        messageID: "req_fixture_matterhorn",
        message: "Explain what public information this desk can research. This is a synthetic QA check.",
        agentId: "matterhorn", model: { providerID: "fixture", modelID: "fixture" },
      });
      const afterMessages = (await api(`${firstSessionPath}/messages`)).data?.items ?? [];
      if (resent.status !== 202 || afterMessages.some((message: { info: { id: string } }) => !beforeIds.has(message.info.id))) throw new Error("Idempotent retry changed history");
      retryCausedAdditionalInference = modelCalls > beforeCalls;
      const countRole = (messages: Array<{ info: { role: string } }>, role: string) => messages.filter(message => message.info.role === role).length;
      console.log(JSON.stringify({ probe: "fresh-send-after-ambiguous-failure", status: resent.status,
        extraModelCalls: modelCalls - beforeCalls, retryCausedAdditionalInference,
        userMessagesBefore: countRole(beforeMessages, "user"), userMessagesAfter: countRole(afterMessages, "user"),
        assistantMessagesBefore: countRole(beforeMessages, "assistant"), assistantMessagesAfter: countRole(afterMessages, "assistant"),
      }));
    }
  }
  if (abortInFlight) {
    const created = await api("/workspace/ws_guard_qa/sessions", { title: "Synthetic stop and recover", agentId: "matterhorn" });
    if (created.status !== 201) throw new Error("Cancellation session creation failed");
    const sessionId = created.data.item.id;
    const path = `/workspace/ws_guard_qa/sessions/${sessionId}`;
    const body = { message: "Explain public research. Synthetic cancellation QA.", agentId: "matterhorn", model: { providerID: "fixture", modelID: "fixture" } };
    holdModelResponse = true;
    const beforeCalls = modelCalls;
    const accepted = await api(`${path}/messages`, body);
    let partialTextPersisted = false;
    await until(async () => {
      const history = await api(`${path}/messages`);
      partialTextPersisted = history.data?.items?.some((message: { info: { role: string }; parts: Array<{ text?: string }> }) =>
        message.info.role === "assistant" && message.parts.some(part => part.text?.includes("SYNTHETIC_PARTIAL_BEFORE_STOP")));
      const runtimeStatus = await runtimeApi("/session/status");
      return modelCalls === beforeCalls + 1 && runtimeStatus.data?.[sessionId]?.type === "busy";
    }, "active provider request and busy runtime");
    const pending = await api("/workspace/ws_guard_qa/model-usage/status");
    if (abortRejected) {
      rejectAbortRequests = true;
      const client = createClient(`${gatewayBase}/workspace/ws_guard_qa/opencode`, undefined, { mode: "matterhorn", token });
      let safeHelperResolved = false;
      try { await abortSession(client, sessionId); safeHelperResolved = true; } catch { /* explicit Stop must reject */ }
      let strictHelperRejected = false;
      try { await abortSession(client, sessionId); } catch { strictHelperRejected = true; }
      const stillActive = await runtimeApi("/session/status");
      const afterRejectedStop = await api("/workspace/ws_guard_qa/model-usage/status");
      failedStopReportedSuccess = safeHelperResolved && stillActive.data?.[sessionId]?.type === "busy" && providerDisconnects === 0;
      console.log(JSON.stringify({ probe: "rejected-stop-via-production-client-helper", safeHelperResolved, strictHelperRejected,
        runtimeStatus: stillActive.data?.[sessionId]?.type, providerDisconnects,
        pendingReservations: afterRejectedStop.data?.status?.pendingRequests, failedStopReportedSuccess,
      }));
      // Repair only the disposable fault injector, then perform a real Stop
      // so recovery and accounting can still be tested and cleaned up.
      rejectAbortRequests = false;
    }
    const stopped = await api(`/workspace/ws_guard_qa/opencode/session/${sessionId}/abort`, {});
    let abortError: string | undefined;
    await until(async () => {
      const history = await api(`${path}/messages`);
      abortError = history.data?.items?.find((message: { info: { role: string } }) => message.info.role === "assistant")?.info?.error?.name;
      return abortError === "MessageAbortedError" && providerDisconnects === 1;
    }, "abort persisted and provider disconnected");
    const afterStop = await api("/workspace/ws_guard_qa/model-usage/status");
    holdModelResponse = false;
    const retried = await api(`${path}/messages`, { ...body, message: "Start a new public research response after Stop. Synthetic QA." });
    let recoveryFinish: string | undefined;
    await until(async () => {
      const history = await api(`${path}/messages`);
      const assistants = history.data?.items?.filter((message: { info: { role: string } }) => message.info.role === "assistant") ?? [];
      recoveryFinish = assistants.at(-1)?.info?.finish;
      return assistants.length === 2 && recoveryFinish === "stop";
    }, "response after cancellation");
    const recoveredUsage = await api("/workspace/ws_guard_qa/model-usage/status");
    cancellationPassed = accepted.status === 202 && stopped.status === 200 && stopped.data === true
      && pending.data?.status?.pendingRequests === 1 && afterStop.data?.status?.pendingRequests === 0
      && retried.status === 202 && modelCalls - beforeCalls === 2 && recoveryFinish === "stop"
      && recoveredUsage.data?.status?.monthly?.usedTokens === 6000 && recoveredUsage.data?.status?.pendingRequests === 0;
    console.log(JSON.stringify({ probe: "gateway-stop-and-recover", acceptedStatus: accepted.status,
      partialTextPersisted,
      pendingBeforeStop: pending.data?.status?.pendingRequests, stopStatus: stopped.status, stopResult: stopped.data,
      abortError, providerDisconnects, pendingAfterStop: afterStop.data?.status?.pendingRequests,
      usedTokensAfterStop: afterStop.data?.status?.monthly?.usedTokens,
      recoveryStatus: retried.status, recoveryFinish, modelCalls: modelCalls - beforeCalls,
      usedTokensAfterRecovery: recoveredUsage.data?.status?.monthly?.usedTokens,
      pendingAfterRecovery: recoveredUsage.data?.status?.pendingRequests, cancellationPassed,
    }));
  }
  if (toolProbe) {
    const created = await api("/workspace/ws_guard_qa/sessions", { title: "Synthetic tool boundary", agentId: "matterhorn" });
    if (created.status !== 201) throw new Error("Tool session creation failed");
    const sessionId = created.data.item.id;
    const path = `/workspace/ws_guard_qa/sessions/${sessionId}`;
    const beforeCalls = modelCalls;
    const beforeGuards = guardObservations.length;
    toolProbeActive = true;
    const sent = await api(`${path}/messages`, {
      message: "Inspect the synthetic test fixture using read-only tools. Do not change files.",
      agentId: "matterhorn", executionMode: "plan", model: { providerID: "fixture", modelID: "fixture" },
    });
    let toolState: string | undefined;
    let toolError: string | undefined;
    let finish: string | undefined;
    let assistantError: string | undefined;
    let readOutputInHistory = false;
    await until(async () => {
      const history = await api(`${path}/messages`);
      const assistants = history.data?.items?.filter((message: { info: { role: string } }) => message.info.role === "assistant") ?? [];
      const tool = assistants.flatMap((message: { parts: Array<{ type: string; state?: { status?: string; error?: string; output?: string } }> }) => message.parts).find((part: { type: string }) => part.type === "tool");
      toolState = tool?.state?.status;
      toolError = tool?.state?.error;
      readOutputInHistory = Boolean(tool?.state?.output?.includes("SYNTHETIC_READ_QA_MARKER"));
      finish = assistants.at(-1)?.info?.finish;
      assistantError = assistants.at(-1)?.info?.error?.name;
      const status = await runtimeApi("/session/status");
      return toolRequested && (finish === "stop" || Boolean(assistantError)) && status.data?.[sessionId]?.type !== "busy";
    }, "tool-loop terminal outcome");
    toolProbeActive = false;
    const writeCreated = existsSync(writeFixturePath);
    const writeBoundaryPassed = toolProbe === "write" && !writeCreated && toolState === "error";
    const outsideReadBoundaryPassed = (outsideRead || symlinkRead) && toolState === "error" && !readOutputInHistory && !toolResultReachedProvider;
    toolProbePassed = sent.status === 202 && (toolProbe === "read"
      ? outsideRead || symlinkRead
        ? outsideReadBoundaryPassed && finish === "stop"
        : requestedToolAdvertised && toolState === "completed" && readOutputInHistory && toolResultReachedProvider && finish === "stop"
      : writeBoundaryPassed && finish === "stop");
    console.log(JSON.stringify({ probe: "actual-runtime-tool-boundary", requestedTool: toolProbe, executionMode: "plan",
      status: sent.status, requestedToolAdvertised, modelCalls: modelCalls - beforeCalls, toolState,
      toolError: toolError?.slice(0, 220), readOutputInHistory, toolResultReachedProvider, writeCreated,
      finish, assistantError, writeBoundaryPassed, outsideRead, symlinkRead, outsideReadBoundaryPassed,
      ...(outsideRead || symlinkRead ? { managedPermissionPolicy: true, externalDirectoryPolicy: MANAGED_OPENCODE_PERMISSION_POLICY.external_directory,
        canonicalReadTargetOutsideWorkspace: !realpathSync(readFixturePath).startsWith(`${workspace}/`),
      } : {}),
      guardResults: guardObservations.slice(beforeGuards), toolProbePassed,
    }));
  }
  const control = await api("/workspace/ws_guard_qa/sessions", { title: "Synthetic guard negative controls", agentId: "matterhorn" });
  if (control.status !== 201) throw new Error("Negative-control session creation failed");
  const controlId = control.data.item.id;
  const beforeBlocked = modelCalls;
  const secretMarker = "never-send-this-attachment-value";
  const blocked = await api(`/workspace/ws_guard_qa/sessions/${controlId}/messages`, {
    agentId: "matterhorn", model: { providerID: "fixture", modelID: "fixture" },
    parts: [{ type: "text", text: "Review this synthetic configuration" }, { type: "file", filename: ".env", mime: "text/plain", url: `data:text/plain;base64,${Buffer.from(`PRIVATE_KEY=${secretMarker}`).toString("base64")}` }],
    attachmentIds: ["att_synthetic_secret"],
  });
  const secretBlocked = blocked.status === 422 && blocked.data?.code === "agent_privacy_blocked" && !JSON.stringify(blocked.data).includes(secretMarker) && modelCalls === beforeBlocked;
  console.log(JSON.stringify({ probe: "gateway-secret-negative-control", status: blocked.status, code: blocked.data?.code, secretBlocked, extraModelCalls: modelCalls - beforeBlocked }));
  const beforeRawGuards = guardObservations.length;
  const raw = await runtimeApi(`/session/${controlId}/message`, { agent: "matterhorn", model: { providerID: "fixture", modelID: "fixture" }, parts: [{ type: "text", text: "Synthetic raw runtime request without gateway authorization" }] });
  const rawError = raw.data?.info?.error ?? raw.data;
  const rawMessage = String(rawError?.data?.message ?? rawError?.message ?? "");
  const rawGuardResults = guardObservations.slice(beforeRawGuards);
  const rawBlocked = (raw.status >= 400 || Boolean(raw.data?.info?.error)) && rawGuardResults.some(result => result.path === "/internal/agent-runs/provider-messages" && result.status >= 400 && result.status < 500) && modelCalls === beforeBlocked;
  console.log(JSON.stringify({ probe: "raw-runtime-without-gateway-run", status: raw.status, errorName: rawError?.name, errorMessage: rawMessage.slice(0, 220), guardResults: rawGuardResults, blockedBeforeInference: rawBlocked, extraModelCalls: modelCalls - beforeBlocked }));
  const usage = await api("/workspace/ws_guard_qa/model-usage/status");
  console.log(JSON.stringify({ scope: "real local Matterhorn gateway + pinned OpenCode + real guard plugin; synthetic inference, no external tools, NOT hosted or full desk acceptance", lostAck, modelCalls, promptPostAttempts, completedBeforeDrop, usedTokens: usage.data?.status?.monthly?.usedTokens, chargedTokens: usage.data?.status?.monthly?.chargedTokens, pendingRequests: usage.data?.status?.pendingRequests }));
  process.exitCode = results.every(result => result.status === 202 && result.finish === "stop" && result.modelCalls === 1) && usage.data?.status?.monthly?.usedTokens === (toolProbe ? 7000 : abortInFlight ? 6000 : 5000) && secretBlocked && rawBlocked && !retryCausedAdditionalInference && cancellationPassed && !failedStopReportedSuccess && toolProbePassed ? 0 : 1;
} catch (error) {
  console.log(JSON.stringify({ probe: "gateway-runtime-guard", error: error instanceof Error ? error.message : "QA failed", modelCalls }));
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  runtime.kill();
  let forcedStop = false;
  const forceStop = setTimeout(() => { forcedStop = true; runtime.kill("SIGKILL"); }, 3000);
  await runtime.exited;
  clearTimeout(forceStop);
  await guardBridge.stop(true); await gateway.stop(true); await stub.stop(true);
  if (transport) {
    const ownedTransport = transport;
    await new Promise<void>(resolve => { ownedTransport.close(() => resolve()); ownedTransport.closeAllConnections(); });
  }
  rmSync(root, { recursive: true, force: true });
  console.log(JSON.stringify({ probe: "fixture-cleanup", forcedRuntimeStop: forcedStop, generatedDataRemoved: true }));
}
