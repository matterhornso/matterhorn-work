import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManagedProcessClose } from "./managed-opencode.js";
import { compactionPromptPart } from "./opencode-compaction-request.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";
import { resolveMatterhornManagedAgentPrompt } from "./workspace-init.js";

// This is a pinned-runtime contract probe, not production guard acceptance.
// No live provider, account, workspace or existing engine is used.
for (const { route, replacement, throttle } of [
  { route: "contract", replacement: false }, { route: "compact", replacement: false }, { route: "summarize", replacement: false },
  { route: "compact", replacement: "messages" }, { route: "summarize", replacement: "messages" },
  { route: "compact", replacement: "system" }, { route: "summarize", replacement: "system" },
  { route: "compact", replacement: false, throttle: true }, { route: "summarize", replacement: false, throttle: true },
  { route: "chat", replacement: false }, { route: "chat", replacement: false, throttle: true },
  { route: "chat-tool", replacement: false },
  { route: "chat", replacement: "messages" }, { route: "chat", replacement: "system" },
  { route: "chat-stop", replacement: "messages" }, { route: "chat-stop", replacement: "system" },
  { route: "chat-stop-provider", replacement: false },
  { route: "chat-tool-stop-provider", replacement: false },
  { route: "chat-stop-stream", replacement: false },
  { route: "chat-replay", replacement: false }, { route: "chat-replay-restart", replacement: false },
  { route: "chat-restart", replacement: "messages" }, { route: "chat-restart", replacement: "system" },
  { route: "chat-restart-provider", replacement: false },
]) {
test.skipIf(!process.env.MATTERHORN_TEST_OPENCODE_BIN)(`native gateway preserves request identity: ${route}, replacement=${replacement}, throttle=${Boolean(throttle)}`, async () => {
  const binary = process.env.MATTERHORN_TEST_OPENCODE_BIN;
  if (!binary) throw new Error("An explicit isolated test runtime is required");
  const root = await mkdtemp(join(tmpdir(), "matterhorn-compaction-contract-"));
  const workspace = join(root, "workspace");
  const messageID = "msg_00000000000000000000000000000002";
  let engine: ReturnType<typeof spawn> | undefined;
  let provider: ReturnType<typeof Bun.serve> | undefined;
  let control: ReturnType<typeof Bun.serve> | undefined;
  let gateway: Awaited<ReturnType<typeof startServer>> | undefined;
  let gatewayConfig: ServerConfig | undefined;
  const providerId = route === "contract" ? "fixture" : "ollama";
  const chat = route.startsWith("chat");
  const tool = route.startsWith("chat-tool");
  const stopProvider = route.endsWith("stop-provider");
  const stopStream = route === "chat-stop-stream";
  const priorEnv = new Map<string, string | undefined>();
  let providerCalls = 0;
  let claims = 0;
  const providerInputs: unknown[] = [];
  const controlFailures: string[] = [];
  let releaseOld = () => {};
  let releaseNew = () => {};
  let reachedOld = () => {};
  let reachedNew = () => {};
  let checkedOld = () => {};
  const oldGate = new Promise<void>(resolve => { releaseOld = resolve; });
  const newGate = new Promise<void>(resolve => { releaseNew = resolve; });
  const oldReached = new Promise<void>(resolve => { reachedOld = resolve; });
  const newReached = new Promise<void>(resolve => { reachedNew = resolve; });
  const oldChecked = new Promise<void>(resolve => { checkedOld = resolve; });
  let delayed = false;
  let delayedStatus = 0;
  let delayedBody: unknown;
  let delayedInput: unknown;
  const claimedRuns: string[] = [];
  const pendingRequests: Promise<Response>[] = [];
  const eventAbort = new AbortController();
  let eventRead: Promise<void> | undefined;
  let eventDiagnostic = "";
  let completionBody = "";
  let completedRun = () => {};
  const completionRecorded = new Promise<void>(resolve => { completedRun = resolve; });
  const waitFor = async (promise: Promise<void>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([promise, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Native boundary timeout: ${JSON.stringify(controlFailures)} ${eventDiagnostic}`)), 10000);
      })]);
    } finally { clearTimeout(timer); }
  };
  try {
    await mkdir(workspace);
    const canonicalWorkspace = await realpath(workspace);
    if (tool) await writeFile(join(workspace, "synthetic.txt"), "Synthetic file value: cobalt-47\n", { mode: 0o600 });
    const hook = new URL("./opencode-plugins/matterhorn-guard.ts", import.meta.url).href;
    control = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      if (request.headers.get("x-matterhorn-agent-runtime-secret") !== "disposable-compaction-control-key-at-least-32-bytes") return new Response(null, { status: 401 });
      if (route !== "contract") {
        if (!gateway) return new Response(null, { status: 503 });
        const path = new URL(request.url).pathname;
        const forwardedBody = await request.text();
        // Stop must revoke gateway authority independently of a delayed
        // runtime completion notification.
        if (route === "chat-stop" && path === "/internal/agent-runs/complete") await newGate;
        if (path === "/internal/agent-runs/claim-compaction") {
          claims += 1;
          const claim: unknown = JSON.parse(forwardedBody);
          if (claim && typeof claim === "object" && "runId" in claim && typeof claim.runId === "string") claimedRuns.push(claim.runId);
        }
        if ((replacement === "messages" && path === "/internal/agent-runs/claim-compaction" && claims === 2)
          || (chat && replacement === "messages" && path === "/internal/agent-runs/provider-messages" && delayed)
          || (replacement === "system" && path === "/internal/agent-runs/provider-system" && delayed)) {
          reachedNew();
          await newGate;
        }
        const holdOld = Boolean(replacement) && !delayed && path === `/internal/agent-runs/provider-${replacement}`;
        if (holdOld) {
          delayedInput = JSON.parse(forwardedBody);
          delayed = true;
          reachedOld();
          await oldGate;
        }
        const response = await fetch(`http://127.0.0.1:${gateway.port}${path}`, { method: "POST",
          headers: { "content-type": "application/json", "x-matterhorn-agent-runtime-secret": "disposable-compaction-control-key-at-least-32-bytes" },
          body: forwardedBody }).catch(() => Response.json({ code: "fixture_gateway_restart_unavailable" }, { status: 503 }));
        if (holdOld) { delayedStatus = response.status; delayedBody = await response.clone().json(); checkedOld(); }
        if (path === "/internal/agent-runs/complete" && response.ok) {
          completionBody = forwardedBody;
          completedRun();
        }
        if (!response.ok) controlFailures.push(`${path}: ${await response.clone().text()}`);
        return response;
      }
      const body = await request.json();
      const path = new URL(request.url).pathname;
      if (path === "/internal/agent-runs/claim-compaction") {
        expect(body).toMatchObject({ workspaceDirectory: canonicalWorkspace, runId: "run_contract", messageId: messageID,
          providerId: "fixture", modelId: "fixture" });
        if (++claims !== 1) return new Response(null, { status: 409 });
        return Response.json({ runId: "run_contract", messageId: messageID });
      }
      if (path === "/internal/agent-runs/bind-message") {
        expect(body.userMessageId).toBe(messageID);
        return Response.json({ runId: "run_contract" });
      }
      if (path === "/internal/agent-runs/complete") return Response.json({ ok: true });
      return new Response(null, { status: 404 });
    } });
    provider = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      if (new URL(request.url).pathname !== "/v1/chat/completions") return new Response(null, { status: 404 });
      providerInputs.push(await request.json());
      providerCalls += 1;
      if (stopStream) {
        reachedOld();
        await newGate;
      }
      if ((stopProvider || route === "chat-restart-provider") && providerCalls === (tool ? 2 : 1)) {
        reachedOld();
        await oldGate;
      }
      if (throttle && providerCalls === 1) {
        return Response.json({ error: { message: "Synthetic rate limit", type: "rate_limit_error" } },
          { status: 429, headers: { "retry-after": "0" } });
      }
      if (providerCalls > (throttle || tool ? 2 : 1)) return new Response("Unexpected additional inference", { status: 429 });
      const common = { id: "fixture_compaction", object: "chat.completion.chunk", created: 1, model: "fixture" };
      if (tool && providerCalls === 1) {
        const chunks = [
          { ...common, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0,
            id: "call_synthetic_read", type: "function", function: { name: "read", arguments: JSON.stringify({ filePath: join(canonicalWorkspace, "synthetic.txt") }) } }] }, finish_reason: null }] },
          { ...common, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
          { ...common, choices: [], usage: { prompt_tokens: 100, completion_tokens: 23, total_tokens: 123 } },
        ];
        return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
          { headers: { "content-type": "text/event-stream" } });
      }
      const chunks = [
        { ...common, choices: [{ index: 0, delta: { role: "assistant", content: chat ? "Fixture answer to the synthetic request." : "Fixture summary of the synthetic conversation." }, finish_reason: null }] },
        { ...common, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
        { ...common, choices: [], usage: { prompt_tokens: 300, completion_tokens: 173, total_tokens: 473 } },
      ];
      if (stopStream) {
        let cancelled = false;
        const encoder = new TextEncoder();
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunks[0])}\n\n`));
            reachedOld();
            void oldGate.then(() => {
              if (cancelled) return;
              controller.enqueue(encoder.encode(chunks.slice(1).map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n"));
              controller.close();
            });
          },
          cancel() { cancelled = true; },
        }), { headers: { "content-type": "text/event-stream" } });
      }
      return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
        { headers: { "content-type": "text/event-stream" } });
    } });
    engine = spawn(binary, ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
      cwd: workspace, stdio: "pipe", env: {
        PATH: process.env.PATH,
        XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"),
        XDG_STATE_HOME: join(root, "state"), OPENCODE_CONFIG_DIR: join(root, "config"),
        OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_MODELS_FETCH: "true", OPENCODE_DISABLE_PROJECT_CONFIG: "true",
        OPENCODE_SERVER_USERNAME: "fixture", OPENCODE_SERVER_PASSWORD: "disposable-compaction-contract",
        OPENWORK_SERVER_URL: `http://127.0.0.1:${control.port}`, MATTERHORN_AGENT_RUNTIME_SECRET: "disposable-compaction-control-key-at-least-32-bytes",
        MATTERHORN_GUARDED_RUNTIME_MODE: "enforce",
        ...(route !== "contract" ? { MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED: "1" } : {}),
        OPENCODE_CONFIG_CONTENT: JSON.stringify({
          plugin: [hook], model: `${providerId}/fixture`, small_model: `${providerId}/fixture`, enabled_providers: [providerId],
          share: "disabled", compaction: { auto: false, prune: false }, permission: { "*": "deny", ...(tool ? { read: "allow" } : {}) },
          agent: { title: { disable: true }, fixture: { mode: "primary", prompt: "Answer synthetic test requests only." },
            compaction: { prompt: resolveMatterhornManagedAgentPrompt("compaction"), permission: { "*": "deny" } } },
          provider: { [providerId]: { npm: "@ai-sdk/openai-compatible", name: "Isolated fixture",
            options: { baseURL: `http://127.0.0.1:${provider.port}/v1`, apiKey: "fake-only" },
            models: { fixture: { name: "Fixture", limit: { context: 32768, output: 1024 } } } } },
        }),
      },
    });
    let output = "";
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Isolated runtime startup timeout: ${output}`)), 15000);
      const observe = (chunk: Buffer) => {
        output = `${output}${chunk.toString()}`.slice(-8192);
        const found = output.match(/opencode server listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (found) { clearTimeout(timer); resolve(found[1]); }
      };
      engine?.stdout?.on("data", observe);
      engine?.stderr?.on("data", observe);
      engine?.once("error", () => { clearTimeout(timer); reject(new Error("Isolated runtime could not start")); });
      engine?.once("exit", code => { clearTimeout(timer); reject(new Error(`Isolated runtime exited with ${code}: ${output}`)); });
    });
    const headers = { authorization: `Basic ${Buffer.from("fixture:disposable-compaction-contract").toString("base64")}`, "content-type": "application/json" };
    const call = async (path: string, body?: unknown) => {
      const response = await fetch(`${url}${path}?directory=${encodeURIComponent(workspace)}`, {
        headers, method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      expect(response.ok).toBe(true);
      return response.json();
    };
    const constants = JSON.parse(await readFile(new URL("../../../constants.json", import.meta.url), "utf8"));
    expect((await call("/global/health")).version).toBe(process.env.MATTERHORN_TEST_OPENCODE_VERSION ?? constants.opencodeVersion.replace(/^v/, ""));
    if (route !== "contract") {
      const isolatedEnv = {
        OPENWORK_DATA_DIR: join(root, "gateway"), MATTERHORN_WORK_DATA_DIR: join(root, "work-data"),
        MATTERHORN_AUTH_DB: join(root, "auth.db"), MATTERHORN_WORK_MEMORY_ROOT: join(root, "memory"),
        MATTERHORN_MODEL_USAGE_DB: join(root, "usage.db"), MATTERHORN_MODEL_USAGE_ENFORCEMENT: "hard",
        MATTERHORN_MODEL_USAGE_DAILY_LIMIT: "10000", MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT: "10000",
        MATTERHORN_MODEL_USAGE_GLOBAL_DAILY_LIMIT: "100000", MATTERHORN_MODEL_USAGE_GLOBAL_MONTHLY_LIMIT: "100000",
        MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS: "1000", MATTERHORN_GUARDED_RUNTIME_MODE: "enforce",
        MATTERHORN_AGENT_RUNTIME_SECRET: "disposable-compaction-control-key-at-least-32-bytes",
        MATTERHORN_CAPABILITY_SIGNING_SECRET: "disposable-compaction-signing-key-at-least-32-bytes",
      };
      for (const [name, value] of Object.entries(isolatedEnv)) {
        priorEnv.set(name, process.env[name]); process.env[name] = value;
      }
      const config: ServerConfig = {
        host: "127.0.0.1", port: 0, token: "disposable-compaction-user", hostToken: "disposable-compaction-host",
        approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: [], readOnly: false,
        opencodeBaseUrl: url, opencodeUsername: "fixture", opencodePassword: "disposable-compaction-contract",
        workspaces: [{ id: "ws_contract", name: "Disposable", path: canonicalWorkspace, workspaceType: "local", preset: "starter", baseUrl: url }],
        authorizedRoots: [canonicalWorkspace], startedAt: Date.now(), tokenSource: "cli", hostTokenSource: "cli",
        logFormat: "pretty", logRequests: false, reloadWatchers: false,
      };
      gateway = await startServer(config);
      gatewayConfig = config;
    }
    const session = await call("/session", { title: "Compaction contract fixture" });
    await call(`/session/${session.id}/message`, {
      noReply: true, agent: "fixture",
      model: { providerID: providerId, modelID: "fixture" }, parts: [{ type: "text", text: "Remember the synthetic project color is blue." }],
    });
    if (route !== "contract") {
      if (!gateway) throw new Error("Missing isolated gateway");
      let base = `http://127.0.0.1:${gateway.port}`;
      const auth = { authorization: "Bearer disposable-compaction-user", "content-type": "application/json" };
      if (chat) {
        const observeStream = async () => {
          const events = await fetch(`${url}/event?directory=${encodeURIComponent(workspace)}`, { headers, signal: eventAbort.signal });
          expect(events.status).toBe(200);
          const reader = events.body?.getReader();
          if (!reader) throw new Error("Native event stream unavailable");
          eventRead = (async () => {
            const decoder = new TextDecoder();
            let buffer = "";
            try {
              while (true) {
                const next = await reader.read();
                if (next.done) throw new Error("Native event stream ended before text delta");
                buffer += decoder.decode(next.value, { stream: true }).replaceAll("\r", "");
                eventDiagnostic = buffer.slice(-6000);
                const frames = buffer.split("\n\n");
                buffer = frames.pop() ?? "";
                for (const frame of frames) {
                  const data = frame.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim();
                  if (!data) continue;
                  const event: unknown = JSON.parse(data);
                  if (!event || typeof event !== "object" || !("type" in event) || event.type !== "message.part.delta"
                    || !("properties" in event) || !event.properties || typeof event.properties !== "object") continue;
                  const properties = event.properties;
                  if ("sessionID" in properties && properties.sessionID === session.id
                    && "delta" in properties && properties.delta === "Fixture answer to the synthetic request.") {
                    reachedNew();
                    return;
                  }
                }
              }
            } finally { await reader.cancel().catch(() => undefined); }
          })();
          void eventRead.catch(() => {});
        };
        const sendChat = () => fetch(`${base}/workspace/ws_contract/sessions/${session.id}/messages`, {
          method: "POST", headers: auth, signal: AbortSignal.timeout(20000),
          body: JSON.stringify({ agentId: "fixture", model: { providerID: providerId, modelID: "fixture" },
            message: tool ? "Read synthetic.txt from this workspace, then answer." : "Answer the synthetic project question.", executionMode: "work" }),
        });
        const sent = await sendChat();
        let accepted = await sent.json();
        expect(sent.status, JSON.stringify({ accepted, controlFailures, runtimeLog: output })).toBe(202);
        if (route.startsWith("chat-restart")) {
          await waitFor(oldReached);
          if (!gatewayConfig) throw new Error("Missing disposable gateway configuration");
          await gateway.stop();
          gateway = await startServer(gatewayConfig);
          base = `http://127.0.0.1:${gateway.port}`;
          releaseOld();
          if (replacement) {
            await waitFor(oldChecked);
            expect(delayedStatus, JSON.stringify(delayedBody)).toBe(409);
            const deadline = Date.now() + 5000;
            let items: Array<{ runId: string; status: string }> = [];
            do {
              const receipts = await fetch(`${base}/workspace/ws_contract/agent-run-receipts?sessionId=${session.id}`, { headers: auth });
              expect(receipts.status).toBe(200);
              items = (await receipts.json()).items;
              if (items.some(item => item.runId === accepted.runId && item.status !== "pending")) break;
              await new Promise(resolve => setTimeout(resolve, 100));
            } while (Date.now() < deadline);
            const history = await call(`/session/${session.id}/message`);
            expect(history.at(-1)?.info, JSON.stringify(history)).toMatchObject({
              role: "assistant", time: { completed: expect.any(Number) },
              error: { name: "UnknownError" }, tokens: { input: 0, output: 0 },
            });
            expect(items, JSON.stringify({ history, controlFailures, completionBody })).toEqual([
              expect.objectContaining({ runId: accepted.runId, status: "error" }),
            ]);
            const usage = await fetch(`${base}/workspace/ws_contract/model-usage/status`, { headers: auth });
            expect(usage.status).toBe(200);
            expect((await usage.json()).status).toMatchObject({ pendingRequests: 1,
              monthly: { usedTokens: 0, reservedTokens: 1000 } });
            expect(providerCalls).toBe(0);
            return;
          }
        }
        if (stopStream) {
          await waitFor(oldReached);
          // Gateway preparation may reload the native workspace. Subscribe to
          // the current instance after preparation, before releasing any text.
          await observeStream();
          releaseNew();
        }
        if (stopProvider || stopStream) {
          await waitFor(oldReached);
          if (stopStream && eventRead) await waitFor(Promise.race([newReached, eventRead]));
          const stopped = await fetch(`${base}/w/ws_contract/opencode/session/${session.id}/abort`, {
            method: "POST", headers: auth, body: "{}", signal: AbortSignal.timeout(10000),
          });
          expect(stopped.status, await stopped.text()).toBe(200);
          releaseOld();
          const history = await call(`/session/${session.id}/message`);
          expect(history.at(-1)?.info, JSON.stringify(history)).toMatchObject({ role: "assistant", error: { name: "MessageAbortedError" } });
          for (let i = 0; i < 2; i++) {
            const usage = await fetch(`${base}/workspace/ws_contract/model-usage/status`, { headers: auth });
            expect(usage.status).toBe(200);
            expect((await usage.json()).status, JSON.stringify(history)).toMatchObject({ pendingRequests: 1,
              monthly: { usedTokens: 0, reservedTokens: 1000 } });
          }
          expect(providerCalls).toBe(tool ? 2 : 1);
          if (tool) expect(JSON.stringify(providerInputs[1])).toContain("cobalt-47");
          return;
        }
        if (route === "chat-stop") {
          await waitFor(oldReached);
          const stopped = await fetch(`${base}/w/ws_contract/opencode/session/${session.id}/abort`, {
            method: "POST", headers: auth, body: "{}", signal: AbortSignal.timeout(10000),
          });
          expect(stopped.status, await stopped.text()).toBe(200);
          releaseOld();
          await waitFor(oldChecked);
          expect(delayedStatus, JSON.stringify({ delayedBody, delayedInput })).toBe(409);
          releaseNew();
          const deadline = Date.now() + 12000;
          let items: Array<{ runId: string; status: string }> = [];
          do {
            const receipts = await fetch(`${base}/workspace/ws_contract/agent-run-receipts?sessionId=${session.id}`, { headers: auth });
            expect(receipts.status).toBe(200);
            items = (await receipts.json()).items;
            if (items.some(item => item.runId === accepted.runId && item.status !== "pending")) break;
            await new Promise(resolve => setTimeout(resolve, 50));
          } while (Date.now() < deadline);
          expect(items).toHaveLength(1);
          expect(items[0].runId).toBe(accepted.runId);
          expect(items[0].status).toBe("cancelled");
          const usage = await fetch(`${base}/workspace/ws_contract/model-usage/status`, { headers: auth });
          expect((await usage.json()).status).toMatchObject({ pendingRequests: 0,
            monthly: { usedTokens: 0, reservedTokens: 0 } });
          expect(providerCalls).toBe(0);
          return;
        }
        let oldRunId: string | undefined;
        if (replacement) {
          oldRunId = accepted.runId;
          await waitFor(oldReached);
          let second = await sendChat();
          accepted = await second.json();
          if (second.status === 409) {
            // Aborting the first native request can change stored history
            // after preflight. Preserve that denial; explicitly resubmit with
            // a fresh privacy check rather than weakening transcript binding.
            expect(accepted.code).toBe("agent_privacy_request_changed");
            expect(providerCalls).toBe(0);
            second = await sendChat();
            accepted = await second.json();
          }
          expect(second.status, JSON.stringify(accepted)).toBe(202);
          expect(accepted.runId).not.toBe(oldRunId);
          await waitFor(newReached);
          releaseOld();
          await waitFor(oldChecked);
          expect(delayedStatus, JSON.stringify({ delayedBody, delayedInput })).toBe(409);
          releaseNew();
        }
        const deadline = Date.now() + 12000;
        let history = await call(`/session/${session.id}/message`);
        while (!history.some((entry: { info: { finish?: string } }) => entry.info.finish === "stop") && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 50));
          history = await call(`/session/${session.id}/message`);
        }
        expect(history.at(-1)?.info, JSON.stringify({ history, controlFailures, runtimeLog: output }))
          .toMatchObject({ role: "assistant", finish: "stop", tokens: { input: 300, output: 173 } });
        const parent = history.find((entry: { info: { role: string; id: string } }) => entry.info.role === "user" && entry.info.id === history.at(-1).info.parentID);
        expect(parent?.info.agent).toBe("fixture");
        expect(history.at(-1).parts).toContainEqual(expect.objectContaining({ type: "text", text: "Fixture answer to the synthetic request." }));
        if (tool) {
          expect(JSON.stringify(providerInputs[1])).toContain("cobalt-47");
          expect(history.flatMap((entry: { parts: unknown[] }) => entry.parts)).toContainEqual(expect.objectContaining({
            type: "tool", tool: "read", state: expect.objectContaining({ status: "completed" }),
          }));
        }
        for (let i = 0; i < 2; i++) {
          const usage = await fetch(`${base}/workspace/ws_contract/model-usage/status`, { headers: auth });
          expect(usage.status).toBe(200);
          expect((await usage.json()).status).toMatchObject({ pendingRequests: 0,
            monthly: { usedTokens: tool ? 596 : 473, reservedTokens: 0 } });
        }
        const receipts = await fetch(`${base}/workspace/ws_contract/agent-run-receipts?sessionId=${session.id}`, { headers: auth });
        expect(receipts.status).toBe(200);
        const items = (await receipts.json()).items;
        expect(items).toHaveLength(replacement ? 2 : 1);
        expect(items).toContainEqual(expect.objectContaining({ runId: accepted.runId, status: "success" }));
        if (oldRunId) expect(items.find((item: { runId: string }) => item.runId === oldRunId)?.status).toMatch(/^(cancelled|error)$/);
        expect(providerCalls).toBe(throttle || tool ? 2 : 1);
        expect(controlFailures).toHaveLength(replacement ? 1 : 0);
        expect(claims).toBe(0);
        if (route.startsWith("chat-replay")) {
          await waitFor(completionRecorded);
          const report: unknown = JSON.parse(completionBody);
          if (!report || typeof report !== "object" || Array.isArray(report)) throw new Error("Missing native completion report");
          const original = items.find((item: { runId: string }) => item.runId === accepted.runId);
          if (route === "chat-replay-restart") {
            if (!gatewayConfig) throw new Error("Missing disposable gateway configuration");
            await gateway.stop();
            gateway = await startServer(gatewayConfig);
          }
          const replayBase = `http://127.0.0.1:${gateway.port}`;
          // Do not prime the restarted gateway's receipt cache before replay.
          for (const body of [report, { ...report, status: "error", usage: { inputTokens: 1, outputTokens: 1 } }, report]) {
            const replay = await fetch(`${replayBase}/internal/agent-runs/complete`, {
              method: "POST", headers: { "content-type": "application/json",
                "x-matterhorn-agent-runtime-secret": "disposable-compaction-control-key-at-least-32-bytes" },
              body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
            });
            expect(replay.status, await replay.text()).toBe(200);
          }
          const replayed = await fetch(`${replayBase}/workspace/ws_contract/agent-run-receipts?sessionId=${session.id}`, { headers: auth });
          expect(replayed.status).toBe(200);
          expect((await replayed.json()).items).toEqual([expect.objectContaining({ runId: accepted.runId,
            status: "success", completedAt: original.completedAt, responseDurationMs: original.responseDurationMs,
            usage: original.usage, capabilities: original.capabilities })]);
          const usage = await fetch(`${replayBase}/workspace/ws_contract/model-usage/status`, { headers: auth });
          expect(usage.status).toBe(200);
          expect((await usage.json()).status).toMatchObject({ pendingRequests: 0,
            monthly: { usedTokens: 473, reservedTokens: 0 } });
          expect(providerCalls).toBe(1);
        }
        return;
      }
      const path = route === "compact" ? `/workspace/ws_contract/sessions/${session.id}/compact`
        : `/w/ws_contract/opencode/session/${session.id}/summarize`;
      const send = () => {
        const request = fetch(`${base}${path}`, { method: "POST", headers: auth,
          body: JSON.stringify({ providerID: providerId, modelID: "fixture" }), signal: AbortSignal.timeout(20000) });
        pendingRequests.push(request);
        void request.catch(() => {}); // Cleanup still awaits every request on an early assertion failure.
        return request;
      };
      let reply: Response;
      if (replacement) {
        const first = send();
        await waitFor(oldReached);
        const second = send();
        await waitFor(newReached);
        releaseOld();
        const oldResponse = await first;
        expect(oldResponse.status).toBeGreaterThanOrEqual(400);
        releaseNew();
        reply = await second;
        expect(delayedStatus, JSON.stringify({ delayedBody, delayedInput, claimedRuns })).toBe(409);
        if (replacement === "system") {
          expect(delayedInput).toMatchObject({ expectedRunId: claimedRuns[0] });
          expect(delayedBody).toMatchObject({ code: "agent_provider_system_not_bound" });
        }
      } else reply = await send();
      const response: unknown = await reply.json();
      expect(reply.status, JSON.stringify({ response, controlFailures, runtimeLog: output })).toBe(route === "compact" ? 202 : 200);
      if (route === "summarize") expect(response).toBe(true);
      const history = await call(`/session/${session.id}/message`);
      expect(history).toHaveLength(replacement ? (replacement === "system" ? 5 : 4) : 3);
      const parent = history.at(-2);
      const summary = history.at(-1);
      expect(parent.info).toMatchObject({ role: "user", agent: "fixture" });
      expect(parent.parts).toEqual([expect.objectContaining({ type: "compaction", auto: false, messageID: parent.info.id })]);
      expect(summary.info).toMatchObject({ parentID: parent.info.id, summary: true, finish: "stop", tokens: { input: 300, output: 173 } });
      for (let i = 0; i < 2; i++) {
        const usage = await fetch(`${base}/workspace/ws_contract/model-usage/status`, { headers: auth });
        expect(usage.status).toBe(200);
        expect((await usage.json()).status).toMatchObject({ pendingRequests: 0, monthly: { usedTokens: 473, reservedTokens: 0 } });
      }
      const receipts = await fetch(`${base}/workspace/ws_contract/agent-run-receipts?sessionId=${session.id}`, { headers: auth });
      expect(receipts.status).toBe(200);
      const items = (await receipts.json()).items;
      expect(items).toHaveLength(replacement ? 2 : 1);
      expect(items.filter((item: { status: string }) => item.status === "success")).toHaveLength(1);
      expect(items.find((item: { runId: string }) => item.runId === claimedRuns.at(-1))?.status).toBe("success");
      if (replacement) {
        expect(items.find((item: { runId: string }) => item.runId === claimedRuns[0])?.status).toMatch(/^(cancelled|error)$/);
      }
      expect(providerCalls).toBe(throttle ? 2 : 1);
      expect(claims).toBe(replacement ? 2 : 1);
      expect(JSON.stringify(providerInputs)).toContain("synthetic project color is blue");
      expect(JSON.stringify(providerInputs)).not.toContain("matterhornCompactionRun");
      return;
    }
    const result = await call(`/session/${session.id}/message`, { messageID, agent: "fixture",
      model: { providerID: "fixture", modelID: "fixture" },
      parts: [compactionPromptPart("run_contract")],
    });
    expect(result.info).toMatchObject({ parentID: messageID, role: "assistant", summary: true, finish: "stop",
      tokens: { input: 300, output: 173 } });
    expect(providerCalls).toBe(1);
    expect(claims).toBe(1);
    expect(JSON.stringify(providerInputs)).toContain("synthetic project color is blue");
    expect(JSON.stringify(providerInputs)).not.toContain("run_contract");
    const history = await call(`/session/${session.id}/message`);
    expect(history).toHaveLength(3);
    expect(history[1].info).toMatchObject({ id: messageID, role: "user", agent: "fixture" });
    expect(history[1].parts).toEqual([expect.objectContaining({ type: "compaction", auto: false, messageID })]);
    expect(history[2].info.id).toBe(result.info.id);
  } finally {
    releaseOld();
    releaseNew();
    eventAbort.abort();
    if (eventRead) await Promise.allSettled([eventRead]);
    if (engine) await createManagedProcessClose(engine).close();
    await Promise.allSettled(pendingRequests);
    await gateway?.stop();
    provider?.stop(true);
    control?.stop(true);
    for (const [name, value] of priorEnv) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await rm(root, { recursive: true, force: true });
  }
}, 45000);
}
