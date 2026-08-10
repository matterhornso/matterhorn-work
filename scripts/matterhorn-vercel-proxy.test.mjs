import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildUpstreamUrl,
  matterhornProxy as proxy,
  normalizeProxyPath,
  resolveControlPlaneUrl,
} from "../api/matterhorn-proxy.mjs";

assert.equal(normalizeProxyPath("/api/auth/sign-in/email"), "/api/auth/sign-in/email");
assert.equal(normalizeProxyPath("/workspace/ws_123/opencode/session"), "/workspace/ws_123/opencode/session");
assert.equal(normalizeProxyPath("/opencode/global/health"), "/opencode/global/health");
for (const rejected of [
  "https://attacker.invalid/api",
  "//attacker.invalid/api",
  "/status",
  "/metrics",
  "/dev/log",
  "/api/../metrics",
  "/api/%2e%2e/metrics",
  "/api\\auth",
  "/approvals/request",
  "/hub/events",
  "/mcp/connect",
  "/whoami",
]) {
  assert.equal(normalizeProxyPath(rejected), null, `${rejected} must be rejected`);
}

assert.equal(resolveControlPlaneUrl("https://api.example.com/")?.toString(), "https://api.example.com/");
assert.equal(resolveControlPlaneUrl("http://api.example.com"), null);
assert.equal(resolveControlPlaneUrl("https://user:pass@api.example.com"), null);
assert.equal(
  buildUpstreamUrl(new URL("https://api.example.com/"), "/workspaces").toString(),
  "https://api.example.com/workspaces",
  "a root control-plane URL must never turn an API path into a protocol-relative host",
);
assert.equal(
  buildUpstreamUrl(new URL("https://api.example.com/control-plane/"), "/api/auth/session").toString(),
  "https://api.example.com/control-plane/api/auth/session",
  "an optional control-plane base path must be preserved",
);

const priorUrl = process.env.MATTERHORN_CONTROL_PLANE_URL;
const priorSecret = process.env.MATTERHORN_PROXY_SECRET;
const priorFetch = globalThis.fetch;
delete process.env.MATTERHORN_CONTROL_PLANE_URL;
delete process.env.MATTERHORN_PROXY_SECRET;
try {
  const response = await proxy(new Request(
    "https://app.example.com/api/matterhorn-proxy?__matterhorn_path=%2Fworkspaces",
  ));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    code: "control_plane_unavailable",
    message: "Matterhorn account services are not configured.",
  });
} finally {
  if (priorUrl === undefined) delete process.env.MATTERHORN_CONTROL_PLANE_URL;
  else process.env.MATTERHORN_CONTROL_PLANE_URL = priorUrl;
  if (priorSecret === undefined) delete process.env.MATTERHORN_PROXY_SECRET;
  else process.env.MATTERHORN_PROXY_SECRET = priorSecret;
}

delete process.env.MATTERHORN_CONTROL_PLANE_URL;
delete process.env.MATTERHORN_PROXY_SECRET;
try {
  const response = await proxy({
    url: "/workspaces?__matterhorn_path=%2Fworkspaces",
    method: "GET",
    headers: new Headers({
      host: "app.example.com",
      "x-forwarded-proto": "https",
    }),
  });
  assert.equal(response.status, 503, "Vercel relative request URLs must fail closed as JSON");
  assert.deepEqual(await response.json(), {
    code: "control_plane_unavailable",
    message: "Matterhorn account services are not configured.",
  });
} finally {
  if (priorUrl === undefined) delete process.env.MATTERHORN_CONTROL_PLANE_URL;
  else process.env.MATTERHORN_CONTROL_PLANE_URL = priorUrl;
  if (priorSecret === undefined) delete process.env.MATTERHORN_PROXY_SECRET;
  else process.env.MATTERHORN_PROXY_SECRET = priorSecret;
}

let forwardedRequest;
process.env.MATTERHORN_CONTROL_PLANE_URL = "https://control.example.com/";
process.env.MATTERHORN_PROXY_SECRET = "test-proxy-secret";
globalThis.fetch = async (input, init) => {
  forwardedRequest = { url: String(input), init };
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
try {
  const response = await proxy({
    url: "/api/matterhorn-proxy?__matterhorn_path=%2Fworkspaces&limit=5",
    method: "GET",
    headers: new Headers({
      host: "app.example.com",
      "x-forwarded-proto": "https",
      "x-vercel-forwarded-for": "203.0.113.9",
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(forwardedRequest.url, "https://control.example.com/workspaces?limit=5");
  assert.equal(forwardedRequest.init.headers.get("x-matterhorn-proxy-secret"), "test-proxy-secret");
  assert.equal(forwardedRequest.init.headers.get("x-matterhorn-client-ip"), "203.0.113.9");
  assert.equal(forwardedRequest.init.headers.get("x-forwarded-host"), "app.example.com");
  assert.equal(forwardedRequest.init.headers.get("x-forwarded-proto"), "https");
  assert.equal(response.headers.get("x-matterhorn-proxy"), "same-origin");
} finally {
  globalThis.fetch = priorFetch;
  if (priorUrl === undefined) delete process.env.MATTERHORN_CONTROL_PLANE_URL;
  else process.env.MATTERHORN_CONTROL_PLANE_URL = priorUrl;
  if (priorSecret === undefined) delete process.env.MATTERHORN_PROXY_SECRET;
  else process.env.MATTERHORN_PROXY_SECRET = priorSecret;
}

for (const configPath of ["vercel.json", "apps/app/vercel.json"]) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const serialized = JSON.stringify(config.rewrites);
  for (const route of ["/api/:path*", "/workspaces", "/workspace/:path*", "/opencode/:path*", "/health/:path*"]) {
    assert.ok(serialized.includes(route), `${configPath} must proxy ${route}`);
  }
  const workspaceProxy = config.rewrites.find((rewrite) => rewrite.source === "/workspace/:path*");
  assert.deepEqual(
    workspaceProxy?.missing,
    [{ type: "header", key: "accept", value: ".*text/html.*" }],
    `${configPath} must let HTML workspace deep links fall through to the SPA`,
  );
  assert.equal(config.rewrites.at(-1)?.destination, "/index.html");
}

console.log("matterhorn-vercel-proxy tests: PASS");
