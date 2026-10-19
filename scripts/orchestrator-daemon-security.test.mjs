#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("apps/orchestrator/src/cli.ts", "utf8");
const publicErrorSource = readFileSync("apps/orchestrator/src/router-daemon-error.ts", "utf8");

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
  'import { RouterDaemonRequestError, routerDaemonErrorResponse } from "./router-daemon-error.js"',
  "payload_too_large",
  "publicRouterDaemonState(state.daemon)",
  "Authorization: `Bearer ${token}`",
  "DEFAULT_ORCHESTRATOR_CORS_ORIGINS",
  "function effectiveCorsOrigins",
  "process.env.OPENWORK_CORS_ORIGINS ?? DEFAULT_ORCHESTRATOR_CORS_VALUE",
]) {
  assert.ok(source.includes(required), `orchestrator daemon security source should contain ${required}`);
}

// The byte limit and JSON parser classify request failures; only the shared
// public boundary chooses the HTTP status. Runtime cases are also exercised by
// apps/orchestrator/test/router-daemon-error.test.ts in security CI.
assert.match(source, /if \(bytes > ROUTER_DAEMON_MAX_BODY_BYTES\)\s*\{\s*throw new RouterDaemonRequestError\("payload_too_large"\)/);
assert.match(source, /try\s*\{\s*return JSON\.parse\(raw\);\s*\}\s*catch\s*\{\s*throw new RouterDaemonRequestError\("invalid_json"\)/);
assert.match(publicErrorSource, /if \(error instanceof RouterDaemonRequestError\)/);
assert.match(publicErrorSource, /if \(error\.code === "payload_too_large"\) return \{ status: 413, error: "payload_too_large" \}/);
assert.match(publicErrorSource, /if \(error\.code === "invalid_json"\) return \{ status: 400, error: "invalid_json" \}/);
assert.match(publicErrorSource, /return \{ status: 500, error: "router_request_failed" \}/);
const daemonStart = source.indexOf("async function runRouterDaemon(");
const daemonEnd = source.indexOf("const shutdown = async", daemonStart);
assert.ok(daemonStart > 0 && daemonEnd > daemonStart, "daemon request boundary must remain reachable");
const daemon = source.slice(daemonStart, daemonEnd);
const failure = daemon.slice(daemon.lastIndexOf("} catch (error) {"));
assert.ok(failure.includes("const failure = routerDaemonErrorResponse(error)"));
assert.ok(failure.includes("send(failure.status, { error: failure.error })"));
assert.ok(failure.includes("runtimeUpgradeFailureDiagnostic(error)"));
assert.doesNotMatch(failure, /error\.message|String\(error\)|statusCode/, "daemon failure must not bypass the fixed public boundary");

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
