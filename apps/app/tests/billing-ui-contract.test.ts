import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BillingSettingsView } from "../src/react-app/domains/settings/pages/billing-view";
import { checkEntitlement, formatEntitlementUsage } from "../src/react-app/domains/billing/entitlements";
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
          generatedImages: { used: 3, limit: 10 },
          nftDrafts: { used: 0, limit: 0 },
          teamMembers: { used: 1, limit: 1 },
          cloudStorageBytes: { used: 0, limit: null },
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
          generatedImages: { used: 7, limit: 10 },
          nftDrafts: { used: 2, limit: 0 },
          teamMembers: { used: 1, limit: 1 },
          cloudStorageBytes: { used: 0, limit: null },
        },
        isLivePaymentsEnabled: false,
      },
    }),
  billingCheckout: () => Promise.reject(new Error("Not called in static render")),
  billingPortal: () => Promise.reject(new Error("Not called in static render")),
} as unknown as MatterhornServerClient;

describe("Billing settings view", () => {
  test("renders billing page shell", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToStaticMarkup(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(BillingSettingsView, { matterhornServerClient: mockClient }),
      ),
    );
    expect(html).toContain("Billing");
    expect(html).toContain("Manage your Matterhorn plan");
    expect(html).toContain("Mock mode");
    expect(html).toContain("Available plans");
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
    expect(clientSource).toContain("/billing/status");
    expect(billingViewSource).toContain("runtimeWorkspaceId");
    expect(billingViewSource).toContain("client?.workspaceBillingStatus(workspaceId)");
    expect(billingViewSource).toContain("client?.billingStatus()");
    expect(settingsRouteSource).toContain("<BillingSettingsView matterhornServerClient={matterhornClient} runtimeWorkspaceId={runtimeWorkspaceId} />");
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
});
