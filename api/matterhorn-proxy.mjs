import { isIP } from "node:net";
import { createHash, createHmac } from "node:crypto";

const INTERNAL_PATH_PARAM = "__matterhorn_path";
const ALLOWED_ROOTS = new Set([
  "api",
  "capabilities",
  "env",
  "experimental",
  "files",
  "health",
  "opencode",
  "runtime",
  "tokens",
  "voice",
  "w",
  "workspace",
  "workspaces",
]);
const FORWARDED_REQUEST_HEADERS_TO_REMOVE = [
  "connection",
  "content-length",
  "host",
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-forwarded-for",
  "x-vercel-id",
  "x-vercel-ip-city",
  "x-vercel-ip-continent",
  "x-vercel-ip-country",
  "x-vercel-ip-country-region",
  "x-vercel-ip-latitude",
  "x-vercel-ip-longitude",
  "x-vercel-ip-postal-code",
  "x-vercel-ip-timezone",
  "x-matterhorn-client-ip",
  "x-matterhorn-edge-jurisdiction",
  "x-matterhorn-host-token",
  "x-matterhorn-proxy-secret",
  "x-openwork-host-token",
];
const FORWARDED_RESPONSE_HEADERS_TO_REMOVE = ["connection", "content-length", "transfer-encoding"];
const EDGE_JURISDICTION_VERSION = "matterhorn.edge-jurisdiction.v1";
const EDGE_JURISDICTION_TTL_MS = 60_000;

export function normalizeProxyPath(value) {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 2_048) return null;
  if (path.includes("\\") || /%2f|%5c|%2e/i.test(path)) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  if (!segments[0] || !ALLOWED_ROOTS.has(segments[0])) return null;
  return `/${segments.join("/")}`;
}

export function resolveControlPlaneUrl(rawValue, allowHttp = false) {
  try {
    const url = new URL(String(rawValue ?? "").trim());
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) return null;
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url;
  } catch {
    return null;
  }
}

export function buildUpstreamUrl(upstreamBase, path) {
  const upstreamUrl = new URL(upstreamBase);
  const basePath = upstreamUrl.pathname.replace(/\/+$/, "");
  upstreamUrl.pathname = `${basePath}${path}`;
  upstreamUrl.search = "";
  upstreamUrl.hash = "";
  return upstreamUrl;
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "cdn-cache-control": "no-store",
      "vercel-cdn-cache-control": "no-store",
    },
  });
}

function forwardedClientIp(request) {
  const candidate = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim() ?? "";
  return isIP(candidate) ? candidate : null;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedVercelCountry(value) {
  const country = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(country) ? country : null;
}

function boundedVercelRequestId(value) {
  const requestId = typeof value === "string" ? value.trim() : "";
  return requestId.length > 0 && requestId.length <= 256 && /^[A-Za-z0-9:._-]+$/.test(requestId)
    ? requestId
    : null;
}

/**
 * Create a short-lived, request-bound proof of Vercel's country signal.
 * The proof contains no raw IP or request id and is accepted by the backend
 * only together with the independently verified same-origin proxy secret.
 */
export function createEdgeJurisdictionAttestation(input) {
  const country = normalizedVercelCountry(input?.country);
  const clientIp = typeof input?.clientIp === "string" && isIP(input.clientIp) ? input.clientIp : null;
  const method = typeof input?.method === "string" ? input.method.trim().toUpperCase() : "";
  const path = normalizeProxyPath(input?.path);
  const requestId = boundedVercelRequestId(input?.requestId);
  const secret = typeof input?.secret === "string" ? input.secret.trim() : "";
  const issuedAtMs = input?.issuedAtMs ?? Date.now();
  if (
    !country
    || !clientIp
    || !/^[A-Z]+$/.test(method)
    || !path
    || !requestId
    || secret.length < 16
    || !Number.isSafeInteger(issuedAtMs)
    || issuedAtMs <= 0
  ) return null;

  const payload = {
    version: EDGE_JURISDICTION_VERSION,
    source: "vercel_ip_country",
    country,
    method,
    path,
    clientIpHash: sha256(clientIp),
    requestIdHash: sha256(requestId),
    issuedAtMs,
    expiresAtMs: issuedAtMs + EDGE_JURISDICTION_TTL_MS,
  };
  const encoded = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function requestUrl(request) {
  const value = typeof request?.url === "string" ? request.url : "";
  try {
    return new URL(value);
  } catch {
    // Vercel's Node runtime invokes rewritten functions with a relative URL.
    // The synthetic origin is used only to parse the path and query string;
    // forwarded host/protocol values are resolved independently below.
    return new URL(value, "https://matterhorn.invalid");
  }
}

function forwardedOrigin(request, parsedRequestUrl) {
  const rawHost = request.headers.get("x-forwarded-host")?.trim()
    || request.headers.get("host")?.trim()
    || parsedRequestUrl.host;
  let host = parsedRequestUrl.host;
  try {
    const parsedHost = new URL(`https://${rawHost}`);
    if (
      !parsedHost.username
      && !parsedHost.password
      && parsedHost.pathname === "/"
      && !parsedHost.search
      && !parsedHost.hash
    ) {
      host = parsedHost.host;
    }
  } catch {
    // Keep the already parsed request host when a forwarded header is invalid.
  }

  const rawProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const protocol = rawProtocol === "http" || rawProtocol === "https"
    ? rawProtocol
    : parsedRequestUrl.protocol.replace(/:$/, "");
  return { host, protocol };
}

export async function matterhornProxy(request) {
  const parsedRequestUrl = requestUrl(request);
  const path = normalizeProxyPath(parsedRequestUrl.searchParams.get(INTERNAL_PATH_PARAM));
  if (!path) return jsonError(400, "invalid_proxy_path", "The requested Matterhorn API path is not allowed.");

  const allowHttp = process.env.MATTERHORN_PROXY_ALLOW_HTTP === "1" && process.env.VERCEL_ENV !== "production";
  const upstreamBase = resolveControlPlaneUrl(process.env.MATTERHORN_CONTROL_PLANE_URL, allowHttp);
  const proxySecret = process.env.MATTERHORN_PROXY_SECRET?.trim() ?? "";
  if (!upstreamBase || !proxySecret) {
    return jsonError(503, "control_plane_unavailable", "Matterhorn account services are not configured.");
  }

  const upstreamUrl = buildUpstreamUrl(upstreamBase, path);
  for (const [key, value] of parsedRequestUrl.searchParams) {
    if (key !== INTERNAL_PATH_PARAM) upstreamUrl.searchParams.append(key, value);
  }

  const headers = new Headers(request.headers);
  for (const name of FORWARDED_REQUEST_HEADERS_TO_REMOVE) headers.delete(name);
  const origin = forwardedOrigin(request, parsedRequestUrl);
  headers.set("x-forwarded-host", origin.host);
  headers.set("x-forwarded-proto", origin.protocol);
  headers.set("x-matterhorn-proxy-secret", proxySecret);
  const clientIp = forwardedClientIp(request);
  if (clientIp) headers.set("x-matterhorn-client-ip", clientIp);
  const jurisdictionAttestation = process.env.VERCEL === "1"
    ? createEdgeJurisdictionAttestation({
        country: request.headers.get("x-vercel-ip-country"),
        clientIp,
        method: request.method,
        path,
        requestId: request.headers.get("x-vercel-id"),
        secret: proxySecret,
      })
    : null;
  if (jurisdictionAttestation) {
    headers.set("x-matterhorn-edge-jurisdiction", jurisdictionAttestation);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const init = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    signal: request.signal,
    ...(hasBody ? { duplex: "half" } : {}),
  };

  try {
    const upstream = await fetch(upstreamUrl, init);
    const responseHeaders = new Headers(upstream.headers);
    for (const name of FORWARDED_RESPONSE_HEADERS_TO_REMOVE) responseHeaders.delete(name);
    responseHeaders.set("cache-control", "no-store");
    responseHeaders.set("cdn-cache-control", "no-store");
    responseHeaders.set("vercel-cdn-cache-control", "no-store");
    responseHeaders.set("x-matterhorn-proxy", "same-origin");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return jsonError(502, "control_plane_unreachable", "Matterhorn account services could not be reached.");
  }
}

// The fetch export selects Vercel's Web-standard Request/Response adapter.
// A default function would select the legacy Node request/response interface.
export default { fetch: matterhornProxy };
