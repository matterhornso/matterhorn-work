import { randomUUID } from "node:crypto";
import type {
  MatterhornBillingCheckoutRequest,
  MatterhornBillingPortalRequest,
  MatterhornBillingPendingCheckout,
  MatterhornBillingPendingCheckoutClearResponse,
  MatterhornBillingSubscription,
  MatterhornBillingWebhookStripeRequest,
} from "@matterhorn-work/types/billing";
import { recordAudit } from "./audit.js";
import {
  activeMatterhornBillingPendingCheckout,
  buildBillingPlansResponse,
  buildBillingStatusResponse,
  buildBillingStatusResponseForSubscription,
  buildBillingStatusResponseWithUsage,
  buildMatterhornBillingSubscription,
  billingUsagePeriodForSubscription,
  createBillingProvider,
  isBillingUsageTimestampInPeriod,
  resolveBillingProviderConfigFromEnv,
  type BillingProvider,
} from "./billing.js";
import { MatterhornBillingAccountStore } from "./billing-account-store.js";
import { MatterhornGeneratedImageStore } from "./generated-image-store.js";
import { MatterhornImageNftDraftStore } from "./image-nft-draft-store.js";
import type { Actor, ServerConfig, WorkspaceInfo } from "./types.js";

export type RouteAdder = (method: string, path: string, auth: "none" | "client" | "host" | "host-token", handler: RouteHandler) => void;
export type RouteHandler = (ctx: {
  request: Request;
  url: URL;
  params: Record<string, string>;
  config: ServerConfig;
  actor?: Actor;
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

function providerError(error: unknown): Response {
  return badRequest(
    "billing_provider_unavailable",
    error instanceof Error ? error.message : "Billing provider is unavailable.",
  );
}

function billingWriteBlocker(ctx: { config: ServerConfig; actor?: Pick<Actor, "scope"> }, action: string): Response | null {
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

async function recordBillingAudit(input: {
  workspace: WorkspaceInfo;
  actor?: Actor;
  action:
    | "workspace.billing.checkout"
    | "workspace.billing.pending_checkout.clear"
    | "workspace.billing.subscription.clear"
    | "workspace.billing.webhook";
  summary: string;
  planId?: "free" | "plus" | "max";
  interval?: "month" | "year";
  mode: string;
  provider: string;
  deleted?: boolean;
}): Promise<void> {
  await recordAudit(input.workspace.path, {
    id: randomUUID(),
    workspaceId: input.workspace.id,
    actor: input.actor ?? { type: "remote" },
    action: input.action,
    target: `billing:${input.workspace.id}`,
    summary: input.summary,
    timestamp: Date.now(),
    metadata: {
      planId: input.planId ?? null,
      interval: input.interval ?? null,
      mode: input.mode,
      provider: input.provider,
      deleted: input.deleted ?? null,
      livePaymentsEnabled: false,
    },
  });
}

async function persistStripeWebhookBilling(input: {
  result: Awaited<ReturnType<BillingProvider["handleStripeWebhook"]>>;
  ctx: BillingRouteContext;
}): Promise<boolean> {
  const { result, ctx } = input;
  if (!result.verified || !result.handled || !result.workspaceId || !result.planId || !ctx.resolveWorkspace) {
    return false;
  }
  let workspace: WorkspaceInfo;
  try {
    workspace = await ctx.resolveWorkspace(ctx.config, result.workspaceId);
  } catch {
    return false;
  }
  const now = new Date().toISOString();
  const status = result.subscriptionStatus ?? (result.planId === "free" ? "none" : "active");
  await new MatterhornBillingAccountStore({ workspaceRoot: workspace.path, workspaceId: workspace.id }).save({
    version: "matterhorn.billing.account.v1",
    workspaceId: workspace.id,
    subscription: {
      ...buildMatterhornBillingSubscription(result.planId),
      status,
      currentPeriodStart: result.currentPeriodStart ?? now,
      currentPeriodEnd: result.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: result.cancelAtPeriodEnd ?? false,
      providerCustomerId: result.providerCustomerId ?? null,
      providerSubscriptionId: result.providerSubscriptionId ?? null,
    },
    pendingCheckout: null,
    updatedAt: now,
    source: "stripe_test_webhook",
  });
  await recordBillingAudit({
    workspace,
    action: "workspace.billing.webhook",
    summary: `Synced Stripe test billing event for ${result.planId}.`,
    planId: result.planId,
    interval: "month",
    mode: providerModeForAudit(ctx.provider),
    provider: ctx.provider.config.provider,
  });
  return true;
}

function providerModeForAudit(provider: BillingProvider): string {
  return provider.config.mode;
}

export interface BillingRouteContext {
  provider: BillingProvider;
  config: ServerConfig;
  resolveWorkspace?: (config: ServerConfig, id: string) => Promise<WorkspaceInfo>;
  countTeamMembers?: (workspace: WorkspaceInfo) => Promise<number>;
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
    const [images, drafts, teamMembers] = await Promise.all([
      new MatterhornGeneratedImageStore({ workspaceRoot: workspace.path, workspaceId: workspace.id }).list(),
      new MatterhornImageNftDraftStore({ workspaceRoot: workspace.path, workspaceId: workspace.id }).list(),
      ctx.countTeamMembers ? ctx.countTeamMembers(workspace).catch(() => 1) : Promise.resolve(1),
    ]);
    const subscription = account?.subscription ?? buildMatterhornBillingSubscription(provider.config.currentPlanId);
    const usagePeriod = billingUsagePeriodForSubscription(subscription);
    const usage = {
      generatedImages: images.filter((image) => isBillingUsageTimestampInPeriod(image.createdAt, usagePeriod)).length,
      generatedImagesResetsAt: usagePeriod.resetsAt,
      nftDrafts: drafts.filter((draft) => isBillingUsageTimestampInPeriod(draft.createdAt, usagePeriod)).length,
      nftDraftsResetsAt: usagePeriod.resetsAt,
      teamMembers,
      cloudStorageBytes: 0,
    };
    if (account) {
      const pendingCheckout = activeMatterhornBillingPendingCheckout(account.pendingCheckout);
      return jsonResponse(buildBillingStatusResponseForSubscription(
        provider.config,
        subscription,
        usage,
        pendingCheckout,
        account.source,
        account.updatedAt,
      ));
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
    const interval = input.interval === "year" ? "year" : "month";
    const result = await provider.buildCheckout({
      planId: input.planId,
      interval,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      workspaceId: workspace.id,
    }).catch((error) => error);
    if (result instanceof Error) return providerError(result);
    const period = nextBillingPeriod();
    const accountStore = new MatterhornBillingAccountStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
    const existingAccount = await accountStore.get();
    const isStripeTestCheckout = provider.config.mode === "phase1_stripe_test" && provider.config.provider === "stripe";
    const pendingCheckout: MatterhornBillingPendingCheckout | null = isStripeTestCheckout
      ? {
          planId: input.planId,
          interval,
          provider: "stripe",
          mode: "stripe_test",
          providerSessionId: result.providerSessionId ?? null,
          createdAt: period.currentPeriodStart,
          expiresAt: result.expiresAt ?? null,
        }
      : null;
    const subscription: MatterhornBillingSubscription = isStripeTestCheckout
      ? existingAccount?.subscription ?? buildMatterhornBillingSubscription(provider.config.currentPlanId)
      : {
          ...buildMatterhornBillingSubscription(input.planId),
          interval,
          currentPeriodStart: period.currentPeriodStart,
          currentPeriodEnd: period.currentPeriodEnd,
          providerCustomerId: `mock_cus_${workspace.id}`,
          providerSubscriptionId: `mock_sub_${workspace.id}_${input.planId}`,
        };
    await accountStore.save({
      version: "matterhorn.billing.account.v1",
      workspaceId: workspace.id,
      subscription,
      pendingCheckout,
      updatedAt: period.currentPeriodStart,
      source: isStripeTestCheckout ? "stripe_test_checkout" : "mock_checkout",
    });
    await recordBillingAudit({
      workspace,
      actor: routeCtx.actor,
      action: "workspace.billing.checkout",
      summary: isStripeTestCheckout
        ? `Started Stripe test checkout for ${input.planId}.`
        : `Updated workspace billing plan to ${input.planId}.`,
      planId: input.planId,
      interval,
      mode: provider.config.mode,
      provider: provider.config.provider,
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
    }).catch((error) => error);
    if (result instanceof Error) return providerError(result);
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
    const workspace = await ctx.resolveWorkspace(ctx.config, routeCtx.params.id);
    const account = await new MatterhornBillingAccountStore({
      workspaceRoot: workspace.path,
      workspaceId: workspace.id,
    }).get();
    const input = await jsonBody<Partial<MatterhornBillingPortalRequest>>(routeCtx.request)
      .catch((): Partial<MatterhornBillingPortalRequest> => ({}));
    const result = await provider.buildPortal({
      ...input,
      providerCustomerId: input.providerCustomerId ?? account?.subscription.providerCustomerId ?? undefined,
    }).catch((error) => error);
    if (result instanceof Error) return providerError(result);
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
    await recordBillingAudit({
      workspace,
      actor: routeCtx.actor,
      action: "workspace.billing.subscription.clear",
      summary: deleted
        ? "Cleared the workspace billing subscription override."
        : "Workspace billing subscription override was already clear.",
      mode: provider.config.mode,
      provider: provider.config.provider,
      deleted,
    });
    return jsonResponse({
      success: true,
      deleted,
      workspaceId: workspace.id,
      status: buildBillingStatusResponse(provider.config).status,
    });
  });

  addRoute("DELETE", "/workspace/:id/billing/pending-checkout", "client", async (routeCtx) => {
    const blocker = billingWriteBlocker(routeCtx, "clear pending checkout");
    if (blocker) return blocker;
    if (!ctx.resolveWorkspace) {
      return badRequest("workspace_unavailable", "Workspace billing is unavailable for this server.");
    }
    const workspace = await ctx.resolveWorkspace(ctx.config, routeCtx.params.id);
    const accountStore = new MatterhornBillingAccountStore({
      workspaceRoot: workspace.path,
      workspaceId: workspace.id,
    });
    const account = await accountStore.get();
    const pendingCheckout = account?.pendingCheckout ?? null;
    const cleared = Boolean(account && pendingCheckout);
    const subscription = account?.subscription ?? buildMatterhornBillingSubscription(provider.config.currentPlanId);
    if (account && pendingCheckout) {
      await accountStore.save({
        ...account,
        pendingCheckout: null,
        updatedAt: new Date().toISOString(),
      });
    }
    await recordBillingAudit({
      workspace,
      actor: routeCtx.actor,
      action: "workspace.billing.pending_checkout.clear",
      summary: cleared
        ? "Cleared the pending Stripe test checkout."
        : "Pending Stripe test checkout was already clear.",
      planId: pendingCheckout?.planId ?? undefined,
      interval: pendingCheckout?.interval ?? undefined,
      mode: provider.config.mode,
      provider: provider.config.provider,
      deleted: cleared,
    });
    const response: MatterhornBillingPendingCheckoutClearResponse = {
      success: true,
      cleared,
      workspaceId: workspace.id,
      status: buildBillingStatusResponseForSubscription(
        provider.config,
        subscription,
        undefined,
        null,
        account?.source ?? "env_default",
        account?.updatedAt ?? null,
      ).status,
    };
    return jsonResponse(response);
  });

  addRoute("POST", "/api/billing/portal", "client", async (routeCtx) => {
    const blocker = billingWriteBlocker(routeCtx, "open the billing portal");
    if (blocker) return blocker;
    if (provider.config.mode === "live") {
      return badRequest("live_payments_disabled", "Live payments are not enabled.");
    }
    const input = await jsonBody<Partial<MatterhornBillingPortalRequest>>(routeCtx.request)
      .catch((): Partial<MatterhornBillingPortalRequest> => ({}));
    const result = await provider.buildPortal(input).catch((error) => error);
    if (result instanceof Error) return providerError(result);
    return jsonResponse(result);
  });

  addRoute("POST", "/api/billing/webhook/stripe", "none", async (routeCtx) => {
    if (provider.config.mode === "live" || provider.config.provider !== "stripe") {
      return jsonResponse({ success: true, received: true, verified: false, livemode: false, handled: false });
    }
    const signature = routeCtx.request.headers.get("stripe-signature") ?? undefined;
    const rawPayload = await routeCtx.request.text().catch(() => "");
    let payload: unknown = {};
    try {
      payload = rawPayload ? JSON.parse(rawPayload) : {};
    } catch {
      payload = {};
    }
    const input: MatterhornBillingWebhookStripeRequest = { signature, payload, rawPayload };
    const result = await provider.handleStripeWebhook(input);
    const workspaceSynced = await persistStripeWebhookBilling({ result, ctx });
    return jsonResponse({
      ...result,
      handled: result.handled && (workspaceSynced || !result.workspaceId),
      workspaceSynced,
    });
  });
}
