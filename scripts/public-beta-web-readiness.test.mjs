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
const vercelConfigs = [
  JSON.parse(readFileSync("vercel.json", "utf8")),
  JSON.parse(readFileSync("apps/app/vercel.json", "utf8")),
];
for (const source of [publicBetaLaunchDoc, productionLaunchDoc, gateSource]) {
  assert.doesNotMatch(source, /pnpm (?:gate:public-beta-web|launch:readiness) --(?: |\s*\\)/);
}
assert.match(gateSource, /pnpm gate:public-beta-web --json/);

for (const vercelConfig of vercelConfigs) {
  const immutableAssetHeaders = Object.fromEntries(
    vercelConfig.headers
      .find((entry) => entry.source === "/assets/:path*")
      .headers
      .map((header) => [header.key.toLowerCase(), header.value]),
  );
  assert.equal(immutableAssetHeaders["cache-control"], "public, max-age=31536000, immutable");
  const vercelHeaders = Object.fromEntries(
    vercelConfig.headers
      .find((entry) => entry.source === "/(.*)")
      .headers
      .map((header) => [header.key.toLowerCase(), header.value]),
  );
  assert.match(vercelHeaders["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(vercelHeaders["content-security-policy"], /base-uri 'none'/);
  assert.match(vercelHeaders["content-security-policy"], /object-src 'none'/);
  assert.match(vercelHeaders["content-security-policy"], /script-src 'self' https:\/\/challenges\.cloudflare\.com/);
  assert.equal(vercelHeaders["cross-origin-opener-policy"], "same-origin-allow-popups");
  assert.equal(vercelHeaders["permissions-policy"], "camera=(), microphone=(), geolocation=()");
  assert.equal(vercelHeaders["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(vercelHeaders["x-content-type-options"], "nosniff");
  assert.equal(vercelHeaders["x-frame-options"], "DENY");
}

const managedKeys = [
  "VITE_MATTERHORN_DEPLOYMENT",
  "VITE_MATTERHORN_PUBLIC_BETA",
  "VITE_MATTERHORN_BUILD_COMMIT",
  "VITE_MATTERHORN_REVIEWED_DESK_ACTIONS_ENABLED",
  "VITE_MATTERHORN_REQUIRE_SIGNIN",
  "VITE_MATTERHORN_CLOUD_ENABLED",
  "VITE_MATTERHORN_CLOUD_URL",
  "VITE_MATTERHORN_CLOUD_API_URL",
  "MATTERHORN_APP_URL",
  "MATTERHORN_PUBLIC_PROXY_MODE",
  "MATTERHORN_CONTROL_PLANE_URL",
  "MATTERHORN_PROXY_SECRET",
  "CUDOS_API_KEY",
  "MATTERHORN_PROVIDER_PRIVACY_MODE",
  "MATTERHORN_CUDOS_TRAINING_USE",
  "MATTERHORN_CUDOS_PRIVACY_POLICY_URL",
  "MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT",
  "MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS",
  "MATTERHORN_CUDOS_TRAINING_OPTED_IN",
  "MATTERHORN_CUDOS_PROMPT_RETENTION_POLICY",
  "MATTERHORN_MODEL_USAGE_ENFORCEMENT",
  "MATTERHORN_MODEL_USAGE_DAILY_LIMIT",
  "MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT",
  "MATTERHORN_MODEL_USAGE_GLOBAL_DAILY_LIMIT",
  "MATTERHORN_MODEL_USAGE_GLOBAL_MONTHLY_LIMIT",
  "MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS",
  "MATTERHORN_SIGNUPS_ENABLED",
  "MATTERHORN_SIGNUP_MAX_ACCOUNTS",
  "MATTERHORN_EMAIL_VERIFICATION_REQUIRED",
  "MATTERHORN_TURNSTILE_SITEKEY",
  "TURNSTILE_SECRET",
  "TURNSTILE_HOSTNAMES",
  "EMAIL_FROM",
  "EMAIL_FROM_NAME",
  "AWS_SES_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SES_CONFIGURATION_SET",
  "MATTERHORN_SES_EVENT_SECRET",
  "MATTERHORN_HOST_BACKUP_REQUIRED",
  "MATTERHORN_BACKUP_S3_BUCKET",
  "MATTERHORN_BACKUP_KMS_KEY_ID",
  "MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID",
  "MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY",
  "MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED",
  "MATTERHORN_TERMS_VERSION",
  "MATTERHORN_PRIVACY_VERSION",
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
    VITE_MATTERHORN_BUILD_COMMIT: "a".repeat(40),
    VITE_MATTERHORN_REVIEWED_DESK_ACTIONS_ENABLED: "1",
    VITE_MATTERHORN_REQUIRE_SIGNIN: "true",
    VITE_MATTERHORN_CLOUD_ENABLED: "true",
    VITE_MATTERHORN_CLOUD_URL: "https://app.matterhorn.example",
    VITE_MATTERHORN_CLOUD_API_URL: "https://app.matterhorn.example/api/den",
    MATTERHORN_APP_URL: "https://app.matterhorn.example",
    MATTERHORN_PUBLIC_PROXY_MODE: "same-origin",
    MATTERHORN_CONTROL_PLANE_URL: "https://api-origin.matterhorn.example",
    MATTERHORN_PROXY_SECRET: "a-high-entropy-edge-secret-value-123",
    CUDOS_API_KEY: "managed-cudos-secret-placeholder",
    MATTERHORN_PROVIDER_PRIVACY_MODE: "verified-only",
    MATTERHORN_CUDOS_TRAINING_USE: "none",
    MATTERHORN_CUDOS_PRIVACY_POLICY_URL: "https://provider.example/privacy",
    MATTERHORN_CUDOS_PRIVACY_VERIFIED_AT: new Date().toISOString(),
    MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS: "0",
    MATTERHORN_MODEL_USAGE_ENFORCEMENT: "hard",
    MATTERHORN_MODEL_USAGE_DAILY_LIMIT: "250000",
    MATTERHORN_MODEL_USAGE_MONTHLY_LIMIT: "2000000",
    MATTERHORN_MODEL_USAGE_GLOBAL_DAILY_LIMIT: "5000000",
    MATTERHORN_MODEL_USAGE_GLOBAL_MONTHLY_LIMIT: "50000000",
    MATTERHORN_MODEL_USAGE_RESERVATION_TOKENS: "32000",
    MATTERHORN_SIGNUPS_ENABLED: "true",
    MATTERHORN_SIGNUP_MAX_ACCOUNTS: "100",
    MATTERHORN_EMAIL_VERIFICATION_REQUIRED: "true",
    MATTERHORN_TURNSTILE_SITEKEY: "0x4AAAAAAAtest-site-key",
    TURNSTILE_SECRET: "test-turnstile-secret-value",
    TURNSTILE_HOSTNAMES: "app.matterhorn.example",
    EMAIL_FROM: "accounts@matterhorn.example",
    EMAIL_FROM_NAME: "Matterhorn Desks",
    AWS_SES_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "AKIASESONLYEXAMPLE",
    AWS_SECRET_ACCESS_KEY: "ses-only-secret-value",
    AWS_SES_CONFIGURATION_SET: "matterhorn-transactional",
    MATTERHORN_SES_EVENT_SECRET: "ses-event-secret-at-least-32-characters",
    MATTERHORN_HOST_BACKUP_REQUIRED: "true",
    MATTERHORN_BACKUP_S3_BUCKET: "matterhorn-private-backups",
    MATTERHORN_BACKUP_KMS_KEY_ID: "arn:aws:kms:us-east-1:123456789012:key/example",
    MATTERHORN_BACKUP_AWS_ACCESS_KEY_ID: "AKIABACKUPONLYEXAMPLE",
    MATTERHORN_BACKUP_AWS_SECRET_ACCESS_KEY: "backup-only-secret-value",
    MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED: "true",
    MATTERHORN_TERMS_VERSION: "2026-08-13",
    MATTERHORN_PRIVACY_VERSION: "2026-08-13",
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

const missingWebCommit = run({ VITE_MATTERHORN_BUILD_COMMIT: "" });
assert.notEqual(missingWebCommit.status, 0);
assert.ok(JSON.parse(missingWebCommit.stdout).blockers.some((blocker) => blocker.id === "web.build_commit"));

const noReviewedActions = run({ VITE_MATTERHORN_REVIEWED_DESK_ACTIONS_ENABLED: "0" });
assert.notEqual(noReviewedActions.status, 0);
assert.ok(JSON.parse(noReviewedActions.stdout).blockers.some((blocker) => blocker.id === "web.reviewed_desk_actions"));

const crossOriginCloudApi = run({ VITE_MATTERHORN_CLOUD_API_URL: "https://api.matterhorn.example/api/den" });
assert.notEqual(crossOriginCloudApi.status, 0);
assert.ok(JSON.parse(crossOriginCloudApi.stdout).blockers.some((blocker) => blocker.id === "web.cloud_api_same_origin"));

const missingProxySecret = run({ MATTERHORN_PROXY_SECRET: "" });
assert.notEqual(missingProxySecret.status, 0);
assert.ok(JSON.parse(missingProxySecret.stdout).blockers.some((blocker) => blocker.id === "web.proxy_secret"));
assert.doesNotMatch(missingProxySecret.stdout, /a-high-entropy-edge-secret-value-123/);

const unboundedUsage = run({ MATTERHORN_MODEL_USAGE_ENFORCEMENT: "off" });
assert.notEqual(unboundedUsage.status, 0);
assert.ok(JSON.parse(unboundedUsage.stdout).blockers.some((blocker) => blocker.id === "signup.usage_enforcement"));

const missingInferenceProvider = run({ CUDOS_API_KEY: "" });
assert.notEqual(missingInferenceProvider.status, 0);
assert.ok(JSON.parse(missingInferenceProvider.stdout).blockers.some((blocker) => blocker.id === "signup.inference_provider"));
assert.doesNotMatch(missingInferenceProvider.stdout, /managed-cudos-secret-placeholder/);

const unverifiedProviderPrivacy = run({ MATTERHORN_PROVIDER_PRIVACY_MODE: "disclosure" });
assert.notEqual(unverifiedProviderPrivacy.status, 0);
assert.ok(JSON.parse(unverifiedProviderPrivacy.stdout).blockers.some((blocker) => blocker.id === "signup.provider_privacy_enforcement"));

const missingNoTrainingTerms = run({ MATTERHORN_CUDOS_TRAINING_USE: "" });
assert.notEqual(missingNoTrainingTerms.status, 0);
assert.ok(JSON.parse(missingNoTrainingTerms.stdout).blockers.some((blocker) => blocker.id === "signup.provider_no_training"));

const missingRetentionTerms = run({ MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS: "" });
assert.notEqual(missingRetentionTerms.status, 0);
assert.ok(JSON.parse(missingRetentionTerms.stdout).blockers.some((blocker) => blocker.id === "signup.provider_retention"));

const reviewedProviderPolicy = run({
  MATTERHORN_CUDOS_TRAINING_USE: "opt-in-only",
  MATTERHORN_CUDOS_TRAINING_OPTED_IN: "false",
  MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS: "",
  MATTERHORN_CUDOS_PROMPT_RETENTION_POLICY: "provider-policy",
});
assert.equal(reviewedProviderPolicy.status, 0, reviewedProviderPolicy.stderr || reviewedProviderPolicy.stdout);

const providerPolicyWithoutAccountDeclaration = run({
  MATTERHORN_CUDOS_TRAINING_USE: "opt-in-only",
  MATTERHORN_CUDOS_TRAINING_OPTED_IN: "",
  MATTERHORN_CUDOS_PROMPT_RETENTION_DAYS: "",
  MATTERHORN_CUDOS_PROMPT_RETENTION_POLICY: "provider-policy",
});
assert.notEqual(providerPolicyWithoutAccountDeclaration.status, 0);
assert.ok(JSON.parse(providerPolicyWithoutAccountDeclaration.stdout).blockers.some((blocker) => blocker.id === "signup.provider_no_training"));

const unlimitedSignups = run({ MATTERHORN_SIGNUP_MAX_ACCOUNTS: "" });
assert.notEqual(unlimitedSignups.status, 0);
assert.ok(JSON.parse(unlimitedSignups.stdout).blockers.some((blocker) => blocker.id === "signup.capacity"));

const unverifiedSignups = run({ MATTERHORN_EMAIL_VERIFICATION_REQUIRED: "false" });
assert.notEqual(unverifiedSignups.status, 0);
assert.ok(JSON.parse(unverifiedSignups.stdout).blockers.some((blocker) => blocker.id === "signup.email_verification"));

const missingTurnstile = run({ TURNSTILE_SECRET: "" });
assert.notEqual(missingTurnstile.status, 0);
assert.ok(JSON.parse(missingTurnstile.stdout).blockers.some((blocker) => blocker.id === "signup.bot_protection"));

const unsafeTurnstileHosts = run({
  TURNSTILE_HOSTNAMES: "app.matterhorn.example,localhost",
});
assert.notEqual(unsafeTurnstileHosts.status, 0);
assert.ok(JSON.parse(unsafeTurnstileHosts.stdout).blockers.some((blocker) => blocker.id === "signup.bot_protection"));

const missingEmailDelivery = run({ AWS_SECRET_ACCESS_KEY: "" });
assert.notEqual(missingEmailDelivery.status, 0);
assert.ok(JSON.parse(missingEmailDelivery.stdout).blockers.some((blocker) => blocker.id === "signup.email_delivery"));
assert.doesNotMatch(missingEmailDelivery.stdout, /ses-only-secret-value/);

const missingLegalAcceptance = run({ MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED: "false" });
assert.notEqual(missingLegalAcceptance.status, 0);
assert.ok(JSON.parse(missingLegalAcceptance.stdout).blockers.some((blocker) => blocker.id === "signup.legal_acceptance"));

const missingLegalVersion = run({ MATTERHORN_PRIVACY_VERSION: "" });
assert.notEqual(missingLegalVersion.status, 0);
assert.ok(JSON.parse(missingLegalVersion.stdout).blockers.some((blocker) => blocker.id === "signup.legal_versions"));

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
