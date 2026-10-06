// Disposable real gateway + synthetic loopback runtime. Never contacts a provider.
import { mkdir } from "node:fs/promises";
import { startServer } from "../../../server/src/server";

const root = process.argv[2];
if (!root) throw new Error("A disposable workspace root is required");
await mkdir(`${root}/.opencode`, { recursive: true });
const dispatches: unknown[] = [];
const permission = [{ permission: "*", pattern: "*", action: "deny" }];
const runtime = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/__qa/dispatches") return Response.json(dispatches);
    if (path === "/provider") return Response.json({
      all: [{ id: "local", name: "Disposable local runtime", models: {
        "private-local-model": { name: "Fixture model" },
      } }], connected: ["local"], default: { local: "private-local-model" },
    });
    if (path === "/agent") return Response.json([
      { name: "matterhorn", mode: "primary", permission, options: {} },
    ]);
    if (path === "/session/ses_fixture/prompt_async" && request.method === "POST") {
      dispatches.push(await request.json());
      return Response.json({ ok: true });
    }
    if (path === "/session/ses_fixture/message") return Response.json([]);
    if (path === "/session/ses_fixture/abort" && request.method === "POST") return Response.json(true);
    if (path === "/session/status") return Response.json({ ses_fixture: { type: "idle" } });
    if (path === "/session/ses_fixture") {
      if (request.method === "PATCH") await request.json();
      return Response.json({ id: "ses_fixture", title: "Disposable chat", directory: root,
        permission, time: { created: 1, updated: 1 } });
    }
    return Response.json({ code: "fixture_not_found" }, { status: 404 });
  },
});
const gateway = await startServer({
  host: "127.0.0.1", port: 0,
  token: "disposable-browser-attachment-token", hostToken: "disposable-browser-host-token",
  approval: { mode: "auto", timeoutMs: 1000 }, corsOrigins: [],
  opencodeBaseUrl: runtime.url.origin,
  workspaces: [{ id: "ws_fixture", name: "Disposable workspace", path: root,
    preset: "starter", workspaceType: "local", baseUrl: runtime.url.origin }],
  authorizedRoots: [root], readOnly: false, startedAt: Date.now(),
  tokenSource: "cli", hostTokenSource: "cli", logFormat: "pretty",
  logRequests: false, reloadWatchers: false,
});
console.log(`ATTACHMENT_BACKEND_READY ${JSON.stringify({ port: gateway.port, runtimePort: runtime.port })}`);
