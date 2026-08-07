import { mkdtempSync, rmSync } from "node:fs";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { MatterhornGeneratedImage } from "@matterhorn-work/types/generated-media";
import { buildMatterhornBillingSubscription } from "./billing.js";
import { MatterhornBillingAccountStore } from "./billing-account-store.js";
import { MatterhornGeneratedImageStore } from "./generated-image-store.js";
import { MatterhornImageNftDraftStore } from "./image-nft-draft-store.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

const TOKEN = "test-token";
const HOST_TOKEN = "test-host-token";
const WORKSPACE_ID = "ws_billing";
const STRIPE_PERIOD_START_SECONDS = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
const STRIPE_PERIOD_END_SECONDS = STRIPE_PERIOD_START_SECONDS + 30 * 24 * 60 * 60;
const STRIPE_NEWER_EVENT_SECONDS = STRIPE_PERIOD_START_SECONDS + 1000;

function stripePeriodIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

let priorEnv: Record<string, string | undefined> = {};
const stops: Array<() => Promise<void> | void> = [];
const dirs: string[] = [];
const stripeServers: Array<ReturnType<typeof Bun.serve>> = [];

function baseConfig(port: number, root: string, readOnly = false): ServerConfig {
  return {
    host: "127.0.0.1",
    port,
    token: TOKEN,
    hostToken: HOST_TOKEN,
    approval: { mode: "auto", timeoutMs: 5000 },
    corsOrigins: [],
    workspaces: [
      {
        id: WORKSPACE_ID,
        name: "Billing Test Workspace",
        path: root,
        preset: "starter",
        workspaceType: "local",
      },
    ],
    authorizedRoots: [root],
    readOnly,
    startedAt: Date.now(),
    tokenSource: "generated",
    hostTokenSource: "generated",
    logFormat: "json",
    logRequests: false,
  };
}

function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const port = (server.port as number) ?? 0;
    server.stop();
    resolve(port);
  });
}

async function boot(options: { readOnly?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-billing-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  const port = await getFreePort();
  const server = await startServer(baseConfig(port, dir, options.readOnly ?? false));
  stops.push(() => (server.stop as (closeActiveConnections?: boolean) => void | Promise<void>)(true));
  return { base: `http://127.0.0.1:${port}`, dir };
}

async function startFakeStripe(options: { checkoutExpiresAtSeconds?: number } = {}) {
  const calls: Array<{
    path: string;
    authorization: string | null;
    params: Record<string, string>;
  }> = [];
  const port = await getFreePort();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      const url = new URL(request.url);
      const body = await request.text();
      const params = Object.fromEntries(new URLSearchParams(body).entries());
      calls.push({
        path: url.pathname,
        authorization: request.headers.get("authorization"),
        params,
      });
      if (url.pathname === "/v1/checkout/sessions") {
        return Response.json({
          id: "cs_test_matterhorn",
          object: "checkout.session",
          livemode: false,
          url: "https://checkout.stripe.com/c/pay/cs_test_matterhorn",
          expires_at: options.checkoutExpiresAtSeconds ?? Math.floor(Date.now() / 1000) + 1800,
        });
      }
      if (url.pathname === "/v1/billing_portal/sessions") {
        return Response.json({
          id: "bps_test_matterhorn",
          object: "billing_portal.session",
          livemode: false,
          url: "https://billing.stripe.com/p/session/test_matterhorn",
        });
      }
      return Response.json({ error: { message: "Unexpected fake Stripe path" } }, { status: 404 });
    },
  });
  stripeServers.push(server);
  return { baseUrl: `http://127.0.0.1:${port}`, calls };
}

function stripeSignatureHeader(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function currentPeriodIso(): string {
  return new Date().toISOString();
}

function previousPeriodIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0)).toISOString();
}

async function jsonFetch(base: string, path: string, init?: RequestInit, token?: string) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token ?? TOKEN}`,
      "Content-Type": "application/json",
      Connection: "close",
      ...init?.headers,
    },
  });
  return { response, payload: await response.json().catch(() => ({})) };
}

async function hostJsonFetch(base: string, path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "X-OpenWork-Host-Token": HOST_TOKEN,
      "Content-Type": "application/json",
      Connection: "close",
      ...init?.headers,
    },
  });
  return { response, payload: await response.json().catch(() => ({})) };
}

async function linkStripeTestSubscription(base: string, input: {
  webhookSecret: string;
  planId: "plus" | "max";
  providerCheckoutSessionId?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
}) {
  const checkout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
    method: "POST",
    body: JSON.stringify({ planId: input.planId, interval: "month" }),
  });
  expect(checkout.response.status).toBe(200);
  const providerCheckoutSessionId = input.providerCheckoutSessionId ?? checkout.payload.providerSessionId ?? "cs_test_matterhorn";
  const providerCustomerId = input.providerCustomerId ?? "cus_test_workspace";
  const providerSubscriptionId = input.providerSubscriptionId ?? "sub_test_workspace";
  const rawBody = JSON.stringify({
    id: `evt_checkout_completed_${providerSubscriptionId}`,
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: providerCheckoutSessionId,
        object: "checkout.session",
        customer: providerCustomerId,
        subscription: providerSubscriptionId,
        payment_status: "paid",
        metadata: {
          workspace_id: WORKSPACE_ID,
          plan_id: input.planId,
        },
      },
    },
  });
  const webhook = await jsonFetch(
    base,
    "/api/billing/webhook/stripe",
    {
      method: "POST",
      body: rawBody,
      headers: { "stripe-signature": stripeSignatureHeader(input.webhookSecret, rawBody) },
    },
    undefined,
  );
  expect(webhook.response.status).toBe(200);
  expect(webhook.payload).toMatchObject({
    verified: true,
    handled: true,
    workspaceSynced: true,
    workspaceId: WORKSPACE_ID,
    planId: input.planId,
    providerCustomerId,
    providerSubscriptionId,
  });
  return { providerCheckoutSessionId, providerCustomerId, providerSubscriptionId };
}

beforeEach(() => {
  priorEnv = {
    MATTERHORN_BILLING_MODE: process.env.MATTERHORN_BILLING_MODE,
    MATTERHORN_BILLING_PROVIDER: process.env.MATTERHORN_BILLING_PROVIDER,
    MATTERHORN_BILLING_CURRENT_PLAN: process.env.MATTERHORN_BILLING_CURRENT_PLAN,
    MATTERHORN_STRIPE_WEBHOOK_SECRET: process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET,
    MATTERHORN_STRIPE_SECRET_KEY: process.env.MATTERHORN_STRIPE_SECRET_KEY,
    MATTERHORN_STRIPE_PRICE_ID_PLUS: process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS,
    MATTERHORN_STRIPE_PRICE_ID_MAX: process.env.MATTERHORN_STRIPE_PRICE_ID_MAX,
    MATTERHORN_STRIPE_TEST_CUSTOMER_ID: process.env.MATTERHORN_STRIPE_TEST_CUSTOMER_ID,
    MATTERHORN_STRIPE_API_BASE_URL: process.env.MATTERHORN_STRIPE_API_BASE_URL,
    OPENWORK_DATA_DIR: process.env.OPENWORK_DATA_DIR,
    OPENWORK_TOKEN_STORE: process.env.OPENWORK_TOKEN_STORE,
  };
  delete process.env.MATTERHORN_BILLING_MODE;
  delete process.env.MATTERHORN_BILLING_PROVIDER;
  delete process.env.MATTERHORN_BILLING_CURRENT_PLAN;
  delete process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET;
  delete process.env.MATTERHORN_STRIPE_SECRET_KEY;
  delete process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS;
  delete process.env.MATTERHORN_STRIPE_PRICE_ID_MAX;
  delete process.env.MATTERHORN_STRIPE_TEST_CUSTOMER_ID;
  delete process.env.MATTERHORN_STRIPE_API_BASE_URL;
  delete process.env.OPENWORK_DATA_DIR;
  delete process.env.OPENWORK_TOKEN_STORE;
});

function testImage(workspaceId: string, id: string, createdAt: string): MatterhornGeneratedImage {
  return {
    id,
    workspaceId,
    outputId: `out_${id}`,
    provider: "mock",
    model: "mock-image",
    prompt: `test image ${id}`,
    size: "1024x1024",
    quality: "auto",
    format: "png",
    fileName: `${id}.png`,
    relativePath: `.matterhorn-work/outputs/images/${id}.png`,
    contentType: "image/png",
    byteLength: 12,
    sha256: "0".repeat(64),
    createdAt,
    status: "generated",
    safety: { secretsRejected: false },
  };
}

afterEach(async () => {
  for (const stop of stops.reverse()) await stop();
  stops.length = 0;
  for (const server of stripeServers.reverse()) server.stop(true);
  stripeServers.length = 0;
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
  for (const [key, value] of Object.entries(priorEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("Billing routes", () => {
  test("GET /api/billing/plans returns three plans with live payments disabled", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/plans");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.plans.length).toBe(3);
    expect(result.payload.plans.map((p: { id: string }) => p.id)).toEqual(["free", "plus", "max"]);
    expect(result.payload.isLivePaymentsEnabled).toBe(false);
    expect(result.payload.mode).toBe("phase0_mock");
  });

  test("GET /api/billing/status returns mock status", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/status");
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.status.subscription.planId).toBe("free");
    expect(result.payload.status.isLivePaymentsEnabled).toBe(false);
    expect(result.payload.status.accountLinkage).toMatchObject({
      source: "env_default",
      label: "Default local plan",
      status: "preview",
      hasProviderCustomer: false,
      hasProviderSubscription: false,
      pendingCheckout: false,
    });
    expect(result.payload.status.setup).toMatchObject({
      mode: "phase0_mock",
      provider: "mock",
      readyForTestCheckout: false,
      readyForWebhooks: false,
      livePaymentsEnabled: false,
    });
    expect(result.payload.status.setup.checks.map((check: { id: string }) => check.id)).toContain("mock_mode");
  });

  test("GET /api/billing/status reports sanitized Stripe test setup readiness", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_should_not_leak";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_should_not_leak";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_should_not_leak";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_should_not_leak";

    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/status");

    expect(result.response.status).toBe(200);
    expect(result.payload.status.setup).toMatchObject({
      mode: "phase1_stripe_test",
      provider: "stripe",
      readyForTestCheckout: true,
      readyForWebhooks: true,
      livePaymentsEnabled: false,
    });
    expect(result.payload.status.setup.checks).toContainEqual(expect.objectContaining({
      id: "stripe_secret_key",
      status: "working",
    }));
    expect(result.payload.status.setup.checks).toContainEqual(expect.objectContaining({
      id: "stripe_test_customer",
      status: "needs_setup",
    }));
    expect(JSON.stringify(result.payload)).not.toContain("sk_test_should_not_leak");
    expect(JSON.stringify(result.payload)).not.toContain("whsec_should_not_leak");
    expect(JSON.stringify(result.payload)).not.toContain("price_plus_should_not_leak");
  });

  test("GET /api/billing/status reports live mode as blocked without leaking Stripe values", async () => {
    process.env.MATTERHORN_BILLING_MODE = "live";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_live_should_not_leak";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_live_should_not_leak";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_live_plus_should_not_leak";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_live_max_should_not_leak";
    process.env.MATTERHORN_STRIPE_TEST_CUSTOMER_ID = "cus_live_should_not_leak";

    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/status");

    expect(result.response.status).toBe(200);
    expect(result.payload.status).toMatchObject({
      mode: "live",
      provider: "stripe",
      isLivePaymentsEnabled: false,
      setup: {
        mode: "live",
        provider: "stripe",
        readyForTestCheckout: false,
        readyForWebhooks: false,
        livePaymentsEnabled: false,
      },
    });
    expect(result.payload.status.setup.checks).toContainEqual(expect.objectContaining({
      id: "live_mode_blocked",
      status: "needs_setup",
    }));
    expect(result.payload.status.setup.checks).toContainEqual(expect.objectContaining({
      id: "stripe_live_key_rejected",
      status: "error",
    }));
    expect(result.payload.status.setup.checks).toContainEqual(expect.objectContaining({
      id: "billing_integrity_review_required",
      status: "needs_setup",
    }));
    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain("sk_live_should_not_leak");
    expect(serialized).not.toContain("whsec_live_should_not_leak");
    expect(serialized).not.toContain("price_live_plus_should_not_leak");
    expect(serialized).not.toContain("price_live_max_should_not_leak");
    expect(serialized).not.toContain("cus_live_should_not_leak");
  });

  test("POST /api/billing/checkout requires a workspace id for subscription reconciliation", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "plus" }),
    });
    expect(result.response.status).toBe(400);
    expect(result.payload.code).toBe("workspace_required");
    expect(result.payload.message).toContain("must be started from a workspace");
  });

  test("POST /api/billing/checkout creates a workspace-bound Stripe test Checkout session when configured", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_fake_checkout";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_test";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_test";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({
        planId: "plus",
        workspaceId: WORKSPACE_ID,
        successUrl: "https://matterhorn.work/billing/complete",
        cancelUrl: "https://matterhorn.work/billing/cancel",
      }),
    });

    expect(result.response.status).toBe(200);
    expect(result.payload).toMatchObject({
      success: true,
      mode: "stripe_test",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_matterhorn",
      providerSessionId: "cs_test_matterhorn",
    });
    expect(stripe.calls.length).toBe(1);
    expect(stripe.calls[0]).toMatchObject({
      path: "/v1/checkout/sessions",
      authorization: "Bearer sk_test_fake_checkout",
    });
    expect(stripe.calls[0].params).toMatchObject({
      mode: "subscription",
      "line_items[0][price]": "price_plus_test",
      "line_items[0][quantity]": "1",
      success_url: "https://matterhorn.work/billing/complete",
      cancel_url: "https://matterhorn.work/billing/cancel",
      client_reference_id: `matterhorn_${WORKSPACE_ID}_plus`,
      "metadata[product]": "matterhorn-work",
      "metadata[plan_id]": "plus",
      "metadata[workspace_id]": WORKSPACE_ID,
      "subscription_data[metadata][plan_id]": "plus",
      "subscription_data[metadata][workspace_id]": WORKSPACE_ID,
    });
    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.payload.status.pendingCheckout).toMatchObject({
      planId: "plus",
      interval: "month",
      provider: "stripe",
      mode: "stripe_test",
      providerSessionId: "cs_test_matterhorn",
    });
    expect(JSON.stringify(result.payload)).not.toContain("sk_test_fake_checkout");
    expect(JSON.stringify(result.payload)).not.toContain("price_plus_test");
  });

  test("POST /api/billing/checkout allowlists Stripe return URLs", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_return_urls";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_return";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_return";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({
        planId: "plus",
        workspaceId: WORKSPACE_ID,
        successUrl: "https://evil.example/complete",
        cancelUrl: "javascript:alert(1)",
      }),
    });

    expect(result.response.status).toBe(200);
    expect(stripe.calls[0].params.success_url).toBe("https://matterhorn.work/billing/success?session_id={CHECKOUT_SESSION_ID}");
    expect(stripe.calls[0].params.cancel_url).toBe("https://matterhorn.work/billing/canceled");
  });

  test("POST /api/billing/checkout uses a bounded Stripe provider timeout", async () => {
    const priorFetch = globalThis.fetch;
    let observedSignal: AbortSignal | null = null;
    globalThis.fetch = (async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      if (url.startsWith("https://stripe-timeout.test/")) {
        observedSignal = init?.signal instanceof AbortSignal ? init.signal : null;
        return Response.json({
          id: "cs_test_timeout_bound",
          object: "checkout.session",
          livemode: false,
          url: "https://checkout.stripe.com/c/pay/cs_test_timeout_bound",
          expires_at: Math.floor(Date.now() / 1000) + 1800,
        });
      }
      return priorFetch(input, init);
    }) as typeof fetch;
    try {
      process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
      process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
      process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_timeout_bound";
      process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_timeout_bound";
      process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_timeout_bound";
      process.env.MATTERHORN_STRIPE_API_BASE_URL = "https://stripe-timeout.test";
      const { base } = await boot();

      const result = await jsonFetch(base, "/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId: "plus", workspaceId: WORKSPACE_ID, interval: "monthly" }),
      });

      expect(result.response.status).toBe(200);
      const signal = observedSignal as AbortSignal | null;
      expect(signal).toBeInstanceOf(AbortSignal);
      if (signal) expect(signal.aborted).toBe(false);
    } finally {
      globalThis.fetch = priorFetch;
    }
  });

  test("POST /workspace/:id/billing/checkout uses Stripe test checkout and keeps customer portal unresolved until webhook/customer setup", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_workspace_checkout";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_workspace";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_workspace";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    const checkout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "max" }),
    });
    expect(checkout.response.status).toBe(200);
    expect(checkout.payload.mode).toBe("stripe_test");
    expect(checkout.payload.providerSessionId).toBe("cs_test_matterhorn");
    expect(checkout.payload.expiresAt).toEqual(expect.any(String));
    expect(stripe.calls[0].params["metadata[workspace_id]"]).toBe(WORKSPACE_ID);
    expect(stripe.calls[0].params["subscription_data[metadata][workspace_id]"]).toBe(WORKSPACE_ID);

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.response.status).toBe(200);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "free",
      status: "none",
    });
    expect(status.payload.status.subscription.providerCustomerId ?? null).toBeNull();
    expect(status.payload.status.subscription.providerSubscriptionId ?? null).toBeNull();
    expect(status.payload.status.pendingCheckout).toMatchObject({
      planId: "max",
      interval: "month",
      provider: "stripe",
      mode: "stripe_test",
      providerSessionId: "cs_test_matterhorn",
    });
    expect(status.payload.status.accountLinkage).toMatchObject({
      source: "stripe_test_checkout",
      label: "Stripe test checkout pending",
      status: "preview",
      hasProviderCustomer: false,
      hasProviderSubscription: false,
      pendingCheckout: true,
    });
    expect(status.payload.status.pendingCheckout.createdAt).toEqual(expect.any(String));
    expect(status.payload.status.pendingCheckout.expiresAt).toEqual(checkout.payload.expiresAt);
    expect(status.payload.status.usage.generatedImages.limit).toBe(10);

    const portal = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/portal`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(portal.response.status).toBe(400);
    expect(portal.payload.code).toBe("billing_provider_unavailable");
    expect(portal.payload.message).toContain("Stripe Customer Portal requires");

    const ledger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=billing&limit=10`);
    expect(ledger.response.status).toBe(200);
    expect(ledger.payload.items[0]).toMatchObject({
      kind: "billing",
      title: "Billing checkout pending",
      eventType: "workspace.billing.checkout",
      href: `/workspace/${WORKSPACE_ID}/settings/billing`,
      metadata: expect.objectContaining({
        auditAction: "workspace.billing.checkout",
        mode: "phase1_stripe_test",
        provider: "stripe",
        planId: "max",
      }),
    });

    const clearedPending = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/pending-checkout`, {
      method: "DELETE",
    });
    expect(clearedPending.response.status).toBe(200);
    expect(clearedPending.payload).toMatchObject({
      success: true,
      cleared: true,
      workspaceId: WORKSPACE_ID,
      status: {
        subscription: {
          planId: "free",
          status: "none",
        },
        pendingCheckout: null,
      },
    });

    const afterClear = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(afterClear.payload.status.pendingCheckout ?? null).toBeNull();
    expect(afterClear.payload.status.subscription.planId).toBe("free");

    const clearLedger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=billing&limit=10`);
    expect(clearLedger.payload.items[0]).toMatchObject({
      kind: "billing",
      title: "Billing pending checkout cleared",
      eventType: "workspace.billing.pending_checkout.clear",
      metadata: expect.objectContaining({
        auditAction: "workspace.billing.pending_checkout.clear",
        deleted: true,
        planId: "max",
      }),
    });
  });

  test("GET /workspace/:id/billing/status reports expired Stripe test checkout as no longer pending", async () => {
    const stripe = await startFakeStripe({ checkoutExpiresAtSeconds: Math.floor(Date.now() / 1000) - 60 });
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_workspace_checkout_expired";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_workspace";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_workspace";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    const checkout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "plus" }),
    });
    expect(checkout.response.status).toBe(200);
    expect(checkout.payload.expiresAt).toEqual(expect.any(String));

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.response.status).toBe(200);
    expect(status.payload.status.pendingCheckout ?? null).toBeNull();
    expect(status.payload.status.subscription).toMatchObject({
      planId: "free",
      status: "none",
    });
    expect(status.payload.status.accountLinkage).toMatchObject({
      source: "stripe_test_checkout",
      label: "Stripe test checkout expired",
      pendingCheckout: false,
    });
  });

  test("GET /workspace/:id/billing/status treats malformed checkout expiry as no longer pending", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_malformed_checkout_expiry";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_malformed_expiry";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_malformed_expiry";

    const { base, dir } = await boot();
    await new MatterhornBillingAccountStore({
      workspaceRoot: dir,
      workspaceId: WORKSPACE_ID,
    }).save({
      version: "matterhorn.billing.account.v1",
      workspaceId: WORKSPACE_ID,
      subscription: buildMatterhornBillingSubscription("free"),
      pendingCheckout: {
        planId: "plus",
        interval: "month",
        provider: "stripe",
        mode: "stripe_test",
        providerSessionId: "cs_malformed_expiry",
        createdAt: new Date().toISOString(),
        expiresAt: "not-a-date",
      },
      updatedAt: new Date().toISOString(),
      source: "stripe_test_checkout",
    });

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.response.status).toBe(200);
    expect(status.payload.status.pendingCheckout ?? null).toBeNull();
    expect(status.payload.status.accountLinkage).toMatchObject({
      source: "stripe_test_checkout",
      label: "Stripe test checkout expired",
      pendingCheckout: false,
    });
    expect(JSON.stringify(status.payload)).not.toContain("cs_malformed_expiry");
  });

  test("POST /api/billing/webhook/stripe syncs a verified Checkout session into workspace billing", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_billing";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_checkout";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_test";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_test";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    const checkout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "max", interval: "month" }),
    });
    expect(checkout.response.status).toBe(200);
    expect(checkout.payload.providerSessionId).toBe("cs_test_matterhorn");

    const rawBody = JSON.stringify({
      id: "evt_checkout_completed",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_matterhorn",
          object: "checkout.session",
          customer: "cus_test_workspace",
          subscription: "sub_test_workspace",
          payment_status: "paid",
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "max",
          },
        },
      },
    });
    const webhook = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: rawBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_checkout", rawBody) },
      },
      undefined,
    );
    expect(webhook.response.status).toBe(200);
    expect(webhook.payload).toMatchObject({
      verified: true,
      handled: true,
      workspaceSynced: true,
      workspaceId: WORKSPACE_ID,
      planId: "max",
      providerCustomerId: "cus_test_workspace",
      providerSubscriptionId: "sub_test_workspace",
    });

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.response.status).toBe(200);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "max",
      status: "active",
      providerCustomerId: "cus_test_workspace",
      providerSubscriptionId: "sub_test_workspace",
    });
    expect(status.payload.status.subscription.currentPeriodStart).toEqual(expect.any(String));
    expect(status.payload.status.subscription.currentPeriodEnd).toEqual(expect.any(String));
    expect(status.payload.status.accountLinkage).toMatchObject({
      source: "stripe_test_webhook",
      label: "Stripe test account linked",
      status: "working",
      hasProviderCustomer: true,
      hasProviderSubscription: true,
      pendingCheckout: false,
    });
    expect(status.payload.status.pendingCheckout ?? null).toBeNull();
    expect(status.payload.status.usage.generatedImages.limit).toBe(null);

    const portal = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/portal`, {
      method: "POST",
      body: JSON.stringify({ returnUrl: "https://matterhorn.work/settings/billing" }),
    });
    expect(portal.response.status).toBe(200);
    expect(portal.payload.portalUrl).toBe("https://billing.stripe.com/p/session/test_matterhorn");
    const portalCall = stripe.calls.find((call) => call.path === "/v1/billing_portal/sessions");
    expect(portalCall?.params.customer).toBe("cus_test_workspace");

    const ledger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=billing&limit=10`);
    expect(ledger.response.status).toBe(200);
    expect(ledger.payload.items.some((item: { title: string }) => item.title === "Billing provider synced")).toBe(true);
  });

  test("POST /api/billing/webhook/stripe does not sync unpaid Checkout sessions", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_unpaid_checkout";

    const { base } = await boot();
    const rawBody = JSON.stringify({
      id: "evt_checkout_unpaid",
      type: "checkout.session.completed",
      livemode: false,
      created: STRIPE_PERIOD_START_SECONDS,
      data: {
        object: {
          id: "cs_test_unpaid",
          object: "checkout.session",
          customer: "cus_test_unpaid",
          subscription: "sub_test_unpaid",
          payment_status: "unpaid",
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "max",
          },
        },
      },
    });
    const webhook = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: rawBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_unpaid_checkout", rawBody) },
      },
      undefined,
    );

    expect(webhook.response.status).toBe(200);
    expect(webhook.payload).toMatchObject({
      verified: true,
      handled: false,
      workspaceSynced: false,
      eventId: "evt_checkout_unpaid",
      eventCreatedAt: stripePeriodIso(STRIPE_PERIOD_START_SECONDS),
    });

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "free",
      status: "none",
    });
  });

  test("POST /api/billing/webhook/stripe rejects checkout sessions that do not match the pending workspace checkout", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_checkout_match";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_checkout_match";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_test";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_test";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    const checkout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "max", interval: "month" }),
    });
    expect(checkout.response.status).toBe(200);
    expect(checkout.payload.providerSessionId).toBe("cs_test_matterhorn");

    const rawBody = JSON.stringify({
      id: "evt_checkout_mismatch",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_someone_else",
          object: "checkout.session",
          customer: "cus_test_mismatch",
          subscription: "sub_test_mismatch",
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "max",
          },
        },
      },
    });
    const webhook = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: rawBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_checkout_match", rawBody) },
      },
      undefined,
    );

    expect(webhook.response.status).toBe(200);
    expect(webhook.payload).toMatchObject({
      verified: true,
      handled: false,
      workspaceSynced: false,
      eventId: "evt_checkout_mismatch",
      planId: "max",
    });

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "free",
      status: "none",
    });
    expect(status.payload.status.pendingCheckout).toMatchObject({
      planId: "max",
      providerSessionId: "cs_test_matterhorn",
    });
  });

  test("POST /api/billing/webhook/stripe does not bootstrap paid state from subscription events alone", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_unlinked_subscription";

    const { base } = await boot();
    const rawBody = JSON.stringify({
      id: "evt_subscription_unlinked",
      type: "customer.subscription.updated",
      livemode: false,
      created: STRIPE_PERIOD_START_SECONDS,
      data: {
        object: {
          id: "sub_test_unlinked",
          object: "subscription",
          customer: "cus_test_unlinked",
          status: "active",
          current_period_start: STRIPE_PERIOD_START_SECONDS,
          current_period_end: STRIPE_PERIOD_END_SECONDS,
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "max",
          },
        },
      },
    });
    const webhook = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: rawBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_unlinked_subscription", rawBody) },
      },
      undefined,
    );

    expect(webhook.response.status).toBe(200);
    expect(webhook.payload).toMatchObject({
      verified: true,
      handled: false,
      workspaceSynced: false,
      eventId: "evt_subscription_unlinked",
      planId: "max",
      subscriptionStatus: "active",
    });

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "free",
      status: "none",
    });
  });

  test("POST /api/billing/webhook/stripe syncs subscription update and cancellation events", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_subscription";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_subscription";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_subscription";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_subscription";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    await linkStripeTestSubscription(base, {
      webhookSecret: "whsec_subscription",
      planId: "plus",
      providerCustomerId: "cus_test_workspace",
      providerSubscriptionId: "sub_test_workspace",
    });

    const activeBody = JSON.stringify({
      id: "evt_subscription_updated",
      type: "customer.subscription.updated",
      livemode: false,
      data: {
        object: {
          id: "sub_test_workspace",
          object: "subscription",
          customer: "cus_test_workspace",
          status: "active",
          current_period_start: STRIPE_PERIOD_START_SECONDS,
          current_period_end: STRIPE_PERIOD_END_SECONDS,
          cancel_at_period_end: true,
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "plus",
          },
        },
      },
    });
    const active = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: activeBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_subscription", activeBody) },
      },
      undefined,
    );
    expect(active.response.status).toBe(200);
    expect(active.payload).toMatchObject({
      verified: true,
      handled: true,
      workspaceSynced: true,
      planId: "plus",
      subscriptionStatus: "active",
      cancelAtPeriodEnd: true,
    });

    const activeStatus = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(activeStatus.payload.status.subscription).toMatchObject({
      planId: "plus",
      status: "active",
      providerCustomerId: "cus_test_workspace",
      providerSubscriptionId: "sub_test_workspace",
      cancelAtPeriodEnd: true,
      currentPeriodStart: stripePeriodIso(STRIPE_PERIOD_START_SECONDS),
      currentPeriodEnd: stripePeriodIso(STRIPE_PERIOD_END_SECONDS),
    });

    const deletedBody = JSON.stringify({
      id: "evt_subscription_deleted",
      type: "customer.subscription.deleted",
      livemode: false,
      data: {
        object: {
          id: "sub_test_workspace",
          object: "subscription",
          customer: "cus_test_workspace",
          status: "canceled",
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "plus",
          },
        },
      },
    });
    const deleted = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: deletedBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_subscription", deletedBody) },
      },
      undefined,
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.payload).toMatchObject({
      verified: true,
      handled: true,
      workspaceSynced: true,
      planId: "free",
      subscriptionStatus: "canceled",
    });

    const canceledStatus = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(canceledStatus.payload.status.subscription).toMatchObject({
      planId: "free",
      status: "canceled",
      providerCustomerId: "cus_test_workspace",
      providerSubscriptionId: "sub_test_workspace",
    });
    expect(canceledStatus.payload.status.usage.generatedImages.limit).toBe(10);
  });

  test("POST /api/billing/webhook/stripe ignores stale subscription events", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_stale_subscription";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_stale_subscription";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_stale";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_stale";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    await linkStripeTestSubscription(base, {
      webhookSecret: "whsec_stale_subscription",
      planId: "max",
      providerCustomerId: "cus_test_stale",
      providerSubscriptionId: "sub_test_stale",
    });

    const newerBody = JSON.stringify({
      id: "evt_subscription_newer",
      type: "customer.subscription.updated",
      livemode: false,
      created: STRIPE_NEWER_EVENT_SECONDS,
      data: {
        object: {
          id: "sub_test_stale",
          object: "subscription",
          customer: "cus_test_stale",
          status: "active",
          current_period_start: STRIPE_PERIOD_START_SECONDS,
          current_period_end: STRIPE_PERIOD_END_SECONDS,
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "max",
          },
        },
      },
    });
    const newer = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: newerBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_stale_subscription", newerBody) },
      },
      undefined,
    );
    expect(newer.payload).toMatchObject({
      verified: true,
      handled: true,
      workspaceSynced: true,
      planId: "max",
      eventCreatedAt: stripePeriodIso(STRIPE_NEWER_EVENT_SECONDS),
    });

    const olderBody = JSON.stringify({
      id: "evt_subscription_older_deleted",
      type: "customer.subscription.deleted",
      livemode: false,
      created: STRIPE_PERIOD_START_SECONDS,
      data: {
        object: {
          id: "sub_test_stale",
          object: "subscription",
          customer: "cus_test_stale",
          status: "canceled",
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "plus",
          },
        },
      },
    });
    const older = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: olderBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_stale_subscription", olderBody) },
      },
      undefined,
    );
    expect(older.payload).toMatchObject({
      verified: true,
      handled: true,
      workspaceSynced: false,
      webhookMutation: "stale_event",
      planId: "free",
      subscriptionStatus: "canceled",
      eventCreatedAt: stripePeriodIso(STRIPE_PERIOD_START_SECONDS),
    });

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "max",
      status: "active",
      providerCustomerId: "cus_test_stale",
      providerSubscriptionId: "sub_test_stale",
    });

    const ledger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=billing&limit=10`);
    const webhookRows = ledger.payload.items.filter((item: { eventType?: string }) =>
      item.eventType === "workspace.billing.webhook"
    );
    expect(webhookRows).toHaveLength(2);
  });

  test("POST /api/billing/webhook/stripe uses Checkout client references and subscription price ids as safe fallbacks", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_fallbacks";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_fallbacks";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_fallback";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_fallback";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    const pending = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "plus", interval: "month" }),
    });
    expect(pending.response.status).toBe(200);
    expect(pending.payload.providerSessionId).toBe("cs_test_matterhorn");

    const checkoutBody = JSON.stringify({
      id: "evt_checkout_fallback",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_matterhorn",
          object: "checkout.session",
          customer: "cus_test_fallback",
          subscription: "sub_test_fallback",
          payment_status: "paid",
          client_reference_id: `matterhorn_${WORKSPACE_ID}_plus`,
          metadata: {},
        },
      },
    });
    const checkout = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: checkoutBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_fallbacks", checkoutBody) },
      },
      undefined,
    );
    expect(checkout.response.status).toBe(200);
    expect(checkout.payload).toMatchObject({
      verified: true,
      handled: true,
      workspaceSynced: true,
      workspaceId: WORKSPACE_ID,
      planId: "plus",
    });

    const subscriptionBody = JSON.stringify({
      id: "evt_subscription_price_fallback",
      type: "customer.subscription.updated",
      livemode: false,
      data: {
        object: {
          id: "sub_test_fallback",
          object: "subscription",
          customer: "cus_test_fallback",
          status: "active",
          current_period_start: STRIPE_PERIOD_START_SECONDS,
          current_period_end: STRIPE_PERIOD_END_SECONDS,
          metadata: {
            workspace_id: WORKSPACE_ID,
          },
          items: {
            data: [
              {
                price: {
                  id: "price_max_fallback",
                },
              },
            ],
          },
        },
      },
    });
    const subscription = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: subscriptionBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_fallbacks", subscriptionBody) },
      },
      undefined,
    );
    expect(subscription.response.status).toBe(200);
    expect(subscription.payload).toMatchObject({
      verified: true,
      handled: true,
      workspaceSynced: true,
      workspaceId: WORKSPACE_ID,
      planId: "max",
      subscriptionStatus: "active",
    });

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "max",
      status: "active",
      providerCustomerId: "cus_test_fallback",
      providerSubscriptionId: "sub_test_fallback",
    });
    expect(status.payload.status.usage.generatedImages.limit).toBe(null);
  });

  test("POST /api/billing/webhook/stripe is idempotent for duplicate Stripe event ids", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_idempotent";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_idempotent";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_test";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_test";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    const checkout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "plus", interval: "month" }),
    });
    expect(checkout.response.status).toBe(200);
    expect(checkout.payload.providerSessionId).toBe("cs_test_matterhorn");

    const rawBody = JSON.stringify({
      id: "evt_billing_duplicate",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_matterhorn",
          object: "checkout.session",
          customer: "cus_test_duplicate",
          subscription: "sub_test_duplicate",
          payment_status: "paid",
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "plus",
          },
        },
      },
    });
    const requestInit = {
      method: "POST",
      body: rawBody,
      headers: { "stripe-signature": stripeSignatureHeader("whsec_idempotent", rawBody) },
    };
    const [first, second] = await Promise.all([
      jsonFetch(base, "/api/billing/webhook/stripe", requestInit, undefined),
      jsonFetch(base, "/api/billing/webhook/stripe", requestInit, undefined),
    ]);

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(200);
    expect([first.payload, second.payload].map((payload) => payload.webhookMutation).sort()).toEqual([
      "duplicate_event",
      "synced",
    ]);
    for (const payload of [first.payload, second.payload]) {
      expect(payload).toMatchObject({
        verified: true,
        handled: true,
        eventId: "evt_billing_duplicate",
        planId: "plus",
      });
    }

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "plus",
      status: "active",
      providerCustomerId: "cus_test_duplicate",
      providerSubscriptionId: "sub_test_duplicate",
    });

    const ledger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=billing&limit=10`);
    const webhookRows = ledger.payload.items.filter((item: { eventType?: string }) =>
      item.eventType === "workspace.billing.webhook"
    );
    expect(webhookRows).toHaveLength(1);
  });

  test("POST /api/billing/portal creates a Stripe test Customer Portal session when a test customer is configured", async () => {
    const stripe = await startFakeStripe();
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_fake_portal";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_test";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_test";
    process.env.MATTERHORN_STRIPE_TEST_CUSTOMER_ID = "cus_test_matterhorn";
    process.env.MATTERHORN_STRIPE_API_BASE_URL = stripe.baseUrl;

    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/portal", {
      method: "POST",
      body: JSON.stringify({ returnUrl: "https://matterhorn.work/settings/billing" }),
    });

    expect(result.response.status).toBe(200);
    expect(result.payload).toMatchObject({
      success: true,
      mode: "stripe_test",
      portalUrl: "https://billing.stripe.com/p/session/test_matterhorn",
      providerSessionId: "bps_test_matterhorn",
    });
    expect(stripe.calls.length).toBe(1);
    expect(stripe.calls[0]).toMatchObject({
      path: "/v1/billing_portal/sessions",
      authorization: "Bearer sk_test_fake_portal",
    });
    expect(stripe.calls[0].params).toMatchObject({
      customer: "cus_test_matterhorn",
      return_url: "https://matterhorn.work/settings/billing",
    });
    expect(JSON.stringify(result.payload)).not.toContain("sk_test_fake_portal");
  });

  test("GET /workspace/:id/billing/status returns workspace generated-media usage", async () => {
    process.env.MATTERHORN_BILLING_CURRENT_PLAN = "plus";
    const { base, dir } = await boot();
    const imageStore = new MatterhornGeneratedImageStore({ workspaceRoot: dir, workspaceId: WORKSPACE_ID });
    const draftStore = new MatterhornImageNftDraftStore({ workspaceRoot: dir, workspaceId: WORKSPACE_ID });
    const imageA = testImage(WORKSPACE_ID, "img_billing_current_a", currentPeriodIso());
    const imageB = testImage(WORKSPACE_ID, "img_billing_current_b", currentPeriodIso());
    const oldImage = testImage(WORKSPACE_ID, "img_billing_previous", previousPeriodIso());
    await imageStore.save(imageA);
    await imageStore.save(imageB);
    await imageStore.save(oldImage);
    await draftStore.create(imageA, { title: "Billing usage NFT draft" });

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);

    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.status.subscription.planId).toBe("plus");
    expect(result.payload.status.usage.generatedImages).toMatchObject({ used: 2, limit: 100 });
    expect(result.payload.status.usage.generatedImages.resetsAt).toEqual(expect.any(String));
    expect(result.payload.status.usage.nftDrafts).toMatchObject({ used: 1, limit: 20 });
    expect(result.payload.status.usage.nftDrafts.resetsAt).toEqual(expect.any(String));
    expect(result.payload.status.usage.teamMembers).toMatchObject({ used: 1, limit: 1 });
  });

  test("POST /workspace/:id/billing/checkout creates a local checkout preview without granting plan access", async () => {
    const { base } = await boot();
    const checkout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "plus", interval: "month" }),
    });

    expect(checkout.response.status).toBe(200);
    expect(checkout.payload.success).toBe(true);
    expect(checkout.payload.checkoutUrl).toContain("mock-checkout.matterhorn.work");

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.response.status).toBe(200);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "free",
      status: "none",
      interval: "month",
      cancelAtPeriodEnd: false,
    });
    expect(status.payload.status.subscription.providerCustomerId ?? null).toBeNull();
    expect(status.payload.status.subscription.providerSubscriptionId ?? null).toBeNull();
    expect(status.payload.status.pendingCheckout).toMatchObject({
      planId: "plus",
      interval: "month",
      provider: "mock",
      mode: "mock",
      providerSessionId: null,
    });
    expect(status.payload.status.accountLinkage).toMatchObject({
      source: "mock_checkout",
      label: "Local checkout preview",
      status: "preview",
      hasProviderCustomer: false,
      hasProviderSubscription: false,
      pendingCheckout: true,
    });
    expect(status.payload.status.usage.generatedImages.limit).toBe(10);

    const audit = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/audit?limit=5`);
    expect(audit.response.status).toBe(200);
    const checkoutEntry = audit.payload.items.find((item: { action: string }) => item.action === "workspace.billing.checkout");
    expect(checkoutEntry).toMatchObject({
      workspaceId: WORKSPACE_ID,
      action: "workspace.billing.checkout",
      target: `billing:${WORKSPACE_ID}`,
      metadata: {
        planId: "plus",
        interval: "month",
        mode: "phase0_mock",
        provider: "mock",
        livePaymentsEnabled: false,
      },
    });
    expect(JSON.stringify(audit.payload)).not.toContain("mock_sub_");
    expect(JSON.stringify(audit.payload)).not.toContain("mock_cus_");
  });

  test("DELETE /workspace/:id/billing/subscription clears the local workspace billing override", async () => {
    const { base } = await boot();
    await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "plus" }),
    });
    const before = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(before.payload.status.subscription.planId).toBe("free");
    expect(before.payload.status.pendingCheckout).toMatchObject({
      planId: "plus",
      mode: "mock",
    });

    const cleared = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/subscription`, { method: "DELETE" });
    expect(cleared.response.status).toBe(200);
    expect(cleared.payload.success).toBe(true);
    expect(cleared.payload.deleted).toBe(true);
    expect(cleared.payload.status.subscription.planId).toBe("free");

    const after = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(after.payload.status.subscription.planId).toBe("free");
    expect(after.payload.status.usage.generatedImages.limit).toBe(10);

    const audit = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/audit?limit=10`);
    const actions = audit.payload.items.map((item: { action: string }) => item.action);
    expect(actions).toContain("workspace.billing.checkout");
    expect(actions).toContain("workspace.billing.subscription.clear");

    const ledger = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/data-ledger?kind=billing&limit=10`);
    expect(ledger.response.status).toBe(200);
    expect(ledger.payload.summary.billing).toBeGreaterThanOrEqual(2);
    expect(ledger.payload.items.slice(0, 2).map((item: { title: string }) => item.title)).toEqual([
      "Billing subscription cleared",
      "Billing plan updated",
    ]);
    expect(ledger.payload.items[0]).toMatchObject({
      kind: "billing",
      href: `/workspace/${WORKSPACE_ID}/settings/billing`,
      metadata: expect.objectContaining({
        auditAction: "workspace.billing.subscription.clear",
        deleted: true,
      }),
    });
  });

  test("POST /api/billing/checkout returns mock checkout URL", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "plus", workspaceId: WORKSPACE_ID }),
    });
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.checkoutUrl).toContain("mock-checkout.matterhorn.work");
    expect(result.payload.mode).toBe("mock");
    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.payload.status.pendingCheckout).toMatchObject({
      planId: "plus",
      provider: "mock",
      mode: "mock",
    });
  });

  test("POST /api/billing/portal returns mock portal URL", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/portal", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.portalUrl).toContain("mock-portal.matterhorn.work");
  });

  test("viewer tokens cannot start checkout or open billing portal", async () => {
    const { base } = await boot();
    const issued = await hostJsonFetch(
      base,
      "/tokens",
      {
        method: "POST",
        body: JSON.stringify({ scope: "viewer", label: "billing viewer" }),
      },
    );
    expect(issued.response.status).toBe(201);
    const viewerToken = String(issued.payload.token ?? "");
    expect(viewerToken).toStartWith("owt_");

    const checkout = await jsonFetch(
      base,
      "/api/billing/checkout",
      {
        method: "POST",
        body: JSON.stringify({ planId: "plus" }),
      },
      viewerToken,
    );
    expect(checkout.response.status).toBe(403);
    expect(checkout.payload.code).toBe("forbidden");

    const workspaceCheckout = await jsonFetch(
      base,
      `/workspace/${WORKSPACE_ID}/billing/checkout`,
      {
        method: "POST",
        body: JSON.stringify({ planId: "plus" }),
      },
      viewerToken,
    );
    expect(workspaceCheckout.response.status).toBe(403);
    expect(workspaceCheckout.payload.code).toBe("forbidden");

    const workspacePendingClear = await jsonFetch(
      base,
      `/workspace/${WORKSPACE_ID}/billing/pending-checkout`,
      { method: "DELETE" },
      viewerToken,
    );
    expect(workspacePendingClear.response.status).toBe(403);
    expect(workspacePendingClear.payload.code).toBe("forbidden");

    const workspaceClear = await jsonFetch(
      base,
      `/workspace/${WORKSPACE_ID}/billing/subscription`,
      { method: "DELETE" },
      viewerToken,
    );
    expect(workspaceClear.response.status).toBe(403);
    expect(workspaceClear.payload.code).toBe("forbidden");

    const portal = await jsonFetch(
      base,
      "/api/billing/portal",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
      viewerToken,
    );
    expect(portal.response.status).toBe(403);
    expect(portal.payload.code).toBe("forbidden");
  });

  test("read-only mode blocks billing writes and signed webhook sync", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_test_readonly";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_readonly";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_plus_readonly";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_max_readonly";

    const { base, dir } = await boot({ readOnly: true });
    const createdAt = new Date().toISOString();
    await new MatterhornBillingAccountStore({ workspaceRoot: dir, workspaceId: WORKSPACE_ID }).save({
      version: "matterhorn.billing.account.v1",
      workspaceId: WORKSPACE_ID,
      subscription: buildMatterhornBillingSubscription("free"),
      pendingCheckout: {
        planId: "plus",
        interval: "month",
        provider: "stripe",
        mode: "stripe_test",
        providerSessionId: "cs_test_readonly",
        createdAt,
        expiresAt: null,
      },
      updatedAt: createdAt,
      source: "stripe_test_checkout",
    });

    const workspaceCheckout = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/checkout`, {
      method: "POST",
      body: JSON.stringify({ planId: "plus", interval: "month" }),
    });
    expect(workspaceCheckout.response.status).toBe(403);
    expect(workspaceCheckout.payload.code).toBe("read_only");

    const portal = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/portal`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(portal.response.status).toBe(403);
    expect(portal.payload.code).toBe("read_only");

    const pendingClear = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/pending-checkout`, {
      method: "DELETE",
    });
    expect(pendingClear.response.status).toBe(403);
    expect(pendingClear.payload.code).toBe("read_only");

    const subscriptionClear = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/subscription`, {
      method: "DELETE",
    });
    expect(subscriptionClear.response.status).toBe(403);
    expect(subscriptionClear.payload.code).toBe("read_only");

    const rawBody = JSON.stringify({
      id: "evt_readonly_checkout",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_test_readonly",
          object: "checkout.session",
          customer: "cus_test_readonly",
          subscription: "sub_test_readonly",
          payment_status: "paid",
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "plus",
          },
        },
      },
    });
    const webhook = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: rawBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_readonly", rawBody) },
      },
      undefined,
    );
    expect(webhook.response.status).toBe(403);
    expect(webhook.payload.code).toBe("read_only");

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.response.status).toBe(200);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "free",
      status: "none",
    });
    expect(status.payload.status.pendingCheckout).toMatchObject({
      planId: "plus",
      mode: "stripe_test",
      providerSessionId: "cs_test_readonly",
    });
    expect(JSON.stringify(status.payload.status.subscription)).not.toContain("cus_test_readonly");
    expect(JSON.stringify(status.payload.status.subscription)).not.toContain("sub_test_readonly");
  });

  test("POST /api/billing/webhook/stripe verifies unsupported test webhooks without local sync", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_test";
    const { base } = await boot();
    const rawBody = JSON.stringify({ id: "evt_test", type: "invoice.payment_succeeded", livemode: false });
    const result = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: rawBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_test", rawBody) },
      },
      undefined,
    );
    expect(result.response.status).toBe(200);
    expect(result.payload.received).toBe(true);
    expect(result.payload.livemode).toBe(false);
    expect(result.payload.verified).toBe(true);
    expect(result.payload.handled).toBe(false);
    expect(result.payload.workspaceSynced).toBe(false);
  });

  test("POST /api/billing/webhook/stripe rejects mutated or invalid test signatures", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_test_invalid";
    const { base } = await boot();
    const rawBody = JSON.stringify({ id: "evt_test", type: "checkout.session.completed", livemode: false });
    const result = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: rawBody,
        headers: { "stripe-signature": stripeSignatureHeader("wrong_secret", rawBody) },
      },
      undefined,
    );
    expect(result.response.status).toBe(200);
    expect(result.payload.received).toBe(true);
    expect(result.payload.verified).toBe(false);
    expect(result.payload.handled).toBe(false);
  });

  test("POST /api/billing/webhook/stripe rejects stale test signatures", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_stale_signature";
    const { base } = await boot();
    const rawBody = JSON.stringify({
      id: "evt_stale_signature",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          object: "checkout.session",
          customer: "cus_stale_signature",
          subscription: "sub_stale_signature",
          payment_status: "paid",
          metadata: {
            workspace_id: WORKSPACE_ID,
            plan_id: "max",
          },
        },
      },
    });
    const staleTimestamp = Math.floor(Date.now() / 1000) - 10 * 60;
    const result = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: rawBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_stale_signature", rawBody, staleTimestamp) },
      },
      undefined,
    );

    expect(result.response.status).toBe(200);
    expect(result.payload).toMatchObject({
      received: true,
      verified: false,
      handled: false,
      workspaceSynced: false,
    });

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "free",
      status: "none",
    });
  });

  test("POST /api/billing/webhook/stripe rejects overlarge raw payloads before signature handling", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_large_payload";
    const { base } = await boot();
    const rawBody = JSON.stringify({
      id: "evt_large_payload",
      type: "checkout.session.completed",
      livemode: false,
      padding: "x".repeat(270_000),
    });
    const result = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: rawBody,
        headers: { "stripe-signature": stripeSignatureHeader("whsec_large_payload", rawBody) },
      },
      undefined,
    );

    expect(result.response.status).toBe(413);
    expect(result.payload).toMatchObject({
      success: false,
      code: "payload_too_large",
    });
  });

  test("checkout rejects invalid planId", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "enterprise" }),
    });
    expect(result.response.status).toBe(400);
    expect(result.payload.code).toBe("invalid_plan");
  });

  test("checkout rejects overlarge JSON payloads", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "plus", workspaceId: WORKSPACE_ID, padding: "x".repeat(20_000) }),
    });
    expect(result.response.status).toBe(413);
    expect(result.payload).toMatchObject({
      success: false,
      code: "payload_too_large",
    });
  });

  test("checkout rejects live mode", async () => {
    process.env.MATTERHORN_BILLING_MODE = "live";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_live_checkout_should_not_leak";
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "plus" }),
    });
    expect(result.response.status).toBe(400);
    expect(result.payload.code).toBe("live_payments_disabled");
    expect(JSON.stringify(result.payload)).not.toContain("sk_live_checkout_should_not_leak");
  });
});

describe("Billing capability", () => {
  test("GET /api/backend/capabilities includes billing", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/backend/capabilities");
    expect(result.response.status).toBe(200);
    expect(result.payload.billing).toBeDefined();
    expect(result.payload.billing.currentPlanId).toBe("free");
    expect(result.payload.billing.isLivePaymentsEnabled).toBe(false);
    expect(result.payload.billing.setup.readyForTestCheckout).toBe(false);
    expect(result.payload.settings.some((s: { section: string }) => s.section === "billing")).toBe(true);
  });

  test("GET /api/backend/capabilities reports live billing as setup-blocked", async () => {
    process.env.MATTERHORN_BILLING_MODE = "live";
    process.env.MATTERHORN_STRIPE_SECRET_KEY = "sk_live_capability_should_not_leak";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_capability_should_not_leak";
    process.env.MATTERHORN_STRIPE_PRICE_ID_PLUS = "price_live_capability_plus";
    process.env.MATTERHORN_STRIPE_PRICE_ID_MAX = "price_live_capability_max";

    const { base } = await boot();
    const result = await jsonFetch(base, "/api/backend/capabilities");
    expect(result.response.status).toBe(200);
    expect(result.payload.billing).toMatchObject({
      status: "needs_setup",
      mode: "live",
      provider: "stripe",
      isLivePaymentsEnabled: false,
      checkoutSupported: false,
      portalSupported: false,
    });
    expect(result.payload.billing.setup.checks).toContainEqual(expect.objectContaining({
      id: "live_mode_blocked",
      status: "needs_setup",
    }));
    expect(result.payload.billing.setup.checks).toContainEqual(expect.objectContaining({
      id: "stripe_live_key_rejected",
      status: "error",
    }));
    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain("sk_live_capability_should_not_leak");
    expect(serialized).not.toContain("whsec_capability_should_not_leak");
    expect(serialized).not.toContain("price_live_capability_plus");
    expect(serialized).not.toContain("price_live_capability_max");
  });
});
