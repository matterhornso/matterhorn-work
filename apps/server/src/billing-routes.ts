import type {
  MatterhornBillingCheckoutRequest,
  MatterhornBillingPortalRequest,
  MatterhornBillingWebhookStripeRequest,
} from "@matterhorn-work/types/billing";
import {
  buildBillingPlansResponse,
  buildBillingStatusResponse,
  createBillingProvider,
  resolveBillingProviderConfigFromEnv,
  type BillingProvider,
} from "./billing.js";
import type { ServerConfig, TokenScope } from "./types.js";

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

export interface BillingRouteContext {
  provider: BillingProvider;
  config: ServerConfig;
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
