// Read-only public-web preview. No accounts, backend proxy, providers or signing.
// Build via the isolated QA runner's build-web stage before starting this server.
import { realpath, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = await realpath(new URL("../dist", import.meta.url).pathname);
const html = await readFile(resolve(root, "index.html"), "utf8");
if (!html.includes('data-matterhorn-ui="retro"') || !html.includes("public-auth-shell")) {
  throw new Error("Build the retro public-web variant first (run-check.mjs build-web 1).");
}
const pages = new Set(["/", "/session", "/privacy", "/terms", "/security", "/support", "/status"]);
const contentTypes: Record<string, string> = {
  ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon",
  ".json": "application/json", ".html": "text/html",
};
const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'",
  "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
};
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return Response.json({ error: "Read-only visual preview. Account actions are unavailable." }, { status: 503, headers: securityHeaders });
  }
  if (pages.has(path)) return new Response(request.method === "HEAD" ? null : html, { headers: { ...securityHeaders, "Content-Type": "text/html" } });
  try {
    const file = await realpath(resolve(root, `.${decodeURIComponent(path)}`));
    if (!file.startsWith(root + sep) || !contentTypes[extname(file)]) return new Response("Not found", { status: 404, headers: securityHeaders });
    return new Response(request.method === "HEAD" ? null : await readFile(file), { headers: { ...securityHeaders, "Content-Type": contentTypes[extname(file)] } });
  } catch {
    return Response.json({ error: "No backend in this read-only visual preview." }, { status: 503, headers: securityHeaders });
  }
} });
console.log(`Read-only retro public preview: ${server.url}`);
