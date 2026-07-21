import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BillingSettingsView } from "../src/react-app/domains/settings/pages/billing-view";
import { StatusToastsProvider } from "../src/react-app/domains/shell-feedback/status-toasts";
import {
  checkEntitlement,
  entitlementUsageStatus,
  formatEntitlementReset,
  formatEntitlementUsage,
} from "../src/react-app/domains/billing/entitlements";
import { backendCapabilitiesWorkingFixture } from "../src/react-app/domains/settings/backend-capabilities/backend-capability-fixtures";
import type { MatterhornServerClient } from "../src/app/lib/matterhorn-server";

const mockClient: MatterhornServerClient = {
  billingPlans: () =>
    Promise.resolve({
      success: true,
      version: "matterhorn.billing.v1",
      generatedAt: new Date().toISOString(),
      mode: "phase0_mock",
      provider: "mock",
      currentPlanId: "free",
      isLivePaymentsEnabled: false,
      plans: [
        {
          id: "free",
          name: "Free",
          tagline: "Local-first notes, memory, and chat.",
          price: { amountCents: 0, currency: "USD", interval: "month" },
          ctaLabel: "Current plan",
          entitlements: [
            { key: "image_generation", label: "Image generation", description: "", included: true, limit: 10 },
            { key: "nft_mint_preview", label: "NFT mint previews", description: "", included: false, limit: 0 },
          ],
        },
        {
          id: "plus",
          name: "Matterhorn Plus",
          tagline: "Generate images and create NFT drafts.",
          price: { amountCents: 999, currency: "USD", interval: "month" },
          ctaLabel: "Upgrade to Plus",
          popular: true,
          entitlements: [
            { key: "image_generation", label: "Image generation", description: "", included: true, limit: 100 },
            { key: "nft_mint_preview", label: "NFT mint previews", description: "", included: true, limit: 20 },
          ],
        },
        {
          id: "max",
          name: "Matterhorn Max",
          tagline: "Unlimited creation.",
          price: { amountCents: 8999, currency: "USD", interval: "month" },
          ctaLabel: "Upgrade to Max",
          entitlements: [
            { key: "image_generation", label: "Image generation", description: "", included: true, limit: null },
            { key: "nft_mint_preview", label: "NFT mint previews", description: "", included: true, limit: null },
          ],
        },
      ],
    }),
  billingStatus: () =>
    Promise.resolve({
      success: true,
      version: "matterhorn.billing.v1",
      generatedAt: new Date().toISOString(),
      status: {
        mode: "phase0_mock",
        provider: "mock",
        subscription: { planId: "free", status: "none", interval: "month", cancelAtPeriodEnd: false },
        usage: {
          generatedImages: { used: 3, limit: 10, resetsAt: "2026-08-01T12:00:00.000Z" },
          nftDrafts: { used: 0, limit: 0, resetsAt: "2026-08-01T12:00:00.000Z" },
          teamMembers: { used: 1, limit: 1 },
          cloudStorageBytes: { used: 0, limit: null },
        },
        accountLinkage: {
          source: "env_default",
          label: "Default local plan",
          status: "preview",
          description: "The workspace is using local billing defaults. No payment provider account is linked.",
          hasProviderCustomer: false,
          hasProviderSubscription: false,
          pendingCheckout: false,
          updatedAt: null,
        },
        setup: {
          mode: "phase0_mock",
          provider: "mock",
          readyForTestCheckout: false,
          readyForWebhooks: false,
          livePaymentsEnabled: false,
          checks: [
            {
              id: "mock_mode",
              label: "Local plan preview",
              status: "preview",
              description: "Plan changes are local test state only. No payment provider is contacted.",
            },
          ],
        },
        isLivePaymentsEnabled: false,
      },
    }),
  workspaceBillingStatus: () =>
    Promise.resolve({
      success: true,
      version: "matterhorn.billing.v1",
      generatedAt: new Date().toISOString(),
      status: {
        mode: "phase0_mock",
        provider: "mock",
        subscription: { planId: "free", status: "none", interval: "month", cancelAtPeriodEnd: false },
        usage: {
          generatedImages: { used: 7, limit: 10, resetsAt: "2026-08-01T12:00:00.000Z" },
          nftDrafts: { used: 2, limit: 0, resetsAt: "2026-08-01T12:00:00.000Z" },
          teamMembers: { used: 1, limit: 1 },
          cloudStorageBytes: { used: 0, limit: null },
        },
        accountLinkage: {
          source: "env_default",
          label: "Default local plan",
          status: "preview",
          description: "The workspace is using local billing defaults. No payment provider account is linked.",
          hasProviderCustomer: false,
          hasProviderSubscription: false,
          pendingCheckout: false,
          updatedAt: null,
        },
        setup: {
          mode: "phase0_mock",
          provider: "mock",
          readyForTestCheckout: false,
          readyForWebhooks: false,
          livePaymentsEnabled: false,
          checks: [
            {
              id: "mock_mode",
              label: "Local plan preview",
              status: "preview",
              description: "Plan changes are local test state only. No payment provider is contacted.",
            },
          ],
        },
        isLivePaymentsEnabled: false,
      },
    }),
  workspaceBillingCheckout: () => Promise.reject(new Error("Not called in static render")),
  workspaceBillingPortal: () => Promise.reject(new Error("Not called in static render")),
  workspaceBillingPendingCheckoutClear: () => Promise.reject(new Error("Not called in static render")),
  billingCheckout: () => Promise.reject(new Error("Not called in static render")),
  billingPortal: () => Promise.reject(new Error("Not called in static render")),
} as unknown as MatterhornServerClient;

describe("Billing settings view", () => {
  test("renders billing page shell", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      React.createElement(
        StatusToastsProvider,
        null,
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(BillingSettingsView, { matterhornServerClient: mockClient }),
        ),
      ),
    );
    expect(html).toContain("Billing");
    expect(html).toContain("Current plan");
    expect(html).toContain("No raw card data");
    expect(html).toContain("Matterhorn Plus");
    expect(html).toContain("Matterhorn Max");
    expect(html).toContain("$9.99/month");
    expect(html).toContain("$89.99/month");
    expect(html).toContain("Showing the local Matterhorn plan catalog");
    expect(html).toContain("Connect the Matterhorn Desks engine to open checkout");
    expect(html).not.toContain("Billing plans could not load");
    expect(html).toContain("Local preview");
    expect(html).toContain("Plans");
    expect(html).toContain("What billing changes");
    expect(html).toContain("Always available");
    expect(html).toContain("Never gated");
    expect(html).toContain("Usage");
  });

  test("backend capability fixture includes billing", () => {
    expect(backendCapabilitiesWorkingFixture.billing).toBeDefined();
    expect(backendCapabilitiesWorkingFixture.billing.currentPlanId).toBe("free");
    expect(backendCapabilitiesWorkingFixture.billing.isLivePaymentsEnabled).toBe(false);
    expect(backendCapabilitiesWorkingFixture.settings.some((s) => s.section === "billing")).toBe(true);
  });

  test("uses workspace billing status when a workspace id is available", () => {
    const billingViewSource = readFileSync(
      join(import.meta.dir, "../src/react-app/domains/settings/pages/billing-view.tsx"),
      "utf8",
    );
    const settingsRouteSource = readFileSync(
      join(import.meta.dir, "../src/react-app/shell/settings-route.tsx"),
      "utf8",
    );
    const clientSource = readFileSync(
      join(import.meta.dir, "../src/app/lib/matterhorn-server.ts"),
      "utf8",
    );

    expect(clientSource).toContain("workspaceBillingStatus");
    expect(clientSource).toContain("workspaceBillingCheckout");
    expect(clientSource).toContain("workspaceBillingPortal");
    expect(clientSource).toContain("workspaceBillingPendingCheckoutClear");
    expect(clientSource).toContain("/billing/status");
    expect(clientSource).toContain("/billing/checkout");
    expect(clientSource).toContain("/billing/portal");
    expect(clientSource).toContain("/billing/pending-checkout");
    expect(billingViewSource).toContain("runtimeWorkspaceId");
    expect(billingViewSource).toContain("buildMatterhornBillingPlans");
    expect(billingViewSource).toContain("LOCAL_BILLING_PLANS");
    expect(billingViewSource).toContain("usingLocalPlanCatalog");
    expect(billingViewSource).toContain("Showing the local Matterhorn plan catalog");
    expect(billingViewSource).toContain("Connect the Matterhorn Desks engine to open checkout");
    expect(billingViewSource).toContain("client?.workspaceBillingStatus(workspaceId)");
    expect(billingViewSource).toContain("status?.setup.checks");
    expect(billingViewSource).toContain("status?.accountLinkage");
    expect(billingViewSource).toContain("accountLinkage.label");
    expect(billingViewSource).toContain("accountLinkage.description");
    expect(billingViewSource).toContain("subscriptionPeriodCopy(status?.subscription)");
    expect(billingViewSource).toContain("Plan status:");
    expect(billingViewSource).toContain("Renews");
    expect(billingViewSource).toContain("Ends");
    expect(billingViewSource).toContain("pendingCheckoutExpiryCopy");
    expect(billingViewSource).toContain("status?.pendingCheckout?.expiresAt");
    expect(billingViewSource).toContain("pendingCheckoutCopy");
    expect(billingViewSource).toContain("Stripe test webhook confirms it");
    expect(billingViewSource).toContain("local preview and does not change plan access");
    expect(billingViewSource).toContain("Stripe test ready");
    expect(billingViewSource).toContain("Platform setup");
    expect(billingViewSource).toContain("client?.billingStatus()");
    expect(billingViewSource).toContain("client?.workspaceBillingCheckout(workspaceId");
    expect(billingViewSource).toContain("Open a workspace before changing plans.");
    expect(billingViewSource).toContain("Billing checkout is tied to a workspace so subscriptions can reconcile.");
    expect(billingViewSource).not.toContain("client?.billingCheckout({ planId");
    expect(billingViewSource).toContain("client?.workspaceBillingPortal(workspaceId");
    expect(billingViewSource).toContain("client.workspaceBillingPendingCheckoutClear(workspaceId)");
    expect(billingViewSource).toContain("Clear pending");
    expect(billingViewSource).toContain("statusQuery.refetch()");
    expect(billingViewSource).toContain("checkoutReady");
    expect(billingViewSource).toContain("portalCanOpen");
    expect(billingViewSource).toContain("Active for this workspace");
    expect(billingViewSource).toContain("Matterhorn must connect billing before plan changes open");
    expect(billingViewSource).toContain("stripe_test_customer");
    expect(billingViewSource).toContain("status.usage.generatedImages.resetsAt");
    expect(billingViewSource).toContain("status.usage.nftDrafts.resetsAt");
    expect(billingViewSource).toContain("formatEntitlementReset(props.resetsAt)");
    expect(billingViewSource).toContain("`${props.used} historical`");
    expect(billingViewSource).toContain("`Plan includes ${props.limit}`");
    expect(billingViewSource).toContain("NFT mint previews");
    expect(billingViewSource).toContain("entitlementUsageStatus(props.used, props.limit)");
    expect(billingViewSource).toContain("useStatusToasts");
    expect(billingViewSource).toContain("billingPlanActionLabel");
    expect(billingViewSource).toContain("shortBillingPlanName");
    expect(billingViewSource).toContain("Preview ${shortBillingPlanName(props.plan)}");
    expect(billingViewSource).toContain("Start ${shortBillingPlanName(props.plan)} checkout");
    expect(billingViewSource).toContain("Start ${shortBillingPlanName(props.plan)}");
    expect(billingViewSource).toContain("billingPortalActionLabel");
    expect(billingViewSource).toContain("Billing account not connected");
    expect(billingViewSource).toContain("Manage test plan");
    expect(billingViewSource).toContain("PaymentReadinessSummary");
    expect(billingViewSource).toContain("Payment flow");
    expect(billingViewSource).toContain("Stripe checkout requires Matterhorn platform setup.");
    expect(billingViewSource).not.toContain("sm:grid-cols-3");
    expect(billingViewSource).toContain("Checkout");
    expect(billingViewSource).toContain("Billing portal");
    expect(billingViewSource).toContain("Not connected");
    expect(billingViewSource).toContain("Stripe test portal");
    expect(billingViewSource).toContain("Billing portal ready");
    expect(billingViewSource).toContain("Matterhorn has not connected a payment provider.");
    expect(billingViewSource).toContain("Live charging");
    expect(billingViewSource).toContain("Stripe test checkout");
    expect(billingViewSource).toContain("Local plan preview");
    expect(billingViewSource).toContain("Live charges off");
    expect(billingViewSource).toContain("Live Stripe mode stays blocked until keys, webhooks, prices, and review are complete.");
    expect(billingViewSource).toContain("Plan preview saved");
    expect(billingViewSource).toContain("Test checkout opened");
    expect(billingViewSource).toContain("no real charges are processed");
    expect(billingViewSource).toContain("Billing portal unavailable");
    expect(billingViewSource).toContain("Billing readiness");
    expect(billingViewSource).toContain("What billing changes");
    expect(billingViewSource).toContain("Local workspace control stays available");
    expect(billingViewSource).toContain("Chat, local notes, memory review, protocol reads, exports, and settings are not blocked by billing.");
    expect(billingViewSource).toContain("Mint previews require Plus or Max; Walrus upload and marketplace listing require Max.");
    expect(settingsRouteSource).toContain("<BillingSettingsView");
    expect(settingsRouteSource).toContain(
      "matterhornServerClient={settingsCapabilityClient}",
    );
    expect(settingsRouteSource).toContain(
      "runtimeWorkspaceId={runtimeWorkspaceId}",
    );
    expect(readFileSync(
      join(import.meta.dir, "../src/react-app/domains/settings/shell/settings-page.tsx"),
      "utf8",
    )).toContain("Plan, checkout, usage, and entitlement status for this workspace.");
  });
});

describe("Entitlement helpers", () => {
  test("free plan allows image generation under limit", () => {
    const check = checkEntitlement("free", "image_generation", 3);
    expect(check.allowed).toBe(true);
  });

  test("free plan blocks image generation at limit", () => {
    const check = checkEntitlement("free", "image_generation", 10);
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe("limit_reached");
  });

  test("free plan blocks NFT mint preview", () => {
    const check = checkEntitlement("free", "nft_mint_preview", 0);
    expect(check.allowed).toBe(false);
    expect(check.reason).toBe("not_included");
  });

  test("max plan allows unlimited entitlement", () => {
    const check = checkEntitlement("max", "image_generation", 10000);
    expect(check.allowed).toBe(true);
    expect(check.limit).toBeNull();
  });

  test("format usage with unlimited limit", () => {
    expect(formatEntitlementUsage(5, null)).toBe("5 used");
  });

  test("format usage with missing entitlement", () => {
    expect(formatEntitlementUsage(0, 0)).toBe("Not included");
    expect(formatEntitlementUsage(2, 0)).toBe("2 used");
  });

  test("format reset timestamp when available", () => {
    expect(formatEntitlementReset("2026-08-01T12:00:00.000Z")).toContain("Aug");
    expect(formatEntitlementReset(null)).toBeNull();
    expect(formatEntitlementReset("not-a-date")).toBeNull();
  });

  test("classifies billing usage status", () => {
    expect(entitlementUsageStatus(0, null)).toBeNull();
    expect(entitlementUsageStatus(0, 0)).toBeNull();
    expect(entitlementUsageStatus(2, 0)).toEqual({ label: "Upgrade required", tone: "warning" });
    expect(entitlementUsageStatus(8, 10)).toEqual({ label: "Almost at limit", tone: "warning" });
    expect(entitlementUsageStatus(10, 10)).toEqual({ label: "Limit reached", tone: "error" });
  });
});
