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
  effectiveMatterhornBillingSubscription,
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

function payloadTooLarge(message: string): Response {
  return jsonResponse({ success: false, code: "payload_too_large", message }, 413);
}

const BILLING_MUTATION_BODY_MAX_BYTES = 16_384;
const STRIPE_WEBHOOK_BODY_MAX_BYTES = 262_144;

async function readBodyTextLimited(request: Request, maxBytes: number, label: string): Promise<string | Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return payloadTooLarge(`${label} payload is too large.`);
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return payloadTooLarge(`${label} payload is too large.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function jsonBody<T>(
  request: Request,
  options: { maxBytes?: number; optional?: boolean; label?: string } = {},
): Promise<T | Response> {
  const text = await readBodyTextLimited(
    request,
    options.maxBytes ?? BILLING_MUTATION_BODY_MAX_BYTES,
    options.label ?? "Billing request",
  );
  if (text instanceof Response) return text;
  if (options.optional && !text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return badRequest("invalid_json", "Billing request body is not valid JSON.");
  }
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

type BillingCheckoutPlanId = MatterhornBillingCheckoutRequest["planId"];

function isBillingCheckoutPlanId(planId: unknown): planId is BillingCheckoutPlanId {
  return planId === "free" || planId === "plus" || planId === "max";
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

type StripeWebhookPersistence = {
  accepted: boolean;
  synced: boolean;
  mutation:
    | "synced"
    | "duplicate_event"
    | "stale_event"
    | "checkout_mismatch"
    | "subscription_mismatch"
    | "not_handled";
};

async function persistStripeWebhookBilling(input: {
  result: Awaited<ReturnType<BillingProvider["handleStripeWebhook"]>>;
  ctx: BillingRouteContext;
}): Promise<StripeWebhookPersistence> {
  const { result, ctx } = input;
  if (!result.verified || !result.handled || !result.workspaceId || !result.planId || !ctx.resolveWorkspace) {
    return { accepted: false, synced: false, mutation: "not_handled" };
  }
  const planId = result.planId;
  let workspace: WorkspaceInfo;
  try {
    workspace = await ctx.resolveWorkspace(ctx.config, result.workspaceId);
  } catch {
    return { accepted: false, synced: false, mutation: "not_handled" };
  }
  const accountStore = new MatterhornBillingAccountStore({ workspaceRoot: workspace.path, workspaceId: workspace.id });
  const persistence = await accountStore.mutate<StripeWebhookPersistence>((existingAccount) => {
    const processedEventIds = existingAccount?.processedProviderEventIds ?? [];
    if (
      result.eventId &&
      (existingAccount?.lastProviderEventId === result.eventId ||
        processedEventIds.includes(result.eventId))
    ) {
      return {
        result: { accepted: true, synced: false, mutation: "duplicate_event" },
      };
    }
    const pendingCheckout = activeMatterhornBillingPendingCheckout(existingAccount?.pendingCheckout);
    if (result.eventType === "checkout.session.completed") {
      const checkoutSessionId = result.providerCheckoutSessionId ?? null;
      const pendingSessionId = pendingCheckout?.providerSessionId ?? null;
      if (
        !pendingCheckout ||
        pendingCheckout.provider !== "stripe" ||
        pendingCheckout.mode !== "stripe_test" ||
        pendingCheckout.planId !== planId ||
        (pendingSessionId ? pendingSessionId !== checkoutSessionId : Boolean(checkoutSessionId))
      ) {
        return {
          result: { accepted: false, synced: false, mutation: "checkout_mismatch" },
        };
      }
    }
    if (
      result.eventType === "customer.subscription.created" ||
      result.eventType === "customer.subscription.updated" ||
      result.eventType === "customer.subscription.deleted"
    ) {
      const existingSubscription = existingAccount?.subscription;
      const existingProviderSubscriptionId = existingSubscription?.providerSubscriptionId ?? null;
      const existingProviderCustomerId = existingSubscription?.providerCustomerId ?? null;
      const incomingProviderSubscriptionId = result.providerSubscriptionId ?? null;
      const incomingProviderCustomerId = result.providerCustomerId ?? null;
      if (!existingAccount || !existingProviderSubscriptionId || !existingProviderCustomerId) {
        return {
          result: { accepted: false, synced: false, mutation: "subscription_mismatch" },
        };
      }
      if (
        incomingProviderSubscriptionId !== existingProviderSubscriptionId ||
        incomingProviderCustomerId !== existingProviderCustomerId
      ) {
        return {
          result: { accepted: false, synced: false, mutation: "subscription_mismatch" },
        };
      }
    }
    const incomingCreatedAt = result.eventCreatedAt ? Date.parse(result.eventCreatedAt) : NaN;
    const previousCreatedAt = existingAccount?.lastProviderEventCreatedAt
      ? Date.parse(existingAccount.lastProviderEventCreatedAt)
      : NaN;
    if (
      Number.isFinite(incomingCreatedAt) &&
      Number.isFinite(previousCreatedAt) &&
      incomingCreatedAt < previousCreatedAt
    ) {
      return {
        result: { accepted: true, synced: false, mutation: "stale_event" },
      };
    }

    const now = new Date().toISOString();
    const status = result.subscriptionStatus ?? (planId === "free" ? "none" : "active");
    const fallbackPeriod = nextBillingPeriod(
      result.eventCreatedAt ? new Date(result.eventCreatedAt) : new Date(),
    );
    const nextProcessedEventIds = [
      ...(processedEventIds.filter((id) => id !== result.eventId)),
      ...(result.eventId ? [result.eventId] : []),
    ].slice(-50);
    return {
      snapshot: {
        version: "matterhorn.billing.account.v1",
        workspaceId: workspace.id,
        subscription: {
          ...buildMatterhornBillingSubscription(planId),
          status,
          currentPeriodStart: result.currentPeriodStart ?? fallbackPeriod.currentPeriodStart,
          currentPeriodEnd:
            result.currentPeriodEnd ??
            (planId === "free" ? null : fallbackPeriod.currentPeriodEnd),
          cancelAtPeriodEnd: result.cancelAtPeriodEnd ?? false,
          providerCustomerId: result.providerCustomerId ?? null,
          providerSubscriptionId: result.providerSubscriptionId ?? null,
        },
        pendingCheckout: null,
        updatedAt: now,
        source: "stripe_test_webhook",
        lastProviderEventId: result.eventId ?? null,
        lastProviderEventType: result.eventType ?? null,
        lastProviderEventCreatedAt:
          result.eventCreatedAt ?? existingAccount?.lastProviderEventCreatedAt ?? null,
        lastProviderSyncedAt: now,
        processedProviderEventIds: nextProcessedEventIds,
      },
      result: { accepted: true, synced: true, mutation: "synced" },
    };
  });
  if (!persistence.synced) return persistence;
  await recordBillingAudit({
    workspace,
    action: "workspace.billing.webhook",
    summary: `Synced Stripe test billing event for ${planId}.`,
    planId,
    interval: "month",
    mode: providerModeForAudit(ctx.provider),
    provider: ctx.provider.config.provider,
  });
  return persistence;
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

  async function startWorkspaceCheckout(
    routeCtx: Parameters<RouteHandler>[0],
    workspaceId: string,
    input: Partial<MatterhornBillingCheckoutRequest>,
  ): Promise<Response> {
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
    if (!isBillingCheckoutPlanId(input.planId)) {
      return badRequest("invalid_plan", "A valid planId is required.");
    }
    const workspace = await ctx.resolveWorkspace(ctx.config, workspaceId);
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
    const pendingCheckout: MatterhornBillingPendingCheckout = {
      planId: input.planId,
      interval,
      provider: isStripeTestCheckout ? "stripe" : "mock",
      mode: isStripeTestCheckout ? "stripe_test" : "mock",
      providerSessionId: result.providerSessionId ?? null,
      createdAt: period.currentPeriodStart,
      expiresAt: result.expiresAt ?? null,
    };
    const subscription: MatterhornBillingSubscription =
      existingAccount?.subscription ?? buildMatterhornBillingSubscription(provider.config.currentPlanId);
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
        : `Started local billing preview checkout for ${input.planId}.`,
      planId: input.planId,
      interval,
      mode: provider.config.mode,
      provider: provider.config.provider,
    });
    return jsonResponse(result);
  }

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
    const storedSubscription = account?.subscription ?? buildMatterhornBillingSubscription(provider.config.currentPlanId);
    const subscription = effectiveMatterhornBillingSubscription(storedSubscription);
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
    const input = await jsonBody<Partial<MatterhornBillingCheckoutRequest>>(routeCtx.request, {
      label: "Workspace billing checkout",
    });
    if (input instanceof Response) return input;
    return startWorkspaceCheckout(routeCtx, routeCtx.params.id, input);
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
    const input = await jsonBody<Partial<MatterhornBillingCheckoutRequest>>(routeCtx.request, {
      label: "Billing checkout",
    });
    if (input instanceof Response) return input;
    if (!isBillingCheckoutPlanId(input.planId)) {
      return badRequest("invalid_plan", "A valid planId is required.");
    }
    const workspaceId = input.workspaceId?.trim();
    if (!workspaceId) {
      return badRequest(
        "workspace_required",
        "Billing checkout must be started from a workspace so the subscription can be reconciled.",
      );
    }
    return startWorkspaceCheckout(routeCtx, workspaceId, input);
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
    const input = await jsonBody<Partial<MatterhornBillingPortalRequest>>(routeCtx.request, {
      optional: true,
      label: "Workspace billing portal",
    });
    if (input instanceof Response) return input;
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
    const subscription = effectiveMatterhornBillingSubscription(
      account?.subscription ?? buildMatterhornBillingSubscription(provider.config.currentPlanId),
    );
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
    const input = await jsonBody<Partial<MatterhornBillingPortalRequest>>(routeCtx.request, {
      optional: true,
      label: "Billing portal",
    });
    if (input instanceof Response) return input;
    const result = await provider.buildPortal(input).catch((error) => error);
    if (result instanceof Error) return providerError(result);
    return jsonResponse(result);
  });

  addRoute("POST", "/api/billing/webhook/stripe", "none", async (routeCtx) => {
    if (provider.config.mode === "live" || provider.config.provider !== "stripe") {
      return jsonResponse({ success: true, received: true, verified: false, livemode: false, handled: false });
    }
    const blocker = billingWriteBlocker(routeCtx, "process Stripe webhook");
    if (blocker) return blocker;
    const signature = routeCtx.request.headers.get("stripe-signature") ?? undefined;
    const rawPayloadResult = await readBodyTextLimited(
      routeCtx.request,
      STRIPE_WEBHOOK_BODY_MAX_BYTES,
      "Stripe webhook",
    );
    if (rawPayloadResult instanceof Response) return rawPayloadResult;
    const rawPayload = rawPayloadResult;
    let payload: unknown = {};
    try {
      payload = rawPayload ? JSON.parse(rawPayload) : {};
    } catch {
      payload = {};
    }
    const input: MatterhornBillingWebhookStripeRequest = { signature, payload, rawPayload };
    const result = await provider.handleStripeWebhook(input);
    const persistence = await persistStripeWebhookBilling({ result, ctx });
    return jsonResponse({
      ...result,
      handled: result.handled && (persistence.accepted || !result.workspaceId),
      workspaceSynced: persistence.synced,
      webhookMutation: persistence.mutation,
    });
  });
}
