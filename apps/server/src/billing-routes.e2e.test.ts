import { mkdtempSync, rmSync } from "node:fs";
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

async function boot(envOverrides?: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "matterhorn-billing-"));
  dirs.push(dir);
  const port = await getFreePort();
  const server = await startServer(baseConfig(port, dir));
  stops.push(() => server.stop());
  return { base: `http://127.0.0.1:${port}`, dir };
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
  };
  delete process.env.MATTERHORN_BILLING_MODE;
  delete process.env.MATTERHORN_BILLING_PROVIDER;
  delete process.env.MATTERHORN_BILLING_CURRENT_PLAN;
  delete process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET;
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
  });

  test("GET /workspace/:id/billing/status returns workspace generated-media usage", async () => {
    process.env.MATTERHORN_BILLING_CURRENT_PLAN = "plus";
    const { base, dir } = await boot();
    const imageStore = new MatterhornGeneratedImageStore({ workspaceRoot: dir, workspaceId: WORKSPACE_ID });
    const draftStore = new MatterhornImageNftDraftStore({ workspaceRoot: dir, workspaceId: WORKSPACE_ID });
    const imageA = testImage(WORKSPACE_ID, "img_billing_a", "2026-07-08T00:00:00.000Z");
    const imageB = testImage(WORKSPACE_ID, "img_billing_b", "2026-07-08T00:01:00.000Z");
    await imageStore.save(imageA);
    await imageStore.save(imageB);
    await draftStore.create(imageA, { title: "Billing usage NFT draft" });

    const result = await jsonFetch(base, `/workspace/${WORKSPACE_ID}/billing/status`);

    expect(result.response.status).toBe(200);
    expect(result.payload.success).toBe(true);
    expect(result.payload.status.subscription.planId).toBe("plus");
    expect(result.payload.status.usage.generatedImages).toMatchObject({ used: 2, limit: 100 });
    expect(result.payload.status.usage.nftDrafts).toMatchObject({ used: 1, limit: 20 });
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

  test("POST /api/billing/webhook/stripe accepts test webhook without live processing", async () => {
    process.env.MATTERHORN_BILLING_MODE = "phase1_stripe_test";
    process.env.MATTERHORN_BILLING_PROVIDER = "stripe";
    process.env.MATTERHORN_STRIPE_WEBHOOK_SECRET = "whsec_test";
    const { base } = await boot();
    const result = await jsonFetch(
      base,
      "/api/billing/webhook/stripe",
      {
        method: "POST",
        body: JSON.stringify({ type: "invoice.payment_succeeded" }),
        headers: { "stripe-signature": "v1=test" },
      },
      undefined,
    );
    expect(result.response.status).toBe(200);
    expect(result.payload.received).toBe(true);
    expect(result.payload.livemode).toBe(false);
    expect(result.payload.verified).toBe(true);
    expect(result.payload.handled).toBe(true);
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
    expect(result.payload.settings.some((s: { section: string }) => s.section === "billing")).toBe(true);
  });
});
