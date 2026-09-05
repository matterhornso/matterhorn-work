import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { buildMatterhornFirstPartyTestnetManifests } from "./first-party-crypto-apps.js";
import {
  buildCryptoAppRuntimeCertificationReport,
  expectedCryptoAppRuntimeProbeActionIds,
  requiredCryptoAppRuntimeCertificationProbes,
} from "./crypto-app-runtime-certification.js";
import { sha256 } from "./guarded-runtime-crypto.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = { port: number; stop: (closeActiveConnections?: boolean) => void | Promise<void> };

const TOKEN = "owt_crypto_developer_test_token";
const HOST_TOKEN = "owt_crypto_developer_test_host_token";
const PASSWORD = "matterhorn-crypto-developer-test-password";
const ENV_KEYS = [
  "MATTERHORN_AUTH_DB",
  "MATTERHORN_WORK_DATA_DIR",
  "MATTERHORN_SIGNUPS_ENABLED",
  "MATTERHORN_EMAIL_VERIFICATION_REQUIRED",
  "MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED",
  "MATTERHORN_CRYPTO_APP_GATEWAY_MODE",
  "MATTERHORN_CRYPTO_APP_POLICY_VERSION",
  "MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON",
  "MATTERHORN_CRYPTO_APP_REGISTRY_DB",
  "MATTERHORN_CRYPTO_APP_CONNECTION_DB",
  "MATTERHORN_CRYPTO_APP_CONNECTION_INTEGRITY_SECRET",
  "MATTERHORN_CRYPTO_APP_DEVELOPER_DB",
  "MATTERHORN_CRYPTO_APP_OPERATIONAL_DB",
  "MATTERHORN_CRYPTO_APP_OPERATIONAL_INTEGRITY_SECRET",
] as const;
const priorEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
const roots: string[] = [];
const stops: Array<() => void | Promise<void>> = [];

function config(port: number, root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1_000 },
    corsOrigins: ["http://127.0.0.1:5173"],
    workspaces: [{
      id: "ws_crypto_developer",
      name: "Crypto developer acceptance workspace",
      path: root,
      preset: "default",
      workspaceType: "local",
    }],
    authorizedRoots: [root],
    readOnly: false,
    startedAt: Date.now(),
    tokenSource: "cli",
    hostTokenSource: "cli",
    logFormat: "pretty",
    logRequests: false,
    reloadWatchers: false,
  } as ServerConfig;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

async function boot(mode: "off" | "shadow") {
  const root = mkdtempSync(join(tmpdir(), "matterhorn-crypto-developer-routes-"));
  roots.push(root);
  process.env.MATTERHORN_WORK_DATA_DIR = join(root, "data");
  process.env.MATTERHORN_AUTH_DB = join(root, "auth.db");
  process.env.MATTERHORN_SIGNUPS_ENABLED = "true";
  process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "false";
  process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED = "false";
  process.env.MATTERHORN_CRYPTO_APP_GATEWAY_MODE = mode;
  if (mode === "shadow") {
    const platformKeys = generateKeyPairSync("ed25519");
    process.env.MATTERHORN_CRYPTO_APP_POLICY_VERSION = "policy-1";
    process.env.MATTERHORN_CRYPTO_APP_PUBLISHER_KEYS_JSON = JSON.stringify([{
      publisherId: "matterhorn",
      keyId: "platform-key-1",
      algorithm: "ed25519",
      publicKeyPem: platformKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    }]);
    process.env.MATTERHORN_CRYPTO_APP_REGISTRY_DB = join(root, "registry.db");
    process.env.MATTERHORN_CRYPTO_APP_CONNECTION_DB = join(root, "connections.db");
    process.env.MATTERHORN_CRYPTO_APP_CONNECTION_INTEGRITY_SECRET =
      "developer-route-connection-integrity-secret-at-least-32-bytes";
    process.env.MATTERHORN_CRYPTO_APP_DEVELOPER_DB = join(root, "developer.db");
    process.env.MATTERHORN_CRYPTO_APP_OPERATIONAL_DB = join(root, "operational.db");
    process.env.MATTERHORN_CRYPTO_APP_OPERATIONAL_INTEGRITY_SECRET =
      "developer-route-operational-integrity-secret-at-least-32-bytes";
  }
  const server = await startServer(config(await freePort(), root)) as Served;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await server.stop(true);
  };
  stops.push(stop);
  return { base: `http://127.0.0.1:${server.port}`, stop };
}

async function request(base: string, path: string, options: {
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  cookie?: string;
  bearer?: string;
  host?: boolean;
} = {}) {
  const headers = new Headers();
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.bearer) headers.set("Authorization", `Bearer ${options.bearer}`);
  if (options.host) headers.set("x-matterhorn-host-token", HOST_TOKEN);
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { response, payload: await response.json().catch(() => null) as any };
}

function cookie(response: Response): string {
  const value = response.headers.get("set-cookie")?.split(";")[0]?.trim() ?? "";
  if (!value.startsWith("mh_session=")) throw new Error("missing_test_session_cookie");
  return value;
}

function developerManifest(
  publisherId: string,
  keyId: string,
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
) {
  return buildMatterhornFirstPartyTestnetManifests({
    publisherId,
    publisherKeyId: keyId,
    sign: (payload) => sign(null, Buffer.from(payload), privateKey).toString("base64url"),
    suiTestnetEndpoint: "https://developer-adapter.example/v1/sui",
    hyperliquidTestnetEndpoint: "https://developer-adapter.example/v1/hyperliquid",
    privacyPolicyUrl: "https://developer.example/privacy",
    statusUrl: "https://status.developer.example",
    securityContact: "security@developer.example",
  })[0]!;
}

afterEach(async () => {
  while (stops.length) await stops.pop()?.();
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    const value = priorEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("crypto developer HTTP boundary", () => {
  test("is disabled without file-backed gateway startup", async () => {
    const server = await boot("off");
    expect((await request(server.base, "/developer/crypto-apps/profile")).response.status).toBe(401);
    const disabled = await request(server.base, "/developer/crypto-apps/profile", { bearer: TOKEN });
    expect(disabled.response.status).toBe(503);
    expect(disabled.payload.code).toBe("crypto_app_gateway_disabled");
  });

  test("requires an invite and hosted account, isolates submissions, and keeps promotion host-only", async () => {
    const server = await boot("shadow");
    const issuedA = await request(server.base, "/operator/crypto-developers/invites", {
      host: true,
      body: { ttlMinutes: 60 },
    });
    expect(issuedA.response.status).toBe(201);
    expect(issuedA.response.headers.get("cache-control")).toBe("no-store");
    const inviteA = String(issuedA.payload.invite.token);
    const initialStatus = await request(server.base, "/developer/crypto-apps/status", { bearer: TOKEN });
    expect(initialStatus.response.status).toBe(403);

    const cliEnrollment = await request(server.base, "/developer/crypto-apps/enroll", {
      bearer: TOKEN,
      body: { inviteToken: inviteA, publisherId: "acme.crypto", displayName: "Acme Crypto" },
    });
    expect(cliEnrollment.response.status).toBe(403);
    expect(cliEnrollment.payload.code).toBe("developer_account_session_required");

    const signupA = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "crypto-developer-a@example.com", password: PASSWORD },
    });
    const signupB = await request(server.base, "/api/auth/sign-up/email", {
      body: { email: "crypto-developer-b@example.com", password: PASSWORD },
    });
    expect(signupA.response.status).toBe(200);
    expect(signupB.response.status).toBe(200);
    const cookieA = cookie(signupA.response);
    const cookieB = cookie(signupB.response);
    expect((await request(server.base, "/developer/crypto-apps/status", { cookie: cookieA })).payload.status)
      .toMatchObject({ nextStep: "enroll", mainnetAvailable: false });

    const enrolledA = await request(server.base, "/developer/crypto-apps/enroll", {
      cookie: cookieA,
      body: { inviteToken: inviteA, publisherId: "acme.crypto", displayName: "Acme Crypto" },
    });
    expect(enrolledA.response.status).toBe(201);
    expect(JSON.stringify(enrolledA.payload)).not.toContain("crypto-developer-a@example.com");
    expect((await request(server.base, "/developer/crypto-apps/status", { cookie: cookieA })).payload.status.nextStep)
      .toBe("register_public_key");
    const stolenInvite = await request(server.base, "/developer/crypto-apps/enroll", {
      cookie: cookieB,
      body: { inviteToken: inviteA, publisherId: "beta.crypto", displayName: "Beta Crypto" },
    });
    expect(stolenInvite.response.status).toBe(409);
    expect(stolenInvite.payload.code).toBe("developer_invite_consumed");

    const issuedB = await request(server.base, "/operator/crypto-developers/invites", {
      host: true,
      body: { ttlMinutes: 60 },
    });
    await request(server.base, "/developer/crypto-apps/enroll", {
      cookie: cookieB,
      body: {
        inviteToken: issuedB.payload.invite.token,
        publisherId: "beta.crypto",
        displayName: "Beta Crypto",
      },
    });

    const keys = generateKeyPairSync("ed25519");
    const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    const keyRegistered = await request(server.base, "/developer/crypto-apps/publisher-keys", {
      cookie: cookieA,
      body: { keyId: "key-1", algorithm: "ed25519", publicKeyPem },
    });
    expect(keyRegistered.response.status).toBe(201);
    expect(JSON.stringify(keyRegistered.payload)).not.toContain("BEGIN PUBLIC KEY");
    expect((await request(server.base, "/developer/crypto-apps/status", { cookie: cookieA })).payload.status.nextStep)
      .toBe("submit_testnet_manifest");

    const manifest = developerManifest("acme.crypto", "key-1", keys.privateKey);
    const submitted = await request(server.base, "/developer/crypto-apps/submissions", {
      cookie: cookieA,
      body: { manifest, targetEnvironment: "testnet" },
    });
    expect(submitted.response.status).toBe(201);
    expect(submitted.payload.submission.state).toBe("static_passed");
    expect((await request(server.base, "/developer/crypto-apps/status", { cookie: cookieA })).payload.status.nextStep)
      .toBe("request_testnet_certification");
    const listA = await request(server.base, "/developer/crypto-apps/submissions", { cookie: cookieA });
    const listB = await request(server.base, "/developer/crypto-apps/submissions", { cookie: cookieB });
    expect(listA.payload.submissions).toHaveLength(1);
    expect(listB.payload.submissions).toEqual([]);
    const usageA = await request(
      server.base,
      `/developer/crypto-apps/submissions/${manifest.appId}/${manifest.manifestRevision}/usage?days=7`,
      { cookie: cookieA },
    );
    expect(usageA.response.status).toBe(200);
    expect(usageA.payload.usage).toMatchObject({
      version: "matterhorn.crypto-app-developer-usage.v1",
      appId: manifest.appId,
      manifestRevision: manifest.manifestRevision,
      costUnit: "micro_usd",
      windowDays: 7,
      budgetPolicy: {
        scope: "per_workspace",
        dailyToolCostLimitMicros: 10_000_000,
        perCallToolCostLimitMicros: 1_000_000,
        walletTransactionLimitsIncluded: false,
      },
      totals: { calls: 0, actualCostMicros: 0 },
      privacy: {
        aggregateOnly: true,
        tenantIdentifiersIncluded: false,
        requestContentIncluded: false,
        walletDataIncluded: false,
      },
    });
    expect(JSON.stringify(usageA.payload)).not.toMatch(/workspaceId|connectionId|reservationId|runId|callId|walletAddress/);
    const crossAccountUsage = await request(
      server.base,
      `/developer/crypto-apps/submissions/${manifest.appId}/${manifest.manifestRevision}/usage`,
      { cookie: cookieB },
    );
    expect(crossAccountUsage.response.status).toBe(404);
    expect(crossAccountUsage.payload.code).toBe("developer_submission_not_found");
    const invalidUsageWindow = await request(
      server.base,
      `/developer/crypto-apps/submissions/${manifest.appId}/${manifest.manifestRevision}/usage?days=31`,
      { cookie: cookieA },
    );
    expect(invalidUsageWindow.response.status).toBe(400);
    expect(invalidUsageWindow.payload.code).toBe("developer_usage_query_invalid");

    const requested = await request(
      server.base,
      `/developer/crypto-apps/submissions/${manifest.appId}/${manifest.manifestRevision}/certification-request`,
      { method: "POST", cookie: cookieA },
    );
    expect(requested.response.status).toBe(200);
    expect(requested.payload.submission.state).toBe("certification_requested");
    expect((await request(server.base, "/developer/crypto-apps/status", { cookie: cookieA })).payload.status)
      .toMatchObject({ nextStep: "await_certification_review", submissionCounts: { certificationRequested: 1 } });
    const accountQueue = await request(server.base, "/operator/crypto-developers/certification-requests", {
      cookie: cookieA,
    });
    expect(accountQueue.response.status).toBe(401);
    const hostQueue = await request(server.base, "/operator/crypto-developers/certification-requests", {
      host: true,
    });
    expect(hostQueue.response.status).toBe(200);
    expect(hostQueue.payload.requests).toHaveLength(1);
    expect(hostQueue.payload.requests[0].publisherKey.publicKeyPem).toBe(publicKeyPem.trim());
    expect(hostQueue.payload.requests[0].state).toBe("certification_requested");

    const runtimeReport = buildCryptoAppRuntimeCertificationReport(
      hostQueue.payload.requests[0].manifest,
      hostQueue.payload.requests[0].staticReport,
      {
        probes: requiredCryptoAppRuntimeCertificationProbes(manifest).map((id) => ({
          id,
          passed: true,
          evidenceHash: sha256({ id, evidence: "host-only-redacted" }),
          actionIds: expectedCryptoAppRuntimeProbeActionIds(manifest, id),
        })),
        now: () => new Date("2026-09-01T00:01:00.000Z"),
      },
    );
    const accountOutcome = await request(
      server.base,
      `/operator/crypto-developers/submissions/${manifest.appId}/${manifest.manifestRevision}/certification-result`,
      { cookie: cookieA, body: { runtimeReport } },
    );
    expect(accountOutcome.response.status).toBe(401);
    const rawEvidenceRejected = await request(
      server.base,
      `/operator/crypto-developers/submissions/${manifest.appId}/${manifest.manifestRevision}/certification-result`,
      { host: true, body: { runtimeReport: { ...runtimeReport, rawEvidence: "must-never-be-stored" } } },
    );
    expect(rawEvidenceRejected.response.status).toBe(400);
    expect(rawEvidenceRejected.payload.code).toBe("developer_runtime_report_invalid");
    expect((await request(server.base, "/operator/crypto-developers/certification-requests", { host: true })).payload.requests)
      .toHaveLength(1);
    const recorded = await request(
      server.base,
      `/operator/crypto-developers/submissions/${manifest.appId}/${manifest.manifestRevision}/certification-result`,
      { host: true, body: { runtimeReport } },
    );
    expect(recorded.response.status).toBe(200);
    expect(recorded.payload.submission.state).toBe("certification_passed");
    const accountAfterReview = await request(server.base, "/developer/crypto-apps/submissions", { cookie: cookieA });
    expect(accountAfterReview.payload.submissions[0]).toMatchObject({
      state: "certification_passed",
      runtimeReview: { passed: true, reportHash: runtimeReport.reportHash },
    });
    expect(JSON.stringify(accountAfterReview.payload)).not.toContain(runtimeReport.probes[0]!.evidenceHash);
    expect((await request(server.base, "/operator/crypto-developers/certification-requests", { host: true })).payload.requests)
      .toEqual([]);

    const registry = await request(server.base, "/operator/crypto-apps", { host: true });
    expect(registry.payload.entries).toEqual([]);

    const deleted = await request(server.base, "/api/auth/account", {
      method: "DELETE",
      cookie: cookieA,
      body: { password: PASSWORD, confirmationEmail: "crypto-developer-a@example.com" },
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.workspaceDataDeletionComplete).toBe(true);
    const queueAfterDeletion = await request(
      server.base,
      "/operator/crypto-developers/certification-requests",
      { host: true },
    );
    expect(queueAfterDeletion.payload.requests).toEqual([]);
    const submissionAfterDeletion = await request(
      server.base,
      `/operator/crypto-developers/submissions/${manifest.appId}/${manifest.manifestRevision}`,
      { host: true },
    );
    expect(submissionAfterDeletion.response.status).toBe(404);
  });
});
