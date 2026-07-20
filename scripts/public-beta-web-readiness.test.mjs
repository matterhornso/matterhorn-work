#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(packageJson.scripts["gate:public-beta-web"], "node scripts/public-beta-web-readiness.mjs --strict");
assert.equal(packageJson.scripts["test:public-beta-web-readiness"], "node scripts/public-beta-web-readiness.test.mjs");

const publicBetaLaunchDoc = readFileSync("docs/public-beta-launch-2026-07-17.md", "utf8");
const productionLaunchDoc = readFileSync("docs/production-launch-configuration.md", "utf8");
const gateSource = readFileSync("scripts/public-beta-web-readiness.mjs", "utf8");
const vercelConfig = JSON.parse(readFileSync("apps/app/vercel.json", "utf8"));
for (const source of [publicBetaLaunchDoc, productionLaunchDoc, gateSource]) {
  assert.doesNotMatch(source, /pnpm (?:gate:public-beta-web|launch:readiness) --(?: |\s*\\)/);
}
assert.match(gateSource, /pnpm gate:public-beta-web --json/);

const vercelHeaders = Object.fromEntries(
  vercelConfig.headers
    .find((entry) => entry.source === "/(.*)")
    .headers
    .map((header) => [header.key.toLowerCase(), header.value]),
);
assert.match(vercelHeaders["content-security-policy"], /frame-ancestors 'none'/);
assert.match(vercelHeaders["content-security-policy"], /base-uri 'none'/);
assert.match(vercelHeaders["content-security-policy"], /object-src 'none'/);
assert.equal(vercelHeaders["cross-origin-opener-policy"], "same-origin-allow-popups");
assert.equal(vercelHeaders["permissions-policy"], "camera=(), microphone=(), geolocation=()");
assert.equal(vercelHeaders["referrer-policy"], "strict-origin-when-cross-origin");
assert.equal(vercelHeaders["x-content-type-options"], "nosniff");
assert.equal(vercelHeaders["x-frame-options"], "DENY");

const managedKeys = [
  "VITE_MATTERHORN_DEPLOYMENT",
  "VITE_MATTERHORN_PUBLIC_BETA",
  "VITE_MATTERHORN_REQUIRE_SIGNIN",
  "VITE_MATTERHORN_CLOUD_ENABLED",
  "VITE_MATTERHORN_CLOUD_URL",
  "VITE_MATTERHORN_CLOUD_API_URL",
  "MATTERHORN_APP_URL",
  "MATTERHORN_PUBLIC_PROXY_MODE",
  "VITE_MATTERHORN_WORK_TOKEN",
  "VITE_MATTERHORN_WORK_HOST_TOKEN",
  "VITE_OPENWORK_TOKEN",
  "VITE_OPENWORK_HOST_TOKEN",
  "VITE_MATTERHORN_WORK_URL",
  "VITE_MATTERHORN_WORK_PORT",
  "VITE_MATTERHORN_WORK_FORCE_SETTINGS",
  "VITE_OPENWORK_URL",
  "VITE_OPENWORK_PORT",
  "VITE_OPENWORK_FORCE_SETTINGS",
  "VITE_OPENCODE_URL",
];

function publicWebEnvironment(overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const key of managedKeys) {
    if (!(key in overrides)) delete env[key];
  }
  return {
    ...env,
    VITE_MATTERHORN_DEPLOYMENT: "web",
    VITE_MATTERHORN_PUBLIC_BETA: "1",
    VITE_MATTERHORN_REQUIRE_SIGNIN: "true",
    VITE_MATTERHORN_CLOUD_ENABLED: "true",
    VITE_MATTERHORN_CLOUD_URL: "https://app.matterhorn.example",
    VITE_MATTERHORN_CLOUD_API_URL: "https://api.matterhorn.example",
    MATTERHORN_APP_URL: "https://app.matterhorn.example",
    MATTERHORN_PUBLIC_PROXY_MODE: "same-origin",
    ...overrides,
  };
}

function run(overrides = {}) {
  return spawnSync(process.execPath, [
    "scripts/public-beta-web-readiness.mjs",
    "--strict",
    "--json",
  ], {
    encoding: "utf8",
    env: publicWebEnvironment(overrides),
  });
}

const passing = run();
assert.equal(passing.status, 0, passing.stderr);
const passingReport = JSON.parse(passing.stdout);
assert.equal(passingReport.version, "matterhorn.public-beta-web-readiness.v1");
assert.equal(passingReport.decision, "GO");
assert.equal(passingReport.counts.blocked, 0);

const exposedCredential = run({ VITE_MATTERHORN_WORK_TOKEN: "never-expose-me" });
assert.notEqual(exposedCredential.status, 0);
assert.ok(JSON.parse(exposedCredential.stdout).blockers.some((blocker) => blocker.id === "web.no_browser_bearer_credentials"));
assert.doesNotMatch(exposedCredential.stdout, /never-expose-me/);

const directBackend = run({ VITE_MATTERHORN_WORK_URL: "https://api.matterhorn.example" });
assert.notEqual(directBackend.status, 0);
assert.ok(JSON.parse(directBackend.stdout).blockers.some((blocker) => blocker.id === "web.same_origin_proxy"));

const rawEngine = run({ VITE_OPENCODE_URL: "https://engine.matterhorn.example" });
assert.notEqual(rawEngine.status, 0);
assert.ok(JSON.parse(rawEngine.stdout).blockers.some((blocker) => blocker.id === "web.same_origin_proxy"));

const missingProxyDeclaration = run({ MATTERHORN_PUBLIC_PROXY_MODE: "" });
assert.notEqual(missingProxyDeclaration.status, 0);
assert.ok(JSON.parse(missingProxyDeclaration.stdout).blockers.some((blocker) => blocker.id === "web.proxy_configured"));

const noSignin = run({ VITE_MATTERHORN_REQUIRE_SIGNIN: "0" });
assert.notEqual(noSignin.status, 0);
assert.ok(JSON.parse(noSignin.stdout).blockers.some((blocker) => blocker.id === "web.require_signin"));

const deploymentSource = readFileSync("apps/app/src/app/lib/matterhorn-deployment.ts", "utf8");
const serverSource = readFileSync("apps/app/src/react-app/kernel/server-provider.tsx", "utf8");
const globalSource = readFileSync("apps/app/src/react-app/kernel/global-sdk-provider.tsx", "utf8");
const settingsSource = readFileSync("apps/app/src/app/lib/matterhorn-server.ts", "utf8");
const protocolDeskSource = readFileSync("apps/app/src/react-app/domains/wallet/pages/BittensorPanel.tsx", "utf8");
const endpointSource = readFileSync("apps/app/src/app/lib/workspace-endpoint.ts", "utf8");
const denSource = readFileSync("apps/app/src/app/lib/den.ts", "utf8");
const deepLinkSource = readFileSync("apps/app/src/react-app/shell/remote-connect-deep-links.tsx", "utf8");
assert.match(deploymentSource, /VITE_MATTERHORN_DEPLOYMENT/);
assert.match(deploymentSource, /isPublicBetaWebDeployment/);
assert.match(serverSource, /if \(isPublicBetaWebDeployment\(\)\) return "";/);
assert.match(globalSource, /if \(isPublicBetaWebDeployment\(\)\) return "";/);
assert.match(settingsSource, /Clear an inherited desktop connection before using the same-origin proxy/);
assert.match(settingsSource, /Public web never persists a direct server target or bearer credentials/);
assert.match(protocolDeskSource, /isPublicBetaWebDeployment\(\)/);
assert.match(protocolDeskSource, /credentials: "same-origin"/);
assert.match(endpointSource, /window\.location\.origin/);
assert.match(endpointSource, /token: ""/);
assert.match(denSource, /Browser Cloud auth is cookie-backed/);
assert.match(denSource, /credentials: "include"/);
assert.match(deepLinkSource, /stripRemoteConnectQuery/);
assert.match(deepLinkSource, /if \(isPublicBetaWebDeployment\(\)\)/);

console.log("Public Beta web readiness contract passed.");
