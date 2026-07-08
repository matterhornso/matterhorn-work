import type { MatterhornCapability, MatterhornCapabilityStatus } from "./backend-capabilities.js";

export const MATTERHORN_BILLING_VERSION = "matterhorn.billing.v1" as const;

export type MatterhornBillingPlanId = "free" | "plus" | "max";
export type MatterhornBillingInterval = "month" | "year";
export type MatterhornBillingProvider = "mock" | "stripe";
export type MatterhornBillingMode = "phase0_mock" | "phase1_stripe_test" | "live";

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

export interface MatterhornBillingUsageSnapshot {
  generatedImages: { used: number; limit: number | null; resetsAt?: string | null };
  nftDrafts: { used: number; limit: number | null; resetsAt?: string | null };
  teamMembers: { used: number; limit: number | null };
  cloudStorageBytes: { used: number; limit: number | null };
}

export interface MatterhornBillingStatus {
  mode: MatterhornBillingMode;
  provider: MatterhornBillingProvider;
  subscription: MatterhornBillingSubscription;
  usage: MatterhornBillingUsageSnapshot;
  isLivePaymentsEnabled: false;
}

export interface MatterhornBillingCapability extends MatterhornCapability {
  mode: MatterhornBillingMode;
  provider: MatterhornBillingProvider;
  currentPlanId: MatterhornBillingPlanId;
  isLivePaymentsEnabled: false;
  checkoutSupported: boolean;
  portalSupported: boolean;
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
}

export interface MatterhornBillingCheckoutResponse {
  success: true;
  checkoutUrl: string;
  mode: "mock" | "stripe_test";
}

export interface MatterhornBillingPortalRequest {
  returnUrl?: string;
}

export interface MatterhornBillingPortalResponse {
  success: true;
  portalUrl: string;
  mode: "mock" | "stripe_test";
}

export interface MatterhornBillingWebhookStripeRequest {
  signature?: string;
  payload: unknown;
}

export interface MatterhornBillingWebhookStripeResponse {
  success: true;
  received: true;
  verified: boolean;
  livemode: false;
  handled: boolean;
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
