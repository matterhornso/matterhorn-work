// Disposable synthetic auth/HTTP server. Never connects to live accounts.
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";

const bundle = await build({ configFile: false, envDir: false,
  root: new URL("../", import.meta.url).pathname, logLevel: "error",
  resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
  plugins: [tailwindcss()], define: { "process.env.NODE_ENV": '"development"' },
  build: { target: "esnext", write: false, minify: false,
    lib: { entry: new URL("./fixtures/account-boundary.tsx", import.meta.url).pathname, formats: ["es"] },
    rollupOptions: { output: { inlineDynamicImports: true } } },
});
const built = Array.isArray(bundle) ? bundle[0] : bundle;
if (!("output" in built)) throw Error("Missing bundle");
const script = built.output.find(item => item.type === "chunk" && item.isEntry);
if (!script || script.type !== "chunk") throw Error("Missing script");
const css = built.output.filter(item => item.type === "asset" && item.fileName.endsWith(".css"));
let account: string | null = null;
let offline = false;
let late: (() => void) | null = null;
const events: Array<{ path: string; account: string | null }> = [];
const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.ACCOUNT_QA_PORT ?? 0), async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/fixture.js") return new Response(script.code, { headers: { "Content-Type": "text/javascript" } });
  if (path === "/fixture.css") return new Response(css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { "Content-Type": "text/css" } });
  if (path === "/__qa/evidence") return Response.json({ account, events, latePending: Boolean(late) });
  if (path === "/__qa/release") { late?.(); late = null; return Response.json({ ok: true }); }
  if (path === "/__qa/login/a" || path === "/__qa/login/b") { account = path.endsWith("a") ? "a" : "b"; offline = false; return Response.json({ ok: true }); }
  if (path === "/__qa/offline") { offline = true; return Response.json({ ok: true }); }
  if (path === "/__qa/online") { offline = false; return Response.json({ ok: true }); }
  if (path === "/__qa/expire" || path === "/api/auth/sign-out") { account = null; return Response.json({ ok: true }); }
  if (path === "/health") {
    const startedBy = account;
    events.push({ path, account: startedBy });
    await new Promise<void>(resolve => { late = resolve; });
    return Response.json({ ok: true, version: `private-${startedBy}`, uptimeMs: 1 });
  }
  if (path.startsWith("/v1/")) {
    events.push({ path, account });
    if (offline) return Response.json({ message: "Synthetic offline" }, { status: 503 });
    if (!account) return Response.json({ message: "Synthetic expired session" }, { status: 401 });
    if (path === "/v1/me") return Response.json({ user: { id: account, email: `${account}@fixture.invalid`, name: `Account ${account.toUpperCase()}` } });
    if (path === "/v1/me/orgs") return Response.json({ orgs: [{ id: `org-${account}`, slug: `org-${account}`, name: `Org ${account}`, role: "owner" }], activeOrgId: `org-${account}`, activeOrgSlug: `org-${account}` });
    if (path === "/v1/me/desktop-config") return Response.json({});
    return Response.json({ ok: true });
  }
  return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account boundary QA fixture</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>', {
    headers: { "Content-Type": "text/html", "Content-Security-Policy": "connect-src 'self'", "Cache-Control": "no-store" },
  });
} });
console.log(`Account boundary fixture: ${server.url} (synthetic, no live accounts)`);
