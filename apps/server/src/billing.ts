import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  MatterhornBillingCapability,
  MatterhornBillingCheckoutRequest,
  MatterhornBillingCheckoutResponse,
  MatterhornBillingInterval,
  MatterhornBillingMode,
  MatterhornBillingPlan,
  MatterhornBillingPlanId,
  MatterhornBillingPlansResponse,
  MatterhornBillingPortalRequest,
  MatterhornBillingPortalResponse,
  MatterhornBillingProvider,
  MatterhornBillingSetup,
  MatterhornBillingSetupCheck,
  MatterhornBillingStatus,
  MatterhornBillingStatusResponse,
  MatterhornBillingSubscription,
  MatterhornBillingUsageSnapshot,
  MatterhornBillingWebhookStripeRequest,
  MatterhornBillingWebhookStripeResponse,
  MatterhornEntitlement,
  MatterhornEntitlementKey,
} from "@matterhorn-work/types/billing";

export interface BillingProviderConfig {
  mode: MatterhornBillingMode;
  provider: MatterhornBillingProvider;
  currentPlanId: MatterhornBillingPlanId;
  stripeWebhookSecret?: string;
  stripeSecretKey?: string;
  stripeApiBaseUrl?: string;
  stripeTestCustomerId?: string;
  stripePriceIds?: Partial<Record<MatterhornBillingPlanId, string>>;
  livePaymentsEnabled: false;
}

export interface BillingProvider {
  config: BillingProviderConfig;
  plans(): MatterhornBillingPlan[];
  status(): MatterhornBillingStatus;
  buildCheckout(input: MatterhornBillingCheckoutRequest): Promise<MatterhornBillingCheckoutResponse>;
  buildPortal(input?: MatterhornBillingPortalRequest): Promise<MatterhornBillingPortalResponse>;
  handleStripeWebhook(input: MatterhornBillingWebhookStripeRequest): Promise<MatterhornBillingWebhookStripeResponse>;
}

export type BillingUsageCounts = Partial<{
  generatedImages: number;
  generatedImagesResetsAt: string | null;
  nftDrafts: number;
  nftDraftsResetsAt: string | null;
  teamMembers: number;
  cloudStorageBytes: number;
}>;

export type BillingEntitlementCheck =
  | {
      allowed: true;
      key: MatterhornEntitlementKey;
      label: string;
      planId: MatterhornBillingPlanId;
      used: number;
      limit: number | null;
      allowedPlanIds: MatterhornBillingPlanId[];
    }
  | {
      allowed: false;
      key: MatterhornEntitlementKey;
      label: string;
      planId: MatterhornBillingPlanId;
      used: number;
      limit: number | null;
      allowedPlanIds: MatterhornBillingPlanId[];
      reason: "not_included" | "limit_reached";
    };

export interface BillingUsagePeriod {
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  resetsAt: string | null;
}

const ENTITLEMENT_ORDER: MatterhornEntitlementKey[] = [
  "image_generation",
  "image_editing",
  "nft_mint_preview",
  "nft_marketplace_listing",
  "walrus_storage",
  "cloud_sync",
  "team_members",
  "memory_global_scope",
  "priority_support",
  "api_access",
  "extended_outputs",
];

const ENTITLEMENT_LABELS: Record<MatterhornEntitlementKey, { label: string; description: string }> = {
  image_generation: { label: "Image generation", description: "Generate images from chat prompts." },
  image_editing: { label: "Image editing", description: "Edit generated images with prompts." },
  nft_mint_preview: { label: "NFT mint previews", description: "Prepare Sui NFT mint transactions." },
  nft_marketplace_listing: { label: "NFT marketplace listing", description: "List NFTs on a Sui marketplace via Kiosk." },
  walrus_storage: { label: "Walrus storage", description: "Upload images and metadata to Walrus." },
  cloud_sync: { label: "Cloud sync", description: "Sync workspace data across devices with Matterhorn Cloud." },
  team_members: { label: "Team members", description: "Share a workspace with collaborators." },
  memory_global_scope: { label: "Global memory scope", description: "Opt into cross-workspace memory tags." },
  priority_support: { label: "Priority support", description: "Faster responses from the Matterhorn team." },
  api_access: { label: "API access", description: "Programmatic access to Matterhorn endpoints." },
  extended_outputs: { label: "Extended outputs", description: "Higher output storage and longer retention." },
};

function planLimit(planId: MatterhornBillingPlanId, key: MatterhornEntitlementKey): number | null {
  const map: Record<MatterhornBillingPlanId, Partial<Record<MatterhornEntitlementKey, number | null>>> = {
    free: {
      image_generation: 10,
      image_editing: 0,
      nft_mint_preview: 0,
      nft_marketplace_listing: 0,
      walrus_storage: 0,
      cloud_sync: 0,
      team_members: 1,
      memory_global_scope: 0,
      priority_support: 0,
      api_access: 0,
      extended_outputs: 0,
    },
    plus: {
      image_generation: 100,
      image_editing: 50,
      nft_mint_preview: 20,
      nft_marketplace_listing: 0,
      walrus_storage: 0,
      cloud_sync: 0,
      team_members: 1,
      memory_global_scope: 0,
      priority_support: 0,
      api_access: 0,
      extended_outputs: 1,
    },
    max: {
      image_generation: null,
      image_editing: null,
      nft_mint_preview: null,
      nft_marketplace_listing: null,
      walrus_storage: null,
      cloud_sync: null,
      team_members: 10,
      memory_global_scope: null,
      priority_support: 1,
      api_access: 1,
      extended_outputs: null,
    },
  };
  const value = map[planId][key];
  return value === undefined ? 0 : value;
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function currentCalendarBillingPeriod(now = new Date()): BillingUsagePeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return {
    currentPeriodStart: start.toISOString(),
    currentPeriodEnd: end.toISOString(),
    resetsAt: end.toISOString(),
  };
}

export function billingUsagePeriodForSubscription(
  subscription: MatterhornBillingSubscription | null | undefined,
  now = new Date(),
): BillingUsagePeriod {
  const fallback = currentCalendarBillingPeriod(now);
  const start = validDate(subscription?.currentPeriodStart);
  const end = validDate(subscription?.currentPeriodEnd);
  if (!start) return fallback;
  return {
    currentPeriodStart: start.toISOString(),
    currentPeriodEnd: end ? end.toISOString() : null,
    resetsAt: end ? end.toISOString() : null,
  };
}

export function isBillingUsageTimestampInPeriod(timestamp: string | null | undefined, period: BillingUsagePeriod): boolean {
  const value = validDate(timestamp);
  if (!value) return false;
  const start = validDate(period.currentPeriodStart);
  const end = validDate(period.currentPeriodEnd);
  if (start && value.getTime() < start.getTime()) return false;
  if (end && value.getTime() >= end.getTime()) return false;
  return true;
}

function setupCheck(input: MatterhornBillingSetupCheck): MatterhornBillingSetupCheck {
  return input;
}

export function buildMatterhornBillingSetup(config: BillingProviderConfig): MatterhornBillingSetup {
  if (config.mode === "phase0_mock" || config.provider === "mock") {
    return {
      mode: config.mode,
      provider: config.provider,
      readyForTestCheckout: true,
      readyForWebhooks: false,
      livePaymentsEnabled: false,
      checks: [
        setupCheck({
          id: "mock_mode",
          label: "Mock checkout",
          status: "preview",
          description: "Plan changes are local test state only. No payment provider is contacted.",
        }),
        setupCheck({
          id: "live_payments_disabled",
          label: "Live payments",
          status: "working",
          description: "Live payments are disabled in this build.",
        }),
      ],
    };
  }

  const hasSecretKey = Boolean(config.stripeSecretKey?.trim());
  const hasWebhookSecret = Boolean(config.stripeWebhookSecret?.trim());
  const hasPlusPrice = Boolean(config.stripePriceIds?.plus?.trim());
  const hasMaxPrice = Boolean(config.stripePriceIds?.max?.trim());
  const secretKeyIsTest = Boolean(config.stripeSecretKey?.trim().startsWith("sk_test_"));
  const readyForTestCheckout = config.mode === "phase1_stripe_test" && hasSecretKey && secretKeyIsTest && hasPlusPrice && hasMaxPrice;
  const hasTestCustomer = Boolean(config.stripeTestCustomerId?.trim());

  return {
    mode: config.mode,
    provider: config.provider,
    readyForTestCheckout,
    readyForWebhooks: config.mode === "phase1_stripe_test" && hasWebhookSecret,
    livePaymentsEnabled: false,
    checks: [
      setupCheck({
        id: "stripe_secret_key",
        label: "Stripe secret key",
        status: hasSecretKey && secretKeyIsTest ? "working" : "needs_setup",
        description: hasSecretKey
          ? secretKeyIsTest
            ? "Configured for test-mode billing calls."
            : "Use a Stripe test secret key. Live keys are not accepted in this build."
          : "Set MATTERHORN_STRIPE_SECRET_KEY for Stripe test checkout.",
      }),
      setupCheck({
        id: "stripe_webhook_secret",
        label: "Stripe webhook secret",
        status: hasWebhookSecret ? "working" : "needs_setup",
        description: hasWebhookSecret ? "Configured for test webhook verification." : "Set MATTERHORN_STRIPE_WEBHOOK_SECRET before syncing subscription webhooks.",
      }),
      setupCheck({
        id: "stripe_plus_price",
        label: "Plus price",
        status: hasPlusPrice ? "working" : "needs_setup",
        description: hasPlusPrice ? "Stripe test price is configured for Matterhorn Plus." : "Set MATTERHORN_STRIPE_PRICE_ID_PLUS.",
      }),
      setupCheck({
        id: "stripe_max_price",
        label: "Max price",
        status: hasMaxPrice ? "working" : "needs_setup",
        description: hasMaxPrice ? "Stripe test price is configured for Matterhorn Max." : "Set MATTERHORN_STRIPE_PRICE_ID_MAX.",
      }),
      setupCheck({
        id: "stripe_test_customer",
        label: "Customer portal test customer",
        status: hasTestCustomer ? "working" : "needs_setup",
        description: hasTestCustomer
          ? "Stripe test customer is configured for Customer Portal sessions."
          : "Set MATTERHORN_STRIPE_TEST_CUSTOMER_ID to open Customer Portal sessions in test mode.",
      }),
      setupCheck({
        id: "live_payments_disabled",
        label: "Live payments",
        status: "working",
        description: "Live payments are disabled even when Stripe test configuration is present.",
      }),
    ],
  };
}

export function buildPlanEntitlements(planId: MatterhornBillingPlanId): MatterhornEntitlement[] {
  return ENTITLEMENT_ORDER.map((key) => {
    const limit = planLimit(planId, key);
    return {
      key,
      ...ENTITLEMENT_LABELS[key],
      included: limit === null || limit > 0,
      limit,
      softLimit: planId === "free" && key === "image_generation",
    };
  });
}

export function buildMatterhornBillingPlans(): MatterhornBillingPlan[] {
  return [
    {
      id: "free",
      name: "Free",
      tagline: "Local-first notes, memory, and chat.",
      price: { amountCents: 0, currency: "USD", interval: "month" },
      ctaLabel: "Current plan",
      entitlements: buildPlanEntitlements("free"),
    },
    {
      id: "plus",
      name: "Matterhorn Plus",
      tagline: "Generate images and create NFT drafts.",
      price: { amountCents: 999, currency: "USD", interval: "month" },
      ctaLabel: "Upgrade to Plus",
      popular: true,
      entitlements: buildPlanEntitlements("plus"),
    },
    {
      id: "max",
      name: "Matterhorn Max",
      tagline: "Unlimited creation, cloud sync, and teams.",
      price: { amountCents: 8999, currency: "USD", interval: "month" },
      ctaLabel: "Upgrade to Max",
      entitlements: buildPlanEntitlements("max"),
    },
  ];
}

export function buildMatterhornBillingSubscription(planId: MatterhornBillingPlanId): MatterhornBillingSubscription {
  return {
    planId,
    status: planId === "free" ? "none" : "active",
    interval: "month",
    cancelAtPeriodEnd: false,
  };
}

export function buildMatterhornBillingUsageSnapshot(): MatterhornBillingUsageSnapshot {
  return {
    generatedImages: { used: 0, limit: planLimit("free", "image_generation"), resetsAt: null },
    nftDrafts: { used: 0, limit: planLimit("free", "nft_mint_preview"), resetsAt: null },
    teamMembers: { used: 1, limit: planLimit("free", "team_members") },
    cloudStorageBytes: { used: 0, limit: null },
  };
}

export function buildMatterhornBillingUsageSnapshotForPlan(
  planId: MatterhornBillingPlanId,
  usage?: BillingUsageCounts,
): MatterhornBillingUsageSnapshot {
  return {
    generatedImages: {
      used: usage?.generatedImages ?? 0,
      limit: planLimit(planId, "image_generation"),
      resetsAt: usage?.generatedImagesResetsAt ?? null,
    },
    nftDrafts: {
      used: usage?.nftDrafts ?? 0,
      limit: planLimit(planId, "nft_mint_preview"),
      resetsAt: usage?.nftDraftsResetsAt ?? null,
    },
    teamMembers: {
      used: usage?.teamMembers ?? 1,
      limit: planLimit(planId, "team_members"),
    },
    cloudStorageBytes: {
      used: usage?.cloudStorageBytes ?? 0,
      limit: null,
    },
  };
}

export function checkMatterhornBillingEntitlement(
  config: BillingProviderConfig,
  key: MatterhornEntitlementKey,
  used: number,
): BillingEntitlementCheck {
  const planId = config.currentPlanId;
  const limit = planLimit(planId, key);
  const allowedPlanIds = (["free", "plus", "max"] as MatterhornBillingPlanId[])
    .filter((candidatePlanId) => {
      const candidateLimit = planLimit(candidatePlanId, key);
      return candidateLimit === null || candidateLimit > 0;
    });
  const label = ENTITLEMENT_LABELS[key].label;

  if (limit === null) {
    return { allowed: true, key, label, planId, used, limit, allowedPlanIds };
  }
  if (limit === 0) {
    return { allowed: false, key, label, planId, used, limit, allowedPlanIds, reason: "not_included" };
  }
  if (used >= limit) {
    return { allowed: false, key, label, planId, used, limit, allowedPlanIds, reason: "limit_reached" };
  }
  return { allowed: true, key, label, planId, used, limit, allowedPlanIds };
}

export function buildMatterhornBillingStatus(planId: MatterhornBillingPlanId, config: BillingProviderConfig): MatterhornBillingStatus {
  return {
    mode: config.mode,
    provider: config.provider,
    subscription: buildMatterhornBillingSubscription(planId),
    usage: buildMatterhornBillingUsageSnapshotForPlan(planId),
    setup: buildMatterhornBillingSetup(config),
    isLivePaymentsEnabled: false,
  };
}

export function buildMatterhornBillingStatusWithUsage(
  planId: MatterhornBillingPlanId,
  config: BillingProviderConfig,
  usage?: BillingUsageCounts,
): MatterhornBillingStatus {
  return {
    ...buildMatterhornBillingStatus(planId, config),
    usage: buildMatterhornBillingUsageSnapshotForPlan(planId, usage),
  };
}

export function buildMatterhornBillingStatusForSubscription(
  subscription: MatterhornBillingSubscription,
  config: BillingProviderConfig,
  usage?: BillingUsageCounts,
): MatterhornBillingStatus {
  return {
    mode: config.mode,
    provider: config.provider,
    subscription,
    usage: buildMatterhornBillingUsageSnapshotForPlan(subscription.planId, usage),
    setup: buildMatterhornBillingSetup(config),
    isLivePaymentsEnabled: false,
  };
}

export function buildMatterhornBillingCapability(config: BillingProviderConfig): MatterhornBillingCapability {
  const setup = buildMatterhornBillingSetup(config);
  const checkoutSupported = config.mode === "phase0_mock" || setup.readyForTestCheckout;
  const portalSupported = checkoutSupported;
  const stripeSetupNeedsWork = config.provider === "stripe" && !setup.readyForTestCheckout;
  return {
    status: config.mode === "phase0_mock" ? "preview" : stripeSetupNeedsWork ? "needs_setup" : config.mode === "phase1_stripe_test" ? "working" : "needs_setup",
    label: "Billing",
    description:
      config.mode === "phase0_mock"
        ? "Billing is in mock mode. No real charges are processed."
        : config.mode === "phase1_stripe_test" && !stripeSetupNeedsWork
          ? "Billing is in Stripe test mode. No live charges are processed."
          : config.mode === "phase1_stripe_test"
            ? "Stripe test billing needs setup. No live charges are processed."
        : "Live payments are not enabled.",
    mode: config.mode,
    provider: config.provider,
    currentPlanId: config.currentPlanId,
    isLivePaymentsEnabled: false,
    checkoutSupported,
    portalSupported,
    setup,
    details: {
      livePaymentsEnabled: false,
      plansAvailable: ["free", "plus", "max"],
      planChangeSupported: config.mode === "phase0_mock" || config.mode === "phase1_stripe_test",
    },
  };
}

export function resolveBillingProviderConfigFromEnv(env: NodeJS.ProcessEnv): BillingProviderConfig {
  const mode = env.MATTERHORN_BILLING_MODE as MatterhornBillingMode | undefined;
  const provider = env.MATTERHORN_BILLING_PROVIDER as MatterhornBillingProvider | undefined;
  const currentPlanIdRaw = env.MATTERHORN_BILLING_CURRENT_PLAN ?? "free";
  const currentPlanId: MatterhornBillingPlanId =
    currentPlanIdRaw === "free" || currentPlanIdRaw === "plus" || currentPlanIdRaw === "max" ? currentPlanIdRaw : "free";

  if (mode === "live") {
    return {
      mode: "live",
      provider: "stripe",
      currentPlanId,
      livePaymentsEnabled: false,
    };
  }

  if (mode === "phase1_stripe_test" || provider === "stripe") {
    return {
      mode: "phase1_stripe_test",
      provider: "stripe",
      currentPlanId,
      stripeWebhookSecret: env.MATTERHORN_STRIPE_WEBHOOK_SECRET,
      stripeSecretKey: env.MATTERHORN_STRIPE_SECRET_KEY,
      stripeApiBaseUrl: env.MATTERHORN_STRIPE_API_BASE_URL,
      stripeTestCustomerId: env.MATTERHORN_STRIPE_TEST_CUSTOMER_ID,
      stripePriceIds: {
        plus: env.MATTERHORN_STRIPE_PRICE_ID_PLUS,
        max: env.MATTERHORN_STRIPE_PRICE_ID_MAX,
      },
      livePaymentsEnabled: false,
    };
  }

  return {
    mode: "phase0_mock",
    provider: "mock",
    currentPlanId,
    livePaymentsEnabled: false,
  };
}

export function createMockBillingProvider(config: BillingProviderConfig): BillingProvider {
  const plans = buildMatterhornBillingPlans();
  return {
    config,
    plans: () => plans,
    status: () => buildMatterhornBillingStatus(config.currentPlanId, config),
    buildCheckout: async (input: MatterhornBillingCheckoutRequest) => {
      const plan = plans.find((p) => p.id === input.planId);
      if (!plan) throw new Error("Invalid plan");
      return {
        success: true,
        checkoutUrl: `https://mock-checkout.matterhorn.work/session/mock_${plan.id}_${Date.now()}`,
        mode: config.mode === "phase1_stripe_test" ? "stripe_test" : "mock",
        providerSessionId: null,
      };
    },
    buildPortal: async () => {
      return {
        success: true,
        portalUrl: `https://mock-portal.matterhorn.work/session/mock_${Date.now()}`,
        mode: config.mode === "phase1_stripe_test" ? "stripe_test" : "mock",
        providerSessionId: null,
      };
    },
    handleStripeWebhook: async (input: MatterhornBillingWebhookStripeRequest) => {
      if (config.provider !== "stripe" || config.mode !== "phase1_stripe_test") {
        return { success: true, received: true, verified: false, livemode: false, handled: false };
      }
      const hasSignature = Boolean(input.signature) && Boolean(config.stripeWebhookSecret);
      return {
        success: true,
        received: true,
        verified: hasSignature,
        livemode: false,
        handled: hasSignature,
      };
    },
  };
}

type StripePortalInput = MatterhornBillingPortalRequest & {
  providerCustomerId?: string;
};

function stripeApiBaseUrl(config: BillingProviderConfig): string {
  return (config.stripeApiBaseUrl?.trim() || "https://api.stripe.com").replace(/\/+$/, "");
}

function requireStripeTestReady(config: BillingProviderConfig): string {
  const secret = config.stripeSecretKey?.trim();
  if (!secret || !secret.startsWith("sk_test_")) {
    throw new Error("Stripe test checkout requires MATTERHORN_STRIPE_SECRET_KEY with an sk_test_ key.");
  }
  return secret;
}

function stripePriceId(config: BillingProviderConfig, planId: MatterhornBillingPlanId): string {
  if (planId === "free") {
    throw new Error("Free plan changes do not require Stripe checkout.");
  }
  const priceId = config.stripePriceIds?.[planId]?.trim();
  if (!priceId) {
    throw new Error(`Stripe test checkout requires a configured ${planId} price id.`);
  }
  return priceId;
}

function safeStripeReturnUrl(value: string | undefined, fallbackPath: string): string {
  const trimmed = value?.trim();
  if (trimmed && /^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://matterhorn.work${fallbackPath}`;
}

function appendStripeParam(params: URLSearchParams, key: string, value: string | number | boolean | undefined | null) {
  if (value === undefined || value === null) return;
  params.set(key, String(value));
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function planIdValue(value: unknown): MatterhornBillingPlanId | null {
  const planId = stringValue(value);
  return planId === "free" || planId === "plus" || planId === "max" ? planId : null;
}

function subscriptionStatusValue(value: unknown): MatterhornBillingSubscription["status"] {
  const status = stringValue(value);
  if (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "canceled" ||
    status === "paused" ||
    status === "none"
  ) {
    return status;
  }
  return "active";
}

function isoFromStripeSeconds(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

function stripeMetadata(object: Record<string, unknown>): Record<string, unknown> {
  return objectValue(object.metadata) ?? {};
}

async function postStripeForm(config: BillingProviderConfig, path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const secret = requireStripeTestReady(config);
  const response = await fetch(`${stripeApiBaseUrl(config)}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : typeof payload?.message === "string"
          ? payload.message
          : "Stripe test request failed.";
    throw new Error(message);
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Stripe returned an invalid response.");
  }
  return payload as Record<string, unknown>;
}

function verifyStripeSignature(input: MatterhornBillingWebhookStripeRequest, secret: string): boolean {
  const raw = input.rawPayload;
  const signature = input.signature;
  if (!raw || !signature || !secret) return false;
  const parts = signature.split(",").map((part) => part.trim()).filter(Boolean);
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return signatures.some((candidate) => {
    if (!/^[0-9a-f]+$/i.test(candidate)) return false;
    const candidateBuffer = Buffer.from(candidate, "hex");
    if (candidateBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(candidateBuffer, expectedBuffer);
  });
}

export function createStripeTestBillingProvider(config: BillingProviderConfig): BillingProvider {
  const plans = buildMatterhornBillingPlans();
  return {
    config,
    plans: () => plans,
    status: () => buildMatterhornBillingStatus(config.currentPlanId, config),
    buildCheckout: async (input: MatterhornBillingCheckoutRequest) => {
      const priceId = stripePriceId(config, input.planId);
      const params = new URLSearchParams();
      appendStripeParam(params, "mode", "subscription");
      appendStripeParam(params, "line_items[0][price]", priceId);
      appendStripeParam(params, "line_items[0][quantity]", 1);
      appendStripeParam(params, "success_url", safeStripeReturnUrl(input.successUrl, "/billing/success?session_id={CHECKOUT_SESSION_ID}"));
      appendStripeParam(params, "cancel_url", safeStripeReturnUrl(input.cancelUrl, "/billing/canceled"));
      const workspaceId = input.workspaceId?.trim();
      appendStripeParam(params, "client_reference_id", workspaceId ? `matterhorn_${workspaceId}_${input.planId}` : `matterhorn_${input.planId}`);
      appendStripeParam(params, "metadata[product]", "matterhorn-work");
      appendStripeParam(params, "metadata[plan_id]", input.planId);
      appendStripeParam(params, "metadata[workspace_id]", workspaceId);
      appendStripeParam(params, "subscription_data[metadata][product]", "matterhorn-work");
      appendStripeParam(params, "subscription_data[metadata][plan_id]", input.planId);
      appendStripeParam(params, "subscription_data[metadata][workspace_id]", workspaceId);
      const payload = await postStripeForm(config, "/v1/checkout/sessions", params);
      const checkoutUrl = typeof payload.url === "string" ? payload.url : "";
      if (!checkoutUrl) {
        throw new Error("Stripe did not return a Checkout URL.");
      }
      return {
        success: true,
        checkoutUrl,
        mode: "stripe_test",
        providerSessionId: typeof payload.id === "string" ? payload.id : null,
      };
    },
    buildPortal: async (input?: StripePortalInput) => {
      const customer = input?.providerCustomerId?.trim() || config.stripeTestCustomerId?.trim();
      if (!customer) {
        throw new Error("Stripe Customer Portal requires MATTERHORN_STRIPE_TEST_CUSTOMER_ID or a stored Stripe customer id.");
      }
      const params = new URLSearchParams();
      appendStripeParam(params, "customer", customer);
      appendStripeParam(params, "return_url", safeStripeReturnUrl(input?.returnUrl, "/settings/billing"));
      const payload = await postStripeForm(config, "/v1/billing_portal/sessions", params);
      const portalUrl = typeof payload.url === "string" ? payload.url : "";
      if (!portalUrl) {
        throw new Error("Stripe did not return a Customer Portal URL.");
      }
      return {
        success: true,
        portalUrl,
        mode: "stripe_test",
        providerSessionId: typeof payload.id === "string" ? payload.id : null,
      };
    },
    handleStripeWebhook: async (input: MatterhornBillingWebhookStripeRequest) => {
      if (config.provider !== "stripe" || config.mode !== "phase1_stripe_test") {
        return { success: true, received: true, verified: false, livemode: false, handled: false };
      }
      const secret = config.stripeWebhookSecret?.trim();
      const verified = Boolean(secret && verifyStripeSignature(input, secret));
      const payload = verified
        ? typeof input.payload === "object" && input.payload !== null
          ? input.payload as Record<string, unknown>
          : {}
        : {};
      const eventIsLive = payload.livemode === true;
      const eventId = stringValue(payload.id);
      const eventType = stringValue(payload.type);
      const dataObject = objectValue(objectValue(payload.data)?.object);
      const base = {
        success: true as const,
        received: true as const,
        verified,
        livemode: false as const,
        eventId,
        eventType,
      };
      if (!verified || eventIsLive || !dataObject || !eventType) {
        return { ...base, handled: false };
      }
      const metadata = stripeMetadata(dataObject);
      const workspaceId = stringValue(metadata.workspace_id);
      const metadataPlanId = planIdValue(metadata.plan_id);
      const providerCustomerId = stringValue(dataObject.customer);
      const providerSubscriptionId =
        stringValue(dataObject.subscription) ??
        stringValue(dataObject.id);
      if (eventType === "checkout.session.completed") {
        return {
          ...base,
          handled: Boolean(workspaceId && metadataPlanId),
          workspaceId,
          planId: metadataPlanId,
          subscriptionStatus: "active",
          providerCustomerId,
          providerSubscriptionId,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
        };
      }
      if (
        eventType === "customer.subscription.created" ||
        eventType === "customer.subscription.updated" ||
        eventType === "customer.subscription.deleted"
      ) {
        const subscriptionStatus = eventType === "customer.subscription.deleted"
          ? "canceled"
          : subscriptionStatusValue(dataObject.status);
        const effectivePlanId =
          subscriptionStatus === "active" || subscriptionStatus === "trialing"
            ? metadataPlanId
            : "free";
        return {
          ...base,
          handled: Boolean(workspaceId && effectivePlanId),
          workspaceId,
          planId: effectivePlanId,
          subscriptionStatus,
          providerCustomerId,
          providerSubscriptionId,
          currentPeriodStart: isoFromStripeSeconds(dataObject.current_period_start),
          currentPeriodEnd: isoFromStripeSeconds(dataObject.current_period_end),
          cancelAtPeriodEnd: booleanValue(dataObject.cancel_at_period_end) ?? false,
        };
      }
      return {
        ...base,
        handled: false,
      };
    },
  };
}

export function createBillingProvider(config: BillingProviderConfig): BillingProvider {
  if (config.provider === "stripe" && config.mode === "phase1_stripe_test") {
    return createStripeTestBillingProvider(config);
  }
  return createMockBillingProvider(config);
}

export function buildBillingPlansResponse(config: BillingProviderConfig): MatterhornBillingPlansResponse {
  return {
    success: true,
    version: "matterhorn.billing.v1",
    generatedAt: new Date().toISOString(),
    mode: config.mode,
    provider: config.provider,
    plans: buildMatterhornBillingPlans(),
    currentPlanId: config.currentPlanId,
    isLivePaymentsEnabled: false,
  };
}

export function buildBillingStatusResponse(config: BillingProviderConfig): MatterhornBillingStatusResponse {
  return {
    success: true,
    version: "matterhorn.billing.v1",
    generatedAt: new Date().toISOString(),
    status: buildMatterhornBillingStatus(config.currentPlanId, config),
  };
}

export function buildBillingStatusResponseWithUsage(
  config: BillingProviderConfig,
  usage?: BillingUsageCounts,
): MatterhornBillingStatusResponse {
  return {
    success: true,
    version: "matterhorn.billing.v1",
    generatedAt: new Date().toISOString(),
    status: buildMatterhornBillingStatusWithUsage(config.currentPlanId, config, usage),
  };
}

export function buildBillingStatusResponseForSubscription(
  config: BillingProviderConfig,
  subscription: MatterhornBillingSubscription,
  usage?: BillingUsageCounts,
): MatterhornBillingStatusResponse {
  return {
    success: true,
    version: "matterhorn.billing.v1",
    generatedAt: new Date().toISOString(),
    status: buildMatterhornBillingStatusForSubscription(subscription, config, usage),
  };
}
