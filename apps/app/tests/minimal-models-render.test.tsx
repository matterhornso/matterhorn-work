import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MatterhornBackendModelCatalogSnapshot, MatterhornProviderPrivacyPolicy } from "@matterhorn-work/types/backend-models";
import { MinimalModels } from "../src/react-app/domains/settings/pages/minimal-models";

const catalog: MatterhornBackendModelCatalogSnapshot = {
  status: "working", label: "Models", source: "opencode_provider_list", serverFetched: true,
  providerCount: 1, connectedProviderCount: 1, modelCount: 3,
  connectedProviderIds: ["cudos"], defaultModels: {},
  providers: [{ id: "cudos", name: "CUDOS / ASI:Cloud", connected: true,
    modelCount: 3, modelIds: ["asi1", "asi1-mini", "text-embedding-3"], sampleModels: ["asi1"] }],
};
const pendingPolicy: MatterhornProviderPrivacyPolicy = {
  providerId: "cudos", providerName: "CUDOS / ASI:Cloud", status: "unverified",
  trainingUse: "unknown", retentionDays: null, policyUrl: null, verifiedAt: null,
  allowed: false, label: "Unverified", description: "Provider privacy policy coming soon.",
};

function renderModels(overrides: Partial<React.ComponentProps<typeof MinimalModels>> = {}) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MinimalModels workspaceId="qa-workspace" catalog={catalog} selection={null}
        policies={[pendingPolicy]} loading={false} failed={false}
        onRefresh={() => {}} onConnect={() => {}} {...overrides} />
    </QueryClientProvider>,
  );
}

describe("model selection separates preference from execution", () => {
  test("explains selection without hiding connected choices behind provider policy", () => {
    const html = renderModels();
    expect(html).toContain("Select a default for new chats. This does not send a message.");
    expect(html).toContain("Provider privacy review pending");
    expect(html).toContain("You can save this model as your preference.");
    expect(html).toContain("Requests still require privacy and permission checks.");
    expect(html).not.toContain("disabled=");
    expect(html).not.toContain("text-embedding-3");
    expect(html).not.toContain("Sending is blocked.");
  });

  test("uses only the saved preference for the selected state, even with pending policy", () => {
    const html = renderModels({ selection: { providerId: "cudos", modelId: "asi1", source: "server_workspace_preference", savedAt: "2026-10-06T00:00:00Z" } });
    expect(html).toContain("Default for new chats: ASI1.");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain(">Selected</span>");
    expect(html).toContain("Provider privacy review pending");
  });

  test("places announced save feedback before the long model list", () => {
    const html = renderModels();
    expect(html.indexOf('role="status"')).toBeLessThan(html.indexOf('aria-label="Chat models"'));
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain("Workspace model saved.");
  });

  test("does not claim a pending review for an allowed provider", () => {
    const html = renderModels({ policies: [{ ...pendingPolicy, allowed: true, status: "verified_no_training" }] });
    expect(html).not.toContain("Provider privacy review pending");
  });

  test("loading, failed and disconnected catalogs never offer stale model buttons", () => {
    expect(renderModels({ loading: true })).toContain("Loading models");
    const failure = renderModels({ failed: true, managed: true });
    expect(failure).toContain("Models could not be loaded.");
    expect(failure).not.toContain('aria-label="Chat models"');
    expect(failure).toContain("Refresh models");
    const disconnected = renderModels({ catalog: { ...catalog, providers: [{ ...catalog.providers[0], connected: false }] } });
    expect(disconnected).toContain("No chat models are connected.");
    expect(disconnected).toContain("Connect provider");
    expect(disconnected).not.toContain('aria-label="Chat models"');
  });
});
