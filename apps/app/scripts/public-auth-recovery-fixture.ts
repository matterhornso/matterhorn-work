// Run: bun apps/app/scripts/public-auth-recovery-fixture.ts
// Disposable loopback UI fixture. No backend proxy, accounts or outbound requests.
import { readFile } from "node:fs/promises";
import { build } from "vite";

const bundle = await build({ configFile: false, envDir: false, root: new URL("../", import.meta.url).pathname, logLevel: "error",
  resolve: { dedupe: ["react", "react-dom"] },
  define: { "process.env.NODE_ENV": '"development"' },
  build: { target: "esnext", write: false, minify: false, lib: { entry: new URL("./fixtures/public-auth-recovery.tsx", import.meta.url).pathname, formats: ["es"] }, rollupOptions: { output: { inlineDynamicImports: true } } },
});
const built = Array.isArray(bundle) ? bundle[0] : bundle;
if (!("output" in built)) throw new Error("Missing bundle");
const script = built.output.find(item => item.type === "chunk" && item.isEntry);
if (!script || script.type !== "chunk") throw new Error("Missing script");
const css = built.output.filter(item => item.type === "asset" && item.fileName.endsWith(".css"));
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const criticalStyle = index.match(/<style>[\s\S]*?<\/style>/)?.[0];
if (!criticalStyle) throw new Error("Missing authentic bootstrap styles");
const logo = await readFile(new URL("../public/matterhorn-logo-square.svg", import.meta.url));
let scenario = "error";
const pending: Array<() => void> = [];
const signedIn = new Set<string>();
const configuration = { signupsAvailable: true, signupStatus: "open", emailVerificationRequired: true, passwordResetAvailable: true, legalAcceptanceRequired: true, minimumPasswordLength: 12, turnstileSiteKey: null };
const headers = { "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'" };
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, idleTimeout: 30, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (request.method === "POST") {
    if (["/__qa/ready", "/__qa/error", "/__qa/pending", "/__qa/pending-signin"].includes(path)) {
      scenario = path.slice("/__qa/".length);
      return Response.json({ ok: true }, { headers });
    }
    if (path === "/__qa/release") {
      pending.splice(0).forEach(release => release());
      return Response.json({ ok: true }, { headers });
    }
    if (/^\/[ab]\/api\/auth\/sign-in\/email$/.test(path) && scenario === "pending-signin") {
      const connection = path.split("/")[1]!;
      await new Promise<void>(resolve => pending.push(resolve));
      signedIn.add(connection);
      return Response.json({ user: { id: `fixture-${connection}`, email: "fixture@example.invalid" } }, { headers });
    }
    return Response.json({ error: "Account mutations are unavailable in this fixture." }, { status: 503, headers });
  }
  if (path.endsWith("/api/den/v1/session")) {
    const connection = path.split("/")[1]!;
    return Response.json(signedIn.has(connection)
      ? { authenticated: true, user: { id: `fixture-${connection}`, email: "fixture@example.invalid" } }
      : { authenticated: false }, { headers });
  }
  if (path.endsWith("/api/auth/config")) {
    const current = scenario;
    if (current === "pending") await new Promise<void>(resolve => pending.push(resolve));
    return current === "error" ? Response.json({ error: "Synthetic config failure" }, { status: 503, headers }) : Response.json(configuration, { headers });
  }
  if (path === "/fixture.js") return new Response(script.code, { headers: { ...headers, "Content-Type": "text/javascript" } });
  if (path === "/fixture.css") return new Response(css.map(item => item.type === "asset" ? item.source : "").join("\n"), { headers: { ...headers, "Content-Type": "text/css" } });
  if (path === "/matterhorn-logo-square.svg") return new Response(logo, { headers: { ...headers, "Content-Type": "image/svg+xml" } });
  if (path !== "/") return new Response("Not found", { status: 404, headers });
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auth recovery QA fixture</title>${criticalStyle}<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script></html>`, { headers: { ...headers, "Content-Type": "text/html" } });
} });
console.log(`Auth recovery fixture: ${server.url} (synthetic; no account mutations)`);
