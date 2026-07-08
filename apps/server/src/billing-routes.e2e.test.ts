import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
