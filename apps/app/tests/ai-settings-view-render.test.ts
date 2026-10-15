import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AiSettingsView, type AiSettingsViewProps } from "../src/react-app/domains/settings/pages/ai-view";

function renderReadySettings(overrides: Partial<AiSettingsViewProps> = {}, savedDefault = false, pendingRequests?: number) {
  const queryClient = new QueryClient();
  // Seed authoritative catalog data; summary counts cannot identify chat models.
  const connected = overrides.connectedModelCount !== 0;
  if (pendingRequests !== undefined) {
    const period = { usedTokens: 123, reservedTokens: pendingRequests * 20_000,
      chargedTokens: 123 + pendingRequests * 20_000, limit: 100_000, resetsAt: "2026-11-01T00:00:00Z" };
    queryClient.setQueryData(["settings-workspace-model-usage", overrides.runtimeWorkspaceId ?? null], {
      status: { daily: period, monthly: period, pendingRequests, enabled: true },
    });
  }
  queryClient.setQueryData(overrides.runtimeWorkspaceId
    ? ["settings-workspace-backend-models", overrides.runtimeWorkspaceId]
    : ["settings-backend-models"], {
    workspaceSelection: savedDefault ? { providerId: "cudos", modelId: "asi1-mini", variant: "high" } : null,
    catalog: {
      serverFetched: true, connectedProviderCount: connected ? 1 : 0,
      defaultModels: connected ? { cudos: "asi1-mini" } : {},
      providers: connected ? (overrides.connectedProviders ?? [{ id: "cudos", name: "ASI:Cloud" }]).map((provider) => ({
        ...provider, connected: true, modelCount: 2, modelIds: ["asi1-mini", "text-embedding-3"], sampleModels: ["asi1-mini"],
      })) : [],
    },
  });
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(AiSettingsView, {
        busy: false,
        providerAuthBusy: false,
        defaultModelLabel: "ASI1 Mini",
        defaultModelRef: "cudos/asi1-mini",
        defaultModelProviderId: "cudos",
        defaultModelId: "asi1-mini",
        connectedModelCount: 7,
        providerStatusLabel: "Connected",
        providerStatusStyle: "ready",
        providerSummary: "Seven models available",
        connectedProviders: [{ id: "cudos", name: "ASI:Cloud", modelCount: 7 }],
        disconnectingProviderId: null,
        providerConnectError: null,
        providerDisconnectStatus: null,
        providerDisconnectError: null,
        cudosConnected: true,
        providerCredentialsManaged: true,
        onOpenModelPicker: () => undefined,
        onOpenProviderAuth: () => undefined,
        onResumePendingDeskTask: () => undefined,
        onDisconnectProvider: () => undefined,
        canDisconnectProvider: () => false,
        ...overrides,
      }),
    ),
  );
}

describe("AI settings rendered hierarchy", () => {
  test.each([1, 2])("labels %i pending usage holds without claiming a stopped request is active", (pendingRequests) => {
    const html = renderReadySettings({ runtimeWorkspaceId: "workspace-test" }, false, pendingRequests);
    expect(html).toContain("used or reserved");
    expect(html).toContain(`${pendingRequests} request${pendingRequests === 1 ? " is" : "s are"} awaiting usage totals`);
    expect(html).toContain("Reserved allowance stays held until totals arrive, even after Stop or an allowance reset.");
    expect(html).not.toContain("active request");
  });

  test("does not show a usage hold when every request is settled", () => {
    const html = renderReadySettings({ runtimeWorkspaceId: "workspace-test" }, false, 0);
    expect(html).toContain("123 used");
    expect(html).not.toContain("used or reserved");
    expect(html).not.toContain("awaiting usage totals");
  });

  test("managed-provider settings hide unrelated subscription and cloud-import promotions", () => {
    const html = renderReadySettings({
      showOpenWorkModelsSubscribe: true,
      onSubscribeOpenWorkModels: () => undefined,
      cloudProvidersView: React.createElement("div", null, "Import cloud providers"),
    });
    expect(html).not.toContain("Subscribe");
    expect(html).not.toContain("Shared model catalog");
    expect(html).not.toContain("Import cloud providers");
    expect(html).toContain("Choose model");
  });

  test("leads with one model choice and hides expert settings by default", () => {
    const html = renderReadySettings();

    expect(html).toContain("Choose a model");
    expect(html).toContain(
      "Pick the AI that answers your chats. You can change it any time.",
    );
    expect(html).toContain("Choose model");
    expect(html).toContain("More model settings");
    expect(html).toContain("Provider connection");
    expect(html).toContain("How provider data is handled");
    expect(html).not.toContain("Default model");
    expect(html).not.toContain("New chats</div>");
    expect(html).not.toContain("Connected model catalog");
    expect(html).not.toContain("Browse models");
  });


  test("never offers hosted users a provider action the web runtime forbids", () => {
    const html = renderReadySettings({
      connectedModelCount: 0,
      defaultModelLabel: "Connect provider",
      defaultModelRef: "",
      connectedProviders: [],
      pendingDeskTask: { deskId: "bittensor", title: "Explore subnets" },
    });
    const handoff = html.slice(
      html.indexOf('data-testid="pending-desk-task-handoff"'),
      html.indexOf("Selected model"),
    );


    expect(handoff).toContain("AI is not available in this workspace yet.");
    expect(handoff).toContain("Return to desk");
    expect(html).not.toContain("Connect AI");
    expect(html).not.toContain("Choose model");
    expect(html).toContain("No models are currently available in this workspace.");
  });

  test("lets hosted users choose a model when the managed catalog is ready", () => {
    const html = renderReadySettings({
      pendingDeskTask: { deskId: "bittensor", title: "Explore subnets" },
    });

    expect(html).toContain("Choose model");
    expect(html).toContain("Return to desk");
    expect(html).not.toContain("Connect AI");
  });

  test("keeps connected desktop provider management available in advanced settings", () => {
    const html = renderReadySettings({
      providerCredentialsManaged: false,
      connectedProviders: [{ id: "cudos", name: "ASI:Cloud" }, { id: "openai", name: "OpenAI", source: "api" }],
      canDisconnectProvider: () => true,
      onConnectCudos: () => undefined,
    });
    expect(html).toContain("Connect AI");
    expect(html).toContain("Update CUDOS key");
    expect(html).toContain("Disconnect");
    expect(html).not.toContain("Subscribe");
  });

  test("never exposes credential editing or disconnect for hosted managed providers", () => {
    const html = renderReadySettings({
      connectedProviders: [{ id: "cudos", name: "ASI:Cloud" }, { id: "openai", name: "OpenAI", source: "api" }],
      canDisconnectProvider: () => true,
      onConnectCudos: () => undefined,
    });
    expect(html).not.toContain("Connect AI");
    expect(html).not.toContain("Update CUDOS key");
    expect(html).not.toContain("Add CUDOS API key");
    expect(html).not.toContain(">Disconnect</button>");
  });

  test("restores saved-default and reasoning controls without replacing the simple picker", () => {
    const html = renderReadySettings({
      runtimeWorkspaceId: "workspace-test",
      hasLocalModelOverride: true,
      onUseWorkspaceDefault: () => undefined,
      modelBehaviorOptions: [{ value: "low", label: "Low", description: "Less reasoning" }, { value: "high", label: "High", description: "More reasoning" }],
      onCurrentAppModelVariantChange: () => undefined,
    }, true);
    expect(html).toContain("Choose model");
    expect(html).toContain("More model settings");
  });
});
