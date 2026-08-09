#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("apps/orchestrator/src/cli.ts", "utf8");

for (const required of [
  "function generateRouterDaemonToken()",
  "owd_${randomBytes(32).toString(\"base64url\")}",
  "function allowedRouterDaemonCorsOrigin",
  "function requestRouterDaemonToken",
  "X-Matterhorn-Daemon-Token",
  "X-OpenWork-Daemon-Token",
  "ROUTER_DAEMON_MAX_BODY_BYTES = 64 * 1024",
  "url.pathname !== \"/health\" && requestRouterDaemonToken(req.headers) !== daemonToken",
  "bytes += buffer.byteLength",
  "statusCode = 413",
  "payload_too_large",
  "publicRouterDaemonState(state.daemon)",
  "Authorization: `Bearer ${token}`",
  "DEFAULT_ORCHESTRATOR_CORS_ORIGINS",
  "function effectiveCorsOrigins",
  "process.env.OPENWORK_CORS_ORIGINS ?? DEFAULT_ORCHESTRATOR_CORS_VALUE",
]) {
  assert.ok(source.includes(required), `orchestrator daemon security source should contain ${required}`);
}

assert.ok(!source.includes('res.setHeader("Access-Control-Allow-Origin", "*");'), "daemon must not use unconditional wildcard CORS");
assert.ok(!source.includes('if (!origin) return "*";'), "daemon must not treat missing Origin as wildcard CORS");
assert.ok(!source.includes('process.env.OPENWORK_CORS_ORIGINS ?? "*"'), "orchestrator must not default Matterhorn server CORS to wildcard");
assert.ok(!source.includes('corsOrigins.length ? corsOrigins : ["*"]'), "orchestrator must not fall back to wildcard CORS when the parsed list is empty");
assert.ok(!source.includes("daemon: state.daemon ?? null"), "daemon health output must not expose raw daemon state");
assert.ok(!source.includes("outputResult({ ok: true, daemon: state.daemon }, true)"), "daemon startup output must not expose raw daemon state");
assert.match(
  source,
  /if \(opencodeRouterReady && !opencodeRouterHealthInterval\)[\s\S]*?sandboxMode !== "none"[\s\S]*?fetchOpenCodeRouterHealthViaOpenwork\([\s\S]*?fetchOpenCodeRouterHealth\(opencodeRouterHealthUrl\)/,
  "host-mode router health polling should use the direct router endpoint while sandbox mode uses the authenticated Matterhorn proxy",
);

console.log("orchestrator-daemon-security: ok");
