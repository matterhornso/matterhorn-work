import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AiSettingsView, type AiSettingsViewProps } from "../src/react-app/domains/settings/pages/ai-view";
import { MINIMAL_UI } from "../src/app/lib/minimal-ui";

function renderReadySettings(overrides: Partial<AiSettingsViewProps> = {}, savedDefault = false) {
  const queryClient = new QueryClient();
  // Seed authoritative catalog data; summary counts cannot identify chat models.
  const connected = overrides.connectedModelCount !== 0;
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
  test("managed-provider settings hide unrelated subscription and cloud-import promotions", () => {
    const html = renderReadySettings({
      showOpenWorkModelsSubscribe: true,
      onSubscribeOpenWorkModels: () => undefined,
      cloudProvidersView: React.createElement("div", null, "Import cloud providers"),
    });
    expect(html).not.toContain("Subscribe");
    expect(html).not.toContain("Shared model catalog");
    expect(html).not.toContain("Import cloud providers");
    expect(html).toContain(MINIMAL_UI ? 'aria-label="Chat models"' : "Choose model");
  });

  test("leads with one model choice and hides expert settings by default", () => {
    const html = renderReadySettings();

    expect(html).toContain("Choose a model");
    if (MINIMAL_UI) {
      expect(html).toContain("Search models");
      expect(html).toContain("All providers");
      expect(html).toContain('aria-label="Chat models"');
      expect(html).toContain("ASI1 Mini");
      expect(html).not.toContain("text-embedding-3");
      expect(html).toContain("<summary");
      expect(html).toContain("Provider privacy");
      expect(html).toContain("Advanced model and provider settings</summary>");
      expect(html).not.toContain('<details open=""');
      return;
    }
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

    if (MINIMAL_UI) {
      expect(html).toContain("Nothing has been sent.");
      expect(html).toContain("Return to desk");
      expect(html).toContain("No chat models are connected.");
      expect(html).toContain("Your workspace owner manages this connection.");
      expect(html).toContain("Refresh models");
      expect(html).not.toContain(">Connect provider</button>");
      expect(html).not.toContain('aria-label="Chat models"');
      return;
    }

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

    expect(html).toContain(MINIMAL_UI ? 'aria-label="Chat models"' : "Choose model");
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
    if (MINIMAL_UI) expect(html).toContain("Advanced model and provider settings</summary>");
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
    if (MINIMAL_UI) {
      expect(html).toContain('aria-label="Chat models"');
      expect(html).toContain("Clear saved default");
      expect(html).toContain("Use saved default");
      expect(html).toContain("New chats</div>");
      expect(html).toContain("This app</div>");
    }
  });
});
