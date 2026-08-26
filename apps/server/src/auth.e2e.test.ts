import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConsoleEmailPreviewSink, type ConsoleEmailPreview } from "@matterhorn-work/email";

import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

type Served = {
  port: number;
  stop: (closeActiveConnections?: boolean) => void | Promise<void>;
};

type JsonResult = {
  response: Response;
  payload: any;
};

const TOKEN = "owt_auth_test_token";
const HOST_TOKEN = "owt_auth_test_host_token";
const PASSWORD = "matterhorn-test-password";
const nativeFetch = globalThis.fetch;
const roots: string[] = [];
const stops: Array<() => void | Promise<void>> = [];
const priorAuthDb = process.env.MATTERHORN_AUTH_DB;
const priorDataDir = process.env.MATTERHORN_WORK_DATA_DIR;
const priorMemoryRoot = process.env.MATTERHORN_WORK_MEMORY_ROOT;
const priorSignupsEnabled = process.env.MATTERHORN_SIGNUPS_ENABLED;
const priorSignupCapacity = process.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS;
const priorEmailVerificationRequired = process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED;
const priorEmailFrom = process.env.EMAIL_FROM;
const priorEmailFromName = process.env.EMAIL_FROM_NAME;
const priorEmailDevMode = process.env.MATTERHORN_EMAIL_DEV_MODE;
const priorAppUrl = process.env.MATTERHORN_APP_URL;
const priorAwsSesRegion = process.env.AWS_SES_REGION;
const priorAwsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const priorAwsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const priorAwsSesConfigurationSet = process.env.AWS_SES_CONFIGURATION_SET;
const priorSesEventSecret = process.env.MATTERHORN_SES_EVENT_SECRET;
const priorLegalAcceptanceRequired = process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED;
const priorTermsVersion = process.env.MATTERHORN_TERMS_VERSION;
const priorPrivacyVersion = process.env.MATTERHORN_PRIVACY_VERSION;
const priorNodeEnv = process.env.NODE_ENV;
const priorUsageEnforcement = process.env.MATTERHORN_MODEL_USAGE_ENFORCEMENT;
const priorTurnstileSiteKey = process.env.MATTERHORN_TURNSTILE_SITEKEY;
const priorTurnstileSecret = process.env.TURNSTILE_SECRET;
const priorTurnstileHostnames = process.env.TURNSTILE_HOSTNAMES;
const priorAccountMessageGatewayRequired = process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED;
const priorAgentRuntimeSecret = process.env.MATTERHORN_AGENT_RUNTIME_SECRET;
const priorHostedPublicBeta = process.env.MATTERHORN_HOSTED_PUBLIC_BETA;

function config(port: number, root: string): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 1000 },
    corsOrigins: ["http://127.0.0.1:5173"],
    workspaces: [{
      id: "ws_auth",
      name: "Auth acceptance workspace",
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

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close(() => resolve(address.port));
    });
  });
}

async function boot(root?: string) {
  const resolvedRoot =
    root ?? mkdtempSync(join(tmpdir(), "matterhorn-auth-e2e-"));
  if (!root) roots.push(resolvedRoot);
  process.env.MATTERHORN_WORK_DATA_DIR = join(resolvedRoot, "data");
  process.env.MATTERHORN_WORK_MEMORY_ROOT = join(resolvedRoot, "memory");
  delete process.env.MATTERHORN_AUTH_DB;
  const server = await startServer(
    config(await getFreePort(), resolvedRoot),
  ) as Served;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await server.stop(true);
  };
  stops.push(stop);
  return {
    base: `http://127.0.0.1:${server.port}`,
    root: resolvedRoot,
    authDb: join(resolvedRoot, "data", "auth", "accounts.db"),
    stop,
  };
}

async function jsonRequest(
  base: string,
  path: string,
  options: {
    body?: Record<string, unknown>;
    cookie?: string;
    bearer?: string;
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    forwardedProto?: "http" | "https";
    origin?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<JsonResult> {
  const headers = new Headers();
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.bearer) headers.set("Authorization", `Bearer ${options.bearer}`);
  if (options.forwardedProto) {
    headers.set("X-Forwarded-Proto", options.forwardedProto);
  }
  if (options.origin) headers.set("Origin", options.origin);
  for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return {
    response,
    payload: await response.json().catch(() => null),
  };
}

function sessionCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0]?.trim() ?? "";
  if (!cookie.startsWith("mh_session=")) {
    throw new Error(`Matterhorn session cookie missing: ${setCookie}`);
  }
  return cookie;
}

function cookieToken(cookie: string): string {
  return decodeURIComponent(cookie.slice("mh_session=".length));
}

async function captureDevEmail<T>(callback: () => Promise<T>): Promise<{
  result: T;
  payload: { template: string; props: Record<string, unknown> };
}> {
  const previews: ConsoleEmailPreview[] = [];
  setConsoleEmailPreviewSink((preview) => previews.push(preview));
  try {
    const result = await callback();
    const preview = previews.at(-1);
    if (!preview) throw new Error("Expected a development email preview.");
    return { result, payload: { template: preview.template, props: preview.props } };
  } finally {
    setConsoleEmailPreviewSink(null);
  }
}

afterEach(async () => {
  globalThis.fetch = nativeFetch;
  while (stops.length) await stops.pop()?.();
  while (roots.length) {
    rmSync(roots.pop()!, { force: true, recursive: true });
  }
  if (priorAuthDb === undefined) delete process.env.MATTERHORN_AUTH_DB;
  else process.env.MATTERHORN_AUTH_DB = priorAuthDb;
  if (priorDataDir === undefined) delete process.env.MATTERHORN_WORK_DATA_DIR;
  else process.env.MATTERHORN_WORK_DATA_DIR = priorDataDir;
  if (priorMemoryRoot === undefined) delete process.env.MATTERHORN_WORK_MEMORY_ROOT;
  else process.env.MATTERHORN_WORK_MEMORY_ROOT = priorMemoryRoot;
  if (priorSignupsEnabled === undefined) delete process.env.MATTERHORN_SIGNUPS_ENABLED;
  else process.env.MATTERHORN_SIGNUPS_ENABLED = priorSignupsEnabled;
  if (priorSignupCapacity === undefined) delete process.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS;
  else process.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS = priorSignupCapacity;
  if (priorEmailVerificationRequired === undefined) delete process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED;
  else process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = priorEmailVerificationRequired;
  if (priorEmailFrom === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = priorEmailFrom;
  if (priorEmailFromName === undefined) delete process.env.EMAIL_FROM_NAME;
  else process.env.EMAIL_FROM_NAME = priorEmailFromName;
  if (priorEmailDevMode === undefined) delete process.env.MATTERHORN_EMAIL_DEV_MODE;
  else process.env.MATTERHORN_EMAIL_DEV_MODE = priorEmailDevMode;
  if (priorAppUrl === undefined) delete process.env.MATTERHORN_APP_URL;
  else process.env.MATTERHORN_APP_URL = priorAppUrl;
  if (priorAwsSesRegion === undefined) delete process.env.AWS_SES_REGION;
  else process.env.AWS_SES_REGION = priorAwsSesRegion;
  if (priorAwsAccessKeyId === undefined) delete process.env.AWS_ACCESS_KEY_ID;
  else process.env.AWS_ACCESS_KEY_ID = priorAwsAccessKeyId;
  if (priorAwsSecretAccessKey === undefined) delete process.env.AWS_SECRET_ACCESS_KEY;
  else process.env.AWS_SECRET_ACCESS_KEY = priorAwsSecretAccessKey;
  if (priorAwsSesConfigurationSet === undefined) delete process.env.AWS_SES_CONFIGURATION_SET;
  else process.env.AWS_SES_CONFIGURATION_SET = priorAwsSesConfigurationSet;
  if (priorSesEventSecret === undefined) delete process.env.MATTERHORN_SES_EVENT_SECRET;
  else process.env.MATTERHORN_SES_EVENT_SECRET = priorSesEventSecret;
  if (priorLegalAcceptanceRequired === undefined) delete process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED;
  else process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED = priorLegalAcceptanceRequired;
  if (priorTermsVersion === undefined) delete process.env.MATTERHORN_TERMS_VERSION;
  else process.env.MATTERHORN_TERMS_VERSION = priorTermsVersion;
  if (priorPrivacyVersion === undefined) delete process.env.MATTERHORN_PRIVACY_VERSION;
  else process.env.MATTERHORN_PRIVACY_VERSION = priorPrivacyVersion;
  if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = priorNodeEnv;
  if (priorUsageEnforcement === undefined) delete process.env.MATTERHORN_MODEL_USAGE_ENFORCEMENT;
  else process.env.MATTERHORN_MODEL_USAGE_ENFORCEMENT = priorUsageEnforcement;
  if (priorTurnstileSiteKey === undefined) delete process.env.MATTERHORN_TURNSTILE_SITEKEY;
  else process.env.MATTERHORN_TURNSTILE_SITEKEY = priorTurnstileSiteKey;
  if (priorTurnstileSecret === undefined) delete process.env.TURNSTILE_SECRET;
  else process.env.TURNSTILE_SECRET = priorTurnstileSecret;
  if (priorTurnstileHostnames === undefined) delete process.env.TURNSTILE_HOSTNAMES;
  else process.env.TURNSTILE_HOSTNAMES = priorTurnstileHostnames;
  if (priorAccountMessageGatewayRequired === undefined) delete process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED;
  else process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED = priorAccountMessageGatewayRequired;
  if (priorAgentRuntimeSecret === undefined) delete process.env.MATTERHORN_AGENT_RUNTIME_SECRET;
  else process.env.MATTERHORN_AGENT_RUNTIME_SECRET = priorAgentRuntimeSecret;
  if (priorHostedPublicBeta === undefined) delete process.env.MATTERHORN_HOSTED_PUBLIC_BETA;
  else process.env.MATTERHORN_HOSTED_PUBLIC_BETA = priorHostedPublicBeta;
});

describe("public account authentication", () => {
  test("exports only the signed-in account record and never credential material", async () => {
    const app = await boot();
    process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "false";
    process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED = "true";
    process.env.MATTERHORN_TERMS_VERSION = "terms-export-test";
    process.env.MATTERHORN_PRIVACY_VERSION = "privacy-export-test";

    const owner = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "account-export@example.com",
        password: PASSWORD,
        name: "Account Export",
        legalAccepted: true,
      },
    });
    expect(owner.response.status).toBe(200);
    const ownerCookie = sessionCookie(owner.response);
    const ownerToken = cookieToken(ownerCookie);
    const other = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "other-account@example.com",
        password: PASSWORD,
        name: "Other Account",
        legalAccepted: true,
      },
    });
    expect(other.response.status).toBe(200);

    expect((await jsonRequest(app.base, "/api/auth/account/export")).response.status).toBe(401);
    const exported = await jsonRequest(app.base, "/api/auth/account/export", { cookie: ownerCookie });
    expect(exported.response.status).toBe(200);
    expect(exported.response.headers.get("cache-control")).toBe("no-store");
    expect(exported.response.headers.get("content-disposition")).toMatch(
      /^attachment; filename="matterhorn-account-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(exported.payload).toEqual(expect.objectContaining({
      version: "matterhorn.account-export.v1",
      filename: expect.stringMatching(/^matterhorn-account-\d{4}-\d{2}-\d{2}\.json$/),
      account: expect.objectContaining({
        id: owner.payload.user.id,
        email: "account-export@example.com",
        name: "Account Export",
        emailVerified: true,
        createdAt: expect.any(String),
      }),
      legalAcceptance: {
        termsVersion: "terms-export-test",
        privacyVersion: "privacy-export-test",
        acceptedAt: expect.any(String),
      },
      organizations: [expect.objectContaining({ id: owner.payload.organization.id, role: "owner" })],
      security: { activeSessionCount: 1 },
      includes: ["account_profile", "legal_acceptance", "organization_memberships", "session_count"],
    }));
    expect(Number.isNaN(Date.parse(exported.payload.generatedAt))).toBe(false);
    expect(Number.isNaN(Date.parse(exported.payload.account.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(exported.payload.legalAcceptance.acceptedAt))).toBe(false);

    const serialized = JSON.stringify(exported.payload);
    expect(serialized).not.toContain(ownerToken);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain("password_hash");
    expect(serialized).not.toContain("password_salt");
    expect(serialized).not.toContain("token_hash");
    expect(serialized).not.toContain("verificationCode");
    expect(serialized).not.toContain("resetToken");
    expect(serialized).not.toContain("other-account@example.com");
    expect(serialized).not.toContain(other.payload.organization.id);
    expect(exported.payload.excludes.join(" ")).toContain("never exported");
    expect(exported.payload.excludes.join(" ")).toContain("exported separately");
  });

  test("verifies email and completes enumeration-safe password recovery", async () => {
    const app = await boot();
    process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "true";
    process.env.EMAIL_FROM = "accounts@example.com";
    process.env.EMAIL_FROM_NAME = "Matterhorn Desks";
    process.env.MATTERHORN_EMAIL_DEV_MODE = "true";
    process.env.MATTERHORN_APP_URL = app.base;
    process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED = "true";
    process.env.MATTERHORN_TERMS_VERSION = "terms-2026-08";
    process.env.MATTERHORN_PRIVACY_VERSION = "privacy-2026-08";

    const missingAcceptance = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "verify@example.com", password: PASSWORD },
    });
    expect(missingAcceptance.response.status).toBe(400);
    expect(missingAcceptance.payload.code).toBe("legal_acceptance_required");

    const verificationDelivery = await captureDevEmail(() =>
      jsonRequest(app.base, "/api/auth/sign-up/email", {
        body: {
          email: "verify@example.com",
          password: PASSWORD,
          legalAccepted: true,
        },
      }),
    );
    expect(verificationDelivery.result.response.status).toBe(202);
    expect(verificationDelivery.result.payload.verificationRequired).toBe(true);
    expect(verificationDelivery.result.response.headers.get("set-cookie")).toBeNull();
    expect(verificationDelivery.payload.template).toBe("verification");
    const code = String(verificationDelivery.payload.props.verificationCode);
    expect(code).toMatch(/^\d{6}$/);
    const acceptanceDb = new Database(app.authDb, { readonly: true });
    expect(
      acceptanceDb.query(
        "SELECT terms_version, privacy_version FROM account_legal_acceptances",
      ).get(),
    ).toEqual({
      terms_version: "terms-2026-08",
      privacy_version: "privacy-2026-08",
    });
    acceptanceDb.close();

    const blockedSignIn = await jsonRequest(app.base, "/api/auth/sign-in/email", {
      body: { email: "verify@example.com", password: PASSWORD },
    });
    expect(blockedSignIn.response.status).toBe(403);
    expect(blockedSignIn.payload.code).toBe("email_unverified");

    const verified = await jsonRequest(app.base, "/api/auth/verify-email", {
      body: { email: "verify@example.com", code },
    });
    expect(verified.response.status).toBe(200);
    expect(verified.payload.user.emailVerified).toBe(true);
    const cookie = sessionCookie(verified.response);

    const reusedCode = await jsonRequest(app.base, "/api/auth/verify-email", {
      body: { email: "verify@example.com", code },
    });
    expect(reusedCode.response.status).toBe(400);
    expect(reusedCode.payload.code).toBe("invalid_verification_code");

    const resetDelivery = await captureDevEmail(() =>
      jsonRequest(app.base, "/api/auth/password-reset/request", {
        body: { email: "verify@example.com" },
      }),
    );
    expect(resetDelivery.result.response.status).toBe(202);
    expect(resetDelivery.payload.template).toBe("passwordReset");
    const resetLink = new URL(String(resetDelivery.payload.props.resetLink));
    expect(resetLink.origin).toBe(app.base);
    expect(resetLink.search).toBe("");
    const resetFragment = new URLSearchParams(resetLink.hash.slice(1));
    expect(resetFragment.get("mode")).toBe("reset-password");
    const resetToken = resetFragment.get("token") ?? "";
    expect(resetToken.length).toBeGreaterThan(30);

    const unknownReset = await jsonRequest(app.base, "/api/auth/password-reset/request", {
      body: { email: "unknown@example.com" },
    });
    expect(unknownReset.response.status).toBe(202);
    expect(unknownReset.payload).toEqual(resetDelivery.result.payload);

    const confirmed = await jsonRequest(app.base, "/api/auth/password-reset/confirm", {
      body: { token: resetToken, newPassword: "matterhorn-reset-password" },
    });
    expect(confirmed.response.status).toBe(200);
    const oldSession = await jsonRequest(app.base, "/api/den/v1/session", { cookie });
    expect(oldSession.payload).toEqual({ authenticated: false });
    const oldPassword = await jsonRequest(app.base, "/api/auth/sign-in/email", {
      body: { email: "verify@example.com", password: PASSWORD },
    });
    expect(oldPassword.response.status).toBe(401);
    const newPassword = await jsonRequest(app.base, "/api/auth/sign-in/email", {
      body: { email: "verify@example.com", password: "matterhorn-reset-password" },
    });
    expect(newPassword.response.status).toBe(200);
  });

  test("fails closed before creating an account when verification email is not configured", async () => {
    const app = await boot();
    process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "true";
    delete process.env.MATTERHORN_EMAIL_DEV_MODE;
    delete process.env.AWS_SES_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    const unavailable = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "not-created@example.com", password: PASSWORD },
    });
    expect(unavailable.response.status).toBe(503);
    expect(unavailable.payload.code).toBe("email_delivery_unavailable");

    process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "false";
    const created = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "not-created@example.com", password: PASSWORD },
    });
    expect(created.response.status).toBe(200);
  });

  test("does not advertise signup or password reset for incomplete production email configuration", async () => {
    const app = await boot();
    process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "true";
    process.env.EMAIL_FROM = "updates@matterhorn.so";
    process.env.EMAIL_FROM_NAME = "Matterhorn Desks";
    delete process.env.MATTERHORN_EMAIL_DEV_MODE;
    process.env.AWS_SES_REGION = "us-east-1";
    const regionOnly = await jsonRequest(app.base, "/api/auth/config");
    expect(regionOnly.payload.signupStatus).toBe("setup_required");
    expect(regionOnly.payload.signupsAvailable).toBe(false);
    expect(regionOnly.payload.passwordResetAvailable).toBe(false);

    process.env.AWS_ACCESS_KEY_ID = "AKIAEXAMPLE";
    process.env.AWS_SECRET_ACCESS_KEY = "authenticated-ses-password";
    const authenticatedSes = await jsonRequest(app.base, "/api/auth/config");
    expect(authenticatedSes.payload.signupsAvailable).toBe(true);
    expect(authenticatedSes.payload.passwordResetAvailable).toBe(false);

    process.env.AWS_SES_CONFIGURATION_SET = "matterhorn-transactional";
    process.env.MATTERHORN_SES_EVENT_SECRET = "ses-event-secret-at-least-32-characters";
    process.env.MATTERHORN_APP_URL = "http://127.0.0.1:5173";
    const completeSes = await jsonRequest(app.base, "/api/auth/config");
    expect(completeSes.payload.passwordResetAvailable).toBe(true);
  });

  test("authenticates SES events and suppresses bounced addresses without storing them in the suppression ledger", async () => {
    const app = await boot();
    process.env.MATTERHORN_SES_EVENT_SECRET = "ses-event-secret-at-least-32-characters";
    const event = {
      id: "evt-bounce-1",
      detail: {
        eventType: "BOUNCE",
        mail: { messageId: "ses-message-1" },
        bounce: { bouncedRecipients: [{ emailAddress: "bounce@example.com" }] },
      },
    };
    const rejected = await jsonRequest(app.base, "/api/auth/email-events/ses", { body: event });
    expect(rejected.response.status).toBe(401);
    const accepted = await jsonRequest(app.base, "/api/auth/email-events/ses", {
      body: event,
      headers: { "x-matterhorn-ses-event-secret": process.env.MATTERHORN_SES_EVENT_SECRET },
    });
    expect(accepted.response.status).toBe(200);
    const db = new Database(app.authDb, { readonly: true });
    const suppression = db.query("SELECT email_hash, reason, event_id FROM email_suppressions").get() as Record<string, unknown>;
    expect(suppression.reason).toBe("bounce");
    expect(suppression.event_id).toBe("evt-bounce-1");
    expect(String(suppression.email_hash)).toHaveLength(64);
    expect(JSON.stringify(suppression)).not.toContain("bounce@example.com");
    db.close();
  });

  test("requires an explicit production signup flag and all signup safety controls", async () => {
    const app = await boot();
    process.env.NODE_ENV = "production";
    delete process.env.MATTERHORN_SIGNUPS_ENABLED;
    const pausedConfig = await jsonRequest(app.base, "/api/auth/config");
    expect(pausedConfig.response.status).toBe(200);
    expect(pausedConfig.payload).toEqual({
      signupsAvailable: false,
      signupStatus: "paused",
      emailVerificationRequired: false,
      passwordResetAvailable: false,
      legalAcceptanceRequired: false,
      minimumPasswordLength: 12,
      turnstileSiteKey: null,
      infrastructureReady: false,
      emailTransportReady: false,
      launchReady: false,
    });
    expect(pausedConfig.response.headers.get("cache-control")).toBe("no-store");
    const implicit = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "implicit@example.com", password: PASSWORD },
    });
    expect(implicit.response.status).toBe(503);
    expect(implicit.payload.code).toBe("signups_paused");

    process.env.MATTERHORN_SIGNUPS_ENABLED = "true";
    process.env.MATTERHORN_EMAIL_VERIFICATION_REQUIRED = "false";
    process.env.MATTERHORN_LEGAL_ACCEPTANCE_REQUIRED = "false";
    process.env.MATTERHORN_MODEL_USAGE_ENFORCEMENT = "off";
    const unsafeConfig = await jsonRequest(app.base, "/api/auth/config");
    expect(unsafeConfig.payload.signupStatus).toBe("setup_required");
    expect(unsafeConfig.payload.signupsAvailable).toBe(false);
    const unsafe = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "unsafe@example.com", password: PASSWORD },
    });
    expect(unsafe.response.status).toBe(503);
    expect(unsafe.payload.code).toBe("signup_security_configuration_invalid");

    const database = new Database(app.authDb, { readonly: true });
    expect(database.query("SELECT COUNT(*) AS count FROM users").get()).toEqual({ count: 0 });
    database.close();
  });

  test("requires a valid, single-use Turnstile token when signup protection is configured", async () => {
    const app = await boot();
    process.env.MATTERHORN_TURNSTILE_SITEKEY = "site-key";
    process.env.TURNSTILE_SECRET = "secret-key";
    process.env.TURNSTILE_HOSTNAMES = "matterhorn.example";
    const redeemed = new Set<string>();
    globalThis.fetch = (async (input, init) => {
      if (String(input) === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        const token = new URLSearchParams(String(init?.body)).get("response") ?? "";
        if (token === "valid-token" && !redeemed.has(token)) {
          redeemed.add(token);
          return Response.json({
            success: true,
            action: "signup",
            hostname: "matterhorn.example",
          });
        }
        return Response.json({
          success: false,
          "error-codes": ["timeout-or-duplicate"],
        });
      }
      return nativeFetch(input, init);
    }) as typeof fetch;

    const missing = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "missing-turnstile@example.com", password: PASSWORD },
    });
    expect(missing.response.status).toBe(403);
    expect(missing.payload.code).toBe("turnstile_verification_failed");

    const accepted = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "turnstile-accepted@example.com",
        password: PASSWORD,
        turnstileToken: "valid-token",
      },
    });
    expect(accepted.response.status).toBe(200);

    const replayed = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "turnstile-replayed@example.com",
        password: PASSWORD,
        turnstileToken: "valid-token",
      },
    });
    expect(replayed.response.status).toBe(403);
    expect(replayed.payload.code).toBe("turnstile_verification_failed");
  });

  test("pauses account creation and enforces the configured beta capacity", async () => {
    const app = await boot();
    process.env.MATTERHORN_SIGNUPS_ENABLED = "false";
    const paused = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "paused@example.com", password: PASSWORD },
    });
    expect(paused.response.status).toBe(503);
    expect(paused.payload.code).toBe("signups_paused");

    process.env.MATTERHORN_SIGNUPS_ENABLED = "true";
    process.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS = "not-a-number";
    const invalidCapacity = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "invalid-capacity@example.com", password: PASSWORD },
    });
    expect(invalidCapacity.response.status).toBe(503);
    expect(invalidCapacity.payload.code).toBe("signup_configuration_invalid");

    process.env.MATTERHORN_SIGNUP_MAX_ACCOUNTS = "1";
    const accepted = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "first@example.com", password: PASSWORD },
    });
    expect(accepted.response.status).toBe(200);
    const full = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "second@example.com", password: PASSWORD },
    });
    expect(full.response.status).toBe(503);
    expect(full.payload.code).toBe("signup_capacity_reached");
  });

  test("creates, restores, signs out, and signs back into an account", async () => {
    const first = await boot();
    const signup = await jsonRequest(first.base, "/api/auth/sign-up/email", {
      body: {
        email: "  NEW.USER@Example.com ",
        password: PASSWORD,
        name: "New User",
      },
      forwardedProto: "https",
    });

    expect(signup.response.status).toBe(200);
    expect(signup.payload.user.email).toBe("new.user@example.com");
    expect(signup.payload.user.name).toBe("New User");
    expect(signup.payload.organization.role).toBe("owner");
    const setCookie = signup.response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("mh_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).toContain("Secure");
    const cookie = sessionCookie(signup.response);

    const anonymousSession = await jsonRequest(
      first.base,
      "/api/den/v1/session",
    );
    expect(anonymousSession.response.status).toBe(200);
    expect(anonymousSession.payload).toEqual({ authenticated: false });

    const authenticatedSession = await jsonRequest(
      first.base,
      "/api/den/v1/session",
      { cookie },
    );
    expect(authenticatedSession.response.status).toBe(200);
    expect(authenticatedSession.payload.authenticated).toBe(true);
    expect(authenticatedSession.payload.user.email).toBe(
      "new.user@example.com",
    );
    expect(authenticatedSession.response.headers.get("cache-control")).toBe(
      "no-store",
    );

    const me = await jsonRequest(first.base, "/api/den/v1/me", { cookie });
    expect(me.response.status).toBe(200);
    expect(me.payload.user.email).toBe("new.user@example.com");
    expect(me.payload.activeOrgId).toBe(signup.payload.organization.id);

    await first.stop();
    const restarted = await boot(first.root);
    const restored = await jsonRequest(restarted.base, "/api/den/v1/me", {
      cookie,
    });
    expect(restored.response.status).toBe(200);
    expect(restored.payload.user.id).toBe(signup.payload.user.id);

    const signout = await jsonRequest(
      restarted.base,
      "/api/auth/sign-out",
      { body: {}, cookie },
    );
    expect(signout.response.status).toBe(200);
    expect(signout.response.headers.get("set-cookie") ?? "").toContain(
      "Max-Age=0",
    );
    const signedOut = await jsonRequest(restarted.base, "/api/den/v1/me", {
      cookie,
    });
    expect(signedOut.response.status).toBe(401);

    const signin = await jsonRequest(restarted.base, "/api/auth/sign-in/email", {
      body: { email: "new.user@example.com", password: PASSWORD },
    });
    expect(signin.response.status).toBe(200);
    const signedBackIn = await jsonRequest(
      restarted.base,
      "/api/den/v1/me",
      { cookie: sessionCookie(signin.response) },
    );
    expect(signedBackIn.response.status).toBe(200);
    expect(signedBackIn.payload.user.email).toBe("new.user@example.com");
  });

  test("manages sessions, rotates passwords, and deletes owned account data", async () => {
    const app = await boot();
    const email = "security-owner@example.com";
    const newPassword = "matterhorn-new-secure-password";
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email, password: PASSWORD, name: "Security Owner" },
    });
    const firstCookie = sessionCookie(signup.response);
    const secondSignIn = await jsonRequest(app.base, "/api/auth/sign-in/email", {
      body: { email, password: PASSWORD },
    });
    const secondCookie = sessionCookie(secondSignIn.response);

    const security = await jsonRequest(app.base, "/api/auth/account/security", {
      cookie: secondCookie,
    });
    expect(security.response.status).toBe(200);
    expect(security.payload.sessionCount).toBe(2);
    expect(security.payload.organizations).toHaveLength(1);
    expect(security.payload.sharedOrganizationsBlockingDeletion).toEqual([]);
    expect(security.response.headers.get("cache-control")).toBe("no-store");

    const revoked = await jsonRequest(
      app.base,
      "/api/auth/account/revoke-other-sessions",
      { cookie: secondCookie, body: {} },
    );
    expect(revoked.response.status).toBe(200);
    expect(revoked.payload.revokedSessions).toBe(1);
    expect((await jsonRequest(app.base, "/api/den/v1/me", { cookie: firstCookie })).response.status).toBe(401);
    expect((await jsonRequest(app.base, "/api/den/v1/me", { cookie: secondCookie })).response.status).toBe(200);

    const wrongCurrentPassword = await jsonRequest(
      app.base,
      "/api/auth/account/change-password",
      {
        cookie: secondCookie,
        body: { currentPassword: `${PASSWORD}-wrong`, newPassword },
      },
    );
    expect(wrongCurrentPassword.response.status).toBe(401);
    expect(wrongCurrentPassword.payload.code).toBe("invalid_credentials");

    const changed = await jsonRequest(
      app.base,
      "/api/auth/account/change-password",
      {
        cookie: secondCookie,
        body: { currentPassword: PASSWORD, newPassword },
      },
    );
    expect(changed.response.status).toBe(200);
    expect(changed.payload.signedOutEverywhere).toBe(true);
    expect(changed.response.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    expect((await jsonRequest(app.base, "/api/den/v1/me", { cookie: secondCookie })).response.status).toBe(401);

    const oldPassword = await jsonRequest(app.base, "/api/auth/sign-in/email", {
      body: { email, password: PASSWORD },
    });
    expect(oldPassword.response.status).toBe(401);
    const signedBackIn = await jsonRequest(app.base, "/api/auth/sign-in/email", {
      body: { email, password: newPassword },
    });
    expect(signedBackIn.response.status).toBe(200);
    const deletionCookie = sessionCookie(signedBackIn.response);

    const workspaces = await jsonRequest(app.base, "/workspaces", {
      cookie: deletionCookie,
    });
    expect(workspaces.response.status).toBe(200);
    const workspacePath = workspaces.payload.items[0].path as string;
    const workspaceId = workspaces.payload.items[0].id as string;
    expect(statSync(workspacePath).isDirectory()).toBe(true);
    const capturedMemory = await jsonRequest(app.base, "/api/memory/capture", {
      cookie: deletionCookie,
      body: {
        record: {
          id: "mem_account_deletion",
          kind: "user_preference",
          scope: "workspace",
          title: "Account deletion fixture",
          summary: "This private account memory must be permanently removed.",
          body: { responseStyle: "private-deletion-fixture" },
          tags: ["account-deletion"],
          links: [],
          provenance: {
            source: "user_confirmed",
            capturedAt: "2026-08-12T00:00:00.000Z",
            capturedBy: "user",
            confidence: 1,
            reasonRemembered: "Account deletion acceptance fixture.",
          },
          sensitivity: "private",
          createdAt: "2026-08-12T00:00:00.000Z",
          updatedAt: "2026-08-12T00:00:00.000Z",
          canUseInChat: true,
          canExport: false,
          canDelete: true,
        },
      },
    });
    expect(capturedMemory.response.status).toBe(200);
    expect(capturedMemory.payload.record.tags).toContain(`workspace:${workspaceId}`);

    const invalidConfirmation = await jsonRequest(app.base, "/api/auth/account", {
      method: "DELETE",
      cookie: deletionCookie,
      body: { password: newPassword, confirmationEmail: "wrong@example.com" },
    });
    expect(invalidConfirmation.response.status).toBe(400);
    expect(invalidConfirmation.payload.code).toBe("invalid_confirmation");

    const deleted = await jsonRequest(app.base, "/api/auth/account", {
      method: "DELETE",
      cookie: deletionCookie,
      body: { password: newPassword, confirmationEmail: email.toUpperCase() },
    });
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload.deletedOrganizationCount).toBe(1);
    expect(deleted.payload.workspaceDataDeletionComplete).toBe(true);
    expect(deleted.payload.workspaceDataDeletionFailures).toBe(0);
    expect(deleted.response.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    expect(() => statSync(workspacePath)).toThrow();
    const memoryIndex = readFileSync(
      join(app.root, "memory", "memory-index.json"),
      "utf8",
    );
    expect(memoryIndex).not.toContain("mem_account_deletion");
    expect(memoryIndex).not.toContain("private-deletion-fixture");
    expect((await jsonRequest(app.base, "/api/den/v1/me", { cookie: deletionCookie })).response.status).toBe(401);
    expect((await jsonRequest(app.base, "/api/auth/sign-in/email", {
      body: { email, password: newPassword },
    })).response.status).toBe(401);
  });

  test("blocks deletion while the account owns a workspace with other members", async () => {
    const app = await boot();
    const owner = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "shared-owner@example.com", password: PASSWORD },
    });
    const member = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "shared-member@example.com", password: PASSWORD },
    });
    const ownerCookie = sessionCookie(owner.response);
    const db = new Database(app.authDb);
    try {
      db.query(
        `INSERT INTO organization_members (organization_id, user_id, role, created_at)
          VALUES (?, ?, 'member', ?)`,
      ).run(owner.payload.organization.id, member.payload.user.id, Date.now());
    } finally {
      db.close();
    }

    const security = await jsonRequest(app.base, "/api/auth/account/security", {
      cookie: ownerCookie,
    });
    expect(security.response.status).toBe(200);
    expect(security.payload.sharedOrganizationsBlockingDeletion).toEqual([
      expect.objectContaining({
        id: owner.payload.organization.id,
        role: "owner",
      }),
    ]);

    const blocked = await jsonRequest(app.base, "/api/auth/account", {
      method: "DELETE",
      cookie: ownerCookie,
      body: {
        password: PASSWORD,
        confirmationEmail: "shared-owner@example.com",
      },
    });
    expect(blocked.response.status).toBe(409);
    expect(blocked.payload.code).toBe("account_owns_shared_organization");
    expect((await jsonRequest(app.base, "/api/den/v1/me", { cookie: ownerCookie })).response.status).toBe(200);
  });

  test("serves the default desktop policy only to signed-in accounts", async () => {
    const app = await boot();
    const anonymous = await jsonRequest(
      app.base,
      "/api/den/v1/me/desktop-config",
    );
    expect(anonymous.response.status).toBe(401);

    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "desktop-policy@example.com",
        password: PASSWORD,
        name: "Desktop Policy",
      },
    });
    expect(signup.response.status).toBe(200);

    const desktopConfig = await jsonRequest(
      app.base,
      "/api/den/v1/me/desktop-config",
      { cookie: sessionCookie(signup.response) },
    );
    expect(desktopConfig.response.status).toBe(200);
    expect(desktopConfig.payload).toEqual({});
  });

  test("authorizes protected browser routes with the first-party session cookie", async () => {
    const app = await boot();
    const anonymous = await jsonRequest(
      app.base,
      "/api/workflows/templates",
    );
    expect(anonymous.response.status).toBe(401);

    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "browser-session@example.com",
        password: PASSWORD,
        name: "Browser Session",
      },
    });
    expect(signup.response.status).toBe(200);

    const authenticated = await jsonRequest(
      app.base,
      "/api/workflows/templates",
      { cookie: sessionCookie(signup.response) },
    );
    expect(authenticated.response.status).toBe(200);
    expect(Array.isArray(authenticated.payload.customerTemplates)).toBe(true);
    expect(authenticated.payload.customerTemplates.length).toBeGreaterThan(0);
  });

  test("does not let hosted account sessions configure or enable custom MCP execution", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "hosted-mcp@example.com",
        password: PASSWORD,
        name: "Hosted MCP",
      },
    });
    const cookie = sessionCookie(signup.response);
    const workspaces = await jsonRequest(app.base, "/workspaces", { cookie });
    expect(workspaces.response.status).toBe(200);
    expect(workspaces.payload.items).toHaveLength(1);
    const workspaceId = workspaces.payload.items[0].id as string;
    const browserCapabilities = await jsonRequest(app.base, "/capabilities", { cookie });
    expect(browserCapabilities.payload).toMatchObject({
      skills: { write: false },
      plugins: { write: false },
      mcp: { write: false },
      commands: { read: false, write: false },
      config: { read: false, write: false },
    });

    for (const config of [
      { type: "local", command: ["node", "server.js"] },
      { type: "remote", url: "https://example.com/mcp" },
    ]) {
      const added = await jsonRequest(
        app.base,
        `/workspace/${workspaceId}/mcp`,
        {
          cookie,
          body: { name: "untrusted", config },
        },
      );
      expect(added.response.status).toBe(403);
      expect(added.payload.code).toBe("custom_mcp_desktop_only");
    }

    const enabled = await jsonRequest(
      app.base,
      `/workspace/${workspaceId}/mcp/untrusted/enabled`,
      { cookie, body: { enabled: true } },
    );
    expect(enabled.response.status).toBe(403);
    expect(enabled.payload.code).toBe("custom_mcp_desktop_only");

    const localEngineAdd = await jsonRequest(
      app.base,
      "/workspace/ws_auth/mcp",
      {
        bearer: TOKEN,
        body: {
          name: "trusted-desktop-local",
          config: { type: "local", command: ["node", "server.js"] },
        },
      },
    );
    expect(localEngineAdd.response.status).toBe(200);
    expect(localEngineAdd.payload.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "trusted-desktop-local" }),
      ]),
    );
  });

  test("restricts hosted browser accounts to the safe OpenCode session surface", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: {
        email: "hosted-opencode-boundary@example.com",
        password: PASSWORD,
        name: "Hosted Boundary",
      },
    });
    const cookie = sessionCookie(signup.response);
    const workspaces = await jsonRequest(app.base, "/workspaces", { cookie });
    const workspaceId = String(workspaces.payload.items[0].id);
    const sessionId = "ses_browser_boundary";

    const blockedRequests = [
      { path: `/workspace/${workspaceId}/opencode/session/${sessionId}/shell`, body: { command: "env" } },
      { path: `/workspace/${workspaceId}/opencode/session/${sessionId}/prompt_async`, body: { parts: [{ type: "text", text: "bypass" }] } },
      { path: `/workspace/${workspaceId}/opencode/session/${sessionId}/message`, body: { parts: [{ type: "text", text: "sync bypass" }] } },
      { path: `/w/${workspaceId}/opencode/session/${sessionId}/command`, body: { command: "compact", arguments: "" } },
      { path: `/opencode/session/${sessionId}/summarize`, body: { providerID: "test", modelID: "test" } },
      { path: `/workspace/${workspaceId}/opencode/session/${sessionId}/share`, body: {} },
      { path: `/workspace/${workspaceId}/opencode/permission/request-1/reply`, body: { reply: "once" } },
      { path: `/workspace/${workspaceId}/opencode-config`, method: "GET" as const },
      { path: `/workspace/${workspaceId}/commands`, method: "GET" as const },
      { path: `/workspace/${workspaceId}/plugins?includeGlobal=true`, method: "GET" as const },
      { path: `/workspace/${workspaceId}/skills?includeGlobal=true`, method: "GET" as const },
      { path: "/hub/skills", method: "GET" as const },
    ];

    for (const request of blockedRequests) {
      const result = await jsonRequest(app.base, request.path, {
        cookie,
        ...(request.body ? { body: request.body } : {}),
        ...(request.method ? { method: request.method } : {}),
      });
      expect(result.response.status).toBe(403);
      expect(result.payload).toEqual({
        code: "hosted_operation_not_allowed",
        message: "This operation is not available in Matterhorn web workspaces.",
      });
      expect(JSON.stringify(result.payload)).not.toContain(app.root);
    }

    const allowedRead = await jsonRequest(
      app.base,
      `/workspace/${workspaceId}/opencode/session/${sessionId}`,
      { cookie },
    );
    expect(allowedRead.response.status).toBe(400);
    expect(allowedRead.payload.code).toBe("opencode_unconfigured");

    const operatorShell = await jsonRequest(
      app.base,
      `/workspace/ws_auth/opencode/session/${sessionId}/shell`,
      { bearer: TOKEN, body: { command: "echo operator" } },
    );
    expect(operatorShell.response.status).toBe(400);
    expect(operatorShell.payload.code).toBe("opencode_unconfigured");

    process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED = "1";
    process.env.MATTERHORN_AGENT_RUNTIME_SECRET = "trusted-runtime-secret-for-auth-route-tests";
    const blockedRawAccountPrompt = await jsonRequest(
      app.base,
      `/workspace/ws_auth/opencode/session/${sessionId}/prompt_async`,
      { bearer: TOKEN, body: { parts: [{ type: "text", text: "raw account prompt" }] } },
    );
    expect(blockedRawAccountPrompt.response.status).toBe(403);
    expect(blockedRawAccountPrompt.payload.code).toBe("hosted_operation_not_allowed");

    const blockedRawSynchronousPrompt = await jsonRequest(
      app.base,
      `/workspace/ws_auth/opencode/session/${sessionId}/message`,
      { bearer: TOKEN, body: { parts: [{ type: "text", text: "raw synchronous account prompt" }] } },
    );
    expect(blockedRawSynchronousPrompt.response.status).toBe(403);
    expect(blockedRawSynchronousPrompt.payload.code).toBe("hosted_operation_not_allowed");

    const trustedRuntimePrompt = await fetch(
      `${app.base}/workspace/ws_auth/opencode/session/${sessionId}/prompt_async`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          "x-matterhorn-agent-runtime-secret": process.env.MATTERHORN_AGENT_RUNTIME_SECRET!,
        },
        body: JSON.stringify({ parts: [{ type: "text", text: "trusted runtime prompt" }] }),
      },
    );
    expect(trustedRuntimePrompt.status).toBe(400);
    await expect(trustedRuntimePrompt.json()).resolves.toMatchObject({ code: "opencode_unconfigured" });
  });

  test("reports the restricted hosted browser policy in readiness", async () => {
    const app = await boot();
    const readiness = await jsonRequest(app.base, "/health/ready");
    expect(readiness.response.status).toBe(200);
    expect(readiness.payload.checks.hostedBrowserOpencodePolicy).toBe("restricted");
    expect(readiness.payload.checks.hostedBrowserOpencodePolicyReady).toBe(true);
    expect(readiness.payload.checks.accountMessageGatewayReady).toBe(true);
  });

  test("fails hosted Public Beta readiness when the authoritative message gateway is disabled", async () => {
    process.env.MATTERHORN_HOSTED_PUBLIC_BETA = "1";
    process.env.MATTERHORN_ACCOUNT_MESSAGE_GATEWAY_REQUIRED = "0";
    const app = await boot();
    const readiness = await jsonRequest(app.base, "/health/ready");
    expect(readiness.response.status).toBe(503);
    expect(readiness.payload.checks.accountMessageGatewayReady).toBe(false);
  });

  test("rejects invalid, duplicate, and incorrect credentials safely", async () => {
    const app = await boot();
    const invalidEmail = await jsonRequest(
      app.base,
      "/api/auth/sign-up/email",
      { body: { email: "not-an-email", password: PASSWORD } },
    );
    expect(invalidEmail.response.status).toBe(400);
    expect(invalidEmail.payload.code).toBe("invalid_email");

    const shortPassword = await jsonRequest(
      app.base,
      "/api/auth/sign-up/email",
      { body: { email: "short@example.com", password: "too-short" } },
    );
    expect(shortPassword.response.status).toBe(400);
    expect(shortPassword.payload.code).toBe("invalid_password");

    const created = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "owner@example.com", password: PASSWORD },
    });
    expect(created.response.status).toBe(200);

    const duplicate = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "OWNER@example.com", password: PASSWORD },
    });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.payload.code).toBe("email_taken");

    const wrongPassword = await jsonRequest(
      app.base,
      "/api/auth/sign-in/email",
      { body: { email: "owner@example.com", password: `${PASSWORD}-wrong` } },
    );
    const unknownEmail = await jsonRequest(
      app.base,
      "/api/auth/sign-in/email",
      { body: { email: "unknown@example.com", password: PASSWORD } },
    );
    expect(wrongPassword.response.status).toBe(401);
    expect(unknownEmail.response.status).toBe(401);
    expect(wrongPassword.payload.message).toBe(unknownEmail.payload.message);
  });

  test("keeps organizations isolated between separate accounts", async () => {
    const app = await boot();
    const userA = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "user-a@example.com", password: PASSWORD },
    });
    const userB = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "user-b@example.com", password: PASSWORD },
    });
    const cookieA = sessionCookie(userA.response);
    const cookieB = sessionCookie(userB.response);

    const orgsA = await jsonRequest(app.base, "/api/den/v1/me/orgs", {
      cookie: cookieA,
    });
    const orgsB = await jsonRequest(app.base, "/api/den/v1/me/orgs", {
      cookie: cookieB,
    });
    expect(orgsA.payload.orgs).toHaveLength(1);
    expect(orgsB.payload.orgs).toHaveLength(1);
    expect(orgsA.payload.orgs[0].id).not.toBe(orgsB.payload.orgs[0].id);

    const crossAccountSwitch = await jsonRequest(
      app.base,
      "/api/den/v1/me/active-organization",
      {
        body: { organizationId: orgsB.payload.orgs[0].id },
        cookie: cookieA,
      },
    );
    expect(crossAccountSwitch.response.status).toBe(400);
    expect(crossAccountSwitch.payload.code).toBe("invalid_organization");

    const createdOrg = await jsonRequest(
      app.base,
      "/api/auth/organization/create",
      {
        body: { name: "User A Team", slug: "user-a-team" },
        cookie: cookieA,
      },
    );
    expect(createdOrg.response.status).toBe(200);
    expect(createdOrg.payload.organization.role).toBe("owner");

    const updatedA = await jsonRequest(app.base, "/api/den/v1/me", {
      cookie: cookieA,
    });
    expect(updatedA.payload.activeOrgSlug).toBe("user-a-team");
    const unchangedB = await jsonRequest(app.base, "/api/den/v1/me", {
      cookie: cookieB,
    });
    expect(unchangedB.payload.activeOrgId).toBe(orgsB.payload.orgs[0].id);
  });

  test("gives each signed-in organization one durable isolated workspace", async () => {
    const app = await boot();
    const userA = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "workspace-a@example.com", password: PASSWORD },
    });
    const userB = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "workspace-b@example.com", password: PASSWORD },
    });
    const cookieA = sessionCookie(userA.response);
    const cookieB = sessionCookie(userB.response);

    const workspacesA = await jsonRequest(app.base, "/workspaces", {
      cookie: cookieA,
    });
    const workspacesB = await jsonRequest(app.base, "/workspaces", {
      cookie: cookieB,
    });
    expect(workspacesA.response.status).toBe(200);
    expect(workspacesB.response.status).toBe(200);
    expect(workspacesA.payload.items).toHaveLength(1);
    expect(workspacesB.payload.items).toHaveLength(1);
    const workspaceA = workspacesA.payload.items[0];
    const workspaceB = workspacesB.payload.items[0];
    expect(workspaceA.id).toMatch(/^ws_web_[a-f0-9]{16}$/);
    expect(workspaceB.id).toMatch(/^ws_web_[a-f0-9]{16}$/);
    expect(workspaceA.id).not.toBe(workspaceB.id);
    expect(workspaceA.path).not.toBe(workspaceB.path);
    expect(workspacesA.payload.activeId).toBe(workspaceA.id);
    expect(workspacesB.payload.activeId).toBe(workspaceB.id);

    const ownWorkspace = await jsonRequest(
      app.base,
      `/workspace/${workspaceA.id}/config`,
      { cookie: cookieA },
    );
    expect(ownWorkspace.response.status).toBe(200);
    const crossWorkspace = await jsonRequest(
      app.base,
      `/workspace/${workspaceB.id}/config`,
      { cookie: cookieA },
    );
    expect(crossWorkspace.response.status).toBe(404);
    expect(crossWorkspace.payload.code).toBe("workspace_not_found");

    const ownSecurityReceipts = await jsonRequest(
      app.base,
      `/workspace/${workspaceA.id}/agent-run-receipts`,
      { cookie: cookieA },
    );
    expect(ownSecurityReceipts.response.status).toBe(200);
    expect(ownSecurityReceipts.payload).toMatchObject({
      items: [],
      retention: { windowDays: 365, purgeSupported: true },
    });
    for (const request of [
      jsonRequest(app.base, `/workspace/${workspaceB.id}/agent-run-receipts`, { cookie: cookieA }),
      jsonRequest(app.base, `/workspace/${workspaceB.id}/sessions/ses_private/messages/preflight`, {
        cookie: cookieA,
        body: {
          parts: [{ type: "text", text: "public research" }],
          model: { providerId: "cudos", modelId: "asi1-mini" },
        },
      }),
      jsonRequest(app.base, `/workspace/${workspaceB.id}/privacy-consents/privacy_challenge_guessed/confirm`, {
        cookie: cookieA,
        body: { sessionId: "ses_private", requestHash: "guessed" },
      }),
      jsonRequest(app.base, `/workspace/${workspaceB.id}/reviewed-actions/validate`, {
        cookie: cookieA,
        body: { handoff: {}, currentDraft: {} },
      }),
      jsonRequest(app.base, `/workspace/${workspaceB.id}/bittensor/wallet/timeline/status`, {
        cookie: cookieA,
      }),
      jsonRequest(app.base, `/workspace/${workspaceB.id}/bittensor/wallet/timeline/export`, {
        cookie: cookieA,
      }),
    ]) {
      const isolated = await request;
      expect(isolated.response.status).toBe(404);
      expect(isolated.payload.code).toBe("workspace_not_found");
    }

    const ownWalletTimeline = await jsonRequest(
      app.base,
      `/workspace/${workspaceA.id}/bittensor/wallet/timeline/export`,
      { cookie: cookieA },
    );
    expect(ownWalletTimeline.response.status).toBe(200);
    expect(ownWalletTimeline.payload.timeline).toMatchObject({
      snapshots: [],
      status: { path: null },
    });
    const legacyGlobalTimeline = await jsonRequest(
      app.base,
      "/api/bittensor/wallet/timeline/export",
      { cookie: cookieA },
    );
    expect(legacyGlobalTimeline.response.status).toBe(403);
    expect(legacyGlobalTimeline.payload.code).toBe("hosted_operation_not_allowed");

    const now = "2026-07-29T00:00:00.000Z";
    const capturedMemory = await jsonRequest(app.base, "/api/memory/capture", {
      cookie: cookieA,
      body: {
        record: {
          id: "mem_account_isolation",
          kind: "user_preference",
          scope: "workspace",
          title: "Private account preference",
          summary: "Visible only inside user A's organization workspace.",
          body: { responseStyle: "concise" },
          tags: ["account-isolation"],
          links: [],
          provenance: {
            source: "user_confirmed",
            capturedAt: now,
            capturedBy: "user",
            confidence: 1,
            reasonRemembered: "Explicit isolation acceptance fixture.",
          },
          sensitivity: "private",
          createdAt: now,
          updatedAt: now,
          canUseInChat: true,
          canExport: false,
          canDelete: true,
        },
      },
    });
    expect(capturedMemory.response.status).toBe(200);
    expect(capturedMemory.payload.record.id).toBe("mem_account_isolation");
    expect(capturedMemory.payload.record.tags).toContain(
      `workspace:${workspaceA.id}`,
    );

    const memoryA = await jsonRequest(
      app.base,
      "/api/memory/search?tags=account-isolation",
      { cookie: cookieA },
    );
    const memoryB = await jsonRequest(
      app.base,
      "/api/memory/search?tags=account-isolation",
      { cookie: cookieB },
    );
    expect(memoryA.response.status).toBe(200);
    expect(memoryA.payload.count).toBe(1);
    expect(memoryB.response.status).toBe(200);
    expect(memoryB.payload.count).toBe(0);

    const guessedMemory = await jsonRequest(
      app.base,
      "/api/memory/entities/mem_account_isolation",
      { cookie: cookieB },
    );
    expect(guessedMemory.response.status).toBe(404);
    expect(guessedMemory.payload.code).toBe("memory_not_found");

    const bittensorWatch = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      {
        cookie: cookieA,
        body: {
          kind: "subnet",
          label: "User A private subnet watch",
          netuid: 14,
        },
      },
    );
    expect(bittensorWatch.response.status).toBe(200);
    const bittensorWatchesA = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      { cookie: cookieA },
    );
    const bittensorWatchesB = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      { cookie: cookieB },
    );
    expect(bittensorWatchesA.payload.watches).toHaveLength(1);
    expect(bittensorWatchesB.payload.watches).toHaveLength(0);

    const bittensorChatWatch = await jsonRequest(
      app.base,
      "/api/bittensor/chat/execute",
      {
        cookie: cookieA,
        body: { message: "monitor subnet 14 emissions" },
      },
    );
    expect(bittensorChatWatch.response.status).toBe(200);
    expect(bittensorChatWatch.payload.execution).toBe("answered");
    expect(bittensorChatWatch.payload.data.watch.ownerScope).toBeUndefined();
    expect(bittensorChatWatch.payload.context.id).toMatch(/^bt-chat-/);

    const chatWatchesA = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      { cookie: cookieA },
    );
    const chatWatchesB = await jsonRequest(
      app.base,
      "/api/bittensor/monitoring/watchlist",
      { cookie: cookieB },
    );
    expect(chatWatchesA.payload.watches).toHaveLength(2);
    expect(chatWatchesB.payload.watches).toHaveLength(0);

    const ownBittensorContext = await jsonRequest(
      app.base,
      `/api/bittensor/chat/context/${bittensorChatWatch.payload.context.id}`,
      { cookie: cookieA },
    );
    const guessedBittensorContext = await jsonRequest(
      app.base,
      `/api/bittensor/chat/context/${bittensorChatWatch.payload.context.id}`,
      { cookie: cookieB },
    );
    expect(ownBittensorContext.response.status).toBe(200);
    expect(guessedBittensorContext.response.status).toBe(404);
    expect(guessedBittensorContext.payload.code).toBe("context_not_found");

    const hyperliquidWatch = await jsonRequest(
      app.base,
      "/api/hyperliquid/watches",
      {
        cookie: cookieA,
        body: {
          asset: "BTC",
          kind: "funding_rate",
          threshold: 0.01,
          direction: "above",
        },
      },
    );
    expect(hyperliquidWatch.response.status).toBe(200);
    const hyperliquidWatchesA = await jsonRequest(
      app.base,
      "/api/hyperliquid/watches",
      { cookie: cookieA },
    );
    const hyperliquidWatchesB = await jsonRequest(
      app.base,
      "/api/hyperliquid/watches",
      { cookie: cookieB },
    );
    expect(hyperliquidWatchesA.payload.watches).toHaveLength(1);
    expect(hyperliquidWatchesB.payload.watches).toHaveLength(0);

    const desktopWorkspaces = await jsonRequest(app.base, "/workspaces", {
      bearer: TOKEN,
    });
    expect(desktopWorkspaces.response.status).toBe(200);
    expect(
      desktopWorkspaces.payload.items.some(
        (workspace: { id: string }) => workspace.id === "ws_auth",
      ),
    ).toBe(true);

    await app.stop();
    const restarted = await boot(app.root);
    const restored = await jsonRequest(restarted.base, "/workspaces", {
      cookie: cookieA,
    });
    expect(restored.response.status).toBe(200);
    expect(restored.payload.items).toHaveLength(1);
    expect(restored.payload.items[0].id).toBe(workspaceA.id);
    expect(restored.payload.items[0].path).toBe(workspaceA.path);
  });

  test("stores password derivatives and token hashes instead of raw secrets", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "secure@example.com", password: PASSWORD },
    });
    const cookie = sessionCookie(signup.response);
    const rawToken = cookieToken(cookie);
    const dbBytes = readFileSync(app.authDb);
    const dbText = dbBytes.toString("latin1");
    expect(dbText.includes(PASSWORD)).toBe(false);
    expect(dbText.includes(rawToken)).toBe(false);
    expect(statSync(app.authDb).mode & 0o777).toBe(0o600);

    const db = new Database(app.authDb, { readonly: true });
    try {
      const user = db.query(
        "SELECT password_hash, password_salt FROM users WHERE email = ?",
      ).get("secure@example.com") as {
        password_hash: string;
        password_salt: string;
      };
      const session = db.query(
        "SELECT token_hash FROM sessions WHERE user_id = ?",
      ).get(signup.payload.user.id) as { token_hash: string };
      expect(user.password_hash).toMatch(
        /^scrypt-v2\$32768\$8\$3\$[a-f0-9]{128}$/,
      );
      expect(user.password_salt).toMatch(/^[a-f0-9]{32}$/);
      expect(session.token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(session.token_hash).not.toBe(rawToken);
    } finally {
      db.close();
    }
  });

  test("rate limits repeated credential attacks without blocking a later valid sign-in", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "limited@example.com", password: PASSWORD },
    });
    expect(signup.response.status).toBe(200);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const rejected = await jsonRequest(
        app.base,
        "/api/auth/sign-in/email",
        {
          body: {
            email: "limited@example.com",
            password: `${PASSWORD}-wrong`,
          },
        },
      );
      expect(rejected.response.status).toBe(401);
    }

    const limited = await jsonRequest(
      app.base,
      "/api/auth/sign-in/email",
      {
        body: { email: "limited@example.com", password: PASSWORD },
      },
    );
    expect(limited.response.status).toBe(429);
    expect(limited.payload.code).toBe("rate_limited");

    const unaffected = await jsonRequest(
      app.base,
      "/api/auth/sign-in/email",
      {
        body: { email: "other@example.com", password: PASSWORD },
      },
    );
    expect(unaffected.response.status).toBe(401);
  });

  test("does not let a successful account clear the source-IP credential budget", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "limiter-reset@example.com", password: PASSWORD },
    });
    expect(signup.response.status).toBe(200);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (let attempt = 0; attempt < 9; attempt += 1) {
        const rejected = await jsonRequest(
          app.base,
          "/api/auth/sign-in/email",
          {
            body: {
              email: `invalid-${cycle}-${attempt}`,
              password: `${PASSWORD}-wrong`,
            },
          },
        );
        expect(rejected.response.status).toBe(400);
      }
      const valid = await jsonRequest(app.base, "/api/auth/sign-in/email", {
        body: { email: "limiter-reset@example.com", password: PASSWORD },
      });
      expect(valid.response.status).toBe(200);
    }

    const limited = await jsonRequest(app.base, "/api/auth/sign-in/email", {
      body: { email: "final-invalid", password: `${PASSWORD}-wrong` },
    });
    expect(limited.response.status).toBe(429);
    expect(limited.payload.code).toBe("rate_limited");
  });

  test("accepts bearer sessions and enforces configured browser origins", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "bearer@example.com", password: PASSWORD },
    });
    const token = cookieToken(sessionCookie(signup.response));
    const me = await jsonRequest(app.base, "/api/den/v1/me", {
      bearer: token,
    });
    expect(me.response.status).toBe(200);
    expect(me.payload.user.email).toBe("bearer@example.com");

    const allowed = await jsonRequest(app.base, "/api/den/v1/me", {
      cookie: sessionCookie(signup.response),
      origin: "http://127.0.0.1:5173",
    });
    expect(allowed.response.headers.get("access-control-allow-origin")).toBe(
      "http://127.0.0.1:5173",
    );
    expect(allowed.response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );

    const disallowed = await jsonRequest(app.base, "/api/den/v1/me", {
      cookie: sessionCookie(signup.response),
      origin: "https://attacker.example",
    });
    expect(
      disallowed.response.headers.get("access-control-allow-origin"),
    ).toBeNull();
  });

  test("blocks cross-origin browser mutations without blocking allowed origins", async () => {
    const app = await boot();
    const signup = await jsonRequest(app.base, "/api/auth/sign-up/email", {
      body: { email: "origin-guard@example.com", password: PASSWORD },
      origin: "http://127.0.0.1:5173",
    });
    expect(signup.response.status).toBe(200);
    const cookie = sessionCookie(signup.response);

    const blocked = await jsonRequest(app.base, "/api/auth/organization/create", {
      cookie,
      origin: "https://attacker.example",
      body: { name: "Attacker workspace", slug: "attacker-workspace" },
    });
    expect(blocked.response.status).toBe(403);
    expect(blocked.payload.code).toBe("untrusted_origin");

    const allowed = await jsonRequest(app.base, "/api/auth/organization/create", {
      cookie,
      origin: "http://127.0.0.1:5173",
      body: { name: "Allowed workspace", slug: "allowed-workspace" },
    });
    expect(allowed.response.status).toBe(200);
    expect(allowed.payload.organization.slug).toBe("allowed-workspace");
  });

  test("emits HSTS only for HTTPS requests", async () => {
    const app = await boot();
    const plain = await jsonRequest(app.base, "/health");
    expect(plain.response.headers.get("strict-transport-security")).toBeNull();

    const proxiedHttps = await jsonRequest(app.base, "/health", {
      forwardedProto: "https",
    });
    expect(proxiedHttps.response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });
});
