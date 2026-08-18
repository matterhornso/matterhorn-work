#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const scriptPath = "scripts/product-hunt-deployment-probe.mjs";
const expectedCommit = "a".repeat(40);

function run(args) {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts["smoke:product-hunt-deployment"], "node scripts/product-hunt-deployment-probe.mjs --strict");
assert.equal(packageJson.scripts["test:product-hunt-deployment-probe"], "node scripts/product-hunt-deployment-probe.test.mjs");

const source = readFileSync(scriptPath, "utf8");
for (const required of [
  "matterhorn.product-hunt-deployment-probe.v1",
  "strict-transport-security",
  "x-content-type-options",
  "permissions-policy",
  "cors_untrusted_origin",
  "app_workspace_proxy",
  "app_engine_proxy",
  "--expected-web-commit",
  "web_build_commit",
  "--expected-guarded-mode",
  "--expected-signup-status",
  "signup_security",
  "--allow-loopback-http",
]) assert.ok(source.includes(required), `deployment probe missing ${required}`);

const indexHtml = readFileSync("apps/app/index.html", "utf8");
const webBuild = readFileSync("apps/app/scripts/build-web.mjs", "utf8");
assert.match(indexHtml, /name="matterhorn-build-commit" content="%VITE_MATTERHORN_BUILD_COMMIT%"/);
assert.ok(webBuild.includes("VITE_MATTERHORN_BUILD_COMMIT"));
assert.ok(webBuild.includes("VERCEL_GIT_COMMIT_SHA"));
assert.ok(webBuild.includes("git\", [\"rev-parse\", \"HEAD\"]"));
assert.match(webBuild, /find\(\(\[, value\]\) => value\.length > 0\)/);
assert.match(webBuild, /if \(!commitPattern\.test\(buildCommit\)\)/);

let serveSpaFallbackForProxyRoutes = false;
let signupStatus = "paused";
let signupSecurityReady = true;
let webCommit = expectedCommit;
const app = await listen((request, response) => {
  if (request.url === "/api/auth/config") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      signupsAvailable: signupStatus === "open",
      signupStatus,
      emailVerificationRequired: signupSecurityReady,
      passwordResetAvailable: signupSecurityReady,
      legalAcceptanceRequired: signupSecurityReady,
      turnstileSiteKey: signupSecurityReady ? "0x-test-site-key" : null,
    }));
    return;
  }
  const isProxyRoute = request.url === "/workspaces" || request.url === "/opencode/global/health";
  const acceptsHtml = request.headers.accept?.includes("text/html") === true;
  const status = isProxyRoute && !serveSpaFallbackForProxyRoutes ? 401 : acceptsHtml ? 200 : 406;
  const contentType = isProxyRoute && !serveSpaFallbackForProxyRoutes ? "application/json" : "text/html";
  response.writeHead(status, {
    "content-type": contentType,
    "content-security-policy": "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
    "permissions-policy": "camera=(), microphone=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
  });
  response.end(status === 401
    ? JSON.stringify({ error: "Authentication required." })
    : status === 406
      ? "<!doctype html><title>HTML navigation required</title>"
      : `<!doctype html><meta name="matterhorn-build-commit" content="${webCommit}"><title>Matterhorn Desks</title>`);
});

let allowUntrusted = false;
let guardedMode = "shadow";
const api = await listen((request, response) => {
  const origin = request.headers.origin;
  const headers = {
    "content-type": "application/json",
    "content-security-policy": "frame-ancestors 'none'; base-uri 'none'; object-src 'none'",
    "permissions-policy": "camera=(), microphone=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-matterhorn-build-commit": expectedCommit,
  };
  if (origin && (origin === new URL(app.url).origin || allowUntrusted)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  response.writeHead(request.method === "OPTIONS" ? 204 : 200, headers);
  response.end(request.method === "OPTIONS" ? undefined : JSON.stringify({
    ok: true,
    checks: { guardedRuntimeMode: guardedMode, guardedRuntimeReady: true },
  }));
});

try {
  const pass = await run([
    "--app-url", app.url,
    "--server-url", api.url,
    "--expected-commit", expectedCommit,
    "--expected-web-commit", expectedCommit,
    "--expected-guarded-mode", "shadow",
    "--expected-signup-status", "paused",
    "--allow-loopback-http",
    "--json",
  ]);
  assert.equal(pass.code, 0, pass.stderr || pass.stdout);
  const report = JSON.parse(pass.stdout);
  assert.equal(report.version, "matterhorn.product-hunt-deployment-probe.v1");
  assert.equal(report.ok, true);
  assert.equal(report.ready, false);
  assert.equal(report.metadata.localContractRun, true);
  assert.equal(report.metadata.expectedGuardedMode, "shadow");
  assert.equal(report.metadata.expectedSignupStatus, "paused");
  assert.equal(report.metadata.expectedWebCommit, expectedCommit);
  assert.deepEqual(report.failures, []);
  assert.doesNotMatch(JSON.stringify(report), /authorization|bearer|token/i);

  webCommit = "b".repeat(40);
  const wrongWebCommit = await run([
    "--app-url", app.url,
    "--server-url", api.url,
    "--expected-commit", expectedCommit,
    "--expected-web-commit", expectedCommit,
    "--allow-loopback-http",
    "--json",
  ]);
  assert.equal(wrongWebCommit.code, 1, wrongWebCommit.stderr || wrongWebCommit.stdout);
  assert.ok(JSON.parse(wrongWebCommit.stdout).failures.some((entry) => entry.id === "web_build_commit"));
  webCommit = expectedCommit;

  const strictLocal = await run([
    "--app-url", app.url,
    "--server-url", api.url,
    "--expected-commit", expectedCommit,
    "--allow-loopback-http",
    "--strict",
    "--json",
  ]);
  assert.equal(strictLocal.code, 1, "local HTTP must never produce strict production evidence");

  signupStatus = "open";
  const openSignup = await run([
    "--app-url", app.url,
    "--server-url", api.url,
    "--expected-commit", expectedCommit,
    "--expected-guarded-mode", "shadow",
    "--expected-signup-status", "open",
    "--allow-loopback-http",
    "--json",
  ]);
  assert.equal(openSignup.code, 0, openSignup.stderr || openSignup.stdout);
  assert.ok(JSON.parse(openSignup.stdout).checks.some((entry) => entry.id === "signup_security" && entry.status === "pass"));

  signupSecurityReady = false;
  const unsafeSignup = await run([
    "--app-url", app.url,
    "--server-url", api.url,
    "--expected-commit", expectedCommit,
    "--expected-signup-status", "open",
    "--allow-loopback-http",
    "--json",
  ]);
  assert.equal(unsafeSignup.code, 1, unsafeSignup.stderr || unsafeSignup.stdout);
  assert.ok(JSON.parse(unsafeSignup.stdout).failures.some((entry) => entry.id === "signup_security"));
  signupSecurityReady = true;
  signupStatus = "paused";

  guardedMode = "off";
  const wrongGuardedMode = await run([
    "--app-url", app.url,
    "--server-url", api.url,
    "--expected-commit", expectedCommit,
    "--expected-guarded-mode", "shadow",
    "--allow-loopback-http",
    "--json",
  ]);
  assert.equal(wrongGuardedMode.code, 1, wrongGuardedMode.stderr || wrongGuardedMode.stdout);
  assert.ok(JSON.parse(wrongGuardedMode.stdout).failures.some((entry) => entry.id === "guarded_runtime_mode"));
  guardedMode = "shadow";

  const escapedHealth = await run([
    "--app-url", app.url,
    "--server-url", api.url,
    "--expected-commit", expectedCommit,
    "--health-path", "https://untrusted.invalid/health",
    "--allow-loopback-http",
  ]);
  assert.equal(escapedHealth.code, 1);
  assert.match(escapedHealth.stderr, /health-path must be an absolute path/i);

  allowUntrusted = true;
  const fail = await run([
    "--app-url", app.url,
    "--server-url", api.url,
    "--expected-commit", expectedCommit,
    "--allow-loopback-http",
    "--json",
  ]);
  assert.equal(fail.code, 1, fail.stderr || fail.stdout);
  const failedReport = JSON.parse(fail.stdout);
  assert.ok(failedReport.failures.some((entry) => entry.id === "cors_untrusted_origin"));

  allowUntrusted = false;
  serveSpaFallbackForProxyRoutes = true;
  const missingProxy = await run([
    "--app-url", app.url,
    "--server-url", api.url,
    "--expected-commit", expectedCommit,
    "--allow-loopback-http",
    "--json",
  ]);
  assert.equal(missingProxy.code, 1, missingProxy.stderr || missingProxy.stdout);
  const missingProxyReport = JSON.parse(missingProxy.stdout);
  assert.ok(missingProxyReport.failures.some((entry) => entry.id === "app_workspace_proxy"));
  assert.ok(missingProxyReport.failures.some((entry) => entry.id === "app_engine_proxy"));
  assert.match(
    missingProxyReport.failures.find((entry) => entry.id === "app_workspace_proxy").summary,
    /text\/html/i,
  );

  const help = await run(["--help"]);
  assert.equal(help.code, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /never reads or prints auth tokens/i);
} finally {
  await Promise.all([
    new Promise((resolve) => app.server.close(resolve)),
    new Promise((resolve) => api.server.close(resolve)),
  ]);
}

console.log("Product Hunt deployment probe contract passed.");
