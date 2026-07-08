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
    generatedImages: { used: 0, limit: null, resetsAt: null },
    nftDrafts: { used: 0, limit: null, resetsAt: null },
    teamMembers: { used: 1, limit: null },
    cloudStorageBytes: { used: 0, limit: null },
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
    usage: buildMatterhornBillingUsageSnapshot(),
    isLivePaymentsEnabled: false,
  };
}

export function buildMatterhornBillingCapability(config: BillingProviderConfig): MatterhornBillingCapability {
  const checkoutSupported = config.mode !== "live" && config.provider !== "mock";
  const portalSupported = checkoutSupported;
  return {
    status: config.mode === "phase0_mock" ? "preview" : config.mode === "phase1_stripe_test" ? "working" : "needs_setup",
    label: "Billing",
    description:
      config.mode === "phase0_mock"
        ? "Billing is in mock mode. No real charges are processed."
        : config.mode === "phase1_stripe_test"
          ? "Billing is in Stripe test mode. No live charges are processed."
          : "Live payments are not enabled.",
    mode: config.mode,
    provider: config.provider,
    currentPlanId: config.currentPlanId,
    isLivePaymentsEnabled: false,
    checkoutSupported,
    portalSupported,
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
      };
    },
    buildPortal: async () => {
      return {
        success: true,
        portalUrl: `https://mock-portal.matterhorn.work/session/mock_${Date.now()}`,
        mode: config.mode === "phase1_stripe_test" ? "stripe_test" : "mock",
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

export function createBillingProvider(config: BillingProviderConfig): BillingProvider {
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
