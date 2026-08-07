import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import proxy, {
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
]) {
  assert.equal(normalizeProxyPath(rejected), null, `${rejected} must be rejected`);
}

assert.equal(resolveControlPlaneUrl("https://api.example.com/")?.toString(), "https://api.example.com/");
assert.equal(resolveControlPlaneUrl("http://api.example.com"), null);
assert.equal(resolveControlPlaneUrl("https://user:pass@api.example.com"), null);

const priorUrl = process.env.MATTERHORN_CONTROL_PLANE_URL;
const priorSecret = process.env.MATTERHORN_PROXY_SECRET;
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

for (const configPath of ["vercel.json", "apps/app/vercel.json"]) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const serialized = JSON.stringify(config.rewrites);
  for (const route of ["/api/:path*", "/workspaces", "/workspace/:path*", "/opencode/:path*", "/health/:path*"]) {
    assert.ok(serialized.includes(route), `${configPath} must proxy ${route}`);
  }
  assert.equal(config.rewrites.at(-1)?.destination, "/index.html");
}

console.log("matterhorn-vercel-proxy tests: PASS");
