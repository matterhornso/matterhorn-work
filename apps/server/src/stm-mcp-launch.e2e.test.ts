import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { StmCredentials, StmMcpLaunches } from "@matterhorn-work/stm-credentials";
import { approveStmMcp } from "./stm-mcp.js";
import { opencodeConfigPath } from "./workspace-files.js";
import { createManagedProcessClose } from "./managed-opencode.js";

test("trusted stdio launcher completes an MCP request with selected fake credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "stm-mcp-stdio-"));
  const workspace = join(root, "workspace");
  const stmDir = join(root, ".subscribetome");
  await mkdir(workspace); await mkdir(stmDir);
  const secret = "disposable-stdio-fixture";
  const token = "b".repeat(48);
  let resolutions = 0;
  const daemon = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async request => {
    if (request.headers.get("x-stm-token") !== token) return new Response(null, { status: 401 });
    if (request.url.endsWith("capabilities")) return Response.json({ version: 1, selectedResolution: true, backend: "fake stdio test", revisionedResolution: true });
    if (request.url.endsWith("keys")) return Response.json({ version: 1, keys: [{ tool: "fixture", label: "default", status: "active", updatedAt: "2026-09-28", revision: "c".repeat(64) }] });
    const body = await request.json();
    if (!body.includeRevisions || body.bindings.length !== 1 || body.bindings[0].envName !== "FIXTURE_KEY") return new Response(null, { status: 400 });
    resolutions++;
    return Response.json({ version: 1, values: { FIXTURE_KEY: secret }, revisions: { FIXTURE_KEY: "c".repeat(64) } });
  } });
  let child: ReturnType<typeof spawn> | undefined;
  let engine: ReturnType<typeof spawn> | undefined;
  let nativeServer: ReturnType<typeof spawn> | undefined;
  let inference: ReturnType<typeof Bun.serve> | undefined;
  let orphanPid: number | undefined;
  let launchRegistry: StmMcpLaunches | undefined;
  let testGrantId: string | undefined;
  try {
    const descriptorPath = join(stmDir, "daemon.json");
    await writeFile(descriptorPath, JSON.stringify({ port: daemon.port, pid: process.pid, token }), { mode: 0o600 });
    const credentials = new StmCredentials({ enabled: true, platform: "darwin", localDesktop: true, descriptorPath, registryPath: join(root, "stm-bindings.json") });
    if (!process.env.STM_TEST_COMPILED_SERVER) await credentials.connect({ consent: true });
    const launches = new StmMcpLaunches({ credentials, registryPath: join(root, "stm-mcp-launches.json") });
    launchRegistry = launches;
    const fixture = join(root, "fixture.mjs");
    const callsPath = join(root, "tool-calls.jsonl");
    await writeFile(callsPath, "");
    await writeFile(fixture, `import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const lines = createInterface({input: process.stdin});
// Deliberately survive stdin EOF to exercise an MCP outliving a crashed wrapper.
setInterval(() => {}, 1000);
lines.on("line", line => {
  const r = JSON.parse(line);
  if (r.id === undefined) return;
  if (r.method === "tools/call") appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({method:r.method,name:r.params.name})+"\\n");
  if (r.method === "tools/call" && r.params.arguments?.hold) {
    process.on("SIGTERM", () => appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify({signalIgnored:"SIGTERM"})+"\\n"));
    return; // unfinished tool call; wrapper must still be able to stop it
  }
  const result = r.method === "initialize"
    ? { protocolVersion: "2024-11-05", capabilities: {tools:{}}, serverInfo:{name:"disposable-fixture",version:"1"} }
    : r.method === "tools/list" ? {tools:[{name:"probe",description:"Check fixture only",inputSchema:{type:"object",properties:{}}}]}
    : {content:[{type:"text",text:JSON.stringify({credentialPresent:Boolean(process.env.FIXTURE_KEY),credentialLength:process.env.FIXTURE_KEY?.length})}]};
  process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:r.id,result})+"\\n");
});
`);
    const launcher = process.env.STM_TEST_COMPILED_SERVER
      ? [process.env.STM_TEST_COMPILED_SERVER, "--stm-mcp"]
      : process.env.STM_TEST_COMPILED_LAUNCHER
      ? [process.env.STM_TEST_COMPILED_LAUNCHER]
      : [process.execPath, fileURLToPath(new URL("./stm-mcp-entry.ts", import.meta.url))];
    await writeFile(opencodeConfigPath(workspace), JSON.stringify({ mcp: { fixture: { type: "local", command: [process.execPath, fixture] } } }));
    let grant;
    if (process.env.STM_TEST_COMPILED_SERVER) {
      nativeServer = spawn(process.env.STM_TEST_COMPILED_SERVER, ["--host", "127.0.0.1", "--port", "0", "--workspace", workspace, "--approval", "auto"], {
        cwd: root, stdio: "pipe", env: { PATH: process.env.PATH, HOME: root,
          XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"),
          MATTERHORN_WORK_ENV_STORE: join(root, "env.json"), MATTERHORN_WORK_STM_ENABLED: "1",
          MATTERHORN_WORK_TOKEN: "fixture-client-token", MATTERHORN_WORK_HOST_TOKEN: "fixture-host-token",
          MATTERHORN_WORK_DATA_DIR: join(root, "server-data"), MATTERHORN_AUTH_DB: join(root, "auth.db"),
          MATTERHORN_WORK_RATE_LIMIT_DB: join(root, "rate.db"), OPENWORK_TOKEN_STORE: join(root, "tokens.json"),
        },
      });
      let logs = "";
      nativeServer.stderr!.on("data", data => { logs += String(data); });
      const base = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Native fixture server startup timeout")), 10000);
        nativeServer!.once("error", () => { clearTimeout(timer); reject(new Error("Native fixture server failed to start")); });
        nativeServer!.stdout!.on("data", data => {
          logs += String(data);
          const match = logs.match(/server listening on (http:\/\/127\.0\.0\.1:\d+)/);
          if (match) { clearTimeout(timer); resolve(match[1]); }
        });
      });
      const headers = { "x-matterhorn-host-token": "fixture-host-token", "content-type": "application/json" };
      const paired = await fetch(`${base}/env/stm/connect`, { method: "POST", headers, body: '{"consent":true}' });
      expect(paired.status).toBe(200);
      const workspaces = await (await fetch(`${base}/workspaces`, { headers: { authorization: "Bearer fixture-client-token" } })).json();
      const approved = await fetch(`${base}/workspace/${workspaces.activeId}/mcp/fixture/stm`, { method: "POST", headers,
        body: JSON.stringify({ consent: true, bindings: [{ envName: "FIXTURE_KEY", tool: "fixture", label: "default" }] }) });
      expect(approved.status).toBe(201);
      const body = await approved.json();
      grant = (await launches.list()).find(entry => entry.id === body.id);
      if (!grant) throw new Error("Native approval did not persist a grant");
      expect(grant.launcher).toEqual(launcher);
      expect(resolutions).toBe(0);
      expect(logs).not.toContain(secret); expect(logs).not.toContain(token);
      await createManagedProcessClose(nativeServer).close(); nativeServer = undefined;
    } else {
      grant = await approveStmMcp({ launches, workspace, name: "fixture", launcher,
        bindings: [{ envName: "FIXTURE_KEY", tool: "fixture", label: "default" }], consent: true, legacyNames: [] });
    }
    testGrantId = grant.id;
    if (process.env.STM_TEST_OPENCODE_BIN) {
      let modelCalls = 0;
      const providerBodies: string[] = [];
      inference = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
        if (new URL(request.url).pathname !== "/v1/chat/completions") return new Response(null, { status: 404 });
        const body = await request.json();
        providerBodies.push(JSON.stringify(body));
        if (++modelCalls > 9) return new Response(null, { status: 429 });
        const hasResult = body.messages.some((message: { role: string }) => message.role === "tool");
        const common = { id: `fixture_${modelCalls}`, object: "chat.completion.chunk", created: 1, model: "fixture" };
        const delta = hasResult ? { role: "assistant", content: "FIXTURE_COMPLETE" }
          : { role: "assistant", tool_calls: [{ index: 0, id: `call_${modelCalls}`, type: "function", function: { name: "fixture_probe", arguments: "{}" } }] };
        const chunks = [
          { ...common, choices: [{ index: 0, delta, finish_reason: null }] },
          { ...common, choices: [{ index: 0, delta: {}, finish_reason: hasResult ? "stop" : "tool_calls" }] },
          { ...common, choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
        ];
        return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
      } });
      engine = spawn(process.env.STM_TEST_OPENCODE_BIN, ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
        cwd: workspace, stdio: "pipe", env: { PATH: process.env.PATH, HOME: root,
          XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"),
          MATTERHORN_WORK_ENV_STORE: join(root, "env.json"), MATTERHORN_WORK_STM_ENABLED: "1",
          OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_MODELS_FETCH: "true",
          OPENCODE_CONFIG_CONTENT: JSON.stringify({
            plugin: [], model: "fixture/fixture", small_model: "fixture/fixture", enabled_providers: ["fixture"],
            share: "disabled", compaction: { auto: false, prune: false }, permission: { "*": "deny", fixture_probe: "ask" },
            agent: { title: { disable: true }, fixture: { mode: "primary", steps: 3, prompt: "Use only the fixture tool." } },
            provider: { fixture: { npm: "@ai-sdk/openai-compatible", name: "Isolated fixture", options: { baseURL: `http://127.0.0.1:${inference.port}/v1`, apiKey: "fake-only" }, models: { fixture: { name: "Fixture", tool_call: true, limit: { context: 32768, output: 1024 } } } } },
          }),
          OPENCODE_SERVER_USERNAME: "fixture", OPENCODE_SERVER_PASSWORD: "disposable-local-password",
        },
      });
      let engineOutput = "";
      engine.stderr!.on("data", data => { engineOutput += String(data); });
      const url = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Isolated OpenCode startup timeout")), 10000);
        engine!.once("error", () => { clearTimeout(timer); reject(new Error("Isolated OpenCode could not start")); });
        engine!.stdout!.on("data", data => {
          engineOutput += String(data);
          const match = engineOutput.match(/opencode server listening on (http:\/\/127\.0\.0\.1:\d+)/);
          if (match) { clearTimeout(timer); resolve(match[1]); }
        });
      });
      const headers = { Authorization: `Basic ${Buffer.from("fixture:disposable-local-password").toString("base64")}` };
      const suffix = `?directory=${encodeURIComponent(workspace)}`;
      const response = await fetch(`${url}/mcp${suffix}`, { headers, signal: AbortSignal.timeout(10000) });
      expect(response.status).toBe(200);
      const status = await response.json();
      expect(status.fixture.status).toBe("connected");
      expect(resolutions).toBe(1);
      const jsonRequest = async (path: string, body?: unknown) => {
        const result = await fetch(`${url}${path}${suffix}`, { headers: { ...headers, "content-type": "application/json" },
          method: body === undefined ? "GET" : "POST", body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
        expect(result.ok).toBe(true);
        return result.json();
      };
      for (const action of ["allow", "deny", "ask"]) {
        const session = await jsonRequest("/session", { title: `STM ${action} fixture`, permission: [{ permission: "fixture_probe", pattern: "*", action }] });
        const pending = jsonRequest(`/session/${session.id}/message`, {
          agent: "fixture", model: { providerID: "fixture", modelID: "fixture" }, parts: [{ type: "text", text: "Call fixture_probe once." }],
        });
        if (action === "ask") {
          let permissionID: string | undefined;
          for (let i = 0; i < 100 && !permissionID; i++) {
            const requests = await jsonRequest("/permission");
            permissionID = requests.find((entry: { sessionID: string }) => entry.sessionID === session.id)?.id;
            if (!permissionID) await Bun.sleep(50);
          }
          expect(permissionID).toBeDefined();
          if (!permissionID) throw new Error("Expected engine permission request");
          expect((await readFile(callsPath, "utf8")).trim().split("\n")).toHaveLength(1);
          await jsonRequest(`/permission/${permissionID}/reply`, { reply: "reject" });
        }
        const result = await pending;
        // An explicit rejection stops the engine turn; it must not resume inference.
        expect(JSON.stringify(result)).toContain(action === "ask" ? "The user rejected permission" : "FIXTURE_COMPLETE");
        const history = JSON.stringify(await jsonRequest(`/session/${session.id}/message`));
        expect(history).toContain('"tool":"fixture_probe"');
        expect(history).toContain(action === "allow" ? '"status":"completed"' : '"status":"error"');
        expect(history).not.toContain(secret); expect(history).not.toContain(token);
        const calls = (await readFile(callsPath, "utf8")).trim().split("\n");
        expect(calls).toHaveLength(1);
        expect(JSON.parse(calls[0])).toEqual({ method: "tools/call", name: "probe" });
      }
      expect(modelCalls).toBe(5);
      expect(providerBodies.some(body => body.includes('credentialPresent'))).toBe(true);
      expect(providerBodies.join("\n")).not.toContain(secret);
      expect(providerBodies.join("\n")).not.toContain(token);
      const disconnected = await fetch(`${url}/mcp/fixture/disconnect${suffix}`, { method: "POST", headers, signal: AbortSignal.timeout(5000) });
      expect(disconnected.ok).toBe(true);
      for (let i = 0; i < 100 && (await launches.list())[0].active; i++) await Bun.sleep(10);
      expect((await launches.list())[0].active).toBeNull();
      expect(engineOutput).not.toContain(secret); expect(engineOutput).not.toContain(token);
      await createManagedProcessClose(engine).close(); engine = undefined;
    }
    child = spawn(launcher[0], [...launcher.slice(1), grant.id], { cwd: workspace, stdio: "pipe",
      env: { PATH: process.env.PATH, HOME: root, MATTERHORN_WORK_ENV_STORE: join(root, "env.json"), MATTERHORN_WORK_STM_ENABLED: "1" } });
    let stderr = "";
    child.stderr!.on("data", data => { stderr += String(data); });
    const lines = createInterface({ input: child.stdout! });
    const iterator = lines[Symbol.asyncIterator]();
    const request = async (id: number, method: string) => {
      child!.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: {} }) + "\n");
      const line = await Promise.race([iterator.next(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("MCP fixture timeout")), 5000))]);
      if (line.done) throw new Error("MCP fixture closed before response");
      expect(line.value).not.toContain(secret); expect(line.value).not.toContain(token);
      return JSON.parse(line.value);
    };
    expect((await request(1, "initialize")).result.serverInfo.name).toBe("disposable-fixture");
    expect((await request(2, "tools/list")).result.tools[0].name).toBe("probe");
    expect(JSON.parse((await request(3, "tools/call")).result.content[0].text)).toEqual({ credentialPresent: true, credentialLength: secret.length });
    expect(resolutions).toBe(process.env.STM_TEST_OPENCODE_BIN ? 2 : 1);
    expect((await launches.list())[0].active?.revisions).toEqual({ FIXTURE_KEY: "c".repeat(64) });
    const beforeHold = (await readFile(callsPath, "utf8")).trim().split("\n").length;
    child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "probe", arguments: { hold: true } } }) + "\n");
    for (let i = 0; i < 100 && (await readFile(callsPath, "utf8")).trim().split("\n").length === beforeHold; i++) await Bun.sleep(10);
    expect((await readFile(callsPath, "utf8")).trim().split("\n")).toHaveLength(beforeHold + 1);
    const closed = new Promise(resolve => child!.once("close", resolve));
    child.stdin!.end(); await closed;
    expect(await readFile(callsPath, "utf8")).toContain('"signalIgnored":"SIGTERM"');
    expect((await launches.list())[0].active).toBeNull();
    expect(stderr).not.toContain(secret); expect(stderr).not.toContain(token);
    lines.close();
    child = spawn(launcher[0], [...launcher.slice(1), grant.id], { cwd: workspace, stdio: "pipe",
      env: { PATH: process.env.PATH, HOME: root, MATTERHORN_WORK_ENV_STORE: join(root, "env.json"), MATTERHORN_WORK_STM_ENABLED: "1" } });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Crash fixture startup timeout")), 5000);
      child!.stdout!.once("data", () => { clearTimeout(timer); resolve(); });
      child!.once("error", () => { clearTimeout(timer); reject(new Error("Crash fixture failed to start")); });
      child!.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
    });
    const active = (await launches.list())[0].active;
    if (!active?.pid) throw new Error("Expected a published child PID");
    orphanPid = active.pid;
    const crashed = new Promise(resolve => child!.once("close", resolve));
    child.kill("SIGKILL"); await crashed;
    await expect(launches.recoverExited(grant.id, { expectedLaunchId: active.id, consent: true })).rejects.toThrow("consumer_still_running");
    process.kill(orphanPid, "SIGTERM"); // only the test-owned orphan just observed
    let absent = false;
    for (let i = 0; i < 100 && !absent; i++) {
      try { process.kill(orphanPid, 0); }
      catch (error) { if (error instanceof Error && "code" in error && error.code === "ESRCH") absent = true; else throw error; }
      if (!absent) await Bun.sleep(10);
    }
    expect(absent).toBe(true);
    if (absent) orphanPid = undefined;
    await launches.recoverExited(grant.id, { expectedLaunchId: active.id, consent: true });
    expect((await launches.list())[0].active).toBeNull();
    expect((await credentials.listBindings())).toHaveLength(1);
  } finally {
    child?.kill("SIGKILL");
    if (engine) await createManagedProcessClose(engine).close();
    if (nativeServer) await createManagedProcessClose(nativeServer).close();
    // Also clean up if startup or an assertion failed before the PID was copied.
    const recordedPid = (await launchRegistry?.list())?.find(entry => entry.id === testGrantId)?.active?.pid;
    const cleanupPid = orphanPid ?? recordedPid;
    if (cleanupPid) { try { process.kill(cleanupPid, "SIGKILL"); } catch {} }
    inference?.stop(true); daemon.stop(true); await rm(root, { recursive: true, force: true });
  }
}, 60_000);
