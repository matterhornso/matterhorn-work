import type { MatterhornCapability, MatterhornCapabilityStatus } from "./backend-capabilities.js";

export const MATTERHORN_BILLING_VERSION = "matterhorn.billing.v1" as const;

export type MatterhornBillingPlanId = "free" | "plus" | "max";
export type MatterhornBillingInterval = "month" | "year";
export type MatterhornBillingProvider = "mock" | "stripe";
export type MatterhornBillingMode = "phase0_mock" | "phase1_stripe_test" | "live";
export type MatterhornBillingAccountSource =
  | "env_default"
  | "mock_checkout"
  | "stripe_test_checkout"
  | "stripe_test_webhook";

export type MatterhornEntitlementKey =
  | "image_generation"
  | "image_editing"
  | "nft_mint_preview"
  | "nft_marketplace_listing"
  | "walrus_storage"
  | "cloud_sync"
  | "team_members"
  | "memory_global_scope"
  | "priority_support"
  | "api_access"
  | "extended_outputs";

export interface MatterhornEntitlement {
  key: MatterhornEntitlementKey;
  label: string;
  description: string;
  included: boolean;
  limit?: number | null;
  softLimit?: boolean;
}

export interface MatterhornBillingPlan {
  id: MatterhornBillingPlanId;
  name: string;
  tagline: string;
  price: {
    amountCents: number;
    currency: string;
    interval: MatterhornBillingInterval;
  };
  ctaLabel: string;
  popular?: boolean;
  entitlements: MatterhornEntitlement[];
}

export interface MatterhornBillingSubscription {
  planId: MatterhornBillingPlanId;
  status: "active" | "trialing" | "past_due" | "canceled" | "paused" | "none";
  interval: MatterhornBillingInterval;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
}

export interface MatterhornBillingPendingCheckout {
  planId: MatterhornBillingPlanId;
  interval: MatterhornBillingInterval;
  provider: MatterhornBillingProvider;
  mode: "stripe_test" | "mock";
  providerSessionId?: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

export interface MatterhornBillingUsageSnapshot {
  generatedImages: { used: number; limit: number | null; resetsAt?: string | null };
  nftDrafts: { used: number; limit: number | null; resetsAt?: string | null };
  teamMembers: { used: number; limit: number | null };
  cloudStorageBytes: { used: number; limit: number | null };
}

export interface MatterhornBillingAccountLinkage {
  source: MatterhornBillingAccountSource;
  label: string;
  status: MatterhornCapabilityStatus;
  description: string;
  hasProviderCustomer: boolean;
  hasProviderSubscription: boolean;
  pendingCheckout: boolean;
  updatedAt?: string | null;
}

export type MatterhornBillingSetupCheckId =
  | "mock_mode"
  | "stripe_secret_key"
  | "stripe_webhook_secret"
  | "stripe_plus_price"
  | "stripe_max_price"
  | "stripe_test_customer"
  | "live_payments_disabled"
  | "live_mode_blocked"
  | "stripe_live_key_rejected"
  | "stripe_live_webhook_missing"
  | "stripe_live_prices_missing"
  | "billing_integrity_review_required";

export interface MatterhornBillingSetupCheck {
  id: MatterhornBillingSetupCheckId;
  label: string;
  status: MatterhornCapabilityStatus;
  description: string;
}

export interface MatterhornBillingSetup {
  mode: MatterhornBillingMode;
  provider: MatterhornBillingProvider;
  readyForTestCheckout: boolean;
  readyForWebhooks: boolean;
  livePaymentsEnabled: false;
  checks: MatterhornBillingSetupCheck[];
}

export interface MatterhornBillingStatus {
  mode: MatterhornBillingMode;
  provider: MatterhornBillingProvider;
  subscription: MatterhornBillingSubscription;
  pendingCheckout?: MatterhornBillingPendingCheckout | null;
  usage: MatterhornBillingUsageSnapshot;
  accountLinkage: MatterhornBillingAccountLinkage;
  setup: MatterhornBillingSetup;
  isLivePaymentsEnabled: false;
}

export interface MatterhornBillingCapability extends MatterhornCapability {
  mode: MatterhornBillingMode;
  provider: MatterhornBillingProvider;
  currentPlanId: MatterhornBillingPlanId;
  isLivePaymentsEnabled: false;
  checkoutSupported: boolean;
  portalSupported: boolean;
  setup: MatterhornBillingSetup;
}

export interface MatterhornBillingPlansResponse {
  success: true;
  version: typeof MATTERHORN_BILLING_VERSION;
  generatedAt: string;
  mode: MatterhornBillingMode;
  provider: MatterhornBillingProvider;
  plans: MatterhornBillingPlan[];
  currentPlanId: MatterhornBillingPlanId;
  isLivePaymentsEnabled: false;
}

export interface MatterhornBillingStatusResponse {
  success: true;
  version: typeof MATTERHORN_BILLING_VERSION;
  generatedAt: string;
  status: MatterhornBillingStatus;
}

export interface MatterhornBillingCheckoutRequest {
  planId: MatterhornBillingPlanId;
  interval?: MatterhornBillingInterval;
  successUrl?: string;
  cancelUrl?: string;
  workspaceId?: string;
}

export interface MatterhornBillingCheckoutResponse {
  success: true;
  checkoutUrl: string;
  mode: "mock" | "stripe_test";
  providerSessionId?: string | null;
  expiresAt?: string | null;
}

export interface MatterhornBillingPortalRequest {
  returnUrl?: string;
  providerCustomerId?: string;
}

export interface MatterhornBillingPortalResponse {
  success: true;
  portalUrl: string;
  mode: "mock" | "stripe_test";
  providerSessionId?: string | null;
}

export interface MatterhornBillingPendingCheckoutClearResponse {
  success: true;
  cleared: boolean;
  workspaceId: string;
  status: MatterhornBillingStatus;
}

export interface MatterhornBillingWebhookStripeRequest {
  signature?: string;
  payload: unknown;
  rawPayload?: string;
}

export interface MatterhornBillingWebhookStripeResponse {
  success: true;
  received: true;
  verified: boolean;
  livemode: false;
  handled: boolean;
  eventId?: string | null;
  eventType?: string | null;
  eventCreatedAt?: string | null;
  workspaceId?: string | null;
  planId?: MatterhornBillingPlanId | null;
  subscriptionStatus?: MatterhornBillingSubscription["status"] | null;
  providerCheckoutSessionId?: string | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  workspaceSynced?: boolean;
  webhookMutation?:
    | "synced"
    | "duplicate_event"
    | "stale_event"
    | "checkout_mismatch"
    | "subscription_mismatch"
    | "not_handled";
}

export interface MatterhornBillingCheckoutSession {
  id: string;
  planId: MatterhornBillingPlanId;
  mode: "mock" | "stripe_test";
  url: string;
  status: "open" | "complete" | "expired";
  livemode: false;
}

export function isMatterhornBillingPlanId(value: string): value is MatterhornBillingPlanId {
  return value === "free" || value === "plus" || value === "max";
}

export function matterhornPlanEntitlementLimit(
  planId: MatterhornBillingPlanId,
  key: MatterhornEntitlementKey,
): number | null {
  const limits: Record<MatterhornBillingPlanId, Partial<Record<MatterhornEntitlementKey, number | null>>> = {
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
  const value = limits[planId][key];
  return value === undefined ? 0 : value;
}

export const MATTERHORN_BILLING_ENTITLEMENT_ORDER: MatterhornEntitlementKey[] = [
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

export const MATTERHORN_BILLING_ENTITLEMENT_LABELS: Record<MatterhornEntitlementKey, { label: string; description: string }> = {
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

export function buildMatterhornBillingPlanEntitlements(planId: MatterhornBillingPlanId): MatterhornEntitlement[] {
  return MATTERHORN_BILLING_ENTITLEMENT_ORDER.map((key) => {
    const limit = matterhornPlanEntitlementLimit(planId, key);
    return {
      key,
      ...MATTERHORN_BILLING_ENTITLEMENT_LABELS[key],
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
      entitlements: buildMatterhornBillingPlanEntitlements("free"),
    },
    {
      id: "plus",
      name: "Matterhorn Plus",
      tagline: "Generate images and create NFT drafts.",
      price: { amountCents: 999, currency: "USD", interval: "month" },
      ctaLabel: "Upgrade to Plus",
      popular: true,
      entitlements: buildMatterhornBillingPlanEntitlements("plus"),
    },
    {
      id: "max",
      name: "Matterhorn Max",
      tagline: "Unlimited creation and publishing allowances, plus expanded team limits.",
      price: { amountCents: 8999, currency: "USD", interval: "month" },
      ctaLabel: "Upgrade to Max",
      entitlements: buildMatterhornBillingPlanEntitlements("max"),
    },
  ];
}
