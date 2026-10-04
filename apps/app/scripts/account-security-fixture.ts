// Disposable browser fixture: synthetic accounts/responses, no auth or external requests.
// Run: bun apps/app/scripts/account-security-fixture.ts
import { build } from "vite";
import tailwindcss from "@tailwindcss/vite";
const bundle = await build({
  configFile: false, envDir: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
  resolve: { alias: { "@": new URL("../src", import.meta.url).pathname }, dedupe: ["react", "react-dom"] },
  plugins: [tailwindcss()], define: { "process.env.NODE_ENV": '"development"' },
  build: { target: "esnext", write: false, minify: false,
    lib: { entry: new URL("./fixtures/account-security.tsx", import.meta.url).pathname, formats: ["es"] },
    rollupOptions: { output: { inlineDynamicImports: true } } },
});
const built = Array.isArray(bundle) ? bundle[0] : bundle;
if (!("output" in built)) throw new Error("Missing bundle");
const script = built.output.find(item => item.type === "chunk" && item.isEntry);
if (!script || script.type !== "chunk") throw new Error("Missing entry");
const css = built.output.filter(item => item.type === "asset" && item.fileName.endsWith(".css"));
let scenario = "delayed";
const pending: Array<() => void> = [];
const headers = { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" };
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 60, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/__qa/state" && request.method === "GET") return Response.json({ scenario, pending: pending.length }, { headers });
  if (request.method === "POST" && path.startsWith("/__qa/")) {
    const value = path.slice("/__qa/".length);
    if (value === "release") pending.splice(0).forEach(release => release());
    else if (["ready", "delayed", "malformed", "pending-deletion"].includes(value)) scenario = value;
    return Response.json({ scenario, pending: pending.length }, { headers });
  }
  if (/^\/[ab]\/api\/auth\/account/.test(path)) {
    const account = path.split("/")[1]!;
    if (path.endsWith("/security")) return Response.json({ sessionCount: 2, organizations: [], sharedOrganizationsBlockingDeletion: [] }, { headers });
    const current = scenario;
    if (current === "delayed") await new Promise<void>(resolve => pending.push(resolve));
    if (current === "malformed") return Response.json({}, { headers });
    if (path.endsWith("/export")) return Response.json({
      version: "matterhorn.account-export.v1", generatedAt: "2026-10-04T00:00:00.000Z", filename: `fixture-account-${account}.json`,
      account: { id: account, email: `${account}@example.invalid`, name: "Synthetic account", emailVerified: true, createdAt: "2026-10-01T00:00:00.000Z" },
      legalAcceptance: null, organizations: [], security: { activeSessionCount: 2 }, includes: ["account_profile"], excludes: ["Real user data"],
    }, { headers });
    if (path.endsWith("/revoke-other-sessions")) return Response.json({ ok: true, revokedSessions: 1 }, { headers });
    if (path.endsWith("/change-password")) return Response.json({ ok: true, signedOutEverywhere: true }, { headers });
    if (request.method === "DELETE") {
      const complete = current !== "pending-deletion";
      return Response.json({ ok: complete, status: complete ? "deleted" : "deletion_pending", deletionJobId: "fixture-job", deletedOrganizationCount: 0, workspaceDataDeletionComplete: complete, workspaceDataDeletionFailures: complete ? 0 : 1 }, { status: complete ? 200 : 202, headers });
    }
    return Response.json({ error: "Unsupported fixture request" }, { status: 404, headers });
  }
  if (path === "/fixture.js") return new Response(script.code, { headers: { ...headers, "Content-Type": "text/javascript" } });
  if (path === "/fixture.css") return new Response(css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { ...headers, "Content-Type": "text/css" } });
  if (path !== "/") return new Response("Not found", { status: 404, headers });
  return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account security fixture</title><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>', { headers: { ...headers, "Content-Type": "text/html" } });
} });
console.log(`Account security fixture: ${server.url} (synthetic only; no credentials changed)`);
