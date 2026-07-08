import { mkdtempSync, rmSync } from "node:fs";
import { createHmac } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { MatterhornGeneratedImage } from "@matterhorn-work/types/generated-media";
import { MatterhornGeneratedImageStore } from "./generated-image-store.js";
import { MatterhornImageNftDraftStore } from "./image-nft-draft-store.js";
import { startServer } from "./server.js";
import type { ServerConfig } from "./types.js";

const TOKEN = "test-token";
const HOST_TOKEN = "test-host-token";
const WORKSPACE_ID = "ws_billing";

let priorEnv: Record<string, string | undefined> = {};
const stops: Array<() => Promise<void> | void> = [];
const dirs: string[] = [];
const stripeServers: Array<ReturnType<typeof Bun.serve>> = [];

function baseConfig(port: number, root: string): ServerConfig {
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
    readOnly: false,
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

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-billing-"));
  dirs.push(dir);
  process.env.OPENWORK_DATA_DIR = join(dir, "openwork-data");
  process.env.OPENWORK_TOKEN_STORE = join(dir, "tokens.json");
  const port = await getFreePort();
  const server = await startServer(baseConfig(port, dir));
  stops.push(() => server.stop());
  return { base: `http://127.0.0.1:${port}`, dir };
}

async function startFakeStripe() {
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
      ...init?.headers,
    },
  });
  return { response, payload: await response.json().catch(() => ({})) };
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
  for (const server of stripeServers.reverse()) server.stop();
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
    expect(result.payload.status.setup).toMatchObject({
      mode: "phase0_mock",
      provider: "mock",
      readyForTestCheckout: true,
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

  test("POST /api/billing/checkout creates a Stripe test Checkout session when configured", async () => {
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
      client_reference_id: "matterhorn_plus",
      "metadata[product]": "matterhorn-work",
      "metadata[plan_id]": "plus",
      "subscription_data[metadata][plan_id]": "plus",
    });
    expect(JSON.stringify(result.payload)).not.toContain("sk_test_fake_checkout");
    expect(JSON.stringify(result.payload)).not.toContain("price_plus_test");
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
    expect(stripe.calls[0].params["metadata[workspace_id]"]).toBe(WORKSPACE_ID);
    expect(stripe.calls[0].params["subscription_data[metadata][workspace_id]"]).toBe(WORKSPACE_ID);

    const status = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);
    expect(status.response.status).toBe(200);
    expect(status.payload.status.subscription).toMatchObject({
      planId: "max",
      status: "active",
      providerCustomerId: null,
      providerSubscriptionId: "cs_test_matterhorn",
    });

    const portal = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/portal`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(portal.response.status).toBe(400);
    expect(portal.payload.code).toBe("billing_provider_unavailable");
    expect(portal.payload.message).toContain("Stripe Customer Portal requires");
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

  test("POST /api/billing/webhook/stripe syncs subscription update and cancellation events", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_subscription";

    const { base } = await boot();
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
          current_period_start: 1783517000,
          current_period_end: 1786109000,
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
      currentPeriodStart: "2026-07-08T13:23:20.000Z",
      currentPeriodEnd: "2026-08-07T13:23:20.000Z",
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

  test("POST /workspace/:id/billing/checkout persists a non-live workspace subscription", async () => {
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
      planId: "plus",
      status: "active",
      interval: "month",
      cancelAtPeriodEnd: false,
      providerCustomerId: `mock_cus_${WORKSPACE_ID}`,
      providerSubscriptionId: `mock_sub_${WORKSPACE_ID}_plus`,
    });
    expect(typeof status.payload.status.subscription.currentPeriodStart).toBe("string");
    expect(typeof status.payload.status.subscription.currentPeriodEnd).toBe("string");
    expect(status.payload.status.usage.generatedImages.limit).toBe(100);

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
    expect(before.payload.status.subscription.planId).toBe("plus");

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
      body: JSON.stringify({ planId: "plus" }),
    });
    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.checkoutUrl).toContain("mock-checkout.matterhorn.work");
    expect(result.payload.mode).toBe("mock");
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

  test("checkout rejects invalid planId", async () => {
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "enterprise" }),
    });
    expect(result.response.status).toBe(400);
    expect(result.payload.code).toBe("invalid_plan");
  });

  test("checkout rejects live mode", async () => {
    process.env.MATTERHORN_BILLING_MODE = "live";
    const { base } = await boot();
    const result = await jsonFetch(base, "/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ planId: "plus" }),
    });
    expect(result.response.status).toBe(400);
    expect(result.payload.code).toBe("live_payments_disabled");
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
    expect(result.payload.billing.setup.readyForTestCheckout).toBe(true);
    expect(result.payload.settings.some((s: { section: string }) => s.section === "billing")).toBe(true);
  });
});
