import type {
  MatterhornBillingCheckoutRequest,
  MatterhornBillingPortalRequest,
  MatterhornBillingWebhookStripeRequest,
} from "@matterhorn-work/types/billing";
import {
  buildBillingPlansResponse,
  buildBillingStatusResponse,
  buildBillingStatusResponseForSubscription,
  buildBillingStatusResponseWithUsage,
  buildMatterhornBillingSubscription,
  createBillingProvider,
  resolveBillingProviderConfigFromEnv,
  type BillingProvider,
} from "./billing.js";
import { MatterhornBillingAccountStore } from "./billing-account-store.js";
import { MatterhornGeneratedImageStore } from "./generated-image-store.js";
import { MatterhornImageNftDraftStore } from "./image-nft-draft-store.js";
import type { ServerConfig, TokenScope, WorkspaceInfo } from "./types.js";

export type RouteAdder = (method: string, path: string, auth: "none" | "client" | "host" | "host-token", handler: RouteHandler) => void;
export type RouteHandler = (ctx: {
  request: Request;
  url: URL;
  params: Record<string, string>;
  config: ServerConfig;
  actor?: { scope?: TokenScope };
}) => Promise<Response>;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(code: string, message: string): Response {
  return jsonResponse({ success: false, code, message }, 400);
}

function forbidden(code: string, message: string): Response {
  return jsonResponse({ success: false, code, message }, 403);
}

function jsonBody<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

function billingWriteBlocker(ctx: { config: ServerConfig; actor?: { scope?: TokenScope } }, action: string): Response | null {
  if (ctx.config.readOnly) {
    return forbidden("read_only", `Billing ${action} is unavailable in read-only mode.`);
  }
  if (ctx.actor?.scope === "viewer") {
    return forbidden("forbidden", `Viewer tokens cannot ${action}.`);
  }
  return null;
}

function nextBillingPeriod(now = new Date()): { currentPeriodStart: string; currentPeriodEnd: string } {
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return {
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: end.toISOString(),
  };
}

export interface BillingRouteContext {
  provider: BillingProvider;
  config: ServerConfig;
  resolveWorkspace?: (config: ServerConfig, id: string) => Promise<WorkspaceInfo>;
}

export function createBillingRouteContext(config: ServerConfig): BillingRouteContext {
  const billingConfig = resolveBillingProviderConfigFromEnv(process.env);
  const provider = createBillingProvider(billingConfig);
  return { provider, config };
}

export function addBillingRoutes(addRoute: RouteAdder, ctx: BillingRouteContext): void {
  const { provider } = ctx;

  addRoute("GET", "/api/billing/plans", "client", async () => {
    return jsonResponse(buildBillingPlansResponse(provider.config));
  });

  addRoute("GET", "/api/billing/status", "client", async () => {
    return jsonResponse(buildBillingStatusResponse(provider.config));
  });

  addRoute("GET", "/workspace/:id/billing/status", "client", async (routeCtx) => {
    if (!ctx.resolveWorkspace) {
      return jsonResponse(buildBillingStatusResponse(provider.config));
    }
    const workspace = await ctx.resolveWorkspace(ctx.config, routeCtx.params.id);
    const accountStore = new MatterhornBillingAccountStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const account = await accountStore.get();
    const [images, drafts] = await Promise.all([
      new MatterhornGeneratedImageStore({ workspaceRoot: workspace.path, workspaceId: workspace.id }).list(),
      new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id }).list(),
    ]);
    const usage = {
      generatedImages: images.length,
      nftDrafts: drafts.length,
      teamMembers: 1,
      cloudStorageBytes: 0,
    };
    if (account) {
      return jsonResponse(buildBillingStatusResponseForSubscription(provider.config, account.subscription, usage));
    }
    return jsonResponse(buildBillingStatusResponseWithUsage(provider.config, usage));
  });

  addRoute("POST", "/workspace/:id/billing/checkout", "client", async (routeCtx) => {
    const blocker = billingWriteBlocker(routeCtx, "start checkout");
    if (blocker) return blocker;
    if (!ctx.resolveWorkspace) {
      return badRequest("workspace_unavailable", "Workspace billing is unavailable for this server.");
    }
    if (provider.config.mode === "live") {
      return badRequest("live_payments_disabled", "Live payments are not enabled.");
    }
    if (provider.config.livePaymentsEnabled) {
      return badRequest("live_payments_disabled", "Live payments are not enabled.");
    }
    const input = await jsonBody<Partial<MatterhornBillingCheckoutRequest>>(routeCtx.request);
    if (!input.planId || (input.planId !== "free" && input.planId !== "plus" && input.planId !== "max")) {
      return badRequest("invalid_plan", "A valid planId is required.");
    }
    const workspace = await ctx.resolveWorkspace(ctx.config, routeCtx.params.id);
    const result = await provider.buildCheckout({
      planId: input.planId,
      interval: input.interval === "year" ? "year" : "month",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    const period = nextBillingPeriod();
    await new MatterhornBillingAccountStore({ workspaceRoot: workspace.path, workspaceId: workspace.id }).save({
      version: "matterhorn.billing.account.v1",
      workspaceId: workspace.id,
      subscription: {
        ...buildMatterhornBillingSubscription(input.planId),
        interval: input.interval === "year" ? "year" : "month",
        currentPeriodStart: period.currentPeriodStart,
        currentPeriodEnd: period.currentPeriodEnd,
        providerCustomerId: `mock_cus_${workspace.id}`,
        providerSubscriptionId: `mock_sub_${workspace.id}_${input.planId}`,
      },
      updatedAt: period.currentPeriodStart,
      source: provider.config.mode === "phase1_stripe_test" ? "stripe_test_checkout" : "mock_checkout",
    });
    return jsonResponse(result);
  });

  addRoute("POST", "/api/billing/checkout", "client", async (routeCtx) => {
    const blocker = billingWriteBlocker(routeCtx, "start checkout");
    if (blocker) return blocker;
    if (provider.config.mode === "live") {
      return badRequest("live_payments_disabled", "Live payments are not enabled.");
    }
    if (provider.config.livePaymentsEnabled) {
      return badRequest("live_payments_disabled", "Live payments are not enabled.");
    }
    const input = await jsonBody<Partial<MatterhornBillingCheckoutRequest>>(routeCtx.request);
    if (!input.planId || (input.planId !== "free" && input.planId !== "plus" && input.planId !== "max")) {
      return badRequest("invalid_plan", "A valid planId is required.");
    }
    const result = await provider.buildCheckout({
      planId: input.planId,
      interval: input.interval === "year" ? "year" : "month",
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
    });
    return jsonResponse(result);
  });

  addRoute("POST", "/workspace/:id/billing/portal", "client", async (routeCtx) => {
    const blocker = billingWriteBlocker(routeCtx, "open the billing portal");
    if (blocker) return blocker;
    if (!ctx.resolveWorkspace) {
      return badRequest("workspace_unavailable", "Workspace billing is unavailable for this server.");
    }
    if (provider.config.mode === "live") {
      return badRequest("live_payments_disabled", "Live payments are not enabled.");
    }
    await ctx.resolveWorkspace(ctx.config, routeCtx.params.id);
    const input = await jsonBody<Partial<MatterhornBillingPortalRequest>>(routeCtx.request).catch(() => ({}));
    const result = await provider.buildPortal(input);
    return jsonResponse(result);
  });

  addRoute("DELETE", "/workspace/:id/billing/subscription", "client", async (routeCtx) => {
    const blocker = billingWriteBlocker(routeCtx, "clear workspace billing state");
    if (blocker) return blocker;
    if (!ctx.resolveWorkspace) {
      return badRequest("workspace_unavailable", "Workspace billing is unavailable for this server.");
    }
    const workspace = await ctx.resolveWorkspace(ctx.config, routeCtx.params.id);
    const deleted = await new MatterhornBillingAccountStore({
      workspaceRoot: workspace.path,
      workspaceId: workspace.id,
    }).delete();
    return jsonResponse({
      success: true,
      deleted,
      workspaceId: workspace.id,
      status: buildBillingStatusResponse(provider.config).status,
    });
  });

  addRoute("POST", "/api/billing/portal", "client", async (routeCtx) => {
    const blocker = billingWriteBlocker(routeCtx, "open the billing portal");
    if (blocker) return blocker;
    if (provider.config.mode === "live") {
      return badRequest("live_payments_disabled", "Live payments are not enabled.");
    }
    const input = await jsonBody<Partial<MatterhornBillingPortalRequest>>(routeCtx.request).catch(() => ({}));
    const result = await provider.buildPortal(input);
    return jsonResponse(result);
  });

  addRoute("POST", "/api/billing/webhook/stripe", "none", async (routeCtx) => {
    if (provider.config.mode === "live" || provider.config.provider !== "stripe") {
      return jsonResponse({ success: true, received: true, verified: false, livemode: false, handled: false });
    }
    const signature = routeCtx.request.headers.get("stripe-signature") ?? undefined;
    const payload = await routeCtx.request.json().catch(() => ({}));
    const input: MatterhornBillingWebhookStripeRequest = { signature, payload };
    const result = await provider.handleStripeWebhook(input);
    return jsonResponse(result);
  });
}
