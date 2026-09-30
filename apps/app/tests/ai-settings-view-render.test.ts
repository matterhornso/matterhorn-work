import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AiSettingsView } from "../src/react-app/domains/settings/pages/ai-view";
import { MINIMAL_UI } from "../src/app/lib/minimal-ui";

function renderReadySettings(overrides: Record<string, unknown> = {}) {
  const queryClient = new QueryClient();
  // Seed authoritative catalog data; summary counts cannot identify chat models.
  const connected = overrides.connectedModelCount !== 0;
  queryClient.setQueryData(["settings-backend-models"], {
    catalog: {
      serverFetched: true, connectedProviderCount: connected ? 1 : 0,
      defaultModels: connected ? { cudos: "asi1-mini" } : {},
      providers: connected ? [{ id: "cudos", name: "ASI:Cloud", connected: true,
        modelCount: 2, modelIds: ["asi1-mini", "text-embedding-3"], sampleModels: ["asi1-mini"] }] : [],
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
      expect(html).not.toContain("More model settings");
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
});
