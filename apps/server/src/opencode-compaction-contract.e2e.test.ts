import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManagedProcessClose } from "./managed-opencode.js";
import { compactionPromptPart } from "./opencode-compaction-request.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";
import { resolveMatterhornManagedAgentPrompt } from "./workspace-init.js";

// This is a pinned-runtime contract probe, not production guard acceptance.
// No live provider, account, workspace or existing engine is used.
for (const route of ["contract", "compact", "summarize"]) {
test.skipIf(!process.env.MATTERHORN_TEST_OPENCODE_BIN)(`native compaction preserves a gateway-chosen parent: ${route}`, async () => {
  const binary = process.env.MATTERHORN_TEST_OPENCODE_BIN;
  if (!binary) throw new Error("An explicit isolated test runtime is required");
  const root = await mkdtemp(join(tmpdir(), "matterhorn-compaction-contract-"));
  const workspace = join(root, "workspace");
  const messageID = "msg_00000000000000000000000000000002";
  let engine: ReturnType<typeof spawn> | undefined;
  let provider: ReturnType<typeof Bun.serve> | undefined;
  let control: ReturnType<typeof Bun.serve> | undefined;
  let gateway: Awaited<ReturnType<typeof startServer>> | undefined;
  const providerId = route === "contract" ? "fixture" : "ollama";
  const priorEnv = new Map<string, string | undefined>();
  let providerCalls = 0;
  let claims = 0;
  const providerInputs: unknown[] = [];
  const controlFailures: string[] = [];
  try {
    await mkdir(workspace);
    const canonicalWorkspace = await realpath(workspace);
    const hook = new URL("./opencode-plugins/matterhorn-guard.ts", import.meta.url).href;
    control = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      if (request.headers.get("x-matterhorn-agent-runtime-secret") !== "disposable-compaction-control-key-at-least-32-bytes") return new Response(null, { status: 401 });
      if (route !== "contract") {
        if (!gateway) return new Response(null, { status: 503 });
        const path = new URL(request.url).pathname;
        if (path === "/internal/agent-runs/claim-compaction") claims += 1;
        const response = await fetch(`http://127.0.0.1:${gateway.port}${path}`, { method: "POST",
          headers: { "content-type": "application/json", "x-matterhorn-agent-runtime-secret": "disposable-compaction-control-key-at-least-32-bytes" },
          body: await request.text() });
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
      if (++providerCalls > 1) return new Response("Unexpected additional inference", { status: 429 });
      const common = { id: "fixture_compaction", object: "chat.completion.chunk", created: 1, model: "fixture" };
      const chunks = [
        { ...common, choices: [{ index: 0, delta: { role: "assistant", content: "Fixture summary of the synthetic conversation." }, finish_reason: null }] },
        { ...common, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
        { ...common, choices: [], usage: { prompt_tokens: 300, completion_tokens: 173, total_tokens: 473 } },
      ];
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
          share: "disabled", compaction: { auto: false, prune: false }, permission: { "*": "deny" },
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
    expect((await call("/global/health")).version).toBe(constants.opencodeVersion.replace(/^v/, ""));
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
    }
    const session = await call("/session", { title: "Compaction contract fixture" });
    await call(`/session/${session.id}/message`, {
      noReply: true, agent: "fixture",
      model: { providerID: providerId, modelID: "fixture" }, parts: [{ type: "text", text: "Remember the synthetic project color is blue." }],
    });
    if (route !== "contract") {
      if (!gateway) throw new Error("Missing isolated gateway");
      const base = `http://127.0.0.1:${gateway.port}`;
      const auth = { authorization: "Bearer disposable-compaction-user", "content-type": "application/json" };
      const path = route === "compact" ? `/workspace/ws_contract/sessions/${session.id}/compact`
        : `/w/ws_contract/opencode/session/${session.id}/summarize`;
      const reply = await fetch(`${base}${path}`, { method: "POST", headers: auth,
        body: JSON.stringify({ providerID: providerId, modelID: "fixture" }), signal: AbortSignal.timeout(20000) });
      const response: unknown = await reply.json();
      expect(reply.status, JSON.stringify({ response, controlFailures, runtimeLog: output })).toBe(route === "compact" ? 202 : 200);
      if (route === "summarize") expect(response).toBe(true);
      const history = await call(`/session/${session.id}/message`);
      expect(history).toHaveLength(3);
      expect(history[1].info).toMatchObject({ role: "user", agent: "fixture" });
      expect(history[1].parts).toEqual([expect.objectContaining({ type: "compaction", auto: false, messageID: history[1].info.id })]);
      expect(history[2].info).toMatchObject({ parentID: history[1].info.id, summary: true, finish: "stop", tokens: { input: 300, output: 173 } });
      for (let i = 0; i < 2; i++) {
        const usage = await fetch(`${base}/workspace/ws_contract/model-usage/status`, { headers: auth });
        expect(usage.status).toBe(200);
        expect((await usage.json()).status).toMatchObject({ pendingRequests: 0, monthly: { usedTokens: 473, reservedTokens: 0 } });
      }
      const receipts = await fetch(`${base}/workspace/ws_contract/agent-run-receipts?sessionId=${session.id}`, { headers: auth });
      expect(receipts.status).toBe(200);
      const items = (await receipts.json()).items;
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe("success");
      expect(providerCalls).toBe(1);
      expect(claims).toBe(1);
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
    if (engine) await createManagedProcessClose(engine).close();
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
