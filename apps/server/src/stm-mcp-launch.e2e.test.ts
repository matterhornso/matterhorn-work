import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
  try {
    const descriptorPath = join(stmDir, "daemon.json");
    await writeFile(descriptorPath, JSON.stringify({ port: daemon.port, pid: process.pid, token }), { mode: 0o600 });
    const credentials = new StmCredentials({ enabled: true, platform: "darwin", localDesktop: true, descriptorPath, registryPath: join(root, "stm-bindings.json") });
    await credentials.connect({ consent: true });
    const launches = new StmMcpLaunches({ credentials, registryPath: join(root, "stm-mcp-launches.json") });
    const fixture = join(root, "fixture.mjs");
    await writeFile(fixture, `import { createInterface } from "node:readline";
const lines = createInterface({input: process.stdin});
lines.on("line", line => {
  const r = JSON.parse(line);
  if (r.id === undefined) return;
  const result = r.method === "initialize"
    ? { protocolVersion: "2024-11-05", capabilities: {tools:{}}, serverInfo:{name:"disposable-fixture",version:"1"} }
    : r.method === "tools/list" ? {tools:[{name:"probe",description:"Check fixture only",inputSchema:{type:"object",properties:{}}}]}
    : {content:[{type:"text",text:JSON.stringify({credentialPresent:Boolean(process.env.FIXTURE_KEY),credentialLength:process.env.FIXTURE_KEY?.length})}]};
  process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:r.id,result})+"\\n");
});
`);
    const launcher = process.env.STM_TEST_COMPILED_LAUNCHER
      ? [process.env.STM_TEST_COMPILED_LAUNCHER]
      : [process.execPath, fileURLToPath(new URL("./stm-mcp-entry.ts", import.meta.url))];
    await writeFile(opencodeConfigPath(workspace), JSON.stringify({ mcp: { fixture: { type: "local", command: [process.execPath, fixture] } } }));
    const grant = await approveStmMcp({ launches, workspace, name: "fixture", launcher,
      bindings: [{ envName: "FIXTURE_KEY", tool: "fixture", label: "default" }], consent: true, legacyNames: [] });
    if (process.env.STM_TEST_OPENCODE_BIN) {
      engine = spawn(process.env.STM_TEST_OPENCODE_BIN, ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
        cwd: workspace, stdio: "pipe", env: { PATH: process.env.PATH, HOME: root,
          XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_CACHE_HOME: join(root, "cache"),
          MATTERHORN_WORK_ENV_STORE: join(root, "env.json"), MATTERHORN_WORK_STM_ENABLED: "1",
          OPENCODE_DISABLE_AUTOUPDATE: "true", OPENCODE_DISABLE_MODELS_FETCH: "true",
          OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugin: [], agent: { title: { disable: true } } }),
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
    const closed = new Promise(resolve => child!.once("close", resolve));
    child.stdin!.end(); await closed;
    expect((await launches.list())[0].active).toBeNull();
    expect(stderr).not.toContain(secret); expect(stderr).not.toContain(token);
    lines.close();
  } finally { child?.kill("SIGKILL"); if (engine) await createManagedProcessClose(engine).close(); daemon.stop(true); await rm(root, { recursive: true, force: true }); }
}, 30_000);
