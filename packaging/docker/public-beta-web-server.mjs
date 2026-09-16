// Public Beta web tier for Railway: serves the built SPA and forwards the
// same-origin API paths to the control plane through api/matterhorn-proxy.mjs.
// vercel.json stays the single source of truth for rewrites and headers.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matterhornProxy } from "../../api/matterhorn-proxy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const distDir = process.env.MATTERHORN_WEB_DIST ?? path.join(root, "apps/app/dist");
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
const PROXY_PREFIX = "/api/matterhorn-proxy?__matterhorn_path=";

// Vercel path patterns: "/api/:path*", "/health", "/(.*)".
function toRegExp(source) {
  const pattern = source
    .replace(/\/:[a-zA-Z0-9_]+\*/g, "(?:/.*)?")
    .replace(/:[a-zA-Z0-9_]+/g, "[^/]+");
  return new RegExp(`^${pattern}$`);
}
const rewrites = vercel.rewrites.map((rule) => ({
  match: toRegExp(rule.source),
  proxied: rule.destination.startsWith(PROXY_PREFIX),
  missing: (rule.missing ?? []).map((cond) => ({ key: cond.key.toLowerCase(), value: new RegExp(cond.value, "i") })),
}));
const headerRules = vercel.headers.map((rule) => ({ match: toRegExp(rule.source), headers: rule.headers }));

function applyHeaders(pathname, headers) {
  for (const rule of headerRules) {
    if (!rule.match.test(pathname)) continue;
    for (const { key, value } of rule.headers) headers.set(key, value);
  }
  return headers;
}

function selectRewrite(pathname, request) {
  for (const rule of rewrites) {
    if (!rule.match.test(pathname)) continue;
    if (rule.missing.some((cond) => cond.value.test(request.headers.get(cond.key) ?? ""))) continue;
    return rule;
  }
  return null;
}

async function serveStatic(pathname, method) {
  const relative = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidate = path.join(distDir, relative);
  const inDist = candidate.startsWith(distDir + path.sep);
  const file = inDist ? Bun.file(candidate) : null;
  const exists = file ? await file.exists() : false;
  const target = exists && !relative.endsWith(path.sep) ? file : Bun.file(path.join(distDir, "index.html"));
  const servedPath = exists ? pathname : "/index.html";
  const headers = applyHeaders(servedPath, new Headers({ "content-type": target.type || "application/octet-stream" }));
  if (!exists) headers.set("cache-control", "no-store");
  return new Response(method === "HEAD" ? null : target, { status: 200, headers });
}

async function handle(request) {
  const url = new URL(request.url);
  const rule = selectRewrite(url.pathname, request);
  if (!rule?.proxied) return serveStatic(url.pathname, request.method);

  // The proxy reads the client IP from Vercel's header; Railway supplies x-forwarded-for.
  const headers = new Headers(request.headers);
  const clientIp = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (clientIp) headers.set("x-vercel-forwarded-for", clientIp);
  url.searchParams.set("__matterhorn_path", url.pathname);
  url.pathname = "/api/matterhorn-proxy";
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  return matterhornProxy(new Request(url, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    signal: request.signal,
    ...(hasBody ? { duplex: "half" } : {}),
  }));
}

const port = Number(process.env.PORT ?? 8080);
Bun.serve({ port, hostname: "0.0.0.0", idleTimeout: 120, fetch: handle });
console.log(JSON.stringify({ level: "info", msg: "matterhorn public beta web listening", port, distDir }));
